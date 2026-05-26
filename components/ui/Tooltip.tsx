'use client'

import { ReactNode } from 'react'

interface TooltipProps {
  text: string
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

/**
 * Lightweight CSS-only tooltip — no extra packages needed.
 * Wraps any element; shows `text` on hover/focus.
 */
export function Tooltip({ text, children, side = 'right', className = '' }: TooltipProps) {
  const positionClasses: Record<string, string> = {
    right:  'left-full ml-2 top-1/2 -translate-y-1/2',
    left:   'right-full mr-2 top-1/2 -translate-y-1/2',
    top:    'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  }
  const arrowClasses: Record<string, string> = {
    right:  'right-full top-1/2 -translate-y-1/2 border-r-slate-800 border-y-transparent border-l-transparent border-4',
    left:   'left-full top-1/2 -translate-y-1/2 border-l-slate-800 border-y-transparent border-r-transparent border-4',
    top:    'top-full left-1/2 -translate-x-1/2 border-t-slate-800 border-x-transparent border-b-transparent border-4',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-800 border-x-transparent border-t-transparent border-4',
  }

  return (
    <span className={`relative group/tip inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 ${positionClasses[side]}
          whitespace-nowrap rounded-none bg-slate-800 px-2 py-1 text-xs text-white font-medium
          opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 select-none shadow-lg`}
      >
        {text}
        <span className={`absolute border ${arrowClasses[side]}`} aria-hidden />
      </span>
    </span>
  )
}
