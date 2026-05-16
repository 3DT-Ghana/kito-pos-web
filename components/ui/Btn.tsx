import React from 'react'
import Link from 'next/link'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md'

const V: Record<Variant, string> = {
  primary:   'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 ring-1 ring-gray-200',
  ghost:     'bg-transparent hover:bg-gray-100 text-gray-600',
  danger:    'bg-red-600 hover:bg-red-700 text-white shadow-sm',
}

const S: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2.5 text-sm gap-2 rounded-xl',
}

interface BtnProps {
  children: React.ReactNode
  variant?: Variant
  size?: Size
  icon?: React.ElementType
  href?: string
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}

export function Btn({
  children, variant = 'primary', size = 'md', icon: Icon,
  href, onClick, disabled, type = 'button', className = '',
}: BtnProps) {
  const base = `inline-flex items-center font-medium transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${V[variant]} ${S[size]} ${className}`

  const inner = (
    <>
      {Icon && <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />}
      {children}
    </>
  )

  if (href) return <Link href={href} className={base}>{inner}</Link>

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={base}>
      {inner}
    </button>
  )
}
