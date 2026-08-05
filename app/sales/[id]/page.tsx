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

  // Sale.branchId is a plain column with no relation, so the name is looked up
  // separately. It goes on the receipt: with three branches trading, a customer
  // returning goods needs to show which one sold them.
  const branch = sale.branchId
    ? await prisma.branch.findUnique({
        where: { id: sale.branchId },
        select: { name: true },
      })
    : null

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
            className="p-2 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sale Details</h1>
            <p className="text-gray-600 mt-1">View and print receipt</p>
          </div>
        </div>

        {/* A pending sale has not deducted stock or taken money yet — printing a
            receipt for it would hand the customer proof of an uncommitted sale. */}
        {sale.approvalStatus === 'PENDING' ? (
          <div className="bg-amber-50 border-2 border-amber-200 p-6 text-center space-y-3">
            <p className="text-4xl">⏳</p>
            <p className="text-lg font-bold text-amber-900">Awaiting manager approval</p>
            <p className="text-sm text-amber-700 max-w-md mx-auto">
              This sale has not been completed yet. Stock has not been deducted and no
              payment has been recorded. The receipt becomes available once a manager
              approves it on the Approvals page.
            </p>
            <Link
              href="/approvals"
              className="inline-block px-5 py-2.5 bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700"
            >
              Go to Approvals
            </Link>
          </div>
        ) : sale.approvalStatus === 'REJECTED' ? (
          <div className="bg-red-50 border-2 border-red-200 p-6 text-center space-y-2">
            <p className="text-4xl">✗</p>
            <p className="text-lg font-bold text-red-900">This sale was rejected</p>
            <p className="text-sm text-red-700">
              A manager rejected this transaction, so no receipt is available.
            </p>
          </div>
        ) : (
          <SaleReceiptView sale={sale} tenant={tenant} branchName={branch?.name ?? null} />
        )}
      </div>
    </AppLayout>
  )
}
