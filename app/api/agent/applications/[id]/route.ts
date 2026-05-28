import { NextResponse } from 'next/server'
import { type Prisma } from '@prisma/client'
import { requireApprovedAgent } from '@/lib/agent/server'
import { prisma } from '@/lib/db/prisma'
import { getGlobalKYCSettings } from '@/lib/kyc/settings'
import { normalizeBusinessApplicationPayload } from '@/lib/agent/businessApplications'
import { deleteStoredFileBySignedUrl } from '@/lib/storage/supabase'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/agent/applications/[id]
 * Get a single business application belonging to the authenticated agent.
 */
export async function GET(req: Request, { params }: RouteParams) {
  const { context, error } = await requireApprovedAgent()
  if (error) return error

  const { id } = await params

  const application = await prisma.businessApplication.findFirst({
    where: { id, agentId: context!.agent.id },
    include: {
      documents: {
        select: {
          id: true,
          documentType: true,
          label: true,
          fileUrl: true,
          uploadedAt: true,
        },
        orderBy: { uploadedAt: 'desc' },
      },
    },
  })

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  return NextResponse.json(application)
}

/**
 * PUT /api/agent/applications/[id]
 * Edit a rejected application belonging to the authenticated agent and
 * resubmit it for review by resetting it back to PENDING.
 */
export async function PUT(req: Request, { params }: RouteParams) {
  const { context, error } = await requireApprovedAgent()
  if (error) return error

  try {
    const { id } = await params
    const application = await prisma.businessApplication.findFirst({
      where: { id, agentId: context!.agent.id },
      select: {
        id: true,
        status: true,
        tenantId: true,
        gpsLatitude: true,
        gpsLongitude: true,
      },
    })

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    if (application.status !== 'REJECTED') {
      return NextResponse.json(
        { error: 'Only rejected applications can be edited' },
        { status: 409 }
      )
    }

    if (application.tenantId) {
      return NextResponse.json(
        { error: 'Approved applications cannot be edited from the agent portal' },
        { status: 409 }
      )
    }

    const body = await req.json()
    const kycSettings = await getGlobalKYCSettings()
    const normalized = normalizeBusinessApplicationPayload(body, kycSettings)

    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }

    const data = normalized.data

    const updatedApplication = await prisma.businessApplication.update({
      where: { id },
      data: {
        businessName: data.businessName,
        businessType: data.businessType,
        businessRegistrationNumber: data.businessRegistrationNumber,
        businessAddress: data.businessAddress,
        businessPhone: data.businessPhone,
        businessEmail: data.businessEmail,
        gpsLatitude: Object.prototype.hasOwnProperty.call(body, 'gpsLatitude')
          ? data.gpsLatitude
          : application.gpsLatitude,
        gpsLongitude: Object.prototype.hasOwnProperty.call(body, 'gpsLongitude')
          ? data.gpsLongitude
          : application.gpsLongitude,
        directors: data.directors as unknown as Prisma.InputJsonValue,
        ownerFullName: data.ownerFullName,
        ownerPhone: data.ownerPhone,
        ownerEmail: data.ownerEmail,
        ownerGhanaCardNumber: data.ownerGhanaCardNumber,
        status: 'PENDING',
        rejectionReason: null,
        approvalNote: null,
        reviewedById: null,
        reviewedAt: null,
      },
      include: {
        documents: {
          select: {
            id: true,
            documentType: true,
            label: true,
            fileUrl: true,
            uploadedAt: true,
          },
          orderBy: { uploadedAt: 'desc' },
        },
      },
    })

    return NextResponse.json(updatedApplication)
  } catch (err) {
    console.error('Business application update error:', err)
    return NextResponse.json(
      { error: 'Failed to update application' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/agent/applications/[id]
 * Delete a rejected application belonging to the authenticated agent.
 */
export async function DELETE(req: Request, { params }: RouteParams) {
  const { context, error } = await requireApprovedAgent()
  if (error) return error

  try {
    const { id } = await params
    const application = await prisma.businessApplication.findFirst({
      where: { id, agentId: context!.agent.id },
      include: {
        documents: {
          select: {
            fileUrl: true,
          },
        },
      },
    })

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    if (application.status !== 'REJECTED') {
      return NextResponse.json(
        { error: 'Only rejected applications can be deleted' },
        { status: 409 }
      )
    }

    if (application.tenantId) {
      return NextResponse.json(
        { error: 'Approved applications cannot be deleted from the agent portal' },
        { status: 409 }
      )
    }

    await prisma.businessApplication.delete({
      where: { id: application.id },
    })

    for (const document of application.documents) {
      try {
        await deleteStoredFileBySignedUrl(document.fileUrl)
      } catch (storageError) {
        console.error('Failed to delete application document from storage:', storageError)
      }
    }

    return NextResponse.json({ deleted: true, applicationId: application.id })
  } catch (err) {
    console.error('Business application delete error:', err)
    return NextResponse.json(
      { error: 'Failed to delete application' },
      { status: 500 }
    )
  }
}
