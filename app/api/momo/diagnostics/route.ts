import { NextResponse } from 'next/server'
import { requireBranchAccess } from '@/lib/branch/server'
import { requirePermission } from '@/lib/permissions/rbac'
import { prisma } from '@/lib/db/prisma'
import { basicAuth } from '@/lib/momo/hubtelCollect'

/**
 * GET /api/momo/diagnostics
 *
 * Reports this server's outbound public IP, and whether Hubtel's hosts will
 * actually talk to it.
 *
 * Hubtel only accepts requests from whitelisted IPs, and the address that must
 * be whitelisted is the *server's* — not the till's. Without shell access to
 * the server there is otherwise no way to find it, and an unlisted IP is
 * indistinguishable from bad credentials from the operator's side: verification
 * hangs, payments fail, and nothing says why.
 *
 * Whitelisting is per service, so both hosts are probed separately — fixing one
 * and leaving the other is an easy way to spend a day confused.
 *
 * Settings-level access only. The IP is not a secret, but the reachability
 * probe spends real requests against Hubtel.
 */

const PROBE_TIMEOUT_MS = 10000

/**
 * Several independent services, because a single one being down or blocked
 * would otherwise read as "no IP found" — and this endpoint exists precisely
 * for the case where the operator cannot check by any other means.
 */
const IP_SERVICES = [
  'https://api.ipify.org',
  'https://ifconfig.me/ip',
  'https://icanhazip.com',
]

async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fn(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Outbound IP, tried in order. Any one answering is enough; the value is
 * identical whichever responds.
 */
async function outboundIp(): Promise<{ ip: string | null; source?: string; error?: string }> {
  for (const url of IP_SERVICES) {
    try {
      const text = await withTimeout(async (signal) => {
        const res = await fetch(url, { signal, cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.text()).trim()
      }, 8000)

      // Guard against a captive portal or proxy returning an HTML page.
      if (/^[0-9a-f.:]+$/i.test(text) && text.length <= 45) {
        return { ip: text, source: new URL(url).hostname }
      }
    } catch {
      // Try the next service.
    }
  }
  return {
    ip: null,
    error:
      'Could not determine the outbound IP — every lookup service was unreachable. ' +
      'This server may block outbound internet access entirely, which would also ' +
      'explain Hubtel failing.',
  }
}

type ProbeVerdict = 'reachable' | 'blocked' | 'timeout' | 'error'

interface Probe {
  service: string
  host: string
  verdict: ProbeVerdict
  detail: string
  httpStatus?: number
}

/**
 * Probe one Hubtel host with real credentials.
 *
 * The distinction that matters is *whitelisting* versus *credentials*, and the
 * HTTP status separates them: 401 means Hubtel accepted the connection and
 * rejected the login, which proves the IP is fine. A 403 or a hang is the
 * documented signature of an unlisted IP.
 */
async function probe(
  service: string,
  url: string,
  auth: string
): Promise<Probe> {
  const host = new URL(url).hostname
  try {
    const res = await withTimeout(
      (signal) =>
        fetch(url, {
          headers: { Authorization: auth, Accept: 'application/json' },
          signal,
          cache: 'no-store',
        }),
      PROBE_TIMEOUT_MS
    )

    if (res.status === 403) {
      return {
        service,
        host,
        verdict: 'blocked',
        httpStatus: 403,
        detail:
          'Hubtel refused the request. This is what an un-whitelisted IP looks like — ' +
          'ask Hubtel to add the IP above to this service.',
      }
    }

    if (res.status === 401) {
      return {
        service,
        host,
        verdict: 'reachable',
        httpStatus: 401,
        detail:
          'Hubtel accepted the connection but rejected the credentials. The IP is ' +
          'whitelisted — check the Client ID and Secret.',
      }
    }

    // Anything else — including a 404 for a probe path, or a real 200 —
    // means the request got through, which is what is being tested.
    return {
      service,
      host,
      verdict: 'reachable',
      httpStatus: res.status,
      detail: `Hubtel responded (HTTP ${res.status}). The connection is getting through.`,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        service,
        host,
        verdict: 'timeout',
        detail:
          'No response within 10 seconds. Hubtel silently drops traffic from ' +
          'un-whitelisted IPs, so this usually means the same as a refusal.',
      }
    }
    return {
      service,
      host,
      verdict: 'error',
      detail: err instanceof Error ? err.message : 'Network error',
    }
  }
}

export async function GET() {
  try {
    const { error, context } = await requireBranchAccess()
    if (error) return error

    const { authorized, error: permError } = requirePermission(context!, 'manage_settings')
    if (!authorized) return permError!

    const tenant = await prisma.tenant.findUnique({
      where: { id: context!.tenantId },
      select: {
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelCollectionAccount: true,
        hubtelCallbackUrl: true,
        enableMomoCollect: true,
      },
    })

    const { ip, source, error: ipError } = await outboundIp()

    const configured = Boolean(
      tenant?.hubtelClientId && tenant?.hubtelClientSecret && tenant?.hubtelCollectionAccount
    )

    let probes: Probe[] = []
    if (configured) {
      const auth = basicAuth(tenant!.hubtelClientId!, tenant!.hubtelClientSecret!)
      const account = encodeURIComponent(tenant!.hubtelCollectionAccount!)

      // Run both together: they are independent, and two 10s timeouts in
      // sequence is a long wait in front of a settings page.
      probes = await Promise.all([
        probe(
          'Number verification',
          `https://rnv.hubtel.com/v2/merchantaccount/merchants/${account}/mobilemoney/verify` +
            `?channel=mtn-gh&customerMsisdn=233200000000`,
          auth
        ),
        probe(
          'Payment status',
          `https://api-txnstatus.hubtel.com/transactions/${account}/status` +
            `?clientReference=DIAGNOSTIC-PROBE`,
          auth
        ),
        // The host that actually takes payments, and the one that was missing
        // here while collect failed — verification passing on rnv says nothing
        // about rmp, because whitelisting and scopes are both per service.
        // GET on a POST-only path: a 404/405 still proves auth and routing work
        // without sending anyone a real payment prompt.
        probe(
          'Receive money (payments)',
          `https://rmp.hubtel.com/merchantaccount/merchants/${account}/receive/mobilemoney`,
          auth
        ),
      ])
    }

    return NextResponse.json({
      ip,
      ipSource: source,
      ipError,
      configured,
      settings: {
        clientIdSet: Boolean(tenant?.hubtelClientId),
        clientSecretSet: Boolean(tenant?.hubtelClientSecret),
        collectionAccount: tenant?.hubtelCollectionAccount ?? null,
        callbackUrl: tenant?.hubtelCallbackUrl ?? null,
        momoCollectEnabled: Boolean(tenant?.enableMomoCollect),
      },
      probes,
    })
  } catch (err) {
    console.error('MoMo diagnostics error:', err)
    return NextResponse.json({ error: 'Diagnostics failed to run.' }, { status: 500 })
  }
}
