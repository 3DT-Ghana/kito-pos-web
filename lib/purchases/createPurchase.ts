import { PaymentMethod, PaymentType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import {
  postPurchaseJournal,
  type PurchaseLineBreakdown,
} from '@/lib/accounting/journalEngine'
import { ACCOUNT_CODES, round2 } from '@/lib/accounting/accounts'
import { type BranchAccessContext } from '@/lib/branch/server'
import { createAuditLog } from '@/lib/audit/auditLog'

export class PurchaseOperationError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'PurchaseOperationError'
  }
}

interface PurchaseRequestItem {
  itemId: string
  quantity: number
  costPrice?: number
}

export interface CreatePurchaseInput {
  supplierId: string
  items: PurchaseRequestItem[]
  paidAmount?: number | string
  paymentMethod?: string
  sourcePurchaseOrderId?: string
}

interface CreatePurchaseOptions {
  context: BranchAccessContext
  branchId: string | null
  body: CreatePurchaseInput
}

export function validatePurchaseRequest(
  data: CreatePurchaseInput
): string | null {
  if (!data.supplierId || typeof data.supplierId !== 'string') {
    return 'Supplier ID is required'
  }

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
      item.costPrice !== undefined &&
      (isNaN(parseFloat(String(item.costPrice))) ||
        parseFloat(String(item.costPrice)) < 0)
    ) {
      return 'Item cost price must be a non-negative number'
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

export async function createPurchaseFromInput(
  options: CreatePurchaseOptions
) {
  const { context, branchId, body } = options

  const validationError = validatePurchaseRequest(body)
  if (validationError) {
    throw new PurchaseOperationError(validationError, 400)
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: body.supplierId, tenantId: context.tenantId },
  })

  if (!supplier) {
    throw new PurchaseOperationError(
      'Supplier not found or does not belong to your tenant',
      404
    )
  }

  const itemIds = body.items.map((item) => item.itemId)
  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      tenantId: context.tenantId,
      ...(context.branchesEnabled && branchId ? { branchId } : {}),
    },
  })

  if (items.length !== itemIds.length) {
    throw new PurchaseOperationError(
      'One or more items not found or do not belong to your tenant',
      404
    )
  }

  let totalAmount = 0
  const purchaseItemsData = body.items.map((purchaseItem) => {
    const item = items.find((candidate) => candidate.id === purchaseItem.itemId)!
    const costPrice = purchaseItem.costPrice || item.costPrice
    const subtotal = costPrice * purchaseItem.quantity
    totalAmount += subtotal

    return {
      itemId: purchaseItem.itemId,
      quantity: purchaseItem.quantity,
      costPrice,
    }
  })

  const paidAmount = Number(body.paidAmount ?? 0)
  const creditAmount = totalAmount - paidAmount

  if (paidAmount > totalAmount) {
    throw new PurchaseOperationError(
      'Paid amount cannot exceed total amount',
      400
    )
  }

  const accountingEnabled = context.features.enableAccounting
  let defaultInventoryId: string | null = null
  let defaultExpenseId: string | null = null
  if (accountingEnabled) {
    const accountRows = await prisma.account.findMany({
      where: {
        tenantId: context.tenantId,
        code: { in: [ACCOUNT_CODES.INVENTORY, ACCOUNT_CODES.OTHER_EXPENSES] },
      },
      select: { id: true, code: true },
    })
    const byCode = Object.fromEntries(
      accountRows.map((account) => [account.code, account.id])
    )
    defaultInventoryId = byCode[ACCOUNT_CODES.INVENTORY] ?? null
    defaultExpenseId = byCode[ACCOUNT_CODES.OTHER_EXPENSES] ?? null
  }

  const purchaseJournalLines: PurchaseLineBreakdown[] = body.items.map(
    (purchaseItem) => {
      const item = items.find((candidate) => candidate.id === purchaseItem.itemId)!
      const costPrice = purchaseItem.costPrice || item.costPrice
      const amount = round2(costPrice * purchaseItem.quantity)
      if (item.itemType === 'INVENTORY') {
        return { debitAccountId: defaultInventoryId ?? '', amount }
      }

      return {
        debitAccountId: item.expenseAccountId ?? defaultExpenseId ?? '',
        amount,
      }
    }
  )

  const validMethods: string[] = Object.values(PaymentMethod)
  const paymentMethod: PaymentMethod = validMethods.includes(
    body.paymentMethod ?? ''
  )
    ? (body.paymentMethod as PaymentMethod)
    : PaymentMethod.CASH

  const purchase = await prisma.$transaction(async (tx) => {
    const createdPurchase = await tx.purchase.create({
      data: {
        tenantId: context.tenantId,
        ...(context.branchesEnabled && branchId ? { branchId } : {}),
        supplierId: body.supplierId,
        totalAmount,
        paidAmount,
        paymentType: creditAmount > 0 ? PaymentType.CREDIT : PaymentType.CASH,
      },
    })

    await tx.purchaseItem.createMany({
      data: purchaseItemsData.map((item) => ({
        purchaseId: createdPurchase.id,
        ...item,
      })),
    })

    for (const purchaseItem of body.items) {
      const item = items.find((candidate) => candidate.id === purchaseItem.itemId)
      if (item?.itemType !== 'INVENTORY') continue
      await tx.item.update({
        where: { id: purchaseItem.itemId },
        data: {
          quantity: { increment: purchaseItem.quantity },
          costPrice: purchaseItem.costPrice || item.costPrice,
        },
      })
    }

    if (creditAmount > 0) {
      await tx.supplier.update({
        where: { id: body.supplierId },
        data: {
          balance: { increment: creditAmount },
        },
      })
    }

    if (body.sourcePurchaseOrderId) {
      await tx.purchaseOrder.update({
        where: { id: body.sourcePurchaseOrderId },
        data: {
          status: 'RECEIVED',
          ...(context.branchesEnabled && context.currentBranchId
            ? { branchId: context.currentBranchId }
            : {}),
        },
      })
    }

    if (accountingEnabled) {
      await postPurchaseJournal(tx, {
        tenantId: context.tenantId,
        purchaseId: createdPurchase.id,
        postedById: context.user.id,
        totalAmount,
        paidAmount,
        paymentMethod,
        isCredit: creditAmount > 0,
        lines: purchaseJournalLines,
      })
    }

    return createdPurchase
  })

  const completePurchase = await prisma.purchase.findUnique({
    where: { id: purchase.id },
    include: {
      supplier: true,
      items: {
        include: {
          item: true,
        },
      },
    },
  })

  if (!completePurchase) {
    throw new PurchaseOperationError('Purchase not found after creation', 500)
  }

  void createAuditLog({
    tenantId: context.tenantId,
    userId: context.user.id,
    action: 'CREATE',
    entity: 'Purchase',
    entityId: completePurchase.id,
    details: {
      sourcePurchaseOrderId: body.sourcePurchaseOrderId ?? null,
      totalAmount,
      paidAmount,
    },
  })

  return completePurchase
}
