import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { authOptions } from '@/lib/auth/auth'
import { requireBranchAccess } from '@/lib/branch/server'
import { getItemsCatalogData } from '@/lib/items/catalog'
import { ItemsCatalog } from './ItemsCatalog'

export default async function ItemsPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect('/auth/login')
  }

  if (!session.user.tenantId) {
    redirect('/agent/dashboard')
  }

  type ItemsCatalogData = Awaited<ReturnType<typeof getItemsCatalogData>>

  let initialItems: ItemsCatalogData['items'] = []
  let initialCategories: ItemsCatalogData['categories'] = []
  let initialBranchId: string | null = null
  let hasInitialData = false

  try {
    const { error, context } = await requireBranchAccess()

    if (!error && context) {
      const data = await getItemsCatalogData(context)
      initialItems = data.items
      initialCategories = data.categories
      initialBranchId = context.currentBranchId
      hasInitialData = true
    }
  } catch (error) {
    console.error('Failed to prefetch item catalog:', error)
  }

  return (
    <AppLayout>
      <ItemsCatalog
        initialItems={initialItems}
        initialCategories={initialCategories}
        initialBranchId={initialBranchId}
        hasInitialData={hasInitialData}
      />
    </AppLayout>
  )
}
