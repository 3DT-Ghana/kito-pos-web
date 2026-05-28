'use client'

import { useParams } from 'next/navigation'
import { ApplicationWizardForm } from '@/components/agent/ApplicationWizardForm'

export default function EditApplicationPage() {
  const { id } = useParams<{ id: string }>()

  return <ApplicationWizardForm mode="edit" applicationId={id} />
}
