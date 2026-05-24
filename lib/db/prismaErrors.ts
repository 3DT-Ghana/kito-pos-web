import { Prisma } from '@prisma/client'

export function isUniqueConstraintError(error: unknown, field?: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false
  }

  if (error.code !== 'P2002') {
    return false
  }

  if (!field) {
    return true
  }

  const target = error.meta?.target
  if (Array.isArray(target)) {
    return target.includes(field)
  }

  if (typeof target === 'string') {
    return target === field || target.includes(field)
  }

  return false
}
