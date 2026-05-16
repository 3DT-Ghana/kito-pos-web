/**
 * Ghana Payroll Computation Engine
 *
 * Implements:
 * - SSNIT / First-Tier Pension:
 *     Employee: 5.5% of basic salary
 *     Employer: 13% of basic salary
 * - PAYE (Pay As You Earn) — GRA monthly bands effective January 1, 2024:
 *     First  GHS 490/month  →  0%
 *     Next   GHS 110/month  →  5%
 *     Next   GHS 130/month  →  10%
 *     Next   GHS 3,166.67/month → 17.5%
 *     Next   GHS 16,000/month → 25%
 *     Next   GHS 30,520/month → 30%
 *     Above that amount → 35%
 *
 * References: GRA PAYE effective January 1, 2024; SSNIT contribution schedule
 */

import { round2 } from '@/lib/accounting/accounts'

export const EMPLOYEE_SSNIT_RATE = 0.055
export const EMPLOYER_TOTAL_PENSION_RATE = 0.13
export const EMPLOYER_TIER2_RATE = 0.05

// Ghana PAYE monthly tax bands (GHS) — effective January 1, 2024
const PAYE_BANDS: { limit: number; rate: number }[] = [
  { limit: 490,      rate: 0.00  },
  { limit: 110,      rate: 0.05  },
  { limit: 130,      rate: 0.10  },
  { limit: 3166.67,  rate: 0.175 },
  { limit: 16000,    rate: 0.25  },
  { limit: 30520,    rate: 0.30  },
  { limit: Infinity, rate: 0.35 },
]

function assertNonNegativeFinite(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`)
  }
}

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

export interface PayrollLineInput {
  basicSalary:     number
  allowances:      number
  overtime:        number
  bonus:           number
  otherDeductions: number
  isExemptFromPAYE: boolean
}

export interface PayrollLineResult {
  basicSalary:     number
  allowances:      number
  overtime:        number
  bonus:           number
  grossPay:        number
  ssfEmployee:     number   // 5.5% of basicSalary
  ssfEmployer:     number   // 13% of basicSalary
  taxableIncome:   number   // grossPay − ssfEmployee
  paye:            number
  otherDeductions: number
  netPay:          number
}

export function computePayrollLine(input: PayrollLineInput): PayrollLineResult {
  assertNonNegativeFinite('Basic salary', input.basicSalary)
  assertNonNegativeFinite('Allowances', input.allowances)
  assertNonNegativeFinite('Overtime', input.overtime)
  assertNonNegativeFinite('Bonus', input.bonus)
  assertNonNegativeFinite('Other deductions', input.otherDeductions)

  const grossPay     = round2(input.basicSalary + input.allowances + input.overtime + input.bonus)
  const ssfEmployee  = round2(input.basicSalary * EMPLOYEE_SSNIT_RATE)
  const ssfEmployer  = round2(input.basicSalary * EMPLOYER_TOTAL_PENSION_RATE)
  const taxableIncome = round2(grossPay - ssfEmployee)
  const paye         = input.isExemptFromPAYE ? 0 : computePAYE(taxableIncome)
  const otherDeductions = round2(input.otherDeductions)
  const maxOtherDeductions = round2(grossPay - ssfEmployee - paye)

  if (otherDeductions > maxOtherDeductions) {
    throw new Error('Other deductions cannot exceed take-home pay before deductions')
  }

  const netPay = round2(grossPay - ssfEmployee - paye - otherDeductions)

  return {
    basicSalary:     round2(input.basicSalary),
    allowances:      round2(input.allowances),
    overtime:        round2(input.overtime),
    bonus:           round2(input.bonus),
    grossPay,
    ssfEmployee,
    ssfEmployer,
    taxableIncome,
    paye,
    otherDeductions,
    netPay,
  }
}
