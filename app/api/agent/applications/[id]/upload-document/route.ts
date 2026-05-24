import { NextResponse } from 'next/server'
import { requireApprovedAgent } from '@/lib/agent/server'
import { prisma } from '@/lib/db/prisma'
import { uploadGhanaCard, getSignedUrl } from '@/lib/storage/supabase'
import { DocumentType } from '@prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

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
      return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 400 })
    }

    const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1].replace('jpeg', 'jpg')
    const timestamp = Date.now()
    const path = `businesses/${id}/${documentType.toLowerCase()}-${timestamp}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadGhanaCard(path, buffer, file.type)
    const fileUrl = await getSignedUrl(path)

    const document = await prisma.businessDocument.create({
      data: {
        applicationId: id,
        documentType: documentType as DocumentType,
        label,
        fileUrl,
      },
    })

    return NextResponse.json(document, { status: 201 })
  } catch (err) {
    console.error('Document upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
