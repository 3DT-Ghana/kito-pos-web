import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { requireBranchAccess, isBranchFilterActive } from '@/lib/branch/server'
import { getScopedCustomerMetrics } from '@/lib/branch/scopedMetrics'

/**
 * Customers API Routes
 *
 * GET /api/customers - List all customers (debtors)
 * POST /api/customers - Create new customer
 */

/**
 * GET /api/customers
 * List all customers for the current tenant
 * Optional query params: search, hasDebt
 */
export async function GET(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'view_customers')
    if (!authorized) return permError!

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const hasDebt = searchParams.get('hasDebt') === 'true'

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
      if (hasDebt) {
        where.balance = {
          gt: 0,
        }
      }

      const customers = await prisma.customer.findMany({
        where,
        include: {
          _count: {
            select: { sales: true },
          },
        },
        orderBy: [
          { balance: 'desc' }, // Debtors first
          { name: 'asc' },
        ],
      })

      const totalDebt = customers.reduce((sum, customer) => sum + customer.balance, 0)

      return NextResponse.json({
        customers,
        summary: {
          total: customers.length,
          withDebt: customers.filter(c => c.balance > 0).length,
          totalDebt,
        },
      })
    }

    const customers = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
      },
    })

    const metrics = await getScopedCustomerMetrics(
      context!,
      customers.map((customer) => customer.id)
    )

    const scopedCustomers = customers
      .map((customer) => {
        const metric = metrics.get(customer.id)
        return {
          ...customer,
          balance: metric?.balance ?? 0,
          _count: {
            sales: metric?.transactionCount ?? 0,
          },
        }
      })
      .filter((customer) => !hasDebt || customer.balance > 0)
      .sort((a, b) => {
        if (b.balance !== a.balance) return b.balance - a.balance
        return a.name.localeCompare(b.name)
      })

    const totalDebt = scopedCustomers.reduce((sum, customer) => sum + customer.balance, 0)

    return NextResponse.json({
      customers: scopedCustomers,
      summary: {
        total: scopedCustomers.length,
        withDebt: scopedCustomers.filter((customer) => customer.balance > 0).length,
        totalDebt,
      },
    })
  } catch (err) {
    console.error('Failed to fetch customers:', err)
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/customers
 * Create a new customer
 * Requires: create_customers permission
 */
export async function POST(req: Request) {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    // Check permission
    const { authorized, error: permError } = requirePermission(context!, 'create_customers')
    if (!authorized) return permError!

    const body = await req.json()

    // Validate required fields
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json(
        { error: 'Customer name is required' },
        { status: 400 }
      )
    }

    // Check for duplicate: same name + same phone combination within tenant.
    // If no phone is provided, match on name alone (two nameless entries with
    // the same name are still considered duplicates).
    const existing = await prisma.customer.findFirst({
      where: {
        tenantId: context!.tenantId,
        name: {
          equals: body.name.trim(),
          mode: 'insensitive' as const,
        },
        phone: body.phone ? body.phone.trim() : null,
      },
    })

    if (existing) {
      const detail = body.phone
        ? 'A customer with this name and phone number already exists'
        : 'A customer with this name (and no phone) already exists'
      return NextResponse.json({ error: detail }, { status: 409 })
    }

    // Create customer
    const customer = await prisma.customer.create({
      data: {
        tenantId: context!.tenantId,
        name: body.name.trim(),
        phone: body.phone ? body.phone.trim() : null,
        balance: 0, // Always start with 0 balance
      },
      include: {
        _count: {
          select: { sales: true },
        },
      },
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (err) {
    console.error('Failed to create customer:', err)
    return NextResponse.json(
      { error: 'Failed to create customer' },
      { status: 500 }
    )
  }
}
