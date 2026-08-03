'use client'

// QZ Tray is a desktop bridge app that enables silent printing from the browser.
// Download: https://qz.io/download/
// It must be running on the customer's machine for silent printing to work.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qz: any
  }
}

let qzLoaded = false

async function loadQZ(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (window.qz) return true
  if (qzLoaded) return !!window.qz

  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = '/qz-tray.js'
    script.onload = () => { qzLoaded = true; resolve(!!window.qz) }
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
}

export async function isQZAvailable(): Promise<boolean> {
  try {
    const loaded = await loadQZ()
    if (!loaded) return false
    await window.qz.websocket.connect({ retries: 1, delay: 0.5 })
    return window.qz.websocket.isActive()
  } catch {
    return false
  }
}

export type PrinterLookup = {
  printers: string[]
  /** Null on success; otherwise a message naming the actual cause. */
  error?: string
}

/**
 * Detect printers, reporting *why* detection failed.
 *
 * Previously every failure was swallowed into an empty array, so "QZ is not
 * running", "the browser blocked the socket", and "this PC genuinely has no
 * printers" were indistinguishable — and the UI blamed the install in all
 * three cases.
 */
export async function findPrinters(): Promise<PrinterLookup> {
  if (typeof window === 'undefined') return { printers: [] }

  const loaded = await loadQZ()
  if (!loaded) {
    return { printers: [], error: 'Could not load the QZ Tray script (/qz-tray.js) from this site.' }
  }

  if (!window.qz.websocket.isActive()) {
    try {
      await window.qz.websocket.connect({ retries: 2, delay: 1 })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err ?? '')
      // QZ listens on wss://localhost:8181. An https:// page cannot fall back
      // to the insecure ws:// port, and wss:// needs QZ's self-signed
      // certificate trusted, so a running QZ still refuses the socket.
      const isSecurePage =
        window.location.protocol === 'https:' && window.location.hostname !== 'localhost'
      // "blocked by client" means something on this machine refused the socket
      // rather than QZ rejecting it — an extension or a browser policy on
      // reaching localhost from a public site. Certificate trust produces a
      // different failure, so do not send people down that path twice.
      const blockedByClient = /blocked by client|ERR_BLOCKED|NetworkError/i.test(detail)

      return {
        printers: [],
        error: blockedByClient
          ? `The browser on this computer blocked the connection to QZ Tray (${detail}). QZ Tray itself is reachable, so this is usually an ad-blocker, privacy or endpoint-security extension intercepting local connections — try again in a private window with extensions disabled. If that works, allow ${window.location.host} in the extension. Chrome and Edge may also block a public site from reaching localhost: check chrome://flags for "Private Network Access" restrictions.`
          : isSecurePage
            ? `Could not reach QZ Tray from ${window.location.host}. It runs locally on wss://localhost:8181, and this page is HTTPS, so the browser must trust QZ Tray's certificate. Open https://localhost:8181 once and accept it, then try again. (${detail})`
            : `Could not connect to QZ Tray. Check that it is running — its icon should be in the system tray. (${detail})`,
      }
    }
  }

  try {
    const printers = await window.qz.printers.find()
    const list = Array.isArray(printers) ? printers : printers ? [printers] : []
    if (list.length === 0) {
      return {
        printers: [],
        error: 'QZ Tray is connected but reported no printers. Check that the printer is installed in the operating system.',
      }
    }
    return { printers: list }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err ?? '')
    return {
      printers: [],
      // An unsigned request pops an "Allow" prompt in QZ; denying or ignoring
      // it surfaces here rather than as a connection failure.
      error: `QZ Tray connected but refused the printer list. If a QZ Tray prompt appeared, choose Allow (and "Remember"). (${detail})`,
    }
  }
}

/** Back-compat wrapper — callers that only need the names. */
export async function getAvailablePrinters(): Promise<string[]> {
  const { printers } = await findPrinters()
  return printers
}

export async function printHTMLToQZ(
  printerName: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const loaded = await loadQZ()
    if (!loaded) return { success: false, error: 'QZ Tray script not found' }

    if (!window.qz.websocket.isActive()) {
      await window.qz.websocket.connect({ retries: 2, delay: 1 })
    }

    const config = window.qz.configs.create(printerName)
    const data = [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]
    await window.qz.print(config, data)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Print failed' }
  }
}

export async function disconnectQZ(): Promise<void> {
  try {
    if (window.qz?.websocket?.isActive()) {
      await window.qz.websocket.disconnect()
    }
  } catch {
    // ignore
  }
}
