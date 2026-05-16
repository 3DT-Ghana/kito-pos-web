export interface TaxBreakdownLineLike {
  taxRateId?: string | null
  taxName: string
  taxRatePercentage: number
  taxableAmount: number
  taxAmount: number
}

export interface TaxBreakdownSummaryLine {
  taxRateId: string | null
  taxName: string
  taxRatePercentage: number
  taxableAmount: number
  taxAmount: number
}

export function roundTaxAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatTaxLabel(line: Pick<TaxBreakdownSummaryLine, 'taxName' | 'taxRatePercentage'>) {
  return `${line.taxName} (${roundTaxAmount(line.taxRatePercentage)}%)`
}

export function summariseTaxBreakdown<T extends TaxBreakdownLineLike>(lines: T[]) {
  const grouped = new Map<string, TaxBreakdownSummaryLine>()

  for (const line of lines) {
    const key = `${line.taxRateId ?? line.taxName}:${line.taxName}:${line.taxRatePercentage}`
    const existing = grouped.get(key)

    if (existing) {
      existing.taxableAmount = roundTaxAmount(existing.taxableAmount + line.taxableAmount)
      existing.taxAmount = roundTaxAmount(existing.taxAmount + line.taxAmount)
      continue
    }

    grouped.set(key, {
      taxRateId: line.taxRateId ?? null,
      taxName: line.taxName,
      taxRatePercentage: roundTaxAmount(line.taxRatePercentage),
      taxableAmount: roundTaxAmount(line.taxableAmount),
      taxAmount: roundTaxAmount(line.taxAmount),
    })
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (a.taxName === b.taxName) {
      return a.taxRatePercentage - b.taxRatePercentage
    }

    return a.taxName.localeCompare(b.taxName)
  })
}
