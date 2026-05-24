import { round2 } from '@/lib/accounting/accounts'

export const DEFAULT_SSF_EMPLOYEE_RATE = 5.5  // percentage
export const DEFAULT_SSF_EMPLOYER_RATE = 13   // percentage

// Ghana PAYE monthly tax bands (GHS) — effective January 1, 2024
const PAYE_BANDS: { limit: number; rate: number }[] = [
  { limit: 490,      rate: 0.00  },
  { limit: 110,      rate: 0.05  },
  { limit: 130,      rate: 0.10  },
  { limit: 3166.67,  rate: 0.175 },
  { limit: 16000,    rate: 0.25  },
  { limit: 30520,    rate: 0.30  },
  { limit: Infinity, rate: 0.35  },
]

export function computePAYE(chargeableIncome: number): number {
  if (chargeableIncome <= 0) return 0
  let tax = 0
  let remaining = chargeableIncome
  for (const band of PAYE_BANDS) {
    if (remaining <= 0) break
    const taxable = Math.min(remaining, band.limit)
    tax += taxable * band.rate
    remaining -= taxable
  }
  return round2(tax)
}

export interface AllowanceEntry {
  name: string
  amount: number
  isTaxable: boolean
}

export interface DeductionEntry {
  name: string
  amount: number
  isBeforeTax: boolean
}

export interface PayrollLineInput {
  basicSalary: number
  allowances: AllowanceEntry[]
  deductions: DeductionEntry[]
  overtime: number
  bonus: number
  isExemptFromPAYE: boolean
  ssfEmployeeRate: number  // percentage e.g. 5.5
  ssfEmployerRate: number  // percentage e.g. 13
}

export interface PayrollLineResult {
  basicSalary: number
  overtime: number
  bonus: number
  allowancesSnapshot: AllowanceEntry[]
  deductionsSnapshot: DeductionEntry[]
  allowancesTotal: number
  deductionsTotal: number
  grossPay: number
  ssfEmployee: number
  ssfEmployer: number
  taxableIncome: number
  paye: number
  netPay: number
}

function assertNonNegativeFinite(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`)
  }
}

export function computePayrollLine(input: PayrollLineInput): PayrollLineResult {
  assertNonNegativeFinite('Basic salary', input.basicSalary)
  assertNonNegativeFinite('Overtime', input.overtime)
  assertNonNegativeFinite('Bonus', input.bonus)

  const taxableAllowances = round2(
    input.allowances.filter((a) => a.isTaxable).reduce((s, a) => s + a.amount, 0)
  )
  const nonTaxableAllowances = round2(
    input.allowances.filter((a) => !a.isTaxable).reduce((s, a) => s + a.amount, 0)
  )
  const allowancesTotal = round2(taxableAllowances + nonTaxableAllowances)

  const beforeTaxDeductions = round2(
    input.deductions.filter((d) => d.isBeforeTax).reduce((s, d) => s + d.amount, 0)
  )
  const afterTaxDeductions = round2(
    input.deductions.filter((d) => !d.isBeforeTax).reduce((s, d) => s + d.amount, 0)
  )
  const deductionsTotal = round2(beforeTaxDeductions + afterTaxDeductions)

  const grossPay = round2(
    input.basicSalary + allowancesTotal + input.overtime + input.bonus
  )

  const ssfEmployee = round2((input.basicSalary * input.ssfEmployeeRate) / 100)
  const ssfEmployer = round2((input.basicSalary * input.ssfEmployerRate) / 100)

  // Chargeable income: basic + taxable allowances + overtime + bonus - SSF employee - before-tax deductions
  const chargeableIncome = round2(
    input.basicSalary + taxableAllowances + input.overtime + input.bonus
    - ssfEmployee - beforeTaxDeductions
  )

  const paye = input.isExemptFromPAYE ? 0 : computePAYE(chargeableIncome)
  const taxableIncome = chargeableIncome

  const netPay = round2(grossPay - ssfEmployee - paye - beforeTaxDeductions - afterTaxDeductions)

  return {
    basicSalary: round2(input.basicSalary),
    overtime: round2(input.overtime),
    bonus: round2(input.bonus),
    allowancesSnapshot: input.allowances,
    deductionsSnapshot: input.deductions,
    allowancesTotal,
    deductionsTotal,
    grossPay,
    ssfEmployee,
    ssfEmployer,
    taxableIncome,
    paye,
    netPay,
  }
}
