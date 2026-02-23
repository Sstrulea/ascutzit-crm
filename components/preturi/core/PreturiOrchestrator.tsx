'use client'

import { useState, useEffect, useRef } from 'react'

// Utils
import { ClientDetails } from '../utils/ClientDetails'
import { PrintViewData } from '../utils/PrintViewData'

// Sections
import { TrayActions } from '../sections/TrayActions'
import { TrayImagesSection } from '../sections/TrayImagesSection'
import { ItemsTable } from '../sections/ItemsTable'
import { TotalsSection } from '../sections/TotalsSection'

// Forms
import { AddInstrumentForm } from '../forms/AddInstrumentForm'
import { AddServiceForm } from '../forms/AddServiceForm'
import { AddPartForm } from '../forms/AddPartForm'

// Views
import { VanzariViewV4 } from '../views/VanzariViewV4'

// Dialogs
import { CreateTrayDialog } from '../dialogs/CreateTrayDialog'
import { EditTrayDialog } from '../dialogs/EditTrayDialog'
import { MoveInstrumentDialog } from '../dialogs/MoveInstrumentDialog'
import { SendConfirmationDialog } from '../dialogs/SendConfirmationDialog'
import { SplitTrayTechnicianDialog } from '../dialogs/SplitTrayTechnicianDialog'
import { SplitTrayToRealTraysDialog } from '../dialogs/SplitTrayToRealTraysDialog'
import { MergeTrayTechnicianDialog } from '../dialogs/MergeTrayTechnicianDialog'
import type { LeadQuote, LeadQuoteItem, FacturareMode } from '@/lib/types/preturi'
import type { Lead } from '@/app/(crm)/dashboard/page'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Part } from '@/lib/supabase/partOperations'
import type { TrayImage } from '@/lib/supabase/imageOperations'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import { createTrayItem, updateTrayItem, createTray } from '@/lib/supabase/serviceFileOperations'
import { createQuoteForLead } from '@/lib/utils/preturi-helpers'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface PreturiOrchestratorProps {
  // Pipeline checks
  isVanzariPipeline: boolean
  isReceptiePipeline: boolean
  isDepartmentPipeline: boolean
  isVanzatorMode: boolean
  isCommercialPipeline: boolean
  isOwner?: boolean
  onSetStatusComanda?: () => Promise<void> // [OWNER-ONLY] DE ELIMINAT mai târziu
  /** Validare QC din Recepție – doar administratori */
  onValidateTrayQc?: (trayId: string) => Promise<void>
  
  // Data
  leadId?: string | null
  lead: Lead | null
  quotes: LeadQuote[]
  selectedQuoteId: string | null
  selectedQuote: LeadQuote | null
  items: LeadQuoteItem[]
  fisaId?: string | null
  services: Service[]
  parts: Part[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null; repairable?: boolean }>
  departments: Array<{ id: string; name: string }>
  technicians: Array<{ id: string; name: string }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  trayImages: TrayImage[]
  
  // State
  loading: boolean
  saving: boolean
  isDirty: boolean
  urgentAllServices: boolean
  subscriptionType: 'services' | 'parts' | 'both' | ''
  trayDetails: string
  loadingTrayDetails: boolean
  officeDirect: boolean
  curierTrimis: boolean
  retur: boolean
  paymentCash: boolean
  paymentCard: boolean
  noDeal: boolean
  nuRaspunde: boolean
  nuRaspundeCallbackAt?: string | null
  callBack: boolean
  allSheetsTotal: number
  isServiceFileLocked?: boolean // Flag pentru a marca dacă fișa este blocată (se încarcă din DB)
  serviceFileStatus?: string | null // Status fișă (noua | in_lucru | finalizata | comanda) – pentru debug
  
  // Form states
  instrumentForm: any
  svc: any
  part: any
  serviceSearchQuery: string
  serviceSearchFocused: boolean
  partSearchQuery: string
  partSearchFocused: boolean
  instrumentSettings: Record<string, any>
  
  // UI states
  showCreateTrayDialog: boolean
  showEditTrayDialog: boolean
  showMoveInstrumentDialog: boolean
  showDeleteTrayConfirmation: boolean
  showSendConfirmation: boolean
  creatingTray: boolean
  updatingTray: boolean
  movingInstrument: boolean
  deletingTray: boolean
  sendingTrays: boolean
  uploadingImage: boolean
  isImagesExpanded: boolean
  newTrayNumber: string
  editingTrayNumber: string
  trayToDelete: string | null
  instrumentToMove: { instrument: { id: string; name: string }; items: LeadQuoteItem[] } | null
  targetTrayId: string
  currentServiceFileStage: string | null
  traysAlreadyInDepartments: boolean
  v4InitialData?: import('@/lib/history/vanzariViewV4Load').V4InitialData | null

  // Computed
  availableInstruments: Array<{ id: string; name: string }>
  availableServices: Service[]
  currentInstrumentId: string | null
  hasServicesOrInstrumentInSheet: boolean
  isTechnician: boolean
  isReparatiiPipeline: boolean
  canAddParts: boolean
  canEditUrgentAndSubscription: boolean
  canAddTrayImages: boolean
  canViewTrayImages: boolean
  undefinedTray: LeadQuote | null
  instrumentsGrouped: Array<{ instrument: { id: string; name: string }; items: LeadQuoteItem[] }>
  distinctInstrumentsInTray: Array<{ id: string; name: string }>
  
  // Totals
  subtotal: number
  totalDiscount: number
  total: number
  
  // Global discount
  globalDiscountPct?: number
  onGlobalDiscountChange?: (value: number) => void
  
  // Callbacks
  onTraySelect: (trayId: string) => void
  onAddTray: () => void
  onDeleteTray: (trayId: string) => void
  onEditTray: () => void
  onSendTrays: () => void
  /** Dezactivează butonul Trimite tăvițele când nu există tăvițe sau există instrumente fără tăviță */
  sendTraysDisabled?: boolean
  /** Motiv afișat la hover când butonul Trimite tăvițele este dezactivat. */
  sendTraysDisabledReason?: string
  onPrintTrays?: () => void
  setQuotes?: (quotes: LeadQuote[] | ((prev: LeadQuote[]) => LeadQuote[])) => void
  setSelectedQuoteId?: (id: string | null) => void
  onUrgentChange: (checked: boolean) => Promise<void>
  onSubscriptionChange: (value: 'services' | 'parts' | 'both' | '') => void
  onOfficeDirectChange: (checked: boolean) => Promise<void>
  onCurierTrimisChange?: (checked: boolean, dateTime?: string) => Promise<void>
  onReturChange?: (checked: boolean) => Promise<void>
  onPaymentCashChange: (checked: boolean) => void
  onPaymentCardChange: (checked: boolean) => void
  onNoDealChange: (checked: boolean) => void
  onNuRaspundeChange: (checked: boolean, callbackTime?: string) => void
  onCallBackChange: (checked: boolean) => void
  onSave: (v4Data?: { instruments: any[]; services: any[]; parts: any[]; trays: any[] }) => void
  onSaveOptionsOnly?: () => void
  onPrint?: () => void
  onFacturare?: (mode: FacturareMode) => Promise<void>
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
  onPartSearchChange: (query: string) => void
  onPartSearchFocus: () => void
  onPartSearchBlur: () => void
  onPartSelect: (partId: string, partName: string) => void
  onPartDoubleClick: (partId: string, partName: string) => void
  onPartQtyChange: (qty: string) => void
  onSerialNumberChange: (serialNumberId: string) => void
  onAddPart: () => void
  onUpdateItem: (id: string, patch: Partial<LeadQuoteItem>) => void
  onDelete: (id: string) => void
  onDetailsChange: (details: string) => void
  onImageUpload: (file: File) => Promise<void>
  onImageDelete: (imageId: string) => Promise<void>
  onDownloadAllImages: () => Promise<void>
  onToggleImagesExpanded: () => void
  /** Imagine reprezentativă pentru tăvița selectată (Recepție / departamente) */
  assignedImageId?: string | null
  onAssignTrayImage?: (imageId: string | null) => Promise<void>
  /** Afișează butoanele „Setează ca reprezentativă” (Recepție + departamente) */
  canAssignTrayImage?: boolean
  onMoveInstrument: (instrumentGroup: { instrument: { id: string; name: string }; items: LeadQuoteItem[] }) => void
  onMoveInstrumentToTray?: (group: { instrument: { id: string; name: string }; items: LeadQuoteItem[] }, trayId: string) => void
  onMoveInstrumentToNewTray?: (group: { instrument: { id: string; name: string }; items: LeadQuoteItem[] }, number: string, size: string) => Promise<void>
  onSplitTrayItemsToTechnician?: (args: {
    trayId?: string
    mode?: 'split' | 'merge'
    targetTechnicianId: string
    moves: Array<{
      trayItemId: string
      qtyMove: number
      item_type?: 'service' | 'part' | null
      name_snapshot?: string | null
      instrument_id?: string | null
      service_id?: string | null
      part_id?: string | null
      from_technician_id?: string | null
      qty_total?: number | null
      has_brands_or_serials?: boolean | null
    }>
  }) => Promise<void>
  currentUserId?: string
  currentUserDisplayName?: string
  onSplitTrayToRealTrays?: (params: {
    originalTrayId: string
    assignments: Array<{ technicianId: string; displayName: string; trayItemIds: string[] }>
  }) => Promise<void>
  
  // Quick actions for department view
  onMarkInProgress?: () => void
  onMarkComplete?: () => void
  onMarkWaiting?: () => void
  onSaveToHistory?: () => void
  onAddBrandSerialGroup: () => void
  onRemoveBrandSerialGroup: (index: number) => void
  onUpdateBrand: (groupIndex: number, brand: string) => void
  onUpdateBrandQty: (groupIndex: number, qty: string) => void
  onUpdateSerialNumber: (groupIndex: number, serialIndex: number, serial: string) => void
  onAddSerialNumber?: (groupIndex: number) => void
  onRemoveSerialNumber?: (groupIndex: number, serialIndex: number) => void
  onUpdateSerialGarantie: (groupIndex: number, serialIndex: number, garantie: boolean) => void
  setIsDirty?: (dirty: boolean) => void
  onCreateTray: () => Promise<void>
  onCreateTrayInline?: (number: string) => Promise<void>
  onUpdateTray: () => Promise<void>
  onEditTrayInline?: (trayId: string, newNumber: string, newSize?: string) => Promise<void>
  onMoveInstrumentConfirm: () => Promise<void>
  onNewTrayNumberChange: (value: string) => void
  onEditingTrayNumberChange: (value: string) => void
  onTargetTrayChange: (value: string) => void
  onCancelCreateTray: () => void
  onCancelEditTray: () => void
  onCancelMoveInstrument: () => void
  onConfirmDeleteTray: () => Promise<void>
  onCancelDeleteTray: () => void
  onConfirmSendTrays: () => Promise<void>
  onCancelSendTrays: () => void
  /** Ref în care view-ul (VanzariViewV4) pune getter pentru datele curente – salvare în istoric la Trimite tăvițele. */
  getV4DataRef?: React.MutableRefObject<(() => any) | null>
  /** Instrumente fără tăviță raportate de view (pentru validare Trimite tăvițele). */
  onSendTraysValidityChange?: (unassignedNames: string[]) => void
  onClose?: () => void
  onRowClick?: (item: LeadQuoteItem) => void
  onClearForm?: () => void
// -------------------------------------------------- COD PENTRU POPULARE CASETE -----------------------------------------------------
  onUndo?: () => void
  previousFormState?: any // Pentru a arăta dacă există stare de Undo
// -----------------------------------------------------------------------------------------------------------------------------------
  onRefreshItems?: () => void
  onBrandToggle?: (brandName: string, checked: boolean) => void
  
  // Tehnician assignment (doar admini)
  isAdmin?: boolean
  technicians?: Array<{ id: string; name: string }>
  onTechnicianChange?: (technicianId: string) => void
}

/**
 * Orchestrator principal care conectează componentele independente
 * SIMPLIFICAT: Afișează MEREU VanzariView pentru toți utilizatorii, indiferent de pipeline
 */
export function PreturiOrchestrator(props: PreturiOrchestratorProps) {
  const {
    isVanzariPipeline,
    isReceptiePipeline,
    isDepartmentPipeline,
    isVanzatorMode,
    isCommercialPipeline,
    lead,
    quotes,
    selectedQuoteId,
    selectedQuote,
    items,
    fisaId,
    undefinedTray,
    instrumentsGrouped,
    onClearForm,
    onRefreshItems,
  } = props

  // Dialog: departamente nu coincid la adăugare instrument – alertă + opțiune de a atribui tăvița noului instrument
  type DepartmentMismatchPending = {
    instrumentId: string
    qty: number
    brand: string
    brandSerialGroupsFromForm: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }>; qty: string }> | undefined
    instrumentName: string
    existingDeptName: string
    newDeptName: string
    newDeptId: string
  }
  const [departmentMismatchPending, setDepartmentMismatchPending] = useState<DepartmentMismatchPending | null>(null)
  const [assignTrayToInstrument, setAssignTrayToInstrument] = useState(false)
  // Dialoguri departament: Împarte către tehnician / Împarte în 2-3 tăvițe / Reunește
  const [showSplitTechnicianDialog, setShowSplitTechnicianDialog] = useState(false)
  const [showSplitRealTraysDialog, setShowSplitRealTraysDialog] = useState(false)
  const [showMergeTrayDialog, setShowMergeTrayDialog] = useState(false)

  const doAddInstrument = async (
    instrumentId: string,
    qty: number,
    brand: string,
    brandSerialGroupsFromForm: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }>; qty: string }> | undefined
  ) => {
    if (!selectedQuote) {
      toast.error('⚠️ Nu există o tăviță atribuită. Te rog selectează sau creează o tăviță înainte de a adăuga un instrument.')
      return
    }
    const instrument = props.instruments?.find(i => i.id === instrumentId)
    if (!instrument) return
    let brandSerialGroups: Array<{ brand: string | null; serialNumbers: string[]; garantie: boolean }> | undefined
    if (brandSerialGroupsFromForm?.length) {
      brandSerialGroups = brandSerialGroupsFromForm
        .filter(g => g.brand?.trim())
        .map(g => ({
          brand: g.brand!.trim(),
          serialNumbers: Array.isArray(g.serialNumbers) ? g.serialNumbers.map((sn: any) => (typeof sn === 'string' ? sn : sn?.serial ?? '').trim()).filter(Boolean) : [],
          garantie: g.serialNumbers?.some((s: any) => (typeof s === 'object' && s?.garantie)) ?? false,
        }))
        .filter(g => g.brand || g.serialNumbers.length > 0)
      if (!brandSerialGroups?.length && brand?.trim()) brandSerialGroups = [{ brand: brand.trim(), serialNumbers: [], garantie: false }]
    } else if (brand?.trim()) {
      brandSerialGroups = [{ brand: brand.trim(), serialNumbers: [], garantie: false }]
    }
    const { data: newItem, error } = await createTrayItem({
      tray_id: selectedQuote.id,
      instrument_id: instrumentId,
      department_id: instrument.department_id || undefined,
      pipeline: instrument.pipeline || undefined,
      qty,
      brandSerialGroups,
    })
    if (error) {
      toast.error('Eroare la adăugare instrument: ' + (error?.message || 'Necunoscut'))
      return
    }
    if (newItem) {
      toast.success(`Instrument adăugat cu succes (Cant: ${qty})`)
      props.setIsDirty?.(true)
      props.onClearForm?.()
      setTimeout(() => props.onRefreshItems?.(), 500)
    }
  }

  const handleAddInstrumentDirect = async (
    instrumentId: string,
    qty: number,
    brand?: string,
    brandSerialGroupsFromForm?: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }>; qty: string }>
  ) => {
    try {
      if (!selectedQuote) {
        toast.error('⚠️ Nu există o tăviță atribuită. Te rog selectează sau creează o tăviță înainte de a adăuga un instrument.')
        return
      }
      const instrument = props.instruments?.find(i => i.id === instrumentId)
      if (!instrument) {
        toast.error('Instrumentul selectat nu a fost găsit')
        return
      }
      const existingDeptIds = new Set<string>()
      const itemsArray = Array.isArray(props.items) ? props.items : []
      itemsArray.forEach((item: LeadQuoteItem) => {
        if (item?.instrument_id) {
          const inst = props.instruments?.find(i => i.id === item.instrument_id)
          if (inst?.department_id) existingDeptIds.add(inst.department_id)
        }
      })
      if (
        existingDeptIds.size > 0 &&
        instrument.department_id &&
        !existingDeptIds.has(instrument.department_id)
      ) {
        const existingDeptId = Array.from(existingDeptIds)[0]
        const existingDeptName = props.departments?.find(d => d.id === existingDeptId)?.name ?? 'existente'
        const newDeptId = instrument.department_id
        const newDeptName = props.departments?.find(d => d.id === newDeptId)?.name ?? newDeptId
        setDepartmentMismatchPending({
          instrumentId,
          qty,
          brand: brand ?? '',
          brandSerialGroupsFromForm,
          instrumentName: instrument.name,
          existingDeptName,
          newDeptName,
          newDeptId,
        })
        setAssignTrayToInstrument(false)
        return
      }
      await doAddInstrument(instrumentId, qty, brand ?? '', brandSerialGroupsFromForm)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Necunoscut'
      toast.error('Eroare: ' + message)
    }
  }

  // Normalizează array-urile pentru a evita erorile de tip "Cannot read properties of undefined"
  const quotesArray = Array.isArray(quotes) ? quotes : []
  // Pentru modalul "Trimite în Departamente": numără tăvițe cu număr; dacă toate sunt fără număr dar există tăvițe, afișăm 1
  const traysWithNumber = quotesArray.filter((q: LeadQuote) => q?.number != null && String(q.number).trim() !== '').length
  const sendableTraysCount = traysWithNumber > 0 ? traysWithNumber : (quotesArray.length > 0 ? 1 : 0)

  // Creare automată a unei tăvițe "undefined" dacă nu există tăvițe și suntem în Recepție sau Vânzări.
  // Ref pentru a evita crearea în buclă (race: effect re-run sau Strict Mode = mai multe tăvițe goale în DB).
  const [isCreatingUndefinedTray, setIsCreatingUndefinedTray] = useState(false)
  const creatingUndefinedTrayRef = useRef(false)
  
  useEffect(() => {
    // Rulează doar după ce încărcarea s-a terminat, ca să nu creăm tăvițe în paralel cu load-ul.
    if (props.loading) return
    if (creatingUndefinedTrayRef.current || isCreatingUndefinedTray) return
    if (
      quotesArray.length === 0 &&
      !isDepartmentPipeline &&
      (isReceptiePipeline || isVanzariPipeline) &&
      fisaId &&
      props.leadId &&
      props.setQuotes &&
      props.setSelectedQuoteId
    ) {
      creatingUndefinedTrayRef.current = true
      setIsCreatingUndefinedTray(true)
      createQuoteForLead(props.leadId, '', fisaId)
        .then((newTray) => {
          props.setQuotes!([newTray])
          props.setSelectedQuoteId!(newTray.id)
          creatingUndefinedTrayRef.current = false
          setIsCreatingUndefinedTray(false)
        })
        .catch((error) => {
          console.error('Error creating undefined tray:', error)
          creatingUndefinedTrayRef.current = false
          setIsCreatingUndefinedTray(false)
        })
    }
  }, [props.loading, quotesArray.length, isDepartmentPipeline, isReceptiePipeline, isVanzariPipeline, fisaId, props.leadId, props.setQuotes, props.setSelectedQuoteId, isCreatingUndefinedTray])

  // Dacă nu există tăvițe și nu suntem în proces de creare automată, afișează mesaj și buton pentru adăugare
  if ((!selectedQuote || quotesArray.length === 0) && !isCreatingUndefinedTray) {
    // Dacă nu suntem în Recepție sau Vânzări, afișăm mesajul standard
    if (isDepartmentPipeline || (!isReceptiePipeline && !isVanzariPipeline)) {
      return (
        <div className="space-y-4 border rounded-xl bg-card shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-800/30 border-b">
            <div className="px-4 pt-4 pb-3">
              <h3 className="font-semibold text-base text-foreground">Fișa de serviciu</h3>
            </div>
          </div>
          <div className="p-6 text-center">
            <p className="text-muted-foreground mb-2">Nu există tăvițe în această fișă.</p>
            <p className="text-sm text-muted-foreground/80 mb-4">
              Dacă fișa a fost arhivată, conținutul a fost mutat în arhivă.
            </p>
          </div>
        </div>
      )
    }
    // Pentru Recepție și Vânzări, afișăm mesajul cu butonul de adăugare (dar tăvița va fi creată automat)
    return (
      <div className="space-y-4 border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-800/30 border-b">
          <div className="px-4 pt-4 pb-3">
            <h3 className="font-semibold text-base text-foreground">Fișa de serviciu</h3>
          </div>
        </div>
        <div className="p-6 text-center">
          <p className="text-muted-foreground mb-2">Se pregătește interfața...</p>
        </div>
        <CreateTrayDialog
          open={props.showCreateTrayDialog}
          onOpenChange={(open) => { if (!open) props.onCancelCreateTray() }}
          newTrayNumber={props.newTrayNumber}
          creatingTray={props.creatingTray}
          onNumberChange={props.onNewTrayNumberChange}
          onCreate={props.onCreateTray}
          onCancel={props.onCancelCreateTray}
        />
      </div>
    )
  }

  // View pentru TOȚI utilizatorii - diferențiat pe pipeline
  // - Recepție: ReceptieView
  // - Department (Saloane, Frizerii, Reparații, Horeca): DepartmentView
  // - Vânzări și altele: VanzariView
  
  
  if (isReceptiePipeline) {
    // Aceeași structură ca la Vânzări (VanzariViewV4): tăvițe, sumar, instrumente, Urgent/Abonament/Office/Curier/Retur, Salvează în Istoric + Trimite tăvițele
    return (
      <>
        <VanzariViewV4
          availableInstruments={props.availableInstruments}
          services={props.services}
          initialData={props.v4InitialData ?? undefined}
          loading={props.loading}
          saving={props.saving}
          isDirty={props.isDirty}
          urgentAllServices={props.urgentAllServices}
          officeDirect={props.officeDirect}
          curierTrimis={props.curierTrimis}
          retur={props.retur}
          subscriptionType={props.subscriptionType}
          isServiceFileLocked={false}
          sectionTitle="Recepție Comandă"
          onSendTrays={props.onSendTrays}
          sendTraysDisabled={props.sendTraysDisabled}
          sendTraysDisabledReason={props.sendTraysDisabledReason}
          getV4DataRef={props.getV4DataRef}
          onSendTraysValidityChange={props.onSendTraysValidityChange}
          fisaIdForCache={props.fisaId ?? undefined}
          serviceFileId={props.fisaId ?? undefined}
          onValidateTrayQc={props.onValidateTrayQc}
          onSave={(data) => props.onSave(data)}
          onClose={props.onClose}
          onUrgentChange={props.onUrgentChange}
          onOfficeDirectChange={props.onOfficeDirectChange}
          onCurierTrimisChange={props.onCurierTrimisChange}
          onReturChange={props.onReturChange}
          onSubscriptionChange={props.onSubscriptionChange}
        />
        {props.canViewTrayImages && selectedQuoteId && (
          <TrayImagesSection
            trayImages={props.trayImages}
            uploadingImage={props.uploadingImage}
            isImagesExpanded={props.isImagesExpanded}
            canAddTrayImages={props.canAddTrayImages}
            canViewTrayImages={props.canViewTrayImages}
            selectedQuoteId={selectedQuoteId}
            onToggleExpanded={props.onToggleImagesExpanded || (() => {})}
            onImageUpload={async (e) => {
              const file = e.target?.files?.[0]
              if (file && props.onImageUpload) await props.onImageUpload(file)
            }}
            onDownloadAll={props.onDownloadAllImages || (() => Promise.resolve())}
            onImageDelete={async (imageId, filePath) => {
              if (props.onImageDelete) await props.onImageDelete(imageId)
            }}
            assignedImageId={props.assignedImageId ?? null}
            onAssignImage={props.onAssignTrayImage}
            canAssignImage={props.canAssignTrayImage ?? false}
          />
        )}
        <CreateTrayDialog
          open={props.showCreateTrayDialog}
          onOpenChange={(open) => { if (!open) props.onCancelCreateTray() }}
          newTrayNumber={props.newTrayNumber}
          creatingTray={props.creatingTray}
          onNumberChange={props.onNewTrayNumberChange}
          onCreate={props.onCreateTray}
          onCancel={props.onCancelCreateTray}
        />
        <SendConfirmationDialog
          open={props.showSendConfirmation}
          onOpenChange={(open) => { if (!open) props.onCancelSendTrays() }}
          traysCount={sendableTraysCount}
          sending={props.sendingTrays}
          onConfirm={props.onConfirmSendTrays}
          onCancel={props.onCancelSendTrays}
        />
        <Dialog open={!!departmentMismatchPending} onOpenChange={(open) => { if (!open) setDepartmentMismatchPending(null) }}>
          <DialogContent showCloseButton={true} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" />
                Departamentele nu coincid
              </DialogTitle>
            </DialogHeader>
            {departmentMismatchPending && (
              <>
                <p className="text-sm text-muted-foreground">
                  Tăvița conține instrumente din departamentul <strong>{departmentMismatchPending.existingDeptName}</strong>,{' '}
                  iar instrumentul selectat (<strong>{departmentMismatchPending.instrumentName}</strong>) este din departamentul <strong>{departmentMismatchPending.newDeptName}</strong>.
                </p>
                <div className="flex items-center space-x-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                  <Checkbox
                    id="assign-tray-receptie"
                    checked={assignTrayToInstrument}
                    onCheckedChange={(checked) => setAssignTrayToInstrument(!!checked)}
                  />
                  <label htmlFor="assign-tray-receptie" className="text-sm font-medium leading-none cursor-pointer">
                    Atribuie tăvița acestui instrument (departament {departmentMismatchPending.newDeptName})
                  </label>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => { setDepartmentMismatchPending(null); setAssignTrayToInstrument(false) }}>Anulează</Button>
                  <Button
                    onClick={async () => {
                      if (!departmentMismatchPending || !selectedQuote) return
                      await doAddInstrument(
                        departmentMismatchPending.instrumentId,
                        departmentMismatchPending.qty,
                        departmentMismatchPending.brand,
                        departmentMismatchPending.brandSerialGroupsFromForm
                      )
                      if (assignTrayToInstrument && departmentMismatchPending.newDeptId) {
                        const itemsArray = Array.isArray(props.items) ? props.items : []
                        for (const item of itemsArray) {
                          if (item?.id && item.department_id !== departmentMismatchPending.newDeptId) {
                            const { error } = await updateTrayItem(item.id, { department_id: departmentMismatchPending.newDeptId })
                            if (error) toast.error('Eroare la actualizarea departamentului unor linii: ' + (error?.message || 'Necunoscut'))
                          }
                        }
                        toast.success('Tăvița a fost atribuită departamentului ' + departmentMismatchPending.newDeptName)
                      }
                      setDepartmentMismatchPending(null)
                      setAssignTrayToInstrument(false)
                    }}
                  >
                    Adaugă
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </>
    )
  }
  
  if (isDepartmentPipeline) {
    // Aceeași structură ca la Vânzări/Recepție (VanzariViewV4) + Acțiuni tăviță (Împarte/Reunește)
    const departmentActions: Array<{ label: string; onClick: () => void }> = []
    if (props.onSplitTrayItemsToTechnician) {
      departmentActions.push({ label: 'Împarte volum către tehnician', onClick: () => setShowSplitTechnicianDialog(true) })
      departmentActions.push({ label: 'Reunește către tehnician', onClick: () => setShowMergeTrayDialog(true) })
    }
    if (props.onSplitTrayToRealTrays && props.currentUserId) {
      departmentActions.push({ label: 'Împarte tăvița în 2 sau 3 tăvițe', onClick: () => setShowSplitRealTraysDialog(true) })
    }

    const itemsArray = Array.isArray(props.items) ? props.items : []
    const instrumentsForDialogs = (props.instruments || []).map((i: any) => ({ id: i.id, name: i.name }))

    return (
      <>
        <VanzariViewV4
          availableInstruments={props.availableInstruments}
          services={props.services}
          initialData={props.v4InitialData ?? undefined}
          loading={props.loading}
          saving={props.saving}
          isDirty={props.isDirty}
          urgentAllServices={props.urgentAllServices}
          officeDirect={props.officeDirect}
          curierTrimis={props.curierTrimis}
          retur={props.retur}
          subscriptionType={props.subscriptionType}
          isServiceFileLocked={false}
          sectionTitle="Departament tehnic"
          departmentActions={departmentActions.length > 0 ? departmentActions : undefined}
          fisaIdForCache={props.fisaId ?? undefined}
          serviceFileId={props.fisaId ?? undefined}
          onSendTrays={undefined}
          onPrintTrays={undefined}
          onSave={(data) => props.onSave(data)}
          onClose={props.onClose}
          onUrgentChange={props.onUrgentChange}
          onOfficeDirectChange={props.onOfficeDirectChange}
          onCurierTrimisChange={props.onCurierTrimisChange}
          onReturChange={props.onReturChange}
          onSubscriptionChange={props.onSubscriptionChange}
        />
        {props.canViewTrayImages && selectedQuoteId && (
          <TrayImagesSection
            trayImages={props.trayImages}
            uploadingImage={props.uploadingImage}
            isImagesExpanded={props.isImagesExpanded}
            canAddTrayImages={props.canAddTrayImages}
            canViewTrayImages={props.canViewTrayImages}
            selectedQuoteId={selectedQuoteId}
            onToggleExpanded={props.onToggleImagesExpanded || (() => {})}
            onImageUpload={async (e) => {
              const file = e.target?.files?.[0]
              if (file && props.onImageUpload) await props.onImageUpload(file)
            }}
            onDownloadAll={props.onDownloadAllImages || (() => Promise.resolve())}
            onImageDelete={async (imageId, _filePath) => {
              if (props.onImageDelete) await props.onImageDelete(imageId)
            }}
            assignedImageId={props.assignedImageId ?? null}
            onAssignImage={props.onAssignTrayImage}
            canAssignImage={props.canAssignTrayImage ?? false}
          />
        )}
        <CreateTrayDialog
          open={props.showCreateTrayDialog}
          onOpenChange={(open) => { if (!open) props.onCancelCreateTray() }}
          newTrayNumber={props.newTrayNumber}
          creatingTray={props.creatingTray}
          onNumberChange={props.onNewTrayNumberChange}
          onCreate={props.onCreateTray}
          onCancel={props.onCancelCreateTray}
        />
        <SendConfirmationDialog
          open={props.showSendConfirmation}
          onOpenChange={(open) => { if (!open) props.onCancelSendTrays() }}
          traysCount={sendableTraysCount}
          sending={props.sendingTrays}
          onConfirm={props.onConfirmSendTrays}
          onCancel={props.onCancelSendTrays}
        />
        {selectedQuoteId && (
          <>
            <SplitTrayTechnicianDialog
              open={showSplitTechnicianDialog}
              onOpenChange={setShowSplitTechnicianDialog}
              items={itemsArray}
              technicians={props.technicians || []}
              instruments={instrumentsForDialogs}
              services={props.services}
              onConfirm={async ({ targetTechnicianId, moves }) => {
                if (!props.onSplitTrayItemsToTechnician) return
                const byId = new Map(itemsArray.map((it: any) => [it.id, it]))
                const movesWithMeta = moves.map((m: any) => {
                  const it = byId.get(m.trayItemId)
                  const hasBrandGroups = Array.isArray((it as any)?.brand_groups) && (it as any).brand_groups.length > 0
                  const hasLegacy = !!it?.brand || !!it?.serial_number
                  return {
                    trayItemId: m.trayItemId,
                    qtyMove: m.qtyMove,
                    item_type: it?.item_type ?? null,
                    name_snapshot: it?.name_snapshot ?? null,
                    instrument_id: it?.instrument_id ?? null,
                    service_id: it?.service_id ?? null,
                    part_id: it?.part_id ?? null,
                    from_technician_id: null,
                    qty_total: it?.qty ?? null,
                    has_brands_or_serials: hasBrandGroups || hasLegacy,
                  }
                })
                await props.onSplitTrayItemsToTechnician({
                  trayId: selectedQuoteId,
                  mode: 'split',
                  targetTechnicianId,
                  moves: movesWithMeta,
                })
              }}
            />
            {props.onSplitTrayToRealTrays && props.currentUserId && (
              <SplitTrayToRealTraysDialog
                open={showSplitRealTraysDialog}
                onOpenChange={setShowSplitRealTraysDialog}
                items={itemsArray}
                instruments={instrumentsForDialogs}
                technicians={props.technicians || []}
                currentUserId={props.currentUserId}
                currentUserDisplayName={props.currentUserDisplayName || 'Eu'}
                onConfirm={async ({ assignments }) => {
                  await props.onSplitTrayToRealTrays!({ originalTrayId: selectedQuoteId, assignments })
                }}
              />
            )}
            <MergeTrayTechnicianDialog
              open={showMergeTrayDialog}
              onOpenChange={setShowMergeTrayDialog}
              items={itemsArray}
              technicians={props.technicians || []}
              instruments={instrumentsForDialogs}
              services={props.services}
              onConfirm={async ({ targetTechnicianId, moves }) => {
                if (!props.onSplitTrayItemsToTechnician) return
                const byId = new Map(itemsArray.map((it: any) => [it.id, it]))
                const movesWithMeta = moves.map((m: any) => {
                  const it = byId.get(m.trayItemId)
                  const hasBrandGroups = Array.isArray((it as any)?.brand_groups) && (it as any).brand_groups.length > 0
                  const hasLegacy = !!it?.brand || !!it?.serial_number
                  return {
                    trayItemId: m.trayItemId,
                    qtyMove: m.qtyMove,
                    item_type: it?.item_type ?? null,
                    name_snapshot: it?.name_snapshot ?? null,
                    instrument_id: it?.instrument_id ?? null,
                    service_id: it?.service_id ?? null,
                    part_id: it?.part_id ?? null,
                    from_technician_id: null,
                    qty_total: it?.qty ?? null,
                    has_brands_or_serials: hasBrandGroups || hasLegacy,
                  }
                })
                await props.onSplitTrayItemsToTechnician({
                  trayId: selectedQuoteId,
                  mode: 'merge',
                  targetTechnicianId,
                  moves: movesWithMeta,
                })
              }}
            />
          </>
        )}
        <Dialog open={!!departmentMismatchPending} onOpenChange={(open) => { if (!open) setDepartmentMismatchPending(null) }}>
          <DialogContent showCloseButton={true} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" />
                Departamentele nu coincid
              </DialogTitle>
            </DialogHeader>
            {departmentMismatchPending && (
              <>
                <p className="text-sm text-muted-foreground">
                  Tăvița conține instrumente din departamentul <strong>{departmentMismatchPending.existingDeptName}</strong>,{' '}
                  iar instrumentul selectat (<strong>{departmentMismatchPending.instrumentName}</strong>) este din departamentul <strong>{departmentMismatchPending.newDeptName}</strong>.
                </p>
                <div className="flex items-center space-x-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                  <Checkbox
                    id="assign-tray-dept"
                    checked={assignTrayToInstrument}
                    onCheckedChange={(checked) => setAssignTrayToInstrument(!!checked)}
                  />
                  <label htmlFor="assign-tray-dept" className="text-sm font-medium leading-none cursor-pointer">
                    Atribuie tăvița acestui instrument (departament {departmentMismatchPending.newDeptName})
                  </label>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => { setDepartmentMismatchPending(null); setAssignTrayToInstrument(false) }}>Anulează</Button>
                  <Button
                    onClick={async () => {
                      if (!departmentMismatchPending || !selectedQuote) return
                      await doAddInstrument(
                        departmentMismatchPending.instrumentId,
                        departmentMismatchPending.qty,
                        departmentMismatchPending.brand,
                        departmentMismatchPending.brandSerialGroupsFromForm
                      )
                      if (assignTrayToInstrument && departmentMismatchPending.newDeptId) {
                        for (const item of itemsArray) {
                          if (item?.id && item.department_id !== departmentMismatchPending.newDeptId) {
                            const { error } = await updateTrayItem(item.id, { department_id: departmentMismatchPending.newDeptId })
                            if (error) toast.error('Eroare la actualizarea departamentului unor linii: ' + (error?.message || 'Necunoscut'))
                          }
                        }
                        toast.success('Tăvița a fost atribuită departamentului ' + departmentMismatchPending.newDeptName)
                      }
                      setDepartmentMismatchPending(null)
                      setAssignTrayToInstrument(false)
                    }}
                  >
                    Adaugă
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // VanzariViewV4 pentru Vânzări (Plan 04: Checkbox + Summary Table)
  return (
    <>
      <VanzariViewV4
        availableInstruments={props.availableInstruments}
        services={props.services}
        initialData={props.v4InitialData ?? undefined}
        loading={props.loading}
        saving={props.saving}
        isDirty={props.isDirty}
        urgentAllServices={props.urgentAllServices}
        officeDirect={props.officeDirect}
        curierTrimis={props.curierTrimis}
        retur={props.retur}
        subscriptionType={props.subscriptionType}
        isServiceFileLocked={props.isServiceFileLocked}
        onSave={(data) => {
          props.onSave(data)
        }}
        onSaveOptionsOnly={props.onSaveOptionsOnly}
        onClose={props.onClose}
        onPrintTrays={props.onPrintTrays}
        fisaIdForCache={props.fisaId ?? undefined}
        serviceFileId={props.fisaId ?? undefined}
        onUrgentChange={props.onUrgentChange}
        onOfficeDirectChange={props.onOfficeDirectChange}
        onCurierTrimisChange={props.onCurierTrimisChange}
        onReturChange={props.onReturChange}
        onSubscriptionChange={props.onSubscriptionChange}
      />
      <CreateTrayDialog
        open={props.showCreateTrayDialog}
        onOpenChange={(open) => { if (!open) props.onCancelCreateTray() }}
        newTrayNumber={props.newTrayNumber}
        creatingTray={props.creatingTray}
        onNumberChange={props.onNewTrayNumberChange}
        onCreate={props.onCreateTray}
        onCancel={props.onCancelCreateTray}
      />
      <Dialog open={!!departmentMismatchPending} onOpenChange={(open) => { if (!open) setDepartmentMismatchPending(null) }}>
        <DialogContent showCloseButton={true} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Departamentele nu coincid
            </DialogTitle>
          </DialogHeader>
          {departmentMismatchPending && (
            <>
              <p className="text-sm text-muted-foreground">
                Tăvița conține instrumente din departamentul <strong>{departmentMismatchPending.existingDeptName}</strong>, 
                iar instrumentul selectat (<strong>{departmentMismatchPending.instrumentName}</strong>) este din departamentul <strong>{departmentMismatchPending.newDeptName}</strong>.
              </p>
              <div className="flex items-center space-x-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                <Checkbox
                  id="assign-tray-to-instrument"
                  checked={assignTrayToInstrument}
                  onCheckedChange={(checked) => setAssignTrayToInstrument(!!checked)}
                />
                <label
                  htmlFor="assign-tray-to-instrument"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Atribuie tăvița acestui instrument (departament {departmentMismatchPending.newDeptName})
                </label>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => { setDepartmentMismatchPending(null); setAssignTrayToInstrument(false) }}
                >
                  Anulează
                </Button>
                <Button
                  onClick={async () => {
                    if (!departmentMismatchPending || !selectedQuote) return
                    await doAddInstrument(
                      departmentMismatchPending.instrumentId,
                      departmentMismatchPending.qty,
                      departmentMismatchPending.brand,
                      departmentMismatchPending.brandSerialGroupsFromForm
                    )
                    if (assignTrayToInstrument && departmentMismatchPending.newDeptId) {
                      const itemsArray = Array.isArray(props.items) ? props.items : []
                      for (const item of itemsArray) {
                        if (item?.id && item.department_id !== departmentMismatchPending.newDeptId) {
                          const { error } = await updateTrayItem(item.id, { department_id: departmentMismatchPending.newDeptId })
                          if (error) {
                            toast.error('Eroare la actualizarea departamentului unor linii: ' + (error?.message || 'Necunoscut'))
                          }
                        }
                      }
                      toast.success('Tăvița a fost atribuită departamentului ' + departmentMismatchPending.newDeptName)
                    }
                    setDepartmentMismatchPending(null)
                    setAssignTrayToInstrument(false)
                  }}
                >
                  Adaugă
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <EditTrayDialog
        open={props.showEditTrayDialog}
        onOpenChange={(open) => { if (!open) props.onCancelEditTray() }}
        editingTrayNumber={props.editingTrayNumber}
        updatingTray={props.updatingTray}
        onNumberChange={props.onEditingTrayNumberChange}
        onUpdate={props.onUpdateTray}
        onCancel={props.onCancelEditTray}
      />
      <MoveInstrumentDialog
        open={props.showMoveInstrumentDialog}
        onOpenChange={(open) => { if (!open) props.onCancelMoveInstrument() }}
        instrumentToMove={props.instrumentToMove}
        quotes={quotesArray}
        selectedQuoteId={selectedQuoteId}
        targetTrayId={props.targetTrayId}
        newTrayNumber={props.newTrayNumber}
        movingInstrument={props.movingInstrument}
        onTargetTrayChange={props.onTargetTrayChange}
        onNewTrayNumberChange={props.onNewTrayNumberChange}
        onMove={async () => {
          if (props.onMoveInstrumentConfirm) {
            await props.onMoveInstrumentConfirm()
          }
        }}
        onCancel={props.onCancelMoveInstrument}
      />
      <SendConfirmationDialog
        open={props.showSendConfirmation}
        onOpenChange={(open) => { if (!open) props.onCancelSendTrays() }}
        traysCount={sendableTraysCount}
        sending={props.sendingTrays}
        onConfirm={props.onConfirmSendTrays}
        onCancel={props.onCancelSendTrays}
      />
    </>
  )
}
