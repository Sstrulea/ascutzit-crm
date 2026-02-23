'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sparkles, Plus, X as XIcon, Search, Percent, Undo2, User } from 'lucide-react'
import type { Service } from '@/lib/supabase/serviceOperations'
import { cn } from '@/lib/utils'

interface AddServiceFormProps {
  svc: {
    id: string
    qty: string
    discount: string
    instrumentId: string
    selectedBrands?: string[]
    serialNumberId?: string
    technicianId?: string
  }
  serviceSearchQuery: string
  serviceSearchFocused: boolean
  currentInstrumentId: string | null
  availableServices: Service[]
  instrumentForm?: {
    brandSerialGroups?: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }> | string[] }>
  }
  isVanzariPipeline?: boolean
  canEditUrgentAndSubscription?: boolean
  // Props pentru selectarea tehnicianului (doar admini)
  isAdmin?: boolean
  technicians?: Array<{ id: string; name: string }>
  onTechnicianChange?: (technicianId: string) => void
  onServiceSearchChange: (query: string) => void
  onServiceSearchFocus: () => void
  onServiceSearchBlur: () => void
  onServiceSelect: (serviceId: string, serviceName: string) => void
  onServiceDoubleClick: (serviceId: string, serviceName: string) => void
  onQtyChange: (qty: string) => void
  onDiscountChange: (discount: string) => void
  onAddService: () => void
  onClearForm?: () => void
  onBrandToggle?: (brandName: string, checked: boolean) => void
  onSerialNumberChange?: (serialNumberId: string) => void
}

export function AddServiceForm({
  svc,
  serviceSearchQuery,
  serviceSearchFocused,
  currentInstrumentId,
  availableServices,
  instrumentForm,
  isVanzariPipeline = false,
  canEditUrgentAndSubscription = true,
  isAdmin = false,
  technicians = [],
  onTechnicianChange,
  onServiceSearchChange,
  onServiceSearchFocus,
  onServiceSearchBlur,
  onServiceSelect,
  onServiceDoubleClick,
  onQtyChange,
  onDiscountChange,
  onAddService,
  onClearForm,
  onBrandToggle,
  onSerialNumberChange,
}: AddServiceFormProps) {
  return (
    <div className="mx-2 sm:mx-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-visible">
        {/* Header — CRM: neutru + accent */}
        <div className="px-3 py-3 sm:px-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-col gap-3 max-md:gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-slate-600 flex items-center justify-center shadow-sm">
                <Sparkles className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  Adaugă Serviciu
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                  Caută și adaugă servicii pentru instrument
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {svc.id && onClearForm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onClearForm}
                  className="min-h-11 min-w-[44px] md:min-h-9 md:min-w-0 px-3 border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50 touch-manipulation"
                >
                  <Undo2 className="h-4 w-4 mr-1.5" />
                  Anulează
                </Button>
              )}
              <Button
                size="sm"
                onClick={onAddService}
                disabled={!svc.id}
                className="min-h-11 min-w-[44px] md:min-h-9 md:min-w-0 px-4 bg-slate-600 hover:bg-slate-700 text-white shadow-sm touch-manipulation"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Adaugă
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-12 gap-3">
            {/* Serviciu cu search */}
            <div className="relative col-span-12 sm:col-span-6 z-20">
              <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Search className="h-3 w-3" /> Serviciu
              </Label>
              <div className="relative">
                <Input
                  className={cn(
                    "min-h-11 md:h-10 text-base md:text-sm pr-10 md:pr-8 border-2 transition-all touch-manipulation",
                    currentInstrumentId
                      ? "border-slate-200 dark:border-slate-700 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20"
                      : "border-slate-200 bg-slate-50 cursor-not-allowed"
                  )}
                  placeholder={currentInstrumentId ? "Caută serviciu sau tap pentru listă..." : "Selectează mai întâi un instrument"}
                  value={serviceSearchQuery}
                  onChange={e => onServiceSearchChange(e.target.value)}
                  onFocus={onServiceSearchFocus}
                  onBlur={onServiceSearchBlur}
                  disabled={!currentInstrumentId}
                />
                {serviceSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      onServiceSearchChange('')
                      onServiceSelect('', '')
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-1 text-slate-400 hover:text-slate-600 transition-colors touch-manipulation"
                    aria-label="Golește căutarea"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Dropdown — touch-friendly items pe mobile */}
              {(serviceSearchFocused || serviceSearchQuery) && currentInstrumentId && (
                <div className="absolute left-0 right-0 z-[100] mt-1 max-h-60 overflow-y-auto overscroll-contain bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg shadow-xl">
                  {!serviceSearchQuery && (
                    <div className="px-3 py-2 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-b sticky top-0">
                      {availableServices.length} servicii disponibile
                    </div>
                  )}
                  {availableServices
                    .filter(s => !serviceSearchQuery || s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase()))
                    .slice(0, serviceSearchQuery ? 10 : 20)
                    .map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onServiceSelect(s.id, s.name)}
                        onDoubleClick={() => onServiceDoubleClick(s.id, s.name)}
                        className="w-full text-left px-3 py-3 md:py-2.5 min-h-11 md:min-h-0 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-700/50 flex justify-between items-center gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors touch-manipulation"
                      >
                        <span className="font-medium min-w-0 flex-1 truncate">{s.name}</span>
                        <span className="text-blue-600 dark:text-blue-400 font-semibold flex-shrink-0">{s.price.toFixed(2)} RON</span>
                      </button>
                    ))}
                  {serviceSearchQuery && availableServices.filter(s => s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase())).length === 0 && (
                    <div className="px-3 py-4 text-sm text-center text-muted-foreground">Nu s-au găsit servicii</div>
                  )}
                </div>
              )}
            </div>

            {/* Cantitate */}
            <div className={cn("col-span-6", isAdmin && technicians.length > 0 ? "sm:col-span-2" : "sm:col-span-2")}>
              <Label className="text-[10px] font-bold text-blue-800/90 dark:text-blue-200 uppercase tracking-wider mb-1.5 block">
                Cant.
              </Label>
              <Input
                className="min-h-11 md:h-10 text-base md:text-sm text-center border-2 border-blue-200/80 dark:border-blue-700/50 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 touch-manipulation"
                inputMode="numeric"
                value={svc.qty}
                onChange={e => onQtyChange(e.target.value)}
                onFocus={e => e.target.select()}
                placeholder="1"
              />
            </div>

            {/* Selector Tehnician - doar pentru admini */}
            {isAdmin && technicians.length > 0 && (
              <div className="col-span-6 sm:col-span-2">
                <Label className="text-[10px] font-bold text-blue-800/90 dark:text-blue-200 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <User className="h-3 w-3" /> Tehnician
                </Label>
                <Select 
                  value={svc.technicianId || '__none__'} 
                  onValueChange={(val) => onTechnicianChange?.(val === '__none__' ? '' : val)}
                >
                  <SelectTrigger className="min-h-11 md:h-10 text-base md:text-sm border-2 border-blue-200/80 dark:border-blue-700/50 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20">
                    <SelectValue placeholder="Selectează..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">Neatribuit</span>
                    </SelectItem>
                    {technicians.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id}>
                        {tech.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Serial Numbers cu Brand — full width pe mobile, touch-friendly */}
            <div className={cn("col-span-12", isAdmin && technicians.length > 0 ? "sm:col-span-2" : "sm:col-span-3")}>
              <Label className="text-[10px] font-bold text-blue-800/90 dark:text-blue-200 uppercase tracking-wider mb-1.5 block">
                Serial / Brand
              </Label>
              <div className="max-h-32 md:max-h-28 overflow-y-auto overscroll-contain border-2 border-blue-200/80 dark:border-blue-700/50 rounded-lg p-2 bg-white dark:bg-slate-900 space-y-0.5">
                {(Array.isArray(instrumentForm?.brandSerialGroups) ? instrumentForm.brandSerialGroups : []).flatMap((group, gIdx) => {
                  if (!group) return []
                  const brandName = group?.brand?.trim() || ''
                  const serialNumbers = Array.isArray(group?.serialNumbers) ? group.serialNumbers : []
                  return serialNumbers.map((sn, snIdx) => {
                    const serial = typeof sn === 'string' ? sn : (sn && typeof sn === 'object' ? sn?.serial || '' : '')
                    const serialDisplay = serial && serial.trim() ? serial.trim() : `Serial ${snIdx + 1}`
                    const displayText = brandName ? `${brandName} — ${serialDisplay}` : serialDisplay
                    const valueKey = `${brandName}::${serial || `empty-${gIdx}-${snIdx}`}`
                    const selectedSerials = Array.isArray(svc?.selectedBrands) ? svc.selectedBrands : []
                    const isSelected = selectedSerials.includes(valueKey)
                    return (
                      <label
                        key={`${gIdx}-${snIdx}`}
                        className="flex items-center gap-2 min-h-11 md:min-h-0 py-2 md:py-0.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded px-1 transition-colors touch-manipulation"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            onBrandToggle?.(valueKey, !!checked)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-5 w-5 md:h-4 md:w-4 data-[state=checked]:bg-slate-600 data-[state=checked]:border-slate-600 flex-shrink-0"
                        />
                        <span className="text-xs font-medium truncate">{displayText}</span>
                      </label>
                    )
                  })
                })}
                {(Array.isArray(instrumentForm?.brandSerialGroups) ? instrumentForm.brandSerialGroups : []).length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-2">Nu există serial numbers</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
