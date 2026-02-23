'use client'

import { useState, useMemo, useCallback, Fragment, useEffect, useRef } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Calendar } from '@/components/ui/calendar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Loader2, Trash2, CalendarIcon, Clock, Plus, Minus, X, Package, Printer, ChevronDown, ChevronRight, Check, GitMerge, Pencil, FileCheck } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import { readReceptieDraft, writeReceptieDraft } from '@/lib/history/receptieDraftCache'
import { logButtonEvent } from '@/lib/supabase/leadOperations'
import { useAuth } from '@/lib/contexts/AuthContext'

// ============================================================================
// TYPES
// ============================================================================

interface SelectedInstrument {
  id: string
  localId: string // UUID local pentru React key
  name: string
  quantity: number
  serialNumber: string
  /** Discount la nivel de instrument (0–100 %), aplicat pe servicii/piese. */
  discount?: number
  /** Garantie la nivel de instrument. */
  garantie?: boolean
}

interface SelectedService {
  instrumentLocalId: string
  serviceId: string
  serviceName: string
  basePrice: number
  /** Cantitate instrument pentru ACEASTĂ înregistrare din tabel (QT per rând, independent de card). */
  instrumentQty?: number
  quantity: number
  discount: number
  unrepairedCount: number
  /** S/N-uri la care e atribuit serviciul; gol = întreg instrumentul. Permite selecție multiplă. */
  forSerialNumbers?: string[]
  /** @deprecated folosit doar la citire pentru compatibilitate; preferă forSerialNumbers */
  forSerialNumber?: string
  /** Id-ul tăviței în care se află înregistrarea (opțional). */
  trayId?: string
}

interface Part {
  id: string // UUID local
  instrumentLocalId: string
  name: string
  unitPrice: number
  quantity: number
  /** S/N-uri la care e atribuită piesa; gol = întreg instrumentul. */
  forSerialNumbers?: string[]
  /** QT instrument pentru această înregistrare (independent per rând). */
  instrumentQty?: number
  /** Id-ul tăviței în care se află înregistrarea (opțional). */
  trayId?: string
}

/** Tăviță creată local în view (număr). */
export interface LocalTray {
  id: string
  number: string
}

export interface VanzariViewV4Props {
  // Data
  availableInstruments: Array<{ id: string; name: string }>
  services: Service[]
  /** Date încărcate din DB la deschiderea fișei (tray_items → instruments, services, parts, trays). */
  initialData?: import('@/lib/history/vanzariViewV4Load').V4InitialData | null

  // State extern (pentru integrare cu sistemul existent)
  urgentAllServices: boolean
  officeDirect: boolean
  curierTrimis: boolean
  retur: boolean
  subscriptionType: 'services' | 'parts' | 'both' | ''
  loading: boolean
  saving: boolean
  isDirty: boolean
  isServiceFileLocked?: boolean
  
  // Callbacks
  onUrgentChange: (checked: boolean) => Promise<void>
  onOfficeDirectChange: (isOfficeDirect: boolean) => Promise<void>
  onCurierTrimisChange?: (checked: boolean, dateTime?: string) => Promise<void>
  onReturChange?: (checked: boolean) => Promise<void>
  onSubscriptionChange: (value: 'services' | 'parts' | 'both' | '') => void
  onSave: (data: {
    instruments: SelectedInstrument[]
    services: SelectedService[]
    parts: Part[]
    trays: LocalTray[]
    instrumentTrayId?: Record<string, string | undefined>
  }) => void
  /** Salvează doar opțiunile (Urgent, Retur, Office, Curier) fără instrumente/tăvițe. */
  onSaveOptionsOnly?: () => void
  onClose?: () => void
  /** Titlu custom (ex. "Recepție Comandă" pentru pipeline Recepție) */
  sectionTitle?: string
  /** Pentru Recepție: deschide dialogul "Trimite tăvițele în departamente" */
  onSendTrays?: () => void
  /** Dezactivează butonul Trimite tăvițele (ex.: nici o tăviță sau instrumente fără tăviță) */
  sendTraysDisabled?: boolean
  /** Motiv afișat la hover când butonul „Trimite tăvițele” este dezactivat. */
  sendTraysDisabledReason?: string
  /** Ref în care punem getter pentru datele curente – folosit la confirmare Trimite tăvițele pentru salvare în istoric. */
  getV4DataRef?: React.MutableRefObject<(() => { instruments: SelectedInstrument[]; services: SelectedService[]; parts: Part[]; trays: LocalTray[]; instrumentTrayId?: Record<string, string | undefined> }) | null>
  /** Raportează la parent instrumentele fără tăviță (pentru dezactivare buton + toast). */
  onSendTraysValidityChange?: (unassignedNames: string[]) => void
  /** ID fișă serviciu – când setat (Recepție), draft-ul se salvează în cache la modificări și se restaurează la revenire pe tab. */
  fisaIdForCache?: string | null
  /** ID fișă serviciu pentru logging în istoric lead (butoane activate). */
  serviceFileId?: string | null
  /** Pentru Recepție (admin): validare QC directă pe tăviță */
  onValidateTrayQc?: (trayId: string) => Promise<void>
  /** Deschide dialogul de print tăvițe (A4). */
  onPrintTrays?: () => void
  /** Pentru departamente tehnice: acțiuni extra (Împarte tăvița, Reunește, etc.) afișate într-un dropdown */
  departmentActions?: Array<{ label: string; onClick: () => void }>
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

/** Pentru input type="number": evită NaN (React nu acceptă value={NaN}) */
function safeNumInputVal(n: number): number | '' {
  return Number.isFinite(n) ? n : ''
}

/** Parsează numerele de serie din câmpul S/N (linii sau virgulă) */
function parseSerialNumbers(serialNumber: string): string[] {
  if (!serialNumber?.trim()) return []
  return serialNumber
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** Returnează lista de S/N-uri atribuite serviciului (suportă și câmpul vechi forSerialNumber) */
function getServiceSerialNumbers(svc: SelectedService): string[] {
  if (svc.forSerialNumbers && svc.forSerialNumbers.length > 0) return svc.forSerialNumbers
  if (svc.forSerialNumber) return [svc.forSerialNumber]
  return []
}

/** Returnează lista de S/N-uri atribuite piesei */
function getPartSerialNumbers(part: Part): string[] {
  return part.forSerialNumbers?.length ? part.forSerialNumbers : []
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface InstrumentCardProps {
  instrument: SelectedInstrument
  availableServices: Service[]
  selectedServices: SelectedService[]
  parts: Part[]
  trays: LocalTray[]
  /** Tăviță preferată pentru acest instrument (setată din dropdown chiar dacă nu are încă servicii/piese). */
  preferredTrayId?: string
  isLocked: boolean
  isOpen: boolean
  onToggleOpen: () => void
  onQuantityChange: (qty: number) => void
  onSerialNumberChange: (sn: string) => void
  onToggleService: (serviceId: string, serviceName: string, price: number, selected: boolean) => void
  onAddPart: (name: string, price: number) => void
  onUpdatePartQty: (partId: string, qty: number) => void
  onRemovePart: (partId: string) => void
  onUpdateInstrumentTray: (trayId: string | undefined) => void
  onRemove: () => void
  onDiscountChange: (value: number) => void
  onGarantieChange: (checked: boolean) => void
}

function InstrumentCard({
  instrument,
  availableServices,
  selectedServices,
  parts,
  trays,
  preferredTrayId,
  isLocked,
  isOpen,
  onToggleOpen,
  onQuantityChange,
  onSerialNumberChange,
  onToggleService,
  onAddPart,
  onUpdatePartQty,
  onRemovePart,
  onUpdateInstrumentTray,
  onRemove,
  onDiscountChange,
  onGarantieChange,
}: InstrumentCardProps) {
  const [newPartName, setNewPartName] = useState('')
  const [newPartPrice, setNewPartPrice] = useState('')

  const instrumentSelectedServices = selectedServices.filter(s => s.instrumentLocalId === instrument.localId)
  const instrumentParts = parts.filter(p => p.instrumentLocalId === instrument.localId)
  const currentTrayId = instrumentSelectedServices[0]?.trayId ?? instrumentParts[0]?.trayId ?? preferredTrayId

  const handleAddPart = () => {
    if (newPartName.trim() && newPartPrice) {
      onAddPart(newPartName.trim(), parseFloat(newPartPrice))
      setNewPartName('')
      setNewPartPrice('')
    }
  }

  const instrumentServices = availableServices.filter(s => s.instrument_id === instrument.id)

  // Calculează subtotal pentru acest instrument
  const instrumentSubtotal = useMemo(() => {
    let total = 0
    instrumentSelectedServices.forEach(svc => {
      const base = svc.basePrice * svc.quantity
      total += base * (1 - svc.discount / 100)
    })
    instrumentParts.forEach(part => {
      total += part.quantity * part.unitPrice
    })
    return total
  }, [instrumentSelectedServices, instrumentParts])

  return (
    <Collapsible open={isOpen} onOpenChange={onToggleOpen}>
      <div className="border border-[#3D434D]/15 dark:border-[#3D434D]/30 rounded-xl bg-card overflow-hidden shadow-sm">
        {/* Header - mereu vizibil: chevron + nume + cantitate (trigger), tăviță (dropdown), șterge */}
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
              {isOpen ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
              <span className="font-semibold text-base text-slate-800 dark:text-slate-200 truncate">
                {instrument.name}
              </span>
              <span className="text-sm text-muted-foreground font-normal tabular-nums shrink-0">×{instrument.quantity}</span>
            </div>
          </CollapsibleTrigger>
          {/* Cantitate – +/- în header */}
          {!isLocked && (
            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-0.5 shrink-0">
              <Button
                data-button-id="vanzariViewInstrumentQtyMinus"
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-r-none border-r-0"
                onClick={() => onQuantityChange(Math.max(1, instrument.quantity - 1))}
                title="Scade cantitatea cu 1"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="h-7 min-w-[2rem] flex items-center justify-center border border-border bg-background px-1.5 text-sm tabular-nums text-center">
                {instrument.quantity}
              </span>
              <Button
                data-button-id="vanzariViewInstrumentQtyPlus"
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-l-none"
                onClick={() => onQuantityChange(instrument.quantity + 1)}
                title="Crește cantitatea cu 1"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {/* Atribuie tăviță – pe card, fără a deschide tabelul */}
          {!isLocked && trays.length > 0 && (
            <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
              <Select
                value={currentTrayId ?? '__none__'}
                onValueChange={(v) => onUpdateInstrumentTray(v === '__none__' ? undefined : v)}
              >
                <SelectTrigger className="h-7 text-xs w-[95px] border-border/60 bg-background">
                  <SelectValue placeholder="Tăviță">
                    {currentTrayId
                      ? `#${trays.find((t) => t.id === currentTrayId)?.number ?? ''}`
                      : '—'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {trays.map((t) => (
                    <SelectItem key={t.id} value={t.id}>#{t.number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!isLocked && (
            <Button 
              data-button-id="vanzariViewRemoveInstrumentButton"
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-destructive hover:bg-destructive/10 flex-shrink-0" 
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              title="Șterge instrumentul din listă"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <CollapsibleContent>
          {/* Serial Number - mai mult spațiu */}
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">S/N (opțional, unul per linie sau separate prin virgulă):</span>
              <Textarea
                placeholder="Unul per linie sau separate prin virgulă..."
                value={instrument.serialNumber}
                onChange={(e) => onSerialNumberChange(e.target.value)}
                className="min-h-[80px] text-sm w-full resize-y"
                disabled={isLocked}
                rows={4}
              />
            </div>
          </div>

          {/* Discount instrument + Garantie */}
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">Discount %</Label>
              {isLocked ? (
                <span className="text-sm tabular-nums">{instrument.discount ?? 0}</span>
              ) : (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={safeNumInputVal(instrument.discount ?? 0)}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => onDiscountChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-16 h-8 text-center text-sm"
                />
              )}
            </div>
            <label className={cn("flex items-center gap-2", !isLocked && "cursor-pointer")}>
              <Checkbox
                checked={instrument.garantie ?? false}
                onCheckedChange={(c) => !isLocked && onGarantieChange(!!c)}
                disabled={isLocked}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">Garantie</span>
            </label>
          </div>
          
          {/* Servicii - layout ca în CRM, culori CRM, rânduri alternante */}
          <div className="px-4 py-3 border-t border-border">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
              Servicii ({instrumentSelectedServices.length}/{instrumentServices.length})
            </p>
            {instrumentServices.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-x divide-border">
                  {[
                    instrumentServices.slice(0, Math.ceil(instrumentServices.length / 2)),
                    instrumentServices.slice(Math.ceil(instrumentServices.length / 2)),
                  ].map((colServices, colIndex) => (
                    <div key={colIndex} className="flex flex-col">
                      {colServices.map((service, idx) => {
                        const isSelected = instrumentSelectedServices.some(s => s.serviceId === service.id)
                        const stripe = idx % 2 === 0
                        return (
                          <label
                            key={service.id}
                            className={cn(
                              "flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer transition-colors text-sm",
                              stripe ? "bg-muted/50 dark:bg-muted/20" : "bg-card",
                              idx < colServices.length - 1 && "border-b border-border",
                              isSelected && "bg-[#3D434D]/10 dark:bg-[#3D434D]/15 border-[#3D434D]/20",
                              isLocked && "cursor-not-allowed opacity-60"
                            )}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => !isLocked && onToggleService(service.id, service.name, service.price, !!checked)}
                                disabled={isLocked}
                                className="h-4 w-4 shrink-0 border-border"
                              />
                              <span className={cn(
                                "truncate text-foreground",
                                isSelected && "text-[#3D434D] dark:text-[#8b92a0] font-medium"
                              )}>
                                {service.name}
                              </span>
                            </div>
                            <span className="text-muted-foreground shrink-0 text-sm tabular-nums">{service.price.toFixed(0)} lei</span>
                          </label>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4 rounded-lg border border-border bg-card">Fără servicii</p>
            )}
          </div>
          
          {/* Piese - text mai mare, mai mult spațiu */}
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Piese ({instrumentParts.length})
            </p>
            
            {instrumentParts.length > 0 && (
              <div className="space-y-2 mb-3">
                {instrumentParts.map(part => (
                  <div key={part.id} className="flex items-center justify-between text-sm bg-white dark:bg-slate-900 rounded-lg px-3 py-2">
                    <span className="font-medium truncate flex-1">{part.name}</span>
                    <div className="flex items-center gap-2">
                      <Button 
                        data-button-id="vanzariViewPartQtyMinus"
                        variant="outline" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => onUpdatePartQty(part.id, Math.max(1, part.quantity - 1))}
                        disabled={isLocked}
                        title="Scade cantitatea piesei cu 1"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm">{part.quantity}</span>
                      <Button 
                        data-button-id="vanzariViewPartQtyPlus"
                        variant="outline" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => onUpdatePartQty(part.id, part.quantity + 1)}
                        disabled={isLocked}
                        title="Crește cantitatea piesei cu 1"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="text-muted-foreground mx-1">×</span>
                      <span className="w-14 text-right text-sm">{part.unitPrice.toFixed(2)}</span>
                      <span className="font-medium w-16 text-right text-sm">{(part.quantity * part.unitPrice).toFixed(2)}</span>
                      {!isLocked && (
                        <Button 
                          data-button-id="vanzariViewRemovePartButton"
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-destructive hover:bg-destructive/10"
                          onClick={() => onRemovePart(part.id)}
                          title="Șterge piesa din listă"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Adaugă piesă - text mai mare */}
            {!isLocked && (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Piesă..."
                  value={newPartName}
                  onChange={(e) => setNewPartName(e.target.value)}
                  className="h-8 text-sm flex-1"
                />
                <Input
                  type="number"
                  placeholder="Preț"
                  value={newPartPrice}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setNewPartPrice(e.target.value)}
                  className="h-8 text-sm w-20"
                  min="0"
                  step="0.01"
                />
                <Button 
                  data-button-id="vanzariViewAddPartButton"
                  variant="outline" 
                  size="sm"
                  onClick={handleAddPart}
                  disabled={!newPartName.trim() || !newPartPrice}
                  className="h-8 text-sm px-3"
                  title="Adaugă piesă (nume + preț)"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// ============================================================================
// SUMMARY TABLE
// ============================================================================

interface SummaryTableProps {
  instruments: SelectedInstrument[]
  selectedServices: SelectedService[]
  parts: Part[]
  trays: LocalTray[]
  urgentAllServices: boolean
  isLocked: boolean
  /** Cantitate instrument per înregistrare în tabel (independentă de QT din card). Cheie = localId. */
  instrumentQuantityInTable: Record<string, number>
  onAddTray: (number: string) => void
  onRemoveTray: (trayId: string) => void
  onUpdateTray: (trayId: string, newNumber: string) => void
  onUpdateServiceTray: (instrumentLocalId: string, serviceId: string, trayId: string | undefined) => void
  onUpdatePartTray: (partId: string, trayId: string | undefined) => void
  /** Actualizează tăvița pentru întreg instrumentul (toate serviciile și piese); se folosește pentru celula unică Tăviță per instrument. */
  onUpdateInstrumentTray: (instrumentLocalId: string, trayId: string | undefined) => void
  onUpdateServiceInstrumentQty: (instrumentLocalId: string, serviceId: string, qty: number) => void
  onUpdateDiscount: (instrumentLocalId: string, serviceId: string, discount: number) => void
  onUpdateUnrepaired: (instrumentLocalId: string, serviceId: string, count: number) => void
  onUpdateServiceQty: (instrumentLocalId: string, serviceId: string, qty: number) => void
  onUpdateServicePrice: (instrumentLocalId: string, serviceId: string, price: number) => void
  onUpdatePartPrice: (partId: string, unitPrice: number) => void
  onUpdatePartQty: (partId: string, qty: number) => void
  onUpdatePartForSerialNumbers: (partId: string, forSerialNumbers: string[]) => void
  onUpdatePartInstrumentQty: (partId: string, qty: number) => void
  onUpdateServiceForSerialNumbers: (instrumentLocalId: string, serviceId: string, forSerialNumbers: string[]) => void
  onUpdateTableInstrumentQuantity: (instrumentLocalId: string, quantity: number) => void
  onUpdateInstrumentGarantie: (instrumentLocalId: string, checked: boolean) => void
  /** Validare QC din Recepție (doar admin) */
  onValidateTrayQc?: (trayId: string) => Promise<void>
}

function SummaryTable({
  instruments,
  selectedServices,
  parts,
  trays,
  urgentAllServices,
  isLocked,
  instrumentQuantityInTable,
  onAddTray,
  onRemoveTray,
  onUpdateTray,
  onUpdateServiceTray,
  onUpdatePartTray,
  onUpdateInstrumentTray,
  onUpdateServiceInstrumentQty,
  onUpdateDiscount,
  onUpdateUnrepaired,
  onUpdateServiceQty,
  onUpdateServicePrice,
  onUpdatePartPrice,
  onUpdatePartQty,
  onUpdatePartForSerialNumbers,
  onUpdatePartInstrumentQty,
  onUpdateServiceForSerialNumbers,
  onUpdateTableInstrumentQuantity,
  onUpdateInstrumentGarantie,
  onValidateTrayQc,
}: SummaryTableProps) {
  // Grupare per instrument
  const groupedData = useMemo(() => {
    return instruments.map(inst => ({
      ...inst,
      services: selectedServices.filter(s => s.instrumentLocalId === inst.localId),
      parts: parts.filter(p => p.instrumentLocalId === inst.localId),
    })).filter(inst => inst.services.length > 0 || inst.parts.length > 0)
  }, [instruments, selectedServices, parts])

  const tableQty = (localId: string, fallback: number) => instrumentQuantityInTable[localId] ?? fallback

  // Calcul totale (garantie activată => suma = 0 pentru acel instrument)
  const { subtotal, urgentMarkup, total } = useMemo(() => {
    const garantieByLocalId = new Map(instruments.map(i => [i.localId, i.garantie ?? false]))
    let sub = 0

    selectedServices.forEach(svc => {
      if (garantieByLocalId.get(svc.instrumentLocalId)) return
      const base = svc.quantity * svc.basePrice
      const afterDiscount = base * (1 - svc.discount / 100)
      sub += afterDiscount
    })

    parts.forEach(part => {
      if (garantieByLocalId.get(part.instrumentLocalId)) return
      sub += part.quantity * part.unitPrice
    })

    const urgent = urgentAllServices ? sub * (URGENT_MARKUP_PCT / 100) : 0

    return {
      subtotal: sub,
      urgentMarkup: urgent,
      total: sub + urgent,
    }
  }, [instruments, selectedServices, parts, urgentAllServices])

  // Număr total de linii în tabel
  const totalLines = groupedData.reduce((acc, inst) => acc + inst.services.length + inst.parts.length, 0)

  const [newTrayNumber, setNewTrayNumber] = useState('')
  const [editingTrayId, setEditingTrayId] = useState<string | null>(null)
  const [editNumber, setEditNumber] = useState('')

  const handleAddTraySubmit = () => {
    const raw = newTrayNumber.trim()
    if (!raw) return
    const numbers = raw.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
    numbers.forEach(num => onAddTray(num))
    setNewTrayNumber('')
  }

  const openEditTray = (tray: LocalTray) => {
    setEditingTrayId(tray.id)
    setEditNumber(tray.number || '')
  }

  const handleSaveEditTray = () => {
    if (!editingTrayId || !editNumber.trim()) return
    onUpdateTray(editingTrayId, editNumber.trim())
    setEditingTrayId(null)
  }

  /** Tăvița există în DB (UUID) – validare QC disponibilă doar pentru ele */
  const isRealTrayId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)

  const renderTrayTag = (tray: LocalTray) => (
    <span
      key={tray.id}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-300"
    >
      #{tray.number}
      {onValidateTrayQc && isRealTrayId(tray.id) && (
        <button
          type="button"
          data-button-id="vanzariViewValidateQcButton"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onValidateTrayQc(tray.id) }}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 -m-1.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 touch-manipulation"
          aria-label="Validare QC"
          title="Validare QC (admin)"
        >
          <FileCheck className="h-3.5 w-3.5" />
        </button>
      )}
      {!isLocked && (
        <>
          <Popover open={editingTrayId === tray.id} onOpenChange={(open) => !open && setEditingTrayId(null)}>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-button-id="vanzariViewEditTrayButton"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditTray(tray) }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 -m-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 touch-manipulation"
                aria-label="Editează tăvița"
                title="Editează nr. tăviței"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="start" onClick={(e) => e.stopPropagation()}>
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Editează nr. tăviței</p>
                <div>
                  <Label className="text-xs text-slate-500">Număr</Label>
                  <Input
                    placeholder="ex: 26, 27..."
                    value={editNumber}
                    onChange={(e) => setEditNumber(e.target.value)}
                    className="h-9 text-sm mt-1"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button data-button-id="vanzariViewTrayEditCancelButton" variant="outline" size="sm" onClick={() => setEditingTrayId(null)} title="Anulează editarea tăviței">
                    Anulează
                  </Button>
                  <Button data-button-id="vanzariViewTrayEditSaveButton" size="sm" onClick={handleSaveEditTray} disabled={!editNumber.trim()} title="Salvează modificările tăviței">
                    Salvează
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <button type="button" data-button-id="vanzariViewRemoveTrayButton" onClick={() => onRemoveTray(tray.id)} className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-destructive" aria-label="Șterge" title="Șterge tăvița"><X className="h-3 w-3" /></button>
        </>
      )}
    </span>
  )

  if (groupedData.length === 0) {
    return (
      <div className="border border-[#3D434D]/15 dark:border-[#3D434D]/30 rounded-xl overflow-hidden bg-[#3D434D]/5 dark:bg-[#3D434D]/10">
        {/* Tăvițe – aceeași formă ca în imaginea 2: un rând (etichetă, input, buton, tag-uri) */}
        <div className="px-4 py-2 border-b border-[#3D434D]/15 dark:border-[#3D434D]/30 bg-[#3D434D]/5 dark:bg-[#3D434D]/10 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[#3D434D]/80 dark:text-[#8b92a0]">Tăvițe:</span>
          {!isLocked && (
            <>
              <Input
                placeholder="Nr. tăvițe (ex: 1, 2, 3)"
                value={newTrayNumber}
                onChange={(e) => setNewTrayNumber(e.target.value)}
                className="w-40 h-7 text-xs"
              />
              <Button data-button-id="vanzariViewAddTraysButton" type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={handleAddTraySubmit} disabled={!newTrayNumber.trim()} title="Adaugă o nouă tăviță cu numărul specificat">
                <Plus className="h-3 w-3 mr-1" />
                Adaugă tăvițe
              </Button>
            </>
          )}
          {trays.map((tray) => renderTrayTag(tray))}
        </div>
        <div className="p-6 text-center text-base text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <span>Adaugă instrumente și selectează servicii</span>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-[#3D434D]/15 dark:border-[#3D434D]/30 rounded-xl overflow-hidden shadow-sm">
      {/* Tăvițe - creare și listă (și când există date) */}
      <div className="px-4 py-2 border-b border-[#3D434D]/15 dark:border-[#3D434D]/30 bg-[#3D434D]/5 dark:bg-[#3D434D]/10 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[#3D434D]/80 dark:text-[#8b92a0]">Tăvițe:</span>
        {!isLocked && (
          <>
            <Input
              placeholder="Nr. tăvițe (ex: 1, 2, 3)"
              value={newTrayNumber}
              onChange={(e) => setNewTrayNumber(e.target.value)}
              className="w-40 h-7 text-xs"
            />
            <Button data-button-id="vanzariViewAddTraysButton" type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={handleAddTraySubmit} disabled={!newTrayNumber.trim()} title="Adaugă tăvițe (nr. din câmp)">
              <Plus className="h-3 w-3 mr-1" />
              Adaugă tăvițe
            </Button>
          </>
        )}
          {trays.map((tray) => renderTrayTag(tray))}
      </div>
      {/* Header cu total vizibil mereu - text mai mare, mai mult spațiu */}
      <div className="bg-[#3D434D]/10 dark:bg-[#3D434D]/20 px-4 py-3 border-b border-[#3D434D]/15 dark:border-[#3D434D]/30 flex items-center justify-between">
        <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          📋 SUMAR ({totalLines} {totalLines === 1 ? 'articol' : 'articole'})
        </h4>
        <div className="flex items-center gap-3">
          {urgentAllServices && (
            <span className="text-xs font-medium px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
              URGENT +{URGENT_MARKUP_PCT}%
            </span>
          )}
          <span className="text-base font-bold text-[#3D434D] dark:text-[#8b92a0]">{total.toFixed(2)} lei</span>
        </div>
      </div>
      
      {/* Tabel - text mai mare, padding mărit, preț editabil */}
      <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-[#3D434D]/5 dark:bg-[#3D434D]/15 sticky top-0 z-10">
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase w-28">Tăviță</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Instrument</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase min-w-[140px]">Serie</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase w-12">Cant.</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Articol</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase w-14">Cant. serv.</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase w-14">Disc</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase w-14">Ner</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase w-16">Garantie</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase w-24">Preț unit.</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase w-20">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {groupedData.map((inst, instIdx) => {
              const totalRows = inst.services.length + inst.parts.length
              
              return (
                <Fragment key={inst.localId}>
                  {/* Servicii */}
                  {inst.services.map((svc, svcIdx) => {
                    const rowInstrumentQty = svc.instrumentQty ?? tableQty(inst.localId, inst.quantity)
                    // NER scade din total: Suma totală - NER × preț serviciu
                    const nerDeduction = (svc.unrepairedCount || 0) * svc.basePrice
                    const base = svc.quantity * svc.basePrice
                    const baseAfterNer = base - nerDeduction
                    const afterDiscount = baseAfterNer * (1 - svc.discount / 100)
                    const lineTotal = (inst.garantie ?? false) ? 0 : (urgentAllServices ? afterDiscount * (1 + URGENT_MARKUP_PCT / 100) : afterDiscount)
                    const serials = parseSerialNumbers(inst.serialNumber)
                    const hasSerials = serials.length > 0
                    
                    return (
                      <tr key={`${inst.localId}-svc-${svcIdx}-${svc.serviceId}`} className={cn(
                        "hover:bg-slate-50 dark:hover:bg-slate-800/40",
                        instIdx % 2 === 1 && "bg-slate-50/50 dark:bg-slate-800/20"
                      )}>
                        {svcIdx === 0 ? (
                          <td rowSpan={totalRows} className="px-3 py-2 align-top">
                            {trays.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : isLocked ? (
                              <span className="text-xs">
                                {(inst.services[0]?.trayId ?? inst.parts[0]?.trayId)
                                  ? (trays.find(t => t.id === (inst.services[0]?.trayId ?? inst.parts[0]?.trayId)) ? `#${trays.find(t => t.id === (inst.services[0]?.trayId ?? inst.parts[0]?.trayId))!.number}` : '—')
                                  : '—'}
                              </span>
                            ) : (
                              <Select
                                value={(inst.services[0]?.trayId ?? inst.parts[0]?.trayId) ?? '__none__'}
                                onValueChange={(v) => onUpdateInstrumentTray(inst.localId, v === '__none__' ? undefined : v)}
                              >
                                <SelectTrigger className="h-7 text-xs w-full max-w-[100px]">
                                  <SelectValue placeholder="Tăviță" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">—</SelectItem>
                                  {trays.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>#{t.number}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                        ) : null}
                        {svcIdx === 0 && (
                          <td rowSpan={totalRows} className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 align-top text-sm">
                            {inst.name}
                          </td>
                        )}
                        <td className="px-3 py-2 text-xs text-muted-foreground align-top min-w-[140px] max-w-[220px]">
                          {hasSerials ? (
                            isLocked ? (
                              <span className="block whitespace-normal break-words">
                                {getServiceSerialNumbers(svc).length === 0 ? 'Toate' : getServiceSerialNumbers(svc).join(', ')}
                              </span>
                            ) : (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button data-button-id="vanzariViewServiceSerialNumbersTrigger" variant="outline" size="sm" className="min-h-7 h-auto py-1.5 px-2 text-xs w-full max-w-full justify-between font-normal text-left" title="Deschide selectare S/N pentru serviciu">
                                    <span className="whitespace-normal break-words">
                                      {getServiceSerialNumbers(svc).length === 0 ? 'Toate' : getServiceSerialNumbers(svc).join(', ')}
                                    </span>
                                    <ChevronDown className="h-3 w-3 shrink-0 opacity-50 ml-1" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2" align="start">
                                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">S/N (selectare multiplă)</div>
                                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                                    <label className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                                      <Checkbox
                                        checked={getServiceSerialNumbers(svc).length === 0}
                                        onCheckedChange={(checked) => {
                                          if (checked) onUpdateServiceForSerialNumbers(inst.localId, svc.serviceId, [])
                                        }}
                                      />
                                      <span className="text-xs">Toate</span>
                                    </label>
                                    {serials.map((sn) => {
                                      const selected = getServiceSerialNumbers(svc)
                                      const isChecked = selected.includes(sn)
                                      return (
                                        <label key={sn} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                                          <Checkbox
                                            checked={isChecked}
                                            onCheckedChange={(checked) => {
                                              const next = checked
                                                ? [...selected, sn]
                                                : selected.filter(x => x !== sn)
                                              onUpdateServiceForSerialNumbers(inst.localId, svc.serviceId, next)
                                            }}
                                          />
                                          <span className="text-xs truncate">{sn}</span>
                                        </label>
                                      )
                                    })}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 text-center align-top">
                          {isLocked ? (
                            <span className="text-sm">{rowInstrumentQty}</span>
                          ) : (
                            <Input
                              type="number"
                              min={1}
                              value={safeNumInputVal(rowInstrumentQty)}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => onUpdateServiceInstrumentQty(inst.localId, svc.serviceId, Math.max(1, +e.target.value || 1))}
                              className="w-12 h-7 text-center text-sm px-1 tabular-nums mx-auto"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">{svc.serviceName}</td>
                        <td className="px-3 py-2 text-center">
                          {isLocked ? (
                            <span className="text-sm tabular-nums">{svc.quantity}</span>
                          ) : (
                            <Input
                              type="number"
                              min={1}
                              value={safeNumInputVal(svc.quantity)}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => onUpdateServiceQty(inst.localId, svc.serviceId, Math.max(1, +e.target.value || 1))}
                              className="w-12 h-7 text-center text-sm px-1 tabular-nums"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isLocked ? (
                            <span className="text-sm">{svc.discount > 0 ? `${svc.discount}%` : '—'}</span>
                          ) : (
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={safeNumInputVal(svc.discount)}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => onUpdateDiscount(inst.localId, svc.serviceId, Math.min(100, Math.max(0, +e.target.value || 0)))}
                              className="w-12 h-7 text-center text-sm px-1"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isLocked ? (
                            <span className="text-sm">{svc.unrepairedCount > 0 ? svc.unrepairedCount : '—'}</span>
                          ) : (
                            <Input
                              type="number"
                              min={0}
                              max={rowInstrumentQty}
                              value={safeNumInputVal(svc.unrepairedCount)}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => onUpdateUnrepaired(inst.localId, svc.serviceId, Math.min(rowInstrumentQty, Math.max(0, +e.target.value || 0)))}
                              className="w-12 h-7 text-center text-sm px-1"
                            />
                          )}
                        </td>
                        {svcIdx === 0 ? (
                          <td rowSpan={totalRows} className="px-3 py-2 text-center align-top">
                            {isLocked ? (
                              <span className="text-sm">{(inst.garantie ?? false) ? 'Da' : '—'}</span>
                            ) : (
                              <Checkbox
                                checked={inst.garantie ?? false}
                                onCheckedChange={(c) => onUpdateInstrumentGarantie(inst.localId, !!c)}
                                className="mx-auto"
                              />
                            )}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-right">
                          {isLocked ? (
                            <span className="tabular-nums text-sm">{svc.basePrice.toFixed(2)}</span>
                          ) : (
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={safeNumInputVal(svc.basePrice)}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => onUpdateServicePrice(inst.localId, svc.serviceId, Math.max(0, +e.target.value || 0))}
                              className="w-20 h-7 text-right text-sm px-2 tabular-nums"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-sm">{lineTotal.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                  
                  {/* Piese - aceleași posibilități: S/N, QT per rând, cantitate editabilă */}
                  {inst.parts.map((part, partIdx) => {
                    const partLineTotal = (inst.garantie ?? false) ? 0 : part.quantity * part.unitPrice * (urgentAllServices ? (1 + URGENT_MARKUP_PCT / 100) : 1)
                    const isFirstRow = inst.services.length === 0 && partIdx === 0
                    const partSerials = parseSerialNumbers(inst.serialNumber)
                    const partHasSerials = partSerials.length > 0
                    const rowPartInstrumentQty = part.instrumentQty ?? tableQty(inst.localId, inst.quantity)
                    return (
                      <tr key={`${inst.localId}-part-${partIdx}-${part.id}`} className={cn(
                        "hover:bg-slate-50 dark:hover:bg-slate-800/40",
                        instIdx % 2 === 1 && "bg-slate-50/50 dark:bg-slate-800/20"
                      )}>
                        {isFirstRow ? (
                          <td rowSpan={totalRows} className="px-3 py-2 align-top">
                            {trays.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : isLocked ? (
                              <span className="text-xs">
                                {(inst.services[0]?.trayId ?? inst.parts[0]?.trayId)
                                  ? (trays.find(t => t.id === (inst.services[0]?.trayId ?? inst.parts[0]?.trayId)) ? `#${trays.find(t => t.id === (inst.services[0]?.trayId ?? inst.parts[0]?.trayId))!.number}` : '—')
                                  : '—'}
                              </span>
                            ) : (
                              <Select
                                value={(inst.services[0]?.trayId ?? inst.parts[0]?.trayId) ?? '__none__'}
                                onValueChange={(v) => onUpdateInstrumentTray(inst.localId, v === '__none__' ? undefined : v)}
                              >
                                <SelectTrigger className="h-7 text-xs w-full max-w-[100px]">
                                  <SelectValue placeholder="Tăviță" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">—</SelectItem>
                                  {trays.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>#{t.number}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                        ) : null}
                        {isFirstRow && (
                          <td rowSpan={totalRows} className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300 align-top text-sm">
                            {inst.name}
                          </td>
                        )}
                        {isFirstRow && inst.services.length === 0 ? (
                          <td rowSpan={totalRows} className="px-3 py-2 text-center align-top">
                            {isLocked ? (
                              <span className="text-sm">{(inst.garantie ?? false) ? 'Da' : '—'}</span>
                            ) : (
                              <Checkbox
                                checked={inst.garantie ?? false}
                                onCheckedChange={(c) => onUpdateInstrumentGarantie(inst.localId, !!c)}
                                className="mx-auto"
                              />
                            )}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-xs text-muted-foreground align-top min-w-[140px] max-w-[220px]">
                          {partHasSerials ? (
                            isLocked ? (
                              <span className="block whitespace-normal break-words">
                                {getPartSerialNumbers(part).length === 0 ? 'Toate' : getPartSerialNumbers(part).join(', ')}
                              </span>
                            ) : (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button data-button-id="vanzariViewPartSerialNumbersTrigger" variant="outline" size="sm" className="min-h-7 h-auto py-1.5 px-2 text-xs w-full max-w-full justify-between font-normal text-left" title="Deschide selectare S/N pentru piesă">
                                    <span className="whitespace-normal break-words">
                                      {getPartSerialNumbers(part).length === 0 ? 'Toate' : getPartSerialNumbers(part).join(', ')}
                                    </span>
                                    <ChevronDown className="h-3 w-3 shrink-0 opacity-50 ml-1" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2" align="start">
                                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">S/N (selectare multiplă)</div>
                                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                                    <label className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                                      <Checkbox
                                        checked={getPartSerialNumbers(part).length === 0}
                                        onCheckedChange={(checked) => {
                                          if (checked) onUpdatePartForSerialNumbers(part.id, [])
                                        }}
                                      />
                                      <span className="text-xs">Toate</span>
                                    </label>
                                    {partSerials.map((sn) => {
                                      const selected = getPartSerialNumbers(part)
                                      const isChecked = selected.includes(sn)
                                      return (
                                        <label key={sn} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                                          <Checkbox
                                            checked={isChecked}
                                            onCheckedChange={(checked) => {
                                              const next = checked
                                                ? [...selected, sn]
                                                : selected.filter(x => x !== sn)
                                              onUpdatePartForSerialNumbers(part.id, next)
                                            }}
                                          />
                                          <span className="text-xs truncate">{sn}</span>
                                        </label>
                                      )
                                    })}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 text-center align-top">
                          {isLocked ? (
                            <span className="text-sm">{rowPartInstrumentQty}</span>
                          ) : (
                            <Input
                              type="number"
                              min={1}
                              value={safeNumInputVal(rowPartInstrumentQty)}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => onUpdatePartInstrumentQty(part.id, Math.max(1, +e.target.value || 1))}
                              className="w-12 h-7 text-center text-sm px-1 tabular-nums mx-auto"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm text-amber-600 dark:text-amber-400">⚙ {part.name}</td>
                        <td className="px-3 py-2 text-center">
                          {isLocked ? (
                            <span className="text-sm tabular-nums">{part.quantity}</span>
                          ) : (
                            <Input
                              type="number"
                              min={1}
                              value={safeNumInputVal(part.quantity)}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => onUpdatePartQty(part.id, Math.max(1, +e.target.value || 1))}
                              className="w-12 h-7 text-center text-sm px-1 tabular-nums"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-muted-foreground text-sm">—</td>
                        <td className="px-3 py-2 text-center text-muted-foreground text-sm">—</td>
                        <td className="px-3 py-2 text-right">
                          {isLocked ? (
                            <span className="tabular-nums text-sm">{part.unitPrice.toFixed(2)}</span>
                          ) : (
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={safeNumInputVal(part.unitPrice)}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => onUpdatePartPrice(part.id, Math.max(0, +e.target.value || 0))}
                              className="w-20 h-7 text-right text-sm px-2 tabular-nums"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-sm">{partLineTotal.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VanzariViewV4({
  availableInstruments,
  services,
  initialData,
  urgentAllServices,
  officeDirect,
  curierTrimis,
  retur = false,
  subscriptionType,
  loading,
  saving,
  isDirty,
  isServiceFileLocked,
  onUrgentChange,
  onOfficeDirectChange,
  onCurierTrimisChange,
  onReturChange,
  onSubscriptionChange,
  onSave,
  onSaveOptionsOnly,
  onClose,
  sectionTitle,
  onSendTrays,
  sendTraysDisabled = false,
  sendTraysDisabledReason,
  getV4DataRef,
  onSendTraysValidityChange,
  fisaIdForCache,
  serviceFileId,
  onValidateTrayQc,
  onPrintTrays,
  departmentActions,
}: VanzariViewV4Props) {
  const { user: currentUser } = useAuth()
  const actorOption = useMemo(() => ({
    currentUserId: currentUser?.id ?? undefined,
    currentUserName: currentUser?.email?.split('@')[0] ?? null,
    currentUserEmail: currentUser?.email ?? null,
  }), [currentUser?.id, currentUser?.email])

  const logBtn = useCallback((buttonId: string, buttonLabel: string) => {
    if (!serviceFileId && !fisaIdForCache) return
    logButtonEvent({
      serviceFileId: serviceFileId ?? fisaIdForCache ?? undefined,
      buttonId,
      buttonLabel,
      actorOption,
    }).catch(() => {})
  }, [serviceFileId, fisaIdForCache, actorOption])

  // Local state
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>('')
  const [instruments, setInstruments] = useState<SelectedInstrument[]>([])
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [openInstrumentId, setOpenInstrumentId] = useState<string | null>(null) // Care instrument e expandat
  const [instrumentComboboxOpen, setInstrumentComboboxOpen] = useState(false) // Popover căutare instrument
  const [addInstrumentQty, setAddInstrumentQty] = useState(1) // Cantitate la adăugare instrument
  const [instrumentQuantityInTable, setInstrumentQuantityInTable] = useState<Record<string, number>>({}) // QT per instrument în tabel (independent de card)
  const [trays, setTrays] = useState<LocalTray[]>([]) // Tăvițe create local; înregistrările pot fi mutate în ele
  /** Tăviță aleasă per instrument (rămâne setată și când nu există încă servicii/piese). */
  const [instrumentTrayId, setInstrumentTrayId] = useState<Record<string, string | undefined>>({})

  // Hidratare din DB când revii la fișă (un singur apel la montare când initialData e disponibil)
  // Dacă există draft în cache pentru Recepție, nu suprascriem cu initialData – restaurarea din cache se ocupă
  useEffect(() => {
    if (!initialData) return
    if (fisaIdForCache && readReceptieDraft(fisaIdForCache)) return
    setInstruments(
      initialData.instruments.map((inst) => ({
        id: inst.id,
        localId: inst.localId,
        name: inst.name,
        quantity: inst.quantity,
        serialNumber: inst.serialNumber ?? '',
        discount: (inst as any).discount ?? 0,
        garantie: (inst as any).garantie ?? false,
      }))
    )
    setSelectedServices(
      initialData.services.map((s) => ({
        instrumentLocalId: s.instrumentLocalId,
        serviceId: s.serviceId,
        serviceName: s.serviceName,
        basePrice: s.basePrice,
        quantity: s.quantity,
        instrumentQty: s.instrumentQty,
        discount: s.discount,
        unrepairedCount: s.unrepairedCount ?? 0,
        trayId: s.trayId,
        forSerialNumbers: s.forSerialNumbers,
      }))
    )
    setParts(
      initialData.parts.map((p) => ({
        id: p.id,
        instrumentLocalId: p.instrumentLocalId,
        name: p.name,
        unitPrice: p.unitPrice,
        quantity: p.quantity,
        trayId: p.trayId,
        forSerialNumbers: p.forSerialNumbers,
      }))
    )
    // Filtrează tăvițele fără număr (altfel apar ca un chip cu doar "#")
    setTrays(
      initialData.trays
        .filter((t) => t.number && String(t.number).trim().length > 0)
        .map((t) => ({
          id: t.id,
          number: t.number,
        }))
    )
    setInstrumentTrayId(initialData.instrumentTrayId ?? {})
    const firstLocalId = initialData.instruments[0]?.localId
    if (firstLocalId) setOpenInstrumentId(firstLocalId)
  }, [initialData, fisaIdForCache])

  // Restaurare din cache (Recepție) – după hidratare initialData, cache-ul are prioritate ca să nu se piardă draft-ul la switch tab
  useEffect(() => {
    if (!fisaIdForCache) return
    const cached = readReceptieDraft(fisaIdForCache)
    if (!cached) return
    setInstruments(
      (cached.instruments ?? []).map((inst) => ({
        id: inst.id,
        localId: inst.localId,
        name: inst.name,
        quantity: inst.quantity ?? 1,
        serialNumber: inst.serialNumber ?? '',
        discount: inst.discount ?? 0,
        garantie: inst.garantie ?? false,
      }))
    )
    setSelectedServices(
      (cached.services ?? []).map((s) => ({
        instrumentLocalId: s.instrumentLocalId,
        serviceId: s.serviceId,
        serviceName: s.serviceName,
        basePrice: s.basePrice,
        instrumentQty: s.instrumentQty,
        quantity: s.quantity,
        discount: s.discount,
        unrepairedCount: s.unrepairedCount ?? 0,
        trayId: s.trayId,
        forSerialNumbers: s.forSerialNumbers,
      }))
    )
    setParts(
      (cached.parts ?? []).map((p) => ({
        id: p.id,
        instrumentLocalId: p.instrumentLocalId,
        name: p.name,
        unitPrice: p.unitPrice,
        quantity: p.quantity,
        trayId: p.trayId,
        forSerialNumbers: p.forSerialNumbers,
        instrumentQty: p.instrumentQty,
      }))
    )
    setTrays(
      (cached.trays ?? []).map((t) => ({
        id: t.id,
        number: t.number,
      }))
    )
    setInstrumentTrayId(cached.instrumentTrayId ?? {})
  }, [fisaIdForCache])

  const receptieDraftDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Salvare draft în cache la modificări (Recepție), debounced
  useEffect(() => {
    if (!fisaIdForCache) return
    if (receptieDraftDebounceRef.current) clearTimeout(receptieDraftDebounceRef.current)
    receptieDraftDebounceRef.current = setTimeout(() => {
      receptieDraftDebounceRef.current = null
      writeReceptieDraft(fisaIdForCache, {
        instruments,
        services: selectedServices,
        parts,
        trays,
        instrumentTrayId,
      })
    }, 500)
    return () => {
      if (receptieDraftDebounceRef.current) clearTimeout(receptieDraftDebounceRef.current)
    }
  }, [fisaIdForCache, instruments, selectedServices, parts, trays, instrumentTrayId])

  // Expune datele curente pentru salvare în istoric la confirmare „Trimite tăvițele”
  useEffect(() => {
    if (!getV4DataRef) return
    getV4DataRef.current = () => ({
      instruments,
      services: selectedServices,
      parts,
      trays,
      instrumentTrayId,
    })
    return () => {
      getV4DataRef.current = null
    }
  }, [getV4DataRef, instruments, selectedServices, parts, trays, instrumentTrayId])

  // Raportează instrumentele fără tăviță (pentru validare Trimite tăvițele)
  useEffect(() => {
    if (!onSendTraysValidityChange) return
    const trayIds = new Set(trays.map((t) => t.id).filter(Boolean))
    const unassignedNames: string[] = []
    for (const inst of instruments) {
      const tid = instrumentTrayId[inst.localId]
      if (!tid || !trayIds.has(tid)) unassignedNames.push(inst.name)
    }
    onSendTraysValidityChange(unassignedNames)
  }, [onSendTraysValidityChange, instruments, trays, instrumentTrayId])

  // Dialog Curier Trimis
  const [showCurierTrimisDialog, setShowCurierTrimisDialog] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedTime, setSelectedTime] = useState<string>('08:00')
  
  const isLocked = Boolean(isServiceFileLocked)
  
  // Handlers
  const handleAddInstrument = () => {
    if (!selectedInstrumentId) return
    
    const instrument = availableInstruments.find(i => i.id === selectedInstrumentId)
    if (!instrument) return
    
    const newLocalId = generateId()
    const qty = Math.max(1, addInstrumentQty)
    const newInstrument: SelectedInstrument = {
      id: instrument.id,
      localId: newLocalId,
      discount: 0,
      garantie: false,
      name: instrument.name,
      quantity: qty,
      serialNumber: '',
    }
    
    // Adaugă la ÎNCEPUT (nu la final)
    setInstruments(prev => [newInstrument, ...prev])
    setSelectedInstrumentId('')
    // Deschide automat noul instrument
    setOpenInstrumentId(newLocalId)
  }
  
  const handleRemoveInstrument = (localId: string) => {
    setInstruments(prev => prev.filter(i => i.localId !== localId))
    setSelectedServices(prev => prev.filter(s => s.instrumentLocalId !== localId))
    setParts(prev => prev.filter(p => p.instrumentLocalId !== localId))
    setInstrumentQuantityInTable(prev => { const next = { ...prev }; delete next[localId]; return next })
    setInstrumentTrayId(prev => { const next = { ...prev }; delete next[localId]; return next })
  }
  
  const handleInstrumentQuantityChange = (localId: string, qty: number) => {
    const newQty = Math.max(1, qty)
    setInstruments(prev => prev.map(i => i.localId === localId ? { ...i, quantity: newQty } : i))
    // Serviciile cu "Toate" (fără S/N selectat) își iau cantitatea de la instrument (din card, nu din tabel)
    setSelectedServices(prev => prev.map(s => {
      if (s.instrumentLocalId !== localId) return s
      if (getServiceSerialNumbers(s).length === 0) return { ...s, quantity: newQty }
      return s
    }))
  }

  const handleTableInstrumentQuantityChange = (instrumentLocalId: string, quantity: number) => {
    const qty = Math.max(1, quantity)
    setInstrumentQuantityInTable(prev => ({ ...prev, [instrumentLocalId]: qty }))
  }
  
  const handleSerialNumberChange = (localId: string, sn: string) => {
    setInstruments(prev => prev.map(i => i.localId === localId ? { ...i, serialNumber: sn } : i))
    // Nu mai setăm instrument.quantity sau cantitatea serviciilor "Toate" din nr. de S/N-uri:
    // serviciul cu S/N-uri specifice își ia cantitatea din nr. de S/N selectați; "Toate" rămâne la cantitatea din card.
  }

  const handleInstrumentDiscountChange = (localId: string, value: number) => {
    setInstruments(prev => prev.map(i => i.localId === localId ? { ...i, discount: value } : i))
  }

  const handleGarantieChange = (localId: string, checked: boolean) => {
    setInstruments(prev => prev.map(i => i.localId === localId ? { ...i, garantie: checked } : i))
  }
  
  const handleToggleService = (instrumentLocalId: string, serviceId: string, serviceName: string, price: number, selected: boolean) => {
    if (selected) {
      const instrument = instruments.find(i => i.localId === instrumentLocalId)
      const serials = instrument ? parseSerialNumbers(instrument.serialNumber) : []
      const forSerialNumbers = serials.length === 1 ? [serials[0]!] : []
      const initialQty = forSerialNumbers.length > 0 ? forSerialNumbers.length : (instrument ? Math.max(1, instrument.quantity) : 1)
      const trayId = instrumentTrayId[instrumentLocalId]
      setSelectedServices(prev => [...prev, {
        instrumentLocalId,
        serviceId,
        serviceName,
        basePrice: price,
        quantity: initialQty,
        trayId,
        instrumentQty: initialQty,
        discount: 0,
        unrepairedCount: 0,
        forSerialNumbers,
      }])
    } else {
      setSelectedServices(prev => prev.filter(s => !(s.instrumentLocalId === instrumentLocalId && s.serviceId === serviceId)))
    }
  }
  
  const handleUpdateDiscount = (instrumentLocalId: string, serviceId: string, discount: number) => {
    setSelectedServices(prev => prev.map(s => 
      s.instrumentLocalId === instrumentLocalId && s.serviceId === serviceId 
        ? { ...s, discount } 
        : s
    ))
  }
  
  const handleUpdateUnrepaired = (instrumentLocalId: string, serviceId: string, count: number) => {
    setSelectedServices(prev => prev.map(s => 
      s.instrumentLocalId === instrumentLocalId && s.serviceId === serviceId 
        ? { ...s, unrepairedCount: count } 
        : s
    ))
  }
  
  const handleUpdateServiceQty = (instrumentLocalId: string, serviceId: string, qty: number) => {
    setSelectedServices(prev => prev.map(s => 
      s.instrumentLocalId === instrumentLocalId && s.serviceId === serviceId 
        ? { ...s, quantity: qty } 
        : s
    ))
  }
  
  const handleAddPart = (instrumentLocalId: string, name: string, price: number) => {
    setParts(prev => [...prev, {
      id: generateId(),
      instrumentLocalId,
      name,
      unitPrice: price,
      quantity: 1,
      trayId: instrumentTrayId[instrumentLocalId],
    }])
  }
  
  const handleUpdatePartQty = (partId: string, qty: number) => {
    setParts(prev => prev.map(p => p.id === partId ? { ...p, quantity: qty } : p))
  }

  const handleUpdatePartPrice = (partId: string, unitPrice: number) => {
    setParts(prev => prev.map(p => p.id === partId ? { ...p, unitPrice } : p))
  }

  const handleUpdatePartForSerialNumbers = (partId: string, forSerialNumbers: string[]) => {
    const part = parts.find(p => p.id === partId)
    const inst = part ? instruments.find(i => i.localId === part.instrumentLocalId) : undefined
    const newQty = forSerialNumbers.length > 0 ? forSerialNumbers.length : Math.max(1, inst?.quantity ?? 1)
    setParts(prev => prev.map(p =>
      p.id === partId ? { ...p, forSerialNumbers, quantity: newQty, instrumentQty: newQty } : p
    ))
  }

  const handleUpdatePartInstrumentQty = (partId: string, qty: number) => {
    setParts(prev => prev.map(p => p.id === partId ? { ...p, instrumentQty: Math.max(1, qty) } : p))
  }

  const handleAddTray = (number: string) => {
    setTrays(prev => [...prev, { id: generateId(), number: number.trim() }])
  }

  const handleRemoveTray = (trayId: string) => {
    setTrays(prev => prev.filter(t => t.id !== trayId))
    setSelectedServices(prev => prev.map(s => s.trayId === trayId ? { ...s, trayId: undefined } : s))
    setParts(prev => prev.map(p => p.trayId === trayId ? { ...p, trayId: undefined } : p))
    setInstrumentTrayId(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(localId => { if (next[localId] === trayId) next[localId] = undefined })
      return next
    })
  }

  const handleUpdateTray = (trayId: string, newNumber: string) => {
    setTrays(prev => prev.map(t =>
      t.id === trayId ? { ...t, number: newNumber } : t
    ))
  }

  const handleUpdateServiceTray = (instrumentLocalId: string, serviceId: string, trayId: string | undefined) => {
    setSelectedServices(prev => prev.map(s =>
      s.instrumentLocalId === instrumentLocalId && s.serviceId === serviceId ? { ...s, trayId } : s
    ))
  }

  const handleUpdatePartTray = (partId: string, trayId: string | undefined) => {
    setParts(prev => prev.map(p => p.id === partId ? { ...p, trayId } : p))
  }

  /** Tăvița se atribuie instrumentului: actualizează toate serviciile și piese ale instrumentului + preferința per instrument. */
  const handleUpdateInstrumentTray = (instrumentLocalId: string, trayId: string | undefined) => {
    setInstrumentTrayId(prev => ({ ...prev, [instrumentLocalId]: trayId }))
    setSelectedServices(prev => prev.map(s =>
      s.instrumentLocalId === instrumentLocalId ? { ...s, trayId } : s
    ))
    setParts(prev => prev.map(p =>
      p.instrumentLocalId === instrumentLocalId ? { ...p, trayId } : p
    ))
  }
  
  const handleUpdateServicePrice = (instrumentLocalId: string, serviceId: string, price: number) => {
    setSelectedServices(prev => prev.map(s =>
      s.instrumentLocalId === instrumentLocalId && s.serviceId === serviceId ? { ...s, basePrice: price } : s
    ))
  }

  const handleUpdateServiceInstrumentQty = (instrumentLocalId: string, serviceId: string, qty: number) => {
    const quantity = Math.max(1, qty)
    setSelectedServices(prev => prev.map(s =>
      s.instrumentLocalId === instrumentLocalId && s.serviceId === serviceId
        ? { ...s, instrumentQty: quantity }
        : s
    ))
  }

  const handleUpdateServiceForSerialNumbers = (instrumentLocalId: string, serviceId: string, forSerialNumbers: string[]) => {
    const inst = instruments.find(i => i.localId === instrumentLocalId)
    const newQty = forSerialNumbers.length > 0 ? forSerialNumbers.length : Math.max(1, inst?.quantity ?? 1)
    setSelectedServices(prev => prev.map(s =>
      s.instrumentLocalId === instrumentLocalId && s.serviceId === serviceId
        ? { ...s, forSerialNumbers, quantity: newQty, instrumentQty: newQty }
        : s
    ))
  }
  
  const handleRemovePart = (partId: string) => {
    setParts(prev => prev.filter(p => p.id !== partId))
  }
  
  const handleSave = () => {
    onSave({ instruments, services: selectedServices, parts, trays, instrumentTrayId })
  }

  const isMobile = useIsMobile()

  return (
    <div className={cn("space-y-4 border rounded-xl bg-card shadow-sm overflow-visible border-[rgb(61_67_77/0.15)]", isMobile && "pb-28")}>
      {/* Titlu + opțiuni (Urgent, Abonament, Office, Curier, Retur) — o singură secțiune */}
      <div className={cn(
        "border-b border-[rgb(61_67_77/0.12)]",
        isMobile ? "px-3 py-2" : "px-4 py-2.5",
        isLocked 
          ? "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20"
          : "bg-gradient-to-r from-[rgb(61_67_77/0.04)] to-white dark:from-[rgb(61_67_77/0.08)] dark:to-slate-800/30"
      )}>
        {/* Un singur rând: titlu, opțiuni (Urgent, Abonament, Office, Curier, Retur), acțiuni (Închide, Salvează) */}
        <div className={cn("flex flex-wrap items-center gap-2 py-1", isMobile && "gap-2")}>
          <div className="flex items-center gap-2 shrink-0">
            {isLocked ? (
              <>
                {/* Calculează nr de instrumente unice din instruments */}
                {(() => {
                  const uniqueInstruments = new Set(instruments.filter(i => i.id).map(i => i.id))
                  const instCount = uniqueInstruments.size
                  return (
                    <h3 className="font-semibold text-base text-amber-700 dark:text-amber-400">
                      Fișă Finalizată {instCount > 0 && <span className="text-sm font-normal">({instCount} {instCount === 1 ? 'instrument' : 'instrumente'})</span>}
                    </h3>
                  )
                })()}
                <span className="text-sm text-amber-600/80 dark:text-amber-400/70 hidden sm:inline">Fișă trimisă • Creează fișă nouă pentru modificări.</span>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-base text-foreground">{sectionTitle ?? 'Adaugă instrumente și servicii'}</h3>
              </>
            )}
          </div>
          <div className="h-4 w-px bg-border/60 shrink-0 hidden sm:block" />
          <div className={cn(
            "flex flex-wrap items-center gap-3 py-1 px-2 rounded-md shrink-0",
            isLocked ? "bg-muted/50 opacity-75" : "bg-muted/30"
          )}>
          {/* Urgent Toggle */}
          <label className={cn("flex items-center gap-2 group", isLocked ? "cursor-not-allowed" : "cursor-pointer")}>
            <div className={cn(
              "relative inline-flex h-4 w-8 items-center rounded-full transition-colors duration-200",
              urgentAllServices ? "bg-red-500" : "bg-muted-foreground/20",
              isLocked && "opacity-60"
            )}>
              <Checkbox
                checked={urgentAllServices}
                onCheckedChange={isLocked ? undefined : onUrgentChange}
                disabled={isLocked}
                className="sr-only"
              />
              <span className={cn(
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200",
                urgentAllServices ? "translate-x-3.5" : "translate-x-0.5"
              )} />
            </div>
            <span className={cn(
              "text-xs font-medium transition-colors",
              urgentAllServices ? "text-red-600" : "text-muted-foreground group-hover:text-foreground"
            )}>
              Urgent
            </span>
            {urgentAllServices && (
              <span className="text-[9px] font-medium text-red-500 bg-red-50 dark:bg-red-950/30 px-1 py-0.5 rounded">
                +{URGENT_MARKUP_PCT}%
              </span>
            )}
          </label>
          
          <div className="h-4 w-px bg-border/60" />
          
          {/* Abonament */}
          <div className="flex items-center gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Abonament</Label>
            <select
              className={cn(
                "h-7 text-xs rounded-md border border-border/60 px-2.5 bg-white dark:bg-background transition-colors",
                isLocked ? "cursor-not-allowed opacity-60" : "hover:border-primary/40 cursor-pointer"
              )}
              value={subscriptionType}
              onChange={e => !isLocked && onSubscriptionChange(e.target.value as any)}
              disabled={isLocked}
            >
              <option value="">Fără abonament</option>
              <option value="services">Servicii</option>
              <option value="parts">Piese</option>
              <option value="both">Ambele</option>
            </select>
          </div>
          
          <div className="h-4 w-px bg-border/60" />
          
          {/* Butoane livrare */}
          <Button
            data-button-id="vanzariViewOfficeDirectButton"
            type="button"
            variant={officeDirect ? "default" : "outline"}
            size="sm"
            disabled={isLocked || loading || saving || curierTrimis}
            onClick={() => { logBtn('vanzariViewOfficeDirectButton', 'Office direct'); onOfficeDirectChange(!officeDirect) }}
            title="Comută Office direct"
            className={cn(
              "h-8 px-2.5 text-xs font-medium transition-colors",
              officeDirect 
                ? "bg-blue-500 hover:bg-blue-600 text-white border-blue-500" 
                : "border-border hover:bg-muted"
            )}
          >
            Office direct
          </Button>
          
          <Button
            data-button-id="vanzariViewCurierTrimisButton"
            type="button"
            variant={curierTrimis ? "default" : "outline"}
            size="sm"
            disabled={isLocked || loading || saving || officeDirect}
            title="Comută Curier Trimis (selectează data și ora)"
            onClick={() => {
              logBtn('vanzariViewCurierTrimisButton', curierTrimis ? 'Curier Trimis (dezactivat)' : 'Curier Trimis')
              if (curierTrimis) {
                onCurierTrimisChange?.(false)
              } else {
                setShowCurierTrimisDialog(true)
              }
            }}
            className={cn(
              "h-8 px-2.5 text-xs font-medium transition-colors",
              curierTrimis 
                ? "bg-purple-500 hover:bg-purple-600 text-white border-purple-500" 
                : "border-border hover:bg-muted"
            )}
          >
            Curier Trimis
          </Button>
          
          <Button
            data-button-id="vanzariViewReturButton"
            type="button"
            variant={retur ? "default" : "outline"}
            size="sm"
            title="Comută Retur"
            onClick={() => { logBtn('vanzariViewReturButton', retur ? 'Retur (dezactivat)' : 'Retur'); onReturChange?.(!retur) }}
            className={cn(
              "h-8 px-2.5 text-xs font-medium transition-colors gap-1",
              retur 
                ? "bg-orange-500 hover:bg-orange-600 text-white border-orange-500" 
                : "border-orange-300 text-orange-600 hover:bg-orange-50 hover:border-orange-400"
            )}
          >
            <Package className="h-3 w-3" />
            Retur
          </Button>
          </div>
          <div className="h-4 w-px bg-border/60 shrink-0 hidden sm:block" />
          {/* Pe telefon acțiunile sunt în bara fixă de jos */}
          <div className={cn("flex items-center gap-2 ml-auto shrink-0", isMobile && "hidden")}>
            {departmentActions && departmentActions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-button-id="vanzariViewTrayActionsDropdown" variant="outline" size="sm" className="gap-1.5 text-xs" title="Acțiuni tăviță (Împarte, Reunește)">
                    <GitMerge className="h-4 w-4" />
                    Acțiuni tăviță
                    <ChevronDown className="h-3.5 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {departmentActions.map((action, idx) => (
                    <DropdownMenuItem key={idx} onClick={action.onClick}>
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {onClose && (
              <Button data-button-id="vanzariViewCloseButton" variant="outline" size="sm" onClick={() => { logBtn('vanzariViewCloseButton', 'Închide'); onClose() }} title="Închide panoul de detalii">
                Închide
              </Button>
            )}
            {onSendTrays && (
              <Button
                data-button-id="vanzariViewSendTraysButton"
                variant="outline"
                size="sm"
                onClick={() => { logBtn('vanzariViewSendTraysButton', 'Trimite tăvițele'); onSendTrays() }}
                disabled={loading || saving || sendTraysDisabled}
                className="text-xs text-white border-0 shadow-md shadow-emerald-500/30"
                title={sendTraysDisabled
                  ? (sendTraysDisabledReason ||
                    'Adaugă tăvițe și atribuie toate instrumentele înainte de expediere.')
                  : 'Trimite tăvițele în departamentele corespunzătoare pentru procesare'
                }
                style={{
                  backgroundColor: loading || saving || sendTraysDisabled
                    ? 'rgb(16 185 129)' // emerald-500 static când disabled
                    : undefined,
                  animation: loading || saving || sendTraysDisabled
                    ? 'none'
                    : 'pulse-green 2s ease-in-out infinite'
                }}
              >
                <Package className="h-4 w-4 mr-1.5" />
                Trimite tăvițele
              </Button>
            )}
            {onPrintTrays && (
              <Button
                data-button-id="vanzariViewPrintTraysButton"
                variant="outline"
                size="sm"
                onClick={() => { logBtn('vanzariViewPrintTraysButton', 'Print tăvițe'); onPrintTrays() }}
                disabled={loading}
                className="text-xs"
                title="Print tăvițe (A4)"
              >
                <Printer className="h-4 w-4 mr-1.5" />
                Print tăvițe
              </Button>
            )}
            {!isLocked && onSaveOptionsOnly && (
              <Button
                data-button-id="vanzariViewSaveOptionsButton"
                size="sm"
                variant="outline"
                onClick={() => { logBtn('vanzariViewSaveOptionsButton', 'Salvează'); onSaveOptionsOnly() }}
                disabled={loading || saving || !isDirty}
                className="text-xs"
                title="Salvează opțiunile (Urgent, Retur, Office direct, Curier trimis)"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Se salvează…
                  </>
                ) : (
                  "Salvează"
                )}
              </Button>
            )}
            {!isLocked && (
              <Button 
                data-button-id="vanzariViewSaveInHistoryButton"
                size="sm"
                onClick={() => { logBtn('vanzariViewSaveInHistoryButton', 'Salvează în Istoric'); handleSave() }}
                disabled={loading || saving || (instruments.length === 0 && !isDirty)}
                className="bg-primary text-primary-foreground border-0 shadow-md shadow-primary/30"
                title="Salvează toate modificările (instrumente, servicii, tăvițe) în istoricul fișei"
                style={{
                  animation: loading || saving || (instruments.length === 0 && !isDirty)
                    ? 'none'
                    : 'pulse-primary 2s ease-in-out infinite'
                }}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Se salvează…
                  </>
                ) : (
                  "Salvează în Istoric"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* SUMAR COMANDĂ - deasupra Selectează instrument */}
      <div className="mx-4 pb-2">
        <SummaryTable
          instruments={instruments}
          selectedServices={selectedServices}
          parts={parts}
          trays={trays}
          urgentAllServices={urgentAllServices}
          isLocked={isLocked}
          instrumentQuantityInTable={instrumentQuantityInTable}
          onValidateTrayQc={onValidateTrayQc}
          onAddTray={handleAddTray}
          onRemoveTray={handleRemoveTray}
          onUpdateTray={handleUpdateTray}
          onUpdateServiceTray={handleUpdateServiceTray}
          onUpdatePartTray={handleUpdatePartTray}
          onUpdateInstrumentTray={handleUpdateInstrumentTray}
          onUpdateServiceInstrumentQty={handleUpdateServiceInstrumentQty}
          onUpdateDiscount={handleUpdateDiscount}
          onUpdateUnrepaired={handleUpdateUnrepaired}
          onUpdateServiceQty={handleUpdateServiceQty}
          onUpdateServicePrice={handleUpdateServicePrice}
          onUpdatePartPrice={handleUpdatePartPrice}
          onUpdatePartQty={handleUpdatePartQty}
          onUpdatePartForSerialNumbers={handleUpdatePartForSerialNumbers}
          onUpdatePartInstrumentQty={handleUpdatePartInstrumentQty}
          onUpdateServiceForSerialNumbers={handleUpdateServiceForSerialNumbers}
          onUpdateTableInstrumentQuantity={handleTableInstrumentQuantityChange}
          onUpdateInstrumentGarantie={handleGarantieChange}
        />
      </div>

      {/* SELECTEAZĂ INSTRUMENT - căutare după text, mereu deasupra listei, sticky */}
      {!isLocked && (
        <div className="mx-4 sticky top-0 z-[9] border-2 border-dashed border-[#3D434D]/25 dark:border-[#3D434D]/40 rounded-xl px-4 py-3 bg-[#3D434D]/5 dark:bg-[#3D434D]/15 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <Popover open={instrumentComboboxOpen} onOpenChange={setInstrumentComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  data-button-id="vanzariViewInstrumentCombobox"
                  variant="outline"
                  role="combobox"
                  aria-expanded={instrumentComboboxOpen}
                  className="flex-1 h-10 justify-between text-sm font-normal text-muted-foreground"
                  title="Caută și selectează instrument de adăugat"
                >
                  {selectedInstrumentId
                    ? availableInstruments.find(i => i.id === selectedInstrumentId)?.name ?? 'Selectează instrument...'
                    : '+ Adaugă instrument... (scrie pentru căutare)'}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command className="rounded-lg border-0 shadow-none" shouldFilter={true}>
                  <CommandInput placeholder="Caută instrument..." className="h-9 text-sm" />
                  <CommandList className="max-h-[280px]">
                    <CommandEmpty>Niciun instrument găsit. Încearcă alt text.</CommandEmpty>
                    <CommandGroup>
                      {availableInstruments.map(inst => (
                        <CommandItem
                          key={inst.id}
                          value={inst.name}
                          onSelect={() => {
                            setSelectedInstrumentId(inst.id)
                            setInstrumentComboboxOpen(false)
                          }}
                          className="text-sm cursor-pointer"
                        >
                          <Check className={cn('mr-2 h-4 w-4', selectedInstrumentId === inst.id ? 'opacity-100' : 'opacity-0')} />
                          {inst.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Cant:</span>
              <Input
                type="number"
                min={1}
                value={safeNumInputVal(addInstrumentQty)}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setAddInstrumentQty(Math.max(1, +e.target.value || 1))}
                className="w-14 h-10 text-center text-sm tabular-nums"
              />
            </div>
            <Button 
              data-button-id="vanzariViewAddInstrumentButton"
              onClick={handleAddInstrument}
              disabled={!selectedInstrumentId}
              className="h-10 px-4 text-sm bg-[#3D434D] hover:bg-[#343a42] text-white border-0"
              title="Adaugă instrumentul selectat cu cantitatea din câmp"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Adaugă instrument
            </Button>
          </div>
        </div>
      )}

      {/* Card-uri instrumente - cea mai nouă prima, mai mult spațiu */}
      {instruments.length > 0 && (
        <div className="mx-4 space-y-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Instrumente ({instruments.length}) — click pentru a extinde (cele mai noi sus)
          </p>
          {instruments.map(instrument => (
            <InstrumentCard
              key={instrument.localId}
              instrument={instrument}
              availableServices={services}
              selectedServices={selectedServices}
              parts={parts}
              trays={trays}
              preferredTrayId={instrumentTrayId[instrument.localId]}
              isLocked={isLocked}
              isOpen={openInstrumentId === instrument.localId}
              onToggleOpen={() => setOpenInstrumentId(
                openInstrumentId === instrument.localId ? null : instrument.localId
              )}
              onQuantityChange={(qty) => handleInstrumentQuantityChange(instrument.localId, qty)}
              onSerialNumberChange={(sn) => handleSerialNumberChange(instrument.localId, sn)}
              onToggleService={(serviceId, serviceName, price, selected) => 
                handleToggleService(instrument.localId, serviceId, serviceName, price, selected)
              }
              onAddPart={(name, price) => handleAddPart(instrument.localId, name, price)}
              onUpdatePartQty={handleUpdatePartQty}
              onRemovePart={handleRemovePart}
              onUpdateInstrumentTray={(trayId) => handleUpdateInstrumentTray(instrument.localId, trayId)}
              onRemove={() => handleRemoveInstrument(instrument.localId)}
              onDiscountChange={(value) => handleInstrumentDiscountChange(instrument.localId, value)}
              onGarantieChange={(checked) => handleGarantieChange(instrument.localId, checked)}
            />
          ))}
        </div>
      )}

      {/* Dialog Curier Trimis */}
      <Dialog open={showCurierTrimisDialog} onOpenChange={setShowCurierTrimisDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Selectează data și ora pentru Curier Trimis</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Dată</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    data-button-id="vanzariViewCurierDatePickerButton"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                    title="Deschide calendar pentru data Curier Trimis"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP", { locale: ro }) : "Selectează data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Oră</Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button data-button-id="vanzariViewCurierDialogCancelButton" variant="outline" onClick={() => {
              logBtn('vanzariViewCurierDialogCancelButton', 'Anulează Curier Trimis')
              setShowCurierTrimisDialog(false)
              setSelectedDate(undefined)
              setSelectedTime('08:00')
            }} title="Închide fără a seta Curier Trimis">
              Anulează
            </Button>
            <Button
              data-button-id="vanzariViewCurierDialogConfirmButton"
              title="Setează Curier Trimis cu data/ora selectate"
              onClick={async () => {
                if (!selectedDate) {
                  toast.error('Selectează o dată')
                  return
                }
                logBtn('vanzariViewCurierDialogConfirmButton', 'Confirmă Curier Trimis')
                const dateTime = new Date(selectedDate)
                const [hours, minutes] = selectedTime.split(':')
                dateTime.setHours(parseInt(hours, 10))
                dateTime.setMinutes(parseInt(minutes, 10))
                
                await onCurierTrimisChange?.(true, dateTime.toISOString())
                setShowCurierTrimisDialog(false)
                setSelectedDate(undefined)
                setSelectedTime('08:00')
              }}
              disabled={!selectedDate}
            >
              Confirmă
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bară fixă pentru telefon: acțiuni mereu vizibile */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-3 safe-area-pb flex flex-wrap items-center justify-center gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          {onClose && (
            <Button data-button-id="vanzariViewMobileCloseButton" variant="outline" size="sm" onClick={() => { logBtn('vanzariViewMobileCloseButton', 'Închide'); onClose() }} className="text-xs" title="Închide panoul">
              Închide
            </Button>
          )}
          {onSendTrays && (
            <Button
              data-button-id="vanzariViewMobileSendTraysButton"
              size="sm"
              variant="outline"
              onClick={() => { logBtn('vanzariViewMobileSendTraysButton', 'Trimite tăvițele'); onSendTrays() }}
              disabled={loading || saving || sendTraysDisabled}
              className="text-xs bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
              title={
                loading || saving
                  ? 'Așteaptă să se termine încărcarea / salvarea.'
                  : sendTraysDisabled
                    ? (sendTraysDisabledReason ||
                      'Adaugă tăvițe și atribuie toate instrumentele înainte de expediere.')
                    : 'Trimite tăvițele în departamentele corespunzătoare pentru procesare'
              }
            >
              Trimite tăvițele
            </Button>
          )}
          {onPrintTrays && (
          <Button data-button-id="vanzariViewMobilePrintButton" variant="outline" size="sm" onClick={() => { logBtn('vanzariViewMobilePrintButton', 'Print'); onPrintTrays() }} disabled={loading} className="text-xs" title="Print tăvițe">
              Print
            </Button>
          )}
          {!isLocked && onSaveOptionsOnly && (
            <Button data-button-id="vanzariViewMobileSaveOptionsButton" size="sm" variant="outline" onClick={() => { logBtn('vanzariViewMobileSaveOptionsButton', 'Salvează'); onSaveOptionsOnly() }} disabled={loading || saving || !isDirty} className="text-xs" title="Salvează opțiunile">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvează'}
            </Button>
          )}
          {!isLocked && (
            <Button
              data-button-id="vanzariViewMobileSaveInHistoryButton"
              size="sm"
              onClick={() => { logBtn('vanzariViewMobileSaveInHistoryButton', 'Salvează în Istoric'); handleSave() }}
              disabled={loading || saving || (instruments.length === 0 && !isDirty)}
              className="text-xs bg-primary text-primary-foreground"
              title="Salvează în Istoric"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvează în Istoric'}
            </Button>
          )}
        </div>
      )}
      
      {/* Spacer bottom */}
      <div className="h-4" />
    </div>
  )
}
