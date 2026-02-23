'use client'

/**
 * VanzariViewMinimalistProfesionist
 * 
 * View pentru vânzări cu funcționalitate de selectare instrumente/servicii multiple
 * Design consistent cu VanzariView original
 */

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { 
  X, Plus, Minus, Package, Trash2, Loader2, FileCheck,
  CalendarIcon, Clock
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import type { LeadQuoteItem, LeadQuote } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Lead } from '@/app/(crm)/dashboard/page'

// ============================================================================
// TYPES
// ============================================================================

interface SelectedInstrument {
  id: string
  name: string
  qty: number
  services: Array<{
    id: string
    name: string
    price: number
    qty: number
    discount: number
  }>
}

export interface VanzariViewMinimalistProfesionistProps {
  // Data
  lead: Lead | null
  items: LeadQuoteItem[]
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id?: string | null }>
  
  // State
  loading: boolean
  saving: boolean
  isDirty: boolean
  urgentAllServices: boolean
  subscriptionType?: 'services' | 'parts' | 'both' | ''
  officeDirect: boolean
  curierTrimis: boolean
  retur: boolean
  noDeal: boolean
  nuRaspunde: boolean
  
  // Tray management
  quotes?: LeadQuote[]
  selectedQuoteId?: string | null
  
  // Callbacks
  onSave: () => void
  onClose?: () => void
  onUrgentChange: (checked: boolean) => Promise<void>
  onSubscriptionChange?: (value: 'services' | 'parts' | 'both' | '') => void
  onOfficeDirectChange: (checked: boolean) => Promise<void>
  onCurierTrimisChange?: (checked: boolean, dateTime?: string) => Promise<void>
  onReturChange?: (checked: boolean) => Promise<void>
  onNoDealChange: (checked: boolean) => void
  onNuRaspundeChange: (checked: boolean, callbackTime?: string) => void
  onApelat?: (callbackDate: string, targetStage: string) => Promise<void>
  onAddInstrumentWithServices?: (instrumentId: string, qty: number, services: Array<{ id: string; qty: number; discount: number }>) => Promise<void>
  onSetStatusComanda?: () => Promise<void>
  isOwner?: boolean
  
  stages?: string[]
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VanzariViewMinimalistProfesionist({
  lead,
  items,
  services,
  instruments,
  loading,
  saving,
  isDirty,
  urgentAllServices,
  subscriptionType = '',
  officeDirect,
  curierTrimis,
  retur,
  noDeal,
  nuRaspunde,
  quotes = [],
  selectedQuoteId,
  onSave,
  onClose,
  onUrgentChange,
  onSubscriptionChange,
  onOfficeDirectChange,
  onCurierTrimisChange,
  onReturChange,
  onNoDealChange,
  onNuRaspundeChange,
  onApelat,
  onAddInstrumentWithServices,
  onSetStatusComanda,
  isOwner = false,
  stages = [],
}: VanzariViewMinimalistProfesionistProps) {
  
  // ============================================================================
  // STATE
  // ============================================================================
  
  const [statusComandaLoading, setStatusComandaLoading] = useState(false)
  
  // Dialog pentru Curier Trimis (data/ora)
  const [showCurierTrimisDialog, setShowCurierTrimisDialog] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedTime, setSelectedTime] = useState<string>('08:00')
  
  // Instrumente selectate (multiple, tipuri diferite)
  const [selectedInstruments, setSelectedInstruments] = useState<SelectedInstrument[]>([])
  const [currentInstrumentId, setCurrentInstrumentId] = useState<string>('')
  
  // ============================================================================
  // COMPUTED
  // ============================================================================
  
  // Total calculat din instrumentele selectate
  const calculatedTotal = useMemo(() => {
    let sum = 0
    selectedInstruments.forEach(inst => {
      inst.services.forEach(svc => {
        const base = svc.price * svc.qty
        const afterDiscount = base * (1 - svc.discount / 100)
        sum += afterDiscount
      })
    })
    if (urgentAllServices) {
      sum *= (1 + URGENT_MARKUP_PCT / 100)
    }
    return sum
  }, [selectedInstruments, urgentAllServices])
  
  // ============================================================================
  // HANDLERS
  // ============================================================================
  
  const handleAddInstrument = () => {
    if (!currentInstrumentId) return
    
    const instrument = instruments.find(i => i.id === currentInstrumentId)
    if (!instrument) return
    
    if (selectedInstruments.some(i => i.id === currentInstrumentId)) {
      toast.error('Instrumentul este deja adăugat')
      return
    }
    
    setSelectedInstruments(prev => [...prev, {
      id: instrument.id,
      name: instrument.name,
      qty: 1,
      services: []
    }])
    
    setCurrentInstrumentId('')
  }
  
  const handleRemoveInstrument = (instrumentId: string) => {
    setSelectedInstruments(prev => prev.filter(i => i.id !== instrumentId))
  }
  
  const handleInstrumentQtyChange = (instrumentId: string, qty: number) => {
    setSelectedInstruments(prev => prev.map(i => 
      i.id === instrumentId ? { ...i, qty: Math.max(1, qty) } : i
    ))
  }
  
  const handleAddService = (instrumentId: string, service: Service) => {
    setSelectedInstruments(prev => prev.map(inst => {
      if (inst.id !== instrumentId) return inst
      
      if (inst.services.some(s => s.id === service.id)) {
        return inst
      }
      
      return {
        ...inst,
        services: [...inst.services, {
          id: service.id,
          name: service.name,
          price: service.price,
          qty: 1,
          discount: 0
        }]
      }
    }))
  }
  
  const handleRemoveService = (instrumentId: string, serviceId: string) => {
    setSelectedInstruments(prev => prev.map(inst => {
      if (inst.id !== instrumentId) return inst
      return {
        ...inst,
        services: inst.services.filter(s => s.id !== serviceId)
      }
    }))
  }
  
  const handleServiceQtyChange = (instrumentId: string, serviceId: string, qty: number) => {
    setSelectedInstruments(prev => prev.map(inst => {
      if (inst.id !== instrumentId) return inst
      return {
        ...inst,
        services: inst.services.map(s => 
          s.id === serviceId ? { ...s, qty: Math.max(1, qty) } : s
        )
      }
    }))
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-4 border rounded-xl bg-card shadow-sm overflow-visible">
      {/* Header — consistent cu VanzariView */}
      <div className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-800/30 border-b px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 max-sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="font-semibold text-base text-foreground">Comandă Nouă</h3>
            <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">Adaugă instrumente și servicii</p>
          </div>
          <div className="flex items-center gap-2">
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Închide
              </Button>
            )}
            <Button 
              size="sm"
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSave()
              }} 
              disabled={loading || saving || !isDirty}
              className="shadow-sm flex-shrink-0 min-h-11 sm:min-h-9 w-full sm:w-auto touch-manipulation"
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
          </div>
        </div>
      </div>

      {/* Urgent + Abonament + Livrare — consistent cu VanzariView */}
      <div className="mx-2 sm:mx-4 px-3 py-2 rounded-lg bg-muted/30 border">
        <div className="flex flex-wrap items-center gap-4">
          {/* Urgent toggle */}
          <label className="flex items-center gap-2.5 group cursor-pointer">
            <div className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200",
              urgentAllServices ? 'bg-red-500' : 'bg-muted-foreground/20'
            )}>
              <Checkbox
                id="urgent-all"
                checked={urgentAllServices}
                onCheckedChange={(c) => onUrgentChange(!!c)}
                className="sr-only"
              />
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200",
                urgentAllServices ? 'translate-x-4' : 'translate-x-0.5'
              )} />
            </div>
            <span className={cn(
              "text-sm font-medium transition-colors",
              urgentAllServices ? 'text-red-600' : 'text-muted-foreground group-hover:text-foreground'
            )}>
              Urgent
            </span>
            {urgentAllServices && (
              <span className="text-[10px] font-medium text-red-500 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded">
                +30%
              </span>
            )}
          </label>
          
          <div className="h-5 w-px bg-border/60" />
          
          {/* Abonament */}
          {onSubscriptionChange && (
            <div className="flex items-center gap-2">
              <Label htmlFor="subscription" className="text-sm font-medium text-muted-foreground">Abonament</Label>
              <select
                id="subscription"
                className="h-8 text-sm rounded-lg border border-border/60 px-3 bg-white dark:bg-background transition-colors hover:border-primary/40 cursor-pointer"
                value={subscriptionType}
                onChange={e => onSubscriptionChange(e.target.value as 'services' | 'parts' | 'both' | '')}
              >
                <option value="">Fără abonament</option>
                <option value="services">Servicii</option>
                <option value="parts">Piese</option>
                <option value="both">Ambele</option>
              </select>
            </div>
          )}
          
          <div className="h-5 w-px bg-border/60" />
          
          {/* Butoane livrare */}
          <Button
            type="button"
            variant={officeDirect ? "default" : "outline"}
            size="sm"
            disabled={loading || saving || curierTrimis}
            onClick={async () => {
              await onOfficeDirectChange(!officeDirect)
            }}
            className={cn(
              "h-9 px-3 text-sm font-medium transition-colors",
              officeDirect 
                ? "bg-blue-500 hover:bg-blue-600 text-white border-blue-500" 
                : "border-border hover:bg-muted"
            )}
          >
            Office direct
          </Button>
          
          <Button
            type="button"
            variant={curierTrimis ? "default" : "outline"}
            size="sm"
            disabled={loading || saving || officeDirect}
            onClick={() => {
              if (curierTrimis) {
                if (onCurierTrimisChange) {
                  onCurierTrimisChange(false)
                }
              } else {
                setShowCurierTrimisDialog(true)
              }
            }}
            className={cn(
              "h-9 px-3 text-sm font-medium transition-colors",
              curierTrimis 
                ? "bg-purple-500 hover:bg-purple-600 text-white border-purple-500" 
                : "border-border hover:bg-muted"
            )}
          >
            Curier Trimis
          </Button>
          
          {/* Buton Retur */}
          <Button
            type="button"
            variant={retur ? "default" : "outline"}
            size="sm"
            onClick={async () => {
              if (onReturChange) {
                await onReturChange(!retur)
              }
            }}
            className={cn(
              "h-9 px-3 text-sm font-medium transition-colors gap-1.5",
              retur 
                ? "bg-orange-500 hover:bg-orange-600 text-white border-orange-500" 
                : "border-orange-300 text-orange-600 hover:bg-orange-50 hover:border-orange-400"
            )}
          >
            <Package className="h-3.5 w-3.5" />
            Retur
          </Button>

          {/* Status Comandă - Owner only */}
          {isOwner && onSetStatusComanda && quotes && quotes.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={statusComandaLoading}
              onClick={async () => {
                setStatusComandaLoading(true)
                try {
                  await onSetStatusComanda()
                } finally {
                  setStatusComandaLoading(false)
                }
              }}
              className="h-9 px-3 text-sm font-medium gap-1.5 bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
              title="Setează status fișă la Comandă (doar Owner)"
            >
              {statusComandaLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileCheck className="h-3.5 w-3.5" />
              )}
              Status Comandă
            </Button>
          )}
          
          {/* Dialog pentru Curier Trimis */}
          <Dialog 
            open={showCurierTrimisDialog} 
            onOpenChange={(open) => {
              setShowCurierTrimisDialog(open)
              if (!open) {
                setSelectedDate(undefined)
                setSelectedTime('08:00')
              }
            }}
          >
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
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCurierTrimisDialog(false)
                    setSelectedDate(undefined)
                    setSelectedTime('08:00')
                  }}
                >
                  Anulează
                </Button>
                <Button
                  onClick={async () => {
                    if (!selectedDate) {
                      toast.error('Selectează o dată')
                      return
                    }
                    
                    const dateTime = new Date(selectedDate)
                    const [hours, minutes] = selectedTime.split(':')
                    dateTime.setHours(parseInt(hours, 10))
                    dateTime.setMinutes(parseInt(minutes, 10))
                    
                    if (onCurierTrimisChange) {
                      await onCurierTrimisChange(true, dateTime.toISOString())
                    }
                    
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
        </div>
      </div>

      {/* Secțiunea Selectare Instrumente */}
      <div className="mx-2 sm:mx-4">
        <div className="p-4 rounded-lg border bg-card">
          <h4 className="text-sm font-semibold text-foreground mb-3">Selectare Instrumente</h4>
          
          {/* Add instrument */}
          <div className="flex items-center gap-3 mb-4">
            <Select value={currentInstrumentId} onValueChange={setCurrentInstrumentId}>
              <SelectTrigger className="w-80">
                <SelectValue placeholder="Selectează instrument..." />
              </SelectTrigger>
              <SelectContent>
                {instruments.map(inst => (
                  <SelectItem 
                    key={inst.id} 
                    value={inst.id}
                    disabled={selectedInstruments.some(i => i.id === inst.id)}
                  >
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              onClick={handleAddInstrument}
              disabled={!currentInstrumentId}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              Adaugă Instrument
            </Button>
          </div>
          
          {/* Lista instrumente selectate */}
          {selectedInstruments.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-muted rounded-lg">
              <p className="text-muted-foreground">Niciun instrument selectat</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Selectează un instrument din lista de mai sus</p>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedInstruments.map(instrument => {
                const instrumentServices = services.filter(s => s.instrument_id === instrument.id)
                
                return (
                  <div 
                    key={instrument.id}
                    className="rounded-lg border bg-muted/30 overflow-hidden"
                  >
                    {/* Header instrument */}
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b">
                      <div className="flex items-center gap-4">
                        <h5 className="font-semibold text-foreground">{instrument.name}</h5>
                        
                        {/* Cantitate instrument */}
                        <div className="flex items-center gap-1 bg-background rounded-md border">
                          <button
                            onClick={() => handleInstrumentQtyChange(instrument.id, instrument.qty - 1)}
                            className="p-1.5 hover:bg-muted rounded-l-md"
                          >
                            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <span className="w-8 text-center text-sm font-medium">{instrument.qty}</span>
                          <button
                            onClick={() => handleInstrumentQtyChange(instrument.id, instrument.qty + 1)}
                            className="p-1.5 hover:bg-muted rounded-r-md"
                          >
                            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                        
                        <span className="text-xs text-muted-foreground">buc</span>
                      </div>
                      
                      <button
                        onClick={() => handleRemoveInstrument(instrument.id)}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    
                    {/* Servicii */}
                    <div className="p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Servicii disponibile ({instrumentServices.length})
                      </p>
                      
                      {instrumentServices.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">
                          Nu există servicii pentru acest instrument
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {instrumentServices.map(service => {
                            const isAdded = instrument.services.some(s => s.id === service.id)
                            const addedService = instrument.services.find(s => s.id === service.id)
                            
                            return (
                              <div
                                key={service.id}
                                className={cn(
                                  "flex items-center justify-between p-3 rounded-lg border transition-all",
                                  isAdded 
                                    ? "border-primary/50 bg-primary/5"
                                    : "border-border hover:border-primary/30 bg-background"
                                )}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className={cn(
                                    "text-sm font-medium truncate",
                                    isAdded ? "text-primary" : "text-foreground"
                                  )}>
                                    {service.name}
                                  </p>
                                  <p className={cn(
                                    "text-xs",
                                    isAdded ? "text-primary/70" : "text-muted-foreground"
                                  )}>
                                    {service.price.toFixed(2)} lei
                                  </p>
                                </div>
                                
                                {isAdded ? (
                                  <div className="flex items-center gap-2">
                                    {/* Qty controls */}
                                    <div className="flex items-center gap-0.5 bg-background rounded-md border border-primary/30">
                                      <button
                                        onClick={() => handleServiceQtyChange(instrument.id, service.id, (addedService?.qty || 1) - 1)}
                                        className="p-1 hover:bg-primary/10 rounded-l-md"
                                      >
                                        <Minus className="h-3 w-3 text-primary/60" />
                                      </button>
                                      <span className="w-6 text-center text-xs font-medium text-primary">
                                        {addedService?.qty || 1}
                                      </span>
                                      <button
                                        onClick={() => handleServiceQtyChange(instrument.id, service.id, (addedService?.qty || 1) + 1)}
                                        className="p-1 hover:bg-primary/10 rounded-r-md"
                                      >
                                        <Plus className="h-3 w-3 text-primary/60" />
                                      </button>
                                    </div>
                                    
                                    <button
                                      onClick={() => handleRemoveService(instrument.id, service.id)}
                                      className="p-1.5 text-primary/60 hover:text-destructive hover:bg-destructive/10 rounded-md"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAddService(instrument.id, service)}
                                    className="h-7 text-xs"
                                  >
                                    Adaugă
                                  </Button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      
                      {/* Servicii adăugate pentru acest instrument */}
                      {instrument.services.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Servicii selectate ({instrument.services.length})
                          </p>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Serviciu</TableHead>
                                <TableHead className="text-xs text-center w-20">Cant.</TableHead>
                                <TableHead className="text-xs text-right w-24">Preț</TableHead>
                                <TableHead className="text-xs text-right w-24">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {instrument.services.map(svc => {
                                const lineTotal = svc.price * svc.qty * (1 - svc.discount / 100)
                                return (
                                  <TableRow key={svc.id}>
                                    <TableCell className="text-sm font-medium">{svc.name}</TableCell>
                                    <TableCell className="text-center">{svc.qty}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{svc.price.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-medium">{lineTotal.toFixed(2)}</TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Totals */}
      {selectedInstruments.length > 0 && (
        <div className="mx-2 sm:mx-4 p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {selectedInstruments.length} instrument{selectedInstruments.length > 1 ? 'e' : ''} · 
                {' '}{selectedInstruments.reduce((acc, i) => acc + i.services.length, 0)} servicii
              </p>
              {urgentAllServices && (
                <p className="text-sm text-red-500">Include markup urgent +{URGENT_MARKUP_PCT}%</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold text-foreground">
                {calculatedTotal.toFixed(2)} <span className="text-base font-normal text-muted-foreground">lei</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
