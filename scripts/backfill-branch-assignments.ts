import { prisma } from '../lib/db/prisma'

type BranchScopedModel =
  | 'User'
  | 'Item'
  | 'Sale'
  | 'Purchase'
  | 'CustomerPayment'
  | 'SupplierPayment'
  | 'Expense'
  | 'CashRegister'
  | 'StockAdjustment'
  | 'PurchaseOrder'

interface ScopedDelegate {
  updateMany(args: {
    where: {
      tenantId: string
      OR: Array<
        | { branchId: null }
        | {
            branchId: {
              notIn: string[]
            }
          }
      >
    }
    data: {
      branchId: string
    }
  }): Promise<{ count: number }>
}

const scopedDelegates: Record<BranchScopedModel, ScopedDelegate> = {
  User: prisma.user,
  Item: prisma.item,
  Sale: prisma.sale,
  Purchase: prisma.purchase,
  CustomerPayment: prisma.customerPayment,
  SupplierPayment: prisma.supplierPayment,
  Expense: prisma.expense,
  CashRegister: prisma.cashRegister,
  StockAdjustment: prisma.stockAdjustment,
  PurchaseOrder: prisma.purchaseOrder,
}

async function main() {
  const targetTenantId = process.argv
    .find((arg) => arg.startsWith('--tenant-id='))
    ?.split('=')[1]

  const tenants = await prisma.tenant.findMany({
    where: {
      enableBranches: true,
      ...(targetTenantId ? { id: targetTenantId } : {}),
    },
    select: {
      id: true,
      name: true,
      branches: {
        select: {
          id: true,
          name: true,
          isDefault: true,
          createdAt: true,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (tenants.length === 0) {
    console.log(
      targetTenantId
        ? `No branch-enabled tenant found for ${targetTenantId}.`
        : 'No branch-enabled tenants found.'
    )
    return
  }

  let grandTotal = 0

  for (const tenant of tenants) {
    const defaultBranch = tenant.branches.find((branch) => branch.isDefault) ?? tenant.branches[0] ?? null

    if (!defaultBranch) {
      console.warn(`Skipping ${tenant.name} (${tenant.id}) because it has no branches.`)
      continue
    }

    const validBranchIds = tenant.branches.map((branch) => branch.id)

    console.log(`\nTenant: ${tenant.name} (${tenant.id})`)
    console.log(`Using branch: ${defaultBranch.name} (${defaultBranch.id})`)

    for (const [modelName, delegate] of Object.entries(scopedDelegates) as Array<
      [BranchScopedModel, ScopedDelegate]
    >) {
      const { count } = await delegate.updateMany({
        where: {
          tenantId: tenant.id,
          OR: [
            { branchId: null },
            { branchId: { notIn: validBranchIds } },
          ],
        },
        data: {
          branchId: defaultBranch.id,
        },
      })

      if (count > 0) {
        console.log(`  ${modelName}: updated ${count}`)
        grandTotal += count
      }
    }
  }

  console.log(`\nBackfill complete. Updated ${grandTotal} record(s).`)
}

main()
  .catch((error) => {
    console.error('Branch backfill failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
