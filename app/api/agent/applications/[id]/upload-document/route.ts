import { NextResponse } from 'next/server'
import { requireApprovedAgent } from '@/lib/agent/server'
import { prisma } from '@/lib/db/prisma'
import { uploadDocument, deleteStoredFile } from '@/lib/storage'
import { DocumentType } from '@prisma/client'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/lib/storage/limits'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
// See lib/storage/limits.ts — capped below Vercel's ~4.5 MB request body limit.
const MAX_SIZE = MAX_UPLOAD_BYTES

/**
 * POST /api/agent/applications/[id]/upload-document
 * Upload a KYC document (business certificate, Ghana card, etc.) for a business application.
 * Accepts multipart/form-data: file, documentType (DocumentType enum), label?
 *
 * Can only be called on PENDING applications belonging to the agent.
 */
export async function POST(req: Request, { params }: RouteParams) {
  const { context, error } = await requireApprovedAgent()
  if (error) return error

  try {
    const { id } = await params

    const application = await prisma.businessApplication.findFirst({
      where: { id, agentId: context!.agent.id },
    })

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    if (application.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Documents can only be uploaded for pending applications' },
        { status: 409 }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const documentType = formData.get('documentType') as string | null
    const label = (formData.get('label') as string | null)?.trim() || null

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    const validDocTypes = Object.values(DocumentType) as string[]
    if (!documentType || !validDocTypes.includes(documentType)) {
      return NextResponse.json(
        { error: `documentType must be one of: ${validDocTypes.join(', ')}` },
        { status: 400 }
      )
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File must be a JPEG, PNG, WebP image or PDF' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `File must be under ${MAX_UPLOAD_LABEL}` }, { status: 400 })
    }

    const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1].replace('jpeg', 'jpg')
    const timestamp = Date.now()
    const key = `businesses/${id}/${documentType.toLowerCase()}-${timestamp}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileUrl = await uploadDocument(key, buffer, file.type)

    const existingDocuments = await prisma.businessDocument.findMany({
      where: {
        applicationId: id,
        documentType: documentType as DocumentType,
      },
      select: {
        id: true,
        fileUrl: true,
      },
    })

    const document = await prisma.$transaction(async (tx) => {
      if (existingDocuments.length > 0) {
        await tx.businessDocument.deleteMany({
          where: {
            id: { in: existingDocuments.map((existing) => existing.id) },
          },
        })
      }

      return tx.businessDocument.create({
        data: {
          applicationId: id,
          documentType: documentType as DocumentType,
          label,
          fileUrl,
        },
      })
    })

    for (const existingDocument of existingDocuments) {
      try {
        await deleteStoredFile(existingDocument.fileUrl)
      } catch (storageError) {
        console.error('Failed to delete replaced application document from storage:', storageError)
      }
    }

    return NextResponse.json(document, { status: 201 })
  } catch (err) {
    console.error('Document upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
