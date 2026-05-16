import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { reverseJournalEntry } from '@/lib/accounting/journalEngine'
import { requireTenantFeature } from '@/lib/tenant/features'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'view_journal')
    if (!authorized) return permError!

    const { id } = await params

    const entry = await prisma.journalEntry.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: {
        lines: {
          include: { account: { select: { id: true, code: true, name: true, type: true } } },
          orderBy: { debit: 'desc' },
        },
      },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 })
    }

    return NextResponse.json(entry)
  } catch (err) {
    console.error('Failed to fetch journal entry:', err)
    return NextResponse.json({ error: 'Failed to fetch journal entry' }, { status: 500 })
  }
}

// POST /:id/reverse — create a reversal entry
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'post_manual_journal')
    if (!authorized) return permError!

    const { id } = await params

    const original = await prisma.journalEntry.findFirst({
      where: { id, tenantId: context!.tenantId },
    })
    if (!original) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 })
    }
    if (original.status !== 'POSTED') {
      return NextResponse.json({ error: 'Only POSTED entries can be reversed' }, { status: 400 })
    }

    const reversalId = await prisma.$transaction(async (tx) =>
      reverseJournalEntry(tx, id, context!.user.id)
    )

    const reversal = await prisma.journalEntry.findUnique({
      where: { id: reversalId },
      include: {
        lines: {
          include: { account: { select: { code: true, name: true } } },
        },
      },
    })

    return NextResponse.json(reversal, { status: 201 })
  } catch (err) {
    console.error('Failed to reverse journal entry:', err)
    return NextResponse.json({ error: 'Failed to reverse journal entry' }, { status: 500 })
  }
}
