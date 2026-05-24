import React from 'react'

interface EmptyStateProps {
  icon: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white shadow-sm ring-1 ring-black/5">
      <div className="w-14 h-14 bg-gray-100 flex items-center justify-center">
        <Icon className="w-7 h-7 text-gray-400" strokeWidth={1.5} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
      </div>
      {action}
    </div>
  )
}
