'use client'

import { printHTMLToQZ, isQZAvailable } from './qzTray'

export type PrintTarget = 'receipt' | 'report'

// Fetches printer settings stored in localStorage (set from Settings page)
function getPrinterName(target: PrintTarget): string | null {
  try {
    const key = target === 'receipt' ? 'receiptPrinterName' : 'reportPrinterName'
    return localStorage.getItem(key) || null
  } catch {
    return null
  }
}

export function savePrinterName(target: PrintTarget, name: string | null) {
  try {
    const key = target === 'receipt' ? 'receiptPrinterName' : 'reportPrinterName'
    if (name) localStorage.setItem(key, name)
    else localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

// Remember a failed QZ attempt for the rest of the session. Where QZ is
// blocked — by an extension, or a browser policy on reaching localhost — every
// print would otherwise stall on the same doomed connection retries before
// falling back, making each sale feel like the terminal had frozen.
let qzUnavailableUntil = 0
const QZ_RETRY_BACKOFF_MS = 5 * 60 * 1000

/**
 * Print the given element, silently when possible.
 *
 * Order of preference:
 *  1. QZ Tray, if configured and reachable — true silent print.
 *  2. window.print(), which is also silent when the browser runs with
 *     --kiosk-printing; otherwise it opens the print dialog.
 *
 * Pass `element` to print a specific DOM element, or omit for the whole page.
 */
export async function smartPrint(
  target: PrintTarget,
  element?: HTMLElement | null
): Promise<void> {
  const printerName = getPrinterName(target)

  if (printerName && Date.now() >= qzUnavailableUntil) {
    try {
      const qzAvailable = await isQZAvailable()
      if (qzAvailable) {
        const html = element ? element.outerHTML : document.documentElement.outerHTML
        const result = await printHTMLToQZ(printerName, html)
        if (result.success) return
      }
      qzUnavailableUntil = Date.now() + QZ_RETRY_BACKOFF_MS
    } catch {
      qzUnavailableUntil = Date.now() + QZ_RETRY_BACKOFF_MS
    }
  }

  // With --kiosk-printing this prints straight to the default printer with no
  // dialog, which is the practical alternative to QZ on a locked-down till.
  window.print()
}

/** Clears the backoff so a fresh QZ attempt happens on the next print. */
export function resetPrintTransport() {
  qzUnavailableUntil = 0
}
