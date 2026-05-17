'use client'

import { useBranch } from '@/lib/branch/BranchContext'

interface OperationalBranchPromptProps {
  title: string
  description: string
}

export function OperationalBranchPrompt({
  title,
  description,
}: OperationalBranchPromptProps) {
  const { branches, setBranchId } = useBranch()

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-2xl">
            🏬
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-amber-950">{title}</h2>
            <p className="mt-1 text-sm text-amber-800">{description}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              onClick={() => setBranchId(branch.id)}
              className="rounded-2xl border border-amber-200 bg-white px-4 py-4 text-left transition-colors hover:border-amber-400 hover:bg-amber-100"
            >
              <div className="text-sm font-bold text-gray-900">{branch.name}</div>
              <div className="mt-1 text-xs text-gray-500">
                {branch.isDefault ? 'Main branch' : 'Use this branch for the transaction'}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
