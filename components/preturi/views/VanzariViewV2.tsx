'use client'

/**
 * VanzariViewV2 - Versiune îmbunătățită a interfeței pentru pipeline-ul Vânzări
 * 
 * Îmbunătățiri principale:
 * 1. Panou unitar "Rezultat Apel" cu 4 butoane clare (Nu răspunde, Callback, No Deal, Comandă)
 * 2. Popover-uri intuitive pentru fiecare acțiune
 * 3. Radio buttons pentru Office Direct / Curier (mutual exclusive)
 * 4. Banner vizual pentru urgență
 * 5. UX simplificat pentru flux de apelare
 */

import { useEffect, useState } from 'react'
import { AddInstrumentForm } from '../forms/AddInstrumentForm'
import { AddServiceForm } from '../forms/AddServiceForm'
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
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { 
  Loader2, Trash2, Move, CalendarIcon, Clock, Pencil, Package, FileCheck,
  Phone, PhoneOff, PhoneMissed, Ban, ShoppingCart, AlertTriangle, Check,
  Building2, Truck, Zap, ChevronRight
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { format, addDays, addWeeks, addMonths } from 'date-fns'
import { ro } from 'date-fns/locale'
import { useIsMobile } from '@/hooks/use-mobile'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import type { LeadQuoteItem, LeadQuote } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Lead } from '@/app/(crm)/dashboard/page'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface VanzariViewV2Props {
  // State
  instrumentForm: { 
    instrument: string
    qty: string
    brandSerialGroups?: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }> | string[]; qty?: string }>
  }
  svc: { 
    id: string
    qty: string
    discount: string
    instrumentId: string
    selectedBrands?: string[]
    serialNumberId?: string
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
  isServiceFileLocked?: boolean
  serviceFileStatus?: string | null
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
  stages?: string[]
  currentStage?: string | null
  callbackDate?: string | null
  
  // Callbacks pentru rezultat apel
  onApelat?: (callbackDate: string, targetStage: string) => Promise<void>
  onRevenireLaLeaduri?: () => Promise<void>
  onMoveToStage?: (stageName: string) => Promise<void>
  onCreateServiceFile?: () => Promise<void>
  
  // Callbacks existente
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
  onBrandToggle?: (brandName: string, checked: boolean) => void
  onSerialNumberChange?: (serialNumberId: string) => void
  onAddBrandSerialGroup?: () => void
  onRemoveBrandSerialGroup?: (groupIndex: number) => void
  onUpdateBrand?: (groupIndex: number, value: string) => void
  onUpdateBrandQty?: (groupIndex: number, qty: string) => void
  onUpdateSerialNumber?: (groupIndex: number, serialIndex: number, value: string) => void
  onAddSerialNumber?: (groupIndex: number) => void
  onRemoveSerialNumber?: (groupIndex: number, serialIndex: number) => void
  onUpdateSerialGarantie?: (groupIndex: number, serialIndex: number, garantie: boolean) => void
  setIsDirty?: (dirty: boolean) => void
  
  // Flags pentru permisiuni
  isVanzariPipeline?: boolean
  isReceptiePipeline?: boolean
  isOwner?: boolean
  isAdmin?: boolean
  isVanzator?: boolean
  
  // Tehnician assignment
  technicians?: Array<{ id: string; name: string }>
  onTechnicianChange?: (technicianId: string) => void
  
  onSetStatusComanda?: () => Promise<void>
  onAddInstrumentDirect?: (instrumentId: string, qty: number, brand?: string, brandSerialGroups?: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }>; qty: string }>) => void
  onRowClick?: (item: LeadQuoteItem) => void
  onClearForm?: () => void
  onUndo?: () => void
  previousFormState?: any
  
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

// ============================================================================
// CALLBACK OPTIONS
// ============================================================================

type CallbackOptionValue = 'tomorrow' | '3days' | 'week' | 'month' | '3months' | 'custom'

const CALLBACK_OPTIONS = [
  { label: 'Mâine', value: 'tomorrow' as CallbackOptionValue, getDate: () => addDays(new Date(), 1) },
  { label: '3 zile', value: '3days' as CallbackOptionValue, getDate: () => addDays(new Date(), 3) },
  { label: 'Săptămână', value: 'week' as CallbackOptionValue, getDate: () => addWeeks(new Date(), 1) },
  { label: 'Lună', value: 'month' as CallbackOptionValue, getDate: () => addMonths(new Date(), 1) },
  { label: '3 luni', value: '3months' as CallbackOptionValue, getDate: () => addMonths(new Date(), 3) },
]

const NO_DEAL_REASONS = [
  { value: 'pret', label: 'Preț prea mare' },
  { value: 'nu_are_nevoie', label: 'Nu are nevoie' },
  { value: 'concurenta', label: 'A ales concurența' },
  { value: 'amana', label: 'Amână decizia' },
  { value: 'altele', label: 'Altele' },
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normStage(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function findStage(stages: string[], patterns: string[]): string | undefined {
  return stages.find(stage => {
    const norm = normStage(stage)
    return patterns.some(p => norm.includes(p))
  })
}

function renderServiceSerialNumbers(
  item: LeadQuoteItem,
  brandGroups: Array<{ id?: string; brand: string; serialNumbers: string[]; garantie?: boolean }>
): React.ReactNode[] {
  if (!brandGroups || brandGroups.length === 0) return []

  return brandGroups.flatMap((bg: any, bgIdx: number) => {
    if (!bg || typeof bg !== 'object') return []
    const bgBrand = bg.brand || '—'
    const bgSerials = Array.isArray(bg.serialNumbers) ? bg.serialNumbers : []
    
    return bgSerials.map((sn: any, snIdx: number) => {
      const serial = typeof sn === 'string' ? sn : (sn?.serial || '')
      const displaySerial = serial && serial.trim() ? serial.trim() : `Serial ${snIdx + 1}`
      
      return (
        <div 
          key={`${item.id}-${bgIdx}-${snIdx}`}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border",
            serial && serial.trim()
              ? "bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              : "bg-slate-100/50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-500 border-slate-300 dark:border-slate-600"
          )}
        >
          <span className="font-semibold text-[11px]">{bgBrand}</span>
          <span className="text-slate-400 dark:text-slate-500">—</span>
          <span className="truncate">{displaySerial}</span>
        </div>
      )
    })
  })
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VanzariViewV2(props: VanzariViewV2Props) {
  const {
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
    stages = [],
    currentStage,
    callbackDate,
    onApelat,
    onRevenireLaLeaduri,
    onMoveToStage,
    onCreateServiceFile,
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
    onBrandToggle,
    onSerialNumberChange,
    onAddBrandSerialGroup,
    onRemoveBrandSerialGroup,
    onUpdateBrand,
    onUpdateBrandQty,
    onUpdateSerialNumber,
    onAddSerialNumber,
    onRemoveSerialNumber,
    onUpdateSerialGarantie,
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
    isVanzariPipeline = true,
    isReceptiePipeline = false,
    isOwner = false,
    isAdmin = false,
    isVanzator = true,
    technicians = [],
    onTechnicianChange,
    onSetStatusComanda,
    onAddInstrumentDirect,
    onRowClick,
    onClearForm,
    onUndo,
    previousFormState,
  } = props

  // ============================================================================
  // STATE
  // ============================================================================
  
  const [activeResultPanel, setActiveResultPanel] = useState<'nu_raspunde' | 'callback' | 'no_deal' | 'comanda' | null>(null)
  
  // Nu răspunde state
  const [nuRaspundeHour, setNuRaspundeHour] = useState('10')
  const [nuRaspundeMinute, setNuRaspundeMinute] = useState('00')
  
  // Callback state
  const [callbackOption, setCallbackOption] = useState<CallbackOptionValue>('tomorrow')
  const [callbackDate_, setCallbackDate_] = useState<Date | undefined>(undefined)
  const [callbackHour, setCallbackHour] = useState('10')
  const [callbackMinute, setCallbackMinute] = useState('00')
  const [calendarOpen, setCalendarOpen] = useState(false)
  
  // No Deal state
  const [noDealReason, setNoDealReason] = useState('')
  const [noDealNotes, setNoDealNotes] = useState('')
  const [showNoDealConfirm, setShowNoDealConfirm] = useState(false)
  
  // Comandă wizard state
  const [comandaStep, setComandaStep] = useState(1)
  const [deliveryType, setDeliveryType] = useState<'office' | 'curier'>('office')
  const [curierDate, setCurierDate] = useState<Date | undefined>(undefined)
  const [curierTime, setCurierTime] = useState('10:00')
  const [showComandaWizard, setShowComandaWizard] = useState(false)
  
  // Dialog Curier Trimis
  const [showCurierTrimisDialog, setShowCurierTrimisDialog] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedTime, setSelectedTime] = useState<string>('08:00')
  const [statusComandaLoading, setStatusComandaLoading] = useState(false)
  
  const isMobile = useIsMobile()
  const hours = Array.from({ length: 11 }, (_, i) => String(i + 8).padStart(2, '0'))
  const minutes = ['00', '15', '30', '45']
  
  // ============================================================================
  // COMPUTED
  // ============================================================================
  
  const isLocked = Boolean(isServiceFileLocked) && !isReceptiePipeline && !isDepartmentPipeline
  const canSelectDelivery = !!(fisaId && selectedQuoteId) && !isLocked
  
  const s = normStage(currentStage || '')
  const isInCallback = /callback|call_back|call-back/.test(s)
  const isInNuRaspunde = s.includes('nu') && s.includes('raspunde')
  const isInNoDeal = s.includes('no') && s.includes('deal')
  
  const callbackStage = findStage(stages, ['callback', 'call back', 'call-back'])
  const nuRaspundeStage = findStage(stages, ['nu raspunde', 'nuraspunde'])
  const noDealStage = findStage(stages, ['no deal', 'nodeal'])
  const comandaStage = findStage(stages, ['avem comanda', 'comanda', 'comenzi'])
  const leaduriStage = findStage(stages, ['leads', 'lead', 'leaduri'])
  
  // Transformă instrumentForm pentru mobile
  const currentInstrument = instrumentForm.instrument 
    ? instruments.find(i => i.id === instrumentForm.instrument)
    : null
  
  const mobileInstrumentForm = {
    instrument: currentInstrument ? { id: currentInstrument.id, name: currentInstrument.name } : null,
    qty: parseInt(instrumentForm.qty) || 1,
    brandSerialGroups: (instrumentForm.brandSerialGroups || []).map((g, idx) => ({
      id: `group-${idx}`,
      brand: g.brand || '',
      qty: parseInt(g.qty || '1') || 1,
      serialNumbers: (Array.isArray(g.serialNumbers) ? g.serialNumbers : []).map((s: any, sIdx: number) => ({
        id: `serial-${idx}-${sIdx}`,
        serial: typeof s === 'string' ? s : s?.serial || '',
        garantie: typeof s === 'object' ? s?.garantie || false : false,
      })),
    })),
  }

  // ============================================================================
  // HANDLERS
  // ============================================================================
  
  const handleNuRaspundeConfirm = async () => {
    const today = new Date()
    today.setHours(parseInt(nuRaspundeHour, 10), parseInt(nuRaspundeMinute, 10), 0, 0)
    onNuRaspundeChange?.(true, today.toISOString())
    setActiveResultPanel(null)
    toast.success(`Reapelare programată la ${nuRaspundeHour}:${nuRaspundeMinute}`)
  }
  
  const handleCallbackConfirm = async () => {
    if (!callbackStage || !onApelat) {
      toast.error('Stage-ul Callback nu există în acest pipeline')
      return
    }
    
    let date: Date
    if (callbackOption === 'custom') {
      if (!callbackDate_) {
        toast.error('Selectează o dată')
        return
      }
      date = callbackDate_
    } else {
      const opt = CALLBACK_OPTIONS.find(o => o.value === callbackOption)
      date = opt ? opt.getDate() : addDays(new Date(), 1)
    }
    
    date.setHours(parseInt(callbackHour, 10), parseInt(callbackMinute, 10), 0, 0)
    
    try {
      await onApelat(date.toISOString(), callbackStage)
      toast.success(`Callback programat: ${format(date, 'dd MMM yyyy HH:mm', { locale: ro })}`)
      setActiveResultPanel(null)
    } catch (error) {
      toast.error('Eroare la setarea callback-ului')
    }
  }
  
  const handleNoDealConfirm = async () => {
    onNoDealChange?.(true)
    setShowNoDealConfirm(false)
    setActiveResultPanel(null)
    toast.success('Lead marcat ca No Deal')
  }
  
  const handleComandaFinish = async () => {
    if (deliveryType === 'office') {
      await onOfficeDirectChange(true)
    } else if (onCurierTrimisChange && curierDate) {
      const dateTime = new Date(curierDate)
      const [h, m] = curierTime.split(':')
      dateTime.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
      await onCurierTrimisChange(true, dateTime.toISOString())
    }
    
    setShowComandaWizard(false)
    setComandaStep(1)
    toast.success('Comandă înregistrată cu succes!')
  }
  
  const handleRevenireLaLeaduri = async () => {
    if (!onRevenireLaLeaduri) return
    try {
      await onRevenireLaLeaduri()
      toast.success('Lead revenit în Leaduri')
    } catch {
      toast.error('Eroare la revenirea lead-ului')
    }
  }

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================
  
  const renderApelResultPanel = () => {
    if (!isVanzariPipeline) return null
    
    // Dacă lead-ul este deja într-un stage special, afișăm status + opțiune de revenire
    if (isInCallback || isInNuRaspunde || isInNoDeal) {
      return (
        <Card className="mx-2 sm:mx-4 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {isInCallback && (
                  <>
                    <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                      <Clock className="h-3.5 w-3.5 mr-1.5" />
                      În Callback
                    </Badge>
                    {callbackDate && (
                      <span className="text-sm text-blue-600">
                        Programat: {format(new Date(callbackDate), 'dd MMM yyyy HH:mm', { locale: ro })}
                      </span>
                    )}
                  </>
                )}
                {isInNuRaspunde && (
                  <>
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                      <PhoneMissed className="h-3.5 w-3.5 mr-1.5" />
                      Nu răspunde
                    </Badge>
                    {nuRaspundeCallbackAt && (
                      <span className="text-sm text-amber-600">
                        Reapelare: {format(new Date(nuRaspundeCallbackAt), 'HH:mm', { locale: ro })}
                      </span>
                    )}
                  </>
                )}
                {isInNoDeal && (
                  <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">
                    <Ban className="h-3.5 w-3.5 mr-1.5" />
                    No Deal
                  </Badge>
                )}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevenireLaLeaduri}
                disabled={loading}
                className="gap-2"
              >
                <Phone className="h-4 w-4" />
                Revino la Leaduri
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }
    
    // Panel principal pentru rezultat apel
    return (
      <Card className="mx-2 sm:mx-4 border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Rezultat Apel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Butoanele principale */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Nu răspunde */}
            <Popover open={activeResultPanel === 'nu_raspunde'} onOpenChange={(open) => setActiveResultPanel(open ? 'nu_raspunde' : null)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-auto py-4 flex flex-col items-center gap-2 border-2 transition-all",
                    activeResultPanel === 'nu_raspunde' 
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" 
                      : "border-amber-200 hover:border-amber-400 hover:bg-amber-50/50"
                  )}
                >
                  <PhoneMissed className="h-6 w-6 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700">Nu răspunde</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <PhoneMissed className="h-5 w-5 text-amber-600" />
                    <h4 className="font-semibold">Când reapelez?</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Selectează ora pentru astăzi ({format(new Date(), 'dd MMMM', { locale: ro })})
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Ora</Label>
                      <Select value={nuRaspundeHour} onValueChange={setNuRaspundeHour}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {hours.map(h => <SelectItem key={h} value={h}>{h}:00</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Minute</Label>
                      <Select value={nuRaspundeMinute} onValueChange={setNuRaspundeMinute}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {minutes.map(m => <SelectItem key={m} value={m}>:{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-center">
                    <p className="text-sm font-medium text-amber-700">
                      <Clock className="inline h-4 w-4 mr-1" />
                      Reapelare la {nuRaspundeHour}:{nuRaspundeMinute}
                    </p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setActiveResultPanel(null)}>
                      Anulează
                    </Button>
                    <Button className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={handleNuRaspundeConfirm}>
                      Setează
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            {/* Callback */}
            <Popover open={activeResultPanel === 'callback'} onOpenChange={(open) => setActiveResultPanel(open ? 'callback' : null)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-auto py-4 flex flex-col items-center gap-2 border-2 transition-all",
                    activeResultPanel === 'callback' 
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" 
                      : "border-blue-200 hover:border-blue-400 hover:bg-blue-50/50"
                  )}
                >
                  <CalendarIcon className="h-6 w-6 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700">Callback</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96" align="start">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <CalendarIcon className="h-5 w-5 text-blue-600" />
                    <h4 className="font-semibold">Când contactăm?</h4>
                  </div>
                  
                  {/* Opțiuni rapide */}
                  <div className="flex flex-wrap gap-2">
                    {CALLBACK_OPTIONS.map(opt => (
                      <Button
                        key={opt.value}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCallbackOption(opt.value)
                          if (opt.value !== 'custom') setCallbackDate_(undefined)
                        }}
                        className={cn(
                          "text-xs",
                          callbackOption === opt.value && "bg-blue-100 border-blue-400 text-blue-700"
                        )}
                      >
                        {opt.label}
                      </Button>
                    ))}
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCallbackOption('custom')}
                          className={cn(
                            "text-xs",
                            callbackOption === 'custom' && "bg-blue-100 border-blue-400 text-blue-700"
                          )}
                        >
                          📅 Altă dată
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={callbackDate_}
                          onSelect={(date) => {
                            setCallbackDate_(date)
                            setCalendarOpen(false)
                          }}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          locale={ro}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  {/* Data selectată */}
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
                    <p className="text-sm text-blue-700">
                      <strong>Data:</strong>{' '}
                      {callbackOption === 'custom' && callbackDate_
                        ? format(callbackDate_, 'EEEE, dd MMMM yyyy', { locale: ro })
                        : CALLBACK_OPTIONS.find(o => o.value === callbackOption)
                          ? format(CALLBACK_OPTIONS.find(o => o.value === callbackOption)!.getDate(), 'EEEE, dd MMMM yyyy', { locale: ro })
                          : '—'
                      }
                    </p>
                  </div>
                  
                  {/* Selector oră */}
                  <div className="flex items-center gap-3">
                    <Label className="text-sm text-muted-foreground whitespace-nowrap">Ora:</Label>
                    <Select value={callbackHour} onValueChange={setCallbackHour}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {hours.map(h => <SelectItem key={h} value={h}>{h}:00</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span>:</span>
                    <Select value={callbackMinute} onValueChange={setCallbackMinute}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {minutes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setActiveResultPanel(null)}>
                      Anulează
                    </Button>
                    <Button 
                      className="flex-1 bg-blue-500 hover:bg-blue-600" 
                      onClick={handleCallbackConfirm}
                      disabled={callbackOption === 'custom' && !callbackDate_}
                    >
                      Confirmă Callback
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            {/* No Deal */}
            <Popover open={activeResultPanel === 'no_deal'} onOpenChange={(open) => setActiveResultPanel(open ? 'no_deal' : null)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-auto py-4 flex flex-col items-center gap-2 border-2 transition-all",
                    activeResultPanel === 'no_deal' 
                      ? "border-red-500 bg-red-50 dark:bg-red-950/30" 
                      : "border-red-200 hover:border-red-400 hover:bg-red-50/50"
                  )}
                >
                  <Ban className="h-6 w-6 text-red-600" />
                  <span className="text-sm font-medium text-red-700">No Deal</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <Ban className="h-5 w-5 text-red-600" />
                    <h4 className="font-semibold">Marchează ca No Deal</h4>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm">Motiv (opțional)</Label>
                    <Select value={noDealReason} onValueChange={setNoDealReason}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectează motivul..." />
                      </SelectTrigger>
                      <SelectContent>
                        {NO_DEAL_REASONS.map(r => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                    <p className="text-xs text-red-600">
                      <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
                      Lead-ul va fi mutat în stage-ul "No Deal"
                    </p>
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setActiveResultPanel(null)}>
                      Anulează
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="flex-1" 
                      onClick={handleNoDealConfirm}
                    >
                      Confirmă No Deal
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            {/* Comandă */}
            <Button
              variant="outline"
              onClick={() => setShowComandaWizard(true)}
              className={cn(
                "h-auto py-4 flex flex-col items-center gap-2 border-2 transition-all",
                "border-green-200 hover:border-green-400 hover:bg-green-50/50"
              )}
            >
              <ShoppingCart className="h-6 w-6 text-green-600" />
              <span className="text-sm font-medium text-green-700">Comandă</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-4 border rounded-xl bg-card shadow-sm overflow-visible">
      {/* Header */}
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

      {/* Panou Rezultat Apel */}
      {renderApelResultPanel()}

      {/* Tray Tabs */}
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

      {/* Banner Urgență */}
      {urgentAllServices && (
        <div className="mx-2 sm:mx-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-red-600 animate-pulse" />
            <div>
              <p className="font-semibold text-red-700 dark:text-red-400">COMANDĂ URGENTĂ</p>
              <p className="text-sm text-red-600 dark:text-red-500">Se aplică un markup de +{URGENT_MARKUP_PCT}% la toate serviciile</p>
            </div>
          </div>
        </div>
      )}

      {/* Opțiuni fișă: Urgent, Abonament, Livrare */}
      {!isLocked && (
        <div className="mx-2 sm:mx-4 px-3 py-3 rounded-lg border bg-muted/30">
          <div className="flex flex-wrap items-center gap-4">
            {/* Toggle Urgent */}
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${urgentAllServices ? 'bg-red-500' : 'bg-muted-foreground/20'}`}>
                <Checkbox
                  id="urgent-v2"
                  checked={urgentAllServices}
                  onCheckedChange={onUrgentChange}
                  className="sr-only"
                />
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${urgentAllServices ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className={`text-sm font-medium transition-colors ${urgentAllServices ? 'text-red-600' : 'text-muted-foreground group-hover:text-foreground'}`}>
                Urgent
              </span>
            </label>
            
            <div className="h-5 w-px bg-border/60" />
            
            {/* Abonament */}
            <div className="flex items-center gap-2">
              <Label htmlFor="subscription-v2" className="text-sm font-medium text-muted-foreground">Abonament</Label>
              <select
                id="subscription-v2"
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
            
            <div className="h-5 w-px bg-border/60" />
            
            {/* Livrare - Radio Buttons */}
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium text-muted-foreground">Livrare:</Label>
              <RadioGroup 
                value={officeDirect ? 'office' : curierTrimis ? 'curier' : ''} 
                onValueChange={async (val) => {
                  if (!canSelectDelivery) return
                  if (val === 'office') {
                    if (curierTrimis && onCurierTrimisChange) await onCurierTrimisChange(false)
                    await onOfficeDirectChange(true)
                  } else if (val === 'curier') {
                    if (officeDirect) await onOfficeDirectChange(false)
                    setShowCurierTrimisDialog(true)
                  }
                }}
                className="flex items-center gap-3"
                disabled={!canSelectDelivery || loading || saving}
              >
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="office" id="office-v2" />
                  <Label htmlFor="office-v2" className="text-sm cursor-pointer flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    Office Direct
                  </Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="curier" id="curier-v2" />
                  <Label htmlFor="curier-v2" className="text-sm cursor-pointer flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5" />
                    Curier Trimis
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            {/* Buton Retur */}
            <Button
              type="button"
              variant={retur ? "default" : "outline"}
              size="sm"
              onClick={async () => {
                if (onReturChange) await onReturChange(!retur)
              }}
              className={cn(
                "h-8 px-3 text-sm font-medium transition-colors gap-1.5",
                retur 
                  ? "bg-orange-500 hover:bg-orange-600 text-white border-orange-500" 
                  : "border-orange-300 text-orange-600 hover:bg-orange-50 hover:border-orange-400"
              )}
            >
              <Package className="h-3.5 w-3.5" />
              Retur
            </Button>
          </div>
        </div>
      )}

      {/* Tray Images */}
      {canViewTrayImages && selectedQuoteId && !isLocked && (
        <TrayImagesSection
          trayImages={trayImages}
          uploadingImage={uploadingImage}
          isImagesExpanded={isImagesExpanded}
          canAddTrayImages={canAddTrayImages && !isLocked}
          canViewTrayImages={canViewTrayImages}
          selectedQuoteId={selectedQuoteId}
          onToggleExpanded={onToggleImagesExpanded || (() => {})}
          onImageUpload={(event) => {
            const file = event.target.files?.[0]
            if (file && onImageUpload) onImageUpload(file)
          }}
          onDownloadAll={onDownloadAllImages || (() => {})}
          onImageDelete={onImageDelete || (() => {})}
        />
      )}

      {/* Mobile sau Desktop View */}
      {isMobile && !isLocked ? (
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
          onInstrumentChange={(inst) => onInstrumentChange(inst ? inst.id : '')}
          onInstrumentDoubleClick={(inst) => onInstrumentDoubleClick?.(inst.id)}
          onQtyChange={(qty) => onQtyChange(String(qty))}
          onAddBrandSerialGroup={onAddBrandSerialGroup}
          onRemoveBrandSerialGroup={(groupId) => {
            const idx = parseInt(groupId.replace('group-', ''))
            onRemoveBrandSerialGroup?.(idx)
          }}
          onUpdateBrand={(groupId, brand) => {
            const idx = parseInt(groupId.replace('group-', ''))
            onUpdateBrand?.(idx, brand)
          }}
          onUpdateBrandQty={(groupId, qty) => {
            const idx = parseInt(groupId.replace('group-', ''))
            onUpdateBrandQty?.(idx, String(qty))
          }}
          onAddSerialNumber={(groupId) => {
            const idx = parseInt(groupId.replace('group-', ''))
            onAddSerialNumber?.(idx)
          }}
          onRemoveSerialNumber={(groupId, serialId) => {
            const groupIdx = parseInt(groupId.replace('group-', ''))
            const serialIdx = parseInt(serialId.split('-')[2] || '0')
            onRemoveSerialNumber?.(groupIdx, serialIdx)
          }}
          onUpdateSerialNumber={(groupId, serialId, serial) => {
            const groupIdx = parseInt(groupId.replace('group-', ''))
            const serialIdx = parseInt(serialId.split('-')[2] || '0')
            onUpdateSerialNumber?.(groupIdx, serialIdx, serial)
          }}
          onUpdateSerialGarantie={(groupId, serialId, garantie) => {
            const groupIdx = parseInt(groupId.replace('group-', ''))
            const serialIdx = parseInt(serialId.split('-')[2] || '0')
            onUpdateSerialGarantie?.(groupIdx, serialIdx, garantie)
          }}
          onClearForm={onClearForm}
        />
      ) : (
        <>
          {/* Formulare de editare */}
          {!isLocked && (
            <>
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
                onAddBrandSerialGroup={onAddBrandSerialGroup}
                onRemoveBrandSerialGroup={onRemoveBrandSerialGroup}
                onUpdateBrand={onUpdateBrand}
                onUpdateBrandQty={onUpdateBrandQty}
                onUpdateSerialNumber={onUpdateSerialNumber}
                onAddSerialNumber={onAddSerialNumber}
                onRemoveSerialNumber={onRemoveSerialNumber}
                onUpdateSerialGarantie={onUpdateSerialGarantie}
                setIsDirty={setIsDirty}
                onAddInstrumentDirect={onAddInstrumentDirect}
                onClearForm={onClearForm}
                onUndo={onUndo}
                previousFormState={previousFormState}
              />
              
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
                onBrandToggle={onBrandToggle}
                onSerialNumberChange={onSerialNumberChange}
              />
            </>
          )}
          
          {/* Instrumente nereparabile */}
          <InstrumenteReparatieDefectSection
            items={items}
            instruments={instruments}
            services={services}
          />

          {/* Items Table */}
          <div className="p-0 mx-2 sm:mx-4 overflow-x-auto overscroll-contain border border-slate-200 dark:border-slate-700 rounded-xl bg-card shadow-sm">
            <Table className="text-sm min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                  <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Instrument</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Brand / Serial</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Serviciu</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center w-14">Cant.</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right">Preț</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center">Disc%</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right tabular-nums">Total</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.filter(it => it.item_type !== null || it.instrument_id).map((it, index, filteredItems) => {
                  const currentInstrumentId = it.instrument_id || (it.item_type === 'service' && it.service_id 
                    ? availableServices.find(s => s.id === it.service_id)?.instrument_id 
                    : null)
                  
                  const isFirstItemOfInstrument = currentInstrumentId && filteredItems.findIndex(item => {
                    const itemInstrId = item.instrument_id || (item.item_type === 'service' && item.service_id
                      ? availableServices.find(s => s.id === item.service_id)?.instrument_id
                      : null)
                    return itemInstrId === currentInstrumentId
                  }) === index
                  
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
                  
                  const disc = Math.min(100, Math.max(0, it.discount_pct || 0))
                  const base = (it.qty || 0) * (it.price || 0)
                  const afterDisc = base * (1 - disc / 100)
                  const lineTotal = it.urgent ? afterDisc * (1 + URGENT_MARKUP_PCT / 100) : afterDisc
                  
                  const instrumentName = it.instrument_id 
                    ? instruments.find(i => i.id === it.instrument_id)?.name || '—'
                    : '—'
                  
                  const brandGroups = (it as any)?.brand_groups && Array.isArray((it as any).brand_groups) 
                    ? (it as any).brand_groups 
                    : []
                  
                  return (
                    <TableRow 
                      key={it.id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 last:border-0"
                    >
                      <TableCell className="text-xs text-slate-700 dark:text-slate-300 py-2.5">
                        <span className="font-medium">{instrumentName}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2">
                        <div className="flex flex-col gap-1">
                          {brandGroups.length > 0 ? (
                            renderServiceSerialNumbers(it, brandGroups)
                          ) : (
                            !isLocked && (
                              <>
                                <Input
                                  className="h-6 text-[10px] w-24"
                                  placeholder="Brand..."
                                  value={it.brand || ''}
                                  onChange={e => onUpdateItem(it.id, { brand: e.target.value || null })}
                                />
                                <Input
                                  className="h-6 text-[10px] w-28"
                                  placeholder="Serial..."
                                  value={it.serial_number || ''}
                                  onChange={e => onUpdateItem(it.id, { serial_number: e.target.value || null })}
                                />
                              </>
                            )
                          )}
                        </div>
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
                              const v = Math.max(1, Number(e.target.value || 1))
                              onUpdateItem(it.id, { qty: v })
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
                              const v = Math.min(100, Math.max(0, Number(e.target.value || 0)))
                              onUpdateItem(it.id, { discount_pct: v })
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm py-2">{lineTotal?.toFixed(2) || '0.00'}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1 justify-end">
                          {!isLocked && onRowClick && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10" 
                              onClick={(e) => {
                                e.stopPropagation()
                                onRowClick(it)
                              }}
                              title="Editează"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!isLocked && isFirstItemOfInstrument && onMoveInstrument && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" 
                              onClick={(e) => {
                                e.stopPropagation()
                                const group = buildInstrumentGroupForMove()
                                if (group) onMoveInstrument(group)
                              }}
                              title="Mută în altă tăviță"
                            >
                              <Move className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!isLocked && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" 
                              onClick={(e) => {
                                e.stopPropagation()
                                onDelete(it.id)
                              }}
                              title="Șterge"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground text-center py-6 text-sm">
                      Nu există poziții încă.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      
      {/* Totals */}
      <TotalsSection
        items={items}
        subscriptionType={subscriptionType}
        services={services}
        instruments={instruments.map(i => ({ id: i.id, weight: i.weight || 0 }))}
        globalDiscountPct={globalDiscountPct}
        onGlobalDiscountChange={onGlobalDiscountChange}
        canEditDiscount={canEditUrgentAndSubscription}
      />
      
      {/* ================================================================== */}
      {/* DIALOGS                                                            */}
      {/* ================================================================== */}
      
      {/* Dialog Curier Trimis */}
      <Dialog open={showCurierTrimisDialog} onOpenChange={setShowCurierTrimisDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Selectează data și ora pentru Curier
            </DialogTitle>
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
                    locale={ro}
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
            <Button variant="outline" onClick={() => {
              setShowCurierTrimisDialog(false)
              setSelectedDate(undefined)
              setSelectedTime('08:00')
            }}>
              Anulează
            </Button>
            <Button
              onClick={async () => {
                if (!selectedDate) {
                  toast.error('Selectează o dată')
                  return
                }
                const dateTime = new Date(selectedDate)
                const [hours, mins] = selectedTime.split(':')
                dateTime.setHours(parseInt(hours, 10), parseInt(mins, 10), 0, 0)
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
      
      {/* Wizard Comandă */}
      <Dialog open={showComandaWizard} onOpenChange={setShowComandaWizard}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-green-600" />
              Înregistrare Comandă
              <Badge variant="outline" className="ml-auto">Pas {comandaStep}/3</Badge>
            </DialogTitle>
            <DialogDescription>
              {comandaStep === 1 && 'Verifică datele clientului'}
              {comandaStep === 2 && 'Alege metoda de livrare'}
              {comandaStep === 3 && 'Confirmă detaliile comenzii'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {/* Step 1: Date client */}
            {comandaStep === 1 && (
              <div className="space-y-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Nume client</Label>
                    <Input value={lead?.name || ''} readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefon</Label>
                    <Input value={lead?.phone || ''} readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={lead?.email || '—'} readOnly className="bg-muted" />
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                  <p className="text-sm text-green-700 flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Datele clientului sunt completate
                  </p>
                </div>
              </div>
            )}
            
            {/* Step 2: Livrare */}
            {comandaStep === 2 && (
              <div className="space-y-4">
                <RadioGroup value={deliveryType} onValueChange={(v) => setDeliveryType(v as 'office' | 'curier')}>
                  <div className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                    deliveryType === 'office' ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-border hover:border-green-300"
                  )} onClick={() => setDeliveryType('office')}>
                    <RadioGroupItem value="office" id="office-wizard" />
                    <div className="flex-1">
                      <Label htmlFor="office-wizard" className="text-base font-medium cursor-pointer flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-green-600" />
                        Office Direct
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">Clientul vine la sediu să ridice comanda</p>
                    </div>
                  </div>
                  
                  <div className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                    deliveryType === 'curier' ? "border-purple-500 bg-purple-50 dark:bg-purple-950/30" : "border-border hover:border-purple-300"
                  )} onClick={() => setDeliveryType('curier')}>
                    <RadioGroupItem value="curier" id="curier-wizard" />
                    <div className="flex-1">
                      <Label htmlFor="curier-wizard" className="text-base font-medium cursor-pointer flex items-center gap-2">
                        <Truck className="h-5 w-5 text-purple-600" />
                        Trimite Curier
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">Comanda va fi livrată prin curier</p>
                    </div>
                  </div>
                </RadioGroup>
                
                {deliveryType === 'curier' && (
                  <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-3">
                    <div className="space-y-2">
                      <Label>Data livrării</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {curierDate ? format(curierDate, 'PPP', { locale: ro }) : 'Selectează data'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={curierDate}
                            onSelect={setCurierDate}
                            locale={ro}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>Ora livrării</Label>
                      <Input type="time" value={curierTime} onChange={(e) => setCurierTime(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Step 3: Confirmare */}
            {comandaStep === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Client:</span>
                    <span className="font-medium">{lead?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Telefon:</span>
                    <span className="font-medium">{lead?.phone || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Livrare:</span>
                    <span className="font-medium flex items-center gap-1">
                      {deliveryType === 'office' ? (
                        <><Building2 className="h-4 w-4" /> Office Direct</>
                      ) : (
                        <><Truck className="h-4 w-4" /> Curier</>
                      )}
                    </span>
                  </div>
                  {deliveryType === 'curier' && curierDate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Data curier:</span>
                      <span className="font-medium">{format(curierDate, 'dd MMM yyyy', { locale: ro })} la {curierTime}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-muted-foreground">Instrumente:</span>
                    <span className="font-medium">{items.length} poziții</span>
                  </div>
                </div>
                
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4">
                  <p className="text-sm text-green-700 flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Se va crea o fișă de serviciu nouă și lead-ul va fi mutat în "Avem Comanda"
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="gap-2">
            {comandaStep > 1 && (
              <Button variant="outline" onClick={() => setComandaStep(s => s - 1)}>
                ← Înapoi
              </Button>
            )}
            <Button variant="outline" onClick={() => {
              setShowComandaWizard(false)
              setComandaStep(1)
            }}>
              Anulează
            </Button>
            {comandaStep < 3 ? (
              <Button 
                onClick={() => setComandaStep(s => s + 1)}
                disabled={comandaStep === 2 && deliveryType === 'curier' && !curierDate}
                className="bg-green-600 hover:bg-green-700"
              >
                Următorul <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleComandaFinish} className="bg-green-600 hover:bg-green-700">
                <Check className="h-4 w-4 mr-1" />
                Creează Comanda
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
