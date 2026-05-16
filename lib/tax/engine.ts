import { TaxCalculationType } from '@prisma/client'
import { round2 } from '@/lib/accounting/accounts'

export interface TaxRateLike {
  id: string
  name: string
  ratePercentage: number
  description?: string | null
  isDefault?: boolean
  isActive?: boolean
  effectiveFrom?: Date
  effectiveTo?: Date | null
  taxPayableAccountId?: string | null
}

export interface ProductTaxRateLinkLike {
  taxRateId: string
  taxRate: TaxRateLike
}

export interface ProductTaxSettingLike {
  isTaxable: boolean
  taxRateId?: string | null
  taxRate?: TaxRateLike | null
  taxCalculationType?: TaxCalculationType | null
  useTenantDefaultTaxes?: boolean
  taxRates?: ProductTaxRateLinkLike[]
}

export interface ItemTaxConfigLike {
  id: string
  productTaxSetting?: ProductTaxSettingLike | null
}

export interface TenantTaxSettingLike {
  taxEnabled: boolean
  defaultTaxCalculationType: TaxCalculationType
}

export interface TaxApplicationOverride {
  isTaxable?: boolean | null
  taxCalculationType?: TaxCalculationType | null
  taxRateIds?: string[] | null
}

export interface ResolvedTaxRate {
  id: string
  name: string
  ratePercentage: number
  taxPayableAccountId: string | null
}

export interface ResolvedItemTaxProfile {
  isTaxable: boolean
  calculationType: TaxCalculationType
  rates: ResolvedTaxRate[]
}

export interface ComputedTaxLine {
  taxRateId: string | null
  taxName: string
  taxRatePercentage: number
  taxableAmount: number
  taxAmount: number
  calculationType: TaxCalculationType
}

export interface ComputedLineTaxes {
  isTaxable: boolean
  calculationType: TaxCalculationType | null
  grossAmount: number
  taxableAmount: number
  taxAmount: number
  totalAmount: number
  effectiveRatePercentage: number
  taxLines: ComputedTaxLine[]
}

function isEffectiveOn(rate: TaxRateLike, at: Date) {
  const effectiveFrom = rate.effectiveFrom ?? new Date(0)
  const effectiveTo = rate.effectiveTo ?? null

  if ((rate.isActive ?? true) === false) {
    return false
  }

  if (effectiveFrom.getTime() > at.getTime()) {
    return false
  }

  if (effectiveTo && effectiveTo.getTime() < at.getTime()) {
    return false
  }

  return true
}

export function getEffectiveTaxRates<T extends TaxRateLike>(rates: T[], at = new Date()) {
  return rates.filter((rate) => isEffectiveOn(rate, at))
}

export function resolveItemTaxProfile(params: {
  tenantTaxSetting: TenantTaxSettingLike | null | undefined
  activeRates?: TaxRateLike[]
  defaultRates: TaxRateLike[]
  item: ItemTaxConfigLike
  override?: TaxApplicationOverride | null
  at?: Date
}): ResolvedItemTaxProfile {
  const at = params.at ?? new Date()
  const tenantTaxSetting = params.tenantTaxSetting
  const productTaxSetting = params.item.productTaxSetting
  const override = params.override

  if (!tenantTaxSetting?.taxEnabled) {
    return {
      isTaxable: false,
      calculationType: tenantTaxSetting?.defaultTaxCalculationType ?? TaxCalculationType.ADD_TO_PRICE,
      rates: [],
    }
  }

  const isTaxable = override?.isTaxable ?? productTaxSetting?.isTaxable ?? false
  const calculationType =
    override?.taxCalculationType ??
    productTaxSetting?.taxCalculationType ??
    tenantTaxSetting.defaultTaxCalculationType

  if (!isTaxable) {
    return {
      isTaxable: false,
      calculationType,
      rates: [],
    }
  }

  const effectiveDefaultRates = getEffectiveTaxRates(params.defaultRates, at)
  const effectiveActiveRates = getEffectiveTaxRates(
    params.activeRates ?? params.defaultRates,
    at
  )
  const effectiveActiveRateMap = new Map(
    effectiveActiveRates.map((rate) => [rate.id, rate])
  )

  const overrideRateIds = override?.taxRateIds?.filter(Boolean) ?? []
  let chosenRates: TaxRateLike[] = []

  if (overrideRateIds.length > 0) {
    chosenRates = overrideRateIds
      .map((taxRateId) => effectiveActiveRateMap.get(taxRateId))
      .filter((rate): rate is TaxRateLike => Boolean(rate))
  } else if (productTaxSetting?.useTenantDefaultTaxes ?? true) {
    chosenRates = effectiveDefaultRates
  } else if ((productTaxSetting?.taxRates?.length ?? 0) > 0) {
    chosenRates = productTaxSetting!.taxRates!
      .map((link) => link.taxRate)
      .filter((rate) => isEffectiveOn(rate, at))
  } else if (productTaxSetting?.taxRate && isEffectiveOn(productTaxSetting.taxRate, at)) {
    chosenRates = [productTaxSetting.taxRate]
  }

  const uniqueRates = Array.from(
    new Map(chosenRates.map((rate) => [rate.id, rate])).values()
  )

  return {
    isTaxable: uniqueRates.length > 0,
    calculationType,
    rates: uniqueRates.map((rate) => ({
      id: rate.id,
      name: rate.name,
      ratePercentage: rate.ratePercentage,
      taxPayableAccountId: rate.taxPayableAccountId ?? null,
    })),
  }
}

function allocateTaxAmounts(params: {
  taxableAmount: number
  rates: ResolvedTaxRate[]
  calculationType: TaxCalculationType
  expectedTotalTax?: number
}) {
  const provisional = params.rates.map((rate) =>
    round2((params.taxableAmount * rate.ratePercentage) / 100)
  )

  if (params.expectedTotalTax === undefined || provisional.length === 0) {
    return provisional
  }

  const remainder = round2(
    params.expectedTotalTax - provisional.reduce((sum, amount) => sum + amount, 0)
  )

  if (Math.abs(remainder) < 0.01) {
    return provisional
  }

  const lastIndex = provisional.length - 1
  provisional[lastIndex] = round2(provisional[lastIndex] + remainder)
  return provisional
}

export function calculateLineTaxes(params: {
  unitPrice: number
  quantity: number
  discountAmount?: number
  profile: ResolvedItemTaxProfile
}): ComputedLineTaxes {
  const grossAmount = round2(
    Math.max(0, params.unitPrice * params.quantity - (params.discountAmount ?? 0))
  )

  if (!params.profile.isTaxable || params.profile.rates.length === 0 || grossAmount <= 0) {
    return {
      isTaxable: false,
      calculationType: params.profile.calculationType,
      grossAmount,
      taxableAmount: grossAmount,
      taxAmount: 0,
      totalAmount: grossAmount,
      effectiveRatePercentage: 0,
      taxLines: [],
    }
  }

  const effectiveRatePercentage = round2(
    params.profile.rates.reduce((sum, rate) => sum + rate.ratePercentage, 0)
  )

  if (effectiveRatePercentage <= 0) {
    return {
      isTaxable: false,
      calculationType: params.profile.calculationType,
      grossAmount,
      taxableAmount: grossAmount,
      taxAmount: 0,
      totalAmount: grossAmount,
      effectiveRatePercentage: 0,
      taxLines: [],
    }
  }

  let taxableAmount = grossAmount
  let taxAmount = 0
  let totalAmount = grossAmount

  if (params.profile.calculationType === TaxCalculationType.INCLUSIVE) {
    taxableAmount = round2(grossAmount / (1 + effectiveRatePercentage / 100))
    taxAmount = round2(grossAmount - taxableAmount)
    totalAmount = grossAmount
  } else {
    taxableAmount = grossAmount
    taxAmount = round2((taxableAmount * effectiveRatePercentage) / 100)
    totalAmount = round2(taxableAmount + taxAmount)
  }

  const allocated = allocateTaxAmounts({
    taxableAmount,
    rates: params.profile.rates,
    calculationType: params.profile.calculationType,
    expectedTotalTax: taxAmount,
  })

  const taxLines = params.profile.rates.map((rate, index) => ({
    taxRateId: rate.id,
    taxName: rate.name,
    taxRatePercentage: rate.ratePercentage,
    taxableAmount,
    taxAmount: allocated[index] ?? 0,
    calculationType: params.profile.calculationType,
  }))

  return {
    isTaxable: true,
    calculationType: params.profile.calculationType,
    grossAmount,
    taxableAmount,
    taxAmount: round2(taxLines.reduce((sum, taxLine) => sum + taxLine.taxAmount, 0)),
    totalAmount,
    effectiveRatePercentage,
    taxLines,
  }
}

export function summariseTaxLines(taxLines: ComputedTaxLine[]) {
  const summary = new Map<
    string,
    {
      taxName: string
      taxRatePercentage: number
      taxableAmount: number
      taxAmount: number
    }
  >()

  for (const taxLine of taxLines) {
    const key = `${taxLine.taxName}:${taxLine.taxRatePercentage}`
    const existing = summary.get(key)

    if (existing) {
      existing.taxableAmount = round2(existing.taxableAmount + taxLine.taxableAmount)
      existing.taxAmount = round2(existing.taxAmount + taxLine.taxAmount)
      continue
    }

    summary.set(key, {
      taxName: taxLine.taxName,
      taxRatePercentage: taxLine.taxRatePercentage,
      taxableAmount: round2(taxLine.taxableAmount),
      taxAmount: round2(taxLine.taxAmount),
    })
  }

  return Array.from(summary.values())
}

export function scaleTaxLines(
  taxLines: Array<Pick<ComputedTaxLine, 'taxRateId' | 'taxName' | 'taxRatePercentage' | 'taxableAmount' | 'taxAmount' | 'calculationType'>>,
  scale: number
) {
  return taxLines.map((taxLine) => ({
    taxRateId: taxLine.taxRateId,
    taxName: taxLine.taxName,
    taxRatePercentage: taxLine.taxRatePercentage,
    taxableAmount: round2(taxLine.taxableAmount * scale),
    taxAmount: round2(taxLine.taxAmount * scale),
    calculationType: taxLine.calculationType,
  }))
}
