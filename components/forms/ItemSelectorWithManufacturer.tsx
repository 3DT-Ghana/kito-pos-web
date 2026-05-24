'use client'

import { useState, useMemo } from 'react'
import { Search, Package, Factory } from 'lucide-react'

interface Item {
  id: string
  name: string
  manufacturer: {
    id: string
    name: string
  }
  quantity: number
  sellingPrice?: number
  costPrice?: number
}

interface ItemSelectorProps {
  items: Item[]
  onSelectItem: (item: Item) => void
  selectedItemIds?: string[]
  label?: string
  priceType?: 'selling' | 'cost'
}

/**
 * Enhanced Item Selector with Manufacturer Filtering
 *
 * Features:
 * - Search by item name
 * - Filter by manufacturer
 * - Shows item name with manufacturer prominently
 * - Visual grouping by manufacturer
 */
export function ItemSelectorWithManufacturer({
  items,
  onSelectItem,
  selectedItemIds = [],
  label = 'Select Item',
  priceType = 'selling',
}: ItemSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('')

  // Extract unique manufacturers
  const manufacturers = useMemo(() => {
    const uniqueManufacturers = new Map<string, string>()
    items.forEach(item => {
      if (item.manufacturer) {
        uniqueManufacturers.set(item.manufacturer.id, item.manufacturer.name)
      }
    })
    return Array.from(uniqueManufacturers.entries()).map(([id, name]) => ({ id, name }))
  }, [items])

  // Filter items based on search and manufacturer
  const filteredItems = useMemo(() => {
    let filtered = items

    // Filter by manufacturer if selected
    if (selectedManufacturer) {
      filtered = filtered.filter(item => item.manufacturer?.id === selectedManufacturer)
    }

    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchLower) ||
        item.manufacturer?.name.toLowerCase().includes(searchLower)
      )
    }

    // Exclude already selected items
    return filtered.filter(item => !selectedItemIds.includes(item.id))
  }, [items, searchTerm, selectedManufacturer, selectedItemIds])

  // Group filtered items by manufacturer
  const groupedItems = useMemo(() => {
    const groups: Record<string, Item[]> = {}
    filteredItems.forEach(item => {
      const manufacturerName = item.manufacturer?.name || 'Unknown'
      if (!groups[manufacturerName]) {
        groups[manufacturerName] = []
      }
      groups[manufacturerName].push(item)
    })
    return groups
  }, [filteredItems])

  const handleItemClick = (item: Item) => {
    onSelectItem(item)
    setSearchTerm('')
  }

  return (
    <div className="space-y-4">
      <label className="block text-lg font-bold text-gray-900">
        {label}
      </label>

      {/* Manufacturer Filter */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <Factory className="w-4 h-4" />
          Filter by Manufacturer (Optional)
        </label>
        <select
          value={selectedManufacturer}
          onChange={(e) => setSelectedManufacturer(e.target.value)}
          className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All Manufacturers</option>
          {manufacturers.map(manufacturer => (
            <option key={manufacturer.id} value={manufacturer.id}>
              {manufacturer.name}
            </option>
          ))}
        </select>
      </div>

      {/* Search Input */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <Search className="w-4 h-4" />
          Search Items
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Type item name or manufacturer..."
            className="w-full px-4 py-3 pl-12 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Items List */}
      <div className="border-2 border-gray-200 max-h-96 overflow-y-auto bg-white">
        {Object.keys(groupedItems).length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No items found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {Object.entries(groupedItems).map(([manufacturerName, manufacturerItems]) => (
              <div key={manufacturerName} className="bg-gray-50">
                {/* Manufacturer Header */}
                <div className="px-4 py-2 bg-blue-100 border-b-2 border-blue-200">
                  <h3 className="font-bold text-blue-900 flex items-center gap-2">
                    <Factory className="w-5 h-5" />
                    {manufacturerName}
                  </h3>
                </div>

                {/* Items in this manufacturer */}
                <div className="divide-y divide-gray-200">
                  {manufacturerItems.map(item => {
                    const price = priceType === 'selling' ? item.sellingPrice : item.costPrice
                    const isLowStock = item.quantity <= 10

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors focus:outline-none focus:bg-blue-100"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-bold text-gray-900 text-base">
                              {item.name}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm">
                              <span className={`font-semibold ${isLowStock ? 'text-red-600' : 'text-green-600'}`}>
                                Stock: {item.quantity}
                                {isLowStock && ' ⚠️'}
                              </span>
                              {price && (
                                <span className="text-blue-600 font-semibold">
                                  ₦{price.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
                              Select
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      {filteredItems.length > 0 && (
        <div className="text-sm text-gray-600 text-center">
          Showing {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          {selectedManufacturer && ' from selected manufacturer'}
        </div>
      )}
    </div>
  )
}
