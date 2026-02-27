'use client'

import { useMemo, useState } from 'react'
import { Plus, Wrench, Package, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import type { LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import { MobileItemCard } from './MobileItemCard'
import { MobileAddItemSheet } from './MobileAddItemSheet'
import { MobileEditItemSheet } from './MobileEditItemSheet'

interface MobileItemsViewProps {
  items: LeadQuoteItem[]
  services: Service[]
  instruments: Array<{ id: string; name: string; repairable?: boolean }>
  parts?: Array<{ id: string; name: string; price: number }>
  technicians?: Array<{ id: string; name: string }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  isReceptiePipeline: boolean
  isDepartmentPipeline: boolean
  isReparatiiPipeline?: boolean
  canAddParts?: boolean
  canEditUrgentAndSubscription?: boolean
  canChangeTechnician?: boolean
  selectedInstrument?: { id: string; name: string } | null
  instrumentForm?: {
    instrument: { id: string; name: string } | null
    qty: number
  }
  onUpdateItem: (id: string, patch: Partial<LeadQuoteItem>) => void
  onDelete: (id: string) => void
  onAddService?: (service: Service, qty: number) => void
  onAddPart?: (part: { id: string; name: string; price: number }, qty: number, serialNumber?: string) => void
  onInstrumentChange?: (instrument: { id: string; name: string } | null) => void
  onInstrumentDoubleClick?: (instrument: { id: string; name: string }) => void
  onQtyChange?: (qty: number) => void
  onClearForm?: () => void
  onSvcDiscountChange?: (discount: string) => void
}

export function MobileItemsView({
  items,
  services,
  instruments,
  parts = [],
  technicians = [],
  pipelinesWithIds,
  isReceptiePipeline,
  isDepartmentPipeline,
  isReparatiiPipeline = false,
  canAddParts = false,
  canEditUrgentAndSubscription = false,
  canChangeTechnician = false,
  selectedInstrument,
  instrumentForm,
  onUpdateItem,
  onDelete,
  onAddService,
  onAddPart,
  onInstrumentChange,
  onInstrumentDoubleClick,
  onQtyChange,
  onClearForm,
  onSvcDiscountChange,
}: MobileItemsViewProps) {
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<LeadQuoteItem | null>(null)

  // Normalizează items-urile
  const safeItems = Array.isArray(items) ? items : []
  const safeServices = Array.isArray(services) ? services : []
  const safeInstruments = Array.isArray(instruments) ? instruments : []

  // Grupează itemurile pe instrumente
  const groupedByInstrument = useMemo(() => {
    const groups = new Map<string, {
      instrumentId: string
      instrumentName: string
      items: LeadQuoteItem[]
      totalQty: number
      totalNonRepairableQty: number
      totalRepairableQty: number
      totalPrice: number
      hasUrgent: boolean
    }>()

    safeItems.forEach(item => {
      if (!item) return

      // Determină instrument ID
      let instrumentId: string | null = item.instrument_id || null
      if (!instrumentId && item.service_id) {
        const svc = safeServices.find(s => s.id === item.service_id)
        if (svc?.instrument_id) instrumentId = svc.instrument_id
      }
      if (!instrumentId) instrumentId = 'unknown'

      // Găsește numele instrumentului
      const instrument = safeInstruments.find(i => i.id === instrumentId)
      const instrumentName = instrument?.name || 'Instrument necunoscut'

      if (!groups.has(instrumentId)) {
        groups.set(instrumentId, {
          instrumentId,
          instrumentName,
          items: [],
          totalQty: 0,
          totalNonRepairableQty: 0,
          totalRepairableQty: 0,
          totalPrice: 0,
          hasUrgent: false,
        })
      }

      const group = groups.get(instrumentId)!
      group.items.push(item)
      
      const qty = item.qty || 1
      const unrepaired = Number((item as any).unrepaired_qty ?? (item as any).non_repairable_qty) || 0
      const repairableQty = Math.max(0, qty - unrepaired)
      const nonRepairableQty = unrepaired
      
      group.totalQty += qty
      group.totalNonRepairableQty += nonRepairableQty
      group.totalRepairableQty += repairableQty
      group.totalPrice += repairableQty * item.price
      if (item.urgent) group.hasUrgent = true
    })

    return Array.from(groups.values())
  }, [safeItems, safeServices, safeInstruments])

  // În fiecare grup de instrument, unifică rândurile cu același (serviciu, piesă, tehnician) și însumează cantitățile
  const groupedByInstrumentWithMergedRows = useMemo(() => {
    return groupedByInstrument.map(group => {
      const key = (item: LeadQuoteItem) =>
        `${item.service_id ?? ''}_${item.part_id ?? ''}`
      const byKey = new Map<string, LeadQuoteItem[]>()
      group.items.forEach(item => {
        const k = key(item)
        if (!byKey.has(k)) byKey.set(k, [])
        byKey.get(k)!.push(item)
      })
      const mergedItems: LeadQuoteItem[] = byKey.size === 0 ? group.items : []
      if (byKey.size > 0) {
        byKey.forEach((subItems) => {
          if (subItems.length === 1) {
            mergedItems.push(subItems[0])
          } else {
            const first = { ...subItems[0], qty: subItems.reduce((s, i) => s + (i.qty || 1), 0), _mergedIds: subItems.map(i => i.id) } as LeadQuoteItem & { _mergedIds?: string[] }
            mergedItems.push(first)
          }
        })
      }
      return { ...group, items: mergedItems.length ? mergedItems : group.items }
    })
  }, [groupedByInstrument])

  const handleItemTap = (item: LeadQuoteItem) => {
    setSelectedItem(item)
    setEditSheetOpen(true)
  }

  const handleItemDelete = (item: LeadQuoteItem) => {
    const ids = (item as any)._mergedIds as string[] | undefined
    if (ids?.length) ids.forEach(id => onDelete(id))
    else onDelete(item.id)
  }

  if (safeItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-5 min-h-[50vh]">
        <div className="h-20 w-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-5">
          <Package className="h-10 w-10 text-slate-400" />
        </div>
        <p className="text-base font-medium text-slate-600 dark:text-slate-400 text-center">
          Nu există poziții încă
        </p>
        <p className="text-sm text-muted-foreground mt-2 text-center max-w-[260px]">
          Apasă butonul + pentru a adăuga un instrument
        </p>
        
        <Button
          onClick={() => setAddSheetOpen(true)}
          className="fixed z-50 right-5 h-14 w-14 rounded-full shadow-lg touch-manipulation"
          size="icon"
          style={{ bottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 2rem))' }}
          aria-label="Adaugă instrument"
        >
          <Plus className="h-6 w-6" />
        </Button>

        <MobileAddItemSheet
          open={addSheetOpen}
          onOpenChange={setAddSheetOpen}
          instruments={instruments}
          services={services}
          parts={parts}
          isReparatiiPipeline={isReparatiiPipeline}
          canAddParts={canAddParts}
          selectedInstrument={selectedInstrument}
          instrumentForm={instrumentForm}
          onInstrumentChange={onInstrumentChange}
          onInstrumentDoubleClick={onInstrumentDoubleClick}
          onQtyChange={onQtyChange}
          onAddService={onAddService}
          onAddPart={onAddPart}
          onClearForm={onClearForm}
          onSvcDiscountChange={onSvcDiscountChange}
        />
      </div>
    )
  }

  return (
    <div className="pb-28" style={{ paddingBottom: 'max(7rem, calc(env(safe-area-inset-bottom) + 4rem))' }}>
      <Accordion type="multiple" defaultValue={groupedByInstrumentWithMergedRows.map(g => g.instrumentId)} className="px-3">
        {groupedByInstrumentWithMergedRows.map((group) => (
          <AccordionItem key={group.instrumentId} value={group.instrumentId} className="border-b border-slate-200 dark:border-slate-700">
            <AccordionTrigger className="py-4 min-h-[52px] hover:no-underline touch-manipulation">
              <div className="flex items-center gap-3 flex-1">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                  group.hasUrgent 
                    ? "bg-red-100 dark:bg-red-900/40" 
                    : "bg-slate-100 dark:bg-slate-800"
                )}>
                  <Wrench className={cn(
                    "h-5 w-5",
                    group.hasUrgent ? "text-red-600 dark:text-red-400" : "text-slate-500"
                  )} />
                </div>
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate w-full text-left">
                    {group.instrumentName}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{group.items.length} {group.items.length === 1 ? 'serviciu' : 'servicii'}</span>
                    <span>•</span>
                    <span>{group.totalQty} buc</span>
                    {group.totalNonRepairableQty > 0 && (
                      <>
                        <span>•</span>
                        <span>{group.totalNonRepairableQty} nereparabile</span>
                      </>
                    )}
                    {group.hasUrgent && (
                      <>
                        <span>•</span>
                        <span className="text-red-500 flex items-center gap-0.5">
                          <AlertTriangle className="h-3 w-3" />
                          Urgent
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right mr-2">
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-500">
                    {group.totalPrice.toFixed(2)} RON
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              <div className="space-y-2">
                {group.items.map((item) => (
                  <MobileItemCard
                    key={item.id}
                    item={item}
                    services={services}
                    onTap={() => handleItemTap(item)}
                    onDelete={() => handleItemDelete(item)}
                    onUpdateItem={onUpdateItem}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <Button
        onClick={() => setAddSheetOpen(true)}
        className="fixed right-5 h-14 w-14 rounded-full shadow-lg z-50 touch-manipulation"
        size="icon"
        style={{ bottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 2rem))' }}
        aria-label="Adaugă instrument"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Sheet pentru adăugare */}
      <MobileAddItemSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        instruments={instruments}
        services={services}
        parts={parts}
        isReparatiiPipeline={isReparatiiPipeline}
        canAddParts={canAddParts}
        selectedInstrument={selectedInstrument}
        instrumentForm={instrumentForm}
        onInstrumentChange={onInstrumentChange}
        onInstrumentDoubleClick={onInstrumentDoubleClick}
        onQtyChange={onQtyChange}
        onAddService={onAddService}
        onAddPart={onAddPart}
        onClearForm={onClearForm}
        onSvcDiscountChange={onSvcDiscountChange}
      />

      {/* Sheet pentru editare */}
      <MobileEditItemSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        item={selectedItem}
        services={services}
        instruments={instruments}
        technicians={technicians}
        canEditUrgentAndSubscription={canEditUrgentAndSubscription}
        canChangeTechnician={canChangeTechnician}
        onUpdateItem={onUpdateItem}
        onDelete={onDelete}
      />
    </div>
  )
}
