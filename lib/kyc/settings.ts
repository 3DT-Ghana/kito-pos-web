import type {
  Agent,
  BusinessApplication,
  BusinessDocument,
  KYCSettings,
  Prisma,
} from '@prisma/client'
import { DocumentType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

type AgentKYCInput = Pick<Agent, 'ghanaCardNumber' | 'ghanaCardImageUrl'>

type BusinessApplicationKYCInput = Pick<
  BusinessApplication,
  'businessRegistrationNumber' | 'directors' | 'ownerFullName' | 'ownerGhanaCardNumber'
> & {
  documents: Array<Pick<BusinessDocument, 'documentType'>>
}

interface DirectorKYCRecord {
  fullName?: string
  ghanaCardNumber?: string
}

function normalizeDirectorsForKYC(
  directors: Prisma.JsonValue,
  fallbackOwner: Pick<BusinessApplication, 'ownerFullName' | 'ownerGhanaCardNumber'>
) {
  const normalizedDirectors: DirectorKYCRecord[] = []

  if (Array.isArray(directors)) {
    for (const director of directors) {
      if (!director || typeof director !== 'object' || Array.isArray(director)) {
        continue
      }

      const record = director as Record<string, unknown>
      const fullName =
        typeof record.fullName === 'string' ? record.fullName.trim() : ''
      const ghanaCardNumber =
        typeof record.ghanaCardNumber === 'string'
          ? record.ghanaCardNumber.trim()
          : ''

      if (fullName || ghanaCardNumber) {
        normalizedDirectors.push({
          fullName: fullName || undefined,
          ghanaCardNumber: ghanaCardNumber || undefined,
        })
      }
    }
  }

  const ownerFullName = fallbackOwner.ownerFullName.trim()
  const ownerGhanaCardNumber = fallbackOwner.ownerGhanaCardNumber?.trim() || undefined
  const ownerAlreadyPresent = normalizedDirectors.some(
    (director) =>
      director.fullName?.toLowerCase() === ownerFullName.toLowerCase()
  )

  if (!normalizedDirectors.length || !ownerAlreadyPresent) {
    normalizedDirectors.unshift({
      fullName: ownerFullName,
      ghanaCardNumber: ownerGhanaCardNumber,
    })
  }

  return normalizedDirectors
}

export async function getGlobalKYCSettings(): Promise<KYCSettings> {
  return prisma.kYCSettings.upsert({
    where: { id: 'global' },
    create: { id: 'global' },
    update: {},
  })
}

export function getMissingAgentKYCRequirements(
  settings: KYCSettings,
  agent: AgentKYCInput
) {
  const missing: string[] = []

  if (settings.requireAgentGhanaCardNumber && !agent.ghanaCardNumber?.trim()) {
    missing.push('Ghana Card number')
  }

  if (settings.requireAgentGhanaCardUpload && !agent.ghanaCardImageUrl?.trim()) {
    missing.push('Ghana Card image upload')
  }

  return missing
}

export function getMissingBusinessApplicationKYCRequirements(
  settings: KYCSettings,
  application: BusinessApplicationKYCInput
) {
  const missing: string[] = []

  if (
    settings.requireBusinessRegNumber &&
    !application.businessRegistrationNumber?.trim()
  ) {
    missing.push('Business registration number')
  }

  if (
    settings.requireDirectorGhanaCardNumber &&
    normalizeDirectorsForKYC(application.directors, application).some(
      (director) => !director.ghanaCardNumber?.trim()
    )
  ) {
    missing.push('Ghana Card number for every listed director')
  }

  const documentTypes = new Set(application.documents.map((doc) => doc.documentType))

  if (
    settings.requireBusinessCertUpload &&
    !documentTypes.has(DocumentType.BUSINESS_CERTIFICATE)
  ) {
    missing.push('Business certificate upload')
  }

  if (
    settings.requireDirectorGhanaCardUpload &&
    !documentTypes.has(DocumentType.GHANA_CARD_FRONT)
  ) {
    missing.push('Director Ghana Card upload')
  }

  return missing
}
