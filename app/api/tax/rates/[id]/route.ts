import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/requireTenant'
import { requireOwner } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { getOrCreateDefaultTaxPayableAccountId } from '@/lib/tax/accounts'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { error, tenantId, user } = await requireTenant()
    if (error) return error

    const { authorized, error: roleError } = requireOwner(user!.role)
    if (!authorized) return roleError!

    const { id } = await params
    const body = await req.json()
    const validationError = validateTaxRateBody(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const existing = await prisma.taxRate.findFirst({
      where: { id, tenantId: tenantId! },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Tax rate not found' }, { status: 404 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId! },
      select: { enableAccounting: true },
    })

    const taxRate = await prisma.$transaction(async (tx) => {
      let taxPayableAccountId =
        body.taxPayableAccountId === undefined ? undefined : body.taxPayableAccountId || null

      if (taxPayableAccountId) {
        const account = await tx.account.findFirst({
          where: { id: taxPayableAccountId, tenantId: tenantId! },
          select: { id: true },
        })
        if (!account) {
          throw new Error('Selected tax payable account was not found')
        }
      } else if (taxPayableAccountId === null && tenant?.enableAccounting) {
        taxPayableAccountId = await getOrCreateDefaultTaxPayableAccountId(
          tx,
          tenantId!
        )
      }

      return tx.taxRate.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
          ...(body.ratePercentage !== undefined
            ? { ratePercentage: Number(body.ratePercentage) }
            : {}),
          ...(body.description !== undefined
            ? { description: body.description ? String(body.description).trim() : null }
            : {}),
          ...(body.isDefault !== undefined ? { isDefault: Boolean(body.isDefault) } : {}),
          ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
          ...(taxPayableAccountId !== undefined ? { taxPayableAccountId } : {}),
          ...(body.effectiveFrom !== undefined
            ? { effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date() }
            : {}),
          ...(body.effectiveTo !== undefined
            ? { effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null }
            : {}),
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

    return NextResponse.json({ taxRate })
  } catch (err) {
    console.error('Failed to update tax rate:', err)
    const message = err instanceof Error ? err.message : 'Failed to update tax rate'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { error, tenantId, user } = await requireTenant()
    if (error) return error

    const { authorized, error: roleError } = requireOwner(user!.role)
    if (!authorized) return roleError!

    const { id } = await params

    const existing = await prisma.taxRate.findFirst({
      where: { id, tenantId: tenantId! },
      include: {
        _count: {
          select: {
            productTaxRateLinks: true,
            productTaxSettings: true,
            transactionTaxLines: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Tax rate not found' }, { status: 404 })
    }

    const usageCount =
      existing._count.productTaxRateLinks +
      existing._count.productTaxSettings +
      existing._count.transactionTaxLines

    if (usageCount > 0) {
      return NextResponse.json(
        {
          error:
            'This tax rate already has product or transaction history. Mark it inactive instead of deleting it.',
        },
        { status: 409 }
      )
    }

    await prisma.taxRate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete tax rate:', err)
    return NextResponse.json(
      { error: 'Failed to delete tax rate' },
      { status: 500 }
    )
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateTaxRateBody(body: any) {
  if (body.name !== undefined && (!body.name || typeof body.name !== 'string' || !body.name.trim())) {
    return 'Tax name is required'
  }

  if (body.ratePercentage !== undefined) {
    const ratePercentage = Number(body.ratePercentage)
    if (!Number.isFinite(ratePercentage) || ratePercentage < 0 || ratePercentage > 100) {
      return 'Tax percentage must be between 0 and 100'
    }
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
