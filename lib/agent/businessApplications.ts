import { BusinessType, type KYCSettings } from '@prisma/client'

interface DirectorPayload {
  fullName: string
  ghanaCardNumber: string | null
}

interface NormalizedBusinessApplicationInput {
  businessName: string
  businessType: BusinessType
  businessRegistrationNumber: string | null
  businessAddress: string
  businessPhone: string | null
  businessEmail: string | null
  gpsLatitude: number | null
  gpsLongitude: number | null
  ownerFullName: string
  ownerPhone: string
  ownerEmail: string
  ownerGhanaCardNumber: string | null
  directors: DirectorPayload[]
}

type KYCValidationSettings = Pick<
  KYCSettings,
  'requireBusinessRegNumber' | 'requireDirectorGhanaCardNumber'
>

type NormalizeBusinessApplicationPayloadResult =
  | { ok: true; data: NormalizedBusinessApplicationInput }
  | { ok: false; error: string }

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed || null
}

function normalizeOptionalNumber(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null
  }

  return value
}

export function normalizeBusinessApplicationPayload(
  body: unknown,
  kycSettings: KYCValidationSettings
): NormalizeBusinessApplicationPayloadResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      error: 'Invalid application payload',
    }
  }

  const payload = body as Record<string, unknown>
  const businessName =
    typeof payload.businessName === 'string' ? payload.businessName.trim() : ''
  const businessAddress =
    typeof payload.businessAddress === 'string'
      ? payload.businessAddress.trim()
      : ''
  const ownerFullName =
    typeof payload.ownerFullName === 'string'
      ? payload.ownerFullName.trim()
      : ''
  const ownerPhone =
    typeof payload.ownerPhone === 'string' ? payload.ownerPhone.trim() : ''
  const ownerEmail =
    typeof payload.ownerEmail === 'string' ? payload.ownerEmail.trim() : ''
  const ownerGhanaCardNumber = normalizeOptionalString(
    payload.ownerGhanaCardNumber
  )
  const businessRegistrationNumber = normalizeOptionalString(
    payload.businessRegistrationNumber
  )

  if (
    !businessName ||
    !businessAddress ||
    !ownerFullName ||
    !ownerPhone ||
    !ownerEmail
  ) {
    return {
      ok: false,
      error:
        'businessName, businessAddress, ownerFullName, ownerPhone and ownerEmail are required',
    }
  }

  if (
    kycSettings.requireBusinessRegNumber &&
    !businessRegistrationNumber?.trim()
  ) {
    return {
      ok: false,
      error: 'Business Registration Number is required by platform settings',
    }
  }

  const validTypes = ['SHOP', 'COMPANY', 'OTHER']
  const businessType: BusinessType =
    typeof payload.businessType === 'string' &&
    validTypes.includes(payload.businessType)
      ? (payload.businessType as BusinessType)
      : 'SHOP'

  const directorsArray: DirectorPayload[] = []
  if (Array.isArray(payload.directors)) {
    for (const director of payload.directors) {
      if (!director || typeof director !== 'object' || Array.isArray(director)) {
        continue
      }

      const fullName =
        typeof director.fullName === 'string' ? director.fullName.trim() : ''
      const ghanaCardNumber =
        typeof director.ghanaCardNumber === 'string'
          ? director.ghanaCardNumber.trim()
          : ''

      if (fullName) {
        directorsArray.push({
          fullName,
          ghanaCardNumber: ghanaCardNumber || null,
        })
      }
    }
  }

  const ownerAlreadyListed = directorsArray.some(
    (director) =>
      director.fullName.toLowerCase() === ownerFullName.toLowerCase()
  )

  if (!ownerAlreadyListed) {
    directorsArray.unshift({
      fullName: ownerFullName,
      ghanaCardNumber: ownerGhanaCardNumber || null,
    })
  }

  if (
    kycSettings.requireDirectorGhanaCardNumber &&
    directorsArray.some((director) => !director.ghanaCardNumber?.trim())
  ) {
    return {
      ok: false,
      error: 'Every listed director must have a Ghana Card Number',
    }
  }

  return {
    ok: true,
    data: {
      businessName,
      businessType,
      businessRegistrationNumber,
      businessAddress,
      businessPhone: normalizeOptionalString(payload.businessPhone),
      businessEmail: normalizeOptionalString(payload.businessEmail),
      gpsLatitude: normalizeOptionalNumber(payload.gpsLatitude),
      gpsLongitude: normalizeOptionalNumber(payload.gpsLongitude),
      ownerFullName,
      ownerPhone,
      ownerEmail,
      ownerGhanaCardNumber,
      directors: directorsArray,
    },
  }
}
