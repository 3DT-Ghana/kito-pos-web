import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

function applySecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return response
}

/**
 * Global Proxy Configuration
 *
 * Automatically protects routes and enforces authentication
 *
 * Features:
 * - Blocks unauthenticated access to protected routes
 * - Redirects to login page when not authenticated
 * - Logs requests in development mode
 * - Adds security headers
 *
 * Protected Routes:
 * - /dashboard/** - Main application
 * - /sales/** - Sales management
 * - /purchases/** - Purchase management
 * - /items/** - Inventory management
 * - /customers/** - Customer management
 * - /suppliers/** - Supplier management
 * - /payments/** - Payment tracking
 * - /returns/** - Returns management
 * - /reports/** - Reports and analytics
 * - /settings/** - Settings
 * - /api/** - All API routes (except /api/auth/**)
 */

export default withAuth(
  function proxy(req) {
    const token = req.nextauth.token
    const { pathname } = req.nextUrl
    const isApi = pathname.startsWith('/api/')
    const isAuthApi = pathname.startsWith('/api/auth/')
    const isPublicApi =
      isAuthApi ||
      pathname.startsWith('/api/tenants') ||
      pathname.startsWith('/api/agent/register') ||
      // session-settings GET is read by useIdleTimeout on every authenticated page
      // — it must be accessible without a super-admin token
      (pathname === '/api/admin/session-settings' && req.method === 'GET')
    const isSuperAdmin = token?.platformRole === 'SUPER_ADMIN'
    const isAdminPage = pathname.startsWith('/admin')
    const isAdminApi = pathname.startsWith('/api/admin/')
    const isAgentPage = pathname.startsWith('/agent')
    const isAgentApi = pathname.startsWith('/api/agent/')
    const isPublicAgentPage =
      pathname === '/agent/login' || pathname === '/agent/register'
    const isBlockedAgent =
      token?.platformRole === 'AGENT' &&
      ['SUSPENDED', 'REJECTED', 'REVOKED'].includes(String(token.agentStatus))
    const isPendingAgent =
      token?.platformRole === 'AGENT' && token.agentStatus === 'PENDING'
    const defaultAgentDestination = isPendingAgent
      ? '/agent/profile'
      : '/agent/dashboard'

    // Log requests in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`, {
        user: token?.email,
        role: token?.role,
        tenantId: token?.tenantId,
      })
    }

    if (isApi && !isPublicApi) {
      if (!token) {
        return applySecurityHeaders(
          NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        )
      }

      if (isAdminApi) {
        if (!isSuperAdmin) {
          return applySecurityHeaders(
            NextResponse.json(
              { error: 'Forbidden — super admin access required' },
              { status: 403 }
            )
          )
        }

        return applySecurityHeaders(NextResponse.next())
      }

      if (isAgentApi) {
        if (token.platformRole !== 'AGENT') {
          return applySecurityHeaders(
            NextResponse.json(
              { error: 'Forbidden — agent access required' },
              { status: 403 }
            )
          )
        }

        if (isBlockedAgent) {
          return applySecurityHeaders(
            NextResponse.json(
              { error: 'Agent account is not allowed to access this resource' },
              { status: 403 }
            )
          )
        }

        return applySecurityHeaders(NextResponse.next())
      }

      if (token.platformRole === 'AGENT') {
        return applySecurityHeaders(
          NextResponse.json(
            { error: 'Agent accounts cannot access tenant APIs' },
            { status: 403 }
          )
        )
      }

      if (token.platformRole === 'SUPER_ADMIN') {
        return applySecurityHeaders(
          NextResponse.json(
            { error: 'Super admin accounts cannot access tenant APIs' },
            { status: 403 }
          )
        )
      }

      if (!token.tenantId) {
        return applySecurityHeaders(
          NextResponse.json(
            { error: 'No tenant associated with your account. Please sign in again.' },
            { status: 403 }
          )
        )
      }

      return applySecurityHeaders(NextResponse.next())
    }

    // Super admin: allow /admin/* and /api/admin/*, block everything else
    if (isSuperAdmin) {
      if (isAdminPage || isAdminApi) {
        return applySecurityHeaders(NextResponse.next())
      }
      // Super admin hitting the tenant app — redirect to the admin portal
      if (!pathname.startsWith('/auth/') && !pathname.startsWith('/api/auth/')) {
        return applySecurityHeaders(
          NextResponse.redirect(new URL('/admin', req.url))
        )
      }
      return applySecurityHeaders(NextResponse.next())
    }

    if (isPublicAgentPage && token?.platformRole === 'AGENT' && !isBlockedAgent) {
      return applySecurityHeaders(
        NextResponse.redirect(new URL(defaultAgentDestination, req.url))
      )
    }

    if (isAgentPage && !isPublicAgentPage) {
      if (!token) {
        return applySecurityHeaders(
          NextResponse.redirect(new URL('/agent/login', req.url))
        )
      }

      if (token.platformRole !== 'AGENT') {
        return applySecurityHeaders(
          NextResponse.redirect(new URL('/dashboard', req.url))
        )
      }

      if (isBlockedAgent) {
        return applySecurityHeaders(
          NextResponse.redirect(new URL('/agent/login', req.url))
        )
      }

      if (isPendingAgent && pathname !== '/agent/profile') {
        return applySecurityHeaders(
          NextResponse.redirect(new URL('/agent/profile', req.url))
        )
      }
    }

    if (isAgentApi) {
      return applySecurityHeaders(NextResponse.next())
    }

    if (!isAgentPage && token?.platformRole === 'AGENT') {
      if (pathname.startsWith('/api/')) {
        return applySecurityHeaders(
          NextResponse.json(
            { error: 'Agent accounts cannot access tenant APIs' },
            { status: 403 }
          )
        )
      }

      if (isBlockedAgent) {
        return applySecurityHeaders(
          NextResponse.redirect(new URL('/agent/login', req.url))
        )
      }

      return applySecurityHeaders(
        NextResponse.redirect(new URL(defaultAgentDestination, req.url))
      )
    }

    return applySecurityHeaders(NextResponse.next())
  },
  {
    callbacks: {
      /**
       * Authorization callback
       * Returns true if user is authorized to access the route
       */
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl

        // Allow public routes (login, register, onboarding, etc.)
        if (
          pathname.startsWith('/auth/') ||
          pathname.startsWith('/agent/login') ||
          pathname.startsWith('/agent/register') ||
          pathname.startsWith('/onboarding') ||
          pathname.startsWith('/api/tenants') ||
          pathname.startsWith('/api/agent/register')
        ) {
          return true
        }

        if (pathname.startsWith('/agent') || pathname.startsWith('/api/agent/')) {
          return true
        }

        if (pathname.startsWith('/api/')) {
          return true
        }

        // Require authentication for all other routes
        if (!token) {
          return false
        }

        if (token.platformRole === 'AGENT' || token.platformRole === 'SUPER_ADMIN') {
          return true
        }

        // Check if user has a tenant associated
        if (!token.tenantId) {
          console.warn(
            `User ${token.email} authenticated but has no tenantId`
          )
          return false
        }

        // User is authenticated and has a tenant
        return true
      },
    },
    pages: {
      signIn: '/auth/login',
      error: '/auth/error',
    },
  }
)

/**
 * Proxy Configuration
 *
 * Defines which routes the middleware should run on
 * Uses Next.js matcher pattern
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - /auth/login (login page)
     * - /auth/register (registration page)
     * - /api/auth/** (NextAuth API routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|public/).*)',
  ],
}
