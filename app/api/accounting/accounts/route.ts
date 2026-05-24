import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess } from '@/lib/branch/server'
import { AccountType, NormalBalance } from '@prisma/client'
import { requireTenantFeature } from '@/lib/tenant/features'

/**
 * GET /api/accounting/accounts  — List Chart of Accounts for the tenant
 * POST /api/accounting/accounts — Create a custom account
 */

export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'view_chart_of_accounts')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const activeOnly = searchParams.get('activeOnly') !== 'false'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId: context!.tenantId }
    if (type && Object.values(AccountType).includes(type as AccountType)) {
      where.type = type as AccountType
    }
    if (activeOnly) where.isActive = true

    const accounts = await prisma.account.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      include: {
        parent: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true } },
      },
    })

    return NextResponse.json({ accounts })
  } catch (err) {
    console.error('Failed to fetch accounts:', err)
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const featureError = requireTenantFeature(context!.features, 'enableAccounting')
    if (featureError) return featureError

    const { authorized, error: permError } = requirePermission(context!, 'manage_chart_of_accounts')
    if (!authorized) return permError!

    const body = await req.json()
    const { code, name, type, normalBalance, parentId, description } = body

    if (!code || typeof code !== 'string' || !code.trim()) {
      return NextResponse.json({ error: 'Account code is required' }, { status: 400 })
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Account name is required' }, { status: 400 })
    }
    if (!type || !Object.values(AccountType).includes(type as AccountType)) {
      return NextResponse.json({ error: `Type must be one of: ${Object.values(AccountType).join(', ')}` }, { status: 400 })
    }
    if (!normalBalance || !Object.values(NormalBalance).includes(normalBalance as NormalBalance)) {
      return NextResponse.json({ error: 'normalBalance must be DEBIT or CREDIT' }, { status: 400 })
    }

    // Check code uniqueness
    const existing = await prisma.account.findUnique({
      where: { tenantId_code: { tenantId: context!.tenantId, code: code.trim() } },
    })
    if (existing) {
      return NextResponse.json({ error: `Account code ${code.trim()} already exists` }, { status: 409 })
    }

    // Validate parent if provided
    if (parentId) {
      const parent = await prisma.account.findFirst({
        where: { id: parentId, tenantId: context!.tenantId },
      })
      if (!parent) {
        return NextResponse.json({ error: 'Parent account not found' }, { status: 404 })
      }
    }

    const account = await prisma.account.create({
      data: {
        tenantId:     context!.tenantId,
        code:         code.trim(),
        name:         name.trim(),
        type:         type as AccountType,
        normalBalance: normalBalance as NormalBalance,
        parentId:     parentId || null,
        description:  description?.trim() || null,
        isSystemAccount: false,
      },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true } },
      },
    })

    return NextResponse.json(account, { status: 201 })
  } catch (err) {
    console.error('Failed to create account:', err)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }
}
