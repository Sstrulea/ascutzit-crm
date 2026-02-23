'use client'

import { useEffect, useState } from 'react'
import { AddInstrumentForm } from '../forms/AddInstrumentForm'
import { AddServiceForm } from '../forms/AddServiceForm'
import { MobileItemsView } from '../mobile/MobileItemsView'
import { cn } from '@/lib/utils'
import { TotalsSection } from '../sections/TotalsSection'
import { TrayTabs } from '../sections/TrayTabs'
import { TrayImagesSection } from '../sections/TrayImagesSection'
import { InstrumenteReparatieDefectSection } from '../sections/InstrumenteReparatieDefectSection'
import { CreateTrayDialog } from '../dialogs/CreateTrayDialog'
import { MoveInstrumentDialog } from '../dialogs/MoveInstrumentDialog'
import { SendConfirmationDialog } from '../dialogs/SendConfirmationDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Trash2, Move, Package, ChevronRight, Pencil, FileCheck, ChevronDown, X } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import type { LeadQuoteItem, LeadQuote, FacturareMode } from '@/lib/types/preturi'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Lead } from '@/app/(crm)/dashboard/page'

// ============================================================================
// TYPES - ReceptieView INDEPENDENT (nu mai extinde VanzariView)
// ============================================================================

export interface ReceptieViewProps {
  // ========== STATE ==========
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
  callBack: boolean
  loading: boolean
  saving: boolean
  isDirty: boolean
  
  // ========== DATA ==========
  availableInstruments: Array<{ id: string; name: string }>
  availableServices: Service[]
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id?: string | null; pipeline?: string | null; repairable?: boolean }>
  departments?: Array<{ id: string; name: string }>
  lead: Lead | null
  fisaId?: string | null
  selectedQuoteId: string | null
  
  // ========== CALLBACKS ==========
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
  onCurierTrimisChange?: (checked: boolean) => Promise<void>
  onReturChange?: (checked: boolean) => Promise<void>
  onUrgentChange: (checked: boolean) => Promise<void>
  onSubscriptionChange: (value: 'services' | 'parts' | 'both' | '') => void
  onNoDealChange: (checked: boolean) => void
  onNuRaspundeChange: (checked: boolean) => void
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
  
  // ========== FLAGS ==========
  isVanzariPipeline?: boolean
  isReceptiePipeline?: boolean
  isOwner?: boolean
  isAdmin?: boolean
  
  // ========== TEHNICIAN (doar admini) ==========
  technicians?: Array<{ id: string; name: string }>
  onTechnicianChange?: (technicianId: string) => void
  onSetStatusComanda?: () => Promise<void> // [OWNER-ONLY] DE ELIMINAT mai târziu
  onAddInstrumentDirect?: (instrumentId: string, qty: number, brand?: string, brandSerialGroups?: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }>; qty: string }>) => void
  onRowClick?: (item: LeadQuoteItem) => void
  onClearForm?: () => void
  onUndo?: () => void
  previousFormState?: any
  
  // ========== COMPUTED ==========
  currentInstrumentId: string | null
  hasServicesOrInstrumentInSheet: boolean
  isTechnician: boolean
  isDepartmentPipeline: boolean
  subtotal: number
  totalDiscount: number
  total: number
  instrumentSettings: Record<string, any>
  canEditUrgentAndSubscription?: boolean
  
  // ========== TRAY MANAGEMENT ==========
  quotes?: LeadQuote[]
  onTraySelect?: (trayId: string) => void
  onAddTray?: () => void
  onDeleteTray?: (trayId: string) => void
  sendingTrays?: boolean
  traysAlreadyInDepartments?: boolean
  onSendTrays?: () => void
  onPrintTrays?: () => void
  /** Creare tăviță inline (număr + mărime) fără modal – în TrayTabs Recepție */
  onCreateTrayInline?: (number: string) => Promise<void>
  /** Editare tăviță inline – disponibil pentru toți utilizatorii */
  onEditTrayInline?: (trayId: string, newNumber: string) => Promise<void>
  currentServiceFileStage?: string | null
  onFacturare?: (mode: FacturareMode) => Promise<void>

  // ========== INSTRUMENT DISTRIBUTION ==========
  instrumentsGrouped?: Array<{ instrument: { id: string; name: string }; items: LeadQuoteItem[] }>
  onMoveInstrument?: (instrumentGroup: { instrument: { id: string; name: string }; items: LeadQuoteItem[] }) => void
  /** Mutare directă (group, trayId) – folosit de bandă + popover, fără dialog */
  onMoveInstrumentToTray?: (group: { instrument: { id: string; name: string }; items: LeadQuoteItem[] }, trayId: string) => void
  /** Mută instrumentul într-o tăviță nouă (număr + mărime) – folosit din popover „Creează tăviță nouă”. */
  onMoveInstrumentToNewTray?: (group: { instrument: { id: string; name: string }; items: LeadQuoteItem[] }, number: string) => Promise<void>
  
  // ========== TRAY IMAGES ==========
  trayImages?: Array<{ id: string; tray_id: string; url: string; filename: string; file_path: string; created_at: string }>
  uploadingImage?: boolean
  isImagesExpanded?: boolean
  canAddTrayImages?: boolean
  canViewTrayImages?: boolean
  onToggleImagesExpanded?: () => void
  onImageUpload?: (file: File) => void
  onDownloadAllImages?: () => void
  onImageDelete?: (imageId: string, filePath: string) => void

  // ========== DIALOGURI SPECIFICE RECEPȚIE ==========
  showCreateTrayDialog?: boolean | null | undefined
  onCancelCreateTray?: (() => void) | null | undefined
  onCreateTray?: ((number: string) => void) | null | undefined
  newTrayNumber?: string | null | undefined
  creatingTray?: boolean | null | undefined
  onNewTrayNumberChange?: ((number: string) => void) | null | undefined
  
  showMoveInstrumentDialog?: boolean | null | undefined
  instrumentToMove?: { instrument: { id: string; name: string }; items: LeadQuoteItem[] } | null | undefined
  targetTrayId?: string | null | undefined
  movingInstrument?: boolean | null | undefined
  onCancelMoveInstrument?: (() => void) | null | undefined
  onMoveInstrumentConfirm?: (() => void) | null | undefined
  onTargetTrayChange?: ((trayId: string) => void) | null | undefined
  
  showSendConfirmation?: boolean | null | undefined
  onConfirmSendTrays?: (() => Promise<void>) | null | undefined
  onCancelSendTrays?: (() => void) | null | undefined
  /** Închide overlay-ul și panoul (ex. din overlay „Distribuie instrumentele”). */
  onClose?: () => void
}

// ============================================================================
// MAIN COMPONENT - ReceptieView INDEPENDENT
// ============================================================================

/**
 * ReceptieView - Componentă INDEPENDENTĂ
 * 
 * STRUCTURE:
 * - Conține TOATĂ funcționalitatea pentru pipeline-ul Recepție
 * - NU depinde de VanzariView
 * - Include 3 dialoguri specifice pentru Recepție:
 *   1. CreateTrayDialog - crearea unei tăvițe noi
 *   2. MoveInstrumentDialog - mutarea instrumentelor între tăvițe
 *   3. SendConfirmationDialog - confirmarea trimiterii tăvițelor
 * - Bandă non-blocantă + popover pentru distribuția instrumentelor (fără overlay)
 */
/**
 * Funcție helper pentru afișarea serial numbers-urilor pentru o înregistrare de serviciu
 * Afișează toate serial numbers-urile asociate cu înregistrarea serviciului dat
 */
function renderServiceSerialNumbers(
  item: LeadQuoteItem,
  brandGroups: Array<{ id?: string; brand: string; serialNumbers: string[]; garantie?: boolean }>
): React.ReactNode[] {
  if (!brandGroups || brandGroups.length === 0) {
    return []
  }

  return brandGroups.flatMap((bg: any, bgIdx: number) => {
    if (!bg || typeof bg !== 'object') return []
    const bgBrand = bg.brand || '—'
    const bgSerials = Array.isArray(bg.serialNumbers) ? bg.serialNumbers : []
    
    return bgSerials.map((sn: any, snIdx: number) => {
      const serial = typeof sn === 'string' ? sn : (sn?.serial || '')
      // IMPORTANT: Afișează TOATE serial numbers-urile, inclusiv cele goale
      // Pentru serial numbers goale, afișează un placeholder
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

export function ReceptieView({
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
  callBack,
  loading,
  saving,
  isDirty,
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
  quotes = [],
  onTraySelect,
  onAddTray,
  onCreateTrayInline,
  onEditTrayInline,
  onDeleteTray,
  sendingTrays = false,
  traysAlreadyInDepartments = false,
  onSendTrays,
  onPrintTrays,
  currentServiceFileStage,
  onFacturare,
  instrumentsGrouped = [],
  onMoveInstrument,
  /** Mutare directă (group, trayId) – folosit de bandă + popover, fără dialog */
  onMoveInstrumentToTray,
  onMoveInstrumentToNewTray,
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
  isReceptiePipeline = true, // Default true pentru Recepție
  isOwner = false,
  isAdmin = false,
  technicians = [],
  onTechnicianChange,
  onSetStatusComanda,
  onAddInstrumentDirect,
  onRowClick,
  onClearForm,
  onUndo,
  previousFormState,
  // Dialoguri specifice Recepție
  showCreateTrayDialog,
  onCancelCreateTray,
  onCreateTray,
  newTrayNumber,
  creatingTray,
  onNewTrayNumberChange,
  showMoveInstrumentDialog,
  instrumentToMove,
  targetTrayId,
  movingInstrument,
  onCancelMoveInstrument,
  onMoveInstrumentConfirm,
  onTargetTrayChange,
  showSendConfirmation,
  onConfirmSendTrays,
  onCancelSendTrays,
  onClose,
}: ReceptieViewProps) {
  
  const [facturareLoading, setFacturareLoading] = useState(false)
  const [statusComandaLoading, setStatusComandaLoading] = useState(false)
  const isMobile = useIsMobile()
  
  const isDeFacturatStage = (currentServiceFileStage || '')
    .toLowerCase()
    .trim()
    .includes('de facturat')
  const canFacturare = !!(onFacturare && isDeFacturatStage)

  // Verifică dacă există instrumente de distribuit (în tăvița unassigned)
  const hasInstrumentsToDistribute = instrumentsGrouped.length > 0
  
  // VERIFICARE: Fișa este LOCKED dacă a fost deja trimisă (office_direct sau curier_trimis este true)
  // EXCEPȚIE: Pentru Recepție, fișa NU se blochează niciodată
  const isServiceFileLocked = false // Recepție nu blochează niciodată fișa
  
  // Validări pentru checkbox-urile Office Direct și Curier Trimis
  const canSelectDelivery = !!(fisaId && selectedQuoteId) && !isServiceFileLocked
  const canSaveDelivery = !!(fisaId && selectedQuoteId && items.length > 0)
  
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

  // Popover deschis pentru „Distribuie” (id instrument) – folosit doar cu onMoveInstrumentToTray
  const [openDistributePopoverId, setOpenDistributePopoverId] = useState<string | null>(null)
  // Formular inline „Creează tăviță nouă” în popover (număr)
  const [newTrayNumInline, setNewTrayNumInline] = useState('')
  const [movingToNewTray, setMovingToNewTray] = useState(false)
  const availableTraysForBanner = (quotes || []).filter(
    (q) => q.id !== selectedQuoteId && q.number != null && String(q.number).trim() !== ''
  )

  return (
    <>
      {/* ================================================================== */}
      {/* MAIN CONTENT - Interfața principală Recepție                      */}
      {/* ================================================================== */}
      <div className="space-y-4 border rounded-xl bg-card shadow-sm overflow-visible">
        {/* Bandă non-blocantă: instrumente de distribuit (fără overlay) */}
        {hasInstrumentsToDistribute && (
          <div className="mx-3 mt-3 sm:mx-4 sm:mt-4 p-3 sm:p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {instrumentsGrouped.length} instrument{instrumentsGrouped.length !== 1 ? 'e' : ''} de distribuit în tăvițe cu număr
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {instrumentsGrouped.map((group) => {
                const totalQty = group.items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0)
                const isPopoverOpen = openDistributePopoverId === group.instrument.id
                const hasPopover = (onMoveInstrumentToTray && availableTraysForBanner.length > 0) || onMoveInstrumentToNewTray
                if (hasPopover) {
                  return (
                    <Popover key={group.instrument.id} open={isPopoverOpen} onOpenChange={(open) => { setOpenDistributePopoverId(open ? group.instrument.id : null); if (!open) { setNewTrayNumInline('') } }}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                        >
                          <Move className="h-3.5 w-3.5" />
                          {group.instrument.name}
                          <span className="text-muted-foreground">({totalQty})</span>
                          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        {onMoveInstrumentToTray && availableTraysForBanner.length > 0 && (
                          <>
                            <p className="text-xs font-medium text-muted-foreground px-2 py-1">Alege tăvița:</p>
                            <div className="grid gap-0.5">
                              {availableTraysForBanner.map((q) => (
                                <Button
                                  key={q.id}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="justify-start font-normal"
                                  onClick={async () => {
                                    await onMoveInstrumentToTray(group, q.id)
                                    setOpenDistributePopoverId(null)
                                  }}
                                >
                                  {q.number || q.id}
                                </Button>
                              ))}
                            </div>
                          </>
                        )}
                        {onMoveInstrumentToNewTray && (
                          <>
                            {onMoveInstrumentToTray && availableTraysForBanner.length > 0 && <div className="border-t my-2" />}
                            <p className="text-xs font-medium text-muted-foreground px-2 py-1">Creează tăviță nouă</p>
                            <div className="grid gap-2 px-1 pb-1">
                              <div>
                                <Label className="text-xs">Număr</Label>
                                <Input
                                  placeholder="1, 2, A..."
                                  value={newTrayNumInline}
                                  onChange={(e) => setNewTrayNumInline(e.target.value)}
                                  disabled={movingToNewTray}
                                  className="h-8 text-sm mt-0.5"
                                />
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={movingToNewTray || !newTrayNumInline.trim()}
                                onClick={async () => {
                                  if (!onMoveInstrumentToNewTray || !newTrayNumInline.trim()) return
                                  setMovingToNewTray(true)
                                  try {
                                    await onMoveInstrumentToNewTray(group, newTrayNumInline.trim())
                                    setOpenDistributePopoverId(null)
                                    setNewTrayNumInline('')
                                  } finally {
                                    setMovingToNewTray(false)
                                  }
                                }}
                              >
                                {movingToNewTray ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                                Creează și mută
                              </Button>
                            </div>
                          </>
                        )}
                      </PopoverContent>
                    </Popover>
                  )
                }
                if (onMoveInstrument) {
                  return (
                    <Button
                      key={group.instrument.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onMoveInstrument(group)}
                      className="gap-1.5 border-amber-300 dark:border-amber-700"
                    >
                      <Move className="h-3.5 w-3.5" />
                      {group.instrument.name} ({totalQty})
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  )
                }
                return (
                  <span key={group.instrument.id} className="text-sm text-amber-800 dark:text-amber-200">
                    {group.instrument.name} ({totalQty})
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Header — responsive pe mobile/tabletă */}
        <div className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-800/30 border-b px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 max-sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-semibold text-base text-foreground">Recepție Comandă</h3>
              <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">Adaugă instrumente și servicii pentru această comandă</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {isOwner && onSetStatusComanda && quotes && quotes.length > 0 && (
                <Button
                  data-button-id="receptieStatusComandaButton"
                  size="sm"
                  type="button"
                  variant="outline"
                  disabled={statusComandaLoading}
                  onClick={async (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setStatusComandaLoading(true)
                    try {
                      await onSetStatusComanda()
                    } finally {
                      setStatusComandaLoading(false)
                    }
                  }}
                  className="shadow-sm flex-shrink-0 min-h-11 sm:min-h-9 gap-1.5 touch-manipulation bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                  title="Setează status fișă la Comandă (doar Owner)"
                >
                  {statusComandaLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileCheck className="h-4 w-4" />
                  )}
                  Status Comandă
                </Button>
              )}
              {onFacturare && isDeFacturatStage && (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Livrare:</span>
                    {curierTrimis ? (
                      <Badge variant="default" className="font-medium">Curier trimis</Badge>
                    ) : officeDirect ? (
                      <Badge variant="secondary" className="font-medium">Ridic la sediu</Badge>
                    ) : (
                      <span className="italic">neselectat</span>
                    )}
                  </div>
                  <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      data-button-id="receptieFacturareButton"
                      size="sm"
                      type="button"
                      variant="outline"
                      disabled={facturareLoading}
                      className="shadow-sm flex-shrink-0 min-h-11 sm:min-h-9 gap-1.5 touch-manipulation"
                      title="Facturare: Ridic personal sau De trimis (AWB)"
                    >
                      {facturareLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileCheck className="h-4 w-4" />
                      )}
                      Facturare
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[240px]">
                    <DropdownMenuItem
                      disabled={facturareLoading}
                      onSelect={async (e) => {
                        e.preventDefault()
                        if (!canFacturare) return
                        setFacturareLoading(true)
                        try {
                          await onFacturare('facturare')
                        } finally {
                          setFacturareLoading(false)
                        }
                      }}
                    >
                      <span className="flex flex-col items-start">
                        <span>Ridic personal</span>
                        <span className="text-xs text-muted-foreground font-normal">La sediu (clientul ridică)</span>
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={facturareLoading}
                      onSelect={async (e) => {
                        e.preventDefault()
                        if (!canFacturare) return
                        setFacturareLoading(true)
                        try {
                          await onFacturare('facturare_awb')
                        } finally {
                          setFacturareLoading(false)
                        }
                      }}
                    >
                      <span className="flex flex-col items-start">
                        <span>De trimis (AWB)</span>
                        <span className="text-xs text-muted-foreground font-normal">Curier trimis</span>
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </>
              )}
              <Button 
                data-button-id="receptieSaveButton"
                size="sm"
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onSave()
                }} 
                disabled={loading || saving || !isDirty}
                className="bg-primary text-primary-foreground border-0 shadow-md shadow-primary/30 flex-shrink-0 min-h-11 sm:min-h-9 w-full sm:w-auto touch-manipulation"
                title="Salvează toate modificările făcute (instrumente, servicii, tăvițe) în istoricul fișei de serviciu"
                style={{
                  animation: loading || saving || !isDirty
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
            </div>
          </div>
        </div>

        {/* TrayTabs - Navigare între tăvițe (același layout pentru toți, inclusiv tehnicieni) */}
        {quotes && quotes.length > 0 && (
          <div className="px-2 sm:px-4">
            <TrayTabs
              quotes={quotes}
              selectedQuoteId={selectedQuoteId}
              isVanzariPipeline={false}
              isReceptiePipeline={true}
              isDepartmentPipeline={isDepartmentPipeline}
              isVanzatorMode={false}
              sendingTrays={sendingTrays ?? false}
              traysAlreadyInDepartments={traysAlreadyInDepartments ?? false}
              currentServiceFileStage={currentServiceFileStage}
              officeDirect={officeDirect}
              curierTrimis={curierTrimis}
              onTraySelect={onTraySelect || (() => {})}
              onAddTray={onAddTray || (() => {})}
              onCreateTrayInline={onCreateTrayInline}
              onEditTrayInline={onEditTrayInline}
              onDeleteTray={onDeleteTray || (() => {})}
              onSendTrays={onSendTrays || (() => {})}
              onPrintTrays={onPrintTrays}
              isOwner={isOwner}
              onSetStatusComanda={onSetStatusComanda}
            />
          </div>
        )}

        {/* Urgent + Abonament - deblocate pentru Recepție */}
        <div className="mx-2 sm:mx-4 px-3 py-2 rounded-lg bg-muted/30 border">
          <div className="flex flex-wrap items-center gap-4">
            {/* Urgent toggle - interactiv */}
            <label className={cn(
              'flex items-center gap-2.5 group',
              canEditUrgentAndSubscription ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
            )}>
              <div className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
                urgentAllServices ? 'bg-red-500' : 'bg-muted-foreground/20',
                !canEditUrgentAndSubscription && 'opacity-60'
              )}>
                <Checkbox
                  id="receptie-urgent"
                  checked={urgentAllServices}
                  onCheckedChange={canEditUrgentAndSubscription ? (c => onUrgentChange(!!c)) : undefined}
                  disabled={!canEditUrgentAndSubscription}
                  className="sr-only"
                />
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${urgentAllServices ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className={`text-sm font-medium transition-colors ${urgentAllServices ? 'text-red-600' : 'text-muted-foreground'} ${canEditUrgentAndSubscription ? 'group-hover:text-foreground' : ''}`}>
                Urgent
              </span>
              {urgentAllServices && (
                <span className="text-[10px] font-medium text-red-500 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded animate-pulse">
                  +30%
                </span>
              )}
            </label>
            
            <div className="h-5 w-px bg-border/60" />
            
            {/* Abonament - interactiv */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Label htmlFor="receptie-subscription" className="text-sm font-medium text-muted-foreground">
                Abonament
              </Label>
              <select
                id="receptie-subscription"
                className={cn(
                  'h-8 text-sm rounded-lg border border-border/60 px-2.5 bg-white dark:bg-background transition-colors',
                  canEditUrgentAndSubscription ? 'hover:border-primary/40 cursor-pointer' : 'cursor-not-allowed opacity-60'
                )}
                value={subscriptionType}
                onChange={e => canEditUrgentAndSubscription && onSubscriptionChange(e.target.value as 'services' | 'parts' | 'both' | '')}
                disabled={!canEditUrgentAndSubscription}
              >
                <option value="">Fără abonament</option>
                <option value="services">Servicii (-10%)</option>
                <option value="parts">Piese (-5%)</option>
                <option value="both">Servicii + Piese</option>
              </select>
            </div>

            <div className="h-5 w-px bg-border/60" />
            
            {/* Office direct – editabil când onOfficeDirectChange este furnizat (Fază 3.5) */}
            {onOfficeDirectChange ? (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  id="receptie-office-direct"
                  checked={officeDirect}
                  onCheckedChange={async (checked) => {
                    const isChecked = !!checked
                    if (isChecked && curierTrimis && onCurierTrimisChange) await onCurierTrimisChange(false)
                    await onOfficeDirectChange(isChecked)
                  }}
                  className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
                <span className={`text-sm font-medium ${officeDirect ? 'text-blue-600' : 'text-muted-foreground'}`}>
                  Office direct
                </span>
              </label>
            ) : (
              <div className="flex items-center gap-2 opacity-70">
                <div className="h-4 w-4 rounded border-2 flex items-center justify-center bg-background border-border/60">
                  {officeDirect && (
                    <svg className="h-3 w-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm font-medium ${officeDirect ? 'text-blue-600' : 'text-muted-foreground'}`}>
                  Office direct
                </span>
              </div>
            )}

            {/* Curier Trimis – editabil când onCurierTrimisChange este furnizat (Fază 3.5) */}
            {onCurierTrimisChange ? (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  id="receptie-curier-trimis"
                  checked={curierTrimis}
                  onCheckedChange={async (checked) => {
                    const isChecked = !!checked
                    if (isChecked && officeDirect && onOfficeDirectChange) await onOfficeDirectChange(false)
                    await onCurierTrimisChange(isChecked)
                  }}
                  className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                />
                <span className={`text-sm font-medium ${curierTrimis ? 'text-purple-600' : 'text-muted-foreground'}`}>
                  Curier Trimis
                </span>
              </label>
            ) : (
              <div className="flex items-center gap-2 opacity-70">
                <div className="h-4 w-4 rounded border-2 flex items-center justify-center bg-background border-border/60">
                  {curierTrimis && (
                    <svg className="h-3 w-3 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm font-medium ${curierTrimis ? 'text-purple-600' : 'text-muted-foreground'}`}>
                  Curier Trimis
                </span>
              </div>
            )}

            {/* Divider */}
            <div className="h-5 w-px bg-border/60" />

            {/* Buton Retur */}
            <Button
              data-button-id="receptieReturButton"
              variant={retur ? "default" : "outline"}
              size="sm"
              onClick={async () => {
                if (onReturChange) {
                  await onReturChange(!retur)
                }
              }}
              className={cn(
                "h-8 text-xs gap-1.5 transition-all",
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

        {/* Tray Images Section */}
        {canViewTrayImages && selectedQuoteId && (
          <TrayImagesSection
            trayImages={trayImages}
            uploadingImage={uploadingImage}
            isImagesExpanded={isImagesExpanded}
            canAddTrayImages={canAddTrayImages}
            canViewTrayImages={canViewTrayImages}
            selectedQuoteId={selectedQuoteId}
            onToggleExpanded={onToggleImagesExpanded || (() => {})}
            onImageUpload={(event) => {
              const file = event.target.files?.[0]
              if (file && onImageUpload) {
                onImageUpload(file)
              }
            }}
            onDownloadAll={onDownloadAllImages || (() => {})}
            onImageDelete={onImageDelete || (() => {})}
          />
        )}

        {/* Versiune mobilă sau desktop */}
        {isMobile ? (
          <>
            {/* MobileItemsView pentru mobil */}
            <MobileItemsView
              items={items}
              services={services}
              instruments={instruments.map(i => ({ id: i.id, name: i.name, repairable: i.repairable !== false }))}
              technicians={technicians}
              canChangeTechnician={isAdmin}
              pipelinesWithIds={[]}
              isReceptiePipeline={true}
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
              onSvcDiscountChange={onSvcDiscountChange}
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
          </>
        ) : (
          <>
            {/* Formulare de editare - Desktop */}
            <>
              {/* Add Instrument */}
              <AddInstrumentForm
                instrumentForm={instrumentForm as any}
                availableInstruments={availableInstruments}
                instruments={instruments.map(i => ({ id: i.id, name: i.name, department_id: i.department_id ?? null, pipeline: (i as any).pipeline ?? null }))}
                departments={departments}
                instrumentSettings={instrumentSettings}
                hasServicesOrInstrumentInSheet={hasServicesOrInstrumentInSheet}
                isVanzariPipeline={false}
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
              
              {/* Add Service */}
              <AddServiceForm
                svc={svc}
                serviceSearchQuery={serviceSearchQuery}
                serviceSearchFocused={serviceSearchFocused}
                currentInstrumentId={currentInstrumentId}
                availableServices={availableServices}
                instrumentForm={instrumentForm as any}
                isVanzariPipeline={false}
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
            
            {/* Instrumente nereparabile / nu s-au supus reparației / defectate */}
            <InstrumenteReparatieDefectSection
              items={items}
              instruments={instruments}
              services={services}
            />

        {/* Items Table — scroll orizontal pe mobile, afișare curată */}
        <div className="p-0 mx-2 sm:mx-4 overflow-x-auto overscroll-contain border border-slate-200 dark:border-slate-700 rounded-xl bg-card shadow-sm">
          <Table className="text-sm min-w-[640px]">
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-[140px]">Instrument</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider w-[120px]">Brand / Serial</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider min-w-[180px]">Serviciu</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center w-14">Cant.</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right w-16">Preț</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center w-12">Disc%</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-right w-20 tabular-nums">Total</TableHead>
                <TableHead className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center w-20 border-l border-slate-200 dark:border-slate-600" title="Câte bucăți nu se pot repara">Nerepar.</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.filter(it => it.item_type !== null || it.instrument_id).map((it, index, filteredItems) => {
                const currentInstrId = it.instrument_id || (it.item_type === 'service' && it.service_id 
                  ? availableServices.find(s => s.id === it.service_id)?.instrument_id 
                  : null)
                
                const isFirstItemOfInstrument = currentInstrId && filteredItems.findIndex(item => {
                  const itemInstrId = item.instrument_id || (item.item_type === 'service' && item.service_id
                    ? availableServices.find(s => s.id === item.service_id)?.instrument_id
                    : null)
                  return itemInstrId === currentInstrId
                }) === index
                
                const buildInstrumentGroupForMove = () => {
                  if (!currentInstrId) return null
                  const instrument = instruments.find(i => i.id === currentInstrId)
                  const instrumentItems = filteredItems.filter(item => {
                    const itemInstrId = item.instrument_id || (item.item_type === 'service' && item.service_id
                      ? availableServices.find(s => s.id === item.service_id)?.instrument_id
                      : null)
                    return itemInstrId === currentInstrId
                  })
                  return {
                    instrument: { id: currentInstrId, name: instrument?.name || 'Instrument' },
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
                
                // IMPORTANT: Colectează TOATE brand-urile și serial numbers-urile din brand_groups
                // pentru afișare clară a tuturor serial numbers-urilor asociate cu serviciul
                const brandGroups = (it as any)?.brand_groups && Array.isArray((it as any).brand_groups) 
                  ? (it as any).brand_groups 
                  : []
                
                
                // Colectează toate brand-urile și serial numbers-urile
                const allBrandsAndSerials: Array<{ brand: string; serial: string }> = []
                
                if (brandGroups.length > 0) {
                  // Procesează toate brand-urile și serial numbers-urile
                  brandGroups.forEach((bg: any) => {
                    if (!bg || typeof bg !== 'object') return
                    const brandName = bg.brand || '—'
                    const serialNumbers = Array.isArray(bg.serialNumbers) ? bg.serialNumbers : []
                    
                    serialNumbers.forEach((sn: any, snIdx: number) => {
                      const serial = typeof sn === 'string' ? sn : (sn?.serial || '')
                      // IMPORTANT: Include TOATE serial numbers-urile, inclusiv cele goale
                      // Pentru serial numbers goale, folosește un placeholder
                      const displaySerial = serial && serial.trim() ? serial.trim() : `Serial ${snIdx + 1}`
                      allBrandsAndSerials.push({
                        brand: brandName,
                        serial: displaySerial
                      })
                    })
                  })
                } else if (it.brand || it.serial_number) {
                  // Fallback la câmpurile vechi pentru compatibilitate
                  allBrandsAndSerials.push({
                    brand: it.brand || '—',
                    serial: it.serial_number || ''
                  })
                }
                
                // Pentru afișare, folosim primul brand ca brand principal
                const brandName = allBrandsAndSerials.length > 0 ? allBrandsAndSerials[0].brand : '—'
                const serialNumbers = allBrandsAndSerials.map(bs => bs.serial).filter(sn => sn)
                
                return (
                  <TableRow 
                    key={it.id} 
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <TableCell className="text-xs text-slate-700 dark:text-slate-300 py-2.5 align-top">
                      <span className="font-medium">{instrumentName}</span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-400 py-2.5 align-top">
                      <div className="flex flex-col gap-1">
                        {brandGroups.length > 0 ? (
                          renderServiceSerialNumbers(it, brandGroups)
                        ) : (
                          <>
                            <Input
                              className="h-7 text-[11px] w-full max-w-[100px]"
                              placeholder="Brand..."
                              value={it.brand || ''}
                              onFocus={e => e.target.select()}
                              onChange={e => {
                                onUpdateItem(it.id, { brand: e.target.value || null })
                              }}
                            />
                            <Input
                              className="h-7 text-[11px] w-full max-w-[100px]"
                              placeholder="Serial..."
                              value={it.serial_number || ''}
                              onFocus={e => e.target.select()}
                              onChange={e => {
                                onUpdateItem(it.id, { serial_number: e.target.value || null })
                              }}
                            />
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-sm text-slate-800 dark:text-slate-200 py-2.5 align-top max-w-[200px]">
                      <span className="line-clamp-2">{it.name_snapshot}</span>
                    </TableCell>
                    <TableCell className="py-2.5 text-center align-middle">
                      <Input
                        className="h-8 w-12 text-sm text-center mx-auto"
                        inputMode="numeric"
                        value={String(it.qty)}
                        onFocus={e => e.target.select()}
                        onChange={e => {
                          const v = Math.max(1, Number(e.target.value || 1))
                          onUpdateItem(it.id, { qty: v })
                        }}
                      />
                    </TableCell>
                    <TableCell className="py-2.5 text-right align-middle">
                      <Input
                        className="h-8 w-14 text-sm text-right ml-auto"
                        inputMode="decimal"
                        value={String(it.price ?? 0)}
                        onFocus={e => e.target.select()}
                        onChange={e => {
                          const v = Math.max(0, Number(e.target.value || 0))
                          onUpdateItem(it.id, { price: v })
                        }}
                      />
                    </TableCell>
                    <TableCell className="py-2.5 text-center align-middle">
                      <Input
                        className="h-8 w-10 text-sm text-center mx-auto"
                        inputMode="decimal"
                        value={String(it.discount_pct ?? 0)}
                        onChange={e => {
                          const v = Math.min(100, Math.max(0, Number(e.target.value || 0)))
                          onUpdateItem(it.id, { discount_pct: v })
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm tabular-nums text-slate-900 dark:text-slate-100 py-2.5 align-middle whitespace-nowrap">
                      {lineTotal?.toFixed(2) || '0.00'}
                    </TableCell>
                    <TableCell className="py-2.5 text-center align-middle border-l border-slate-100 dark:border-slate-700">
                      <Input
                        type="number"
                        min={0}
                        max={it.qty ?? 1}
                        inputMode="numeric"
                        className="h-8 w-11 text-sm text-center mx-auto"
                        value={(() => {
                          const qty = it.qty ?? 1
                          const n = (it as any).non_repairable_qty
                          const num = typeof n === 'number' && Number.isFinite(n) ? n : 0
                          return String(Math.min(qty, Math.max(0, num)))
                        })()}
                        onFocus={e => e.target.select()}
                        onChange={e => {
                          const qty = it.qty ?? 1
                          const raw = parseInt(e.target.value, 10)
                          const v = Number.isFinite(raw) ? Math.min(qty, Math.max(0, raw)) : ((it as any).non_repairable_qty ?? 0)
                          const safe = typeof v === 'number' && Number.isFinite(v) ? v : 0
                          onUpdateItem(it.id, { non_repairable_qty: Math.min(qty, Math.max(0, safe)) })
                        }}
                        title="Câte bucăți nu se pot repara (ex. 1 din 2)"
                      />
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      <div className="flex items-center gap-0.5 justify-end">
                        {onRowClick && (
                          <Button 
                            data-button-id="receptieItemEditButton"
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 rounded-md text-slate-600 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800" 
                            onClick={(e) => {
                              e.stopPropagation()
                              onRowClick(it)
                            }}
                            title="Editează"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {isFirstItemOfInstrument && onMoveInstrument && (
                          <Button 
                            data-button-id="receptieItemMoveInstrumentButton"
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 rounded-md text-slate-600 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30" 
                            onClick={(e) => {
                              e.stopPropagation()
                              const group = buildInstrumentGroupForMove()
                              if (group) {
                                onMoveInstrument(group)
                              }
                            }}
                            title="Mută instrument"
                          >
                            <Move className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          data-button-id="receptieItemDeleteButton"
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-md text-slate-600 hover:text-destructive hover:bg-destructive/10" 
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(it.id)
                          }}
                          title="Șterge"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin && technicians.length > 0 ? 10 : 9} className="text-slate-500 dark:text-slate-400 text-center py-8 text-sm">
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
          canEditDiscount={false}
        />
      </div>

      {/* ================================================================== */}
      {/* DIALOGURI SPECIFICE RECEPȚIE                                      */}
      {/* ================================================================== */}

      {/* Dialog - Creare tăviță nouă */}
      {showCreateTrayDialog && (
        <CreateTrayDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) onCancelCreateTray?.()
          }}
          newTrayNumber={newTrayNumber || ''}
          creatingTray={creatingTray ?? false}
          onNumberChange={onNewTrayNumberChange || (() => {})}
          onCreate={() => {
            onCreateTray?.(newTrayNumber || '')
          }}
          onCancel={() => onCancelCreateTray?.()}
        />
      )}

      {/* Dialog - Mutare instrument între tăvițe */}
      {showMoveInstrumentDialog && instrumentToMove && (
        <MoveInstrumentDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) onCancelMoveInstrument?.()
          }}
          instrumentToMove={instrumentToMove}
          quotes={quotes}
          selectedQuoteId={selectedQuoteId}
          targetTrayId={targetTrayId || ''}
          newTrayNumber={newTrayNumber || ''}
          movingInstrument={movingInstrument ?? false}
          onTargetTrayChange={onTargetTrayChange || (() => {})}
          onNewTrayNumberChange={onNewTrayNumberChange || (() => {})}
          onMove={async () => {
            if (onMoveInstrumentConfirm) {
              await onMoveInstrumentConfirm()
            }
          }}
          onCancel={() => onCancelMoveInstrument?.()}
        />
      )}

      {/* Dialog - Confirmare trimitere tăvițe */}
      {showSendConfirmation && (
        <SendConfirmationDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) onCancelSendTrays?.()
          }}
          traysCount={quotes.filter(q => q.number && q.number.trim() !== '').length}
          sending={sendingTrays ?? false}
          onConfirm={async () => {
            await onConfirmSendTrays?.()
          }}
          onCancel={() => onCancelSendTrays?.()}
        />
      )}
    </>
  )
}
