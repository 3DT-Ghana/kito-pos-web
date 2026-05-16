import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { AppLayout } from '@/components/layout/AppLayout'
import { SaleReceiptView } from './SaleReceiptView'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

/**
 * Sale Detail Page
 *
 * Shows sale details and receipt with print functionality
 */

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SaleDetailPage({ params }: PageProps) {
  const session = await getServerSession(authOptions)

  if (!session || !session.user) {
    redirect('/auth/login')
  }

  const { id } = await params
  const { user } = session

  if (!user.tenantId) {
    redirect('/agent/dashboard')
  }

  // Fetch sale with all details
  const sale = await prisma.sale.findFirst({
    where: {
      id,
      tenantId: user.tenantId,
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
        },
      },
      taxLines: true,
      items: {
        include: {
          taxLines: true,
          item: {
            include: {
              manufacturer: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!sale) {
    redirect('/sales')
  }

  // Fetch tenant settings for receipt configuration
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      id: true,
      name: true,
      phone: true,
      showManufacturerOnReceipt: true,
      receiptPrinterWidth: true,
    },
  })

  if (!tenant) {
    redirect('/dashboard')
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/sales"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sale Details</h1>
            <p className="text-gray-600 mt-1">View and print receipt</p>
          </div>
        </div>

        {/* Receipt View */}
        <SaleReceiptView sale={sale} tenant={tenant} />
      </div>
    </AppLayout>
  )
}
