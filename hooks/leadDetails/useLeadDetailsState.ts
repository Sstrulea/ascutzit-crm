/**
 * Hook pentru gestionarea state-ului componentei LeadDetailsPanel
 */

import { useState, useRef } from 'react'
import type { Tag } from '@/lib/supabase/tagOperations'

// Tipuri pentru UI (alias-uri pentru claritate)
type ServiceSheet = {
  id: string
  number: string
  status: string
  date: string
  lead_id: string
  fisa_index?: number
}

type LeadQuote = {
  id: string
  number: string
  service_file_id: string
}

type LeadQuoteItem = {
  id: string
  tray_id: string
  item_type?: 'service' | 'part' | null
  name_snapshot?: string
  price: number
  qty: number
  discount_pct?: number
  urgent?: boolean
  brand?: string | null
  serial_number?: string | null
  garantie?: boolean
}

type Technician = {
  id: string // user_id din app_members
  name: string
}

type TrayDetails = {
  tray: LeadQuote
  items: LeadQuoteItem[]
  subtotal: number
  discount: number
  urgent: number
  subscriptionDiscount: number
  subscriptionDiscountServices: number
  subscriptionDiscountParts: number
  subscriptionType: string | null
  total: number
}

export function useLeadDetailsState(initialStage?: string, initialSection?: "fisa" | "de-confirmat" | "istoric") {
  // State-uri de bază
  const [section, setSection] = useState<"fisa" | "de-confirmat" | "istoric">(initialSection ?? "fisa")
  const [stage, setStage] = useState(initialStage || '')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  
  // State pentru fișe de serviciu
  const [serviceSheets, setServiceSheets] = useState<ServiceSheet[]>([])
  const [selectedFisaId, setSelectedFisaId] = useState<string | null>(null)
  const [loadingSheets, setLoadingSheets] = useState(false)
  
  // State pentru tăvițe în pipeline-urile departament
  const [allTrays, setAllTrays] = useState<Array<{ id: string; number: string; service_file_id: string }>>([])
  const [selectedTrayId, setSelectedTrayId] = useState<string | null>(null)
  const [loadingTrays, setLoadingTrays] = useState(false)
  
  // State pentru modalul de detalii fișă
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [traysDetails, setTraysDetails] = useState<TrayDetails[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [totalFisaSum, setTotalFisaSum] = useState<number | null>(null)
  const [loadingTotalSum, setLoadingTotalSum] = useState(false)

  // State pentru tags
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  // State pentru pipelines
  const [selectedPipes, setSelectedPipes] = useState<string[]>([])
  const [movingPipes, setMovingPipes] = useState(false)
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>('')
  const [passingTray, setPassingTray] = useState(false)

  // State pentru checkbox-uri generale
  const [callBack, setCallBack] = useState(false)
  const [callbackDate, setCallbackDate] = useState<string | null>(null) // Data pentru call back
  const [nuRaspunde, setNuRaspunde] = useState(false)
  const [nuRaspundeCallbackAt, setNuRaspundeCallbackAt] = useState<string | null>(null) // Ora programată pentru callback Nu Răspunde
  const [noDeal, setNoDeal] = useState(false)

  // State pentru checkbox-uri Curier
  // NOTĂ: curierTrimis este gestionat în PreturiMain și salvat în DB
  const [coletAjuns, setColetAjuns] = useState(false)
  const [curierRetur, setCurierRetur] = useState(false)
  const [coletTrimis, setColetTrimis] = useState(false)
  const [asteptRidicarea, setAsteptRidicarea] = useState(false)
  const [ridicPersonal, setRidicPersonal] = useState(false)

  // State pentru collapsible sections
  const [isContactOpen, setIsContactOpen] = useState(true)
  const [isTrayInfoOpen, setIsTrayInfoOpen] = useState(true)
  const [isDetailsAndContactOpen, setIsDetailsAndContactOpen] = useState(true)
  const [isMessengerOpen, setIsMessengerOpen] = useState(true)
  
  // State pentru informații tavita - per tăviță
  const [selectedTrayForDetails, setSelectedTrayForDetails] = useState<string>('')
  const [trayDetailsMap, setTrayDetailsMap] = useState<Map<string, string>>(new Map())
  const [trayDetails, setTrayDetails] = useState<string>('')
  const [savingTrayDetails, setSavingTrayDetails] = useState(false)
  const [loadingTrayDetails, setLoadingTrayDetails] = useState(false)

  // State pentru detalii tehnician (service_files.technician_details + evenimente QC din items_events)
  const [technicianDetails, setTechnicianDetails] = useState<Array<{ stage: string; stageLabel: string; text: string; at: string; userId?: string }>>([])
  const [technicianDetailsFromEvents, setTechnicianDetailsFromEvents] = useState<Array<{ stage: string; stageLabel: string; text: string; at: string; userId?: string }>>([])
  const [loadingTechnicianDetails, setLoadingTechnicianDetails] = useState(false)
  const [savingTechnicianDetails, setSavingTechnicianDetails] = useState(false)
  const [isTechnicianDetailsOpen, setIsTechnicianDetailsOpen] = useState(true)

  // State pentru dialog-uri
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  return {
    // State-uri de bază
    section,
    setSection,
    stage,
    setStage,
    copiedField,
    setCopiedField,
    panelRef,
    
    // State-uri pentru fișe de serviciu
    serviceSheets,
    setServiceSheets,
    selectedFisaId,
    setSelectedFisaId,
    loadingSheets,
    setLoadingSheets,
    
    // State-uri pentru tăvițe
    allTrays,
    setAllTrays,
    selectedTrayId,
    setSelectedTrayId,
    loadingTrays,
    setLoadingTrays,
    
    // State-uri pentru modalul de detalii
    detailsModalOpen,
    setDetailsModalOpen,
    traysDetails,
    setTraysDetails,
    loadingDetails,
    setLoadingDetails,
    technicians,
    setTechnicians,
    totalFisaSum,
    setTotalFisaSum,
    loadingTotalSum,
    setLoadingTotalSum,

    // State-uri pentru tags
    allTags,
    setAllTags,
    selectedTagIds,
    setSelectedTagIds,

    // State-uri pentru pipelines
    selectedPipes,
    setSelectedPipes,
    movingPipes,
    setMovingPipes,
    selectedTechnicianId,
    setSelectedTechnicianId,
    passingTray,
    setPassingTray,

    // State-uri pentru checkbox-uri generale
    callBack,
    setCallBack,
    callbackDate,
    setCallbackDate,
    nuRaspunde,
    setNuRaspunde,
    nuRaspundeCallbackAt,
    setNuRaspundeCallbackAt,
    noDeal,
    setNoDeal,

    // State-uri pentru checkbox-uri Curier
    coletAjuns,
    setColetAjuns,
    curierRetur,
    setCurierRetur,
    coletTrimis,
    setColetTrimis,
    asteptRidicarea,
    setAsteptRidicarea,
    ridicPersonal,
    setRidicPersonal,

    // State-uri pentru collapsible sections
    isContactOpen,
    setIsContactOpen,
    isTrayInfoOpen,
    setIsTrayInfoOpen,
    isDetailsAndContactOpen,
    setIsDetailsAndContactOpen,
    isMessengerOpen,
    setIsMessengerOpen,
    
    // State-uri pentru tray details
    selectedTrayForDetails,
    setSelectedTrayForDetails,
    trayDetailsMap,
    setTrayDetailsMap,
    trayDetails,
    setTrayDetails,
    savingTrayDetails,
    setSavingTrayDetails,
    loadingTrayDetails,
    setLoadingTrayDetails,

    // State-uri pentru detalii tehnician
    technicianDetails,
    setTechnicianDetails,
    technicianDetailsFromEvents,
    setTechnicianDetailsFromEvents,
    loadingTechnicianDetails,
    setLoadingTechnicianDetails,
    savingTechnicianDetails,
    setSavingTechnicianDetails,
    isTechnicianDetailsOpen,
    setIsTechnicianDetailsOpen,

    // State-uri pentru dialog-uri
    showDeleteDialog,
    setShowDeleteDialog,
    isDeleting,
    setIsDeleting,
  }
}

