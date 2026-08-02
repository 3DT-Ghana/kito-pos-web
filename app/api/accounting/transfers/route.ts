import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { TransferPartyType } from '@prisma/client'
import { requireBranchAccess } from '@/lib/branch/server'
import { postLedgerTransfer } from '@/lib/accounting/journalEngine'
import { ACCOUNT_CODES } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/transfers
 * List ledger transfers for the current tenant.
 *
 * POST /api/accounting/transfers
 * Create a new ledger transfer between two parties (customer, supplier, or account).
 * Atomically: creates LedgerTransfer, adjusts customer/supplier balances, posts journal.
 */

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    // Was the only accounting handler with no permission check — any
    // authenticated user could enumerate the full transfer history including
    // customer and supplier names and amounts.
    const { authorized, error: permError } = requirePermission(context!, 'record_transfers')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')
    // Clamped — unguarded parseInt let ?skip=abc reach Prisma as NaN and
    // ?take=999999 dump the whole table.
    const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0)
    const take = Math.min(200, Math.max(1, parseInt(searchParams.get('take') ?? '50', 10) || 50))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId: context!.tenantId }
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate)
      if (endDate)   where.date.lte = new Date(endDate)
    }

    const [transfers, total] = await Promise.all([
      prisma.ledgerTransfer.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take,
        include: {
          debitCustomer:  { select: { id: true, name: true } },
          debitSupplier:  { select: { id: true, name: true } },
          debitAccount:   { select: { id: true, name: true, code: true } },
          creditCustomer: { select: { id: true, name: true } },
          creditSupplier: { select: { id: true, name: true } },
          creditAccount:  { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.ledgerTransfer.count({ where }),
    ])

    return NextResponse.json({ transfers, total })
  } catch (err) {
    console.error('Failed to fetch transfers:', err)
    return NextResponse.json({ error: 'Failed to fetch transfers' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'record_transfers')
    if (!authorized) return permError!

    const body = await req.json()

    // ── Validate ──────────────────────────────────────────────────────────────
    const amount = parseFloat(body.amount)
    if (!body.amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }

    if (!body.description?.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }

    const validTypes = Object.values(TransferPartyType)
    if (!body.debitPartyType || !validTypes.includes(body.debitPartyType)) {
      return NextResponse.json({ error: 'Invalid debit party type' }, { status: 400 })
    }
    if (!body.creditPartyType || !validTypes.includes(body.creditPartyType)) {
      return NextResponse.json({ error: 'Invalid credit party type' }, { status: 400 })
    }

    // Require the ID for the chosen party type
    const debitType:  TransferPartyType = body.debitPartyType
    const creditType: TransferPartyType = body.creditPartyType

    if (debitType  === 'CUSTOMER' && !body.debitCustomerId)  return NextResponse.json({ error: 'Debit customer ID required' },  { status: 400 })
    if (debitType  === 'SUPPLIER' && !body.debitSupplierId)  return NextResponse.json({ error: 'Debit supplier ID required' },  { status: 400 })
    if (debitType  === 'ACCOUNT'  && !body.debitAccountId)   return NextResponse.json({ error: 'Debit account ID required' },   { status: 400 })
    if (creditType === 'CUSTOMER' && !body.creditCustomerId) return NextResponse.json({ error: 'Credit customer ID required' }, { status: 400 })
    if (creditType === 'SUPPLIER' && !body.creditSupplierId) return NextResponse.json({ error: 'Credit supplier ID required' }, { status: 400 })
    if (creditType === 'ACCOUNT'  && !body.creditAccountId)  return NextResponse.json({ error: 'Credit account ID required' },  { status: 400 })

    // Block transfers where debit and credit resolve to the same entity (no-op)
    if (debitType === 'CUSTOMER' && creditType === 'CUSTOMER' && body.debitCustomerId === body.creditCustomerId) {
      return NextResponse.json({ error: 'Debit and credit cannot be the same customer' }, { status: 400 })
    }
    if (debitType === 'SUPPLIER' && creditType === 'SUPPLIER' && body.debitSupplierId === body.creditSupplierId) {
      return NextResponse.json({ error: 'Debit and credit cannot be the same supplier' }, { status: 400 })
    }
    if (debitType === 'ACCOUNT' && creditType === 'ACCOUNT' && body.debitAccountId === body.creditAccountId) {
      return NextResponse.json({ error: 'Debit and credit cannot be the same account' }, { status: 400 })
    }

    // Every CUSTOMER party resolves to the one AR control account and every
    // SUPPLIER to the one AP account, so a transfer between two *different*
    // customers still posts AR-to-AR: a net-zero journal entry while the
    // customer balances really move. The subledger and the general ledger then
    // disagree and the control account stops tying to the sum of balances.
    if (debitType === 'CUSTOMER' && creditType === 'CUSTOMER') {
      return NextResponse.json(
        {
          error: 'Both sides are customers, so this would post to Accounts Receivable twice and record nothing in the ledger. Transfer through a control account instead, or adjust each balance separately.',
        },
        { status: 400 }
      )
    }
    if (debitType === 'SUPPLIER' && creditType === 'SUPPLIER') {
      return NextResponse.json(
        {
          error: 'Both sides are suppliers, so this would post to Accounts Payable twice and record nothing in the ledger. Transfer through a control account instead, or adjust each balance separately.',
        },
        { status: 400 }
      )
    }

    const tenantId = context!.tenantId
    const postedById = context!.user.id

    // ── Verify parties belong to tenant ──────────────────────────────────────
    const [debitCustomer, debitSupplier, debitAccount, creditCustomer, creditSupplier, creditAccount] = await Promise.all([
      debitType  === 'CUSTOMER' ? prisma.customer.findFirst({ where: { id: body.debitCustomerId,  tenantId } }) : null,
      debitType  === 'SUPPLIER' ? prisma.supplier.findFirst({ where: { id: body.debitSupplierId,  tenantId } }) : null,
      debitType  === 'ACCOUNT'  ? prisma.account.findFirst({  where: { id: body.debitAccountId,   tenantId } }) : null,
      creditType === 'CUSTOMER' ? prisma.customer.findFirst({ where: { id: body.creditCustomerId, tenantId } }) : null,
      creditType === 'SUPPLIER' ? prisma.supplier.findFirst({ where: { id: body.creditSupplierId, tenantId } }) : null,
      creditType === 'ACCOUNT'  ? prisma.account.findFirst({  where: { id: body.creditAccountId,  tenantId } }) : null,
    ])

    if (debitType  === 'CUSTOMER' && !debitCustomer)  return NextResponse.json({ error: 'Debit customer not found' },  { status: 404 })
    if (debitType  === 'SUPPLIER' && !debitSupplier)  return NextResponse.json({ error: 'Debit supplier not found' },  { status: 404 })
    if (debitType  === 'ACCOUNT'  && !debitAccount)   return NextResponse.json({ error: 'Debit account not found' },   { status: 404 })
    if (creditType === 'CUSTOMER' && !creditCustomer) return NextResponse.json({ error: 'Credit customer not found' }, { status: 404 })
    if (creditType === 'SUPPLIER' && !creditSupplier) return NextResponse.json({ error: 'Credit supplier not found' }, { status: 404 })
    if (creditType === 'ACCOUNT'  && !creditAccount)  return NextResponse.json({ error: 'Credit account not found' },  { status: 404 })

    // A CUSTOMER party posts to AR and a SUPPLIER party posts to AP, so pairing
    // one with the *same* control account selected directly also produces a
    // net-zero journal — while the customer or supplier balance still moves,
    // breaking the tie between the control account and the subledger. The
    // party-type guards above cannot catch this because the types differ.
    const CONTROL_CODE_FOR_PARTY: Record<string, string> = {
      CUSTOMER: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
      SUPPLIER: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
    }
    const debitControlCode  = debitType === 'ACCOUNT'  ? debitAccount?.code  : CONTROL_CODE_FOR_PARTY[debitType]
    const creditControlCode = creditType === 'ACCOUNT' ? creditAccount?.code : CONTROL_CODE_FOR_PARTY[creditType]
    if (debitControlCode && debitControlCode === creditControlCode) {
      return NextResponse.json(
        {
          error: `Both sides post to account ${debitControlCode}, so the ledger entry would cancel itself out while the balance still moves. Choose a different account on one side.`,
        },
        { status: 400 }
      )
    }

    // ── Atomic transaction ────────────────────────────────────────────────────
    const transfer = await prisma.$transaction(async (tx) => {
      // 1. Create the transfer record
      const newTransfer = await tx.ledgerTransfer.create({
        data: {
          tenantId,
          amount,
          description: body.description.trim(),
          date: body.date ? new Date(body.date) : new Date(),
          postedById,
          debitPartyType:  debitType,
          debitCustomerId:  debitType  === 'CUSTOMER' ? body.debitCustomerId  : null,
          debitSupplierId:  debitType  === 'SUPPLIER' ? body.debitSupplierId  : null,
          debitAccountId:   debitType  === 'ACCOUNT'  ? body.debitAccountId   : null,
          creditPartyType: creditType,
          creditCustomerId: creditType === 'CUSTOMER' ? body.creditCustomerId : null,
          creditSupplierId: creditType === 'SUPPLIER' ? body.creditSupplierId : null,
          creditAccountId:  creditType === 'ACCOUNT'  ? body.creditAccountId  : null,
        },
      })

      // 2. Adjust customer/supplier balances
      //    Debit a customer  → they owe more (balance increases)
      //    Credit a customer → their debt decreases (balance decreases)
      //    Debit a supplier  → we owe less (their payable decreases)
      //    Credit a supplier → we owe more (their payable increases)
      if (debitType === 'CUSTOMER') {
        await tx.customer.update({
          where: { id: body.debitCustomerId },
          data: { balance: { increment: amount } },
        })
      }
      if (creditType === 'CUSTOMER') {
        await tx.customer.update({
          where: { id: body.creditCustomerId },
          data: { balance: { decrement: amount } },
        })
      }
      if (debitType === 'SUPPLIER') {
        await tx.supplier.update({
          where: { id: body.debitSupplierId },
          data: { balance: { decrement: amount } },
        })
      }
      if (creditType === 'SUPPLIER') {
        await tx.supplier.update({
          where: { id: body.creditSupplierId },
          data: { balance: { increment: amount } },
        })
      }

      // 3. Post double-entry journal entry and link it back to the transfer
      const journalEntryId = await postLedgerTransfer(tx, {
        tenantId,
        postedById,
        ledgerTransferId: newTransfer.id,
        amount,
        debitPartyType:  debitType,
        debitAccountId:  debitType  === 'ACCOUNT' ? body.debitAccountId  : undefined,
        creditPartyType: creditType,
        creditAccountId: creditType === 'ACCOUNT' ? body.creditAccountId : undefined,
        description: body.description.trim(),
      })

      await tx.ledgerTransfer.update({
        where: { id: newTransfer.id },
        data:  { journalEntryId },
      })

      return newTransfer
    })

    return NextResponse.json({ transfer }, { status: 201 })
  } catch (err) {
    console.error('Failed to create transfer:', err)
    return NextResponse.json({ error: 'Failed to create transfer' }, { status: 500 })
  }
}
