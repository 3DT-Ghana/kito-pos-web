import { TaxCalculationType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export interface ProductTaxSettingInput {
  isTaxable: boolean
  taxRateId?: string | null
  taxRateIds?: string[] | null
  taxCalculationType?: TaxCalculationType | null
  useTenantDefaultTaxes?: boolean
}

export function hasProductTaxSettingPayload(body: Record<string, unknown>) {
  return [
    'isTaxable',
    'taxRateId',
    'taxRateIds',
    'taxCalculationType',
    'useTenantDefaultTaxes',
  ].some((key) => key in body)
}

export async function syncProductTaxSetting(params: {
  tx: Tx
  tenantId: string
  productId: string
  input: ProductTaxSettingInput
}) {
  const { tx, tenantId, productId, input } = params
  const isTaxable = Boolean(input.isTaxable)

  if (!isTaxable) {
    await tx.productTaxSetting.upsert({
      where: { productId },
      update: {
        isTaxable: false,
        taxRateId: null,
        taxCalculationType: input.taxCalculationType ?? null,
        useTenantDefaultTaxes: true,
        taxRates: {
          deleteMany: {},
        },
      },
      create: {
        productId,
        isTaxable: false,
        taxRateId: null,
        taxCalculationType: input.taxCalculationType ?? null,
        useTenantDefaultTaxes: true,
      },
    })
    return
  }

  const requestedRateIds = Array.from(
    new Set(
      [
        input.taxRateId ?? null,
        ...(input.taxRateIds ?? []),
      ].filter((value): value is string => Boolean(value))
    )
  )

  if (requestedRateIds.length > 0) {
    const existingRates = await tx.taxRate.findMany({
      where: {
        tenantId,
        id: { in: requestedRateIds },
      },
      select: { id: true },
    })

    if (existingRates.length !== requestedRateIds.length) {
      throw new Error('One or more selected tax rates were not found')
    }
  }

  const primaryTaxRateId = input.taxRateId ?? requestedRateIds[0] ?? null

  await tx.productTaxSetting.upsert({
    where: { productId },
    update: {
      isTaxable: true,
      taxRateId: primaryTaxRateId,
      taxCalculationType: input.taxCalculationType ?? null,
      useTenantDefaultTaxes: input.useTenantDefaultTaxes !== false,
      taxRates: {
        deleteMany: {},
        ...(requestedRateIds.length > 0
          ? {
              create: requestedRateIds.map((taxRateId) => ({
                taxRateId,
              })),
            }
          : {}),
      },
    },
    create: {
      productId,
      isTaxable: true,
      taxRateId: primaryTaxRateId,
      taxCalculationType: input.taxCalculationType ?? null,
      useTenantDefaultTaxes: input.useTenantDefaultTaxes !== false,
      taxRates: {
        ...(requestedRateIds.length > 0
          ? {
              create: requestedRateIds.map((taxRateId) => ({
                taxRateId,
              })),
            }
          : {}),
      },
    },
  })
}
