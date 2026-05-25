'use client'

import { useEffect, useRef } from 'react'

const CHANNEL_NAME = 'pos_customer_display'

export type PaymentMethod = 'CASH' | 'MOMO' | 'BANK'

export interface DisplayCartLine {
  itemId: string
  name: string
  qty: number
  basePrice: number
  lineTotal: number
}

export type DisplayMessage =
  | { type: 'CART_UPDATE'; cart: DisplayCartLine[]; grandTotal: number; orderDiscount: number; customerName: string | null; method: PaymentMethod }
  | { type: 'SALE_COMPLETE'; total: number; change: number; method: PaymentMethod; customerName: string }
  | { type: 'IDLE' }
  | { type: 'REQUEST_SYNC' }

interface SenderState {
  cart: { itemId: string; name: string; qty: number; basePrice: number }[]
  grandTotal: number
  orderDiscountNum: number
  selectedCustomer: { name: string } | null
  method: PaymentMethod
  flashSuccess: boolean
  lastSaleData: { total: number; change: number; method: PaymentMethod; customerName: string } | null
}

function buildCurrentMessage(state: SenderState): DisplayMessage {
  const { cart, grandTotal, orderDiscountNum, selectedCustomer, method, flashSuccess, lastSaleData } = state

  if (flashSuccess && lastSaleData) {
    return {
      type: 'SALE_COMPLETE',
      total: lastSaleData.total,
      change: lastSaleData.change,
      method: lastSaleData.method,
      customerName: lastSaleData.customerName,
    }
  }

  if (cart.length === 0) {
    return { type: 'IDLE' }
  }

  return {
    type: 'CART_UPDATE',
    cart: cart.map(c => ({
      itemId: c.itemId,
      name: c.name,
      qty: c.qty,
      basePrice: c.basePrice,
      lineTotal: Math.max(0, c.basePrice * c.qty),
    })),
    grandTotal,
    orderDiscount: orderDiscountNum,
    customerName: selectedCustomer?.name ?? null,
    method,
  }
}

export function useCustomerDisplaySender(state: SenderState) {
  const channelRef = useRef<BroadcastChannel | null>(null)
  // Keep a ref to latest state so the sync-request handler always replies with fresh data
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = ch

    // When the display tab opens, it sends REQUEST_SYNC — reply immediately
    ch.onmessage = (e: MessageEvent<DisplayMessage>) => {
      if (e.data?.type === 'REQUEST_SYNC') {
        ch.postMessage(buildCurrentMessage(stateRef.current))
      }
    }

    return () => { ch.close() }
  }, [])

  const { cart, grandTotal, orderDiscountNum, selectedCustomer, method, flashSuccess, lastSaleData } = state

  useEffect(() => {
    const ch = channelRef.current
    if (!ch) return
    ch.postMessage(buildCurrentMessage(state))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, grandTotal, orderDiscountNum, selectedCustomer, method, flashSuccess, lastSaleData])
}

export function useCustomerDisplayReceiver(onMessage: (msg: DisplayMessage) => void) {
  const callbackRef = useRef(onMessage)
  useEffect(() => { callbackRef.current = onMessage }, [onMessage])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL_NAME)

    ch.onmessage = (e: MessageEvent<DisplayMessage>) => {
      // Ignore REQUEST_SYNC on the receiver side
      if (e.data?.type === 'REQUEST_SYNC') return
      callbackRef.current(e.data)
    }

    // Ask the POS tab to send its current state immediately
    ch.postMessage({ type: 'REQUEST_SYNC' })

    return () => ch.close()
  }, [])
}
