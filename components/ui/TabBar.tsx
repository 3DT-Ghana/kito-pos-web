import React from 'react'

interface Tab<T extends string> {
  value: T
  label: string
  count?: number
  countVariant?: 'red' | 'blue' | 'green' | 'amber'
}

interface TabBarProps<T extends string> {
  tabs: Tab<T>[]
  active: T
  onChange: (v: T) => void
}

const COUNT_COLORS = {
  red:   'bg-red-500 text-white',
  blue:  'bg-blue-500 text-white',
  green: 'bg-emerald-500 text-white',
  amber: 'bg-amber-500 text-white',
}

export function TabBar<T extends string>({ tabs, active, onChange }: TabBarProps<T>) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
      {tabs.map(tab => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
            active === tab.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
          {tab.count != null && tab.count > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              COUNT_COLORS[tab.countVariant ?? 'blue']
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
