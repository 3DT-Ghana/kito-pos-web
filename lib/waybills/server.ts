import { prisma } from '@/lib/db/prisma'

export async function getNextWaybillNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `WB-${year}-`

  const last = await prisma.waybill.findFirst({
    where: { tenantId, waybillNumber: { startsWith: prefix } },
    orderBy: { waybillNumber: 'desc' },
    select: { waybillNumber: true },
  })

  const seq = last
    ? parseInt(last.waybillNumber.replace(prefix, ''), 10) + 1
    : 1

  return `${prefix}${String(seq).padStart(4, '0')}`
}

export const waybillSelect = {
  id: true,
  waybillNumber: true,
  status: true,
  saleId: true,
  shipperName: true,
  shipperAddress: true,
  shipperPhone: true,
  consigneeName: true,
  consigneeAddress: true,
  consigneePhone: true,
  driverName: true,
  vehicleNumber: true,
  carrierName: true,
  notes: true,
  receivedBy: true,
  dispatchedAt: true,
  dispatchedById: true,
  deliveredAt: true,
  deliveredById: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  branchId: true,
  items: {
    select: {
      id: true,
      description: true,
      quantity: true,
      unit: true,
      weight: true,
      notes: true,
    },
  },
} as const
