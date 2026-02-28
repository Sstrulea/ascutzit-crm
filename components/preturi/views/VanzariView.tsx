'use client'

import { useEffect, useState } from 'react'
import { AddInstrumentForm } from '../forms/AddInstrumentForm'
import { AddServiceForm } from '../forms/AddServiceForm'
import { ItemsTable } from '../sections/ItemsTable'
import { InstrumenteReparatieDefectSection } from '../sections/InstrumenteReparatieDefectSection'
import { MobileItemsView } from '../mobile/MobileItemsView'
import { cn } from '@/lib/utils'
import { TotalsSection } from '../sections/TotalsSection'
import { TrayTabs } from '../sections/TrayTabs'
import { TrayImagesSection } from '../sections/TrayImagesSection'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Loader2, Trash2, Move, CalendarIcon, Clock, Pencil, Package, FileCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { useIsMobile } from '@/hooks/use-mobile'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import type { LeadQuoteItem, LeadQuote } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Lead } from '@/app/(crm)/dashboard/page'

export interface VanzariViewProps {
  // State
  instrumentForm: { 
    instrument: string
    qty: string
  }
  svc: { 
    id: string
    qty: string
    discount: string
    instrumentId: string
  }
  serviceSearchQuery: string
  serviceSearchFocused: boolean
  items: LeadQuoteItem[]
  subscriptionType: 'services' | 'parts' | 'both' | ''
  trayDetails: string
  loadingTrayDetails: boolean
  urgentAllServices: boolean
  officeDirect: boolean
  curierTrimis: boolean
  retur: boolean
  noDeal: boolean
  nuRaspunde: boolean
  nuRaspundeCallbackAt?: string | null
  callBack: boolean
  loading: boolean
  saving: boolean
  isDirty: boolean
  isServiceFileLocked?: boolean // Flag pentru a marca dacă fișa este blocată (se încarcă din DB)
  serviceFileStatus?: string | null // Status fișă (noua | in_lucru | finalizata | comanda) – pentru debug în consolă
  currentServiceFileStage?: string | null
  
  // Data
  availableInstruments: Array<{ id: string; name: string }>
  availableServices: Service[]
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id?: string | null; pipeline?: string | null; repairable?: boolean }>
  departments?: Array<{ id: string; name: string }>
  lead: Lead | null
  fisaId?: string | null
  selectedQuoteId: string | null
  
  // Callbacks
  onInstrumentChange: (instrumentId: string) => void
  onInstrumentDoubleClick?: (instrumentId: string) => void
  onQtyChange: (qty: string) => void
  onServiceSearchChange: (query: string) => void
  onServiceSearchFocus: () => void
  onServiceSearchBlur: () => void
  onServiceSelect: (serviceId: string, serviceName: string) => void
  onServiceDoubleClick: (serviceId: string, serviceName: string) => void
  onSvcQtyChange: (qty: string) => void
  onSvcDiscountChange: (discount: string) => void
  onAddService: () => void
  onUpdateItem: (id: string, patch: Partial<LeadQuoteItem>) => void
  onDelete: (id: string) => void
  onDetailsChange: (details: string) => void
  onOfficeDirectChange: (isOfficeDirect: boolean) => Promise<void>
  onCurierTrimisChange?: (checked: boolean, dateTime?: string) => Promise<void>
  onReturChange?: (checked: boolean) => Promise<void>
  onUrgentChange: (checked: boolean) => Promise<void>
  onSubscriptionChange: (value: 'services' | 'parts' | 'both' | '') => void
  onNoDealChange: (checked: boolean) => void
  onNuRaspundeChange: (checked: boolean, callbackTime?: string) => void
  onCallBackChange: (checked: boolean) => void
  onSave: () => void
  setIsDirty?: (dirty: boolean) => void
  
  // Flags pentru permisiuni
  isVanzariPipeline?: boolean
  isReceptiePipeline?: boolean
  isOwner?: boolean
  isAdmin?: boolean
  
  // Tehnician assignment (doar admini)
  technicians?: Array<{ id: string; name: string }>
  onTechnicianChange?: (technicianId: string) => void
  
  onSetStatusComanda?: () => Promise<void> // [OWNER-ONLY] DE ELIMINAT mai târziu
  
  // Callbacks pentru adăugare instrument direct
  onAddInstrumentDirect?: (instrumentId: string, qty: number) => void
  
  // Callback pentru click pe rând (editare)
  onRowClick?: (item: LeadQuoteItem) => void
  
  // Callback pentru resetare formulare (undo)
  onClearForm?: () => void
// -------------------------------------------------- COD PENTRU POPULARE CASETE -----------------------------------------------------
  onUndo?: () => void
  previousFormState?: any
// -----------------------------------------------------------------------------------------------------------------------------------
  
  // Computed
  currentInstrumentId: string | null
  hasServicesOrInstrumentInSheet: boolean
  isTechnician: boolean
  isDepartmentPipeline: boolean
  subtotal: number
  totalDiscount: number
  total: number
  instrumentSettings: Record<string, any>
  canEditUrgentAndSubscription?: boolean
  
  // Global discount
  globalDiscountPct?: number
  onGlobalDiscountChange?: (value: number) => void
  
  // Tray management
  quotes?: LeadQuote[]
  onTraySelect?: (trayId: string) => void
  onAddTray?: () => void
  onDeleteTray?: (trayId: string) => void
  sendingTrays?: boolean
  traysAlreadyInDepartments?: boolean
  onSendTrays?: () => void
  onPrintTrays?: () => void

  // Instrument distribution
  instrumentsGrouped?: Array<{ instrument: { id: string; name: string }; items: LeadQuoteItem[] }>
  onMoveInstrument?: (instrumentGroup: { instrument: { id: string; name: string }; items: LeadQuoteItem[] }) => void
  
  // Tray images
  trayImages?: Array<{ id: string; file_path: string; filename?: string }>
  uploadingImage?: boolean
  isImagesExpanded?: boolean
  canAddTrayImages?: boolean
  canViewTrayImages?: boolean
  onToggleImagesExpanded?: () => void
  onImageUpload?: (file: File) => void
  onDownloadAllImages?: () => void
  onImageDelete?: (imageId: string, filePath: string) => void
}

export function VanzariView({
  instrumentForm,
  svc,
  serviceSearchQuery,
  serviceSearchFocused,
  items,
  subscriptionType,
  trayDetails,
  loadingTrayDetails,
  urgentAllServices,
  officeDirect,
  curierTrimis,
  retur = false,
  noDeal,
  nuRaspunde,
  nuRaspundeCallbackAt,
  callBack,
  loading,
  saving,
  isDirty,
  isServiceFileLocked,
  serviceFileStatus,
  availableInstruments,
  availableServices,
  services,
  instruments,
  departments = [],
  lead,
  fisaId,
  selectedQuoteId,
  onInstrumentChange,
  onInstrumentDoubleClick,
  onQtyChange,
  onServiceSearchChange,
  onServiceSearchFocus,
  onServiceSearchBlur,
  onServiceSelect,
  onServiceDoubleClick,
  onSvcQtyChange,
  onSvcDiscountChange,
  onAddService,
  onUpdateItem,
  onDelete,
  onDetailsChange,
  onOfficeDirectChange,
  onCurierTrimisChange,
  onReturChange,
  onUrgentChange,
  onSubscriptionChange,
  onNoDealChange,
  onNuRaspundeChange,
  onCallBackChange,
  onSave,
  setIsDirty,
  currentInstrumentId,
  hasServicesOrInstrumentInSheet,
  isTechnician,
  isDepartmentPipeline,
  subtotal,
  totalDiscount,
  total,
  instrumentSettings,
  canEditUrgentAndSubscription = true,
  globalDiscountPct = 0,
  onGlobalDiscountChange,
  quotes = [],
  onTraySelect,
  onAddTray,
  onDeleteTray,
  sendingTrays = false,
  traysAlreadyInDepartments = false,
  onSendTrays,
  onPrintTrays,
  currentServiceFileStage,
  instrumentsGrouped = [],
  onMoveInstrument,
  trayImages = [],
  uploadingImage = false,
  isImagesExpanded = false,
  canAddTrayImages = false,
  canViewTrayImages = false,
  onToggleImagesExpanded,
  onImageUpload,
  onDownloadAllImages,
  onImageDelete,
  isVanzariPipeline = false,
  isReceptiePipeline = false,
  isOwner = false,
  isAdmin = false,
  technicians = [],
  onTechnicianChange,
  onSetStatusComanda,
  onAddInstrumentDirect,
  onRowClick,
  onClearForm,
// -------------------------------------------------- COD PENTRU POPULARE CASETE -----------------------------------------------------
  onUndo,
  previousFormState,
// -----------------------------------------------------------------------------------------------------------------------------------
}: VanzariViewProps) {
  // State pentru dialog-ul de selectare dată și oră pentru Curier Trimis
  const [showCurierTrimisDialog, setShowCurierTrimisDialog] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedTime, setSelectedTime] = useState<string>('08:00')
  const [statusComandaLoading, setStatusComandaLoading] = useState(false)
  const isMobile = useIsMobile()
  
  // Transformă instrumentForm pentru mobile
  const currentInstrument = instrumentForm.instrument 
    ? instruments.find(i => i.id === instrumentForm.instrument)
    : null
  
  const mobileInstrumentForm = {
    instrument: currentInstrument ? { id: currentInstrument.id, name: currentInstrument.name } : null,
    qty: parseInt(instrumentForm.qty) || 1,
  }
  // VERIFICARE: Fișa este LOCKED dacă flag-ul is_locked este true în DB
  // IMPORTANT: Blocarea se face DOAR pe baza câmpului is_locked din DB, nu pe checkbox-uri
  // Checkbox-urile "Office Direct" și "Curier Trimis" doar actualizează state-ul local
  // După salvare, dacă checkbox-urile sunt bifate, is_locked se setează în DB și fișa se blochează
  // EXCEPȚIE: Pentru Recepție și Department, fișa NU se blochează niciodată
  const isLocked = Boolean(isServiceFileLocked) && !isReceptiePipeline && !isDepartmentPipeline
  
  // Debug logging pentru blocare (+ status fișă pentru depanare)
  useEffect(() => {
    console.log('[VanzariView] Blocare fișă:', {
      status: serviceFileStatus ?? '(necunoscut)',
      isServiceFileLocked,
      isReceptiePipeline,
      isDepartmentPipeline,
      isLocked,
      officeDirect,
      curierTrimis
    })
  }, [serviceFileStatus, isServiceFileLocked, isReceptiePipeline, isDepartmentPipeline, isLocked, officeDirect, curierTrimis])
  
  // Validări pentru checkbox-urile Office Direct și Curier Trimis
  // Permitem selecția chiar și fără items, dar salvăm doar când există items
  const canSelectDelivery = !!(fisaId && selectedQuoteId) && !isLocked
  const canSaveDelivery = !!(fisaId && selectedQuoteId && items.length > 0)
  
  // Debug logging pentru a identifica de ce checkbox-urile sunt disabled
  useEffect(() => {
    // console.log('[VanzariView] Delivery checkbox debug:', {
    //   canSelectDelivery,
    //   fisaId: fisaId || 'LIPSEȘTE',
    //   selectedQuoteId: selectedQuoteId || 'LIPSEȘTE',
    //   itemsLength: items.length,
    //   officeDirect,
    //   curierTrimis,
    //   loading,
    //   saving,
    //   officeDirectDisabled: !canSelectDelivery || curierTrimis || loading || saving,
    //   curierTrimisDisabled: !canSelectDelivery || officeDirect || loading || saving,
    //   reasons: {
    //     noFisaId: !fisaId,
    //     noSelectedQuoteId: !selectedQuoteId,
    //     noItems: items.length === 0,
    //     otherChecked: officeDirect || curierTrimis,
    //     isLoading: loading,
    //     isSaving: saving
    //   },
    //   canSaveDelivery
    // })
  }, [canSelectDelivery, fisaId, selectedQuoteId, items.length, officeDirect, curierTrimis, loading, saving])

  return (
    <div className="space-y-4 border rounded-xl bg-card shadow-sm overflow-visible">
      {/* Header — responsive pe mobile/tabletă */}
      <div className={`border-b px-3 py-3 sm:px-4 ${isLocked 
        ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20' 
        : 'bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-800/30'}`}>
        <div className="flex flex-col gap-3 max-sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {isLocked ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-base text-amber-700 dark:text-amber-400">Fișă Finalizată</h3>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                    {officeDirect ? 'Office Direct' : 'Curier Trimis'}
                  </span>
                </div>
                <p className="text-sm text-amber-600/80 dark:text-amber-400/70 mt-0.5">
                  Fișă trimisă • Creează fișă nouă pentru modificări.
                </p>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-base text-foreground">Comandă Nouă</h3>
                <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">Adaugă instrumente și servicii</p>
              </>
            )}
          </div>
          {!isServiceFileLocked && (
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
          )}
        </div>
      </div>

      {quotes && quotes.length > 0 && (
        <div className="px-2 sm:px-4">
          <TrayTabs
            quotes={quotes}
            selectedQuoteId={selectedQuoteId}
            isVanzariPipeline={isVanzariPipeline ?? false}
            isReceptiePipeline={isReceptiePipeline ?? false}
            isDepartmentPipeline={isDepartmentPipeline}
            isVanzatorMode={false}
            sendingTrays={sendingTrays ?? false}
            traysAlreadyInDepartments={traysAlreadyInDepartments ?? false}
            currentServiceFileStage={currentServiceFileStage}
            officeDirect={officeDirect}
            curierTrimis={curierTrimis}
            onTraySelect={onTraySelect || (() => {})}
            onAddTray={onAddTray || (() => {})}
            onDeleteTray={onDeleteTray || (() => {})}
            onSendTrays={onSendTrays || (() => {})}
            onPrintTrays={onPrintTrays}
            isOwner={isOwner}
            onSetStatusComanda={onSetStatusComanda}
          />
        </div>
      )}

      {(true) && (
        <div className={`mx-2 sm:mx-4 px-3 py-2 rounded-lg border ${isServiceFileLocked ? 'bg-muted/50 opacity-75' : 'bg-muted/30'}`}>
          <div className="flex flex-wrap items-center gap-4">
            <label className={`flex items-center gap-2.5 group ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${urgentAllServices ? 'bg-red-500' : 'bg-muted-foreground/20'} ${isLocked ? 'opacity-60' : ''}`}>
                <Checkbox
                  id="urgent-all-vanzator"
                  checked={urgentAllServices}
                  onCheckedChange={isLocked ? undefined : onUrgentChange}
                  disabled={isLocked}
                  className="sr-only"
                />
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${urgentAllServices ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className={`text-sm font-medium transition-colors ${urgentAllServices ? 'text-red-600' : 'text-muted-foreground group-hover:text-foreground'}`}>
                Urgent
              </span>
              {urgentAllServices && (
                <span className="text-[10px] font-medium text-red-500 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded">
                  +30%
                </span>
              )}
            </label>
            
            <div className="h-5 w-px bg-border/60" />
            
            <div className="flex items-center gap-2">
              <Label htmlFor="subscription-vanzator" className="text-sm font-medium text-muted-foreground">Abonament</Label>
              <select
                id="subscription-vanzator"
                className={`h-8 text-sm rounded-lg border border-border/60 px-3 bg-white dark:bg-background transition-colors ${isLocked ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/40 cursor-pointer'}`}
                value={subscriptionType}
                onChange={e => !isLocked && onSubscriptionChange(e.target.value as 'services' | 'parts' | 'both' | '')}
                disabled={isLocked}
              >
                <option value="">Fără abonament</option>
                <option value="services">Servicii</option>
                <option value="parts">Piese</option>
                <option value="both">Ambele</option>
              </select>
            </div>
            
            {/* Butoane livrare - FUNCȚIONALE pentru toți utilizatorii în VanzariView */}
            <Button
              type="button"
              variant={officeDirect ? "default" : "outline"}
              size="sm"
              disabled={isLocked || !canSelectDelivery || loading || saving || curierTrimis}
              onClick={async () => {
                if (isLocked || !canSelectDelivery) {
                  return
                }
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
              disabled={isLocked || !canSelectDelivery || loading || saving || officeDirect}
              onClick={() => {
                if (isLocked || !canSelectDelivery) {
                  return
                }
                if (curierTrimis) {
                  // Dacă este deja activat, dezactivează-l
                  if (onCurierTrimisChange) {
                    onCurierTrimisChange(false)
                  }
                } else {
                  // Dacă nu este activat, deschide dialog-ul pentru selectarea datei și orei
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

            {/* [OWNER-ONLY] Status Comandă – în bara de acțiuni, mereu vizibil */}
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
            
            {/* Dialog pentru selectarea datei și orei pentru Curier Trimis */}
            <Dialog 
              open={showCurierTrimisDialog} 
              onOpenChange={(open) => {
                setShowCurierTrimisDialog(open)
                if (!open) {
                  // Resetează la valori implicite când se închide dialog-ul
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
                      
                      // Combină data și ora
                      const dateTime = new Date(selectedDate)
                      const [hours, minutes] = selectedTime.split(':')
                      dateTime.setHours(parseInt(hours, 10))
                      dateTime.setMinutes(parseInt(minutes, 10))
                      
                      const dateTimeString = dateTime.toISOString()
                      
                      // Activează checkbox-ul și salvează data/ora
                      if (onCurierTrimisChange) {
                        await onCurierTrimisChange(true, dateTimeString)
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
      )}

     
      
        {canViewTrayImages && selectedQuoteId && !isLocked && (
        <TrayImagesSection
          trayImages={trayImages}
          uploadingImage={uploadingImage}
          isImagesExpanded={isImagesExpanded}
          canAddTrayImages={canAddTrayImages && !isLocked}
          canViewTrayImages={canViewTrayImages}
          selectedQuoteId={selectedQuoteId}
          onToggleExpanded={onToggleImagesExpanded || (() => {})}
          onImageUpload={isLocked ? (() => {}) : (event) => {
            const file = event.target.files?.[0]
            if (file && onImageUpload) {
              onImageUpload(file)
            }
          }}
          onDownloadAll={onDownloadAllImages || (() => {})}
          onImageDelete={isLocked ? (() => {}) : (onImageDelete || (() => {}))}
        />
      )}
      {/* Versiune mobilă sau desktop */}
      {isMobile && !isLocked ? (
        <>
          {/* MobileItemsView pentru mobil */}
          <MobileItemsView
            items={items}
            services={services}
            instruments={instruments.map(i => ({ id: i.id, name: i.name, repairable: i.repairable !== false }))}
            technicians={technicians}
            canChangeTechnician={isAdmin}
            pipelinesWithIds={[]}
            isReceptiePipeline={isReceptiePipeline ?? false}
            isDepartmentPipeline={isDepartmentPipeline}
            isReparatiiPipeline={false}
            canAddParts={false}
            canEditUrgentAndSubscription={canEditUrgentAndSubscription !== false}
            selectedInstrument={mobileInstrumentForm.instrument}
            instrumentForm={mobileInstrumentForm}
            onUpdateItem={onUpdateItem}
            onDelete={onDelete}
            onAddService={(service, qty) => {
              onServiceSelect(service.id, service.name)
              onSvcQtyChange(String(qty))
              onAddService()
            }}
            onInstrumentChange={(inst) => {
              if (inst) {
                onInstrumentChange(inst.id)
              } else {
                onInstrumentChange('')
              }
            }}
            onInstrumentDoubleClick={(inst) => {
              onInstrumentDoubleClick?.(inst.id)
            }}
            onQtyChange={(qty) => onQtyChange(String(qty))}
            onClearForm={onClearForm}
          />
        </>
      ) : (
        <>
          {/* Formulare de editare - ASCUNSE când fișa este locked */}
          {!isLocked && (
            <>
              {/* Add Instrument - disponibil pentru TOATE pipeline-urile */}
              {(true) && (
                <AddInstrumentForm
                  instrumentForm={instrumentForm as any}
                  availableInstruments={availableInstruments}
                  instruments={instruments.map(i => ({ id: i.id, name: i.name, department_id: i.department_id ?? null, pipeline: (i as any).pipeline ?? null }))}
                  departments={departments}
                  instrumentSettings={instrumentSettings}
                  hasServicesOrInstrumentInSheet={hasServicesOrInstrumentInSheet}
                  isVanzariPipeline={true}
                  isDepartmentPipeline={isDepartmentPipeline}
                  isTechnician={isTechnician}
                  onInstrumentChange={onInstrumentChange}
                  onInstrumentDoubleClick={onInstrumentDoubleClick}
                  onQtyChange={onQtyChange}
                  setIsDirty={setIsDirty}
                  onAddInstrumentDirect={onAddInstrumentDirect}
                  onClearForm={onClearForm}
/* -------------------------------------------------- COD PENTRU POPULARE CASETE ----------------------------------------------------- */
                  onUndo={onUndo}
                  previousFormState={previousFormState}
/* ----------------------------------------------------------------------------------------------------------------------------------- */
                />
              )}
              
              {/* Add Service */}
              <AddServiceForm
                svc={svc}
                serviceSearchQuery={serviceSearchQuery}
                serviceSearchFocused={serviceSearchFocused}
                currentInstrumentId={currentInstrumentId}
                availableServices={availableServices}
                instrumentForm={instrumentForm as any}
                isVanzariPipeline={true}
                canEditUrgentAndSubscription={canEditUrgentAndSubscription !== false}
                isAdmin={isAdmin}
                technicians={technicians}
                onTechnicianChange={onTechnicianChange}
                onServiceSearchChange={onServiceSearchChange}
                onServiceSearchFocus={onServiceSearchFocus}
                onServiceSearchBlur={onServiceSearchBlur}
                onServiceSelect={onServiceSelect}
                onServiceDoubleClick={onServiceDoubleClick}
                onQtyChange={onSvcQtyChange}
                onDiscountChange={onSvcDiscountChange}
                onAddService={onAddService}
              />
            </>
          )}
          
          {/* Instrumente nereparabile / nu s-au supus reparației / defectate */}
          <InstrumenteReparatieDefectSection
            items={items}
            instruments={instruments}
            services={services}
          />

          {/* Items Table — scroll orizontal pe mobile, afișare curată */}
          <div className="p-0 mx-2 sm:mx-4 overflow-x-auto overscroll-contain border border-slate-200 dark:border-slate-700 rounded-xl bg-card shadow-sm">
        <Table className="text-sm min-w-[600px]">
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Instrument</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Serviciu</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center w-14">Cant.</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right">Preț</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center">Disc%</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right tabular-nums">Total</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Include items cu item_type null dacă au instrument_id (instrument fără serviciu) */}
            {items.filter(it => it.item_type !== null || it.instrument_id).map((it, index, filteredItems) => {
              // Verifică dacă acest item este primul pentru instrumentul său (pentru butonul de mutare)
              const currentInstrumentId = it.instrument_id || (it.item_type === 'service' && it.service_id 
                ? availableServices.find(s => s.id === it.service_id)?.instrument_id 
                : null)
              
              const isFirstItemOfInstrument = currentInstrumentId && filteredItems.findIndex(item => {
                const itemInstrId = item.instrument_id || (item.item_type === 'service' && item.service_id
                  ? availableServices.find(s => s.id === item.service_id)?.instrument_id
                  : null)
                return itemInstrId === currentInstrumentId
              }) === index
              
              // Construiește grupul de instrumente pentru mutare
              const buildInstrumentGroupForMove = () => {
                if (!currentInstrumentId) return null
                const instrument = instruments.find(i => i.id === currentInstrumentId)
                const instrumentItems = filteredItems.filter(item => {
                  const itemInstrId = item.instrument_id || (item.item_type === 'service' && item.service_id
                    ? availableServices.find(s => s.id === item.service_id)?.instrument_id
                    : null)
                  return itemInstrId === currentInstrumentId
                })
                return {
                  instrument: { id: currentInstrumentId, name: instrument?.name || 'Instrument' },
                  items: instrumentItems
                }
              }
              const disc = Math.min(100, Math.max(0, it.discount_pct || 0));
              const base = (it.qty || 0) * (it.price || 0);
              const afterDisc = base * (1 - disc / 100);
              const lineTotal = it.urgent ? afterDisc * (1 + URGENT_MARKUP_PCT / 100) : afterDisc;
              
              // Obține numele instrumentului
              const instrumentName = it.instrument_id 
                ? instruments.find(i => i.id === it.instrument_id)?.name || '—'
                : '—'
              
              return (
                <TableRow 
                  key={it.id} 
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 last:border-0"
                >
                  <TableCell className="text-xs text-slate-700 dark:text-slate-300 py-2.5">
                    <span className="font-medium">{instrumentName}</span>
                  </TableCell>
                  <TableCell className="font-medium text-sm py-2">
                    {it.name_snapshot}
                  </TableCell>
                  <TableCell className="py-2">
                    {isLocked ? (
                      <span className="text-sm text-center">{it.qty}</span>
                    ) : (
                      <Input
                        className="h-7 text-sm text-center w-14"
                        inputMode="numeric"
                        value={String(it.qty)}
                        onChange={e => {
                          const v = Math.max(1, Number(e.target.value || 1));
                          onUpdateItem(it.id, { qty: v });
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm py-2">
                    {it.price.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-2">
                    {isLocked ? (
                      <span className="text-sm text-center">{it.discount_pct || 0}%</span>
                    ) : (
                      <Input
                        className="h-7 text-sm text-center w-12"
                        inputMode="decimal"
                        value={String(it.discount_pct)}
                        onChange={e => {
                          const v = Math.min(100, Math.max(0, Number(e.target.value || 0)));
                          onUpdateItem(it.id, { discount_pct: v });
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium text-sm py-2">{lineTotal?.toFixed(2) || '0.00'}                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1 justify-end">
                      {/* Buton editare */}
                      {!isLocked && onRowClick && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20" 
                          onClick={(e) => {
                            e.stopPropagation()
                            onRowClick(it)
                          }}
                          title="Editează înregistrarea"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {/* Buton mutare instrument - afișat pentru primul item al fiecărui instrument */}
                      {!isLocked && isFirstItemOfInstrument && onMoveInstrument && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30" 
                          onClick={(e) => {
                            e.stopPropagation()
                            const group = buildInstrumentGroupForMove()
                            if (group) {
                              onMoveInstrument(group)
                            }
                          }}
                          title={`Mută instrumentul în altă tăviță`}
                        >
                          <Move className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {/* Buton ștergere */}
                      {!isLocked && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" 
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(it.id)
                          }}
                          title="Șterge înregistrarea"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-center py-6 text-sm">
                  Nu există poziții încă.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
        </>
      )}
      
      {/* Totals - stilizat ca în Recepție și Department */}
      <TotalsSection
        items={items}
        subscriptionType={subscriptionType}
        services={services}
        instruments={instruments.map(i => ({ id: i.id, weight: i.weight || 0 }))}
        globalDiscountPct={globalDiscountPct}
        onGlobalDiscountChange={onGlobalDiscountChange}
        canEditDiscount={canEditUrgentAndSubscription}
      />
      
      
      
    </div>
  )
}

