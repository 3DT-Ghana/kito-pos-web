/**
 * Enhanced Button Component
 * Designed for better UX with larger touch targets and clearer visual feedback
 */

import { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  icon?: ReactNode
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'lg',
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'

  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white border-2 border-blue-600',
    secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-2 border-gray-300',
    success: 'bg-green-600 hover:bg-green-700 text-white border-2 border-green-600',
    danger: 'bg-red-600 hover:bg-red-700 text-white border-2 border-red-600',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-white border-2 border-yellow-500',
  }

  const sizes = {
    sm: 'px-4 py-2 text-sm min-h-[36px]',
    md: 'px-5 py-2.5 text-base min-h-[42px]',
    lg: 'px-6 py-3 text-lg min-h-[50px]',
    xl: 'px-8 py-4 text-xl min-h-[60px]',
  }

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  )
}
