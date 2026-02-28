/**
 * Hook pentru gestionarea state-ului componentei Preturi
 */

import { useState, useMemo, useRef } from 'react'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Part } from '@/lib/supabase/partOperations'
import type { TrayImage } from '@/lib/supabase/imageOperations'
import type { LeadQuote, LeadQuoteItem } from '@/lib/types/preturi'

export function usePreturiState(initialQuoteId?: string | null) {
  // Loading state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Data state
  const [services, setServices] = useState<Service[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [instruments, setInstruments] = useState<Array<{ 
    id: string
    name: string
    weight: number
    department_id: string | null
    pipeline?: string | null
    repairable?: boolean
  }>>([])
  const [technicians, setTechnicians] = useState<Array<{ id: string; name: string }>>([])
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([])
  const [pipelines, setPipelines] = useState<string[]>([])
  const [pipelinesWithIds, setPipelinesWithIds] = useState<Array<{ id: string; name: string }>>([])
  const [pipeLoading, setPipeLoading] = useState(true)

  // Quotes (tăvițe) state
  const [quotes, setQuotes] = useState<LeadQuote[]>([])
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(initialQuoteId || null)
  const selectedQuote = useMemo(
    () => quotes.find(q => q.id === selectedQuoteId) ?? null,
    [quotes, selectedQuoteId]
  )

  // Items state
  const [items, setItems] = useState<LeadQuoteItem[]>([])
  const [allSheetsTotal, setAllSheetsTotal] = useState<number>(0)
  const [itemsRefreshKey, setItemsRefreshKey] = useState(0)

  // Tray images state
  const [trayImages, setTrayImages] = useState<TrayImage[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [isImagesExpanded, setIsImagesExpanded] = useState(false)
  /** Imagine reprezentativă pentru tăvița selectată (Recepție / departamente) */
  const [assignedImageId, setAssignedImageId] = useState<string | null>(null)

  // Tray details state (comentarii pentru fișa de serviciu)
  const [trayDetails, setTrayDetails] = useState('')
  const [loadingTrayDetails, setLoadingTrayDetails] = useState(false)
  const [savingTrayDetails, setSavingTrayDetails] = useState(false)

  // Payment state (legacy - pentru tăvițe)
  const [isCash, setIsCash] = useState(false)
  const [isCard, setIsCard] = useState(false)

  // Payment state (pentru service file - facturare)
  const [paymentCash, setPaymentCash] = useState(false)
  const [paymentCard, setPaymentCard] = useState(false)

  // Delivery state
  const [officeDirect, setOfficeDirect] = useState(false)
  const [curierTrimis, setCurierTrimis] = useState(false)
  const [curierScheduledAt, setCurierScheduledAt] = useState<string | null>(null)
  const [retur, setRetur] = useState(false)
  
  // Service file locked state (pentru blocarea fișei după salvare - se încarcă din DB)
  const [isServiceFileLocked, setIsServiceFileLocked] = useState(false)
  // Status fișă (noua | in_lucru | finalizata | comanda) - pentru debug în consolă
  const [serviceFileStatus, setServiceFileStatus] = useState<string | null>(null)

  // Vanzari checkboxes state
  const [noDeal, setNoDeal] = useState(false)
  const [nuRaspunde, setNuRaspunde] = useState(false)
  const [nuRaspundeCallbackAt, setNuRaspundeCallbackAt] = useState<string | null>(null)
  const [callBack, setCallBack] = useState(false)

  // Vanzari stages state
  const [vanzariStages, setVanzariStages] = useState<Array<{ id: string; name: string }>>([])
  const [vanzariPipelineId, setVanzariPipelineId] = useState<string | null>(null)

  // Urgent state
  const [urgentAllServices, setUrgentAllServices] = useState(false)
  const [urgentTagId, setUrgentTagId] = useState<string | null>(null)

  // Subscription state
  const [subscriptionType, setSubscriptionType] = useState<'services' | 'parts' | 'both' | ''>('')

  // Global discount state (discount aplicat întregii fișe, nu per item)
  const [globalDiscountPct, setGlobalDiscountPct] = useState(0)

  // Send trays state
  const [sendingTrays, setSendingTrays] = useState(false)
  const [showSendConfirmation, setShowSendConfirmation] = useState(false)
  const [traysAlreadyInDepartments, setTraysAlreadyInDepartments] = useState(false)

  // Delete tray state
  const [showDeleteTrayConfirmation, setShowDeleteTrayConfirmation] = useState(false)
  const [trayToDelete, setTrayToDelete] = useState<string | null>(null)
  const [deletingTray, setDeletingTray] = useState(false)

  // Create tray dialog state
  const [showCreateTrayDialog, setShowCreateTrayDialog] = useState(false)
  const [newTrayNumber, setNewTrayNumber] = useState('')
  const [newTraySize, setNewTraySize] = useState('m')
  const [creatingTray, setCreatingTray] = useState(false)

  // Edit tray dialog state
  const [showEditTrayDialog, setShowEditTrayDialog] = useState(false)
  const [editingTrayNumber, setEditingTrayNumber] = useState('')
  const [editingTraySize, setEditingTraySize] = useState('m')
  const [updatingTray, setUpdatingTray] = useState(false)

  // Move instrument dialog state
  const [showMoveInstrumentDialog, setShowMoveInstrumentDialog] = useState(false)
  const [instrumentToMove, setInstrumentToMove] = useState<{ 
    instrument: { id: string; name: string }
    items: LeadQuoteItem[] 
  } | null>(null)
  const [targetTrayId, setTargetTrayId] = useState<string>('')
  const [newTrayNumberForMove, setNewTrayNumberForMove] = useState('')
  const [newTraySizeForMove, setNewTraySizeForMove] = useState('m')
  const [movingInstrument, setMovingInstrument] = useState(false)

  // Receptie stage state
  const [currentServiceFileStage, setCurrentServiceFileStage] = useState<string | null>(null)

  // Technician state
  const [isTechnician, setIsTechnician] = useState(false)

  // Instrument settings state
  const [instrumentSettings, setInstrumentSettings] = useState<Record<string, {
    qty: string
  }>>({})

  // V4 view: date încărcate din DB la deschiderea fișei (tray_items → instruments, services, parts, trays)
  const [v4InitialData, setV4InitialData] = useState<import('@/lib/history/vanzariViewV4Load').V4InitialData | null>(null)

  // Form state - Instrument
  const [instrumentForm, setInstrumentForm] = useState({
    instrument: '',
    qty: '1'
  })

  // Form state - Service
  const [svc, setSvc] = useState({
    instrumentId: '',
    id: '',
    qty: '1',
    discount: '0',
    urgent: false,
    technicianId: '',
    pipelineId: '',
    serialNumberId: '',
  })

  // Form state - Part
  const [part, setPart] = useState({
    id: '',
    overridePrice: '',
    qty: '1',
    discount: '0',
    urgent: false,
    serialNumberId: ''
  })

  // Search state
  const [serviceSearchQuery, setServiceSearchQuery] = useState('')
  const [partSearchQuery, setPartSearchQuery] = useState('')
  const [serviceSearchFocused, setServiceSearchFocused] = useState(false)
  const [partSearchFocused, setPartSearchFocused] = useState(false)

// -------------------------------------------------- COD PENTRU POPULARE CASETE ----------------------------------------------------- 
  const [previousFormState, setPreviousFormState] = useState<{
    instrumentForm: typeof instrumentForm
    svc: typeof svc
    part: typeof part
    serviceSearchQuery: string
    partSearchQuery: string
  } | null>(null)
// -----------------------------------------------------------------------------------------------------------------------------------
  // Refs
  const lastSavedRef = useRef<any[]>([])

  // tempId eliminat - items-urile se salvează direct în DB, nu mai folosim temp IDs

  return {
    // Loading
    loading,
    setLoading,
    saving,
    setSaving,
    isDirty,
    setIsDirty,

    // Data
    services,
    setServices,
    parts,
    setParts,
    instruments,
    setInstruments,
    technicians,
    setTechnicians,
    departments,
    setDepartments,
    pipelines,
    setPipelines,
    pipelinesWithIds,
    setPipelinesWithIds,
    pipeLoading,
    setPipeLoading,

    // Quotes
    quotes,
    setQuotes,
    selectedQuoteId,
    setSelectedQuoteId,
    selectedQuote,

    // Items
    items,
    setItems,
    allSheetsTotal,
    setAllSheetsTotal,
    itemsRefreshKey,
    setItemsRefreshKey,

    // Tray images
    trayImages,
    setTrayImages,
    uploadingImage,
    setUploadingImage,
    isImagesExpanded,
    setIsImagesExpanded,
    assignedImageId,
    setAssignedImageId,

    // Tray details
    trayDetails,
    setTrayDetails,
    loadingTrayDetails,
    setLoadingTrayDetails,
    savingTrayDetails,
    setSavingTrayDetails,

    // Payment (legacy)
    isCash,
    setIsCash,
    isCard,
    setIsCard,

    // Payment (service file)
    paymentCash,
    setPaymentCash,
    paymentCard,
    setPaymentCard,

    // Delivery
    officeDirect,
    setOfficeDirect,
    curierTrimis,
    setCurierTrimis,
    curierScheduledAt,
    setCurierScheduledAt,
    retur,
    setRetur,
    
    // Service file locked
    isServiceFileLocked,
    setIsServiceFileLocked,
    serviceFileStatus,
    setServiceFileStatus,

    // Vanzari checkboxes
    noDeal,
    setNoDeal,
    nuRaspunde,
    setNuRaspunde,
    nuRaspundeCallbackAt,
    setNuRaspundeCallbackAt,
    callBack,
    setCallBack,

    // Vanzari stages
    vanzariStages,
    setVanzariStages,
    vanzariPipelineId,
    setVanzariPipelineId,

    // Urgent
    urgentAllServices,
    setUrgentAllServices,
    urgentTagId,
    setUrgentTagId,

    // Subscription
    subscriptionType,
    setSubscriptionType,

    // Global discount
    globalDiscountPct,
    setGlobalDiscountPct,

    // Send trays
    sendingTrays,
    setSendingTrays,
    showSendConfirmation,
    setShowSendConfirmation,
    traysAlreadyInDepartments,
    setTraysAlreadyInDepartments,

    // Delete tray
    showDeleteTrayConfirmation,
    setShowDeleteTrayConfirmation,
    trayToDelete,
    setTrayToDelete,
    deletingTray,
    setDeletingTray,

    // Create tray dialog
    showCreateTrayDialog,
    setShowCreateTrayDialog,
    newTrayNumber,
    setNewTrayNumber,
    newTraySize,
    setNewTraySize,
    creatingTray,
    setCreatingTray,

    // Edit tray dialog
    showEditTrayDialog,
    setShowEditTrayDialog,
    editingTrayNumber,
    setEditingTrayNumber,
    editingTraySize,
    setEditingTraySize,
    updatingTray,
    setUpdatingTray,

    // Move instrument dialog
    showMoveInstrumentDialog,
    setShowMoveInstrumentDialog,
    instrumentToMove,
    setInstrumentToMove,
    targetTrayId,
    setTargetTrayId,
    newTrayNumberForMove,
    setNewTrayNumberForMove,
    newTraySizeForMove,
    setNewTraySizeForMove,
    movingInstrument,
    setMovingInstrument,

    // Receptie stage
    currentServiceFileStage,
    setCurrentServiceFileStage,

    // Technician
    isTechnician,
    setIsTechnician,

    // Instrument settings
    instrumentSettings,
    setInstrumentSettings,

    // V4 initial data (load from DB)
    v4InitialData,
    setV4InitialData,

    // Forms
    instrumentForm,
    setInstrumentForm,
    svc,
    setSvc,
    part,
    setPart,

    // Search
    serviceSearchQuery,
    setServiceSearchQuery,
    partSearchQuery,
    setPartSearchQuery,
    serviceSearchFocused,
    setServiceSearchFocused,
    partSearchFocused,
    setPartSearchFocused,

    // Undo
    previousFormState,
    setPreviousFormState,

    // Refs
    lastSavedRef,

    // Helpers
    // tempId eliminat - items-urile se salvează direct în DB
  }
}
