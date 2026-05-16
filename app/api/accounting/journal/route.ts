import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { JournalSource, JournalEntryStatus } from '@prisma/client'
import { postManualJournal } from '@/lib/accounting/journalEngine'
import { assertBalanced } from '@/lib/accounting/accounts'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/journal  — List journal entries
 * POST /api/accounting/journal — Post a manual journal entry
 */

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'view_journal')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const source    = searchParams.get('source')
    const status    = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')
    const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50')))
    const skip      = (page - 1) * limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId: context!.tenantId }

    if (source && Object.values(JournalSource).includes(source as JournalSource)) {
      where.source = source as JournalSource
    }
    if (status && Object.values(JournalEntryStatus).includes(status as JournalEntryStatus)) {
      where.status = status as JournalEntryStatus
    }
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.date.lte = end
      }
    }

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          lines: {
            include: { account: { select: { code: true, name: true } } },
          },
        },
      }),
      prisma.journalEntry.count({ where }),
    ])

    return NextResponse.json({
      entries,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('Failed to fetch journal entries:', err)
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'post_manual_journal')
    if (!authorized) return permError!

    const body = await req.json()
    const { description, date, lines } = body

    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }
    const parsedDate = new Date(date)
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }
    if (!Array.isArray(lines) || lines.length < 2) {
      return NextResponse.json({ error: 'At least two journal lines are required' }, { status: 400 })
    }

    for (const line of lines) {
      if (!line.accountId || typeof line.accountId !== 'string') {
        return NextResponse.json({ error: 'Each line must have a valid accountId' }, { status: 400 })
      }
      const debit  = parseFloat(line.debit ?? 0)
      const credit = parseFloat(line.credit ?? 0)
      if (isNaN(debit) || isNaN(credit) || (debit === 0 && credit === 0)) {
        return NextResponse.json({ error: 'Each line must have a non-zero debit or credit' }, { status: 400 })
      }
    }

    // Validate all accounts belong to this tenant
    const accountIds = [...new Set(lines.map((l: { accountId: string }) => l.accountId))]
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds }, tenantId: context!.tenantId, isActive: true },
      select: { id: true },
    })
    if (accounts.length !== accountIds.length) {
      return NextResponse.json({ error: 'One or more accounts not found or inactive' }, { status: 404 })
    }

    const journalLines = lines.map((l: { accountId: string; debit?: string; credit?: string; description?: string }) => ({
      accountId:   l.accountId,
      debit:       parseFloat(l.debit ?? '0') || 0,
      credit:      parseFloat(l.credit ?? '0') || 0,
      description: l.description?.trim() || undefined,
    }))

    try {
      assertBalanced(journalLines)
    } catch {
      return NextResponse.json({ error: 'Journal entry is not balanced: total debits must equal total credits' }, { status: 400 })
    }

    const entryId = await prisma.$transaction(async (tx) =>
      postManualJournal(tx, {
        tenantId:    context!.tenantId,
        postedById:  context!.user.id,
        description: description.trim(),
        date:        parsedDate,
        lines:       journalLines,
      })
    )

    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
        },
      },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    console.error('Failed to post manual journal entry:', err)
    return NextResponse.json({ error: 'Failed to post manual journal entry' }, { status: 500 })
  }
}
