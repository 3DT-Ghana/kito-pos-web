import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session?.user) {
    if (session.user.platformRole === 'SUPER_ADMIN') {
      redirect('/admin')
    }

    if (session.user.platformRole === 'AGENT') {
      redirect(session.user.agentStatus === 'PENDING' ? '/agent/profile' : '/agent/dashboard')
    }

    redirect('/dashboard')
  } else {
    redirect('/auth/login')
  }
}
