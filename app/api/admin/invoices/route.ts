import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'

/**
 * GET /api/admin/invoices?tenantId=&status=&page=&limit=
 */
export async function GET(req: Request) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId') ?? undefined
  const status = searchParams.get('status') ?? undefined
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))

  const where = {
    ...(tenantId ? { tenantId } : {}),
    ...(status ? { status: status as never } : {}),
  }

  const [invoices, total] = await Promise.all([
    prisma.tenantInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { lineItems: true } } },
    }),
    prisma.tenantInvoice.count({ where }),
  ])

  return NextResponse.json({ invoices, total, page, limit })
}
