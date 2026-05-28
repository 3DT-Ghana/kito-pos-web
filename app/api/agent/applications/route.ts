import { NextResponse } from 'next/server'
import { requireApprovedAgent } from '@/lib/agent/server'
import { prisma } from '@/lib/db/prisma'
import { type Prisma } from '@prisma/client'
import { getGlobalKYCSettings } from '@/lib/kyc/settings'
import { normalizeBusinessApplicationPayload } from '@/lib/agent/businessApplications'

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

    // Fetch KYC settings — upsert guarantees a row with correct defaults always exists
    const kycSettings = await getGlobalKYCSettings()
    const normalized = normalizeBusinessApplicationPayload(body, kycSettings)
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }

    const data = normalized.data

    // Business certificate upload required only when admin has enabled that setting
    if (kycSettings.requireBusinessCertUpload) {
      // Cert is uploaded in a separate step; we can't validate the file here.
      // Flag is checked on the admin review side. No block needed at submission time.
    }

    const application = await prisma.businessApplication.create({
      data: {
        businessName: data.businessName,
        businessType: data.businessType,
        businessRegistrationNumber: data.businessRegistrationNumber,
        businessAddress: data.businessAddress,
        businessPhone: data.businessPhone,
        businessEmail: data.businessEmail,
        gpsLatitude: data.gpsLatitude,
        gpsLongitude: data.gpsLongitude,
        directors: data.directors as unknown as Prisma.InputJsonValue,
        ownerFullName: data.ownerFullName,
        ownerPhone: data.ownerPhone,
        ownerEmail: data.ownerEmail,
        ownerGhanaCardNumber: data.ownerGhanaCardNumber,
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
