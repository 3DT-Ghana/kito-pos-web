import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requireOwner } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { getOrCreateDefaultTaxPayableAccountId } from '@/lib/tax/accounts'

export async function GET(req: Request) {
  try {
    const { error, tenantId } = await requireTenant()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const activeOnly = searchParams.get('activeOnly') === 'true'

    const taxRates = await prisma.taxRate.findMany({
      where: {
        tenantId: tenantId!,
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: {
        taxPayableAccount: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json({ taxRates })
  } catch (err) {
    console.error('Failed to fetch tax rates:', err)
    return NextResponse.json(
      { error: 'Failed to fetch tax rates' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const { error, tenantId, user } = await requireTenant()
    if (error) return error

    const { authorized, error: roleError } = requireOwner(user!.role)
    if (!authorized) return roleError!

    const body = await req.json()
    const validationError = validateTaxRateBody(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId! },
      select: { enableAccounting: true },
    })

    const taxRate = await prisma.$transaction(async (tx) => {
      let taxPayableAccountId: string | null = body.taxPayableAccountId || null

      if (taxPayableAccountId) {
        const account = await tx.account.findFirst({
          where: { id: taxPayableAccountId, tenantId: tenantId! },
          select: { id: true },
        })
        if (!account) {
          throw new Error('Selected tax payable account was not found')
        }
      } else if (tenant?.enableAccounting) {
        taxPayableAccountId = await getOrCreateDefaultTaxPayableAccountId(
          tx,
          tenantId!
        )
      }

      return tx.taxRate.create({
        data: {
          tenantId: tenantId!,
          name: String(body.name).trim(),
          ratePercentage: Number(body.ratePercentage),
          description: body.description ? String(body.description).trim() : null,
          isDefault: Boolean(body.isDefault),
          isActive: body.isActive !== false,
          taxPayableAccountId,
          effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
          effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
        },
        include: {
          taxPayableAccount: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      })
    })

    return NextResponse.json({ taxRate }, { status: 201 })
  } catch (err) {
    console.error('Failed to create tax rate:', err)
    const message = err instanceof Error ? err.message : 'Failed to create tax rate'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateTaxRateBody(body: any) {
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return 'Tax name is required'
  }

  const ratePercentage = Number(body.ratePercentage)
  if (!Number.isFinite(ratePercentage) || ratePercentage < 0 || ratePercentage > 100) {
    return 'Tax percentage must be between 0 and 100'
  }

  if (body.effectiveFrom && Number.isNaN(new Date(body.effectiveFrom).getTime())) {
    return 'Effective from date is invalid'
  }

  if (body.effectiveTo && Number.isNaN(new Date(body.effectiveTo).getTime())) {
    return 'Effective to date is invalid'
  }

  if (
    body.effectiveFrom &&
    body.effectiveTo &&
    new Date(body.effectiveTo).getTime() < new Date(body.effectiveFrom).getTime()
  ) {
    return 'Effective to date cannot be earlier than effective from date'
  }

  return null
}
