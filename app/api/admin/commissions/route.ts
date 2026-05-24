import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'
import { markCommissionsPaid } from '@/lib/billing/commission'

/**
 * GET  /api/admin/commissions?agentId=&status=&from=&to=&page=&limit=
 * POST /api/admin/commissions/pay  — mark commissions as paid
 *   Body: { ids: string[] }
 */

export async function GET(req: Request) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId') ?? undefined
  const status = searchParams.get('status') ?? undefined
  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))

  const where: Record<string, unknown> = {
    ...(agentId ? { agentId } : {}),
    ...(status ? { status } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  }

  const [commissions, total] = await Promise.all([
    prisma.agentCommission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        agent: { select: { id: true, agentCode: true, fullName: true } },
        invoice: { select: { invoiceNumber: true } },
        feature: { select: { name: true } },
        item: { select: { name: true } },
      },
    }),
    prisma.agentCommission.count({ where }),
  ])

  return NextResponse.json({ commissions, total, page, limit })
}

export async function POST(req: Request) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  try {
    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
    }

    await markCommissionsPaid(ids, context!.email)
    return NextResponse.json({ paid: true, count: ids.length })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to mark commissions paid' }, { status: 500 })
  }
}
