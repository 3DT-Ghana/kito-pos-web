import { Role, TenantStatus } from '@prisma/client'
import { DEFAULT_BRANCH_NAME } from '@/lib/branch/constants'
import { prisma } from '@/lib/db/prisma'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export class OwnerEmailConflictError extends Error {
  constructor(email: string) {
    super(`Owner email "${email}" is already registered`)
    this.name = 'OwnerEmailConflictError'
  }
}

interface CreateTenantWithOwnerInput {
  businessName: string
  ownerName: string
  ownerEmail: string
  passwordHash: string
  phone?: string | null
  agentId?: string | null
  status?: TenantStatus
  branchName?: string
  branchAddress?: string | null
  branchPhone?: string | null
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function createTenantWithOwner(
  tx: Tx,
  input: CreateTenantWithOwnerInput
) {
  const ownerEmail = normalizeEmail(input.ownerEmail)
  const existingUser = await tx.user.findUnique({
    where: { email: ownerEmail },
    select: { id: true },
  })

  if (existingUser) {
    throw new OwnerEmailConflictError(ownerEmail)
  }

  const tenant = await tx.tenant.create({
    data: {
      name: input.businessName.trim(),
      phone: input.phone?.trim() || null,
      status: input.status ?? TenantStatus.TRIAL,
      ...(input.agentId ? { agentId: input.agentId } : {}),
    },
  })

  const branch = await tx.branch.create({
    data: {
      tenantId: tenant.id,
      name: input.branchName?.trim() || DEFAULT_BRANCH_NAME,
      address: input.branchAddress?.trim() || null,
      phone: input.branchPhone?.trim() || input.phone?.trim() || null,
      isDefault: true,
    },
  })

  const owner = await tx.user.create({
    data: {
      tenantId: tenant.id,
      name: input.ownerName.trim(),
      email: ownerEmail,
      password: input.passwordHash,
      role: Role.OWNER,
      branchId: branch.id,
    },
  })

  return { tenant, branch, owner }
}
