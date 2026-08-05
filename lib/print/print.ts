'use client'

export type PrintTarget = 'receipt' | 'report'

// Paper width chosen in Settings. Falls back to 80mm, the common roll.
function getReceiptWidth(): '58mm' | '80mm' {
  try {
    return localStorage.getItem('receiptPrinterWidth') === '58mm' ? '58mm' : '80mm'
  } catch {
    return '80mm'
  }
}

export function saveReceiptWidth(width: string) {
  try {
    localStorage.setItem('receiptPrinterWidth', width)
  } catch {
    // ignore
  }
}

/**
 * What happens to the receipt once a POS sale completes.
 *
 *  preview — show it on screen, cashier chooses to print (the old behaviour)
 *  print   — print straight away, no modal
 *  none    — neither; for tills that do not hand out receipts
 */
export type ReceiptBehaviour = 'preview' | 'print' | 'none'

export function getReceiptBehaviour(): ReceiptBehaviour {
  try {
    const v = localStorage.getItem('posReceiptBehaviour')
    return v === 'print' || v === 'none' ? v : 'preview'
  } catch {
    return 'preview'
  }
}

export function saveReceiptBehaviour(v: ReceiptBehaviour) {
  try {
    localStorage.setItem('posReceiptBehaviour', v)
  } catch {
    // ignore
  }
}

/**
 * Stores the printer chosen for each target. window.print() cannot select a
 * printer — this is kept because a print agent will need it, and so the
 * operator's choice is not lost in the meantime.
 */
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
 * Print the given element.
 *
 * Uses window.print(), which prints silently when the browser runs with
 * --kiosk-printing and otherwise opens the print dialog.
 *
 * A local bridge (QZ Tray) was tried and removed: a page served over public
 * HTTPS cannot open a connection to localhost, so the browser refused it
 * regardless of certificate or CSP. Silent printing at true physical size
 * needs a print agent that polls the server rather than one the page calls.
 *
 * Pass `element` to print a specific DOM element, or omit for the whole page.
 */
export async function smartPrint(
  target: PrintTarget,
  element?: HTMLElement | null
): Promise<void> {
  //
  // Receipts need the thermal page geometry rather than the app-wide A4 rule.
  // ThermalReceipt sets this itself while mounted, but surfaces that build
  // their own receipt markup (the POS modal) do not, so apply it here for the
  // duration of the print and take it back off afterwards.
  const isReceipt = target === 'receipt' && Boolean(element?.closest('.thermal-receipt') ?? element?.classList.contains('thermal-receipt'))
  const root = document.documentElement
  const alreadyMarked = root.classList.contains('printing-receipt')
  let pageStyle: HTMLStyleElement | null = null

  // Reparent the receipt to <body> for the duration of the print. Hiding
  // siblings only collapses the page when the receipt is a direct child;
  // nested inside layout wrappers, its own ancestors kept the page as wide as
  // the POS screen and the printer scaled that down — the receipt printed tiny
  // and centred on the roll. A placeholder marks where to put it back.
  let placeholder: Comment | null = null
  let movedNode: HTMLElement | null = null

  if (isReceipt && element && element.parentNode !== document.body) {
    placeholder = document.createComment('receipt-print-placeholder')
    element.parentNode?.insertBefore(placeholder, element)
    document.body.appendChild(element)
    movedNode = element
  }

  // @page cannot be scoped to a selector: the browser merges every @page rule
  // in the document and picks a winner by cascade order, regardless of what is
  // being printed. So it is emitted here, at print time, for one job only —
  // there is never a second @page for it to lose to. globals.css deliberately
  // declares none.
  //
  // margin: 0 is what suppresses Chrome's header and footer. With any margin
  // the browser prints the date, page title and URL across the full page width,
  // which is how an A4 page rule revealed itself on an 80mm roll.
  if (isReceipt && !alreadyMarked) {
    root.classList.add('printing-receipt')
    pageStyle = document.createElement('style')
    const width = getReceiptWidth()
    // The receipt is the narrower printable area, centred on the paper: a
    // thermal head cannot reach the edges of the roll.
    const printable = width === '58mm' ? '48mm' : '72mm'
    pageStyle.textContent =
      `@media print {` +
      `  @page { size: ${width} auto; margin: 0; }` +
      `  html.printing-receipt, html.printing-receipt body,` +
      `  html.printing-receipt main, html.printing-receipt main > * {` +
      `    width: ${width} !important; min-width: 0 !important;` +
      `    max-width: ${width} !important; margin: 0 !important;` +
      `    padding: 0 !important;` +
      `    transform: none !important; zoom: 1 !important;` +
      `  }` +
      `  html.printing-receipt .thermal-receipt {` +
      `    width: ${printable} !important; min-width: 0 !important;` +
      `    max-width: ${printable} !important;` +
      `    margin: 0 auto !important; padding: 0 !important;` +
      `    transform: none !important; zoom: 1 !important;` +
      `  }` +
      `}`
    document.head.appendChild(pageStyle)
  } else if (!isReceipt) {
    // Reports keep the A4 page they have always had. It used to live in
    // globals.css, but an unconditional @page there also applied to receipts.
    pageStyle = document.createElement('style')
    pageStyle.textContent = '@media print { @page { size: A4; margin: 1.5cm; } }'
    document.head.appendChild(pageStyle)
  }

  try {
    window.print()
  } finally {
    if (movedNode && placeholder?.parentNode) {
      placeholder.parentNode.insertBefore(movedNode, placeholder)
      placeholder.remove()
    }
    pageStyle?.remove()
    // Only the receipt path sets this, so only it may clear it — a report
    // printed while a receipt happens to be mounted must not strip the class
    // out from under it.
    if (isReceipt && !alreadyMarked) {
      root.classList.remove('printing-receipt')
    }
  }
}
