import { NextResponse } from 'next/server'
import { requireApprovedAgent } from '@/lib/agent/server'
import { prisma } from '@/lib/db/prisma'
import { BusinessType } from '@prisma/client'
import { getGlobalKYCSettings } from '@/lib/kyc/settings'

/**
 * GET /api/agent/applications
 * List all business applications submitted by the authenticated agent.
 *
 * POST /api/agent/applications
 * Submit a new business application.
 * Body (JSON): {
 *   businessName, businessType?, businessAddress, businessPhone?, businessEmail?,
 *   businessRegistrationNumber?,
 *   directors: [{ fullName, ghanaCardNumber? }],    // at least one (the owner)
 *   ownerFullName, ownerPhone, ownerEmail, ownerGhanaCardNumber?,
 *   gpsLatitude?, gpsLongitude?
 * }
 * KYC requirement rules are fetched from KYCSettings. Validation respects the
 * "provide number OR upload" flexibility — the upload step is a separate endpoint.
 */

export async function GET() {
  const { context, error } = await requireApprovedAgent()
  if (error) return error

  const applications = await prisma.businessApplication.findMany({
    where: { agentId: context!.agent.id },
    include: {
      documents: {
        select: { id: true, documentType: true, label: true, fileUrl: true, uploadedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(applications)
}

export async function POST(req: Request) {
  const { context, error } = await requireApprovedAgent()
  if (error) return error

  try {
    const body = await req.json()
    const {
      businessName,
      businessType,
      businessAddress,
      businessPhone,
      businessEmail,
      businessRegistrationNumber,
      directors,
      ownerFullName,
      ownerPhone,
      ownerEmail,
      ownerGhanaCardNumber,
      gpsLatitude,
      gpsLongitude,
    } = body

    if (!businessName || !businessAddress || !ownerFullName || !ownerPhone || !ownerEmail) {
      return NextResponse.json(
        { error: 'businessName, businessAddress, ownerFullName, ownerPhone and ownerEmail are required' },
        { status: 400 }
      )
    }

    // Fetch KYC settings — upsert guarantees a row with correct defaults always exists
    const kycSettings = await getGlobalKYCSettings()

    // Business reg number required only when admin has enabled that setting
    if (kycSettings.requireBusinessRegNumber && !businessRegistrationNumber?.trim()) {
      return NextResponse.json(
        { error: 'Business Registration Number is required by platform settings' },
        { status: 400 }
      )
    }

    // Business certificate upload required only when admin has enabled that setting
    if (kycSettings.requireBusinessCertUpload) {
      // Cert is uploaded in a separate step; we can't validate the file here.
      // Flag is checked on the admin review side. No block needed at submission time.
    }

    const validTypes = ['SHOP', 'COMPANY', 'OTHER']
    const resolvedType: BusinessType =
      businessType && validTypes.includes(businessType) ? businessType : 'SHOP'

    // Build directors array — always include the primary owner as first entry
    const directorsArray: { fullName: string; ghanaCardNumber?: string }[] = []
    if (Array.isArray(directors) && directors.length > 0) {
      for (const d of directors) {
        if (d?.fullName?.trim()) {
          directorsArray.push({
            fullName: d.fullName.trim(),
            ghanaCardNumber: d.ghanaCardNumber?.trim() || undefined,
          })
        }
      }
    }
    // Ensure the primary owner is represented
    const ownerAlreadyListed = directorsArray.some(
      (d) => d.fullName.toLowerCase() === ownerFullName.trim().toLowerCase()
    )
    if (!ownerAlreadyListed) {
      directorsArray.unshift({
        fullName: ownerFullName.trim(),
        ghanaCardNumber: ownerGhanaCardNumber?.trim() || undefined,
      })
    }

    if (
      kycSettings.requireDirectorGhanaCardNumber &&
      directorsArray.some((director) => !director.ghanaCardNumber?.trim())
    ) {
      return NextResponse.json(
        { error: 'Every listed director must have a Ghana Card Number' },
        { status: 400 }
      )
    }

    const application = await prisma.businessApplication.create({
      data: {
        businessName: businessName.trim(),
        businessType: resolvedType,
        businessRegistrationNumber: businessRegistrationNumber?.trim() || null,
        businessAddress: businessAddress.trim(),
        businessPhone: businessPhone?.trim() || null,
        businessEmail: businessEmail?.trim() || null,
        gpsLatitude: gpsLatitude ?? null,
        gpsLongitude: gpsLongitude ?? null,
        directors: directorsArray,
        ownerFullName: ownerFullName.trim(),
        ownerPhone: ownerPhone.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerGhanaCardNumber: ownerGhanaCardNumber?.trim() || null,
        agentId: context!.agent.id,
      },
      include: {
        documents: true,
      },
    })

    return NextResponse.json(application, { status: 201 })
  } catch (err) {
    console.error('Business application create error:', err)
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
  }
}
