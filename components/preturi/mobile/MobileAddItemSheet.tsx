'use client'

import { useState, useMemo } from 'react'
import { Search, Wrench, Package, Settings, Plus, Minus, X, Check } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { Service } from '@/lib/supabase/serviceOperations'
import { MobileBrandSerialSection } from './MobileBrandSerialSection'

interface MobileAddItemSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instruments: Array<{ id: string; name: string; repairable?: boolean }>
  services: Service[]
  parts?: Array<{ id: string; name: string; price: number }>
  isReparatiiPipeline?: boolean
  canAddParts?: boolean
  selectedInstrument?: { id: string; name: string } | null
  instrumentForm?: {
    instrument: { id: string; name: string } | null
    qty: number
    brandSerialGroups: Array<{
      id: string
      brand: string
      qty: number
      serialNumbers: Array<{ id: string; serial: string; garantie: boolean }>
    }>
  }
  onInstrumentChange?: (instrument: { id: string; name: string } | null) => void
  onInstrumentDoubleClick?: (instrument: { id: string; name: string }) => void
  onQtyChange?: (qty: number) => void
  onAddBrandSerialGroup?: () => void
  onRemoveBrandSerialGroup?: (groupId: string) => void
  onUpdateBrand?: (groupId: string, brand: string) => void
  onUpdateBrandQty?: (groupId: string, qty: number) => void
  onAddSerialNumber?: (groupId: string) => void
  onRemoveSerialNumber?: (groupId: string, serialId: string) => void
  onUpdateSerialNumber?: (groupId: string, serialId: string, serial: string) => void
  onUpdateSerialGarantie?: (groupId: string, serialId: string, garantie: boolean) => void
  onAddService?: (service: Service, qty: number, brandSerialIds?: string[]) => void
  onAddPart?: (part: { id: string; name: string; price: number }, qty: number, serialNumber?: string) => void
  onClearForm?: () => void
  /** Optional: set discount % before adding service (Receptie parity with desktop) */
  onSvcDiscountChange?: (discount: string) => void
}

export function MobileAddItemSheet({
  open,
  onOpenChange,
  instruments,
  services,
  parts = [],
  isReparatiiPipeline = false,
  canAddParts = false,
  selectedInstrument,
  instrumentForm,
  onInstrumentChange,
  onInstrumentDoubleClick,
  onQtyChange,
  onAddBrandSerialGroup,
  onRemoveBrandSerialGroup,
  onUpdateBrand,
  onUpdateBrandQty,
  onAddSerialNumber,
  onRemoveSerialNumber,
  onUpdateSerialNumber,
  onUpdateSerialGarantie,
  onAddService,
  onAddPart,
  onClearForm,
  onSvcDiscountChange,
}: MobileAddItemSheetProps) {
  const [activeTab, setActiveTab] = useState('instrument')
  const [instrumentSearch, setInstrumentSearch] = useState('')
  const [serviceSearch, setServiceSearch] = useState('')
  const [partSearch, setPartSearch] = useState('')
  const [localInstrument, setLocalInstrument] = useState<{ id: string; name: string } | null>(null)
  const [localQty, setLocalQty] = useState(1)
  const [localServiceQty, setLocalServiceQty] = useState(1)
  const [localServiceDiscount, setLocalServiceDiscount] = useState(0)
  const [localPartQty, setLocalPartQty] = useState(1)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedPart, setSelectedPart] = useState<{ id: string; name: string; price: number } | null>(null)

  // Folosim instrumentul din form sau local
  const currentInstrument = instrumentForm?.instrument || localInstrument || selectedInstrument

  // Filtrare instrumente
  const filteredInstruments = useMemo(() => {
    if (!instrumentSearch.trim()) return instruments
    const search = instrumentSearch.toLowerCase()
    return instruments.filter(i => 
      i.name.toLowerCase().includes(search)
    )
  }, [instruments, instrumentSearch])

  // Filtrare servicii pentru instrumentul selectat
  const filteredServices = useMemo(() => {
    if (!currentInstrument) return []
    
    let available = services.filter(s => s.instrument_id === currentInstrument.id)
    
    if (serviceSearch.trim()) {
      const search = serviceSearch.toLowerCase()
      available = available.filter(s => 
        s.name.toLowerCase().includes(search)
      )
    }
    
    return available
  }, [services, currentInstrument, serviceSearch])

  // Filtrare piese
  const filteredParts = useMemo(() => {
    if (!partSearch.trim()) return parts
    const search = partSearch.toLowerCase()
    return parts.filter(p => 
      p.name.toLowerCase().includes(search)
    )
  }, [parts, partSearch])

  const handleInstrumentSelect = (instrument: { id: string; name: string }) => {
    setLocalInstrument(instrument)
    onInstrumentChange?.(instrument)
    // Trecem la tab-ul de servicii
    setActiveTab('service')
  }

  const handleInstrumentDoubleClick = (instrument: { id: string; name: string }) => {
    onInstrumentDoubleClick?.(instrument)
    onOpenChange(false)
  }

  const handleServiceSelect = (service: Service) => {
    setSelectedService(service)
  }

  const handleAddService = () => {
    if (selectedService) {
      if (onSvcDiscountChange) {
        onSvcDiscountChange(String(Math.min(100, Math.max(0, localServiceDiscount))))
      }
      onAddService?.(selectedService, localServiceQty)
      setSelectedService(null)
      setLocalServiceQty(1)
      setLocalServiceDiscount(0)
      // Rămânem pe tab pentru a adăuga mai multe servicii
    }
  }

  const handlePartSelect = (part: { id: string; name: string; price: number }) => {
    setSelectedPart(part)
  }

  const handleAddPart = () => {
    if (selectedPart) {
      onAddPart?.(selectedPart, localPartQty)
      setSelectedPart(null)
      setLocalPartQty(1)
    }
  }

  const handleClose = () => {
    setInstrumentSearch('')
    setServiceSearch('')
    setPartSearch('')
    setLocalInstrument(null)
    setLocalQty(1)
    setLocalServiceQty(1)
    setLocalServiceDiscount(0)
    setLocalPartQty(1)
    setSelectedService(null)
    setSelectedPart(null)
    onClearForm?.()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent 
        side="bottom" 
        className="h-[85vh] max-h-[100dvh] rounded-t-2xl p-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
        title="Adaugă poziție"
      >
        {/* Header cu drag handle */}
        <div className="flex flex-col items-center pt-3 pb-2">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
        </div>

        <SheetHeader className="px-4 pb-2">
          <SheetTitle className="text-lg">Adaugă poziție</SheetTitle>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 mx-4" style={{ width: 'calc(100% - 2rem)' }}>
            <TabsTrigger value="instrument" className="gap-1.5">
              <Wrench className="h-4 w-4" />
              <span className="hidden sm:inline">Instrument</span>
            </TabsTrigger>
            <TabsTrigger value="service" className="gap-1.5" disabled={!currentInstrument}>
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Serviciu</span>
            </TabsTrigger>
            {canAddParts && (
              <TabsTrigger value="part" className="gap-1.5">
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline">Piesă</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* Tab Instrument */}
          <TabsContent value="instrument" className="flex-1 overflow-hidden mt-4 px-4">
            {/* Căutare */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Caută instrument..."
                value={instrumentSearch}
                onChange={(e) => setInstrumentSearch(e.target.value)}
                className="pl-9 h-12 text-base"
              />
            </div>

            {/* Instrument selectat */}
            {currentInstrument && (
              <div className="mb-4 p-3 bg-primary/10 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <span className="font-medium">{currentInstrument.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setLocalInstrument(null)
                    onInstrumentChange?.(null)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Lista instrumente */}
            <ScrollArea className="flex-1 -mx-4 px-4" style={{ height: 'calc(100% - 140px)' }}>
              <div className="space-y-2 pb-4">
                {filteredInstruments.map((instrument) => (
                  <button
                    key={instrument.id}
                    className={cn(
                      "w-full p-4 rounded-lg border text-left transition-all active:scale-[0.98]",
                      currentInstrument?.id === instrument.id
                        ? "border-primary bg-primary/5"
                        : "border-slate-200 dark:border-slate-700 hover:border-primary/50"
                    )}
                    onClick={() => handleInstrumentSelect(instrument)}
                    onDoubleClick={() => handleInstrumentDoubleClick(instrument)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Wrench className="h-5 w-5 text-slate-500" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {instrument.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Apasă pentru selectare • Dublu-tap pentru adăugare rapidă
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
                {filteredInstruments.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nu s-au găsit instrumente
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Brand/Serial pentru Reparații */}
            {isReparatiiPipeline && currentInstrument && instrumentForm && (
              <MobileBrandSerialSection
                brandSerialGroups={instrumentForm.brandSerialGroups}
                onAddGroup={onAddBrandSerialGroup}
                onRemoveGroup={onRemoveBrandSerialGroup}
                onUpdateBrand={onUpdateBrand}
                onUpdateQty={onUpdateBrandQty}
                onAddSerial={onAddSerialNumber}
                onRemoveSerial={onRemoveSerialNumber}
                onUpdateSerial={onUpdateSerialNumber}
                onUpdateGarantie={onUpdateSerialGarantie}
              />
            )}
          </TabsContent>

          {/* Tab Serviciu */}
          <TabsContent value="service" className="flex-1 overflow-hidden mt-4 px-4">
            {/* Info instrument selectat */}
            {currentInstrument && (
              <div className="mb-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center gap-2">
                <Wrench className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium">{currentInstrument.name}</span>
              </div>
            )}

            {/* Căutare */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Caută serviciu..."
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                className="pl-9 h-12 text-base"
              />
            </div>

            {/* Serviciu selectat */}
            {selectedService && (
              <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">
                    {selectedService.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setSelectedService(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setLocalServiceQty(Math.max(1, localServiceQty - 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-12 text-center text-lg font-medium">{localServiceQty}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setLocalServiceQty(localServiceQty + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">
                      {selectedService.price?.toFixed(2) || '0.00'} RON × {localServiceQty}
                    </div>
                    <div className="text-lg font-semibold text-emerald-600">
                      {((selectedService.price || 0) * localServiceQty * (1 - localServiceDiscount / 100)).toFixed(2)} RON
                    </div>
                  </div>
                </div>
                {onSvcDiscountChange && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Discount %</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setLocalServiceDiscount(d => Math.max(0, d - 5))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={localServiceDiscount}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setLocalServiceDiscount(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                        className="h-8 w-12 text-center text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setLocalServiceDiscount(d => Math.min(100, d + 5))}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
                <Button 
                  className="w-full mt-3 h-12"
                  onClick={handleAddService}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Adaugă serviciu
                </Button>
              </div>
            )}

            {/* Lista servicii */}
            <ScrollArea className="flex-1 -mx-4 px-4" style={{ height: selectedService ? 'calc(100% - 280px)' : 'calc(100% - 120px)' }}>
              <div className="space-y-2 pb-4">
                {filteredServices.map((service) => (
                  <button
                    key={service.id}
                    className={cn(
                      "w-full p-4 rounded-lg border text-left transition-all active:scale-[0.98]",
                      selectedService?.id === service.id
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                        : "border-slate-200 dark:border-slate-700 hover:border-emerald-300"
                    )}
                    onClick={() => handleServiceSelect(service)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {service.name}
                        </div>
                        {service.estimated_time && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Timp estimat: {service.estimated_time}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-emerald-600">
                          {service.price?.toFixed(2) || '0.00'} RON
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
                {filteredServices.length === 0 && currentInstrument && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nu s-au găsit servicii pentru acest instrument
                  </div>
                )}
                {!currentInstrument && (
                  <div className="text-center py-8 text-muted-foreground">
                    Selectează mai întâi un instrument
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Tab Piese */}
          {canAddParts && (
            <TabsContent value="part" className="flex-1 overflow-hidden mt-4 px-4">
              {/* Căutare */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Caută piesă..."
                  value={partSearch}
                  onChange={(e) => setPartSearch(e.target.value)}
                  className="pl-9 h-12 text-base"
                />
              </div>

              {/* Piesă selectată */}
              {selectedPart && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-blue-700 dark:text-blue-300">
                      {selectedPart.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setSelectedPart(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => setLocalPartQty(Math.max(1, localPartQty - 1))}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-12 text-center text-lg font-medium">{localPartQty}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => setLocalPartQty(localPartQty + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">
                        {selectedPart.price.toFixed(2)} RON × {localPartQty}
                      </div>
                      <div className="text-lg font-semibold text-blue-600">
                        {(selectedPart.price * localPartQty).toFixed(2)} RON
                      </div>
                    </div>
                  </div>
                  <Button 
                    className="w-full mt-3 h-12"
                    onClick={handleAddPart}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Adaugă piesă
                  </Button>
                </div>
              )}

              {/* Lista piese */}
              <ScrollArea className="flex-1 -mx-4 px-4" style={{ height: selectedPart ? 'calc(100% - 240px)' : 'calc(100% - 80px)' }}>
                <div className="space-y-2 pb-4">
                  {filteredParts.map((part) => (
                    <button
                      key={part.id}
                      className={cn(
                        "w-full p-4 rounded-lg border text-left transition-all active:scale-[0.98]",
                        selectedPart?.id === part.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                          : "border-slate-200 dark:border-slate-700 hover:border-blue-300"
                      )}
                      onClick={() => handlePartSelect(part)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Package className="h-5 w-5 text-slate-500" />
                          </div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {part.name}
                          </div>
                        </div>
                        <div className="font-semibold text-blue-600">
                          {part.price.toFixed(2)} RON
                        </div>
                      </div>
                    </button>
                  ))}
                  {filteredParts.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      Nu s-au găsit piese
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
