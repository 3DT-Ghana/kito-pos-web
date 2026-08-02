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

/**
 * Smart print: tries QZ Tray silent print first, falls back to window.print().
 * Pass `element` to print a specific DOM element, or omit to print the whole page.
 */
export async function smartPrint(
  target: PrintTarget,
  element?: HTMLElement | null
): Promise<void> {
  const printerName = getPrinterName(target)

  if (printerName) {
    const qzAvailable = await isQZAvailable()
    if (qzAvailable) {
      const html = element ? element.outerHTML : document.documentElement.outerHTML
      const result = await printHTMLToQZ(printerName, html)
      if (result.success) return
      // fall through to window.print() if QZ fails
    }
  }

  window.print()
}
