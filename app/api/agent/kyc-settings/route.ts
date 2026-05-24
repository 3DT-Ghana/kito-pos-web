import { NextResponse } from 'next/server'
import { getGlobalKYCSettings } from '@/lib/kyc/settings'

/**
 * GET /api/agent/kyc-settings
 * Public endpoint used by the agent onboarding UI to decide which fields and
 * uploads are required at registration and application time.
 */
export async function GET() {
  const settings = await getGlobalKYCSettings()

  return NextResponse.json({
    requireBusinessRegNumber: settings.requireBusinessRegNumber,
    requireBusinessCertUpload: settings.requireBusinessCertUpload,
    requireDirectorGhanaCardNumber: settings.requireDirectorGhanaCardNumber,
    requireDirectorGhanaCardUpload: settings.requireDirectorGhanaCardUpload,
    requireAgentGhanaCardNumber: settings.requireAgentGhanaCardNumber,
    requireAgentGhanaCardUpload: settings.requireAgentGhanaCardUpload,
  })
}
