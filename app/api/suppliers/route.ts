import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess, isBranchFilterActive } from '@/lib/branch/server'
import { getScopedSupplierMetrics } from '@/lib/branch/scopedMetrics'

/**
 * Suppliers API Routes
 *
 * GET /api/suppliers - List all suppliers (creditors)
 * POST /api/suppliers - Create new supplier
 */

/**
 * GET /api/suppliers
 * List all suppliers for the current tenant
 * Optional query params: search, hasCredit
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // view_suppliers was likewise defined, granted and advertised but unused.
    const { authorized, error: permError } = requirePermission(context!, 'view_suppliers')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const hasCredit = searchParams.get('hasCredit') === 'true'

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId: context!.tenantId }

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive' as const,
          },
        },
        {
          phone: {
            contains: search,
          },
        },
      ]
    }

    if (!isBranchFilterActive(context!)) {
      if (hasCredit) {
        where.balance = {
          gt: 0,
        }
      }

      const suppliers = await prisma.supplier.findMany({
        where,
        include: {
          _count: {
            select: { purchases: true },
          },
        },
        orderBy: [
          { balance: 'desc' }, // Creditors first
          { name: 'asc' },
        ],
      })

      const totalCredit = suppliers.reduce((sum, supplier) => sum + supplier.balance, 0)

      return NextResponse.json({
        suppliers,
        summary: {
          total: suppliers.length,
          withCredit: suppliers.filter(s => s.balance > 0).length,
          totalCredit,
        },
      })
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
      },
    })

    const metrics = await getScopedSupplierMetrics(
      context!,
      suppliers.map((supplier) => supplier.id)
    )

    const scopedSuppliers = suppliers
      .map((supplier) => {
        const metric = metrics.get(supplier.id)
        return {
          ...supplier,
          balance: metric?.balance ?? 0,
          _count: {
            purchases: metric?.transactionCount ?? 0,
          },
        }
      })
      .filter((supplier) => !hasCredit || supplier.balance > 0)
      .sort((a, b) => {
        if (b.balance !== a.balance) return b.balance - a.balance
        return a.name.localeCompare(b.name)
      })

    const totalCredit = scopedSuppliers.reduce((sum, supplier) => sum + supplier.balance, 0)

    return NextResponse.json({
      suppliers: scopedSuppliers,
      summary: {
        total: scopedSuppliers.length,
        withCredit: scopedSuppliers.filter((supplier) => supplier.balance > 0).length,
        totalCredit,
      },
    })
  } catch (err) {
    console.error('Failed to fetch suppliers:', err)
    return NextResponse.json(
      { error: 'Failed to fetch suppliers' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/suppliers
 * Create a new supplier
 * Requires: create_suppliers permission
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Check permission
    const { authorized, error: permError } = requirePermission(context!, 'create_suppliers')
    if (!authorized) return permError!

    const body = await req.json()

    // Validate required fields
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json(
        { error: 'Supplier name is required' },
        { status: 400 }
      )
    }

    // Check for duplicate supplier name or phone
    // Name AND phone together, matching the customer route. An OR rejected two
    // genuinely distinct suppliers that share a switchboard number
    // ("Unilever – Accra" and "Unilever – Kumasi" on one line).
    const existing = await prisma.supplier.findFirst({
      where: {
        tenantId: context!.tenantId,
        name: {
          equals: body.name.trim(),
          mode: 'insensitive' as const,
        },
        phone: body.phone?.trim() || null,
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A supplier with this name and phone number already exists' },
        { status: 409 }
      )
    }

    // Create supplier
    const supplier = await prisma.supplier.create({
      data: {
        tenantId: context!.tenantId,
        name: body.name.trim(),
        phone: body.phone ? body.phone.trim() : null,
        balance: 0, // Always start with 0 balance
      },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    })

    return NextResponse.json(supplier, { status: 201 })
  } catch (err) {
    console.error('Failed to create supplier:', err)
    return NextResponse.json(
      { error: 'Failed to create supplier' },
      { status: 500 }
    )
  }
}
