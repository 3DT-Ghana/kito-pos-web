import { ApprovalStatus, type Prisma } from '@prisma/client'

export function approvedSaleWhere(
  where: Prisma.SaleWhereInput = {}
): Prisma.SaleWhereInput {
  return {
    AND: [
      where,
      {
        OR: [
          { approvalStatus: null },
          { approvalStatus: ApprovalStatus.APPROVED },
        ],
      },
    ],
  }
}
