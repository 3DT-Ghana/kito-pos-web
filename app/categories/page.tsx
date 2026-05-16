'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/ui/PageHeader'
import { Btn } from '@/components/ui/Btn'
import { Tag, Plus } from 'lucide-react'

interface Category {
  id: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  sortOrder: number
  _count: { items: number }
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#64748b', '#78716c',
]

const PRESET_ICONS = [
  '📦','🥤','🍫','🧴','🧹','🍼','🍚','🧂',
  '💊','🛒','🔧','📱','👗','🏠','🌿','🍕',
]

const DEFAULT_COLOR = '#6366f1'
const DEFAULT_ICON = '📦'

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full border-2 transition-transform ${value === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

function IconPicker({ value, onChange }: { value: string; onChange: (i: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESET_ICONS.map(icon => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
          className={`w-9 h-9 text-lg rounded-lg border-2 transition-colors ${value === icon ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [icon, setIcon] = useState(DEFAULT_ICON)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories')
      if (res.ok) setCategories(await res.json())
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchCategories() }, [])

  const openNew = () => {
    setEditingId(null)
    setName(''); setDescription(''); setColor(DEFAULT_COLOR); setIcon(DEFAULT_ICON)
    setError(''); setShowForm(true)
  }

  const openEdit = (cat: Category) => {
    setEditingId(cat.id)
    setName(cat.name)
    setDescription(cat.description ?? '')
    setColor(cat.color ?? DEFAULT_COLOR)
    setIcon(cat.icon ?? DEFAULT_ICON)
    setError(''); setShowForm(true)
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setIsSaving(true); setError('')
    try {
      const url = editingId ? `/api/categories/${editingId}` : '/api/categories'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, color, icon }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save'); return }
      setShowForm(false)
      fetchCategories()
    } catch {
      setError('Failed to save category')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (cat: Category) => {
    if (cat._count.items > 0) {
      if (!confirm(`"${cat.name}" has ${cat._count.items} item(s). Deleting it will unassign them. Continue?`)) return
    } else {
      if (!confirm(`Delete category "${cat.name}"?`)) return
    }
    setDeletingId(cat.id)
    try {
      await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' })
      fetchCategories()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Product Categories"
          subtitle="Organise your inventory into departments — used for POS browsing and reports"
          actions={<Btn icon={Plus} onClick={openNew}>New Category</Btn>}
        />

        {/* Slide-in form */}
        {showForm && (
          <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-lg p-5 space-y-4">
            <h2 className="font-bold text-gray-800 text-base">{editingId ? 'Edit Category' : 'New Category'}</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Beverages"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional short description"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Icon</label>
              <IconPicker value={icon} onChange={setIcon} />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Color</label>
              <ColorPicker value={color} onChange={setColor} />
            </div>

            {/* Preview */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Preview:</span>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-white text-xs"
                style={{ backgroundColor: color }}
              >
                {icon} {name || 'Category Name'}
              </span>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
              >
                {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Category'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl text-sm hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse shadow-sm ring-1 ring-black/5" />)}
          </div>
        ) : categories.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 flex flex-col items-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Tag className="w-7 h-7 text-gray-400" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">No categories yet</p>
              <p className="text-xs text-gray-400 mt-1">Create categories like Beverages, Dairy, Personal Care…</p>
            </div>
            <Btn icon={Plus} size="sm" onClick={openNew}>Create First Category</Btn>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map(cat => (
              <div key={cat.id} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 overflow-hidden group">
                {/* Colour bar */}
                <div className="h-1.5" style={{ backgroundColor: cat.color ?? DEFAULT_COLOR }} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ backgroundColor: (cat.color ?? DEFAULT_COLOR) + '22' }}
                      >
                        {cat.icon ?? DEFAULT_ICON}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{cat.name}</p>
                        {cat.description && (
                          <p className="text-xs text-gray-400 truncate">{cat.description}</p>
                        )}
                      </div>
                    </div>
                    <span
                      className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: cat.color ?? DEFAULT_COLOR }}
                    >
                      {cat._count.items} item{cat._count.items !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(cat)}
                      className="flex-1 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
                      disabled={deletingId === cat.id}
                      className="flex-1 py-1.5 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deletingId === cat.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
