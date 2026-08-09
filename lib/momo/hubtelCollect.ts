import type { MomoChannel } from './hubtelVerify'

/**
 * Hubtel Direct Receive Money — MoMo payment prompts.
 *
 * The customer receives a prompt on their phone and approves with their PIN.
 * The flow is asynchronous: the initial response only confirms the prompt was
 * sent, and the final outcome arrives by callback (or, failing that, by a
 * status check five minutes later).
 *
 * Docs: developers.hubtel.com → Payment APIs → Direct Receive Money
 *   POST https://rmp.hubtel.com/merchantaccount/merchants/{account}/receive/mobilemoney
 *   GET  https://api-txnstatus.hubtel.com/transactions/{account}/status?clientReference=…
 *
 * This replaced api.hubtel.com/v2/merchant/pay, which now returns a 404 HTML
 * page — the app posted there, could not parse the response as JSON, and every
 * MoMo sale failed with a 502.
 *
 * Hubtel requires the *server's* public IP to be whitelisted. An unlisted
 * source gets a 403 or, more often, a silent timeout.
 */

const RECEIVE_HOST = 'https://rmp.hubtel.com'
const STATUS_HOST = 'https://api-txnstatus.hubtel.com'

// A prompt can sit unanswered for a while, but the *request* to send it should
// not hang — the customer is waiting at the counter.
const TIMEOUT_MS = 20000

export interface HubtelCollectConfig {
  clientId: string
  clientSecret: string
  /** Hubtel Collection Account Number, e.g. "2036850". Required in the path. */
  collectionAccount: string
  /**
   * Where Hubtel reports the final outcome. Mandatory per the API — the
   * initial response is only ever "pending", so without this there is no
   * reliable way to learn a payment succeeded.
   */
  callbackUrl?: string | null
}

export interface MomoCollectRequest {
  amount: number
  phoneNumber: string        // customer's MoMo number e.g. 0244123456
  channel: MomoChannel       // mtn-gh | vodafone-gh | tigo-gh
  description: string        // shown to the customer
  clientReference: string    // unique per transaction, max 36 chars
  customerName?: string
}

export interface MomoCollectResult {
  success: boolean
  transactionId?: string
  /** 'pending' is the expected outcome — the customer has yet to approve. */
  status?: 'pending' | 'success'
  error?: string
}

export interface MomoStatusResult {
  success: boolean
  status?: 'pending' | 'success' | 'failed'
  error?: string
}

/**
 * Ghana MSISDN in the form Hubtel expects. Shared with the Verification API,
 * which documents the same accepted formats (0XXXXXXXXX / 233XXXXXXXXX).
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('233') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return '233' + digits.slice(1)
  if (digits.length === 9) return '233' + digits
  return null
}

/** Hubtel authenticates every API in this family with the same Basic scheme. */
export function basicAuth(clientId: string, clientSecret: string): string {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

/**
 * Hubtel returns an HTML error page for a bad path or an unlisted IP, so a
 * blind res.json() throws a parse error that tells the operator nothing. This
 * reports what actually happened instead.
 */
async function readJson(res: Response): Promise<{ data: unknown; error?: string }> {
  const text = await res.text()
  try {
    return { data: JSON.parse(text) }
  } catch {
    return {
      data: null,
      error:
        res.status === 403
          ? 'Hubtel refused the request — this server’s IP is probably not whitelisted.'
          : `Hubtel returned an unexpected response (HTTP ${res.status}).`,
    }
  }
}

/**
 * Turn a Hubtel failure into something the person at the till can act on.
 *
 * Hubtel's messages are written for whoever integrated the API, not for a
 * cashier with a customer waiting — "Supplied API keys does not have
 * mobilemoney-receive-direct in scopes" is accurate and useless at a counter.
 * Their own docs pair each code with a required action; this carries that
 * across, and keeps the original text so the detail is not lost.
 *
 * Codes from the Sales API reference.
 */
function explainFailure(
  code: string | undefined,
  message: string | undefined,
  httpStatus: number
): string {
  const detail = message?.trim()

  switch (code) {
    case '4101':
      // Either the account is not set up to receive, or the keys belong to a
      // different merchant than the one in the URL path. Both need Hubtel.
      return (
        'This business is not set up to receive mobile money payments yet. ' +
        'Ask your Hubtel Retail Systems Engineer to enable the Receive Money ' +
        'scope on your API keys, and check the Collection Account Number in ' +
        'Settings → SMS.' + (detail ? ` (Hubtel: ${detail})` : '')
      )
    case '4103':
      return (
        'Your Hubtel account is not allowed to take payments on this network. ' +
        'Contact your Retail Systems Engineer.' + (detail ? ` (Hubtel: ${detail})` : '')
      )
    case '4070':
      return (
        'Hubtel could not price this transaction — the amount may be below ' +
        'their minimum, or fees are not set up for this account.' +
        (detail ? ` (Hubtel: ${detail})` : '')
      )
    case '2001':
      // The customer-facing failure: insufficient funds, wrong network for the
      // number, a timed-out USSD session.
      return (
        detail ||
        'The payment did not go through. The customer may have insufficient ' +
        'funds, or the number may not match the network selected.'
      )
    case '4000':
      return `Hubtel rejected the request details. ${detail ?? ''}`.trim()
    default:
      return detail || `Payment request failed (${code ?? httpStatus}).`
  }
}

/**
 * Send a MoMo payment prompt.
 *
 * A `0001` response is success: the prompt has been sent and the customer has
 * yet to approve. Treating anything but `0000` as failure — as the previous
 * version did — would have reported every real payment as failed.
 */
export async function sendMomoCollect(
  config: HubtelCollectConfig,
  req: MomoCollectRequest
): Promise<MomoCollectResult> {
  const phone = normalisePhone(req.phoneNumber)
  if (!phone) {
    return { success: false, error: `Invalid phone number: ${req.phoneNumber}` }
  }
  if (!config.collectionAccount) {
    return {
      success: false,
      error: 'No Hubtel Collection Account Number is set. Add it in Settings → SMS.',
    }
  }
  if (!config.callbackUrl?.trim()) {
    return {
      success: false,
      error:
        'No payment callback URL is set. Hubtel requires one to report the payment outcome — add it in Settings → SMS.',
    }
  }
  // Hubtel caps this at 36 characters and requires it to be unique per
  // transaction; a duplicate is rejected outright.
  if (req.clientReference.length > 36) {
    return { success: false, error: 'Payment reference is too long (max 36 characters).' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(
      `${RECEIVE_HOST}/merchantaccount/merchants/${encodeURIComponent(config.collectionAccount)}/receive/mobilemoney`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuth(config.clientId, config.clientSecret),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          CustomerName: req.customerName || undefined,
          CustomerMsisdn: phone,
          Channel: req.channel,
          // Hubtel allows 2 decimal places only.
          Amount: Number(req.amount.toFixed(2)),
          // Hubtel's own docs disagree with themselves here: the parameter
          // table says PrimaryCallbackURL, the sample request says
          // PrimaryCallbackUrl. Send both — an unread extra key is ignored,
          // whereas guessing wrong means the request arrives with no callback
          // on an API where the callback is mandatory.
          PrimaryCallbackUrl: config.callbackUrl.trim(),
          PrimaryCallbackURL: config.callbackUrl.trim(),
          Description: req.description,
          ClientReference: req.clientReference,
        }),
        signal: controller.signal,
      }
    )

    const { data, error } = await readJson(res)
    if (error) return { success: false, error }

    const body = data as {
      ResponseCode?: string
      Message?: string
      Data?: { TransactionId?: string }
    }

    // 0000 = already settled, 0001 = prompt sent, awaiting the customer.
    if (body?.ResponseCode !== '0000' && body?.ResponseCode !== '0001') {
      return {
        success: false,
        error: explainFailure(body?.ResponseCode, body?.Message, res.status),
      }
    }

    return {
      success: true,
      transactionId: body?.Data?.TransactionId,
      status: body.ResponseCode === '0000' ? 'success' : 'pending',
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: 'Hubtel did not respond. Check the connection and try again.' }
    }
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Check a transaction's status.
 *
 * Hubtel treats this as the fallback for when a callback has not arrived
 * within five minutes, not the primary path — the callback is. It is keyed by
 * our own clientReference rather than Hubtel's transaction id.
 */
export async function getMomoStatus(
  config: HubtelCollectConfig,
  clientReference: string
): Promise<MomoStatusResult> {
  if (!config.collectionAccount) {
    return { success: false, error: 'No Hubtel Collection Account Number is set.' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(
      `${STATUS_HOST}/transactions/${encodeURIComponent(config.collectionAccount)}/status` +
        `?clientReference=${encodeURIComponent(clientReference)}`,
      {
        headers: {
          Authorization: basicAuth(config.clientId, config.clientSecret),
          Accept: 'application/json',
        },
        signal: controller.signal,
      }
    )

    const { data, error } = await readJson(res)
    if (error) return { success: false, error }

    type StatusEntry = { Status?: string; status?: string }
    const body = data as {
      ResponseCode?: string
      responseCode?: string
      Data?: StatusEntry | StatusEntry[]
      data?: StatusEntry | StatusEntry[]
    }

    // Casing differs across Hubtel's APIs — the Receive Money response is
    // PascalCase, the status response in the same reference is camelCase. Read
    // either, or a working payment reads as undefined and polls until timeout.
    // Data has also come back as a single-element array rather than an object.
    const container = body?.Data ?? body?.data
    const entry = Array.isArray(container) ? container[0] : container
    const raw = (entry?.Status ?? entry?.status ?? '').toLowerCase()

    const status: MomoStatusResult['status'] =
      raw === 'paid' || raw === 'success' || raw === 'successful'
        ? 'success'
        : // "Unpaid" is Hubtel's documented terminal decline, and "Refunded"
          // means the money went back — neither should keep the till waiting.
          raw === 'failed' ||
            raw === 'unpaid' ||
            raw === 'refunded' ||
            raw === 'cancelled' ||
            raw === 'expired'
          ? 'failed'
          : 'pending'

    return { success: true, status }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: 'Status check timed out.' }
    }
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  } finally {
    clearTimeout(timer)
  }
}
