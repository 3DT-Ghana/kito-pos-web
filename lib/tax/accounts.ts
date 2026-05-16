import { AccountType, NormalBalance } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { ACCOUNT_CODES } from '@/lib/accounting/accounts'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function getOrCreateDefaultTaxPayableAccountId(
  tx: Tx,
  tenantId: string
) {
  const existing = await tx.account.findUnique({
    where: {
      tenantId_code: {
        tenantId,
        code: ACCOUNT_CODES.TAX_PAYABLE,
      },
    },
    select: { id: true },
  })

  if (existing) {
    return existing.id
  }

  const liabilitiesParent = await tx.account.findUnique({
    where: {
      tenantId_code: {
        tenantId,
        code: '2000',
      },
    },
    select: { id: true },
  })

  const created = await tx.account.create({
    data: {
      tenantId,
      code: ACCOUNT_CODES.TAX_PAYABLE,
      name: 'Tax Payable',
      type: AccountType.LIABILITY,
      normalBalance: NormalBalance.CREDIT,
      parentId: liabilitiesParent?.id ?? null,
      isSystemAccount: true,
      description:
        'General tax liability account for collected VAT, GST, levies, and sales taxes',
    },
    select: { id: true },
  })

  return created.id
}

export async function resolveTaxPayableAccountId(
  tx: Tx,
  tenantId: string,
  preferredAccountId?: string | null
) {
  if (preferredAccountId) {
    return preferredAccountId
  }

  return getOrCreateDefaultTaxPayableAccountId(tx, tenantId)
}
