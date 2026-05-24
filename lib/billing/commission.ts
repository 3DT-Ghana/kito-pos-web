import { prisma } from '@/lib/db/prisma'

interface CreateCommissionsParams {
  invoiceId: string
  agentId: string
  tenantId: string
  tenantName: string
}

/**
 * Creates AgentCommission rows for every line item in an invoice that has a
 * non-zero commission rate. Call this when an invoice transitions to PAID.
 *
 * Idempotent: skips if commissions already exist for this invoice.
 */
export async function createInvoiceCommissions(params: CreateCommissionsParams) {
  const { invoiceId, agentId, tenantId, tenantName } = params

  const existing = await prisma.agentCommission.findFirst({ where: { invoiceId } })
  if (existing) return

  const lineItems = await prisma.invoiceLineItem.findMany({ where: { invoiceId } })

  const invoiceRecord = await prisma.tenantInvoice.findUnique({ where: { id: invoiceId }, select: { id: true } })
  if (!invoiceRecord) return

  // Fetch commission rates for referenced features/items
  const featureIds = lineItems.map((l) => l.featureId).filter(Boolean) as string[]
  const itemIds = lineItems.map((l) => l.itemId).filter(Boolean) as string[]

  const [features, items] = await Promise.all([
    featureIds.length > 0
      ? prisma.featureModule.findMany({ where: { id: { in: featureIds } }, select: { id: true, commissionRate: true } })
      : [],
    itemIds.length > 0
      ? prisma.businessItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, commissionRate: true } })
      : [],
  ])

  const featureRateMap = Object.fromEntries(features.map((f) => [f.id, f.commissionRate]))
  const itemRateMap = Object.fromEntries(items.map((i) => [i.id, i.commissionRate]))

  const rows = []
  for (const line of lineItems) {
    const commissionRate =
      (line.featureId ? featureRateMap[line.featureId] : undefined) ??
      (line.itemId ? itemRateMap[line.itemId] : undefined) ??
      0
    if (commissionRate <= 0) continue

    const commissionAmount = parseFloat(((line.lineTotal * commissionRate) / 100).toFixed(2))
    rows.push({
      agentId,
      tenantId,
      tenantName,
      invoiceId,
      featureId: line.featureId ?? null,
      itemId: line.itemId ?? null,
      description: line.description,
      saleAmount: line.lineTotal,
      commissionRate,
      commissionAmount,
      status: 'PENDING' as const,
    })
  }

  if (rows.length > 0) {
    await prisma.agentCommission.createMany({ data: rows })
  }
}

/** Mark a list of commission IDs as PAID. */
export async function markCommissionsPaid(commissionIds: string[], actorEmail: string) {
  await prisma.agentCommission.updateMany({
    where: { id: { in: commissionIds }, status: 'PENDING' },
    data: { status: 'PAID', paidAt: new Date() },
  })

  await prisma.platformAuditLog.create({
    data: {
      actorEmail,
      action: 'commissions.paid',
      entity: 'AgentCommission',
      details: { ids: commissionIds, count: commissionIds.length },
    },
  })
}
