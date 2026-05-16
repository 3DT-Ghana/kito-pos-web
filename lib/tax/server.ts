import { TaxCalculationType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
type DbClient = typeof prisma | Tx

export const itemTaxSettingInclude = {
  productTaxSetting: {
    include: {
      taxRate: true,
      taxRates: {
        include: {
          taxRate: true,
        },
      },
    },
  },
} as const

export async function getTenantTaxConfiguration(
  db: DbClient,
  tenantId: string,
  at = new Date()
) {
  const [taxSetting, activeRates] = await Promise.all([
    db.tenantTaxSetting.findUnique({
      where: { tenantId },
    }),
    db.taxRate.findMany({
      where: {
        tenantId,
        isActive: true,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
      },
      orderBy: [{ effectiveFrom: 'asc' }, { name: 'asc' }],
    }),
  ])

  const defaultRates = activeRates.filter((taxRate) => taxRate.isDefault)

  return {
    taxSetting: taxSetting ?? {
      taxEnabled: false,
      defaultTaxCalculationType: TaxCalculationType.ADD_TO_PRICE,
    },
    activeRates,
    defaultRates,
  }
}
