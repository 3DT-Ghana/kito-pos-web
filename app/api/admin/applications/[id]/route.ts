import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin/server'
import { prisma } from '@/lib/db/prisma'
import { hash } from 'bcryptjs'
import { randomBytes } from 'crypto'
import { sendMail } from '@/lib/email/mailer'
import {
  createTenantWithOwner,
  OwnerEmailConflictError,
} from '@/lib/tenant/onboarding'
import {
  getGlobalKYCSettings,
  getMissingBusinessApplicationKYCRequirements,
} from '@/lib/kyc/settings'

interface RouteParams {
  params: Promise<{ id: string }>
}

function buildOwnerWelcomeEmail(params: {
  businessName: string
  ownerName: string
  ownerEmail: string
  tempPassword: string
}) {
  const loginUrl = process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL.replace(/\/$/, '')}/auth/login`
    : '/auth/login'

  return {
    html: `
      <p>Hello ${params.ownerName},</p>
      <p>Your business account for <strong>${params.businessName}</strong> has been approved.</p>
      <p>You can sign in with:</p>
      <ul>
        <li>Email: <strong>${params.ownerEmail}</strong></li>
        <li>Temporary password: <strong>${params.tempPassword}</strong></li>
      </ul>
      <p>Sign in here: <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Please change your password after your first login.</p>
    `,
    text: [
      `Hello ${params.ownerName},`,
      '',
      `Your business account for ${params.businessName} has been approved.`,
      'You can sign in with:',
      `Email: ${params.ownerEmail}`,
      `Temporary password: ${params.tempPassword}`,
      `Sign in: ${loginUrl}`,
      '',
      'Please change your password after your first login.',
    ].join('\n'),
  }
}

/**
 * GET /api/admin/applications/[id]
 * Get a single business application with agent info.
 *
 * PATCH /api/admin/applications/[id]
 * Approve or reject a business application.
 * Body: { action: 'approve' | 'reject', rejectionReason?: string, approvalNote?: string }
 *
 * On approve (atomic transaction):
 *   1. Create Tenant (TRIAL status)
 *   2. Create default Branch
 *   3. Create owner User (OWNER role, temp password)
 *   4. Mark application APPROVED, link tenantId
 *   5. Log to PlatformAuditLog
 */

export async function GET(req: Request, { params }: RouteParams) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  const application = await prisma.businessApplication.findUnique({
    where: { id },
    include: {
      agent: {
        select: { id: true, agentCode: true, fullName: true, email: true, phone: true },
      },
      documents: {
        orderBy: { uploadedAt: 'desc' },
      },
    },
  })

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  return NextResponse.json(application)
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { error, context } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  try {
    const body = await req.json()
    const { action, rejectionReason, approvalNote } = body
    const trimmedRejectionReason =
      typeof rejectionReason === 'string' ? rejectionReason.trim() : ''
    const trimmedApprovalNote =
      typeof approvalNote === 'string' ? approvalNote.trim() : ''

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    if (action === 'reject' && !trimmedRejectionReason) {
      return NextResponse.json(
        { error: 'Rejection reason is required when rejecting an application' },
        { status: 400 }
      )
    }

    const application = await prisma.businessApplication.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, agentCode: true } },
        documents: { select: { documentType: true } },
      },
    })

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    if (application.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Application is already ${application.status.toLowerCase()}` },
        { status: 409 }
      )
    }

    if (action === 'reject') {
      await prisma.businessApplication.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: trimmedRejectionReason,
          approvalNote: null,
          reviewedById: context!.email,
          reviewedAt: new Date(),
        },
      })

      await prisma.platformAuditLog.create({
        data: {
          actorEmail: context!.email,
          action: 'application.rejected',
          entity: 'BusinessApplication',
          entityId: id,
          details: {
            businessName: application.businessName,
            rejectionReason: trimmedRejectionReason,
          },
        },
      })

      return NextResponse.json({ rejected: true, applicationId: id })
    }

    // ── APPROVE ──────────────────────────────────────────────────────────────
    const kycSettings = await getGlobalKYCSettings()
    const missingKYC = getMissingBusinessApplicationKYCRequirements(
      kycSettings,
      application
    )

    if (missingKYC.length > 0) {
      return NextResponse.json(
        {
          error: `Application cannot be approved until the following KYC requirements are met: ${missingKYC.join(', ')}.`,
        },
        { status: 409 }
      )
    }

    const tempPassword = randomBytes(12).toString('base64url')
    const passwordHash = await hash(tempPassword, 12)

    const result = await prisma.$transaction(async (tx) => {
      const { tenant, owner } = await createTenantWithOwner(tx, {
        businessName: application.businessName,
        ownerName: application.ownerFullName,
        ownerEmail: application.ownerEmail,
        passwordHash,
        agentId: application.agentId,
        branchAddress: application.businessAddress,
      })

      await tx.businessApplication.update({
        where: { id },
        data: {
          status: 'APPROVED',
          tenantId: tenant.id,
          rejectionReason: null,
          approvalNote: trimmedApprovalNote || null,
          reviewedById: context!.email,
          reviewedAt: new Date(),
        },
      })

      return { tenant, owner }
    })

    const welcomeEmail = buildOwnerWelcomeEmail({
      businessName: application.businessName,
      ownerName: application.ownerFullName,
      ownerEmail: application.ownerEmail,
      tempPassword,
    })

    const ownerNotified = await sendMail({
      to: application.ownerEmail,
      subject: `${application.businessName} account approved`,
      html: welcomeEmail.html,
      text: welcomeEmail.text,
    })

    await prisma.platformAuditLog.create({
      data: {
        actorEmail: context!.email,
        action: 'application.approved',
        entity: 'BusinessApplication',
        entityId: id,
        details: {
          businessName: application.businessName,
          tenantId: result.tenant.id,
          ownerEmail: application.ownerEmail,
          agentCode: application.agent.agentCode,
          approvalNote: trimmedApprovalNote || null,
          ownerNotified,
        },
      },
    })

    return NextResponse.json({
      approved: true,
      applicationId: id,
      tenantId: result.tenant.id,
      ownerNotified,
      ...(ownerNotified ? {} : { tempPassword }),
    })
  } catch (err) {
    if (err instanceof OwnerEmailConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }

    console.error('Application review error:', err)
    const message = err instanceof Error ? err.message : 'Failed to process application'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
