"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Textarea } from "@/components/ui/textarea"
import { format } from "date-fns"
import type { Lead } from "@/app/(crm)/dashboard/page" 
import PreturiMain from '../preturi/core/PreturiMain';
import type { PreturiRef } from '@/lib/types/preturi';
import LeadHistoryWithStacking from "./LeadHistoryWithStacking"
import { PrintView } from '@/components/print'
import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { debounce } from "@/lib/utils"
import LeadMessenger from "./lead-messenger"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu"
import { ChevronsUpDown, Printer, Mail, Phone, Copy, Check, Loader2, FileText, History, MessageSquare, X as XIcon, ChevronDown, ChevronRight, User, Building, Info, MapPin, CheckCircle, Clock, Wrench, Package } from "lucide-react"
// Import componente refactorizate din lead-details
import { LeadDetailsHeader, LeadDetailsTabs } from '../lead-details/header'
import { 
  LeadDetailsSection, 
  LeadContactInfo, 
  LeadTagsSection, 
  LeadPipelinesSection, 
  LeadMessengerSection, 
  LeadServiceFilesSelector,
  LeadTechnicianDetailsSection,
  extractNameAndPhoneFromDetails 
} from '../lead-details/sections'
import { LeadDepartmentActions, LeadVanzariActions } from '../lead-details/actions'
// Import hook-uri refactorizate
import { useLeadDetailsBusiness } from '@/hooks/leadDetails/useLeadDetailsBusiness'
import { listTags, toggleLeadTag, getOrCreatePinnedTag, getOrCreateUrgentareTag, getOrCreateNuRaspundeTag, type Tag, type TagColor } from "@/lib/supabase/tagOperations"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"
import { useRole, useAuth } from "@/lib/contexts/AuthContext"
import { deleteLead, updateLeadWithHistory, logLeadEvent, logButtonEvent } from "@/lib/supabase/leadOperations"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Trash2 } from "lucide-react"
import { 
  listServiceFilesForLead, 
  createServiceFile,
  createTray,
  listTraysForServiceFile,
  listTrayItemsForTray,
  getNextGlobalServiceFileNumber,
  getServiceFile,
  updateServiceFile,
  deleteServiceFile,
  deleteTray,
  type ServiceFile,
  type TrayItem,
  type Tray
} from "@/lib/supabase/serviceFileOperations"
import { parseServiceFileDetails } from '@/lib/utils/serviceFileDetails'
import { 
  listServiceSheetsForLead, 
  listTraysForServiceSheet, 
  listQuotesForLead, 
  listQuoteItems 
} from "@/hooks/leadDetails/useLeadDetailsDataLoader"
import { createServiceSheet } from "@/hooks/leadDetails/useLeadDetailsServiceFiles"
import { moveItemToStage } from "@/lib/supabase/pipelineOperations"
import { fetchStagesForPipeline } from "@/lib/supabase/kanban/fetchers"
import { matchesStagePattern } from "@/lib/supabase/kanban/constants"
import { hasActiveSession as checkActiveSession } from "@/lib/supabase/workSessionOperations"
import { logItemEvent, getTrayDetails, getTechnicianDetails, getUserDetails } from "@/lib/supabase/leadOperations"
import { createNotification } from "@/lib/supabase/notificationOperations"

// Tipuri pentru UI (alias-uri pentru claritate)
type ServiceSheet = ServiceFile & { fisa_index?: number }
type LeadQuote = Tray
type LeadQuoteItem = TrayItem

// Funcții wrapper pentru transformarea datelor
// NOTĂ: Funcțiile helper (listServiceSheetsForLead, createServiceSheet, listTraysForServiceSheet, listQuotesForLead, listQuoteItems) 
// sunt importate din hook-uri

type Technician = {
  id: string // user_id din app_members
  name: string
}
import { listServices } from "@/lib/supabase/serviceOperations"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

type Maybe<T> = T | null

interface LeadDetailsPanelProps {
  lead: Maybe<Lead>
  onClose: () => void
  onStageChange: (leadId: string, newStage: string) => void
  stages: string[]
  pipelines: string[]
  pipelineSlug?: string
  /** Când setat (ex. 'vanzari'), panelul folosește acest slug pentru view (VanzariView vs ReceptieView). Util la lead creat din Recepție. */
  overridePipelineSlug?: string | null
  onMoveToPipeline?: (leadId: string, targetName: string) => Promise<void>
  pipelineOptions?: { name: string; activeStages: number }[]
  onTagsChange?: (leadId: string, tags: Tag[]) => void
  onBulkMoveToPipelines?: (leadId: string, pipelineNames: string[]) => Promise<void>
  /** Apelat după Facturare (ex. refresh Kanban). */
  onRefresh?: () => void
  /** Actualizare optimistă: mută vizual cardul în noul stage (itemId, stageName, stageId). */
  onItemStageUpdated?: (itemId: string, stageName: string, stageId: string) => void
  /** Tab inițial la restaurare după switch (fisa / Mesagerie / Istoric). */
  defaultSection?: 'fisa' | 'de-confirmat' | 'istoric'
  /** Persistă tab-ul curent în cache ca la revenire să rămână același. */
  onSectionChangeForPersist?: (section: 'fisa' | 'de-confirmat' | 'istoric') => void
  /** Receptie: la scoaterea „Nu răspunde” din detalii fișă – mută fișa în De facturat și refresh */
  onMoveFisaToDeFacturat?: (serviceFileId: string) => void | Promise<void>
  /** Vânzări: la adăugarea tag-ului Sună! mută lead-ul în stage-ul Suna */
  onSunaTagAdded?: (leadId: string) => void
  /** Vânzări: la scoaterea tag-ului Sună! mută lead-ul în Leaduri sau Leaduri Straine (după telefon) */
  onSunaTagRemoved?: (leadId: string, phone: string | undefined) => void
}

export function LeadDetailsPanel({
  lead: initialLead,
  onClose,
  onStageChange,
  onTagsChange,
  onMoveToPipeline,
  onBulkMoveToPipelines,
  pipelines,
  stages,
  pipelineSlug,
  overridePipelineSlug,
  onRefresh,
  onItemStageUpdated,
  defaultSection,
  onSectionChangeForPersist,
  onMoveFisaToDeFacturat,
  onSunaTagAdded,
  onSunaTagRemoved,
}: LeadDetailsPanelProps) {
  const supabase = supabaseBrowser()
  
  // State local pentru lead - permite actualizarea după salvarea informațiilor de contact
  const [lead, setLead] = useState<Maybe<Lead>>(initialLead)
  const [isPinning, setIsPinning] = useState(false)
  const [isUrgentaring, setIsUrgentaring] = useState(false)
  const [moveToStageLoading, setMoveToStageLoading] = useState<'de_trimis' | 'ridic_personal' | null>(null)
  const [isClaiming, setIsClaiming] = useState(false)
  // Actualizează lead-ul când se schimbă initialLead (de exemplu, după refresh)
  useEffect(() => {
    setLead(initialLead)
  }, [initialLead?.id, initialLead?.callback_date])
  
  // Sincronizează cu prop-ul când lead-ul extern se schimbă
  useEffect(() => {
    setLead(initialLead)
  }, [initialLead])

  const effectivePipelineSlug = overridePipelineSlug ?? pipelineSlug

  const showActionCheckboxes = useMemo(() => {
    if (!effectivePipelineSlug) return false
    const slug = effectivePipelineSlug.toLowerCase()
    return slug.includes('receptie') || slug.includes('vanzari') || slug.includes('curier')
  }, [effectivePipelineSlug])

  const isCurierPipeline = useMemo(() => {
    if (!effectivePipelineSlug) return false
    return effectivePipelineSlug.toLowerCase().includes('curier')
  }, [effectivePipelineSlug])

  const isVanzariPipeline = useMemo(() => {
    if (!effectivePipelineSlug) return false
    return effectivePipelineSlug.toLowerCase().includes('vanzari') || effectivePipelineSlug.toLowerCase().includes('sales')
  }, [effectivePipelineSlug])

  const isReparatiiPipeline = useMemo(() => {
    if (!effectivePipelineSlug) return false
    return effectivePipelineSlug.toLowerCase().includes('reparatii') || effectivePipelineSlug.toLowerCase().includes('repair')
  }, [effectivePipelineSlug])

  const isReceptiePipeline = useMemo(() => {
    if (!effectivePipelineSlug) return false
    return effectivePipelineSlug.toLowerCase().includes('receptie') || effectivePipelineSlug.toLowerCase().includes('reception')
  }, [effectivePipelineSlug])

  const isDepartmentPipeline = useMemo(() => {
    if (!effectivePipelineSlug) return false
    const slug = effectivePipelineSlug.toLowerCase()
    return slug.includes('saloane') || 
           slug.includes('frizerii') || 
           slug.includes('horeca') || 
           slug.includes('reparatii')
  }, [effectivePipelineSlug])

  const isSaloaneHorecaFrizeriiPipeline = useMemo(() => {
    if (!effectivePipelineSlug) return false
    const slug = effectivePipelineSlug.toLowerCase()
    return slug.includes('saloane') || 
           slug.includes('frizerii') || 
           slug.includes('horeca')
  }, [effectivePipelineSlug])

  const { role, loading: roleLoading } = useRole()
  const { user } = useAuth()
  // Tehnician = rol explicit „technician” în app_members (nu „în app_members” = toți userii)
  const isTechnician = (role as string) === 'technician'
  // NOTĂ: showDeleteDialog și isDeleting sunt gestionate în business.state
  const isOwner = role === 'owner'
  
  // Ref pentru componenta Preturi (ex. salvare la „Salvează în Istoric”, nu la Close)
  const preturiRef = useRef<PreturiRef>(null)
  
  // State pentru datele TrayTabs
  const [trayTabsData, setTrayTabsData] = useState<{
    quotes?: LeadQuote[]
    selectedQuoteId?: string | null
    isVanzatorMode?: boolean
    sendingTrays?: boolean
    traysAlreadyInDepartments?: boolean
    onTraySelect?: (trayId: string) => void
    onAddTray?: () => void
    onDeleteTray?: (trayId: string) => void
    onSendTrays?: () => void
  }>({})
  
  // State pentru datele de print tăvițe
  const [services, setServices] = useState<any[]>([])
  const [instruments, setInstruments] = useState<any[]>([])
  const [pipelinesWithIds, setPipelinesWithIds] = useState<any[]>([])
  const [officeDirect, setOfficeDirect] = useState(false)
  const [curierTrimis, setCurierTrimis] = useState(false)
  
  // Verifică dacă utilizatorul este vânzător (nu tehnician)
  const isVanzator = !isTechnician && (role === 'admin' || role === 'owner' || role === 'member')

  // Verifică dacă utilizatorul poate muta în pipeline (doar owner și admin)
  const canMovePipeline = role === 'owner' || role === 'admin'

  // Folosește hook-ul principal de business pentru a obține state-urile și funcțiile
  const business = useLeadDetailsBusiness({
    lead,
    pipelineSlug: effectivePipelineSlug,
    pipelines,
    stages,
    isVanzariPipeline,
    isReceptiePipeline,
    isCurierPipeline,
    isDepartmentPipeline,
    isReparatiiPipeline,
    isSaloaneHorecaFrizeriiPipeline,
    onStageChange,
    onTagsChange,
    onMoveToPipeline,
    onBulkMoveToPipelines,
    onClose,
    onRefresh,
    onItemStageUpdated,
    user,
    initialSection: defaultSection,
    onSunaTagAdded,
    onSunaTagRemoved,
  })

  // NOTĂ: Toate state-urile sunt gestionate în useLeadDetailsBusiness hook
  // Folosim business.state.* pentru toate state-urile

  // Salvare în istoric o singură dată per deschidere a aceluiași lead (evită zeci de evenimente la fiecare re-render)
  const lastLoggedOpenLeadIdRef = useRef<string | null>(null)
  useEffect(() => {
    const lid = (lead as any)?.leadId ?? lead?.id ?? business.getLeadId()
    if (!lid) return
    if (lastLoggedOpenLeadIdRef.current === lid) return
    lastLoggedOpenLeadIdRef.current = lid
    logLeadEvent(lid, 'Detalii lead deschise', 'lead_details_opened', { source: 'panel' }).catch((err) => {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.warn('[LeadDetailsPanel] Istoric acces lead:', err)
      }
    })
  }, [lead?.id, (lead as any)?.leadId])

  // Detalii tehnician: note manuale (technician_details) + evenimente QC din istoric (items_events)
  const technicianDetailsMerged = useMemo(() => {
    const manual = business.state.technicianDetails ?? []
    const fromEvents = business.state.technicianDetailsFromEvents ?? []
    const merged = [...manual, ...fromEvents]
    merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    return merged
  }, [business.state.technicianDetails, business.state.technicianDetailsFromEvents])
  
  // Obține datele din preturiRef după ce componenta este montată
  useEffect(() => {
    const updateTrayTabsData = () => {
      if (preturiRef.current) {
        setTrayTabsData({
          quotes: preturiRef.current.getQuotes(),
          selectedQuoteId: preturiRef.current.getSelectedQuoteId(),
          isVanzatorMode: preturiRef.current.getIsVanzatorMode(),
          sendingTrays: preturiRef.current.getSendingTrays(),
          traysAlreadyInDepartments: preturiRef.current.getTraysAlreadyInDepartments(),
          onTraySelect: preturiRef.current.getOnTraySelect(),
          onAddTray: preturiRef.current.getOnAddTray(),
          onDeleteTray: preturiRef.current.getOnDeleteTray(),
          onSendTrays: preturiRef.current.getOnSendTrays(),
        })
      }
    }
    
    // Actualizează datele imediat
    updateTrayTabsData()
    
    // Actualizează datele periodic (pentru a captura schimbările) – 2s pentru a reduce load
    const interval = setInterval(updateTrayTabsData, 2000)
    
    return () => clearInterval(interval)
  }, [business.state.selectedFisaId]) // Re-actualizează când se schimbă fișa selectată
  
  const allPipeNames = pipelines ?? []

  // NOTĂ: getLeadId, getServiceFileId, getTrayId sunt deja în business.*
  // NOTĂ: Close nu mai salvează; salvare doar la „Salvează în Istoric”. saveServiceFileDetails rămâne în business.trayDetails.

  // ---------------------------------------------------------------------------
  // Cum se populează „Detalii comunicate de client” (leads.details):
  //   1. Din formular Facebook Lead Ads: webhook → buildLeadDetailsFromFieldData(field_data)
  //      → câmpuri DETAILS_KEYS (mesaj, detalii, cerințe, etc.) + alte câmpuri non-SKIP.
  //      Vezi app/api/leads/facebook-webhook/route.ts.
  //   2. Manual: utilizatorii cu acces Receptie/Vânzări editează în LeadDetailsSection
  //      → updateLead(leadId, { details }) + logLeadEvent (istoric).
  // Afișare: mai întâi din lead?.details (Kanban); dacă lipsește, fetch leads.details pe leadId.
  // ---------------------------------------------------------------------------
  // Inițializare din lead la deschidere; fallback fetch din DB dacă lipsește
  useEffect(() => {
    if (!lead) return
    const raw = (lead as any)?.details ?? (lead as any)?.lead?.details ?? null
    const parsed = parseServiceFileDetails(raw)
    if (parsed) {
      business.state.setTrayDetails(parsed)
      business.state.setLoadingTrayDetails(false)
      return
    }
    const leadId = business.getLeadId()
    if (!leadId) {
      business.state.setTrayDetails('')
      business.state.setLoadingTrayDetails(false)
      return
    }
    business.state.setLoadingTrayDetails(true)
    let cancelled = false
    supabase
      .from('leads')
      .select('details')
      .eq('id', leadId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        business.state.setLoadingTrayDetails(false)
        if (error || !data) {
          business.state.setTrayDetails('')
          return
        }
        business.state.setTrayDetails(parseServiceFileDetails((data as any)?.details ?? null))
      })
    return () => { cancelled = true }
  }, [lead?.id, business.getLeadId])

  const togglePipe = (name: string) =>
    business.state.setSelectedPipes(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name])

  const pickAll = () => business.state.setSelectedPipes(allPipeNames)
  const clearAll = () => business.state.setSelectedPipes([])

  useEffect(() => {
    const ch = supabase
      .channel('rt-tags-lead-panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' },
        () => listTags().then(business.state.setAllTags).catch(console.error)
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { listTags().then(business.state.setAllTags).catch(console.error) }, [])

  useEffect(() => {
    if (!lead) return
    business.state.setSelectedTagIds((lead.tags ?? []).map(t => t.id))
  }, [lead?.id])

  useEffect(() => {
    business.state.setStage(lead.stage)
    
    // Încarcă callback_date din lead
    if (lead.callback_date) {
      business.state.setCallbackDate(lead.callback_date)
    } else {
      business.state.setCallbackDate(null)
    }
    
    const nrCallbackAt = (lead as any).nu_raspunde_callback_at
    if (nrCallbackAt) {
      business.state.setNuRaspundeCallbackAt(nrCallbackAt)
    } else {
      business.state.setNuRaspundeCallbackAt(null)
    }
    
    // Setează starea checkbox-urilor pe baza stage-ului curent (doar în Vânzări)
    if (isVanzariPipeline) {
      const currentStage = lead.stage?.toUpperCase() || ''
      
      // Verifică dacă stage-ul curent corespunde unuia dintre checkbox-uri
      if (currentStage.includes('NO DEAL') || currentStage.includes('NO-DEAL')) {
        business.state.setNoDeal(true)
        business.state.setCallBack(false)
        business.state.setNuRaspunde(false)
      } else if (currentStage.includes('CALLBACK') || currentStage.includes('CALL BACK') || currentStage.includes('CALL-BACK')) {
        business.state.setNoDeal(false)
        business.state.setCallBack(true)
        business.state.setNuRaspunde(false)
      } else if (currentStage.includes('RASPUNDE') || currentStage.includes('RASUNDE')) {
        business.state.setNoDeal(false)
        business.state.setCallBack(false)
        business.state.setNuRaspunde(true)
      } else {
        // Dacă stage-ul nu corespunde niciunui checkbox, dezactivează toate
        business.state.setNoDeal(false)
        business.state.setCallBack(false)
        business.state.setNuRaspunde(false)
      }
    }
  }, [business.getLeadId(), lead?.stage, lead?.callback_date, (lead as any)?.nu_raspunde_callback_at, isVanzariPipeline])

  // NOTĂ: Logica de încărcare a service sheets este deja în business.dataLoader.*
  // Hook-ul useLeadDetailsDataLoader gestionează totul, nu mai este nevoie de duplicate aici

  // Încarcă toate tăvițele pentru lead în pipeline-urile departament
  useEffect(() => {
    if (!isDepartmentPipeline) return
    
    const leadIdToUse = business.getLeadId()
    if (!leadIdToUse) return
    
    let isMounted = true
    
    const loadTrays = async () => {
      business.state.setLoadingTrays(true)
      try {
        // Folosește funcția din hook pentru a evita duplicate calls
        const sheets = await business.dataLoader.loadServiceSheets(leadIdToUse)
        if (!isMounted) return
        
        // Încarcă toate tăvițele din toate service_files
        const allTraysList: Array<{ id: string; number: string; service_file_id: string }> = []
        for (const sheet of sheets) {
          const trays = await listTraysForServiceSheet(sheet.id)
          allTraysList.push(...trays.map((t: any) => ({
            id: t.id,
            number: t.number,
            service_file_id: sheet.id
          })))
        }
        
        if (!isMounted) return
        
        business.state.setAllTrays(allTraysList)
        
        // Dacă este un tray (vine din pipeline departament), selectează-l direct
        const trayId = business.getTrayId()
        if (trayId) {
          const foundTray = allTraysList.find(t => t.id === trayId)
          if (foundTray) {
            business.state.setSelectedTrayId(trayId)
            // Setează și service_file_id pentru Preturi
            business.state.setSelectedFisaId(foundTray.service_file_id)
          } else if (allTraysList.length > 0) {
            // Selectează prima tăviță
            business.state.setSelectedTrayId(allTraysList[0].id)
            business.state.setSelectedFisaId(allTraysList[0].service_file_id)
          }
        } else if (allTraysList.length > 0 && !business.state.selectedTrayId) {
          // Selectează prima tăviță dacă nu avem deja una selectată
          business.state.setSelectedTrayId(allTraysList[0].id)
          business.state.setSelectedFisaId(allTraysList[0].service_file_id)
        }
      } catch (error) {
        if (!isMounted) return
        console.error('Error loading trays:', error)
        toast.error('Eroare la încărcarea tăvițelor')
      } finally {
        if (isMounted) {
          business.state.setLoadingTrays(false)
        }
      }
    }
    
    loadTrays()
    
    return () => {
      isMounted = false
    }
  }, [isDepartmentPipeline, business.getLeadId(), business.getTrayId(), business.dataLoader.loadServiceSheets])

  // Minimizează secțiunea Contact în Department Pipeline by default
  useEffect(() => {
    if (isDepartmentPipeline) {
      business.state.setIsContactOpen(false)
    }
  }, [isDepartmentPipeline])

  // Încarcă serviciile și instrumentele pentru print tăvițe
  useEffect(() => {
    const loadPrintData = async () => {
      try {
        const supabaseClient = supabaseBrowser()
        
        // Încarcă serviciile
        const { data: servicesData } = await listServices()
        if (servicesData) {
          setServices(servicesData)
        }
        
        // Încarcă instrumentele
        const { data: instrumentsData } = await supabaseClient
          .from('instruments')
          .select('id, name, weight, department_id, pipeline')
          .order('name', { ascending: true })
        if (instrumentsData) {
          setInstruments(instrumentsData)
        }
        
        // Încarcă pipeline-urile
        const { data: pipelinesData } = await supabaseClient
          .from('pipelines')
          .select('id, name')
          .order('name', { ascending: true })
        if (pipelinesData) {
          setPipelinesWithIds(pipelinesData)
        }
      } catch (error) {
        console.error('Error loading print data:', error)
      }
    }
    
    loadPrintData()
  }, [])
  
  // Verifică checkbox-urile pentru officeDirect și curierTrimis
  useEffect(() => {
    setOfficeDirect((lead as any)?.office_direct || false)
    setCurierTrimis((lead as any)?.curier_trimis || false)
  }, [lead])
  
  // Încarcă tehnicienii
  useEffect(() => {
    const loadTechnicians = async () => {
      try {
        // Obține membrii din app_members pentru tehnicieni (folosim câmpul name)
        const supabaseClient = supabaseBrowser()
        const { data: membersData, error } = await supabaseClient
          .from('app_members')
          .select('user_id, name')
          .order('created_at', { ascending: true })
        
        if (error) {
          console.error('Error loading app_members:', error)
          business.state.setTechnicians([])
          return
        }
        
        if (!membersData || membersData.length === 0) {
          business.state.setTechnicians([])
          return
        }
        
        // Transformă membrii în tehnicieni folosind câmpul name
        const techs: Technician[] = (membersData || []).map((m: any) => {
          // Folosește câmpul name, cu fallback la user_id
          let name = m.name || m.Name || null
          if (!name && m.user_id) {
            name = `User ${m.user_id.slice(0, 8)}`
          }
          if (!name) {
            name = 'Necunoscut'
          }
          
          return {
            id: m.user_id,
            name: name
          }
        })
        
        // Sortează după nume
        techs.sort((a, b) => a.name.localeCompare(b.name))
        business.state.setTechnicians(techs)
      } catch (error) {
        console.error('Error loading technicians:', error)
      }
    }
    loadTechnicians()
  }, [])

  // NOTĂ: handleToggleTag este deja în business.tags.handleToggleTag
  // NOTĂ: handleStageChange este deja în business.handleStageChange
  // NOTĂ: handleNuRaspundeChange, handleNoDealChange, handleCallBackChange sunt deja în business.checkboxes.*

  // Handler pentru butonul "Apelat" din Vânzări - setează callback_date la 3 luni și mută în CallBack
  const handleApelat = useCallback(async (callbackDateValue: string, targetStage: string) => {
    const leadId = business.getLeadId()
    if (!leadId) return

    // Salvează callback_date în DB
    await updateLeadWithHistory(leadId, {
      callback_date: callbackDateValue,
      updated_at: new Date().toISOString()
    })

    // Actualizează state-ul local
    business.state.setCallbackDate(callbackDateValue)
    business.state.setCallBack(true)
    business.state.setNoDeal(false)
    business.state.setNuRaspunde(false)

    // Mută în stage-ul CallBack
    onStageChange(leadId, targetStage)
    
    // Loghează evenimentul
    logLeadEvent(leadId, `Lead marcat ca Apelat. Callback programat pentru ${callbackDateValue}`, 'callback_set', {
      callback_date: callbackDateValue,
      target_stage: targetStage
    })
  }, [business.getLeadId, business.state, onStageChange])

  // Handler pentru revenirea la Leaduri din CallBack
  const handleRevenireLaLeaduri = useCallback(async () => {
    const leadId = business.getLeadId()
    if (!leadId) return

    // Găsește stage-ul Leaduri
    const leaduriStage = stages.find(stage => {
      const stageUpper = stage.toUpperCase()
      return stageUpper === 'LEADS' || 
             stageUpper === 'LEAD' ||
             stageUpper === 'LEADURI' ||
             stageUpper.includes('LEADS') ||
             stageUpper.includes('LEAD')
    })

    if (!leaduriStage) {
      toast.error('Stage-ul Leaduri nu există în acest pipeline')
      return
    }

    // Șterge callback_date în DB
    await updateLeadWithHistory(leadId, {
      callback_date: null,
      updated_at: new Date().toISOString()
    })

    // Actualizează state-ul local
    business.state.setCallbackDate(null)
    business.state.setCallBack(false)

    // Mută în stage-ul Leaduri
    onStageChange(leadId, leaduriStage)
    
    // Loghează evenimentul
    logLeadEvent(leadId, `Lead revenit din CallBack în ${leaduriStage}`, 'callback_cleared', {
      target_stage: leaduriStage
    })
  }, [business.getLeadId, business.state, stages, onStageChange])

  // functii pentru contacte – clipboard cu fallback execCommand (HTTP / permisiuni)
  const handleCopy = useCallback(async (text: string, field: string) => {
    const s = typeof text === 'string' ? text : String(text ?? '')
    if (!s.trim()) {
      toast.error('Nu există conținut de copiat')
      return
    }
    const fallbackCopy = (): boolean => {
      try {
        const el = document.createElement('textarea')
        el.value = s
        el.setAttribute('readonly', '')
        el.style.position = 'absolute'
        el.style.left = '-9999px'
        el.style.opacity = '0'
        document.body.appendChild(el)
        el.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(el)
        return ok
      } catch {
        return false
      }
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(s)
      } else {
        if (!fallbackCopy()) throw new Error('execCommand failed')
      }
      business.state.setCopiedField(field)
      toast.success('Copiat în clipboard', {
        description: `${field} a fost copiat`
      })
      setTimeout(() => business.state.setCopiedField(null), 2000)
    } catch {
      if (fallbackCopy()) {
        business.state.setCopiedField(field)
        toast.success('Copiat în clipboard', { description: `${field} a fost copiat` })
        setTimeout(() => business.state.setCopiedField(null), 2000)
      } else {
        toast.error('Eroare la copiere. Încearcă HTTPS sau acordă permisiuni pentru clipboard.')
      }
    }
  }, [business.state.setCopiedField])

  const handlePhoneClick = useCallback((phone: string) => {
    window.location.href = `tel:${phone}`
  }, [])

  const handleEmailClick = useCallback((email: string) => {
    const subject = encodeURIComponent(`Comanda Ascutzit.ro`)
    const body = encodeURIComponent(`Va contactez in legatura cu comanda dvs facuta la Ascutzit.ro`)
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}&body=${body}`, '_blank')
  }, [])

  // Handler pentru print - deschide dialogul de facturare din PreturiMain
  const handlePrint = useCallback(() => {
    if (!preturiRef.current) {
      toast.error('Componenta Prețuri nu este încărcată')
      return
    }
    // Deschide dialogul de facturare care conține butonul de print
    preturiRef.current.openBillingDialog()
  }, [])

  // NOTĂ: handleFinalizare, handleAsteptPiese, handleInAsteptare, handleInLucru sunt deja în business.departmentActions.*

  // NOTĂ: handleCreateServiceSheet este deja în business.serviceFiles.handleCreateServiceSheet

  // NOTĂ: loadTraysDetails și calculateTotalFisaSum sunt deja în business.dataLoader.*
  
  // Calculează suma totală când se schimbă fișa selectată
  useEffect(() => {
    if (business.state.selectedFisaId) {
      business.dataLoader.calculateTotalFisaSum(business.state.selectedFisaId)
    } else {
      business.state.setTotalFisaSum(null)
    }
  }, [business.state.selectedFisaId, business.dataLoader.calculateTotalFisaSum])

  // Blochează scroll-ul pe body când panelul este deschis
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight
    
    // Calculează lățimea scrollbar-ului pentru a preveni jump-ul layout-ului
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    
    return () => {
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
    }
  }, [])

  // Keyboard shortcuts – Close fără salvare (doar „Salvează în Istoric” salvează)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Pin/Unpin (Receptie) – direct din detalii
  const leadIdForPin = (lead as any)?.leadId ?? lead?.id
  const isPinned = (lead?.tags ?? []).some((t: { name?: string }) => t?.name === 'PINNED')
  const isUrgentare = (lead?.tags ?? []).some((t: { name?: string }) => t?.name === 'Urgentare')
  const handlePinClick = useCallback(async () => {
    if (!leadIdForPin) return
    setIsPinning(true)
    try {
      const pinnedTag = await getOrCreatePinnedTag()
      await toggleLeadTag(leadIdForPin, pinnedTag.id)
      const hadPinned = (lead?.tags ?? []).some((t: { name?: string }) => t?.name === 'PINNED')
      const newTags = hadPinned
        ? (lead?.tags ?? []).filter((t: { name?: string }) => t?.name !== 'PINNED')
        : [...(lead?.tags ?? []), pinnedTag]
      setLead(prev => (prev ? { ...prev, tags: newTags } : prev))
      business.state.setSelectedTagIds(newTags.map((t: { id: string }) => t.id))
      onTagsChange?.(leadIdForPin, newTags)
    } finally {
      setIsPinning(false)
    }
  }, [leadIdForPin, lead?.tags, onTagsChange])
  const handleUrgentareClick = useCallback(async () => {
    if (!leadIdForPin) return
    setIsUrgentaring(true)
    try {
      const urgentareTag = await getOrCreateUrgentareTag()
      await toggleLeadTag(leadIdForPin, urgentareTag.id)
      const hadUrgentare = (lead?.tags ?? []).some((t: { name?: string }) => t?.name === 'Urgentare')
      const newTags = hadUrgentare
        ? (lead?.tags ?? []).filter((t: { name?: string }) => t?.name !== 'Urgentare')
        : [...(lead?.tags ?? []), urgentareTag]
      setLead(prev => (prev ? { ...prev, tags: newTags } : prev))
      business.state.setSelectedTagIds(newTags.map((t: { id: string }) => t.id))
      onTagsChange?.(leadIdForPin, newTags)
    } finally {
      setIsUrgentaring(false)
    }
  }, [leadIdForPin, lead?.tags, onTagsChange])

  const currentStageName = (lead as any)?.stage ?? ''
  const isDeFacturatStage = matchesStagePattern(currentStageName, 'DE_FACTURAT')
  const isNuRaspundeStage = matchesStagePattern(currentStageName, 'NU_RASPUNDE')
  const showDeTrimisRidicButtons = isReceptiePipeline && (isDeFacturatStage || isNuRaspundeStage) && !!business.state.selectedFisaId

  const getReceptieStages = useCallback(async () => {
    const { data: pipes } = await supabase.from('pipelines').select('id,name')
    const receptie = (pipes || []).find((p: any) => (p.name || '').toLowerCase().includes('receptie'))
    if (!receptie?.id) return { receptie: null, deTrimis: null, ridicPersonal: null }
    const { data: stageList } = await fetchStagesForPipeline(receptie.id)
    const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    const deTrimis = stageList?.find((s: any) => norm(s.name).includes('de trimis') || norm(s.name).includes('detrimis'))
    const ridicPersonal = stageList?.find((s: any) => norm(s.name).includes('ridic personal') || norm(s.name).includes('ridicpersonal'))
    return { receptie, deTrimis, ridicPersonal }
  }, [])

  const moveToStageAndClearNuRaspundeIfNeeded = useCallback(async (targetStage: { id: string; name: string } | null) => {
    const fisaId = business.state.selectedFisaId
    const leadId = (lead as any)?.leadId ?? (lead as any)?.id
    if (!fisaId || !targetStage) return
    try {
      if (isNuRaspundeStage && leadId) {
        await updateServiceFile(fisaId, { nu_raspunde_callback_at: null })
        const nuRaspundeTag = await getOrCreateNuRaspundeTag()
        await toggleLeadTag(leadId, nuRaspundeTag.id)
      }
      const { receptie } = await getReceptieStages()
      if (!receptie?.id) throw new Error('Pipeline Recepție negăsit')
      const { error } = await moveItemToStage('service_file', fisaId, receptie.id, targetStage.id)
      if (error) throw error
      toast.success(`Fișa mutată în ${targetStage.name}.`)
      onRefresh?.()
    } catch (e: any) {
      toast.error(e?.message ?? 'Nu s-a putut muta fișa')
    }
  }, [business.state.selectedFisaId, lead, isNuRaspundeStage, getReceptieStages, onRefresh])

  const handleMoveToDeTrimis = useCallback(async () => {
    const { deTrimis } = await getReceptieStages()
    if (!deTrimis) {
      toast.error('Stage „De trimis” negăsit în Recepție')
      return
    }
    setMoveToStageLoading('de_trimis')
    try {
      await moveToStageAndClearNuRaspundeIfNeeded(deTrimis)
    } finally {
      setMoveToStageLoading(null)
    }
  }, [getReceptieStages, moveToStageAndClearNuRaspundeIfNeeded])

  const handleMoveToRidicPersonal = useCallback(async () => {
    const { ridicPersonal } = await getReceptieStages()
    if (!ridicPersonal) {
      toast.error('Stage „Ridic personal” negăsit în Recepție')
      return
    }
    setMoveToStageLoading('ridic_personal')
    try {
      await moveToStageAndClearNuRaspundeIfNeeded(ridicPersonal)
    } finally {
      setMoveToStageLoading(null)
    }
  }, [getReceptieStages, moveToStageAndClearNuRaspundeIfNeeded])

  const handleClaimClick = useCallback(async () => {
    if (!user?.id || isClaiming) return
    const lid = lead?.leadId || lead?.id
    if (!lid) return
    setIsClaiming(true)
    try {
      const isCurrentlyMine = (lead as any)?.claimed_by === user.id
      if (isCurrentlyMine) {
        const { unclaimLead } = await import('@/lib/supabase/leadOperations')
        await unclaimLead(lid)
        setLead(prev => prev ? { ...prev, claimed_by: null } as any : prev)
      } else {
        const { claimLead } = await import('@/lib/supabase/leadOperations')
        const { error } = await claimLead(lid, user.id)
        if (error) {
          const { toast } = await import('sonner')
          toast.error(error.message || 'Nu s-a putut prelua lead-ul')
          return
        }
        setLead(prev => prev ? { ...prev, claimed_by: user.id } as any : prev)
      }
    } finally {
      setIsClaiming(false)
    }
  }, [user?.id, lead?.id, (lead as any)?.claimed_by, isClaiming])

  // Handler pentru Close - nu mai atribuie automat tag-ul "Retur"
  // Tag-ul "RETUR" poate fi atribuit/eliminat manual de utilizator

  const leadAny = lead as any
  const itemType: 'lead' | 'service_file' | 'tray' = leadAny?.type === 'tray' ? 'tray' : leadAny?.type === 'service_file' ? 'service_file' : 'lead'
  const deleteLabel = itemType === 'tray' ? 'Șterge tăvița' : itemType === 'service_file' ? 'Șterge fișa' : 'Șterge lead'
  const canDeleteItem = isOwner || role === 'admin'
  const isMobile = useIsMobile()

  const onLogButton = useCallback((buttonId: string, buttonLabel: string) => {
    const leadId = business.getLeadId()
    if (!leadId) return
    logButtonEvent({
      leadId,
      buttonId,
      buttonLabel,
      actorOption: {
        currentUserId: user?.id ?? undefined,
        currentUserName: user?.email?.split('@')[0] ?? null,
        currentUserEmail: user?.email ?? null,
      },
    }).catch(() => {})
  }, [business.getLeadId, user?.id, user?.email])

  if (!lead) return null

  return (
    <section ref={business.state.panelRef} className="h-full flex flex-col bg-card">
      {/* Header refactorizat */}
      <LeadDetailsHeader
        leadName={
          (lead.name?.trim() && lead.name.trim().toLowerCase() !== 'unknown')
            ? lead.name
            : (extractNameAndPhoneFromDetails((lead as any).details ?? (lead as any).notes).name || lead.name)
        }
        leadEmail={lead.email}
        leadPhone={lead.phone}
        isOwner={isOwner}
        isAdmin={role === 'admin' || role === 'owner'}
        isVanzator={isVanzator}
        isDepartmentPipeline={isDepartmentPipeline}
        showActionCheckboxes={showActionCheckboxes}
        isCurierPipeline={isCurierPipeline}
        isReceptiePipeline={isReceptiePipeline}
        isVanzariPipeline={isVanzariPipeline}
        allTags={business.state.allTags}
        selectedTagIds={business.state.selectedTagIds}
        assignableTags={business.tags.assignableTags}
        onToggleTag={business.tags.handleToggleTag}
        tagClass={business.tags.tagClass}
        isDepartmentTag={business.tags.isDepartmentTag}
        isAutoTag={business.tags.isAutoTag}
        getDepartmentBadgeStyle={business.tags.getDepartmentBadgeStyle}
        callBack={business.state.callBack}
        callbackDate={business.state.callbackDate}
        nuRaspunde={business.state.nuRaspunde}
        nuRaspundeCallbackAt={business.state.nuRaspundeCallbackAt}
        noDeal={business.state.noDeal}
        onCallBackChange={business.checkboxes.handleCallBackChange}
        onCallbackDateChange={(date) => {
          // Actualizează lead-ul local pentru a afișa data imediat
          setLead(prev => prev ? { ...prev, callback_date: date } : prev)
          // Salvează în DB
          business.checkboxes.handleCallbackDateChange(date)
        }}
        onNuRaspundeChange={async (checked, callbackTime) => {
          await business.checkboxes.handleNuRaspundeChange(checked, callbackTime)
          if (!checked && effectivePipelineSlug?.toLowerCase() === 'receptie' && business.state.selectedFisaId && onMoveFisaToDeFacturat) {
            await onMoveFisaToDeFacturat(business.state.selectedFisaId)
          }
        }}
        onNoDealChange={business.checkboxes.handleNoDealChange}
        coletAjuns={business.checkboxes.coletAjuns}
        curierRetur={business.checkboxes.curierRetur}
        coletTrimis={business.checkboxes.coletTrimis}
        asteptRidicarea={business.checkboxes.asteptRidicarea}
        ridicPersonal={business.checkboxes.ridicPersonal}
        onColetAjunsChange={business.checkboxes.setColetAjuns}
        onCurierReturChange={business.checkboxes.setCurierRetur}
        onColetTrimisChange={business.checkboxes.setColetTrimis}
        onAsteptRidicareaChange={business.checkboxes.setAsteptRidicarea}
        onRidicPersonalChange={business.checkboxes.setRidicPersonal}
        showPinButton={isReceptiePipeline}
        isPinned={isPinned}
        isPinning={isPinning}
        onPinClick={handlePinClick}
        showUrgentareButton={itemType === 'service_file' || itemType === 'tray'}
        isUrgentare={isUrgentare}
        isUrgentaring={isUrgentaring}
        onUrgentareClick={handleUrgentareClick}
        claimedByMe={!!(user?.id && (lead as any)?.claimed_by === user.id)}
        claimedByOther={!!((lead as any)?.claimed_by && (lead as any)?.claimed_by !== user?.id)}
        claimedByName={(lead as any)?.claimed_by_name || null}
        isClaiming={isClaiming}
        onClaimClick={handleClaimClick}
        onEmailClick={handleEmailClick}
        onPhoneClick={handlePhoneClick}
        onDeleteClick={() => business.state.setShowDeleteDialog(true)}
        onClose={onClose}
        onPrint={handlePrint}
        deleteLabel={deleteLabel}
        showDeleteButton={canDeleteItem}
        showSheetSelectorInHeader={!isDepartmentPipeline && (isVanzariPipeline || (isReceptiePipeline && isVanzator))}
        serviceSheets={business.state.serviceSheets}
        selectedFisaId={business.state.selectedFisaId}
        loadingSheets={business.state.loadingSheets}
        onFisaIdChange={(fisaId) => {
          business.state.setSelectedFisaId(fisaId)
          if (fisaId) {
            business.dataLoader.calculateTotalFisaSum(fisaId)
          }
        }}
        onCreateServiceSheet={business.serviceFiles.handleCreateServiceSheet}
        isVanzariPipeline={isVanzariPipeline}
        isReceptiePipeline={isReceptiePipeline}
        isVanzator={isVanzator}
        showDetaliiFisaInHeader={!!(business.state.selectedFisaId && !isDepartmentPipeline && !isReceptiePipeline)}
        onDetaliiFisaClick={() => {
          if (business.state.selectedFisaId) {
            business.dataLoader.loadTraysDetails(business.state.selectedFisaId)
            business.state.setDetailsModalOpen(true)
          }
        }}
        onLogButton={onLogButton}
      />

<div className={cn(
  "flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row overflow-y-auto",
  isMobile ? "gap-2 p-2" : "gap-3 lg:gap-4 p-2 sm:p-3 lg:p-4"
)}>
  {/* LEFT column — mobil: doar acces rapid; tabletă (768–1023px): grid 2 coloane; desktop (1024px+): o coloană */}
  <div className={cn(
    "lg:w-[280px] xl:w-[320px] lg:flex-shrink-0 overflow-y-auto",
    isMobile ? "space-y-2 w-full" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2 sm:gap-3 md:gap-x-4"
  )}>
    {isMobile ? (
      /* Mod compact: doar Mută în Pipeline (acces rapid) */
      canMovePipeline && !isVanzariPipeline && (
        <div className="rounded-md border bg-muted/30 p-2.5">
          <LeadPipelinesSection
            allPipeNames={business.pipelines.allPipeNames}
            selectedPipes={business.state.selectedPipes}
            movingPipes={business.state.movingPipes}
            onTogglePipe={business.pipelines.togglePipe}
            onPickAll={business.pipelines.pickAll}
            onClearAll={business.pipelines.clearAll}
            onBulkMove={business.pipelines.handleBulkMoveToPipelines}
            onMoveToPipeline={business.pipelines.handleMoveToPipeline}
            compact
          />
        </div>
      )
    ) : (
      <>
        {/* Caseta 1: Detalii comunicate de client */}
        <LeadDetailsSection
          isOpen={business.state.isTrayInfoOpen}
          onOpenChange={business.state.setIsTrayInfoOpen}
          trayDetails={business.state.trayDetails}
          setTrayDetails={business.state.setTrayDetails}
          loadingTrayDetails={business.state.loadingTrayDetails}
          canEdit={(isVanzariPipeline || isReceptiePipeline) && !isTechnician}
          onSave={async (v) => {
            await business.trayDetails.saveServiceFileDetails(v)
            setLead((prev) => (prev ? { ...prev, details: v } : prev))
          }}
          saving={business.state.savingTrayDetails}
        />

        {/* Caseta Detalii comunicate de tehnician */}
        {business.state.selectedFisaId && (
          <LeadTechnicianDetailsSection
            isOpen={business.state.isTechnicianDetailsOpen}
            onOpenChange={business.state.setIsTechnicianDetailsOpen}
            entries={technicianDetailsMerged}
            canEdit={isDepartmentPipeline}
            onAppend={business.appendTechnicianDetail}
            saving={business.state.savingTechnicianDetails}
            loading={business.state.loadingTechnicianDetails}
          />
        )}

        {/* Caseta 2: Informații contact */}
        <LeadContactInfo
          lead={lead}
          isContactOpen={business.state.isContactOpen}
          setIsContactOpen={business.state.setIsContactOpen}
          copiedField={business.state.copiedField}
          onCopy={handleCopy}
          onPhoneClick={handlePhoneClick}
          onEmailClick={handleEmailClick}
          onLeadUpdate={(updatedLead) => setLead(prev => prev ? { ...prev, ...updatedLead } : prev)}
          isVanzariPipeline={isVanzariPipeline}
          isReceptiePipeline={isReceptiePipeline}
        />

        {/* Tags + acțiuni stage/pipeline/pasare */}
        {!isDepartmentPipeline && (
          <>
            <LeadTagsSection
              allTags={business.state.allTags}
              selectedTagIds={business.state.selectedTagIds}
              assignableTags={business.tags.assignableTags}
              onToggleTag={business.tags.handleToggleTag}
              tagClass={business.tags.tagClass}
              isDepartmentTag={business.tags.isDepartmentTag}
              getDepartmentBadgeStyle={business.tags.getDepartmentBadgeStyle}
              canRemoveTag={business.tags.canRemoveTag}
            />

            {/* Acțiuni - Stage & Pipeline */}
            {!isVanzariPipeline && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase mb-2 block">
                    Schimbă Etapa
                  </label>
                  <Select value={business.state.stage} onValueChange={business.handleStageChange}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stage}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Mută în Pipeline */}
                {canMovePipeline && (
                  <LeadPipelinesSection
                    allPipeNames={business.pipelines.allPipeNames}
                    selectedPipes={business.state.selectedPipes}
                    movingPipes={business.state.movingPipes}
                    onTogglePipe={business.pipelines.togglePipe}
                    onPickAll={business.pipelines.pickAll}
                    onClearAll={business.pipelines.clearAll}
                    onBulkMove={business.pipelines.handleBulkMoveToPipelines}
                    onMoveToPipeline={business.pipelines.handleMoveToPipeline}
                  />
                )}
              </div>
            )}

            {/* Pasare tăviță */}
            {(lead as any)?.type === 'tray' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase mb-2 block">
                  Pasare Tăviță
                </label>
                <div className="flex items-center gap-2">
                  <Select
                    value={business.state.selectedTechnicianId}
                    onValueChange={business.state.setSelectedTechnicianId}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Alege tehnician" />
                    </SelectTrigger>
                    <SelectContent>
                      {business.state.technicians.map((tech) => (
                        <SelectItem key={tech.id} value={tech.id}>
                          {tech.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={business.state.passingTray || !business.state.selectedTechnicianId}
                    onClick={async () => {
                      // ... (codul rămâne neschimbat)
                    }}
                  >
                    {business.state.passingTray ? "Se atribuie…" : "Pasare"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </>
    )}
  </div>

  {/* RIGHT — tabs (Fișă / Mesagerie / Istoric) */}
  <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
    <LeadDetailsTabs
      section={business.state.section}
      onSectionChange={(s) => {
        business.state.setSection(s)
        onSectionChangeForPersist?.(s as 'fisa' | 'de-confirmat' | 'istoric')
      }}
      userMessageCount={(lead as any)?.userMessageCount ?? null}
      fisaContent={
        <>
          {/* Department Actions */}
          <LeadDepartmentActions
            isDepartmentPipeline={isDepartmentPipeline}
            isReparatiiPipeline={isReparatiiPipeline}
            isSaloaneHorecaFrizeriiPipeline={isSaloaneHorecaFrizeriiPipeline}
            onInLucru={business.departmentActions.handleInLucru}
            onFinalizare={business.departmentActions.handleFinalizare}
            onAsteptPiese={business.departmentActions.handleAsteptPiese}
            onInAsteptare={business.departmentActions.handleInAsteptare}
            currentStage={business.state.stage}
          />

          {/* Vanzari Actions */}
          <LeadVanzariActions
            isVanzariPipeline={isVanzariPipeline}
            stages={stages}
            currentStage={business.state.stage}
            callbackDate={business.state.callbackDate}
            onApelat={handleApelat}
            onRevenireLaLeaduri={handleRevenireLaLeaduri}
            noDeal={business.state.noDeal}
            nuRaspunde={business.state.nuRaspunde}
            nuRaspundeCallbackAt={business.state.nuRaspundeCallbackAt}
            onNoDealChange={business.checkboxes.handleNoDealChange}
            onNuRaspundeChange={async (checked, callbackTime) => {
              await business.checkboxes.handleNuRaspundeChange(checked, callbackTime)
              if (!checked && effectivePipelineSlug?.toLowerCase() === 'receptie' && business.state.selectedFisaId && onMoveFisaToDeFacturat) {
                await onMoveFisaToDeFacturat(business.state.selectedFisaId)
              }
            }}
            isVanzator={isVanzator}
          />

          {/* Receptie: De trimis / Ridic personal */}
          {showDeTrimisRidicButtons && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/30">
              <span className="text-sm font-medium text-muted-foreground mr-1">Mută fișa:</span>
              <Button
                size="sm"
                variant="default"
                disabled={!!moveToStageLoading}
                onClick={handleMoveToDeTrimis}
                className="gap-1.5"
                title="Mută fișa în De trimis"
              >
                {moveToStageLoading === 'de_trimis' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Package className="h-4 w-4" />
                )}
                De trimis
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!moveToStageLoading}
                onClick={handleMoveToRidicPersonal}
                className="gap-1.5"
                title="Mută fișa în Ridic personal"
              >
                {moveToStageLoading === 'ridic_personal' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4" />
                )}
                Ridic personal
              </Button>
            </div>
          )}

          {/* Service Files Selector */}
          <LeadServiceFilesSelector
            isDepartmentPipeline={isDepartmentPipeline}
            isTechnician={isTechnician}
            isVanzariPipeline={isVanzariPipeline}
            isReceptiePipeline={isReceptiePipeline}
            isVanzator={isVanzator}
            sheetSelectorInHeader={!isDepartmentPipeline && (isVanzariPipeline || (isReceptiePipeline && isVanzator))}
            serviceSheets={business.state.serviceSheets}
            selectedFisaId={business.state.selectedFisaId}
            loadingSheets={business.state.loadingSheets}
            onFisaIdChange={(fisaId) => {
              business.state.setSelectedFisaId(fisaId)
              if (fisaId) {
                business.dataLoader.calculateTotalFisaSum(fisaId)
              }
            }}
            onCreateServiceSheet={business.serviceFiles.handleCreateServiceSheet}
            allTrays={business.state.allTrays}
            selectedTrayId={business.state.selectedTrayId}
            loadingTrays={business.state.loadingTrays}
            onTrayIdChange={(trayId, fisaId) => {
              business.state.setSelectedTrayId(trayId)
              business.state.setSelectedFisaId(fisaId)
              if (fisaId) {
                business.dataLoader.calculateTotalFisaSum(fisaId)
              }
            }}
            detailsModalOpen={business.state.detailsModalOpen}
            setDetailsModalOpen={business.state.setDetailsModalOpen}
            onLoadTraysDetails={business.dataLoader.loadTraysDetails}
            loadingDetails={business.state.loadingDetails}
            traysDetails={business.state.traysDetails}
            quotes={trayTabsData.quotes}
            selectedQuoteId={trayTabsData.selectedQuoteId}
            isVanzatorMode={trayTabsData.isVanzatorMode}
            sendingTrays={trayTabsData.sendingTrays}
            traysAlreadyInDepartments={trayTabsData.traysAlreadyInDepartments}
            onTraySelect={trayTabsData.onTraySelect}
            onAddTray={trayTabsData.onAddTray}
            onDeleteTray={trayTabsData.onDeleteTray}
            onSendTrays={trayTabsData.onSendTrays}
            lead={lead}
            services={services}
            instruments={instruments}
            pipelinesWithIds={pipelinesWithIds}
            allSheetsTotal={0}
            urgentMarkupPct={30}
            subscriptionType=''
            officeDirect={officeDirect}
            curierTrimis={curierTrimis}
          />
          
          {/* Total fișă */}
          {business.state.selectedFisaId && !isDepartmentPipeline && (
            <div className="flex items-center gap-3 mb-1.5">
              {business.state.loadingTotalSum ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Se calculează...</span>
                </div>
              ) : null}
            </div>
          )}
          
          {/* Componenta Preturi */}
          {(business.state.selectedFisaId || (isDepartmentPipeline && business.state.selectedTrayId)) ? (
            <PreturiMain
              ref={preturiRef}
              leadId={business.getLeadId()}
              lead={lead}
              fisaId={business.state.selectedFisaId || undefined}
              initialQuoteId={isDepartmentPipeline && business.state.selectedTrayId ? business.state.selectedTrayId : ((lead as any)?.isQuote ? (lead as any)?.quoteId : business.getTrayId() || undefined)}
              pipelineSlug={effectivePipelineSlug}
              isDepartmentPipeline={isDepartmentPipeline}
              initialServiceFileStage={(lead as any)?.stage ?? undefined}
              serviceFileNumber={
                business.state.selectedFisaId 
                  ? business.state.serviceSheets.find(s => s.id === business.state.selectedFisaId)?.number
                  : undefined
              }
              onAfterFacturare={onRefresh}
              onAfterSendTrays={onRefresh}
              onAfterSave={onRefresh}
              onAfterDeleteTray={onRefresh}
              onClose={onClose}
              showUrgentareButton={itemType === 'service_file' || itemType === 'tray'}
              isUrgentare={isUrgentare}
              isUrgentaring={isUrgentaring}
              onUrgentareClick={handleUrgentareClick}
            />
          ) : (business.state.serviceSheets.length === 0 && !isDepartmentPipeline) || (isDepartmentPipeline && business.state.allTrays.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm font-medium text-foreground mb-2">Nu există fișe de serviciu</p>
              <p className="text-xs text-muted-foreground mb-4">
                Creează o fișă nouă pentru a începe să adaugi servicii și piese
              </p>
              <Button
                variant="default"
                size="sm"
                onClick={business.serviceFiles.handleCreateServiceSheet}
                disabled={business.state.loadingSheets}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {business.state.loadingSheets ? 'Se creează...' : 'Creează prima fișă'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">
                {isDepartmentPipeline ? 'Selectează o tăviță' : 'Selectează o fișă de serviciu'}
              </p>
            </div>
          )}
        </>
      }
      deConfirmatContent={
        business.getLeadId() ? (
          <LeadMessengerSection
            isMessengerOpen={business.state.isMessengerOpen}
            setIsMessengerOpen={business.state.setIsMessengerOpen}
            leadId={business.getLeadId()!}
            leadTechnician={lead?.technician}
            quotes={trayTabsData.quotes}
            selectedQuoteId={trayTabsData.selectedQuoteId}
            isDepartmentPipeline={isDepartmentPipeline}
          />
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Nu este disponibil</p>
          </div>
        )
      }
      istoricContent={
        <LeadHistoryWithStacking 
          leadId={business.getLeadId()} 
          serviceFileId={business.state.selectedFisaId}
          trayId={trayTabsData.selectedQuoteId || null}
          isVanzariPipeline={isVanzariPipeline}
          isReceptiePipeline={isReceptiePipeline}
          isDepartmentPipeline={isDepartmentPipeline}
        />
      }
    />
  </div>
</div>

      {/* Dialog de confirmare pentru ștergere (lead / fișă / tăviță în funcție de view) */}
      <AlertDialog open={business.state.showDeleteDialog} onOpenChange={business.state.setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {itemType === 'tray' && 'Ești sigur că vrei să ștergi această tăviță?'}
              {itemType === 'service_file' && 'Ești sigur că vrei să ștergi această fișă de serviciu?'}
              {itemType === 'lead' && 'Ești sigur că vrei să ștergi acest lead?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itemType === 'tray' && (
                <>Această acțiune va șterge permanent tăvița și toate item-urile din ea. <strong className="text-red-600">Ireversibil.</strong></>
              )}
              {itemType === 'service_file' && (
                <>Această acțiune va șterge permanent fișa de serviciu și toate tăvițele ei. Lead-ul rămâne. <strong className="text-red-600">Ireversibil.</strong></>
              )}
              {itemType === 'lead' && (
                <>
                  Această acțiune va șterge permanent lead-ul "{lead?.name}" și toate datele asociate:
                  <ul className="list-disc list-inside mt-2 space-y-1 ml-4">
                    <li>Toate fișele de serviciu</li>
                    <li>Toate tăvițele și item-urile</li>
                    <li>Toate tag-urile și istoricul</li>
                  </ul>
                  <strong className="text-red-600 block mt-2">Ireversibil.</strong>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={business.state.isDeleting}>Anulează</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!lead?.id) return
                business.state.setIsDeleting(true)
                try {
                  if (itemType === 'lead') {
                    const leadId = leadAny?.leadId || business.getLeadId() || lead.id
                    const { success, error } = await deleteLead(leadId)
                    if (success) {
                      toast.success(`Lead-ul "${lead.name}" a fost șters cu succes.`)
                      business.state.setShowDeleteDialog(false)
                      onClose()
                      onRefresh?.()
                      // Declanșează eveniment pentru actualizarea rezultatelor de căutare
                      window.dispatchEvent(new CustomEvent('lead:deleted', { detail: { leadId } }))
                      window.dispatchEvent(new Event('refresh'))
                    } else throw error || new Error('Eroare la ștergerea lead-ului')
                  } else if (itemType === 'service_file') {
                    const { success, error } = await deleteServiceFile(lead.id)
                    if (success) {
                      toast.success('Fișa de serviciu a fost ștearsă.')
                      business.state.setShowDeleteDialog(false)
                      onClose()
                      onRefresh?.()
                      // Declanșează eveniment pentru actualizarea rezultatelor de căutare
                      window.dispatchEvent(new CustomEvent('service_file:deleted', { detail: { serviceFileId: lead.id } }))
                      window.dispatchEvent(new Event('refresh'))
                    } else throw error || new Error('Eroare la ștergerea fișei')
                  } else {
                    const { success, error } = await deleteTray(lead.id)
                    if (success) {
                      toast.success('Tăvița a fost ștearsă.')
                      business.state.setShowDeleteDialog(false)
                      onClose()
                      onRefresh?.()
                      // Declanșează eveniment pentru actualizarea rezultatelor de căutare
                      window.dispatchEvent(new CustomEvent('tray:deleted', { detail: { trayId: lead.id } }))
                      window.dispatchEvent(new Event('refresh'))
                    } else throw error || new Error('Eroare la ștergerea tăviței')
                  }
                } catch (error: any) {
                  console.error('Eroare la ștergere:', error)
                  toast.error(error?.message || 'A apărut o eroare la ștergere.')
                } finally {
                  business.state.setIsDeleting(false)
                }
              }}
              disabled={business.state.isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {business.state.isDeleting ? "Se șterge..." : "Șterge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
