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

interface SenderState {
  cart: { itemId: string; name: string; qty: number; basePrice: number }[]
  grandTotal: number
  orderDiscountNum: number
  selectedCustomer: { name: string } | null
  method: PaymentMethod
  flashSuccess: boolean
  lastSaleData: { total: number; change: number; method: PaymentMethod; customerName: string } | null
}

export function useCustomerDisplaySender(state: SenderState) {
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    channelRef.current = new BroadcastChannel(CHANNEL_NAME)
    return () => { channelRef.current?.close() }
  }, [])

  const { cart, grandTotal, orderDiscountNum, selectedCustomer, method, flashSuccess, lastSaleData } = state

  useEffect(() => {
    const ch = channelRef.current
    if (!ch) return

    if (flashSuccess && lastSaleData) {
      ch.postMessage({
        type: 'SALE_COMPLETE',
        total: lastSaleData.total,
        change: lastSaleData.change,
        method: lastSaleData.method,
        customerName: lastSaleData.customerName,
      } satisfies DisplayMessage)
      return
    }

    if (cart.length === 0) {
      ch.postMessage({ type: 'IDLE' } satisfies DisplayMessage)
      return
    }

    ch.postMessage({
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
    } satisfies DisplayMessage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, grandTotal, orderDiscountNum, selectedCustomer, method, flashSuccess, lastSaleData])
}

export function useCustomerDisplayReceiver(onMessage: (msg: DisplayMessage) => void) {
  const callbackRef = useRef(onMessage)
  useEffect(() => { callbackRef.current = onMessage }, [onMessage])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL_NAME)
    ch.onmessage = (e: MessageEvent<DisplayMessage>) => callbackRef.current(e.data)
    return () => ch.close()
  }, [])
}
