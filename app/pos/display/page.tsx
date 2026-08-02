'use client'

import { useEffect, useState } from 'react'
import { useCustomerDisplayReceiver, DisplayMessage, DisplayCartLine } from '@/hooks/useCustomerDisplay'

function formatGHS(amount: number) {
  return `GHS ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Clock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })), 1000)
    return () => clearInterval(t)
  }, [])
  return <>{time}</>
}

function IdleScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-indigo-800 to-indigo-950 text-white select-none">
      <div className="text-8xl font-black tracking-tight opacity-90">PETROS</div>
      <div className="text-3xl font-light tracking-widest text-indigo-200 uppercase">Welcome</div>
      <div className="text-5xl font-mono font-semibold text-indigo-100 mt-4">
        <Clock />
      </div>
      <div className="text-lg text-indigo-300 mt-6">Please wait while we serve you…</div>
    </div>
  )
}

function CartScreen({ cart, grandTotal, orderDiscount, customerName }: {
  cart: DisplayCartLine[]
  grandTotal: number
  orderDiscount: number
  customerName: string | null
}) {
  return (
    <div className="flex h-full bg-white select-none">
      {/* Left — item list */}
      <div className="flex flex-col w-[58%] h-full border-r border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-4 bg-indigo-700 text-white shrink-0">
          <span className="text-xl font-bold tracking-wide">Items</span>
          {customerName && (
            <span className="text-sm bg-indigo-600 px-3 py-1 font-semibold">{customerName}</span>
          )}
        </div>

        {/* Column headings */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-8 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-widest shrink-0">
          <span>Item</span>
          <span className="text-right w-20">Qty</span>
          <span className="text-right w-28">Total</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {[...cart].reverse().map((line, i) => (
            <div key={`${line.itemId}-${i}`} className="grid grid-cols-[1fr_auto_auto] gap-4 px-8 py-4 items-center">
              <div>
                <p className="text-lg font-semibold text-gray-900 leading-tight">{line.name}</p>
                <p className="text-sm text-gray-400">{formatGHS(line.basePrice)} each</p>
              </div>
              <span className="w-20 text-right text-xl font-bold text-gray-700">{line.qty}</span>
              <span className="w-28 text-right text-xl font-bold text-indigo-700">{formatGHS(line.lineTotal)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right — total */}
      <div className="flex flex-col items-center justify-center w-[42%] h-full bg-gray-50 gap-6 px-10">
        {customerName && (
          <div className="text-center mb-2">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Customer</p>
            <p className="text-2xl font-bold text-gray-800">{customerName}</p>
          </div>
        )}

        <div className="text-center">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Items</p>
          <p className="text-5xl font-black text-gray-700">{cart.reduce((s, c) => s + c.qty, 0)}</p>
        </div>

        {orderDiscount > 0 && (
          <div className="text-center">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Discount</p>
            <p className="text-3xl font-black text-green-600">− {formatGHS(orderDiscount)}</p>
          </div>
        )}

        <div className="text-center mt-2">
          <p className="text-lg font-bold text-gray-500 uppercase tracking-widest mb-1">Total</p>
          <p className="text-7xl font-black text-indigo-700 tracking-tight leading-none">{formatGHS(grandTotal)}</p>
        </div>
      </div>
    </div>
  )
}

function SaleCompleteScreen({ total, change, method, customerName, onDone }: {
  total: number; change: number; method: string; customerName: string; onDone: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="flex flex-col items-center justify-center h-full bg-green-600 text-white gap-8 select-none">
      <div className="w-36 h-36 bg-white/20 flex items-center justify-center text-8xl font-black">✓</div>
      <div className="text-center">
        <p className="text-3xl font-light tracking-widest uppercase mb-2">Sale Complete</p>
        {customerName && <p className="text-2xl font-semibold opacity-80">{customerName}</p>}
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold opacity-70 uppercase tracking-widest mb-1">Total Paid</p>
        <p className="text-8xl font-black tracking-tight">{formatGHS(total)}</p>
      </div>
      {method === 'CASH' && change > 0 && (
        <div className="text-center bg-white/20 px-12 py-5">
          <p className="text-lg font-semibold opacity-80 uppercase tracking-widest mb-1">Change Due</p>
          <p className="text-5xl font-black">{formatGHS(change)}</p>
        </div>
      )}
      <p className="text-3xl font-light tracking-widest mt-4">Thank you!</p>
    </div>
  )
}

export default function CustomerDisplayPage() {
  const [screen, setScreen] = useState<DisplayMessage>({ type: 'IDLE' })

  useCustomerDisplayReceiver((msg) => {
    setScreen(msg)
  })

  if (screen.type === 'CART_UPDATE') {
    return (
      <div className="fixed inset-0">
        <CartScreen
          cart={screen.cart}
          grandTotal={screen.grandTotal}
          orderDiscount={screen.orderDiscount}
          customerName={screen.customerName}
        />
      </div>
    )
  }

  if (screen.type === 'SALE_COMPLETE') {
    return (
      <div className="fixed inset-0">
        <SaleCompleteScreen
          total={screen.total}
          change={screen.change}
          method={screen.method}
          customerName={screen.customerName}
          onDone={() => setScreen({ type: 'IDLE' })}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0">
      <IdleScreen />
    </div>
  )
}
