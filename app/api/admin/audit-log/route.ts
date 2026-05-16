import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: NextRequest) {
  const { context, error } = await requireSuperAdmin()
  if (error) return error

  const { searchParams } = req.nextUrl
  const entity  = searchParams.get('entity')  ?? undefined
  const actor   = searchParams.get('actor')   ?? undefined
  const take    = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)
  const cursor  = searchParams.get('cursor')  ?? undefined

  const logs = await prisma.platformAuditLog.findMany({
    where: {
      ...(entity ? { entity } : {}),
      ...(actor  ? { actorEmail: { contains: actor, mode: 'insensitive' } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const hasMore = logs.length > take
  const items   = hasMore ? logs.slice(0, take) : logs
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return NextResponse.json({ logs: items, nextCursor })
}
