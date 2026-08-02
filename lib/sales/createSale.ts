import {
  ApprovalStatus,
  PaymentMethod,
  PaymentType,
  TaxCalculationType,
  type ApprovalFlag,
} from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db/prisma'
import {
  buildSaleConfirmationSms,
  sendSms,
} from '@/lib/sms/hubtel'
import { sendWhatsApp, buildWhatsAppSaleConfirmation } from '@/lib/whatsapp/meta'
import { type BranchAccessContext } from '@/lib/branch/server'
import { hasPermission } from '@/lib/permissions/rbac'
import {
  postSaleJournal,
  type SaleLineBreakdown,
} from '@/lib/accounting/journalEngine'
import { ACCOUNT_CODES, round2 } from '@/lib/accounting/accounts'
import { detectSaleFlags } from '@/lib/approvals/detect'
import { verifyApprovalGrant } from '@/lib/approvals/inlineGrant'
import { createAuditLog } from '@/lib/audit/auditLog'
import {
  calculateLineTaxes,
  resolveItemTaxProfile,
} from '@/lib/tax/engine'
import {
  getTenantTaxConfiguration,
  itemTaxSettingInclude,
} from '@/lib/tax/server'

export class SaleOperationError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'SaleOperationError'
  }
}

interface SaleRequestItem {
  itemId: string
  quantity: number
  price?: number
  discountAmount?: number
  isTaxable?: boolean
  taxRateIds?: string[]
  taxCalculationType?: TaxCalculationType
}

export interface CreateSaleInput {
  customerId?: string | null
  paidAmount?: number | string
  paymentMethod?: string
  momoPhone?: string
  bankName?: string
  bankAccountName?: string
  bankReference?: string
  note?: string
  approvalGrant?: string
  items: SaleRequestItem[]
  sourceQuotationId?: string
  /** 'sales' = regular sale form (discount approval enforced); 'pos' = POS terminal (no discount approval) */
  source?: 'sales' | 'pos'
}

interface CreateSaleOptions {
  context: BranchAccessContext
  branchId: string | null
  body: CreateSaleInput
}

export interface PendingSaleResult {
  status: 'pending'
  saleId: string
  flags: ApprovalFlag[]
}

export interface CreatedSaleResult {
  status: 'created'
  sale: NonNullable<Awaited<ReturnType<typeof prisma.sale.findUnique>>>
}

export type CreateSaleResult = PendingSaleResult | CreatedSaleResult

export function validateSaleRequest(data: CreateSaleInput): string | null {
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    return 'At least one item is required'
  }

  for (const item of data.items) {
    if (!item.itemId || typeof item.itemId !== 'string') {
      return 'Each item must have a valid itemId'
    }

    if (!item.quantity || isNaN(item.quantity) || item.quantity <= 0) {
      return 'Each item must have a positive quantity'
    }

    if (
      item.price !== undefined &&
      (isNaN(parseFloat(String(item.price))) || parseFloat(String(item.price)) < 0)
    ) {
      return 'Item price must be a non-negative number'
    }

    if (
      item.taxCalculationType !== undefined &&
      !Object.values(TaxCalculationType).includes(item.taxCalculationType)
    ) {
      return 'Invalid tax calculation type'
    }

    if (
      item.taxRateIds !== undefined &&
      (!Array.isArray(item.taxRateIds) ||
        item.taxRateIds.some((taxRateId) => typeof taxRateId !== 'string'))
    ) {
      return 'Tax rate selections must be a list of valid IDs'
    }
  }

  if (
    data.paidAmount !== undefined &&
    (isNaN(parseFloat(String(data.paidAmount))) ||
      parseFloat(String(data.paidAmount)) < 0)
  ) {
    return 'Paid amount must be a non-negative number'
  }

  return null
}

export async function createSaleFromInput(
  options: CreateSaleOptions
): Promise<CreateSaleResult> {
  const { context, branchId, body } = options

  const validationError = validateSaleRequest(body)
  if (validationError) {
    throw new SaleOperationError(validationError, 400)
  }

  if (body.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: body.customerId, tenantId: context.tenantId },
    })

    if (!customer) {
      throw new SaleOperationError(
        'Customer not found or does not belong to your tenant',
        404
      )
    }
  }

  const itemIds = body.items.map((item) => item.itemId)
  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      tenantId: context.tenantId,
      ...(context.branchesEnabled && branchId ? { branchId } : {}),
    },
    include: itemTaxSettingInclude,
  })

  if (items.length !== itemIds.length) {
    throw new SaleOperationError(
      'One or more items not found or do not belong to your tenant',
      404
    )
  }

  for (const saleItem of body.items) {
    const item = items.find((candidate) => candidate.id === saleItem.itemId)
    if (!item || item.itemType !== 'INVENTORY') continue

    if (item.quantity < saleItem.quantity) {
      throw new SaleOperationError(
        `Insufficient stock for item "${item.name}". Available: ${item.quantity}, Requested: ${saleItem.quantity}`,
        400
      )
    }
  }

  const { taxSetting, activeRates, defaultRates } = await getTenantTaxConfiguration(
    prisma,
    context.tenantId
  )

  let subtotalAmount = 0
  let totalTaxAmount = 0
  let totalAmount = 0
  const computedSaleItems = body.items.map((saleItem) => {
    const item = items.find((candidate) => candidate.id === saleItem.itemId)!
    const price = saleItem.price ?? item.sellingPrice
    const lineDiscount = Math.max(
      0,
      parseFloat(String(saleItem.discountAmount ?? 0)) || 0
    )
    const taxProfile = resolveItemTaxProfile({
      tenantTaxSetting: taxSetting,
      activeRates,
      defaultRates,
      item,
      override: {
        isTaxable: saleItem.isTaxable,
        taxRateIds: saleItem.taxRateIds,
        taxCalculationType: saleItem.taxCalculationType,
      },
    })
    const taxComputation = calculateLineTaxes({
      unitPrice: price,
      quantity: saleItem.quantity,
      discountAmount: lineDiscount,
      profile: taxProfile,
    })

    subtotalAmount += taxComputation.taxableAmount
    totalTaxAmount += taxComputation.taxAmount
    totalAmount += taxComputation.totalAmount

    const saleItemId = randomUUID()

    return {
      id: saleItemId,
      item,
      saleItem,
      data: {
        id: saleItemId,
        itemId: saleItem.itemId,
        quantity: saleItem.quantity,
        price,
        discountAmount: lineDiscount,
        isTaxable: taxComputation.isTaxable,
        taxCalculationType: taxComputation.calculationType,
        lineSubtotalAmount: taxComputation.taxableAmount,
        lineTaxAmount: taxComputation.taxAmount,
        lineTotalAmount: taxComputation.totalAmount,
      },
      taxComputation,
      taxProfile,
    }
  })

  subtotalAmount = round2(subtotalAmount)
  totalTaxAmount = round2(totalTaxAmount)
  totalAmount = round2(totalAmount)

  const paidAmount = round2(Number(body.paidAmount ?? 0))
  const creditAmount = round2(totalAmount - paidAmount)

  const validMethods: string[] = Object.values(PaymentMethod)
  const paymentMethod: PaymentMethod = validMethods.includes(
    body.paymentMethod ?? ''
  )
    ? (body.paymentMethod as PaymentMethod)
    : PaymentMethod.CASH

  if (paidAmount > totalAmount) {
    throw new SaleOperationError('Paid amount cannot exceed total amount', 400)
  }

  if (creditAmount > 0 && !body.customerId) {
    throw new SaleOperationError('Customer is required for credit sales', 400)
  }

  const accountingEnabled = context.features.enableAccounting
  const canSelfApprove = hasPermission(context, 'approve_transactions')
  const canApplyDiscount = hasPermission(context, 'apply_discount')
  const approvalRequired = context.features.requireApproval && !canSelfApprove

  // On the sales form, a discount by a user without apply_discount always needs approval.
  // On the POS terminal (source === 'pos' or unset), discount approval is not enforced.
  const discountApprovalRequired = body.source === 'sales' && !canSelfApprove && !canApplyDiscount

  let approvalFlags: ApprovalFlag[] = []
  if (approvalRequired || discountApprovalRequired) {
    const allFlags = detectSaleFlags({
      items: body.items.map((saleItem) => {
        const item = items.find((candidate) => candidate.id === saleItem.itemId)!
        return {
          price: saleItem.price ?? item.sellingPrice,
          cataloguePrice: item.sellingPrice,
          discountAmount: Math.max(
            0,
            parseFloat(String(saleItem.discountAmount ?? 0)) || 0
          ),
          quantity: saleItem.quantity,
        }
      }),
      orderDiscountAmount: 0,
      creditAmount,
    })
    if (approvalRequired) {
      approvalFlags = allFlags
    } else {
      // Only flag DISCOUNT — not PRICE_OVERRIDE or CREDIT_SALE — when it's purely a discount-permission issue
      approvalFlags = allFlags.filter(f => f === 'DISCOUNT')
    }
  }

  let defaultSalesRevenueId: string | null = null
  let defaultServiceRevenueId: string | null = null
  let defaultCogsId: string | null = null
  let defaultInventoryId: string | null = null
  if (accountingEnabled) {
    const accountRows = await prisma.account.findMany({
      where: {
        tenantId: context.tenantId,
        code: {
          in: [
            ACCOUNT_CODES.SALES_REVENUE,
            ACCOUNT_CODES.SERVICE_REVENUE,
            ACCOUNT_CODES.COGS,
            ACCOUNT_CODES.INVENTORY,
          ],
        },
      },
      select: { id: true, code: true },
    })

    const byCode = Object.fromEntries(
      accountRows.map((account) => [account.code, account.id])
    )
    defaultSalesRevenueId = byCode[ACCOUNT_CODES.SALES_REVENUE] ?? null
    defaultServiceRevenueId = byCode[ACCOUNT_CODES.SERVICE_REVENUE] ?? null
    defaultCogsId = byCode[ACCOUNT_CODES.COGS] ?? null
    defaultInventoryId = byCode[ACCOUNT_CODES.INVENTORY] ?? null
  }

  const saleJournalLines: SaleLineBreakdown[] = computedSaleItems.map((line) => {
    const item = line.item
    const revenue = round2(line.taxComputation.taxableAmount)

    if (item.itemType === 'INVENTORY') {
      const cogs = round2((item.costPrice ?? 0) * line.saleItem.quantity)
      const revenueAccountId = item.incomeAccountId ?? defaultSalesRevenueId ?? ''
      const cogsAccountId = item.cogsAccountId ?? defaultCogsId ?? null
      const inventoryAccountId = defaultInventoryId ?? null
      return {
        revenueAccountId,
        revenue,
        taxLines: line.taxComputation.taxLines.map((taxLine) => {
          const sourceRate = line.taxProfile.rates.find(
            (rate) => rate.id === taxLine.taxRateId
          )
          return {
            taxPayableAccountId: sourceRate?.taxPayableAccountId ?? null,
            taxAmount: taxLine.taxAmount,
            taxName: taxLine.taxName,
          }
        }),
        cogsAccountId,
        cogs,
        inventoryAccountId,
      }
    }

    const revenueAccountId =
      item.incomeAccountId ??
      defaultServiceRevenueId ??
      defaultSalesRevenueId ??
      ''
    return {
      revenueAccountId,
      revenue,
      taxLines: line.taxComputation.taxLines.map((taxLine) => {
        const sourceRate = line.taxProfile.rates.find(
          (rate) => rate.id === taxLine.taxRateId
        )
        return {
          taxPayableAccountId: sourceRate?.taxPayableAccountId ?? null,
          taxAmount: taxLine.taxAmount,
          taxName: taxLine.taxName,
        }
      }),
      cogsAccountId: null,
      cogs: 0,
      inventoryAccountId: null,
    }
  })

  const approvalGrant =
    typeof body.approvalGrant === 'string'
      ? verifyApprovalGrant(body.approvalGrant, {
          tenantId: context.tenantId,
          branchId,
          scope: 'SALE',
        })
      : null

  if (
    typeof body.approvalGrant === 'string' &&
    !approvalGrant &&
    (approvalRequired || discountApprovalRequired) &&
    approvalFlags.length > 0
  ) {
    throw new SaleOperationError(
      'Manager approval has expired or is invalid. Please verify again.',
      403
    )
  }

  const anyApprovalRequired = approvalRequired || (discountApprovalRequired && approvalFlags.length > 0)
  const inlineApproval =
    anyApprovalRequired && approvalFlags.length > 0 ? approvalGrant : null
  const needsApproval =
    anyApprovalRequired && approvalFlags.length > 0 && !inlineApproval

  const sale = await prisma.$transaction(async (tx) => {
    const createdSale = await tx.sale.create({
      data: {
        tenantId: context.tenantId,
        ...(context.branchesEnabled && branchId ? { branchId } : {}),
        customerId: body.customerId || null,
        subtotalAmount,
        taxAmount: totalTaxAmount,
        totalAmount,
        paidAmount,
        paymentType: creditAmount > 0 ? PaymentType.CREDIT : PaymentType.CASH,
        paymentMethod,
        momoPhone: paymentMethod === PaymentMethod.MOMO && body.momoPhone ? String(body.momoPhone).trim() : null,
        bankName: paymentMethod === PaymentMethod.BANK && body.bankName ? String(body.bankName).trim() : null,
        bankAccountName: paymentMethod === PaymentMethod.BANK && body.bankAccountName ? String(body.bankAccountName).trim() : null,
        bankReference: paymentMethod === PaymentMethod.BANK && body.bankReference ? String(body.bankReference).trim() : null,
        note: body.note ? String(body.note).trim() || null : null,
        createdById: context.user.id,
        ...(needsApproval || inlineApproval
          ? {
              approvalStatus: needsApproval
                ? ApprovalStatus.PENDING
                : ApprovalStatus.APPROVED,
              approvalFlags,
            }
          : {}),
      },
    })

    await tx.saleItem.createMany({
      data: computedSaleItems.map((item) => ({
        saleId: createdSale.id,
        ...item.data,
      })),
    })

    const transactionTaxLines = computedSaleItems.flatMap((line) =>
      line.taxComputation.taxLines.map((taxLine) => ({
        tenantId: context.tenantId,
        transactionType: 'SALE' as const,
        transactionId: createdSale.id,
        transactionLineId: line.id,
        saleId: createdSale.id,
        saleItemId: line.id,
        taxRateId: taxLine.taxRateId,
        taxName: taxLine.taxName,
        taxRatePercentage: taxLine.taxRatePercentage,
        taxableAmount: taxLine.taxableAmount,
        taxAmount: taxLine.taxAmount,
        calculationType: taxLine.calculationType,
      }))
    )

    if (transactionTaxLines.length > 0) {
      await tx.transactionTaxLine.createMany({
        data: transactionTaxLines,
      })
    }

    if (body.sourceQuotationId) {
      await tx.quotation.update({
        where: { id: body.sourceQuotationId },
        data: {
          status: 'ACCEPTED',
          ...(context.branchesEnabled && branchId ? { branchId } : {}),
        },
      })
    }

    if (needsApproval) {
      await tx.transactionApproval.create({
        data: {
          tenantId: context.tenantId,
          flag: approvalFlags[0],
          status: ApprovalStatus.PENDING,
          saleId: createdSale.id,
          createdById: context.user.id,
        },
      })
      return createdSale
    }

    if (inlineApproval) {
      await tx.transactionApproval.create({
        data: {
          tenantId: context.tenantId,
          flag: approvalFlags[0],
          status: ApprovalStatus.APPROVED,
          saleId: createdSale.id,
          createdById: context.user.id,
          approvedById: inlineApproval.approverId,
          approvedAt: new Date(),
          note: `Inline approval by ${inlineApproval.approverName}`,
        },
      })
    }

    for (const saleItem of body.items) {
      const item = items.find((candidate) => candidate.id === saleItem.itemId)
      if (item?.itemType !== 'INVENTORY') continue
      // Guarded decrement — the precheck above is not atomic, so two concurrent
      // sales of the last unit would otherwise both succeed and drive stock negative.
      const stockUpdate = await tx.item.updateMany({
        where: {
          id: saleItem.itemId,
          tenantId: context.tenantId,
          quantity: { gte: saleItem.quantity },
        },
        data: { quantity: { decrement: saleItem.quantity } },
      })
      if (stockUpdate.count !== 1) {
        throw new SaleOperationError(
          `Insufficient stock for "${item.name}" — another sale took it first. Please re-check the cart.`,
          409
        )
      }
    }

    if (creditAmount > 0 && body.customerId) {
      await tx.customer.update({
        where: { id: body.customerId },
        data: { balance: { increment: creditAmount } },
      })
    }

    if (accountingEnabled) {
      await postSaleJournal(tx, {
        tenantId: context.tenantId,
        saleId: createdSale.id,
        postedById: context.user.id,
        totalAmount,
        paidAmount,
        paymentMethod,
        isCredit: creditAmount > 0,
        lines: saleJournalLines,
      })
    }

    return createdSale
  })

  if (needsApproval) {
    void createAuditLog({
      tenantId: context.tenantId,
      userId: context.user.id,
      action: 'CREATE',
      entity: 'Sale',
      entityId: sale.id,
      details: {
        status: 'PENDING',
        sourceQuotationId: body.sourceQuotationId ?? null,
        subtotalAmount,
        taxAmount: totalTaxAmount,
        totalAmount,
        paidAmount,
      },
    })

    return {
      status: 'pending',
      saleId: sale.id,
      flags: approvalFlags,
    }
  }

  const completeSale = await prisma.sale.findUnique({
    where: { id: sale.id },
    include: {
      customer: true,
      taxLines: true,
      items: {
        include: {
          item: true,
          taxLines: true,
        },
      },
    },
  })

  if (!completeSale) {
    throw new SaleOperationError('Sale not found after creation', 500)
  }

  if (completeSale.customer?.phone) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: context.tenantId },
      select: {
        name: true,
        enableSmsNotifications: true,
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelSenderId: true,
        enableWhatsApp: true,
        metaWabaToken: true,
        metaWabaPhoneNumberId: true,
      },
    })

    const customer = body.customerId
      ? await prisma.customer.findUnique({
          where: { id: body.customerId },
          select: { balance: true },
        })
      : null
    const currentBalance = customer?.balance ?? 0
    const itemCount = completeSale.items?.length ?? 0

    if (
      tenant?.enableSmsNotifications &&
      tenant.hubtelClientId &&
      tenant.hubtelClientSecret &&
      tenant.hubtelSenderId
    ) {
      const message = buildSaleConfirmationSms({
        businessName: tenant.name,
        customerName: completeSale.customer.name,
        totalAmount,
        paidAmount,
        balance: currentBalance,
      })
      sendSms(
        {
          clientId: tenant.hubtelClientId,
          clientSecret: tenant.hubtelClientSecret,
          senderId: tenant.hubtelSenderId,
        },
        completeSale.customer.phone,
        message
      ).catch(() => {})
    }

    if (tenant?.enableWhatsApp && tenant.metaWabaToken && tenant.metaWabaPhoneNumberId) {
      const message = buildWhatsAppSaleConfirmation({
        businessName: tenant.name,
        customerName: completeSale.customer.name,
        totalAmount,
        paidAmount,
        balance: currentBalance,
        itemCount,
      })
      sendWhatsApp(
        { token: tenant.metaWabaToken, phoneNumberId: tenant.metaWabaPhoneNumberId },
        completeSale.customer.phone,
        message,
      ).catch(() => {})
    }
  }

  void createAuditLog({
    tenantId: context.tenantId,
    userId: context.user.id,
    action: 'CREATE',
    entity: 'Sale',
    entityId: completeSale.id,
    details: {
      status: 'COMPLETED',
      sourceQuotationId: body.sourceQuotationId ?? null,
      subtotalAmount,
      taxAmount: totalTaxAmount,
      totalAmount,
      paidAmount,
    },
  })

  return {
    status: 'created',
    sale: completeSale,
  }
}
