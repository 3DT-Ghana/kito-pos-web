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

export async function getAvailablePrinters(): Promise<string[]> {
  try {
    const loaded = await loadQZ()
    if (!loaded) return []
    if (!window.qz.websocket.isActive()) {
      await window.qz.websocket.connect({ retries: 2, delay: 1 })
    }
    const printers = await window.qz.printers.find()
    return Array.isArray(printers) ? printers : []
  } catch {
    return []
  }
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
