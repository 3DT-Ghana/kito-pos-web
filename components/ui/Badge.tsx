import React from 'react'

type Variant = 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'gray' | 'slate' | 'orange'

const VARIANT_CLASSES: Record<Variant, string> = {
  green:  'bg-emerald-50 text-emerald-700 ring-emerald-200/60',
  red:    'bg-red-50 text-red-700 ring-red-200/60',
  amber:  'bg-amber-50 text-amber-700 ring-amber-200/60',
  blue:   'bg-blue-50 text-blue-700 ring-blue-200/60',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200/60',
  gray:   'bg-gray-100 text-gray-600 ring-gray-200/60',
  slate:  'bg-slate-100 text-slate-600 ring-slate-200/60',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200/60',
}

interface BadgeProps {
  children: React.ReactNode
  variant?: Variant
  dot?: boolean
  className?: string
}

export function Badge({ children, variant = 'gray', dot, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${VARIANT_CLASSES[variant]} ${className}`}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${
          variant === 'green' ? 'bg-emerald-500'
          : variant === 'red' ? 'bg-red-500'
          : variant === 'amber' ? 'bg-amber-500'
          : variant === 'blue' ? 'bg-blue-500'
          : 'bg-gray-400'
        }`} />
      )}
      {children}
    </span>
  )
}
