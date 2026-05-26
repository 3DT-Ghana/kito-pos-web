'use client'

import { ReactNode, useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  text: string
  children: ReactNode
  enabled?: boolean
}

/**
 * Portal-based balloon tooltip — renders outside the sidebar DOM so it
 * never triggers horizontal scroll on the parent container.
 * Shows above the hovered element by default; flips below if near the top edge.
 */
export function Tooltip({ text, children, enabled = true }: TooltipProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null)

  const show = () => {
    if (!enabled || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const below = r.top < 60
    setPos({
      top: below ? r.bottom + 6 : r.top - 6,
      left: r.left + r.width / 2,
      below,
    })
  }

  const hide = () => setPos(null)

  // Hide on scroll/resize
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pos])

  const tip = pos ? (
    <span
      role="tooltip"
      style={{
        position: 'fixed',
        top: pos.below ? pos.top : undefined,
        bottom: pos.below ? undefined : `calc(100vh - ${pos.top}px)`,
        left: pos.left,
        transform: 'translateX(-50%)',
        zIndex: 9999,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
      className="bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 shadow-lg select-none"
    >
      {/* Arrow */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          ...(pos.below
            ? { bottom: '100%', borderBottom: '5px solid #1e293b', borderLeft: '5px solid transparent', borderRight: '5px solid transparent' }
            : { top: '100%',    borderTop:    '5px solid #1e293b', borderLeft: '5px solid transparent', borderRight: '5px solid transparent' }
          ),
          width: 0,
          height: 0,
        }}
      />
      {text}
    </span>
  ) : null

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="inline-flex"
    >
      {children}
      {typeof window !== 'undefined' && tip ? createPortal(tip, document.body) : null}
    </span>
  )
}
