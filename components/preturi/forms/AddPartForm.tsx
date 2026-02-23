'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Package, Plus, X as XIcon, Search } from 'lucide-react'
import type { Part } from '@/lib/supabase/partOperations'
import type { LeadQuoteItem } from '@/lib/types/preturi'
import { cn } from '@/lib/utils'

interface AddPartFormProps {
  part: {
    id: string
    qty: string
    serialNumberId: string
  }
  partSearchQuery: string
  partSearchFocused: boolean
  parts: Part[]
  items: LeadQuoteItem[]
  instrumentForm: {
    brandSerialGroups: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }> }>
  }
  canAddParts: boolean
  onPartSearchChange: (query: string) => void
  onPartSearchFocus: () => void
  onPartSearchBlur: () => void
  onPartSelect: (partId: string, partName: string) => void
  onPartDoubleClick: (partId: string, partName: string) => void
  onQtyChange: (qty: string) => void
  onSerialNumberChange: (serialNumberId: string) => void
  onAddPart: () => void
}

export function AddPartForm({
  part,
  partSearchQuery,
  partSearchFocused,
  parts,
  items,
  instrumentForm,
  canAddParts,
  onPartSearchChange,
  onPartSearchFocus,
  onPartSearchBlur,
  onPartSelect,
  onPartDoubleClick,
  onQtyChange,
  onSerialNumberChange,
  onAddPart,
}: AddPartFormProps) {
  if (!canAddParts) {
    return null
  }

  // Verifică dacă există mai multe instrumente unice
  const uniqueInstruments = new Set<string>()
  items.forEach(item => {
    if (item.item_type === null && item.instrument_id) {
      uniqueInstruments.add(item.instrument_id)
    } else if (item.item_type === 'service' && item.instrument_id) {
      uniqueInstruments.add(item.instrument_id)
    } else if (item.item_type === 'part' && item.instrument_id) {
      uniqueInstruments.add(item.instrument_id)
    }
  })
  const hasMultipleInstruments = uniqueInstruments.size > 1

  return (
    <div className="mx-2 sm:mx-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {/* Header — același stil ca Adaugă Instrument / Adaugă Serviciu */}
        <div className="px-3 py-3 sm:px-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-col gap-3 max-md:gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-slate-600 flex items-center justify-center shadow-sm">
                <Package className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  Adaugă Piesă
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                  Caută și adaugă piese pentru reparații
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={onAddPart}
              disabled={!part.id}
              className="min-h-11 min-w-[44px] md:min-h-9 md:min-w-0 w-full md:w-auto px-4 bg-slate-600 hover:bg-slate-700 text-white shadow-sm touch-manipulation"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Adaugă
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-12 gap-3">
            {/* Piesă cu search */}
            <div className="relative col-span-12 sm:col-span-6 z-20">
              <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Search className="h-3 w-3" /> Piesă
              </Label>
              <div className="relative">
                <Input
                  className={cn(
                    "min-h-11 md:h-10 text-base md:text-sm pr-10 md:pr-8 border-2 transition-all touch-manipulation",
                    "border-slate-200 dark:border-slate-700 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20"
                  )}
                  placeholder="Caută piesă sau tap pentru listă..."
                  value={partSearchQuery}
                  onChange={e => onPartSearchChange(e.target.value)}
                  onFocus={onPartSearchFocus}
                  onBlur={onPartSearchBlur}
                />
                {partSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      onPartSearchChange('')
                      onPartSelect('', '')
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-1 text-slate-400 hover:text-slate-600 transition-colors touch-manipulation"
                    aria-label="Golește căutarea"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Dropdown — touch-friendly pe mobile */}
              {(partSearchFocused || partSearchQuery) && (
                <div className="absolute left-0 right-0 z-[100] mt-1 max-h-60 overflow-y-auto overscroll-contain bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg shadow-xl">
                  {!partSearchQuery && (
                    <div className="px-3 py-2 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                      {parts.length} piese disponibile
                    </div>
                  )}
                  {parts
                    .filter(p => !partSearchQuery || p.name.toLowerCase().includes(partSearchQuery.toLowerCase()))
                    .slice(0, partSearchQuery ? 10 : 20)
                    .map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onPartSelect(p.id, p.name)}
                        onDoubleClick={() => onPartDoubleClick(p.id, p.name)}
                        className="w-full text-left px-3 py-3 md:py-2.5 min-h-11 md:min-h-0 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-700/50 flex justify-between items-center gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors touch-manipulation"
                        title="Tap pentru selectare, dublu-tap pentru adăugare rapidă"
                      >
                        <span className="font-medium min-w-0 truncate">{p.name}</span>
                        <span className="text-slate-600 dark:text-slate-400 font-semibold flex-shrink-0">{p.price.toFixed(2)} RON</span>
                      </button>
                    ))}
                  {partSearchQuery && parts.filter(p => p.name.toLowerCase().includes(partSearchQuery.toLowerCase())).length === 0 && (
                    <div className="px-3 py-4 text-sm text-slate-500">Nu s-au găsit piese</div>
                  )}
                  {!partSearchQuery && parts.length > 20 && (
                    <div className="px-3 py-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/30 border-t">
                      Tastează pentru a căuta în toate cele {parts.length} piese...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Serial Number */}
            <div className="col-span-12 sm:col-span-4">
              <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                Serial / Brand
                {hasMultipleInstruments && <span className="text-red-500">*</span>}
              </Label>
              <select
                className="w-full min-h-11 md:h-10 text-base md:text-sm border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 md:py-0 bg-white dark:bg-slate-900 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20 transition-all touch-manipulation"
                value={part.serialNumberId}
                onChange={e => onSerialNumberChange(e.target.value)}
                required={hasMultipleInstruments}
              >
                <option value="">-- Selectează serial --</option>
                {(Array.isArray(instrumentForm?.brandSerialGroups) ? instrumentForm.brandSerialGroups : []).flatMap((group, gIdx) => {
                  if (!group) return []
                  const serialNumbers = Array.isArray(group?.serialNumbers) ? group.serialNumbers : []
                  return serialNumbers
                    .map(sn => {
                      const serial = typeof sn === 'string' ? sn : sn?.serial || ''
                      return serial.trim()
                    })
                    .filter(sn => sn)
                    .map((sn, snIdx) => (
                      <option key={`${gIdx}-${snIdx}`} value={`${group?.brand || ''}::${sn}`}>
                        {group?.brand ? `${group.brand} — ${sn}` : sn}
                      </option>
                    ))
                })}
              </select>
            </div>

            {/* Cant */}
            <div className="col-span-12 sm:col-span-2">
              <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Cant.
              </Label>
              <Input
                className="min-h-11 md:h-10 text-base md:text-sm text-center border-2 border-slate-200 dark:border-slate-700 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20 transition-all touch-manipulation"
                inputMode="numeric"
                value={part.qty}
                onChange={e => onQtyChange(e.target.value)}
                onFocus={e => e.target.select()}
                placeholder="1"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}



