'use client'

import { forwardRef, useImperativeHandle, useMemo, useEffect, useCallback, useState, useRef } from 'react'
import { toast } from 'sonner'
import { useRole, useAuth } from '@/lib/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { usePreturiState } from '@/hooks/usePreturiState'
import { usePreturiPipeline } from '@/hooks/usePreturiPipeline'
import { usePreturiDataLoader } from '@/hooks/usePreturiDataLoader'
import { usePreturiBusiness } from '@/hooks/usePreturiBusiness'
import { usePreturiEffects } from '@/hooks/usePreturiEffects'
import { usePreturiCalculations } from '@/hooks/preturi/usePreturiCalculations'
import { usePreturiFormOperations } from '@/hooks/preturi/usePreturiFormOperations'
import { listQuoteItems } from '@/lib/utils/preturi-helpers'
import { isVanzareService, isVanzareTray } from '@/lib/utils/vanzare-helpers'
import { updateServiceFileWithHistory, clearTrayPositionsOnFacturare, updateTray } from '@/lib/supabase/serviceFileOperations'
import { logItemEvent } from '@/lib/supabase/leadOperations'
import { addServiceFileToPipeline, tryMoveLeadToArhivatIfAllFacturate } from '@/lib/supabase/pipelineOperations'
import { fetchStagesForPipeline } from '@/lib/supabase/kanban/fetchers'
import { PreturiOrchestrator } from './PreturiOrchestrator'
import { BillingDialog } from '../dialogs/BillingDialog'
import { PrintTraysDialog } from '../dialogs/PrintTraysDialog'
import type { PreturiRef, PreturiProps, FacturareMode } from '@/lib/types/preturi'
import type { LeadQuoteItem } from '@/lib/types/preturi'
import type { Lead } from '@/lib/types/database'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import type { V4SaveData } from '@/lib/history/vanzariViewV4Save'
import { clearReceptieDraft } from '@/lib/history/receptieDraftCache'

/**
 * Componentă principală simplă care folosește hook-urile și orchestratorul
 * Nu conține logică de business - doar conectează hook-urile cu orchestratorul
 */
const PreturiMain = forwardRef<PreturiRef, PreturiProps>(function PreturiMain({ 
  leadId, 
  lead: leadProp, 
  fisaId, 
  initialQuoteId, 
  pipelineSlug, 
  isDepartmentPipeline = false,
  serviceFileNumber,
  initialServiceFileStage,
  onAfterFacturare,
  onAfterSendTrays,
  onAfterSave,
  onClose,
  showUrgentareButton,
  isUrgentare,
  isUrgentaring,
  onUrgentareClick,
}, ref) {
  
  // Normalizează lead-ul pentru a evita conflicte de tipuri
  const lead = leadProp as any
  // Hook-uri pentru state management
  const state = usePreturiState(initialQuoteId)
  
  // State pentru dialog-ul de facturare
  const [showBillingDialog, setShowBillingDialog] = useState(false)
  const [showPrintTraysDialog, setShowPrintTraysDialog] = useState(false)
  /** Ref setat de VanzariViewV4 cu getter pentru datele curente – folosit la confirmare Trimite tăvițele. */
  const getV4DataRef = useRef<(() => V4SaveData) | null>(null)
  /** Instrumente fără tăviță raportate de VanzariViewV4 (Recepție) – folosit pentru buton + toast. */
  const [viewUnassignedNames, setViewUnassignedNames] = useState<string[]>([])

  // Hook-uri pentru pipeline checks
  const pipeline = usePreturiPipeline(pipelineSlug, isDepartmentPipeline)
  
  // Hook-uri pentru auth
  const { role, isOwner, loading: roleLoading } = useRole()
  const { user } = useAuth()
  
  // Check technician status - un tehnician este orice membru care NU este owner sau admin
  useEffect(() => {
    async function checkTechnician() {
      if (!user?.id) {
        state.setIsTechnician(false)
        return
      }
      const { data } = await supabaseBrowser()
        .from('app_members')
        .select('user_id, role')
        .eq('user_id', user.id)
        .single()
      // Un tehnician este un membru care există DAR nu este owner sau admin
      const isTech = !!data && (data as any).role !== 'owner' && (data as any).role !== 'admin'
      state.setIsTechnician(isTech)
    }
    checkTechnician()
  }, [user, state.setIsTechnician])
  
  // Computed values
  const isVanzatorMode = useMemo(() => {
    // Verifică dacă utilizatorul este vânzător (nu tehnician)
    return !state.isTechnician && (role === 'admin' || role === 'owner' || role === 'member')
  }, [state.isTechnician, role])
  
  // isAdmin pentru permisiunea de a atribui tehnicieni
  const isAdmin = useMemo(() => {
    return role === 'admin' || role === 'owner'
  }, [role])

  // În pipeline-uri departament (Frizerii, Saloane etc.): filtrează items și instrumente după department_id
  const filterDepartmentId = useMemo(() => {
    if (!isDepartmentPipeline || !pipelineSlug || !state.pipelinesWithIds?.length || !state.departments?.length) return null
    const toSlug = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, '-')
    const pipeline = state.pipelinesWithIds.find((p: any) => toSlug(p?.name || '') === toSlug(pipelineSlug))
    const pipelineName = pipeline?.name
    if (!pipelineName) return null
    const dept = state.departments.find((d: any) => toSlug(d?.name || '') === toSlug(pipelineName))
    return dept?.id ?? null
  }, [isDepartmentPipeline, pipelineSlug, state.pipelinesWithIds, state.departments])

  const displayItems = useMemo(() => {
    if (!isDepartmentPipeline || !filterDepartmentId) return state.items
    const itemsArray = Array.isArray(state.items) ? state.items : []
    return itemsArray.filter((it: any) => {
      const deptId = it.department_id ?? state.instruments.find((i: any) => i.id === it.instrument_id)?.department_id
      return deptId === filterDepartmentId
    })
  }, [isDepartmentPipeline, filterDepartmentId, state.items, state.instruments])

  const itemsForCalculations = useMemo(() => (isDepartmentPipeline && filterDepartmentId ? displayItems : state.items), [isDepartmentPipeline, filterDepartmentId, displayItems, state.items])

  const availableInstruments = useMemo(() => {
    // Filtrează doar instrumentele ACTIVE pentru dropdown/selecție
    // TOATE instrumentele (active + inactive) sunt încărcate în state.instruments și vor apărea în tăviță
    let activeInstruments = state.instruments.filter((inst: any) => inst.active !== false)

    // În pipeline departament: afișează doar instrumentele din acel departament
    if (isDepartmentPipeline && filterDepartmentId) {
      activeInstruments = activeInstruments.filter((inst: any) => inst.department_id === filterDepartmentId)
    }

    // Verifică dacă suntem în Vanzari și în tăvița undefined
    const isUndefinedTray = state.selectedQuote && (!state.selectedQuote.number || state.selectedQuote.number === '')
    const allowAllInstruments = pipeline.isVanzariPipeline && isUndefinedTray

    // Dacă suntem în Vanzari și în tăvița undefined, permite toate instrumentele ACTIVE
    if (allowAllInstruments) {
      return activeInstruments.sort((a, b) => a.name.localeCompare(b.name, 'ro'))
    }

    // Pentru alte cazuri, afișează doar instrumentele ACTIVE în dropdown
    // Instrumentele inactive vor fi vizibile doar în afișarea tăviței (read-only)
    return activeInstruments.sort((a, b) => a.name.localeCompare(b.name, 'ro'))
  }, [pipeline.isVanzariPipeline, isDepartmentPipeline, filterDepartmentId, state.selectedQuote, state.items, state.instruments])
  
  const currentInstrumentId = useMemo(() => {
    return state.instrumentForm.instrument || state.svc.instrumentId || null
  }, [state.instrumentForm.instrument, state.svc.instrumentId])

  // Calculăm totals (trebuie să fie înainte de usePreturiBusiness)
  const subscriptionDiscountAmount = useMemo(() => {
    if (!state.subscriptionType) return 0

    const itemsArray = Array.isArray(itemsForCalculations) ? itemsForCalculations : []
    return itemsArray.reduce((acc, it) => {
      if (!it) return acc
      const base = (it.qty || 0) * (it.price || 0)
      const disc = base * (Math.min(100, Math.max(0, it.discount_pct || 0)) / 100)
      const afterDisc = base - disc
      
      if (it.item_type === 'service' && (state.subscriptionType === 'services' || state.subscriptionType === 'both')) {
        const urgent = it.urgent ? afterDisc * 0.20 : 0
        return acc + (afterDisc + urgent) * 0.10
      } else if (it.item_type === 'part' && (state.subscriptionType === 'parts' || state.subscriptionType === 'both')) {
        return acc + afterDisc * 0.05
      }
      return acc
    }, 0)
  }, [state.subscriptionType, itemsForCalculations])

  const { subtotal, totalDiscount, urgentAmount, total } = useMemo(() => {
    // Exclude items-urile cu item_type: null (doar instrument, fără serviciu) din calculele de totaluri
    const itemsArray = Array.isArray(itemsForCalculations) ? itemsForCalculations : []
    const visibleItems = itemsArray.filter(it => it && it.item_type !== null)
    
    // Subtotal = suma (qty * price) pentru toate items-urile vizibile
    const subtotal = visibleItems.reduce((acc, it) => {
      if (!it) return acc
      return acc + (it.qty || 0) * (it.price || 0)
    }, 0)
    
    // Discount per-item (suma discount-urilor individuale)
    const itemsDiscount = visibleItems.reduce((acc, it) => {
      if (!it) return acc
      const base = (it.qty || 0) * (it.price || 0)
      const itemDiscPct = Math.min(100, Math.max(0, it.discount_pct || 0))
      return acc + base * (itemDiscPct / 100)
    }, 0)
    
    // După discount-urile per-item
    const afterItemsDiscount = subtotal - itemsDiscount
    
    // Discount global aplicat pe valoarea rămasă (după discount-urile per-item)
    const globalDisc = Math.min(100, Math.max(0, state.globalDiscountPct || 0))
    const globalDiscountAmount = afterItemsDiscount * (globalDisc / 100)
    
    // Discount TOTAL = discount-uri per-item + discount global
    const totalDiscount = itemsDiscount + globalDiscountAmount
    
    // Urgent se aplică DUPĂ toate discount-urile (pe suma finală discountată)
    const afterAllDiscounts = subtotal - totalDiscount
    const urgentAmount = state.urgentAllServices ? afterAllDiscounts * 0.30 : 0 // +30% dacă e urgent
    
    const baseTotal = subtotal - totalDiscount + urgentAmount
    const total = baseTotal - subscriptionDiscountAmount
    return { subtotal, totalDiscount, urgentAmount, total }
  }, [itemsForCalculations, subscriptionDiscountAmount, state.globalDiscountPct, state.urgentAllServices])

  const availableServices = useMemo(() => {
    if (!currentInstrumentId) return []
    // Filtrează serviciile care corespund instrumentului selectat
    const servicesForInstrument = Array.isArray(state.services) ? state.services.filter(s => s.instrument_id === currentInstrumentId) : []

    // Obține serviciile care sunt deja atribuite acestui instrument în tăviță
    const itemsArray = Array.isArray(itemsForCalculations) ? itemsForCalculations : []
    const assignedServiceIds = new Set(
      itemsArray
        .filter(item => 
          item.instrument_id === currentInstrumentId && 
          item.item_type === 'service' && 
          item.service_id
        )
        .map(item => item.service_id)
    )
    
    // Exclude serviciile care sunt deja atribuite
    return servicesForInstrument.filter(s => !assignedServiceIds.has(s.id))
  }, [currentInstrumentId, state.services, itemsForCalculations])

  const hasServicesOrInstrumentInSheet = useMemo(() => {
    if (!Array.isArray(itemsForCalculations) || itemsForCalculations.length === 0) {
      return false
    }

    // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
    const itemsArray = Array.isArray(itemsForCalculations) ? itemsForCalculations : []
    let result = false
    for (let i = 0; i < itemsArray.length; i++) {
      const it = itemsArray[i]
      if (it && (it.item_type === 'service' || it.item_type === null)) {
        result = true
        break // Oprim loop-ul când găsim primul item valid
      }
    }

    return result
  }, [itemsForCalculations])

  const undefinedTray = useMemo(() => {
    return state.quotes.find(q => !q.number || q.number === '') || null
  }, [state.quotes])
  
  const instrumentsGrouped = useMemo(() => {
    // Calculează instrumentsGrouped DOAR pentru tăvița undefined (fără număr)
    // Aceasta e tăvița "unassigned" din care se distribuie instrumentele
    const isUndefinedTray = state.selectedQuote && (!state.selectedQuote.number || state.selectedQuote.number.trim() === '')
    if (!isUndefinedTray) return []

    const grouped = new Map<string, { instrument: { id: string; name: string }; items: typeof state.items }>()
    const itemsToUse = Array.isArray(itemsForCalculations) ? itemsForCalculations : []
    if (itemsToUse.length === 0) return []

    itemsToUse.forEach((item: LeadQuoteItem) => {
      let instrumentId: string | null = null
      
      // Dacă item-ul are instrument_id direct
      if (item.instrument_id) {
        instrumentId = item.instrument_id
      } 
      // Dacă item-ul este un serviciu, găsește instrument_id din serviciu
      else if (item.item_type === 'service' && item.service_id) {
        const service = state.services.find(s => s.id === item.service_id)
        instrumentId = service?.instrument_id || null
      }
      
      if (instrumentId) {
        const instrument = state.instruments.find(i => i.id === instrumentId)
        if (instrument) {
          if (!grouped.has(instrument.id)) {
            grouped.set(instrument.id, {
              instrument: { id: instrument.id, name: instrument.name },
              items: []
            })
          }
          grouped.get(instrument.id)!.items.push(item)
        }
      }
    })
    
    // FILTRARE: Exclude instrumentele care au DOAR servicii de vânzare
    // Instrumentele cu servicii de vânzare sunt atribuite automat tăviței VANZARE
    // și nu trebuie să apară în dialogul de distribuție
    const filteredGroups = Array.from(grouped.values()).filter(group => {
      // Verifică dacă grupul are cel puțin un serviciu care NU este de vânzare
      const hasNonVanzareService = group.items.some(item => {
        // Piese sau alte tipuri (nu sunt servicii de vânzare)
        if (item.item_type !== 'service') return true
        if (!item.service_id) return true
        
        // Verifică numele serviciului
        const service = state.services.find(s => s.id === item.service_id)
        return !isVanzareService(service?.name)
      })
      return hasNonVanzareService
    })
    
    return filteredGroups
  }, [itemsForCalculations, state.instruments, state.services, state.selectedQuote])

  const distinctInstrumentsInTray = useMemo(() => {
    const instrumentIds = new Set<string>()
    const result: Array<{ id: string; name: string }> = []
    const itemsArray = Array.isArray(itemsForCalculations) ? itemsForCalculations : []
    itemsArray.forEach(item => {
      if (item && item.instrument_id && !instrumentIds.has(item.instrument_id)) {
        instrumentIds.add(item.instrument_id)
        const instrument = state.instruments.find(i => i.id === item.instrument_id)
        if (instrument) {
          result.push({ id: instrument.id, name: instrument.name })
        }
      }
    })
    return result
  }, [itemsForCalculations, state.instruments])

  /** Instrumente care nu au niciun item cu tăviță atribuită (pentru validare „Trimite tăvițele”). */
  const unassignedInstrumentNames = useMemo(() => {
    const items = Array.isArray(itemsForCalculations) ? itemsForCalculations : []
    const quoteIds = new Set((state.quotes || []).map((q: any) => q?.id).filter(Boolean))
    const byInstrument = new Map<string, boolean>()
    for (const it of items) {
      const iid = it?.instrument_id || ''
      if (!iid) continue
      const hasTray = !!it.tray_id && quoteIds.has(it.tray_id)
      if (!byInstrument.has(iid)) byInstrument.set(iid, false)
      if (hasTray) byInstrument.set(iid, true)
    }
    const names: string[] = []
    for (const [iid, hasTray] of byInstrument) {
      if (!hasTray) {
        const inst = state.instruments.find((i: any) => i?.id === iid)
        names.push(inst?.name || 'Instrument necunoscut')
      }
    }
    return names
  }, [itemsForCalculations, state.quotes, state.instruments])

  /** Motivul pentru care butonul „Trimite tăvițele” este inactiv (folosit la hover). */
  const { sendTraysDisabled, sendTraysDisabledReason } = useMemo(() => {
    const items = Array.isArray(itemsForCalculations) ? itemsForCalculations : []
    const quotes = Array.isArray(state.quotes) ? state.quotes : []
    const hasNonVanzareTray = quotes.some((q: any) => q?.number && q.number.trim() !== '' && !isVanzareTray(q.number))
    const names = (viewUnassignedNames.length > 0 ? viewUnassignedNames : unassignedInstrumentNames) || []

    // Nicio tăviță reală dar avem instrumente sau instrumente fără tăviță
    if (!hasNonVanzareTray && (items.length > 0 || names.length > 0)) {
      return {
        sendTraysDisabled: true,
        sendTraysDisabledReason: 'Nu există nicio tăviță. Adaugă tăvițe și atribuie instrumentele înainte de expediere.',
      }
    }

    // Avem tăvițe, dar există instrumente fără tăviță atribuită
    if (names.length > 0) {
      const list = names.slice(0, 5).join(', ')
      const more = names.length > 5 ? ` și încă ${names.length - 5}` : ''
      const reason =
        names.length === 1
          ? `Tăvițele nu pot fi expediate. Există instrumentul ${names[0]} care nu are tăviță atribuită.`
          : `Tăvițele nu pot fi expediate. Există instrumente fără tăviță atribuită: ${list}${more}.`
      return {
        sendTraysDisabled: true,
        sendTraysDisabledReason: reason,
      }
    }

    return { sendTraysDisabled: false, sendTraysDisabledReason: '' }
  }, [itemsForCalculations, state.quotes, viewUnassignedNames, unassignedInstrumentNames])

  const isReparatiiInstrument = useMemo(() => {
    if (!state.instrumentForm.instrument) return false
    const instrument = state.instruments.find(i => i.id === state.instrumentForm.instrument)
    if (!instrument || !instrument.department_id) return false
    const department = state.departments.find(d => d.id === instrument.department_id)
    return department?.name.toLowerCase().includes('reparatii') || false
  }, [state.instrumentForm.instrument, state.instruments, state.departments])
  
  // Hook-uri pentru data loading
  usePreturiDataLoader({
    leadId,
    fisaId,
    initialQuoteId,
    pipelineSlug,
    isDepartmentPipeline,
    setLoading: state.setLoading,
    setServices: state.setServices,
    setParts: state.setParts,
    setInstruments: state.setInstruments,
    setQuotes: state.setQuotes,
    setSelectedQuoteId: state.setSelectedQuoteId,
    setV4InitialData: state.setV4InitialData,
    setPipelines: state.setPipelines,
    setPipelinesWithIds: state.setPipelinesWithIds,
    setPipeLoading: state.setPipeLoading,
    setDepartments: state.setDepartments,
    setTechnicians: state.setTechnicians,
  })
  
  // Hook-uri pentru calculations (pentru recalcAllSheetsTotal)
  const calculations = usePreturiCalculations({
    services: state.services,
    instruments: state.instruments,
    pipelinesWithIds: state.pipelinesWithIds,
    subscriptionType: state.subscriptionType,
    setAllSheetsTotal: state.setAllSheetsTotal,
  })
  
  // Hook-uri pentru form operations (pentru populateInstrumentFormFromItems)
  const formOperations = usePreturiFormOperations({
    instrumentForm: state.instrumentForm,
    svc: state.svc,
    part: state.part,
    items: itemsForCalculations,
    instrumentSettings: state.instrumentSettings,
    services: state.services,
    instruments: state.instruments,
    departments: state.departments,
    setInstrumentForm: state.setInstrumentForm,
    setSvc: state.setSvc,
    setPart: state.setPart,
    setServiceSearchQuery: state.setServiceSearchQuery,
    setServiceSearchFocused: state.setServiceSearchFocused,
    setPartSearchQuery: state.setPartSearchQuery,
    setPartSearchFocused: state.setPartSearchFocused,
    setIsDirty: state.setIsDirty,
    setInstrumentSettings: state.setInstrumentSettings,
  })
  
  // Hook-uri pentru business logic
  const business = usePreturiBusiness({
    leadId,
    fisaId,
    serviceFileNumber,
    selectedQuoteId: state.selectedQuoteId,
    selectedQuote: state.selectedQuote,
    quotes: state.quotes,
    items: state.items,
    services: state.services,
    parts: state.parts,
    instruments: state.instruments,
    departments: state.departments,
    pipelinesWithIds: state.pipelinesWithIds,
    user,
    isDepartmentPipeline,
    isVanzariPipeline: pipeline.isVanzariPipeline,
    isReceptiePipeline: pipeline.isReceptiePipeline,
    isCurierPipeline: pipelineSlug?.toLowerCase().includes('curier') || false,
    subscriptionType: state.subscriptionType,
    trayImages: state.trayImages,
    instrumentForm: state.instrumentForm,
    svc: state.svc,
    part: state.part,
    instrumentSettings: state.instrumentSettings,
    urgentAllServices: state.urgentAllServices,
    trayDetails: state.trayDetails,
    paymentCash: state.paymentCash,
    paymentCard: state.paymentCard,
    officeDirect: state.officeDirect,
    curierTrimis: state.curierTrimis,
    curierScheduledAt: state.curierScheduledAt,
    retur: state.retur,
    isVanzator: isVanzatorMode,
    vanzariPipelineId: state.vanzariPipelineId,
    vanzariStages: state.vanzariStages,
    lead: (leadProp as any) || null,
    isCash: state.isCash,
    isCard: state.isCard,
    subtotal: subtotal,
    totalDiscount: totalDiscount,
    urgentAmount: urgentAmount,
    total: total,
    setItems: state.setItems,
    setIsDirty: state.setIsDirty,
    setSvc: state.setSvc,
    setInstrumentForm: state.setInstrumentForm,
    setPart: state.setPart,
    setServiceSearchQuery: state.setServiceSearchQuery,
    setServiceSearchFocused: state.setServiceSearchFocused,
    setPartSearchQuery: state.setPartSearchQuery,
    setPartSearchFocused: state.setPartSearchFocused,
    setInstrumentSettings: state.setInstrumentSettings,
    setTrayImages: state.setTrayImages,
    setAssignedImageId: state.setAssignedImageId,
    setUploadingImage: state.setUploadingImage,
    setAllSheetsTotal: state.setAllSheetsTotal,
    setUrgentAllServices: state.setUrgentAllServices,
    setPipelines: state.setPipelines,
    setPipelinesWithIds: state.setPipelinesWithIds,
    setDepartments: state.setDepartments,
    setPipeLoading: state.setPipeLoading,
    setLoading: state.setLoading,
    setQuotes: state.setQuotes,
    setSelectedQuoteId: state.setSelectedQuoteId,
    setCreatingTray: state.setCreatingTray,
    setUpdatingTray: state.setUpdatingTray,
    setDeletingTray: state.setDeletingTray,
    setMovingInstrument: state.setMovingInstrument,
    setSendingTrays: state.setSendingTrays,
    setShowCreateTrayDialog: state.setShowCreateTrayDialog,
    setShowEditTrayDialog: state.setShowEditTrayDialog,
    setShowMoveInstrumentDialog: state.setShowMoveInstrumentDialog,
    setShowSendConfirmation: state.setShowSendConfirmation,
    setShowDeleteTrayConfirmation: state.setShowDeleteTrayConfirmation,
    setTrayToDelete: state.setTrayToDelete,
    setTraysAlreadyInDepartments: state.setTraysAlreadyInDepartments,
    setNewTrayNumber: state.setNewTrayNumber,
    setEditingTrayNumber: state.setEditingTrayNumber,
    setInstrumentToMove: state.setInstrumentToMove,
    setTargetTrayId: state.setTargetTrayId,
    setOfficeDirect: state.setOfficeDirect,
    setCurierTrimis: state.setCurierTrimis,
    setCurierScheduledAt: state.setCurierScheduledAt,
    setRetur: state.setRetur,
    setNuRaspundeCallbackAt: state.setNuRaspundeCallbackAt,
    setIsServiceFileLocked: state.setIsServiceFileLocked,
    setServiceFileStatus: state.setServiceFileStatus,
    globalDiscountPct: state.globalDiscountPct,
    newTrayNumber: state.newTrayNumber,
    editingTrayNumber: state.editingTrayNumber,
    trayToDelete: state.trayToDelete,
    instrumentToMove: state.instrumentToMove,
    targetTrayId: state.targetTrayId,
    recalcAllSheetsTotal: calculations.recalcAllSheetsTotal,
    populateInstrumentFormFromItems: formOperations.populateInstrumentFormFromItems,
    setSaving: state.setSaving,
  })
  
  // Încarcă items-urile când se selectează o tăviță
  useEffect(() => {
    if (!state.selectedQuoteId || state.loading) return
    
    let isMounted = true
    
    const loadItems = async () => {
      try {
        const loadedItems = await listQuoteItems(
          state.selectedQuoteId!,
          state.services,
          state.instruments,
          state.pipelinesWithIds
        )
        
        if (!isMounted) return
        
        // Actualizează items-urile - forțează update pentru a include items noi
        state.setItems(loadedItems)
        
        // IMPORTANT: Inițializează snapshot-ul când se încarcă items-urile pentru prima dată
        // Asta previne ștergerea items-urilor existente când se salvează
        // Folosim setTimeout pentru a ne asigura că business este disponibil
        setTimeout(() => {
          if (loadedItems.length > 0 && business?.initializeSnapshot) {
            business.initializeSnapshot(loadedItems)
          }
        }, 0)
      } catch (error) {
        console.error('Error loading items for tray:', error)
        if (isMounted) {
          state.setItems([])
        }
      }
    }
    
    loadItems()
    
    return () => {
      isMounted = false
    }
  }, [state.selectedQuoteId, state.services, state.instruments, state.pipelinesWithIds, state.loading, state.setItems, state.itemsRefreshKey])
  
  // Funcție pentru salvarea discountului global în DB când se modifică
  const handleGlobalDiscountChange = useCallback(async (value: number) => {
    // Actualizează state-ul local imediat pentru UI responsiv
    state.setGlobalDiscountPct(value)
    
    // Salvează în baza de date
    if (fisaId) {
      try {
        const { error } = await updateServiceFileWithHistory(fisaId, { 
          global_discount_pct: value 
        })
        if (error) {
          console.error('[PreturiMain] Eroare la salvarea discountului global:', error)
        } else {
          console.log('[PreturiMain] Discount global salvat:', value)
        }
      } catch (error) {
        console.error('[PreturiMain] Eroare la salvarea discountului global:', error)
      }
    }
  }, [fisaId, state.setGlobalDiscountPct])

  // [OWNER-ONLY] Buton temporar: setează status fișă la "comanda". DE ELIMINAT mai târziu.
  const onSetStatusComanda = useCallback(async () => {
    if (!fisaId) return
    try {
      const { error } = await updateServiceFileWithHistory(fisaId, { status: 'comanda' })
      if (error) throw error
      state.setServiceFileStatus('comanda')
      toast.success('Status setat la Comandă')
    } catch (e: any) {
      console.error('[PreturiMain] Eroare la setarea status comanda:', e)
      toast.error('Eroare la setarea statusului')
    }
  }, [fisaId, state.setServiceFileStatus])

  // Facturare: status 'facturata' + mutare în Ridic Personal (Facturare) sau De Trimis (Facturare+AWB).
  // Doar din stage "De Facturat"; la alegere: Facturare → Ridic Personal, Facturare+AWB → De Trimis.
  const onFacturare = useCallback(
    async (mode: FacturareMode) => {
      if (!fisaId) return
      const receptie = state.pipelinesWithIds.find(
        p => (p.name || '').toLowerCase().includes('receptie')
      )
      if (!receptie) {
        toast.error('Pipeline Recepție negăsit.')
        return
      }
      try {
        const { error: statusErr } = await updateServiceFileWithHistory(fisaId, { status: 'facturata' })
        if (statusErr) throw statusErr
        state.setServiceFileStatus('facturata')

        const { data: stages, error: stagesErr } = await fetchStagesForPipeline(receptie.id)
        if (stagesErr || !stages?.length) {
          toast.error('Nu s-au putut încărca stage-urile Recepție.')
          return
        }
        const norm = (s: string) =>
          (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
        const deTrimis = stages.find(s => norm(s.name).includes('de trimis'))
        const ridicPersonal = stages.find(s => norm(s.name).includes('ridic personal'))

        const target = mode === 'facturare_awb' ? deTrimis : ridicPersonal
        const stageLabel = mode === 'facturare_awb' ? 'De trimis' : 'Ridic personal'
        if (!target) {
          toast.error(`Stage "${stageLabel}" negăsit în Recepție.`)
          return
        }

        const { error: addErr } = await addServiceFileToPipeline(fisaId, receptie.id, target.id)
        if (addErr) throw addErr

        const { success: clearOk, error: clearErr } = await clearTrayPositionsOnFacturare(fisaId)
        if (!clearOk && clearErr) {
          console.error('[PreturiMain] Ștergere poziții tăvițe la facturare:', clearErr)
          toast.error('Fișa a fost facturată, dar nu s-au putut șterge pozițiile tăvițelor.')
        }

        toast.success(
          mode === 'facturare_awb'
            ? 'Fișă facturată. Card mutat în De trimis.'
            : 'Fișă facturată. Card mutat în Ridic personal.'
        )
        onAfterFacturare?.()
        if (leadId) {
          try {
            const { moved } = await tryMoveLeadToArhivatIfAllFacturate(leadId)
            if (moved) toast.success('Toate fișele sunt facturate. Lead mutat în Arhivat (Vânzări).')
          } catch (_) {}
        }
      } catch (e: any) {
        console.error('[PreturiMain] Eroare la facturare:', e)
        toast.error(e?.message || 'Eroare la facturare.')
      }
    },
    [fisaId, leadId, state.pipelinesWithIds, state.setServiceFileStatus, onAfterFacturare]
  )

  // Validare QC direct din Recepție – doar pentru administratori
  const onValidateTrayQc = useCallback(
    async (trayId: string) => {
      const receptie = state.pipelinesWithIds.find(
        (p) => (p?.name || '').toLowerCase().includes('receptie')
      )
      if (!receptie) {
        toast.error('Pipeline Recepție negăsit.')
        return
      }
      try {
        await updateTray(trayId, { qc_notes: null }).catch((e) =>
          console.warn('[onValidateTrayQc] updateTray:', e)
        )
        await logItemEvent(
          'tray',
          trayId,
          'QC: tăvița a fost validată (din Recepție)',
          'quality_validated',
          {
            sourcePipelineId: receptie.id,
            sourcePipelineName: receptie.name || 'Recepție',
          }
        )
        toast.success('Tăvița a fost validată (QC).')
        state.setItemsRefreshKey?.((k) => (k ?? 0) + 1)
      } catch (e: any) {
        console.error('[onValidateTrayQc]', e)
        toast.error(e?.message || 'Nu s-a putut valida tăvița.')
      }
    },
    [state.pipelinesWithIds, state.setItemsRefreshKey]
  )

  // Hook-uri pentru effects
  usePreturiEffects({
    leadId,
    fisaId,
    selectedQuoteId: state.selectedQuoteId,
    isVanzariPipeline: pipeline.isVanzariPipeline,
    isReceptiePipeline: pipeline.isReceptiePipeline,
    pipelinesWithIds: state.pipelinesWithIds,
    isCommercialPipeline: pipeline.isCommercialPipeline,
    initialServiceFileStage,
    setUrgentTagId: state.setUrgentTagId,
    setInstrumentForm: state.setInstrumentForm,
    setInstrumentSettings: state.setInstrumentSettings,
    setUrgentAllServices: state.setUrgentAllServices,
    setSubscriptionType: state.setSubscriptionType,
    setCurrentServiceFileStage: state.setCurrentServiceFileStage,
    setTrayDetails: state.setTrayDetails,
    setLoadingTrayDetails: state.setLoadingTrayDetails,
    setItems: state.setItems,
    setTrayImages: state.setTrayImages,
    setAssignedImageId: state.setAssignedImageId,
    setIsDirty: state.setIsDirty,
    setOfficeDirect: state.setOfficeDirect,
    setCurierTrimis: state.setCurierTrimis,
    setCurierScheduledAt: state.setCurierScheduledAt,
    setGlobalDiscountPct: state.setGlobalDiscountPct,
    setIsServiceFileLocked: state.setIsServiceFileLocked,
    setServiceFileStatus: state.setServiceFileStatus,
    setPaymentCash: state.setPaymentCash,
    setPaymentCard: state.setPaymentCard,
    svc: state.svc,
    instrumentForm: state.instrumentForm,
    instrumentSettings: state.instrumentSettings,
    urgentAllServices: state.urgentAllServices,
    items: state.items,
    urgentTagId: state.urgentTagId,
  })
  
  // Expose ref methods
  useImperativeHandle(ref, () => ({
    save: async () => {
      await business.saveAllAndLog()
      onAfterSave?.()
    },
    getSelectedTrayId: () => state.selectedQuoteId,
    getQuotes: () => state.quotes,
    getSelectedQuoteId: () => state.selectedQuoteId,
    getIsVanzatorMode: () => isVanzatorMode,
    getSendingTrays: () => state.sendingTrays,
    getTraysAlreadyInDepartments: () => state.traysAlreadyInDepartments,
    getOnTraySelect: () => business.onTraySelect,
    getOnAddTray: () => business.onAddTray,
    getOnDeleteTray: () => business.onDeleteTray,
    getOnSendTrays: () => business.onSendTrays,
    openBillingDialog: () => setShowBillingDialog(true),
  }), [business.saveAllAndLog, onAfterSave, state.selectedQuoteId, state.quotes, isVanzatorMode, state.sendingTrays, state.traysAlreadyInDepartments, business.onTraySelect, business.onAddTray, business.onDeleteTray, business.onSendTrays])
  
  return (
    <>
    <PreturiOrchestrator
      // Pipeline checks
      isVanzariPipeline={pipeline.isVanzariPipeline}
      isReceptiePipeline={pipeline.isReceptiePipeline}
      isDepartmentPipeline={isDepartmentPipeline}
      isVanzatorMode={isVanzatorMode}
      isCommercialPipeline={pipeline.isCommercialPipeline}
      isOwner={isOwner}
      isAdmin={isAdmin}
      onTechnicianChange={business.onTechnicianChange}
      onSetStatusComanda={fisaId ? onSetStatusComanda : undefined}
      onValidateTrayQc={pipeline.isReceptiePipeline && isAdmin ? onValidateTrayQc : undefined}
      // Data
      leadId={leadId}
      lead={leadProp || null}
      quotes={state.quotes}
      selectedQuoteId={state.selectedQuoteId}
      selectedQuote={state.selectedQuote}
      items={displayItems}
      fisaId={fisaId}
      services={state.services}
      parts={state.parts}
      instruments={state.instruments}
      departments={state.departments}
      technicians={state.technicians}
      pipelinesWithIds={state.pipelinesWithIds}
      trayImages={state.trayImages}
      assignedImageId={state.assignedImageId}
      canAssignTrayImage={(pipeline.isReceptiePipeline || pipeline.isDepartmentPipeline) && pipeline.canViewTrayImages}
      
      // State
      loading={state.loading}
      saving={state.saving}
      isDirty={state.isDirty}
      urgentAllServices={state.urgentAllServices}
      subscriptionType={state.subscriptionType}
      trayDetails={state.trayDetails}
      loadingTrayDetails={state.loadingTrayDetails}
      officeDirect={state.officeDirect}
      curierTrimis={state.curierTrimis}
      retur={state.retur}
      paymentCash={state.paymentCash}
      paymentCard={state.paymentCard}
      isServiceFileLocked={state.isServiceFileLocked}
      serviceFileStatus={state.serviceFileStatus}
      noDeal={state.noDeal}
      nuRaspunde={state.nuRaspunde}
      nuRaspundeCallbackAt={state.nuRaspundeCallbackAt}
      callBack={state.callBack}
      allSheetsTotal={state.allSheetsTotal}
      
      // Form states
      instrumentForm={state.instrumentForm}
      svc={state.svc}
      part={state.part}
      serviceSearchQuery={state.serviceSearchQuery}
      serviceSearchFocused={state.serviceSearchFocused}
      partSearchQuery={state.partSearchQuery}
      partSearchFocused={state.partSearchFocused}
      instrumentSettings={state.instrumentSettings}
      
      // UI states
      showCreateTrayDialog={state.showCreateTrayDialog}
      showEditTrayDialog={state.showEditTrayDialog}
      showMoveInstrumentDialog={state.showMoveInstrumentDialog}
      showDeleteTrayConfirmation={state.showDeleteTrayConfirmation}
      showSendConfirmation={state.showSendConfirmation}
      creatingTray={state.creatingTray}
      updatingTray={state.updatingTray}
      movingInstrument={state.movingInstrument}
      deletingTray={state.deletingTray}
      sendingTrays={state.sendingTrays}
      uploadingImage={state.uploadingImage}
      isImagesExpanded={state.isImagesExpanded}
      newTrayNumber={state.newTrayNumber}
      editingTrayNumber={state.editingTrayNumber}
      trayToDelete={state.trayToDelete}
      instrumentToMove={state.instrumentToMove}
      targetTrayId={state.targetTrayId}
      currentServiceFileStage={state.currentServiceFileStage}
      traysAlreadyInDepartments={state.traysAlreadyInDepartments}
      v4InitialData={state.v4InitialData}
      
      // Computed
      availableInstruments={availableInstruments}
      availableServices={availableServices}
      currentInstrumentId={currentInstrumentId}
      hasServicesOrInstrumentInSheet={hasServicesOrInstrumentInSheet}
      isTechnician={state.isTechnician}
      isReparatiiPipeline={pipeline.isReparatiiPipeline}
      canAddParts={pipeline.canAddParts}
      canEditUrgentAndSubscription={pipeline.canEditUrgentAndSubscription}
      canAddTrayImages={pipeline.canAddTrayImages}
      canViewTrayImages={pipeline.canViewTrayImages}
      undefinedTray={undefinedTray}
      instrumentsGrouped={instrumentsGrouped}
      distinctInstrumentsInTray={distinctInstrumentsInTray}
      
      // Totals
      subtotal={subtotal}
      totalDiscount={totalDiscount}
      total={total}
      
      // Global discount
      globalDiscountPct={state.globalDiscountPct}
      onGlobalDiscountChange={handleGlobalDiscountChange}
      
      // Callbacks
      onTraySelect={state.setSelectedQuoteId}
      onAddTray={business.onAddSheet}
      setQuotes={state.setQuotes}
      setSelectedQuoteId={state.setSelectedQuoteId}
      onDeleteTray={(trayId) => {
        state.setTrayToDelete(trayId)
        state.setShowDeleteTrayConfirmation(true)
      }}
      onEditTray={business.onEditTray}
      onSendTrays={() => {
        const items = Array.isArray(itemsForCalculations) ? itemsForCalculations : []
        const noTrays = (state.quotes || []).length === 0
        const names = viewUnassignedNames.length > 0 ? viewUnassignedNames : unassignedInstrumentNames
        if (noTrays && (items.length > 0 || viewUnassignedNames.length > 0)) {
          toast.error('Nu există nici o tăviță. Adăugați tăvițe și atribuiți instrumentele înainte de expediere.')
          return
        }
        if (names.length > 0) {
          const list = names.slice(0, 5).join(', ')
          const more = names.length > 5 ? ` și încă ${names.length - 5}` : ''
          const msg = names.length === 1
            ? `Tăvițele nu pot fi expediate. Există instrumentul ${names[0]} care nu are tăviță atribuită.`
            : `Tăvițele nu pot fi expediate. Există instrumente fără tăviță atribuită: ${list}${more}.`
          toast.error(msg)
          return
        }
        state.setShowSendConfirmation(true)
      }}
      sendTraysDisabled={sendTraysDisabled}
      sendTraysDisabledReason={sendTraysDisabledReason || undefined}
      getV4DataRef={getV4DataRef}
      onSendTraysValidityChange={setViewUnassignedNames}
      onPrintTrays={() => setShowPrintTraysDialog(true)}
      onUrgentChange={async (checked: boolean) => business.handleUrgentChange(checked)}
      showUrgentareButton={showUrgentareButton}
      isUrgentare={isUrgentare}
      isUrgentaring={isUrgentaring}
      onUrgentareClick={onUrgentareClick}
      onSubscriptionChange={state.setSubscriptionType}
      onOfficeDirectChange={business.handleDeliveryCheckboxChange}
      onCurierTrimisChange={business.handleCurierTrimisChange}
      onReturChange={business.handleReturChange}
      onPaymentCashChange={state.setPaymentCash}
      onPaymentCardChange={state.setPaymentCard}
      onNoDealChange={business.handleNoDealChange}
      onNuRaspundeChange={business.handleNuRaspundeChange}
      onCallBackChange={business.handleCallBackChange}
      onSave={async (v4Data) => {
        await business.saveAllAndLog(v4Data)
        if (fisaId) clearReceptieDraft(fisaId)
        onAfterSave?.()
      }}
      onSaveOptionsOnly={business.saveOptionsOnly ? async () => {
        await business.saveOptionsOnly!()
        onAfterSave?.()
      } : undefined}
      onPrint={() => setShowBillingDialog(true)}
      onFacturare={pipeline.isReceptiePipeline && fisaId ? onFacturare : undefined}
      onInstrumentChange={business.onInstrumentChange}
      onInstrumentDoubleClick={business.onInstrumentDoubleClick}
      onQtyChange={business.onQtyChange}
      onServiceSearchChange={state.setServiceSearchQuery}
      onServiceSearchFocus={() => state.setServiceSearchFocused(true)}
      onServiceSearchBlur={() => setTimeout(() => state.setServiceSearchFocused(false), 200)}
      onServiceSelect={business.onServiceSelect}
      onServiceDoubleClick={business.onServiceDoubleClick}
      onSvcQtyChange={(qty) => state.setSvc(s => ({ ...s, qty }))}
      onSvcDiscountChange={(discount) => state.setSvc(s => ({ ...s, discount }))}
      onAddService={business.onAddService}
      onPartSearchChange={state.setPartSearchQuery}
      onPartSearchFocus={() => state.setPartSearchFocused(true)}
      onPartSearchBlur={() => setTimeout(() => state.setPartSearchFocused(false), 200)}
      onPartSelect={business.onPartSelect}
      onPartDoubleClick={business.onPartDoubleClick}
      onPartQtyChange={(qty) => state.setPart(p => ({ ...p, qty }))}
      onSerialNumberChange={(serialNumberId) => state.setPart(p => ({ ...p, serialNumberId }))}
      onAddPart={business.onAddPart}
      onUpdateItem={business.onUpdateItem}
      onDelete={business.onDelete}
      onDetailsChange={state.setTrayDetails}
      onImageUpload={business.handleTrayImageUpload}
      onImageDelete={business.handleTrayImageDelete}
      onDownloadAllImages={business.handleDownloadAllImages}
      onToggleImagesExpanded={() => state.setIsImagesExpanded(!state.isImagesExpanded)}
      onAssignTrayImage={business.handleAssignTrayImage}
      onMoveInstrument={(instrumentGroup) => {
        // IMPORTANT: Curățăm obiectul pentru a evita referințe circulare
        // Extragem doar datele primitive necesare
        try {
          const cleanedGroup = {
            instrument: {
              id: typeof instrumentGroup.instrument?.id === 'string' ? instrumentGroup.instrument.id : String(instrumentGroup.instrument?.id || ''),
              name: typeof instrumentGroup.instrument?.name === 'string' ? instrumentGroup.instrument.name : String(instrumentGroup.instrument?.name || '')
            },
            items: Array.isArray(instrumentGroup.items) ? instrumentGroup.items.map((item: any) => {
              // Extragem doar proprietățile primitive din fiecare item
              const cleanedItem: any = {
                id: typeof item.id === 'string' ? item.id : String(item.id || ''),
                tray_id: typeof item.tray_id === 'string' ? item.tray_id : String(item.tray_id || ''),
                item_type: item.item_type || null,
                service_id: item.service_id || null,
                part_id: item.part_id || null,
                instrument_id: item.instrument_id || null,
                qty: typeof item.qty === 'number' ? item.qty : (typeof item.qty === 'string' ? parseFloat(item.qty) : 1),
                price: typeof item.price === 'number' ? item.price : (typeof item.price === 'string' ? parseFloat(item.price) : 0),
                name_snapshot: typeof item.name_snapshot === 'string' ? item.name_snapshot : '',
                urgent: Boolean(item.urgent),
              }
              
              // Curățăm brand_groups dacă există
              if (Array.isArray(item.brand_groups)) {
                cleanedItem.brand_groups = item.brand_groups.map((bg: any) => ({
                  id: typeof bg.id === 'string' ? bg.id : String(bg.id || ''),
                  brand: typeof bg.brand === 'string' ? bg.brand : String(bg.brand || ''),
                  serialNumbers: Array.isArray(bg.serialNumbers) 
                    ? bg.serialNumbers.map((sn: any) => typeof sn === 'string' ? sn : String(sn || ''))
                    : [],
                  garantie: Boolean(bg.garantie)
                }))
              } else {
                cleanedItem.brand_groups = []
              }
              
              return cleanedItem
            }) : []
          }
          
          state.setInstrumentToMove(cleanedGroup)
          state.setShowMoveInstrumentDialog(true)
        } catch (err) {
          console.error('Eroare la curățarea instrumentGroup:', err)
          toast.error('Eroare la pregătirea mutării instrumentului')
          // Dacă curățarea eșuează, încercăm să setăm doar structura minimă și să deschidem dialogul
          state.setInstrumentToMove({
            instrument: { 
              id: instrumentGroup.instrument?.id || '', 
              name: instrumentGroup.instrument?.name || 'Instrument' 
            },
            items: []
          })
          state.setShowMoveInstrumentDialog(true)
        }
      }}
      onMoveInstrumentToTray={(group, trayId) => business.handleMoveInstrumentToTray(trayId, group)}
      onMoveInstrumentToNewTray={(group, number) => business.handleMoveInstrumentToNewTray(group, number)}
      onAddBrandSerialGroup={business.onAddBrandSerialGroup}
      onRemoveBrandSerialGroup={business.onRemoveBrandSerialGroup}
      onUpdateBrand={business.onUpdateBrand}
      onUpdateBrandQty={business.onUpdateBrandQty}
      onUpdateSerialNumber={business.onUpdateSerialNumber}
      onAddSerialNumber={business.onAddSerialNumber}
      onRemoveSerialNumber={business.onRemoveSerialNumber}
      onUpdateSerialGarantie={business.onUpdateSerialGarantie}
      setIsDirty={state.setIsDirty}
      onCreateTray={business.handleCreateTray}
      onCreateTrayInline={(num) => business.handleCreateTray({ number: num })}
      onUpdateTray={business.handleUpdateTray}
      onEditTrayInline={business.handleEditTrayInline}
      onMoveInstrumentConfirm={business.handleMoveInstrumentToTray}
      onNewTrayNumberChange={state.setNewTrayNumber}
      onEditingTrayNumberChange={state.setEditingTrayNumber}
      onTargetTrayChange={state.setTargetTrayId}
      onCancelCreateTray={() => {
        state.setShowCreateTrayDialog(false)
        state.setNewTrayNumber('')
      }}
      onCancelEditTray={() => {
        state.setShowEditTrayDialog(false)
        state.setEditingTrayNumber('')
      }}
      onCancelMoveInstrument={() => {
        state.setShowMoveInstrumentDialog(false)
        state.setInstrumentToMove(null)
        state.setTargetTrayId('')
        state.setNewTrayNumber('')
      }}
      onConfirmDeleteTray={business.handleDeleteTray}
      onCancelDeleteTray={() => {
        state.setShowDeleteTrayConfirmation(false)
        state.setTrayToDelete(null)
      }}
      onConfirmSendTrays={async () => {
        const v4Data = getV4DataRef.current?.() ?? undefined
        await business.saveAllAndLog(v4Data)
        if (fisaId) clearReceptieDraft(fisaId)
        onAfterSave?.()
        await business.sendAllTraysToPipeline()
        onAfterSendTrays?.()
      }}
      onCancelSendTrays={() => state.setShowSendConfirmation(false)}
      onClose={onClose}
// -------------------------------------------------- COD PENTRU POPULARE CASETE -----------------------------------------------------
      onRowClick={(item) => {
        // ═══════════════════════════════════════════════════════════════════
        // LOGICĂ CLARĂ: Click pe rând → Populează formulare cu datele rândului
        // ═══════════════════════════════════════════════════════════════════
        
        if (!item) return
        
        // STEP 1: Salvează starea curentă pentru UNDO
        state.setPreviousFormState({
          instrumentForm: { ...state.instrumentForm },
          svc: { ...state.svc },
          part: { ...state.part },
          serviceSearchQuery: state.serviceSearchQuery,
          partSearchQuery: state.partSearchQuery
        })
        
        // STEP 2: Extrage datele din înregistrare
        const instrumentId = item.instrument_id || ''
        const qty = String(item.qty || 1)
        
        // STEP 3: Construiește brandSerialGroups
        // Format: [{brand, serialNumbers: [{serial, garantie}], qty}]
        let brandSerialGroups: any[] = []
        
        if (item.brand_groups && Array.isArray(item.brand_groups) && item.brand_groups.length > 0) {
          // Format NOU: brand_groups din DB
          brandSerialGroups = item.brand_groups.map((bg: any) => ({
            brand: bg.brand || '',
            serialNumbers: Array.isArray(bg.serialNumbers) 
              ? bg.serialNumbers.map((sn: any) => 
                  typeof sn === 'string' 
                    ? { serial: sn, garantie: false }
                    : { serial: sn?.serial || '', garantie: sn?.garantie || false }
                )
              : [],
            qty: bg.qty || '1'
          }))
        } else if (item.brand || item.serial_number) {
          // Format VECHI: brand + serial_number simple
          brandSerialGroups = [{
            brand: item.brand || '',
            serialNumbers: item.serial_number 
              ? [{ serial: item.serial_number, garantie: false }]
              : [],
            qty: '1'
          }]
        } else {
          // NIMIC: Grup gol default
          brandSerialGroups = [{
            brand: '',
            serialNumbers: [],
            qty: '1'
          }]
        }
        
        // STEP 4: Populează INSTRUMENT FORM (înlocuiește complet)
        state.setInstrumentForm({
          instrument: instrumentId,
          qty: qty,
          brandSerialGroups: brandSerialGroups
        })
        
        // STEP 5: Populează SERVICIU (doar dacă există și e valid)
        if (item.item_type === 'service' && item.service_id) {
          const serviceExists = state.services.find(s => s.id === item.service_id)
          if (serviceExists) {
            // Serviciul există în listă - populează
            // IMPORTANT: Reține ID-ul înregistrării selectate pentru actualizare
            state.setSvc({
              instrumentId: instrumentId,
              id: item.service_id,
              qty: qty,
              discount: String(item.discount_pct || 0),
              urgent: false,
              technicianId: '',
              pipelineId: '',
              serialNumberId: '',
              selectedBrands: [],
              editingItemId: item.id // IMPORTANT: Reține ID-ul înregistrării pentru actualizare
            })
            state.setServiceSearchQuery(serviceExists.name || item.name_snapshot || '')
          }
          // Dacă serviciul NU există în listă → SKIP (nu populez)
        } else {
          // Nu e serviciu → resetează formularul de serviciu DAR păstrează instrumentId pentru sincronizare
          state.setSvc({
            instrumentId: instrumentId,  // IMPORTANT: Păstrează instrumentId pentru a evita suprascrierea de useEffect
            id: '',
            qty: qty,
            discount: '0',
            urgent: false,
            technicianId: '',
            pipelineId: '',
            serialNumberId: '',
            selectedBrands: []
          })
          state.setServiceSearchQuery('')
        }
        
        // STEP 6: Populează PIESE (doar dacă există și e valid)
        if (item.item_type === 'part' && item.part_id) {
          const partExists = state.parts.find(p => p.id === item.part_id)
          if (partExists) {
            // Piesa există în listă - populează
            state.setPart({
              id: item.part_id,
              overridePrice: String(item.price || ''),
              qty: qty,
              discount: String(item.discount_pct || 0),
              urgent: false,
              serialNumberId: ''
            })
            state.setPartSearchQuery(partExists.name || item.name_snapshot || '')
          }
          // Dacă piesa NU există în listă → SKIP (nu populez)
        } else {
          // Nu e piesă → resetează formularul de piese
          state.setPart({
            id: '',
            overridePrice: '',
            qty: '1',
            discount: '0',
            urgent: false,
            serialNumberId: ''
          })
          state.setPartSearchQuery('')
        }
        
        // STEP 7: Toast informativ
        toast.info('Date încărcate pentru editare. Apasă Undo pentru a anula.')
      }}
      onUndo={() => {
        // ═══════════════════════════════════════════════════════════════════
        // UNDO: Restaurează starea anterioară a formularelor
        // ═══════════════════════════════════════════════════════════════════
        
        if (!state.previousFormState) {
          toast.warning('Nu există date anterioare pentru a fi restaurate.')
          return
        }
        
        // Restaurează toate formularele
        state.setInstrumentForm(state.previousFormState.instrumentForm)
        state.setSvc(state.previousFormState.svc)
        state.setPart(state.previousFormState.part)
        state.setServiceSearchQuery(state.previousFormState.serviceSearchQuery)
        state.setPartSearchQuery(state.previousFormState.partSearchQuery)
        
        // Șterge starea anterioară
        state.setPreviousFormState(null)
        
        toast.success('Formularele au fost restaurate la starea anterioară.')
      }}
      previousFormState={state.previousFormState}
// -----------------------------------------------------------------------------------------------------------------------------------
      onClearForm={business.onClearForm}
      onRefreshItems={() => state.setItemsRefreshKey(k => k + 1)}
      onSplitTrayItemsToTechnician={business.handleSplitTrayItemsToTechnician as any}
      currentUserId={user?.id ?? ''}
      currentUserDisplayName={(user?.user_metadata as any)?.full_name ?? user?.email?.split('@')[0] ?? 'Eu'}
      onSplitTrayToRealTrays={business.handleSplitTrayToRealTrays as any}
      onBrandToggle={business.onBrandToggle}
      
      // Quick actions for department view
      onMarkInProgress={() => {
        // TODO: Implementare logică pentru "În lucru"
        // console.log('Marcat ca În lucru')
      }}
      onMarkComplete={() => {
        // TODO: Implementare logică pentru "Finalizare"
        // console.log('Marcat ca Finalizat')
      }}
      onMarkWaiting={() => {
        // TODO: Implementare logică pentru "În așteptare"
        // console.log('Marcat ca În așteptare')
      }}
      onSaveToHistory={async () => {
        await business.saveAllAndLog()
        onAfterSave?.()
      }}
    />

    {/* Dialog pentru facturare */}
    {lead && (
      <BillingDialog
        open={showBillingDialog}
        onOpenChange={setShowBillingDialog}
        lead={lead as Lead}
        quotes={state.quotes}
        allSheetsTotal={state.allSheetsTotal}
        urgentMarkupPct={URGENT_MARKUP_PCT}
        subscriptionType={state.subscriptionType}
        services={state.services}
        instruments={state.instruments}
        pipelinesWithIds={state.pipelinesWithIds}
        serviceFileNumber={serviceFileNumber}
        serviceFileId={fisaId || undefined}
        onSave={() => {
          // Refresh lead data after save if needed
        }}
      />
    )}

    {/* Dialog Print tăvițe – directPrint: se sare peste previzualizare, se deschide direct fereastra de print */}
    {lead && (
      <PrintTraysDialog
        open={showPrintTraysDialog}
        onOpenChange={setShowPrintTraysDialog}
        lead={lead as Lead}
        quotes={state.quotes}
        officeDirect={state.officeDirect}
        curierTrimis={state.curierTrimis}
        services={state.services}
        instruments={state.instruments}
        pipelinesWithIds={state.pipelinesWithIds}
        serviceFileNumber={serviceFileNumber}
        serviceFileId={fisaId || undefined}
        directPrint={true}
      />
    )}
    </>
  )
})

export default PreturiMain

