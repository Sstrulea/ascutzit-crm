'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2, Move, Package, Wrench, Tag, AlertTriangle, Pencil } from 'lucide-react'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import type { LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Technician } from '@/lib/types/preturi'
import { cn } from '@/lib/utils'

interface ItemsTableProps {
  items: LeadQuoteItem[]
  services: Service[]
  instruments: Array<{ id: string; name: string; repairable?: boolean }>
  technicians: Technician[]
  pipelinesWithIds: Array<{ id: string; name: string }>
  isReceptiePipeline: boolean
  canEditUrgentAndSubscription: boolean
  /** Deprecated: atribuirea tehnician se face la nivel de tăviță (trays.technician_id), nu per item. Păstrat pentru compatibilitate. */
  canChangeTechnician?: boolean
  onUpdateItem: (id: string, patch: Partial<LeadQuoteItem>) => void
  onDelete: (id: string) => void
  onRowClick?: (item: LeadQuoteItem) => void
  onMoveInstrument?: (instrumentGroup: { instrument: { id: string; name: string }; items: LeadQuoteItem[] }) => void
}

export function ItemsTable({
  items,
  services,
  instruments,
  technicians,
  pipelinesWithIds,
  isReceptiePipeline,
  canEditUrgentAndSubscription,
  canChangeTechnician = false,
  onUpdateItem,
  onDelete,
  onRowClick,
  onMoveInstrument,
}: ItemsTableProps) {
  // Normalizează props-urile pentru a evita erorile
  const safeItems = Array.isArray(items) ? items : []
  const safeServices = Array.isArray(services) ? services : []
  const safeInstruments = Array.isArray(instruments) ? instruments : []
  const safeTechnicians = Array.isArray(technicians) ? technicians : []
  const safePipelinesWithIds = Array.isArray(pipelinesWithIds) ? pipelinesWithIds : []
  
  // State pentru bifarea serial numberurilor
  const [verifiedSerials, setVerifiedSerials] = useState<Set<string>>(new Set())
  
  // Grupează items-urile pe (instrument, serviciu, piesă, tehnician) și însumează cantitățile,
  // astfel în detalii tăviță se văd rânduri unite (ex: Cleste x2 + Cleste x3 → Cleste x5)
  const groupedItems = useMemo(() => {
    const itemsMap = new Map<string, LeadQuoteItem[]>()
    
    if (!safeItems || safeItems.length === 0) {
      return []
    }
    
    const groupKey = (item: LeadQuoteItem) =>
      `${item.instrument_id ?? ''}_${item.service_id ?? ''}_${item.part_id ?? ''}`
    
    safeItems.forEach(item => {
      // Include items cu item_type null dacă au instrument_id (instrument fără serviciu)
      if (!item) return
      if (item.item_type === null && !item.instrument_id) return
      
      const key = groupKey(item)
      if (!itemsMap.has(key)) {
        itemsMap.set(key, [])
      }
      itemsMap.get(key)!.push(item)
    })
    
    const result: LeadQuoteItem[] = []
    itemsMap.forEach((groupItems, key) => {
      if (groupItems.length === 1) {
        result.push(groupItems[0])
      } else {
        const firstItem = groupItems[0]
        const brandGroupsMap = new Map<string, any>()
        
        groupItems.forEach(item => {
          if (!item) return
          const itemBrandGroups = item && typeof item === 'object' && Array.isArray((item as any)?.brand_groups) ? (item as any).brand_groups : []
          if (itemBrandGroups.length > 0) {
            itemBrandGroups.forEach((bg: any) => {
              if (!bg || typeof bg !== 'object') return
              const brandKey = bg?.brand || ''
              if (!brandGroupsMap.has(brandKey)) {
                brandGroupsMap.set(brandKey, {
                  brand: bg?.brand || '',
                  serialNumbers: [],
                  garantie: bg?.garantie || false
                })
              }
              const existingBg = brandGroupsMap.get(brandKey)
              if (!existingBg) return
              let serialNumbers: any[] = []
              if (bg && typeof bg === 'object' && 'serialNumbers' in bg) {
                const bgSerialNumbers = (bg as any).serialNumbers
                if (Array.isArray(bgSerialNumbers)) {
                  serialNumbers = bgSerialNumbers
                }
              }
              if (Array.isArray(serialNumbers) && serialNumbers.length > 0) {
                if (!Array.isArray(existingBg.serialNumbers)) {
                  existingBg.serialNumbers = []
                }
                existingBg.serialNumbers.push(...serialNumbers)
              }
            })
          } else if (item?.brand) {
            const brandKey = item.brand
            if (!brandGroupsMap.has(brandKey)) {
              brandGroupsMap.set(brandKey, {
                brand: item.brand || '',
                serialNumbers: item?.serial_number ? [item.serial_number] : [],
                garantie: item?.garantie || false
              })
            } else {
              const existingBg = brandGroupsMap.get(brandKey)
              if (existingBg && item?.serial_number) {
                if (!Array.isArray(existingBg.serialNumbers)) {
                  existingBg.serialNumbers = []
                }
                existingBg.serialNumbers.push(item.serial_number)
              }
            }
          }
        })
        
        const combinedItem: LeadQuoteItem = {
          ...firstItem,
          brand_groups: Array.from(brandGroupsMap.values()),
          qty: groupItems.reduce((sum, item) => sum + (item.qty || 1), 0),
          _mergedIds: groupItems.map(i => i.id),
        } as LeadQuoteItem & { _mergedIds?: string[] }
        result.push(combinedItem)
      }
    })
    
    return result
  }, [safeItems])
  
  // Include items cu item_type null dacă au instrument_id (instrument fără serviciu)
  const visibleItems = useMemo(() => groupedItems.filter(it => it.item_type !== null || it.instrument_id), [groupedItems])

  const getInstrumentName = (item: LeadQuoteItem): string => {
    try {
      // Instrument fără serviciu - are instrument_id direct pe item
      if (item.instrument_id && (item.item_type === null || !item.service_id)) {
        const instrument = safeInstruments.find(i => i && i.id === item.instrument_id)
        return instrument?.name || item.instrument_id || '—'
      }
      
      if (item.item_type === 'service' && item.service_id) {
        const serviceDef = safeServices.find(s => s && s.id === item.service_id)
        if (serviceDef?.instrument_id) {
          const instrument = safeInstruments.find(i => i && i.id === serviceDef.instrument_id)
          return instrument?.name || serviceDef.instrument_id || '—'
        }
      } else if (item.item_type === 'part') {
        const firstService = safeItems.find(i => i && i.item_type === 'service' && i.service_id)
        if (firstService?.service_id) {
          const serviceDef = safeServices.find(s => s && s.id === firstService.service_id)
          if (serviceDef?.instrument_id) {
            const instrument = safeInstruments.find(i => i && i.id === serviceDef.instrument_id)
            return instrument?.name || serviceDef.instrument_id || '—'
          }
        }
      }
    } catch (error: any) {
      console.error('[ItemsTable] Error in getInstrumentName:', error?.message || 'Unknown error')
    }
    return '—'
  }

  const isFirstItemOfInstrument = (item: LeadQuoteItem, allItems: LeadQuoteItem[]): boolean => {
    try {
      const safeAllItems = Array.isArray(allItems) ? allItems : []
      
      let currentInstrumentId: string | null = null
      if (item.item_type === 'service' && item.service_id) {
        const serviceDef = safeServices.find(s => s && s.id === item.service_id)
        currentInstrumentId = serviceDef?.instrument_id || null
      } else if (item.instrument_id) {
        currentInstrumentId = item.instrument_id
      }

      if (!currentInstrumentId) return false

      const instrumentItems = safeAllItems.filter(i => {
        if (!i) return false
        if (i.item_type === 'service' && i.service_id) {
          const svc = safeServices.find(s => s && s.id === i.service_id)
          return svc?.instrument_id === currentInstrumentId
        }
        return i.instrument_id === currentInstrumentId
      })

      return instrumentItems.length > 0 && instrumentItems[0]?.id === item.id
    } catch (error: any) {
      console.error('[ItemsTable] Error in isFirstItemOfInstrument:', error?.message || 'Unknown error')
      return false
    }
  }

  const buildInstrumentGroup = (item: LeadQuoteItem) => {
    try {
      let currentInstrumentId: string | null = null
      if (item.item_type === 'service' && item.service_id) {
        const serviceDef = safeServices.find(s => s && s.id === item.service_id)
        currentInstrumentId = serviceDef?.instrument_id || null
      } else if (item.instrument_id) {
        currentInstrumentId = item.instrument_id
      }

      if (!currentInstrumentId) return null

      const instrumentItems = safeItems.filter(i => {
        if (!i) return false
        if (i.item_type === 'service' && i.service_id) {
          const svc = safeServices.find(s => s && s.id === i.service_id)
          return svc?.instrument_id === currentInstrumentId
        }
        return i.instrument_id === currentInstrumentId
      })
      
      const instrument = safeInstruments.find(i => i && i.id === currentInstrumentId)
      
      const cleanedItems = instrumentItems.map(it => {
        let safeBrandGroups: Array<{ id: string; brand: string; serialNumbers: string[]; garantie: boolean }> = []
        if (Array.isArray(it.brand_groups)) {
          safeBrandGroups = it.brand_groups.map((bg: any) => ({
            id: typeof bg?.id === 'string' ? bg.id : String(bg?.id || ''),
            brand: typeof bg?.brand === 'string' ? bg.brand : String(bg?.brand || ''),
            serialNumbers: Array.isArray(bg?.serialNumbers) 
              ? bg.serialNumbers.map((sn: any) => typeof sn === 'string' ? sn : String(sn || ''))
              : [],
            garantie: Boolean(bg?.garantie)
          }))
        }
        
        return {
          id: typeof it.id === 'string' ? it.id : String(it.id || ''),
          tray_id: typeof it.tray_id === 'string' ? it.tray_id : String(it.tray_id || ''),
          item_type: it.item_type || null,
          service_id: it.service_id || null,
          part_id: it.part_id || null,
          instrument_id: it.instrument_id || null,
          qty: typeof it.qty === 'number' ? it.qty : 1,
          price: typeof it.price === 'number' ? it.price : 0,
          name_snapshot: typeof it.name_snapshot === 'string' ? it.name_snapshot : '',
          urgent: Boolean(it.urgent),
          brand_groups: safeBrandGroups,
        } as LeadQuoteItem
      })
      
      return {
        instrument: { id: currentInstrumentId, name: instrument?.name || 'Instrument necunoscut' },
        items: cleanedItems
      }
    } catch (error: any) {
      // console.log('[ItemsTable] Error building instrumentGroup:', error?.message || 'Unknown error')
      return null
    }
  }

  const renderBrandSerial = (item: LeadQuoteItem) => {
    try {
      const brandGroups = item && typeof item === 'object' && Array.isArray((item as any)?.brand_groups) ? (item as any).brand_groups : []
      // console.log(`[ItemsTable] Rendering brand/serial for item ${item.id}:`, brandGroups)
      
      if (brandGroups.length > 0) {
        return (
          <div className="flex flex-col gap-1">
            {brandGroups.flatMap((bg: any, bgIdx: number) => {
              if (!bg || typeof bg !== 'object') return []
              
              let serialNumbers: any[] = []
              if (bg && typeof bg === 'object' && 'serialNumbers' in bg && Array.isArray(bg.serialNumbers)) {
                serialNumbers = bg.serialNumbers
              }
              
              const brandName = bg.brand || '—'
              
              // IMPORTANT: Creează un badge separat pentru fiecare serial number, cu checkbox, afișat vertical pentru claritate
              return serialNumbers.map((sn: any, snIdx: number) => {
                const serial = typeof sn === 'string' ? sn : (sn && typeof sn === 'object' ? sn?.serial || '' : '')
                const serialDisplay = serial && serial.trim() ? serial.trim() : `Serial ${snIdx + 1}`
                const garantie = typeof sn === 'object' ? (sn?.garantie || false) : (bg.garantie || false)
                // Cheie unică pentru fiecare serial number
                const verificationKey = `${item.id}_${bgIdx}_${snIdx}`
                const isVerified = verifiedSerials.has(verificationKey)
                
                return (
                  <div 
                    key={`${bgIdx}-${snIdx}`}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium min-w-0 transition-all border",
                      isVerified
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-300 dark:border-green-700"
                        : garantie 
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700"
                        : "bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    )}
                  >
                    <Checkbox 
                      checked={isVerified}
                      onCheckedChange={(checked) => {
                        setVerifiedSerials((prev) => {
                          const newSet = new Set(prev)
                          if (checked) {
                            newSet.add(verificationKey)
                          } else {
                            newSet.delete(verificationKey)
                          }
                          return newSet
                        })
                      }}
                      className="h-3 w-3 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Tag className="h-3 w-3 flex-shrink-0" />
                    <span className="font-semibold text-[11px]">{brandName}</span>
                    <span className="text-slate-400 dark:text-slate-500">—</span>
                    <span className="truncate">{serialDisplay}</span>
                    {garantie && (
                      <span className="text-emerald-600 dark:text-emerald-400 flex-shrink-0">✓</span>
                    )}
                    {isVerified && (
                      <span className="text-green-600 dark:text-green-400 flex-shrink-0 ml-auto">✓✓</span>
                    )}
                  </div>
                )
              })
            })}
          </div>
        )
      } else {
        // Pentru instrumente fără brand_groups (ex: ascuțire), câmpuri editabile pe un rând
        return (
          <div className="flex flex-col gap-1.5">
            <Input
              className="h-8 text-xs rounded-lg border-slate-200 dark:border-slate-600 max-w-[130px]"
              placeholder="Brand..."
              value={item.brand || ''}
              onChange={e => {
                onUpdateItem(item.id, { brand: e.target.value || null });
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <Input
              className="h-8 text-xs rounded-lg border-slate-200 dark:border-slate-600 max-w-[130px]"
              placeholder="Serial..."
              value={item.serial_number || ''}
              onChange={e => {
                onUpdateItem(item.id, { serial_number: e.target.value || null });
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )
      }
      return <span className="text-muted-foreground text-xs">—</span>
    } catch (error) {
      console.error('❌ [ItemsTable] Error in brand/serial rendering:', error)
      return <span className="text-muted-foreground text-xs">—</span>
    }
  }

  if (visibleItems.length === 0) {
    return (
      <div className="mx-2 sm:mx-4 p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
            <Package className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Nu există poziții încă</p>
          <p className="text-xs text-muted-foreground mt-1">Adaugă un instrument și servicii pentru a începe</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-2 sm:mx-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="overflow-x-auto overscroll-contain min-w-0">
      {/* Header — grupare: Instrument & identificare | Serviciu | Valori | Nerepar | Acțiuni */}
      <div className={cn(
        "grid gap-3 px-5 py-3.5 min-w-[744px] bg-slate-100/80 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700",
        "grid-cols-[minmax(140px,1.2fr)_minmax(140px,1fr)_minmax(160px,1.5fr)_72px_72px_80px_96px_80px]"
      )}>
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-slate-500 shrink-0" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Instrument</span>
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Brand / Serial</span>
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Serviciu</span>
        </div>
        <div className="text-center w-[72px]">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Cant.</span>
        </div>
        <div className="text-center w-[72px]">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Preț</span>
        </div>
        <div className="text-right w-[80px]">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide tabular-nums">Total</span>
        </div>
        <div className="text-center w-[96px] min-w-[96px] border-l border-slate-200 dark:border-slate-600 pl-3" title="Câte bucăți nu se pot repara">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Nerepar.</span>
        </div>
        <div className="w-[80px]"></div>
      </div>

      {/* Rows — card-style cu spațiere clară */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {visibleItems.map((item, index) => {
          // Calculul liniei: (qty - nr. nereparate) * price; sursă: tray_items.unrepaired_qty sau notes
          const qty = item.qty || 1
          const unrepaired = Number((item as any).unrepaired_qty ?? (item as any).non_repairable_qty) || 0
          const repairableQty = Math.max(0, qty - unrepaired)
          const base = repairableQty * item.price
          const lineTotal = base // Discountul se aplică global la total, nu per linie

          const itemInstrument = getInstrumentName(item)
          // Instrument fără serviciu: item_type === null și are instrument_id
          const isInstrumentOnly = item.item_type === null && item.instrument_id
          const serviceName = item.item_type === 'service' 
            ? item.name_snapshot 
            : item.item_type === 'part' 
              ? 'Schimb piesă' 
              : isInstrumentOnly
                ? '(fără serviciu)'
                : ''

          // Butonul de mutare instrument - disponibil pentru TOATE pipeline-urile
          const isFirstItem = onMoveInstrument 
            ? isFirstItemOfInstrument(item, safeItems)
            : false
          // Afișăm instrumentul doar pe primul rând al grupului; pe celelalte rânduri celula rămâne goală (instrument și serviciu nu pe același rând)
          const isFirstRowOfInstrument = isFirstItemOfInstrument(item, visibleItems)
          const instrumentGroup = isFirstItem ? buildInstrumentGroup(item) : null

          return (
            <div 
              key={item.id}
              className={cn(
                "grid gap-3 px-5 py-3 items-center transition-all min-w-[744px] border-b border-slate-100 dark:border-slate-800 last:border-0",
                "grid-cols-[minmax(140px,1.2fr)_minmax(140px,1fr)_minmax(160px,1.5fr)_72px_72px_80px_96px_80px]",
                "hover:bg-slate-50/80 dark:hover:bg-slate-800/50",
                item.urgent && "bg-red-50/60 dark:bg-red-950/25 hover:bg-red-50 dark:hover:bg-red-950/35",
                index % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/40 dark:bg-slate-800/30"
              )}
            >
              {/* Instrument — doar pe primul rând al grupului; pe restul rândurilor celula e goală */}
              <div className="min-w-0">
                {isFirstRowOfInstrument ? (
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0",
                      item.urgent 
                        ? "bg-red-100 dark:bg-red-900/40" 
                        : "bg-slate-100 dark:bg-slate-800"
                    )}>
                      <Wrench className={cn(
                        "h-4 w-4",
                        item.urgent ? "text-red-600 dark:text-red-400" : "text-slate-500"
                      )} />
                    </div>
                    <div className="flex flex-col min-w-0 gap-0.5">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {itemInstrument}
                      </span>
                      {isFirstItem && instrumentGroup && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Total: {instrumentGroup.items.reduce((sum, i) => sum + (Number(i.qty) || 1), 0)} buc
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600 text-lg" aria-hidden title="Același instrument">↳</span>
                )}
              </div>

              {/* Brand / Serial */}
              <div className="min-w-0">
                {renderBrandSerial(item)}
              </div>

              {/* Serviciu */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {item.urgent && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-[10px] font-bold uppercase shrink-0">
                      <AlertTriangle className="h-3 w-3" />
                      Urgent
                    </span>
                  )}
                  <span className={cn(
                    "text-sm truncate",
                    isInstrumentOnly ? "italic text-slate-500 dark:text-slate-400" : "font-medium text-slate-900 dark:text-slate-100"
                  )}>
                    {serviceName}
                  </span>
                </div>
                {item.item_type === 'part' && (
                  <Input
                    className="mt-1.5 h-8 text-xs max-w-full"
                    value={item.name_snapshot || ''}
                    onChange={e => onUpdateItem(item.id, { name_snapshot: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Nume piesă"
                  />
                )}
              </div>

              {/* Cantitate */}
              <div className="flex justify-center w-[72px]">
                <Input
                  className="h-9 w-14 text-sm text-center font-medium bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 rounded-lg"
                  inputMode="numeric"
                  value={String(item.qty || 1)}
                  disabled={!!(item as any)._mergedIds?.length}
                  onChange={e => {
                    const v = Math.max(1, Number(e.target.value || 1))
                    onUpdateItem(item.id, { qty: v })
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title={(item as any)._mergedIds?.length ? 'Cantitate din mai multe rânduri – folosiți Reunește pentru a edita' : undefined}
                />
              </div>

              {/* Preț */}
              <div className="flex justify-center w-[72px]">
                {item.item_type === 'service' ? (
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                    {item.price.toFixed(2)}
                  </span>
                ) : (
                  <Input
                    className="h-9 w-14 text-sm text-center font-medium bg-slate-50 dark:bg-slate-800 rounded-lg"
                    inputMode="decimal"
                    value={String(item.price)}
                    onChange={e => {
                      const v = Math.max(0, Number(e.target.value || 0))
                      onUpdateItem(item.id, { price: v })
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>

              {/* Total */}
              <div className="text-right w-[80px]">
                <span className={cn(
                  "text-sm font-semibold tabular-nums",
                  item.urgent 
                    ? "text-red-600 dark:text-red-400" 
                    : "text-slate-900 dark:text-slate-100"
                )}>
                  {lineTotal.toFixed(2)}
                </span>
              </div>

              {/* Nerepar. — casetă full width pentru vizibilitate */}
              <div className="flex items-center justify-center w-[96px] min-w-[96px] border-l border-slate-200 dark:border-slate-600 pl-3">
                <Input
                  type="number"
                  min={0}
                  max={item.qty ?? 1}
                  inputMode="numeric"
                  className="h-10 w-full min-w-[3rem] max-w-[4.5rem] text-sm text-center font-medium rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm"
                  disabled={!!(item as any)._mergedIds?.length}
                  value={(() => {
                    const qty = item.qty ?? 1
                    const n = (item as any).unrepaired_qty ?? (item as any).non_repairable_qty
                    const num = typeof n === 'number' && Number.isFinite(n) ? n : 0
                    return String(Math.min(qty, Math.max(0, num)))
                  })()}
                  onChange={e => {
                    const qty = item.qty ?? 1
                    const raw = parseInt(e.target.value, 10)
                    const prev = (item as any).unrepaired_qty ?? (item as any).non_repairable_qty ?? 0
                    const v = Number.isFinite(raw) ? Math.min(qty, Math.max(0, raw)) : prev
                    const safe = typeof v === 'number' && Number.isFinite(v) ? v : 0
                    onUpdateItem(item.id, { non_repairable_qty: Math.min(qty, Math.max(0, safe)) })
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title={(item as any)._mergedIds?.length ? 'Reuniți mai întâi pentru a edita' : 'Câte bucăți nu se pot repara (ex. 1 din 2)'}
                />
              </div>
              {/* Actions */}
              <div className="flex justify-end gap-1 w-[80px]">
                {/* Buton editare */}
                {onRowClick && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded-lg" 
                    onClick={(e) => {
                      e.stopPropagation()
                      onRowClick(item)
                    }}
                    title="Editează înregistrarea"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {/* Buton mutare instrument - disponibil pentru TOATE pipeline-urile */}
                {isFirstItem && instrumentGroup && onMoveInstrument && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg" 
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveInstrument(instrumentGroup)
                    }}
                    title={`Mută instrumentul "${instrumentGroup.instrument.name}"`}
                  >
                    <Move className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg" 
                  onClick={(e) => {
                    e.stopPropagation()
                    const ids = (item as any)._mergedIds as string[] | undefined
                    if (ids?.length) ids.forEach(id => onDelete(id))
                    else onDelete(item.id)
                  }}
                  title={(item as any)._mergedIds?.length ? 'Șterge toate rândurile din grup' : 'Șterge înregistrarea'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}
