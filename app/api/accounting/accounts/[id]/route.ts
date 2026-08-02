import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
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

    const { authorized, error: permError } = requirePermission(context!, 'view_chart_of_accounts')
    if (!authorized) return permError!

    const { id } = await params

    const account = await prisma.account.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true, type: true, isActive: true } },
        _count: { select: { lines: true } },
      },
    })

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    return NextResponse.json(account)
  } catch (err) {
    console.error('Failed to fetch account:', err)
    return NextResponse.json({ error: 'Failed to fetch account' }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'manage_chart_of_accounts')
    if (!authorized) return permError!

    const { id } = await params
    const body = await req.json()

    const account = await prisma.account.findFirst({
      where: { id, tenantId: context!.tenantId },
    })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }
    if (account.isSystemAccount) {
      return NextResponse.json({ error: 'System accounts cannot be modified' }, { status: 403 })
    }

    const updated = await prisma.account.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name.trim() }),
        ...(body.description !== undefined && { description: body.description?.trim() || null }),
        ...(body.isActive !== undefined && { isActive: Boolean(body.isActive) }),
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update account:', err)
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'manage_chart_of_accounts')
    if (!authorized) return permError!

    const { id } = await params

    const account = await prisma.account.findFirst({
      where: { id, tenantId: context!.tenantId },
      include: { _count: { select: { children: true } } },
    })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }
    if (account.isSystemAccount) {
      return NextResponse.json({ error: 'System accounts cannot be deleted' }, { status: 403 })
    }
    if (account._count.children > 0) {
      return NextResponse.json({ error: 'Cannot delete account with child accounts' }, { status: 409 })
    }

    // Counts ALL lines, not just POSTED ones. A reversed entry is a recorded
    // correction that must stay inspectable, and JournalLine.account is a
    // required non-cascading relation — so deleting past reversed lines either
    // destroyed audit history or threw a raw FK error surfaced as a useless 500.
    const lineCount = await prisma.journalLine.count({
      where: {
        accountId: id,
        journalEntry: { tenantId: context!.tenantId },
      },
    })
    if (lineCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete this account — it has ${lineCount} journal line(s) in the ledger, including any reversed entries that must remain auditable. Deactivate it instead.`,
        },
        { status: 409 }
      )
    }

    await prisma.account.deleteMany({ where: { id, tenantId: context!.tenantId } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete account:', err)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
