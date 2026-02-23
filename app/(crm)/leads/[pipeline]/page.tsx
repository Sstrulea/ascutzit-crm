"use client"

import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { debounce, normalizePhoneNumber, matchesPhoneNumber } from "@/lib/utils"
import { KanbanBoard } from "@/components/kanban"
import { MobileBoardLayout } from "@/components/mobile/mobile-board-layout"
import dynamic from "next/dynamic"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { ToastAction } from "@/components/ui/toast"
import { useKanbanData } from "@/hooks/useKanbanData"
import type { KanbanLead } from '@/lib/types/database'
import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus, Settings2, Filter, X, UserPlus, Loader2, User, MapPin, Building2, Phone, Mail, LayoutGrid, Package, ChevronDown, SlidersHorizontal, Eye, EyeOff, Archive } from "lucide-react"
import { useRole, useAuthContext } from '@/lib/contexts/AuthContext'
import { useSidebar } from '@/lib/contexts/SidebarContext'
import { AppSidebar as Sidebar, LoadingScreen } from '@/components/layout'
import { moveLeadToPipelineByName, getPipelineOptions, updatePipelineAndStages, logLeadEvent, logItemEvent } from "@/lib/supabase/leadOperations"
import { invalidateStageIdsCache } from "@/lib/supabase/tehnicianDashboardStageIdsCache"
import { clearDashboardFullCache } from "@/lib/supabase/tehnicianDashboard"
import { usePipelinesCache } from "@/hooks/usePipelinesCache"
import { PipelineEditor, StageOrderCustomizer } from "@/components/settings"
import { Tag } from "@/lib/supabase/tagOperations"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createLeadWithPipeline } from "@/lib/supabase/leadOperations"
import { createServiceFile, getNextGlobalServiceFileNumber, updateServiceFile } from "@/lib/supabase/serviceFileOperations"
import { addServiceFileToPipeline } from "@/lib/supabase/pipelineOperations"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useUserPreferences } from "@/hooks/useUserPreferences"
import { useTechnicians } from "@/hooks/queries/use-technicians"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { listTrayItemsForTray, updateTray, updateTrayItem } from "@/lib/supabase/serviceFileOperations"
import { moveItemToStage, getSingleKanbanItem } from "@/lib/supabase/pipelineOperations"
import { matchesStagePattern } from "@/lib/supabase/kanban/constants"
import { DeFacturatOverlay } from "@/components/leads/DeFacturatOverlay"
import { searchTraysGlobally } from "@/lib/supabase/traySearchOperations"
import { TRAY_SEARCH_OPEN_KEY, PENDING_SEARCH_OPEN_KEY, PENDING_SEARCH_OPEN_TTL_MS, type TraySearchOpenPayload } from "@/components/search/SmartTraySearch"
import { NetworkStatusBanner } from "@/components/ui/network-status-banner"

type Technician = {
  id: string // user_id din app_members
  name: string
  email?: string // Email opțional
}

const supabase = supabaseBrowser()

const toSlug = (s: string) => String(s).toLowerCase().replace(/\s+/g, "-")

/** Stage-uri Vânzări ascunse implicit; doar admin le poate afișa cu butonul dedicat. */
function isHiddenVanzariStage(stageName: string): boolean {
  const n = String(stageName || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (n.includes('avem') && n.includes('comand')) return true
  if (n.includes('curier') && n.includes('trimis')) return true
  if (n.includes('office') && n.includes('direct')) return true
  return false
}

const LeadDetailsPanel = dynamic(
  () => import("@/components/leads/lead-details-panel").then(m => m.LeadDetailsPanel),
  { ssr: false }
)

export default function CRMPage() {
  const params = useParams<{ pipeline?: string }>()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pipelineSlug =
    params?.pipeline ??
    pathname.match(/^\/leads\/([^\/?#]+)/)?.[1] ??
    undefined

  const { toast } = useToast()
  const router = useRouter()
  const { sidebarWidth } = useSidebar()
  
  // Detectare dimensiune ecran pentru layout responsive
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768) // md breakpoint
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorData, setEditorData] = useState<{
    pipelineId: string
    pipelineName: string
    stages: { id: string; name: string }[]
  } | null>(null)

  // State pentru dialog customizare ordine stage-uri
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const { isOwner, role } = useRole()
  const { hasAccess, isMember, loading: authLoading, user } = useAuthContext()
  
  const [createStageOpen, setCreateStageOpen] = useState(false)
  const [stageName, setStageName] = useState("")
  const [creatingStage, setCreatingStage] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)
  
  // State pentru dialog-ul de creare lead nou
  const [createLeadOpen, setCreateLeadOpen] = useState(false)
  const [newLeadData, setNewLeadData] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    company_name: '',
    city: '',
    judet: '',
    strada: '',
    zip: '',
    // Persoana de contact pentru livrare
    contact_person: '',
    contact_phone: '',
    // Date de facturare
    billing_nume_prenume: '',
    billing_nume_companie: '',
    billing_cui: '',
    billing_strada: '',
    billing_oras: '',
    billing_judet: '',
    billing_cod_postal: ''
  })
  const [creatingLead, setCreatingLead] = useState(false)
  /** Când creezi lead din Receptie: stage-ul în care va apărea fișa (Curier trimis, De facturat, Office direct etc.) */
  const [receptieStageId, setReceptieStageId] = useState<string | null>(null)
  const [receptieStagesForSelect, setReceptieStagesForSelect] = useState<Array<{ id: string; name: string }>>([])
  /** Când creezi lead din Parteneri: stage-ul obligatoriu (Savy, Annete, PodoCliniq) */
  const [partnerStageId, setPartnerStageId] = useState<string | null>(null)
  const [partnerStagesForSelect, setPartnerStagesForSelect] = useState<Array<{ id: string; name: string }>>([])
  const [selectedLead, setSelectedLead] = useState<KanbanLead | null>(null)
  const [leadPosition, setLeadPosition] = useState<{ x: number; y: number; side: 'left' | 'right' } | null>(null)
  /** Overlay special pentru carduri din stage-ul DE FACTURAT */
  const [deFacturatOverlayOpen, setDeFacturatOverlayOpen] = useState(false)
  const [deFacturatOverlayLead, setDeFacturatOverlayLead] = useState<KanbanLead | null>(null)
  const [pipelineOptions, setPipelineOptions] = useState<{ name: string; activeStages: number }[]>([])
  /** Secțiune (tab) restaurată din cache – transmisă panelului ca defaultSection. */
  const [restoredOpenCardSection, setRestoredOpenCardSection] = useState<'fisa' | 'de-confirmat' | 'istoric' | null>(null)

  // Persistăm cardul deschis ca să nu îl pierdem la tab switch / tab discard / re-render-uri agresive.
  const OPEN_CARD_KEY = 'crm:open-card:v1'
  type OpenCardPayload = {
    pipelineSlug: string
    pipelineId: string
    itemType: 'lead' | 'service_file' | 'tray'
    itemId: string
    openedAt: number
    /** true dacă s-a deschis doar overlay-ul De facturat (fără panoul de detalii) */
    deFacturatOverlay?: boolean
    /** Tab activ în panel: fisa | de-confirmat | istoric – pentru restaurare la revenire */
    section?: 'fisa' | 'de-confirmat' | 'istoric'
  }
  const readOpenCard = (): OpenCardPayload | null => {
    try {
      if (typeof window === 'undefined') return null
      const raw = sessionStorage.getItem(OPEN_CARD_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as OpenCardPayload
      if (!parsed?.pipelineSlug || !parsed?.pipelineId || !parsed?.itemType || !parsed?.itemId) return null
      return parsed
    } catch {
      return null
    }
  }
  const writeOpenCard = (p: OpenCardPayload) => {
    try {
      if (typeof window === 'undefined') return
      sessionStorage.setItem(OPEN_CARD_KEY, JSON.stringify(p))
    } catch {
      // ignore
    }
  }
  const clearOpenCard = () => {
    try {
      if (typeof window === 'undefined') return
      sessionStorage.removeItem(OPEN_CARD_KEY)
    } catch {
      // ignore
    }
  }
  /** Actualizează doar secțiunea (tab) în payload-ul cardului deschis – pentru restaurare la revenire. */
  const updateOpenCardSection = (section: 'fisa' | 'de-confirmat' | 'istoric') => {
    try {
      const saved = readOpenCard()
      if (!saved) return
      writeOpenCard({ ...saved, section })
    } catch {
      // ignore
    }
  }

  // Persistăm "draft"-ul de creare lead (overlay + câmpuri), ca să nu se piardă la tab discard / refresh la revenire.
  const CREATE_LEAD_DRAFT_KEY_PREFIX = 'crm:create-lead-draft:v1'
  type CreateLeadDraftPayload = {
    pipelineSlug: string
    userId: string | null
    createLeadOpen: boolean
    newLeadData: typeof newLeadData
    savedAt: number
  }
  const getCreateLeadDraftKey = (uidOverride?: string) => {
    const pl = String(pipelineSlug || '')
    const uid = uidOverride ?? (user?.id ? String(user.id) : 'anon')
    return `${CREATE_LEAD_DRAFT_KEY_PREFIX}:${pl}:${uid}`
  }
  const readCreateLeadDraft = (): CreateLeadDraftPayload | null => {
    try {
      if (typeof window === 'undefined') return null
      const primaryKey = getCreateLeadDraftKey()
      const rawPrimary = sessionStorage.getItem(primaryKey)
      const rawFallback = !rawPrimary ? sessionStorage.getItem(getCreateLeadDraftKey('anon')) : null
      const raw = rawPrimary || rawFallback
      if (!raw) return null
      const parsed = JSON.parse(raw) as CreateLeadDraftPayload
      if (!parsed?.pipelineSlug) return null
      return parsed
    } catch {
      return null
    }
  }
  const writeCreateLeadDraft = (p: CreateLeadDraftPayload) => {
    try {
      if (typeof window === 'undefined') return
      // Dacă între timp s-a încărcat userId, scriem pe cheia user-ului și curățăm fallback-ul "anon"
      const key = getCreateLeadDraftKey()
      sessionStorage.setItem(key, JSON.stringify(p))
      if (user?.id) {
        sessionStorage.removeItem(getCreateLeadDraftKey('anon'))
      }
    } catch {
      // ignore
    }
  }
  const clearCreateLeadDraft = () => {
    try {
      if (typeof window === 'undefined') return
      sessionStorage.removeItem(getCreateLeadDraftKey())
      sessionStorage.removeItem(getCreateLeadDraftKey('anon'))
    } catch {
      // ignore
    }
  }

  const createLeadDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visibilityRetryRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const hasCreateLeadDraftContent = useMemo(() => {
    try {
      return Object.values(newLeadData).some((v) => String(v ?? '').trim().length > 0)
    } catch {
      return false
    }
  }, [newLeadData])

  // Salvează draft-ul (debounced) când dialogul e deschis / utilizatorul tastează.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const pl = String(pipelineSlug || '')
    if (!pl) return

    if (createLeadDraftTimerRef.current) {
      clearTimeout(createLeadDraftTimerRef.current)
      createLeadDraftTimerRef.current = null
    }

    createLeadDraftTimerRef.current = setTimeout(() => {
      // Dacă nu e deschis și nu există conținut, nu păstrăm nimic.
      if (!createLeadOpen && !hasCreateLeadDraftContent) {
        clearCreateLeadDraft()
        return
      }
      writeCreateLeadDraft({
        pipelineSlug: pl,
        userId: user?.id ?? null,
        createLeadOpen,
        newLeadData,
        savedAt: Date.now(),
      })
    }, 200)

    return () => {
      if (createLeadDraftTimerRef.current) {
        clearTimeout(createLeadDraftTimerRef.current)
        createLeadDraftTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineSlug, user?.id, createLeadOpen, newLeadData, hasCreateLeadDraftContent])

  // Restore: refacem doar conținutul formularului din draft (fără a redeschide modalul).
  // Modalul nu se deschide automat la refresh/tab – doar când utilizatorul apasă „Add New Lead”.
  useEffect(() => {
    const tryRestoreDraftContent = () => {
      if (createLeadOpen) return
      const draft = readCreateLeadDraft()
      if (!draft) return
      const pl = String(pipelineSlug || '')
      if (!pl || draft.pipelineSlug !== pl) return
      setNewLeadData(draft.newLeadData)
      // Nu apelăm setCreateLeadOpen(true) – utilizatorul deschide manual modalul.
    }

    tryRestoreDraftContent()

    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
      tryRestoreDraftContent()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineSlug, user?.id, createLeadOpen, hasCreateLeadDraftContent])

  // Nu închidem panelul când utilizatorul revine în fereastră.
  // Închidere doar explicit (buton Close / Escape).
  useEffect(() => {
    if (!selectedLead) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleCloseModal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead])

  const urlQuery = searchParams?.get('q') ?? ''

  // Filtru pentru dată, căutare și tehnician (searchQuery sincronizat cu URL ?q= din search bar-ul unic)
  const [filters, setFilters] = useState<{
    dateFilter: {
      startDate: string | null
      endDate: string | null
      enabled: boolean
    }
    searchQuery: string
    technicianId: string | null
  }>({
    dateFilter: {
      startDate: null,
      endDate: null,
      enabled: false
    },
    searchQuery: urlQuery,
    technicianId: null
  })

  // Sincronizează filters.searchQuery cu URL ?q= (setat de search bar-ul unic din layout)
  useEffect(() => {
    setFilters((prev) => (prev.searchQuery !== urlQuery ? { ...prev, searchQuery: urlQuery } : prev))
  }, [urlQuery])

  // ID-uri care match-ează căutarea după serial (fișă, tăviță) – folosit în filter
  const [serialSearchMatchIds, setSerialSearchMatchIds] = useState<{
    leadIds: string[]
    serviceFileIds: string[]
    trayIds: string[]
  }>({ leadIds: [], serviceFileIds: [], trayIds: [] })

  // Tehnicieni - folosim hook cu cache (30 min) pentru a evita API calls pe fiecare navigare
  const { data: techniciansData, isLoading: loadingTechnicians } = useTechnicians()
  
  // Transformăm datele pentru a menține compatibilitatea cu restul componentei
  const technicians: Technician[] = useMemo(() => {
    if (!techniciansData) return []
    return techniciansData.map(member => ({
      id: member.user_id,
      name: member.name || `User ${member.user_id.slice(0, 8)}`
    })).sort((a, b) => a.name.localeCompare(b.name))
  }, [techniciansData])

  const [vanzariQuickFilter, setVanzariQuickFilter] = useState<null | 'sunati' | 'callback' | 'no_deal' | 'yes_deal' | 'curier_trimis' | 'office_direct'>(null)
  const [vanzariApeluriAzi, setVanzariApeluriAzi] = useState<null | {
    total: number
    byType: { comanda: number; noDeal: number; callback: number; nuRaspunde: number }
    leadIdsByType: { comanda: string[]; noDeal: string[]; callback: string[]; nuRaspunde: string[]; all: string[] }
    fetchedAt: number
  }>(null)
  const [leadToOpenAfterCreate, setLeadToOpenAfterCreate] = useState<KanbanLead | null>(null)
  /** Când deschidem detaliile unui lead creat din Recepție, forțăm VanzariView (fișă, instrumente, servicii, mutare Avem Comanda). */
  const [overridePipelineSlugForPanel, setOverridePipelineSlugForPanel] = useState<string | null>(null)
  /** Dacă deschiderea vine din altă pagină (ex. dashboard tehnician), la Close revenim aici. */
  const [returnToAfterClose, setReturnToAfterClose] = useState<string | null>(null)
  const { getPipelines } = usePipelinesCache()
  // La revenire pe tab: dacă avem un card salvat pentru pipeline-ul curent, nu facem auto-refresh
  // (altfel loadData() face setLoading(true) și apare LoadingScreen, panoul se pierde).
  const hasRestorableOpenCard = (() => {
    try {
      if (typeof window === 'undefined') return false
      const raw = sessionStorage.getItem(OPEN_CARD_KEY)
      if (!raw) return false
      const p = JSON.parse(raw) as OpenCardPayload
      return !!(p?.pipelineSlug && p?.pipelineId && p?.itemType && p?.itemId && toSlug(p.pipelineSlug) === toSlug(String(pipelineSlug || '')))
    } catch { return false }
  })()
  const { leads, stages, pipelines: allPipelines, loading, error, handleLeadMove, refresh, patchLeadTags, patchLeadClaim, patchLeadDeliveryClear, handlePinToggle, updateItemStage, getCachedPipelinesWithStages, addNewItemToBoard, patchNuRaspundeReceptie } = useKanbanData(pipelineSlug, { skipAutoRefreshOnVisible: !!selectedLead || createLeadOpen || hasRestorableOpenCard })
  
  // Preferințe utilizator pentru customizare
  const { getStageOrder, setStageOrder } = useUserPreferences()
  
  // Ordinea customizată a stage-urilor
  const orderedStages = useMemo(() => {
    if (!pipelineSlug) return stages
    return getStageOrder(pipelineSlug, stages)
  }, [pipelineSlug, stages, getStageOrder])

  // Arhivare Ridicat + Trimis (Receptie): stage Arhivat și fișe din De trimis / Ridic personal
  const arhivatStageName = useMemo(() => stages.find(s => String(s || '').toLowerCase().includes('arhivat')) ?? null, [stages])
  const ridicatTrimisFiseIds = useMemo(() => {
    if (pipelineSlug?.toLowerCase() !== 'receptie') return []
    return leads
      .filter((l: any) => (l as any).type === 'service_file' && (l as any).stage)
      .filter((l: any) => {
        const s = String((l as any).stage || '').toLowerCase()
        return s.includes('de trimis') || s.includes('ridic personal')
      })
      .map(l => l.id)
  }, [pipelineSlug, leads])
  const [archiveRidicatTrimisLoading, setArchiveRidicatTrimisLoading] = useState(false)

  // Vânzări: stage-urile Avem Comandă, Curier trimis, Office direct sunt ascunse; admin poate le afișa cu butonul dedicat
  const isVanzariPipeline = pipelineSlug?.toLowerCase() === 'vanzari'
  const [showHiddenVanzariStages, setShowHiddenVanzariStages] = useState(false)
  const visibleStages = useMemo(() => {
    if (!isVanzariPipeline || showHiddenVanzariStages) return orderedStages
    return orderedStages.filter((s) => !isHiddenVanzariStage(s))
  }, [isVanzariPipeline, showHiddenVanzariStages, orderedStages])

  /** Actualizare taguri în același timp pe board și în panoul de detalii (dacă e deschis pentru acel lead). */
  const handleTagsChange = useCallback((leadId: string, tags: Tag[]) => {
    patchLeadTags(leadId, tags)
    setSelectedLead((prev) => {
      if (!prev) return null
      const match = prev.id === leadId || (prev as any).leadId === leadId
      return match ? { ...prev, tags } : prev
    })
  }, [patchLeadTags])

  /** Receptie: la scoaterea tag-ului „Nu răspunde” de pe o fișă – curăță nu_raspunde_callback_at pe fișă și mută cardul în De facturat. */
  const moveServiceFileToDeFacturat = useCallback(async (serviceFileId: string) => {
    const cached = getCachedPipelinesWithStages()
    const receptiePipe = cached?.find((p: any) => toSlug(p?.name || '') === 'receptie')
    const stages = receptiePipe?.stages as Array<{ id: string; name: string }> | undefined
    const deFacturatStage = stages?.find((s: any) => matchesStagePattern(String(s?.name || ''), 'DE_FACTURAT'))
    if (!receptiePipe?.id || !deFacturatStage?.id) {
      console.warn('[moveServiceFileToDeFacturat] Pipeline Receptie sau stage De facturat negăsit')
      refresh?.()
      return
    }
    try {
      await updateServiceFile(serviceFileId, { nu_raspunde_callback_at: null })
      const { error } = await moveItemToStage('service_file', serviceFileId, receptiePipe.id, deFacturatStage.id)
      if (error) console.warn('[moveServiceFileToDeFacturat] moveItemToStage:', error)
      refresh?.()
    } catch (e) {
      console.warn('[moveServiceFileToDeFacturat]', e)
      refresh?.()
    }
  }, [getCachedPipelinesWithStages, refresh])
  
  // State pentru pipeline-uri cu ID-uri (pentru verificarea permisiunilor)
  const [pipelinesWithIds, setPipelinesWithIds] = useState<Array<{ id: string; name: string }>>([])
  
  // Încarcă pipeline-urile cu ID-uri pentru verificarea permisiunilor (folosește cache partajat)
  useEffect(() => {
    async function loadPipelinesWithIds() {
      if (authLoading) return
      const data = await getPipelines()
      if (data?.length) {
        setPipelinesWithIds(data.map((p: any) => ({ id: p.id, name: p.name })))
      }
    }
    loadPipelinesWithIds()
  }, [authLoading, getPipelines])
  
  // Filtrează pipeline-urile bazat pe permisiuni reale
  const pipelines = useMemo(() => {
    if (!isMember()) return allPipelines
    
    // Pentru membri, filtrează doar pipeline-urile pentru care au permisiune
    return allPipelines.filter(p => {
      const pipelineWithId = pipelinesWithIds.find(pid => pid.name === p)
      return pipelineWithId ? hasAccess(pipelineWithId.id) : false
    })
  }, [allPipelines, pipelinesWithIds, hasAccess, isMember])
  
  // Când deschizi dialogul de creare lead din Receptie: încarcă stage-urile și setează implicit (prefer Curier trimis)
  useEffect(() => {
    if (!createLeadOpen || pipelineSlug?.toLowerCase() !== 'receptie') return
    const cached = getCachedPipelinesWithStages()
    const receptiePipe = cached?.find((p: any) => toSlug(p?.name || '') === 'receptie')
    const stages = (receptiePipe?.stages || []) as Array<{ id: string; name: string }>
    setReceptieStagesForSelect(stages)
    if (stages.length === 0) return
    const curierTrimis = stages.find(s => {
      const n = String(s?.name || '').toLowerCase()
      return n.includes('curier') && n.includes('trimis')
    })
    setReceptieStageId(curierTrimis?.id ?? stages[0]?.id ?? null)
  }, [createLeadOpen, pipelineSlug, getCachedPipelinesWithStages])

  // Când deschizi dialogul de creare lead din Parteneri: încarcă stage-urile și filtrează doar Savy, Annete, PodoCliniq
  useEffect(() => {
    if (!createLeadOpen || pipelineSlug?.toLowerCase() !== 'parteneri') return
    const cached = getCachedPipelinesWithStages()
    const partnerPipe = cached?.find((p: any) => toSlug(p?.name || '') === 'parteneri')
    const allStages = (partnerPipe?.stages || []) as Array<{ id: string; name: string }>
    const allowedNames = ['savy', 'annete', 'podocliniq']
    const filtered = allStages.filter(s => allowedNames.includes(String(s?.name || '').toLowerCase().trim()))
    setPartnerStagesForSelect(filtered)
    setPartnerStageId(filtered.length > 0 ? filtered[0].id : null)
  }, [createLeadOpen, pipelineSlug, getCachedPipelinesWithStages])

  // Redirectează membrii dacă încearcă să acceseze un pipeline nepermis (Owner/Admin au acces la toate)
  // Debounce 1500ms: runOpenFromUrl e async (DB queries), are nevoie de timp să deschidă panoul
  const REDIRECT_DEBOUNCE_MS = 1500
  useEffect(() => {
    if (authLoading || !isMember() || !pipelineSlug || pipelinesWithIds.length === 0) return
    if (isOwner || role === 'admin') return
    // Nu redirecționa când deschidem un item din search – lasă efectul să deschidă panoul
    if (searchParams.get('openLeadId') || searchParams.get('openServiceFileId') || searchParams.get('openTrayId')) return
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem(TRAY_SEARCH_OPEN_KEY) : null
      if (raw) {
        const payload = JSON.parse(raw) as TraySearchOpenPayload
        if (payload?.pipelineSlug && toSlug(payload.pipelineSlug) === toSlug(pipelineSlug)) return
      }
      // Flag „pending open from search” – blocăm redirect chiar dacă TRAY_SEARCH_OPEN_KEY a fost deja consumat
      const pendingRaw = typeof window !== 'undefined' ? sessionStorage.getItem(PENDING_SEARCH_OPEN_KEY) : null
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw) as TraySearchOpenPayload & { at?: number }
        if (pending?.pipelineSlug && toSlug(pending.pipelineSlug) === toSlug(pipelineSlug)) {
          const at = typeof pending.at === 'number' ? pending.at : 0
          if (Date.now() - at < PENDING_SEARCH_OPEN_TTL_MS) return
        }
      }
    } catch {
      // ignore
    }

    const t = setTimeout(() => {
      // Dacă panoul de detalii e deschis (din search), nu redirecționa
      if (selectedLead) return
      // Re-verifică toate condițiile în callback (searchParams poate fi actualizat între timp)
      if (searchParams.get('openLeadId') || searchParams.get('openServiceFileId') || searchParams.get('openTrayId')) return
      try {
        const pendingRaw = typeof window !== 'undefined' ? sessionStorage.getItem(PENDING_SEARCH_OPEN_KEY) : null
        if (pendingRaw) {
          const pending = JSON.parse(pendingRaw) as TraySearchOpenPayload & { at?: number }
          if (pending?.pipelineSlug && toSlug(pending.pipelineSlug) === toSlug(pipelineSlug)) {
            const at = typeof pending.at === 'number' ? pending.at : 0
            if (Date.now() - at < PENDING_SEARCH_OPEN_TTL_MS) return
          }
        }
      } catch {
        // ignore
      }
      const currentPipeline = pipelinesWithIds.find(p => toSlug(p.name) === pipelineSlug.toLowerCase())
      if (currentPipeline && !hasAccess(currentPipeline.id)) {
        const firstAllowed = pipelinesWithIds.find(p => hasAccess(p.id))
        if (firstAllowed) {
          router.replace(`/leads/${toSlug(firstAllowed.name)}`)
        } else {
          router.replace('/dashboard')
        }
      }
    }, REDIRECT_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [isMember, pipelineSlug, pipelinesWithIds, hasAccess, authLoading, router, searchParams, isOwner, role, selectedLead])

  // Curățare flag „pending search open” expirat (TTL) ca să nu rămână blocat redirect-ul
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const raw = sessionStorage.getItem(PENDING_SEARCH_OPEN_KEY)
      if (!raw) return
      const pending = JSON.parse(raw) as { at?: number }
      const at = typeof pending?.at === 'number' ? pending.at : 0
      if (Date.now() - at >= PENDING_SEARCH_OPEN_TTL_MS) sessionStorage.removeItem(PENDING_SEARCH_OPEN_KEY)
    } catch {
      // ignore
    }
  }, [pipelineSlug])

  // În Receptie: când se deschide un lead din search, deschidem ultima lui fișă în loc de lead
  const getLastServiceFileIdForLead = useCallback(async (leadId: string): Promise<string | null> => {
    const { data } = await supabase
      .from('service_files')
      .select('id')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data?.id ?? null
  }, [])

  // SmartSearch tăviță: deschide detaliul conform pipeline-ului (fișă / lead / tăviță)
  const openTraySearchResult = useCallback(
    async (payload: TraySearchOpenPayload) => {
      if (!pipelineSlug || toSlug(payload.pipelineSlug) !== toSlug(pipelineSlug)) {
        return
      }
      let openType = payload.openType
      let openId = payload.openId
      if (toSlug(pipelineSlug) === 'receptie' && payload.openType === 'lead') {
        const lastSfId = await getLastServiceFileIdForLead(payload.openId)
        if (lastSfId) {
          openType = 'service_file'
          openId = lastSfId
        }
      }

      const cached = getCachedPipelinesWithStages()
      let pipelineId = cached?.find((p: any) => toSlug(p?.name) === toSlug(pipelineSlug))?.id
      if (!pipelineId && pipelinesWithIds.length) {
        pipelineId = pipelinesWithIds.find((p) => toSlug(p.name) === toSlug(pipelineSlug))?.id ?? null
      }
      if (!pipelineId) {
        const data = await getPipelines()
        const p = data?.find((x: any) => toSlug(x?.name) === toSlug(pipelineSlug))
        pipelineId = p?.id ?? null
      }

      let item: any = null

      // Încercăm cu pipelineId-ul curent
      if (pipelineId) {
        const res = await getSingleKanbanItem(
          openType as 'lead' | 'service_file' | 'tray',
          openId,
          pipelineId
        )
        item = res.data
      }

      // Fallback: căutăm pipeline-ul real din pipeline_items
      if (!item) {
        const { data: piRow, error: piError } = await supabase
          .from('pipeline_items')
          .select('pipeline_id')
          .eq('type', openType)
          .eq('item_id', openId)
          .limit(1)
          .maybeSingle()

        if (piRow?.pipeline_id && piRow.pipeline_id !== pipelineId) {
          const res = await getSingleKanbanItem(
            openType as 'lead' | 'service_file' | 'tray',
            openId,
            piRow.pipeline_id
          )
          item = res.data
        }
      }

      if (!item) {
        if (openType === 'tray') {
          toast({
            variant: 'destructive',
            title: 'Tăvița nu mai există',
            description: 'Posibil arhivată. Conținutul a fost mutat în arhivă.',
          })
        }
        return
      }
      // Dacă avem returnTo, înseamnă că am fost deschiși din altă pagină (ex. Dashboard Tehnician)
      if (payload.returnTo) {
        setReturnToAfterClose(String(payload.returnTo))
      } else {
        setReturnToAfterClose(null)
      }
      setOverridePipelineSlugForPanel(null)
      setSelectedLead(item as any)
      setLeadPosition({ x: 0, y: 0, side: 'right' })
      try {
        if (pipelineId && pipelineSlug) {
          writeOpenCard({ pipelineSlug: String(pipelineSlug), pipelineId, itemType: openType, itemId: openId, openedAt: Date.now(), section: 'fisa' })
        }
      } catch {
        // ignore
      }
    },
    [pipelineSlug, getCachedPipelinesWithStages, pipelinesWithIds, getPipelines, toast, getLastServiceFileIdForLead]
  )

  // Deschidere din search: procesăm payload-ul doar când !loading (avem pipelineId pentru pipeline-ul curent)
  useEffect(() => {
    if (loading) return
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem(TRAY_SEARCH_OPEN_KEY) : null
      if (!raw) return
      const payload = JSON.parse(raw) as TraySearchOpenPayload
      sessionStorage.removeItem(TRAY_SEARCH_OPEN_KEY)
      openTraySearchResult(payload)
      // Curățăm și flag-ul „pending” ca redirect-ul să nu fie blocat la infinit
      sessionStorage.removeItem(PENDING_SEARCH_OPEN_KEY)
    } catch {
      // ignore
    }
  }, [pipelineSlug, loading, openTraySearchResult])

  useEffect(() => {
    const handler = (e: CustomEvent<TraySearchOpenPayload>) => {
      if (e.detail) openTraySearchResult(e.detail)
    }
    window.addEventListener('traySearchOpen', handler as EventListener)
    return () => window.removeEventListener('traySearchOpen', handler as EventListener)
  }, [openTraySearchResult])

  // Deschidere item din URL (?openLeadId= / ?openServiceFileId= / ?openTrayId=) – ex. din search
  const openLeadIdFromUrl = searchParams.get('openLeadId')
  const openServiceFileIdFromUrl = searchParams.get('openServiceFileId')
  const openTrayIdFromUrl = searchParams.get('openTrayId')

  const runOpenFromUrl = useCallback(
    async (type: 'lead' | 'service_file' | 'tray', itemId: string, urlParam: string) => {
      if (!pipelineSlug || loading) return

      // Pas 1: Determinăm pipelineId din slug-ul curent
      const cached = getCachedPipelinesWithStages()
      let pipelineId = cached?.find((p: any) => toSlug(p?.name) === toSlug(pipelineSlug))?.id
      if (!pipelineId && pipelinesWithIds.length) {
        pipelineId = pipelinesWithIds.find((p) => toSlug(p.name) === toSlug(pipelineSlug))?.id ?? null
      }
      if (!pipelineId) {
        const data = await getPipelines()
        const p = data?.find((x: any) => toSlug(x?.name) === toSlug(pipelineSlug))
        pipelineId = p?.id ?? null
      }

      let item: any = null

      // Pas 2: Încercăm cu pipelineId-ul curent
      if (pipelineId) {
        const res = await getSingleKanbanItem(type, itemId, pipelineId)
        item = res.data
      }

      // Pas 3: Dacă nu l-am găsit, căutăm pipeline-ul real din pipeline_items
      if (!item) {
        const { data: piRow, error: piError } = await supabase
          .from('pipeline_items')
          .select('pipeline_id')
          .eq('type', type)
          .eq('item_id', itemId)
          .limit(1)
          .maybeSingle()

        if (piRow?.pipeline_id && piRow.pipeline_id !== pipelineId) {
          const res = await getSingleKanbanItem(type, itemId, piRow.pipeline_id)
          item = res.data
        }
      }

      // Pas 4: Retry după scurt delay dacă pipelineId nu era încă disponibil la primul run
      if (!item && pipelineId) {
        await new Promise(r => setTimeout(r, 400))
        const res = await getSingleKanbanItem(type, itemId, pipelineId)
        item = res.data
      }

      if (!item) return

      setRestoredOpenCardSection(null)
      setSelectedLead(item as any)
      setLeadPosition({ x: 0, y: 0, side: 'right' })

      const pl = String(pipelineSlug || '')
      if (pl && pipelineId && itemId) {
        writeOpenCard({ pipelineSlug: pl, pipelineId, itemType: type, itemId, openedAt: Date.now(), section: 'fisa' })
      }

      // Curățăm URL params dar NU curățăm PENDING_SEARCH_OPEN_KEY imediat –
      // efectul de redirect (verificare permisiuni) se poate re-evalua din cauza
      // schimbării searchParams; dacă ștergem flag-ul prea devreme, redirect-ul
      // trimite utilizatorul înapoi. TTL-ul de 15s se ocupă de curățare automată.
      // Ștergem cu delay de 2s ca redirect-ul debounced (150ms) să aibă timp să citească flag-ul.
      setTimeout(() => {
        try { sessionStorage.removeItem(PENDING_SEARCH_OPEN_KEY) } catch { /* ignore */ }
      }, 2000)

      const next = new URLSearchParams(searchParams.toString())
      next.delete(urlParam)
      const q = next.toString()
      router.replace(pathname + (q ? '?' + q : ''), { scroll: false })
    },
    [pipelineSlug, loading, getCachedPipelinesWithStages, pipelinesWithIds, getPipelines, searchParams, pathname, router]
  )

  useEffect(() => {
    if (!openLeadIdFromUrl || !pipelineSlug || loading) return
    let cancelled = false
    const run = async () => {
      if (toSlug(pipelineSlug) === 'receptie') {
        const lastSfId = await getLastServiceFileIdForLead(openLeadIdFromUrl)
        if (cancelled) return
        if (lastSfId) {
          runOpenFromUrl('service_file', lastSfId, 'openLeadId')
          return
        }
      }
      runOpenFromUrl('lead', openLeadIdFromUrl, 'openLeadId')
    }
    run()
    return () => { cancelled = true }
  }, [openLeadIdFromUrl, pipelineSlug, loading, runOpenFromUrl, getLastServiceFileIdForLead])

  useEffect(() => {
    if (!openServiceFileIdFromUrl || !pipelineSlug || loading) return
    runOpenFromUrl('service_file', openServiceFileIdFromUrl, 'openServiceFileId')
  }, [openServiceFileIdFromUrl, pipelineSlug, loading, runOpenFromUrl])

  useEffect(() => {
    if (!openTrayIdFromUrl || !pipelineSlug || loading) return
    runOpenFromUrl('tray', openTrayIdFromUrl, 'openTrayId')
  }, [openTrayIdFromUrl, pipelineSlug, loading, runOpenFromUrl])

  // Căutare după serial (fișă, tăviță) – actualizează serialSearchMatchIds
  useEffect(() => {
    const q = filters.searchQuery.trim()
    if (q.length < 2) {
      setSerialSearchMatchIds({ leadIds: [], serviceFileIds: [], trayIds: [] })
      return
    }
    const t = setTimeout(async () => {
      try {
        if (typeof searchTraysGlobally !== 'function') {
          setSerialSearchMatchIds({ leadIds: [], serviceFileIds: [], trayIds: [] })
          return
        }
        const { data } = await searchTraysGlobally(q)
        if (!data?.length) {
          setSerialSearchMatchIds({ leadIds: [], serviceFileIds: [], trayIds: [] })
          return
        }
        const leadIds = [...new Set(data.map(r => r.leadId).filter(Boolean))]
        const serviceFileIds = [...new Set(data.map(r => r.serviceFileId).filter(Boolean))]
        const trayIds = [...new Set(data.map(r => r.trayId).filter(Boolean))]
        setSerialSearchMatchIds({ leadIds, serviceFileIds, trayIds })
      } catch {
        setSerialSearchMatchIds({ leadIds: [], serviceFileIds: [], trayIds: [] })
      }
    }, 300)
    return () => clearTimeout(t)
  }, [filters.searchQuery])

  const normStageName = useCallback((s: string) => {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }, [])

  const isVanzari = (pipelineSlug?.toLowerCase() || '') === 'vanzari'
  const isCallbackStageName = (s: string) => /callback|call back|call-back/.test(normStageName(s))
  const isNoDealStageName = (s: string) => /no deal|no-deal/.test(normStageName(s))
  const isYesDealStageName = (s: string) => {
    const n = normStageName(s)
    return (n.includes('avem') && n.includes('comanda')) || n.includes('comenzi active') || n.includes('yes deal')
  }
  const isSunatiStageName = (s: string) => {
    const n = normStageName(s)
    return isCallbackStageName(n) || isNoDealStageName(n) || isYesDealStageName(n) || n.includes('nu raspunde')
  }
  const isCurierTrimisStageName = (s: string) => /curier\s*trimis/.test(normStageName(s))
  const hasCurierTrimisTag = (l: any) => (Array.isArray(l?.tags) ? l.tags : []).some((t: { name?: string }) => (t?.name || '').trim().toLowerCase() === 'curier trimis')
  const isOfficeDirectStageName = (s: string) => /office\s*direct/.test(normStageName(s))
  const hasOfficeDirectTag = (l: any) => (Array.isArray(l?.tags) ? l.tags : []).some((t: { name?: string }) => (t?.name || '').trim().toLowerCase() === 'office direct')
  const isCurierAjunsAziStageName = (s: string) => {
    const n = normStageName(s)
    return n.includes('curier') && n.includes('ajuns') && n.includes('azi')
  }

  // VÂNZĂRI: apeluri doar pentru ziua curentă (azi) – folosit pentru counters și filtre.
  // Array de dependențe cu lungime fixă (obligatoriu pentru useEffect) – nu condiționa și nu adăuga/elimina elemente.
  const vanzariApeluriDeps: [
    boolean,
    typeof pipelinesWithIds,
    string | undefined,
    boolean,
    string | null,
    () => any[] | undefined,
    (s: string) => string,
  ] = [
    isVanzari,
    pipelinesWithIds,
    role,
    isOwner,
    user?.id ?? null,
    getCachedPipelinesWithStages,
    normStageName,
  ]
  useEffect(() => {
    if (!vanzariApeluriDeps[0]) {
      setVanzariApeluriAzi(null)
      return
    }
    const pipelineId = vanzariApeluriDeps[1].find((p) => (p?.name || '').toLowerCase().includes('vanzari'))?.id
    if (!pipelineId) return

    const isAdminOrOwner = vanzariApeluriDeps[2] === 'admin' || vanzariApeluriDeps[3]
    const movedBy = isAdminOrOwner ? null : vanzariApeluriDeps[4]
    if (!isAdminOrOwner && !movedBy) return

    const getCached = vanzariApeluriDeps[5]
    const norm = vanzariApeluriDeps[6]
    let cancelled = false
    ;(async () => {
      try {
        const stageIdToType = new Map<string, 'comanda' | 'noDeal' | 'callback' | 'nuRaspunde'>()
        const vanzariPipe = getCached()?.find((p: any) =>
          String(p?.name || '').toLowerCase().includes('vanzari')
        )
        const stagesArr = Array.isArray((vanzariPipe as any)?.stages) ? (vanzariPipe as any).stages : []
        for (const s of stagesArr as any[]) {
          const sid = s?.id as string
          const sn = s?.name as string
          if (!sid || !sn) continue
          const n = norm(sn)
          if (n.includes('avem') && n.includes('comanda')) stageIdToType.set(sid, 'comanda')
          else if (n.includes('no') && n.includes('deal')) stageIdToType.set(sid, 'noDeal')
          else if (n.includes('callback') || n.includes('call back') || n.includes('call-back')) stageIdToType.set(sid, 'callback')
          else if (n.includes('nu') && n.includes('raspunde')) stageIdToType.set(sid, 'nuRaspunde')
        }

        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date()
        end.setHours(23, 59, 59, 999)

        let q = (supabase as any)
          .from('vanzari_apeluri')
          .select('lead_id, to_stage_id')
          .eq('pipeline_id', pipelineId)
          .gte('apel_at', start.toISOString())
          .lte('apel_at', end.toISOString())
        if (movedBy) q = q.eq('moved_by', movedBy)

        const { data, error } = await q
        if (cancelled) return
        if (error) {
          console.error('[Vanzari] Eroare la încărcarea apelurilor de azi:', error)
          setVanzariApeluriAzi(null)
          return
        }

        const byType = { comanda: 0, noDeal: 0, callback: 0, nuRaspunde: 0 }
        const leadSets = {
          comanda: new Set<string>(),
          noDeal: new Set<string>(),
          callback: new Set<string>(),
          nuRaspunde: new Set<string>(),
          all: new Set<string>(),
        }

        for (const r of (data || []) as any[]) {
          const leadId = r?.lead_id as string
          const toStageId = r?.to_stage_id as string
          if (!leadId) continue
          leadSets.all.add(leadId)
          const t = toStageId ? stageIdToType.get(toStageId) : null
          if (!t) continue
          byType[t]++
          leadSets[t].add(leadId)
        }

        setVanzariApeluriAzi({
          total: (data || []).length,
          byType,
          leadIdsByType: {
            comanda: Array.from(leadSets.comanda),
            noDeal: Array.from(leadSets.noDeal),
            callback: Array.from(leadSets.callback),
            nuRaspunde: Array.from(leadSets.nuRaspunde),
            all: Array.from(leadSets.all),
          },
          fetchedAt: Date.now(),
        })
      } catch (e) {
        if (!cancelled) setVanzariApeluriAzi(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, vanzariApeluriDeps)

  // Filtrează lead-urile (filtrele clasice: dată, search, tehnician)
  const baseFilteredLeads = useMemo(() => {
    let result = [...leads]

    // Filtrare după dată
    if (filters.dateFilter.enabled && (filters.dateFilter.startDate || filters.dateFilter.endDate)) {
      result = result.filter(lead => {
        if (!lead.createdAt) return true // Păstrează lead-urile fără dată

        const leadDate = new Date(lead.createdAt)
        const startDate = filters.dateFilter.startDate ? new Date(filters.dateFilter.startDate) : null
        const endDate = filters.dateFilter.endDate ? new Date(filters.dateFilter.endDate + 'T23:59:59') : null

        if (startDate && leadDate < startDate) return false
        if (endDate && leadDate > endDate) return false

        return true
      })
    }

    // Căutare universală - caută în toate câmpurile disponibile + fișă/tăviță după serial instrument
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase().trim()
      const normalizedQuery = normalizePhoneNumber(query)
      const leadIdSet = new Set(serialSearchMatchIds.leadIds)
      const serviceFileIdSet = new Set(serialSearchMatchIds.serviceFileIds)
      const trayIdSet = new Set(serialSearchMatchIds.trayIds)

      result = result.filter(lead => {
        const leadAny = lead as any

        // Match după serial (fișă, tăviță) – searchTraysGlobally
        if (leadIdSet.size || serviceFileIdSet.size || trayIdSet.size) {
          if (lead.leadId && leadIdSet.has(lead.leadId)) return true
          if (leadAny.type === 'lead' && lead.id && leadIdSet.has(lead.id)) return true
          if (leadAny.type === 'service_file' && lead.id && serviceFileIdSet.has(lead.id)) return true
          if (leadAny.type === 'tray' && (trayIdSet.has(lead.id) || (leadAny.realTrayId && trayIdSet.has(leadAny.realTrayId)))) return true
        }

        // Caută în câmpurile de bază
        if (lead.name?.toLowerCase().includes(query)) return true
        if (lead.email?.toLowerCase().includes(query)) return true
        
        // Căutare normalizată pentru număr de telefon (suportă +40, 40, 0721, etc.)
        if (normalizedQuery && matchesPhoneNumber(query, lead.phone)) return true
        // Fallback la căutare normală dacă nu este un număr
        if (!normalizedQuery && lead.phone?.toLowerCase().includes(query)) return true
        
        // Caută în câmpurile de campanie/ad/form
        if (lead.campaignName?.toLowerCase().includes(query)) return true
        if (lead.adName?.toLowerCase().includes(query)) return true
        if (lead.formName?.toLowerCase().includes(query)) return true
        
        // Caută în tag-uri - FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
        const leadTags = Array.isArray(lead?.tags) ? lead.tags : []
        if (Array.isArray(leadTags)) {
          for (let i = 0; i < leadTags.length; i++) {
            const tag = leadTags[i]
            if (tag && tag.name && tag.name.toLowerCase().includes(query)) {
              return true
            }
          }
        }
        
        // Caută în tehnician
        if (lead.technician?.toLowerCase().includes(query)) return true
        
        // Caută în stage
        if (lead.stage?.toLowerCase().includes(query)) return true
        
        // Pentru service files
        if (leadAny.serviceFileNumber?.toLowerCase().includes(query)) return true
        if (leadAny.serviceFileStatus?.toLowerCase().includes(query)) return true
        
        // Pentru trays/quotes
        if (leadAny.trayNumber?.toLowerCase().includes(query)) return true
        if (leadAny.traySize?.toLowerCase().includes(query)) return true
        if (leadAny.trayStatus?.toLowerCase().includes(query)) return true
        if (leadAny.leadName?.toLowerCase().includes(query)) return true
        if (leadAny.department?.toLowerCase().includes(query)) return true
        
        // Caută în total (convertit la string)
        if (leadAny.total !== undefined && String(leadAny.total).includes(query)) return true
        
        // Caută în ID-uri (dacă utilizatorul caută după ID)
        if (lead.id?.toLowerCase().includes(query)) return true
        if (lead.leadId?.toLowerCase().includes(query)) return true
        
        return false
      })
    }

    // Filtrare după tehnician
    if (filters.technicianId) {
      const selectedTechnician = technicians.find(t => t.id === filters.technicianId)
      if (selectedTechnician) {
        result = result.filter(lead => {
          if (!lead.technician) return false
          return lead.technician === selectedTechnician.name
        })
      }
    }

    return result
  }, [leads, filters, technicians, serialSearchMatchIds])

  // Filtru rapid Vânzări (secțiune: Sunati / CallBack / No deal / Yes deal)
  // Sunați = cei sunați în ziua de azi (apel înregistrat azi în vanzari_apeluri)
  const filteredLeads = useMemo(() => {
    if (!isVanzari || !vanzariQuickFilter) return baseFilteredLeads
    const isSunatiLeadByStage = (l: any) => {
      const st = (l as any)?.stage || ''
      return (isCurierTrimisStageName(st) || hasCurierTrimisTag(l)) || (isOfficeDirectStageName(st) || hasOfficeDirectTag(l)) || isNoDealStageName(st)
    }
    if (vanzariApeluriAzi?.leadIdsByType) {
      const sets = {
        callback: new Set(vanzariApeluriAzi.leadIdsByType.callback || []),
        noDeal: new Set(vanzariApeluriAzi.leadIdsByType.noDeal || []),
        yesDeal: new Set(vanzariApeluriAzi.leadIdsByType.comanda || []),
        sunatiAzi: new Set(vanzariApeluriAzi.leadIdsByType.all || []),
      }
      return baseFilteredLeads.filter((l: any) => {
        const leadId = l?.leadId || l?.id
        if (!leadId) return false
        if (vanzariQuickFilter === 'sunati') return sets.sunatiAzi.has(leadId)
        if (vanzariQuickFilter === 'curier_trimis') return isCurierAjunsAziStageName((l as any)?.stage || '') && (isCurierTrimisStageName((l as any)?.stage || '') || hasCurierTrimisTag(l))
        if (vanzariQuickFilter === 'office_direct') return isCurierAjunsAziStageName((l as any)?.stage || '') && (isOfficeDirectStageName((l as any)?.stage || '') || hasOfficeDirectTag(l))
        if (vanzariQuickFilter === 'callback') return sets.callback.has(leadId)
        if (vanzariQuickFilter === 'no_deal') return sets.noDeal.has(leadId)
        if (vanzariQuickFilter === 'yes_deal') return sets.yesDeal.has(leadId)
        return isSunatiLeadByStage(l)
      })
    }
    // Fără apeluri azi: fallback după stage/tag; Sunați = Curier/Office/No deal
    return baseFilteredLeads.filter((l) => {
      const st = (l as any)?.stage || ''
      if (vanzariQuickFilter === 'curier_trimis') return isCurierAjunsAziStageName(st) && (isCurierTrimisStageName(st) || hasCurierTrimisTag(l))
      if (vanzariQuickFilter === 'office_direct') return isCurierAjunsAziStageName(st) && (isOfficeDirectStageName(st) || hasOfficeDirectTag(l))
      if (vanzariQuickFilter === 'callback') return isCallbackStageName(st)
      if (vanzariQuickFilter === 'no_deal') return isNoDealStageName(st)
      if (vanzariQuickFilter === 'yes_deal') return isYesDealStageName(st)
      return isSunatiLeadByStage(l)
    })
  }, [baseFilteredLeads, isVanzari, vanzariQuickFilter, vanzariApeluriAzi])

  // Statistici Vânzări: toate pe ziua curentă (se resetează în fiecare zi)
  const vanzariCounts = useMemo(() => {
    if (!isVanzari) return { sunati: 0, callback: 0, noDeal: 0, yesDeal: 0, curierTrimis: 0, officeDirect: 0 }
    const byType = vanzariApeluriAzi?.leadIdsByType
    // Sunați = număr total apeluri înregistrate azi (total rânduri vanzari_apeluri)
    const sunati = vanzariApeluriAzi?.total ?? byType?.all?.length ?? 0
    // CB, No deal, Deal = lead-uri unice din apelurile azi
    const callback = byType?.callback?.length ?? 0
    const noDeal = byType?.noDeal?.length ?? 0
    const yesDeal = byType?.comanda?.length ?? 0
    // Curier trimis / Office direct = doar lead-uri din stage-ul Curier Ajuns Azi (livrări din ziua curentă)
    let curierTrimis = 0
    let officeDirect = 0
    for (const l of baseFilteredLeads) {
      const st = (l as any)?.stage || ''
      if (!isCurierAjunsAziStageName(st)) continue
      if (isCurierTrimisStageName(st) || hasCurierTrimisTag(l)) curierTrimis++
      if (isOfficeDirectStageName(st) || hasOfficeDirectTag(l)) officeDirect++
    }
    return { sunati, callback, noDeal, yesDeal, curierTrimis, officeDirect }
  }, [baseFilteredLeads, isVanzari, vanzariApeluriAzi])

  useEffect(() => {
    const setupSaloaneStages = async () => {
      if (loading || !pipelines.length) return
      
      if (pipelineSlug !== 'saloane') return
      
      const pipelinesArray = Array.isArray(pipelines) ? pipelines : []
      
      if (!Array.isArray(pipelinesArray)) {
        console.error('❌ [page.tsx] ERROR: pipelinesArray is NOT an array!', pipelinesArray)
        return
      }
      
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      let saloaneExists = false
      for (let i = 0; i < pipelinesArray.length; i++) {
        const p = pipelinesArray[i]
        if (p && toSlug(p) === 'saloane') {
          saloaneExists = true
          break
        }
      }
      
      if (!saloaneExists && isOwner) {
        try {
          const pipelineRes = await fetch('/api/pipelines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Saloane' })
          })
          
          if (!pipelineRes.ok) {
            const error = await pipelineRes.json()
            throw new Error(error.error || 'Failed to create pipeline')
          }
          
          const saloaneStages = [
            'Noua', 
            'Retur',
            'In Lucru',
            'De Confirmat',
            'In Asteptare',
            'Finalizata'
          ]
          
          for (const stageName of saloaneStages) {
            const stageRes = await fetch('/api/stages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pipelineSlug: 'saloane', name: stageName })
            })
            
            if (!stageRes.ok) {
              console.error(`Eroare la crearea stage-ului ${stageName}`)
            }
          }

          invalidateStageIdsCache()
          clearDashboardFullCache()
          await refresh()
          toast({ 
            title: 'Pipeline Saloane creat!', 
            description: `Pipeline-ul "Saloane" a fost creat cu ${saloaneStages.length} stage-uri.`
          })
          
        } catch (error: any) {
          console.error('Eroare la crearea pipeline-ului Saloane:', error)
          toast({ 
            variant: 'destructive', 
            title: 'Eroare', 
            description: error.message || 'Nu s-a putut crea pipeline-ul Saloane' 
          })
        }
      }
    }
    
    setupSaloaneStages()
  }, [loading, pipelines, pipelineSlug, isOwner, refresh, toast])

  const handleBulkMoveToPipelines = async (leadId: string, pipelineNames: string[]) => {
    try {
      // Mutarea în mai multe pipeline-uri trebuie implementată folosind pipeline_items
      // Pentru moment, funcționalitatea nu este disponibilă
      throw new Error('Bulk move to multiple pipelines is not yet implemented')
    } catch (e: any) {
      toast({ variant: "destructive", description: e?.message ?? "Move failed" })
    }
  }

  async function openEditor() {
    let data = getCachedPipelinesWithStages()
    if (!data?.length) data = await getPipelines()
    const current = data?.find((p: any) => toSlug(p.name) === pipelineSlug)
    if (!current) return
    setEditorData({
      pipelineId: current.id,
      pipelineName: current.name,
      stages: (current.stages || []).map((s: any) => ({ id: s.id, name: s.name })),
    })
    setEditorOpen(true)
  }

  async function handleDeleteStage(stageName: string) {
    try {
      const res = await fetch("/api/stages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineSlug, stageName }),
      })
      
      if (!res.ok) {
        const text = await res.text()
        let json
        try {
          json = JSON.parse(text)
        } catch {
          throw new Error(text || "Failed to delete stage")
        }
        throw new Error(json.error || "Failed to delete stage")
      }
      
      const json = await res.json()
      invalidateStageIdsCache()
      clearDashboardFullCache()
      toast({ title: "Stage deleted", description: `"${stageName}" and its leads were removed.` })
      await refresh()
    } catch (err: any) {
      console.error('Error deleting stage:', err)
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: err.message || "Failed to delete stage" 
      })
      throw err
    }
  }
  
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await getPipelineOptions()
        const byName = new Map(rows.map(r => [r.name, r.active_stages]))
        const opts = pipelines.map(name => ({ name, activeStages: byName.get(name) ?? 0 }))
        if (alive) setPipelineOptions(opts)
      } catch {
        // graceful fallback
        if (alive) setPipelineOptions(pipelines.map(name => ({ name, activeStages: 0 })))
      }
    })()
    return () => { alive = false }
  }, [pipelines])

  const activePipelineName =
    useMemo(() =>
      pipelines.find(p => toSlug(String(p)) === pipelineSlug)?.toString() ?? pipelineSlug,
      [pipelines, pipelineSlug]
    )

  const handleCloseModal = () => {
    setSelectedLead(null)
    setLeadPosition(null)
    setRestoredOpenCardSection(null)
    setOverridePipelineSlugForPanel(null)
    clearOpenCard()
    // Dacă am venit din altă pagină (ex. dashboard tehnician), revenim acolo la Close
    if (returnToAfterClose) {
      const target = returnToAfterClose
      setReturnToAfterClose(null)
      router.replace(target)
    }
    // Fără refresh la închidere – board-ul se actualizează deja la fiecare acțiune rapidă (mutare stage tăviță)
  }

  const handleMove = async (leadId: string, newStage: string) => {
    const prevStage = leads.find(l => l.id === leadId)?.stage ?? "—"
    const lead = leads.find(l => l.id === leadId)

    if (lead) {
      const pipelinesData = getCachedPipelinesWithStages()
      const leadAny = lead as any
      const targetPipelineId = leadAny.originalPipelineId || lead.pipelineId
      const targetPipeline = pipelinesData?.find((p: any) => p.id === targetPipelineId)
      const newStageId = targetPipeline?.stages?.find((s: any) => s.name === newStage)?.id
      setSelectedLead((sl: any) => {
        if (sl?.id === leadId) {
          return { ...sl, stage: newStage, stageId: newStageId || sl.stageId }
        }
        return sl
      })
    }

    try {
      await handleLeadMove(leadId, newStage)
      logLeadEvent(
        leadId,
        `Stadiu schimbat: ${prevStage} → ${newStage}`,
        "stage_change",
        { from: prevStage, to: newStage }
      )
      toast({ title: "Card mutat", description: `Mutat în ${newStage}`, duration: 2000 })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Mutare eșuată",
        description: e?.message ?? "Cardul a revenit în poziția anterioară.",
      })
    }
  }

  async function handleMoveToPipeline(leadId: string, targetName: string) {
    const res = await moveLeadToPipelineByName(leadId, targetName, "UI move from modal")
    if (!res.ok) {
      if (res.code === "TARGET_PIPELINE_NO_ACTIVE_STAGES") {
        toast({
          title: "Cannot move lead",
          description: "Selected pipeline has no stages. Add one and try again.",
          variant: "destructive",
        })
        return
      }
      if (res.code === "TARGET_PIPELINE_NOT_ACTIVE") {
        toast({
          title: "Pipeline inactive or missing",
          description: "Please pick an active pipeline.",
          variant: "destructive",
        })
        return
      }
      toast({ title: "Move failed", description: res.message ?? "Unexpected error", variant: "destructive" })
      return
    }

    setSelectedLead(null)
    clearOpenCard()
    toast({ title: "Lead moved", description: `Sent to ${targetName} (default stage).` })
    router.refresh?.() 
  }

  // functie pentru mutarea in batch in stage
  const handleBulkMoveToStage = async (leadIds: string[], newStage: string) => {
    // Blochează mutarea în stage-urile restricționate în Receptie
    const isReceptiePipeline = params.pipeline?.toLowerCase().includes('receptie') || false
    if (isReceptiePipeline) {
      const newStageLower = newStage.toLowerCase()
      const restrictedStages = ['facturat', 'facturată', 'in asteptare', 'în așteptare', 'in lucru', 'în lucru']
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      let isRestricted = false
      for (let i = 0; i < restrictedStages.length; i++) {
        const restricted = restrictedStages[i]
        if (newStageLower.includes(restricted)) {
          isRestricted = true
          break
        }
      }
      if (isRestricted) {
        toast({
          title: "Mutare blocată",
          description: `Nu poți muta cardurile în stage-ul "${newStage}" în pipeline-ul Receptie.`,
          variant: "destructive",
        })
        return
      }
    }
    try {
      const pipelinesData = getCachedPipelinesWithStages()
      const currentPipeline = pipelinesData?.find((p: any) => toSlug(p.name) === pipelineSlug) || pipelinesData?.[0]

      if (!currentPipeline) {
        toast({ title: "Eroare", description: "Pipeline-ul curent nu a fost gasit", variant: "destructive" })
        return
      }

      const targetStage = currentPipeline.stages?.find((s: any) => s.name === newStage)
      if (!targetStage) {
        toast({ title: "Eroare", description: "Stage-ul nu a fost gasit", variant: "destructive" })
        return
      }

      // muta fiecare lead
      const movePromises = leadIds.map(async (leadId) => {
        const lead = leads.find(l => l.id === leadId)
        if (!lead) return

        const prevStage = lead.stage ?? "—"
        
        // foloseste handleLeadMove pentru a muta lead-ul
        await handleLeadMove(leadId, newStage)
        
        // log event
        logLeadEvent(
          leadId,
          `Stadiu schimbat: ${prevStage} → ${newStage}`,
          "stage_change",
          { from: prevStage, to: newStage }
        )
      })

      await Promise.all(movePromises)
      
      toast({ 
        title: "Lead-uri mutate", 
        description: `${leadIds.length} lead${leadIds.length === 1 ? '' : '-uri'} mutat${leadIds.length === 1 ? '' : 'e'} în ${newStage}`,
        duration: 3000
      })
      
      // Nu mai face refresh - optimistic updates și real-time subscriptions vor actualiza automat
    } catch (error) {
      console.error('Eroare la mutarea lead-urilor:', error)
      toast({ 
        title: "Eroare", 
        description: "Nu s-au putut muta toate lead-urile", 
        variant: "destructive" 
      })
    }
  }

  // Owner: mută toate lead-urile din „Curier Ajuns Azi” în „Avem Comandă”
  const handleBulkMoveCurierAjunsAziToAvemComanda = async (leadIds: string[]) => {
    const pipelinesData = getCachedPipelinesWithStages()
    const vanzari = pipelinesData?.find((p: any) => (p?.name || '').toLowerCase().includes('vanzari'))
    const avemStage = vanzari?.stages?.find((s: any) => {
      const n = String(s?.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      return n.includes('avem') && n.includes('comanda')
    })
    if (!avemStage?.name) {
      toast({ title: 'Eroare', description: 'Stage-ul Avem Comandă nu a fost găsit.', variant: 'destructive' })
      return
    }
    await handleBulkMoveToStage(leadIds, avemStage.name)
  }

  // functie pentru mutarea in batch in pipeline
  const handleBulkMoveToPipeline = async (leadIds: string[], pipelineName: string) => {
    try {
      const movePromises = leadIds.map(async (leadId) => {
        const res = await moveLeadToPipelineByName(leadId, pipelineName, "Bulk move")
        if (!res.ok) {
          console.error(`Eroare la mutarea lead-ului ${leadId}:`, res.message)
        }
        return res
      })

      const results = await Promise.all(movePromises)
      const successCount = results.filter(r => r.ok).length
      const failCount = results.length - successCount

      if (failCount > 0) {
        toast({
          title: "Mutare partiala",
          description: `${successCount} mutat${successCount === 1 ? '' : 'e'} cu succes, ${failCount} esuat${failCount === 1 ? '' : 'e'}`,
          variant: failCount === results.length ? "destructive" : "default"
        })
      } else {
        toast({
          title: "Lead-uri mutate",
          description: `${successCount} lead${successCount === 1 ? '' : '-uri'} mutat${successCount === 1 ? '' : 'e'} în ${pipelineName}`,
          duration: 3000
        })
      }

      await refresh()
      router.refresh?.()
    } catch (error) {
      console.error('Eroare la mutarea lead-urilor:', error)
      toast({
        title: "Eroare",
        description: "Nu s-au putut muta toate lead-urile",
        variant: "destructive"
      })
    }
  }

  // ==================== QUALITY: VALIDATION OVERLAY ====================
  const [qcOpen, setQcOpen] = useState(false)
  const [qcLead, setQcLead] = useState<KanbanLead | null>(null)
  const [qcLoading, setQcLoading] = useState(false)
  const [qcAction, setQcAction] = useState<'validate' | 'dont_validate' | null>(null)
  const [qcTrayItems, setQcTrayItems] = useState<any[]>([])
  const [qcTrayInfo, setQcTrayInfo] = useState<{ number?: string; size?: string; status?: string; technicians?: string[] } | null>(null)
  const [qcInstrumentsMap, setQcInstrumentsMap] = useState<Record<string, string>>({})
  const [qcPartsMap, setQcPartsMap] = useState<Record<string, string>>({})
  const [qcNotes, setQcNotes] = useState('')
  const [qcUnrepairedByItemId, setQcUnrepairedByItemId] = useState<Record<string, number>>({})

  const closeQc = useCallback(() => {
    setQcOpen(false)
    setQcLead(null)
    setQcTrayItems([])
    setQcTrayInfo(null)
    setQcInstrumentsMap({})
    setQcPartsMap({})
    setQcAction(null)
    setQcLoading(false)
    setQcNotes('')
    setQcUnrepairedByItemId({})
  }, [])

  useEffect(() => {
    const leadAny = qcLead as any
    const isTray = leadAny?.type === 'tray'
    const trayId = isTray ? (leadAny?.id as string | null) : null
    if (!qcOpen || !trayId) return

    let cancelled = false
    const load = async () => {
      setQcLoading(true)
      try {
        const [res, trayRes] = await Promise.all([
          listTrayItemsForTray(trayId),
          supabase.from('trays').select('number, size, status, qc_notes, technician_id, technician2_id, technician3_id').eq('id', trayId).single(),
        ])
        if (cancelled) return
        if (res?.error) console.warn('[QC] Warning: nu pot încărca tray_items:', trayId, res.error)
        const safeItems = Array.isArray(res?.data) ? res.data : []
        setQcTrayItems(safeItems)
        const unrepairedInit: Record<string, number> = {}
        for (const it of safeItems) {
          if (it?.id != null) unrepairedInit[it.id] = Math.min(Number(it?.qty) || 1, Math.max(0, Number((it as any)?.unrepaired_qty) || 0))
        }
        setQcUnrepairedByItemId(unrepairedInit)
        const trayResAny = trayRes as any
        if (!trayResAny?.error && trayResAny?.data) {
          const t = trayResAny.data as any
          // Rezolvă numele tehnicienilor
          const techIds = [t?.technician_id, t?.technician2_id, t?.technician3_id].filter(Boolean) as string[]
          let techNames: string[] = []
          if (techIds.length > 0) {
            const { data: members } = await supabase
              .from('app_members')
              .select('user_id, name')
              .in('user_id', techIds)
            if (members?.length) {
              techNames = techIds.map(id => {
                const m = (members as any[]).find((m: any) => m.user_id === id)
                return m?.name || id.slice(0, 8)
              })
            } else {
              techNames = techIds.map(id => id.slice(0, 8))
            }
          }
          setQcTrayInfo({ number: t?.number, size: t?.size, status: t?.status, technicians: techNames })
          setQcNotes(String(t?.qc_notes ?? ''))
        } else {
          setQcTrayInfo(null)
        }

        const instrumentIds = [...new Set(safeItems.map((it: any) => it?.instrument_id).filter(Boolean))] as string[]
        const instrumentsMap: Record<string, string> = {}
        if (instrumentIds.length > 0) {
          const { data: instRows } = await supabase.from('instruments').select('id, name').in('id', instrumentIds)
          if (Array.isArray(instRows)) {
            for (const r of instRows as any[]) {
              if (r?.id) instrumentsMap[String(r.id)] = String(r.name || 'Instrument')
            }
          }
        }
        setQcInstrumentsMap(instrumentsMap)

        const partIds = [...new Set(safeItems.map((it: any) => it?.part_id).filter(Boolean))] as string[]
        const partsMap: Record<string, string> = {}
        if (partIds.length > 0) {
          const { data: partRows } = await supabase.from('parts').select('id, name').in('id', partIds)
          if (Array.isArray(partRows)) {
            for (const p of partRows as any[]) {
              if (p?.id) partsMap[String(p.id)] = String(p.name || 'Piesă')
            }
          }
        }
        setQcPartsMap(partsMap)
      } catch (e) {
        console.error('[QC] Eroare încărcare overlay:', e)
      } finally {
        if (!cancelled) setQcLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [qcOpen, qcLead])

  const saveQcUnrepairedToDb = useCallback(async () => {
    for (const item of qcTrayItems) {
      const itemId = item?.id
      if (!itemId) continue
      const current = (item as any)?.unrepaired_qty ?? 0
      const edited = qcUnrepairedByItemId[itemId]
      if (edited === undefined) continue
      const value = Math.min(Number(item?.qty) || 1, Math.max(0, Number(edited) || 0))
      if (value === current) continue
      const { error } = await updateTrayItem(itemId, { unrepaired_qty: value })
      if (error) console.warn('[QC] Nu s-a putut salva unrepaired_qty pentru item:', itemId, error)
    }
  }, [qcTrayItems, qcUnrepairedByItemId])

  const handleQcValidate = useCallback(async () => {
    const leadAny = qcLead as any
    const trayId = leadAny?.type === 'tray' ? (leadAny?.id as string | null) : null
    if (!trayId) return
    setQcAction('validate')
    try {
      await saveQcUnrepairedToDb()
      const notes = qcNotes?.trim() || undefined
      const { error: updateErr } = await updateTray(trayId, { qc_notes: notes || null })
      if (updateErr) console.warn('[QC] Nu s-a putut salva qc_notes pe tray:', updateErr)
      await logItemEvent(
        'tray',
        trayId,
        notes ? `QC: tăvița a fost validată. Notițe: ${notes}` : 'QC: tăvița a fost validată',
        'quality_validated',
        {
          sourcePipelineId: leadAny?.qcSourcePipelineId || null,
          sourcePipelineName: leadAny?.qcSourcePipelineName || null,
          notes: notes,
        }
      )
      toast({ title: "Validat", description: "Tăvița a fost marcată ca validată." })
      closeQc()
      await refresh()
    } catch (e: any) {
      console.error('[QC] Eroare Validate:', e)
      toast({ title: "Eroare", description: e?.message || "Nu s-a putut valida", variant: "destructive" })
    } finally {
      setQcAction(null)
    }
  }, [qcLead, qcNotes, closeQc, refresh, toast, saveQcUnrepairedToDb])

  const handleQcDontValidate = useCallback(async () => {
    const leadAny = qcLead as any
    const trayId = leadAny?.type === 'tray' ? (leadAny?.id as string | null) : null
    if (!trayId) return
    setQcAction('dont_validate')
    try {
      const pipesData = await getPipelines()
      const deptPipelines = (pipesData || []).filter((p: any) => {
        const n = String(p?.name || '').toLowerCase()
        return n.includes('saloane') || n.includes('horeca') || n.includes('frizer') || n.includes('reparat')
      })

      let pipelineId: string | null = leadAny?.qcSourcePipelineId || null
      // Fallback: găsește pipeline sursă din pipeline_items (departamente)
      if (!pipelineId) {
        const deptIds = deptPipelines.map((p: any) => p.id)
        if (deptIds.length > 0) {
          const { data: piRows } = await supabase
            .from('pipeline_items')
            .select('pipeline_id, updated_at')
            .eq('type', 'tray')
            .eq('item_id', trayId)
            .in('pipeline_id', deptIds)
            .order('updated_at', { ascending: false })
            .limit(1)
          const r0 = Array.isArray(piRows) ? (piRows as any[])[0] : null
          pipelineId = r0?.pipeline_id || null
        }
      }

      if (!pipelineId) {
        throw new Error('Nu pot determina departamentul sursă pentru această tăviță.')
      }

      const pipeline = deptPipelines.find((p: any) => p.id === pipelineId)
      const stagesForPipe = Array.isArray((pipeline as any)?.stages) ? (pipeline as any).stages : []
      const inLucruStage =
        stagesForPipe.find((s: any) => matchesStagePattern(String(s?.name || ''), 'IN_LUCRU')) || null

      if (!inLucruStage?.id) {
        throw new Error(`Nu găsesc stage "În lucru" în departamentul sursă: ${(pipeline as any)?.name || pipelineId}`)
      }

      await saveQcUnrepairedToDb()
      const notes = qcNotes?.trim() || undefined
      const { error: updateErr } = await updateTray(trayId, { qc_notes: notes || null })
      if (updateErr) console.warn('[QC] Nu s-a putut salva qc_notes pe tray:', updateErr)

      const moveRes = await moveItemToStage('tray', trayId, pipelineId, inLucruStage.id)
      if (moveRes.error) {
        throw new Error(moveRes.error?.message || 'Mutarea tăviței înapoi a eșuat.')
      }

      await logItemEvent(
        'tray',
        trayId,
        notes ? `QC: tăvița NU a fost validată (trimisă înapoi în „În lucru”). Notițe: ${notes}` : 'QC: tăvița NU a fost validată (trimisă înapoi în „În lucru”)',
        'quality_not_validated',
        {
          sourcePipelineId: pipelineId,
          sourcePipelineName: (pipeline as any)?.name || leadAny?.qcSourcePipelineName || null,
          notes: notes,
        }
      )

      toast({ title: "Nevalidat", description: "Tăvița NU a fost validată și a fost trimisă înapoi în „În lucru”." })
      closeQc()
      await refresh()
    } catch (e: any) {
      console.error('[QC] Eroare Dont Validate:', e)
      toast({ title: "Eroare", description: e?.message || "Nu s-a putut procesa", variant: "destructive" })
    } finally {
      setQcAction(null)
    }
  }, [qcLead, qcNotes, closeQc, refresh, toast, saveQcUnrepairedToDb])

  const handleLeadClick = async (lead: KanbanLead, event?: React.MouseEvent) => {
    const leadAny = lead as any
    const isQualityPipeline = (pipelineSlug?.toLowerCase().includes('quality') || activePipelineName?.toLowerCase().includes('quality')) || false
    const isTray = leadAny?.type === 'tray'

    // În Quality pipeline, click pe orice tăviță deschide overlay-ul QC
    if (isQualityPipeline && isTray) {
      // overlay QC în loc de LeadDetailsPanel
      setSelectedLead(null)
      setLeadPosition(null)
      clearOpenCard()
      setQcLead(lead as any)
      setQcOpen(true)
      return
    }

    // Deschidere la click pe card (fișă, lead etc.): nu folosim VanzariView override
    setReturnToAfterClose(null)
    setOverridePipelineSlugForPanel(null)
    const stageName = (lead as any)?.stage ?? ''
    const isDeFacturat = matchesStagePattern(stageName, 'DE_FACTURAT')

    if (isDeFacturat) {
      // Doar pentru stage DE FACTURAT: deschide doar overlay-ul, fără panoul de detalii
      setSelectedLead(null)
      setLeadPosition(null)
      setDeFacturatOverlayLead(lead as any)
      setDeFacturatOverlayOpen(true)
    } else {
      setRestoredOpenCardSection(null)
      setSelectedLead(lead as any)
      setDeFacturatOverlayLead(null)
      setDeFacturatOverlayOpen(false)
    }

    // Persist cardul deschis (pentru restore după tab switch) – și pentru Colet neridicat, Curier trimis, Office direct
    try {
      const pl = String(pipelineSlug || '')
      const itemType: 'lead' | 'service_file' | 'tray' =
        (leadAny?.type as any) ||
        (leadAny?.isFisa ? 'service_file' : leadAny?.isQuote ? 'tray' : 'lead')
      const itemId = itemType === 'lead'
        ? ((lead as any).leadId || lead.id)
        : (leadAny?.realTrayId || lead.id)
      let pipelineId = (lead as any).pipelineId || leadAny?.pipelineId
      if (!pipelineId && pl) {
        const cached = getCachedPipelinesWithStages()
        pipelineId = cached?.find((p: any) => toSlug(p?.name) === toSlug(pl))?.id ?? undefined
      }
      if (pl && pipelineId && itemId) {
        writeOpenCard({ pipelineSlug: pl, pipelineId, itemType, itemId, openedAt: Date.now(), deFacturatOverlay: isDeFacturat, section: 'fisa' })
      }
    } catch {
      // ignore
    }
    
    if (!isDeFacturat && event && event.currentTarget) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const leadCenterX = rect.left + rect.width / 2
      const side = leadCenterX < viewportWidth / 2 ? 'left' : 'right'
      setLeadPosition({ x: rect.left, y: rect.top, side })
    }
  }

  // Restore: dacă revii din alt tab / după refresh și state-ul s-a pierdut, re-deschidem cardul.
  useEffect(() => {
    const tryRestore = async () => {
      const saved = readOpenCard()
      if (!saved) return
      const currentSlug = String(pipelineSlug || '')
      if (!currentSlug || toSlug(saved.pipelineSlug) !== toSlug(currentSlug)) return

      const cached = getCachedPipelinesWithStages()
      const pipelineId =
        cached?.find((p: any) => toSlug(p?.name) === toSlug(currentSlug))?.id || saved.pipelineId
      if (!pipelineId) return

      let result = await getSingleKanbanItem(saved.itemType, saved.itemId, pipelineId)
      if (result.error || !result.data) {
        await new Promise((r) => setTimeout(r, 400))
        result = await getSingleKanbanItem(saved.itemType, saved.itemId, pipelineId)
      }
      const { data: item, error } = result
      if (error || !item) return

      if (saved.deFacturatOverlay) {
        setDeFacturatOverlayLead(item as any)
        setDeFacturatOverlayOpen(true)
        setSelectedLead(null)
        setLeadPosition(null)
      } else {
        if (selectedLead) return
        setRestoredOpenCardSection(saved.section ?? 'fisa')
        setSelectedLead(item as any)
        setLeadPosition((prev) => prev ?? { x: 0, y: 0, side: 'right' })
      }
    }

    tryRestore()
    // Retry după scurt delay când loading devine false (cache/API pot fi încă nesincronizate la primul run).
    const t = loading ? null : window.setTimeout(() => { tryRestore() }, 500)
    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
      // Dacă panoul e deja deschis (revii pe tab fără refresh), re-scriem cardul în storage ca să nu se piardă.
      if (selectedLead && !deFacturatOverlayOpen) {
        const cached = getCachedPipelinesWithStages()
        const pid = cached?.find((p: any) => toSlug(p?.name) === toSlug(String(pipelineSlug || '')))?.id
        if (pid) {
          const leadAny = selectedLead as any
          const itemType = leadAny?.type ?? (leadAny?.isFisa ? 'service_file' : leadAny?.isQuote ? 'tray' : 'lead')
          const itemId = itemType === 'lead' ? (leadAny.leadId ?? leadAny.id) : leadAny.id
          const currentSection = readOpenCard()?.section ?? 'fisa'
          writeOpenCard({ pipelineSlug: String(pipelineSlug || ''), pipelineId: pid, itemType, itemId, openedAt: Date.now(), section: currentSection })
        }
        return
      }
      tryRestore()
      // Retry la revenire pe tab: uneori cache/API nu sunt gata la primul run.
      visibilityRetryRef.current.forEach(clearTimeout)
      visibilityRetryRef.current = [
        window.setTimeout(tryRestore, 350),
        window.setTimeout(tryRestore, 900),
      ]
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (t != null) clearTimeout(t)
      visibilityRetryRef.current.forEach(clearTimeout)
      visibilityRetryRef.current = []
      document.removeEventListener('visibilitychange', onVisible)
    }
    // Re-rulăm și după ce loading devine false (după refresh), ca restore-ul să aibă date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineSlug, getCachedPipelinesWithStages, selectedLead, loading, deFacturatOverlayOpen])

  // IMPORTANT: aceste return-uri trebuie să fie DUPĂ toate hook-urile,
  // altfel React va detecta schimbare în ordinea hook-urilor (Rules of Hooks).
  const hasData = (leads?.length ?? 0) > 0 || (stages?.length ?? 0) > 0
  // Când avem un card restorabil, nu ascundem tot conținutul cu LoadingScreen – astfel tryRestore
  // poate seta selectedLead și panoul apare chiar dacă loadData e încă în curs.
  if (loading && !hasRestorableOpenCard) {
    return (
      <div className="flex flex-1 min-h-0 min-w-0 bg-background overflow-hidden">
        <LoadingScreen message="Se încarcă..." />
      </div>
    )
  }
  if (error && !hasData && !hasRestorableOpenCard) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
        <div className="text-red-500 text-center">Eroare la încărcare: {error}</div>
        <p className="text-sm text-muted-foreground text-center max-w-md">Poate fi o problemă de rețea. Verifică conexiunea și reîncearcă.</p>
        <Button variant="outline" onClick={() => refresh()}>Reîncearcă</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 min-w-0 bg-background overflow-hidden">
      <NetworkStatusBanner />
      {error && hasData && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-sm text-amber-800 dark:text-amber-200 shrink-0">
          <span>Unele informații nu sunt disponibile. Poți reîmprospăta.</span>
          <Button variant="outline" size="sm" onClick={() => refresh()}>Reîmprospătează</Button>
        </div>
      )}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {/* Header desktop – un singur rând compact: titlu | pills (Vânzări) | Filtre (popover) | acțiuni */}
        <header className="hidden md:block border-b border-border px-4 py-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-semibold text-foreground shrink-0">{activePipelineName}</h1>

            {/* Vânzări: pill-uri compacte */}
            {pipelineSlug?.toLowerCase() === 'vanzari' && (
              <div className="flex items-center gap-1">
                <Button data-button-id="vanzariFilterToate" variant={vanzariQuickFilter === null ? 'default' : 'outline'} size="sm" onClick={() => setVanzariQuickFilter(null)} className="h-7 text-xs px-2" title="Toate">Toate</Button>
                <Button data-button-id="vanzariFilterSunati" variant={vanzariQuickFilter === 'sunati' ? 'default' : 'outline'} size="sm" onClick={() => setVanzariQuickFilter('sunati')} className="h-7 text-xs px-2" title="Sunați">Sunați ({vanzariCounts.sunati})</Button>
                <Button data-button-id="vanzariFilterCallback" variant={vanzariQuickFilter === 'callback' ? 'default' : 'outline'} size="sm" onClick={() => setVanzariQuickFilter('callback')} className="h-7 text-xs px-2" title="Call Back">CB ({vanzariCounts.callback})</Button>
                <Button data-button-id="vanzariFilterNoDeal" variant={vanzariQuickFilter === 'no_deal' ? 'default' : 'outline'} size="sm" onClick={() => setVanzariQuickFilter('no_deal')} className="h-7 text-xs px-2" title="No deal">No deal ({vanzariCounts.noDeal})</Button>
                <Button data-button-id="vanzariFilterYesDeal" variant={vanzariQuickFilter === 'yes_deal' ? 'default' : 'outline'} size="sm" onClick={() => setVanzariQuickFilter('yes_deal')} className="h-7 text-xs px-2" title="Yes deal">Deal ({vanzariCounts.yesDeal})</Button>
                <Button data-button-id="vanzariFilterCurierTrimis" variant={vanzariQuickFilter === 'curier_trimis' ? 'default' : 'outline'} size="sm" onClick={() => setVanzariQuickFilter('curier_trimis')} className="h-7 text-xs px-2" title="Curier Ajuns Azi">Curier trimis ({vanzariCounts.curierTrimis})</Button>
                <Button data-button-id="vanzariFilterOfficeDirect" variant={vanzariQuickFilter === 'office_direct' ? 'default' : 'outline'} size="sm" onClick={() => setVanzariQuickFilter('office_direct')} className="h-7 text-xs px-2" title="Office direct">Office direct ({vanzariCounts.officeDirect})</Button>
                {(role === 'admin' || isOwner) && (
                  <Button
                    data-button-id="vanzariToggleHiddenStages"
                    variant={showHiddenVanzariStages ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2 gap-1"
                    title={showHiddenVanzariStages ? 'Ascunde stage-urile Avem Comandă, Curier trimis, Office direct' : 'Arată stage-urile ascunse (Avem Comandă, Curier trimis, Office direct)'}
                    onClick={() => setShowHiddenVanzariStages((v) => !v)}
                  >
                    {showHiddenVanzariStages ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showHiddenVanzariStages ? 'Ascunde stage-uri' : 'Stage-uri ascunse'}
                  </Button>
                )}
              </div>
            )}

            {/* Filtre: un singur buton cu popover (dată + tehnician + resetează) */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  data-button-id="vanzariFiltersButton"
                  variant={filters.dateFilter.enabled || filters.technicianId ? "default" : "outline"}
                  size="sm"
                  className="h-8 gap-1.5 px-2.5"
                  title="Filtre dată și tehnician"
                >
                  <Filter className="h-3.5 w-3.5" />
                  <span>Filtre</span>
                  {(filters.dateFilter.enabled || filters.technicianId) && (
                    <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] bg-background/80">
                      {[filters.dateFilter.enabled, !!filters.technicianId].filter(Boolean).length}
                    </Badge>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Filtre</span>
                    {(filters.dateFilter.enabled || filters.technicianId) && (
                      <Button
                        data-button-id="vanzariFiltersResetButton"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setFilters(prev => ({ ...prev, dateFilter: { ...prev.dateFilter, enabled: false, startDate: null, endDate: null }, technicianId: null }))
                        }}
                        title="Resetează filtrele din popover"
                      >
                        <X className="h-3 w-3 mr-1" /> Resetează
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs w-12 shrink-0">Dată</Label>
                      <Button
                        data-button-id="vanzariFiltersDateToggle"
                        variant={filters.dateFilter.enabled ? "secondary" : "outline"}
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => setFilters(prev => ({ ...prev, dateFilter: { ...prev.dateFilter, enabled: !prev.dateFilter.enabled } }))}
                        title="Comută filtre după dată (De la / Până la)"
                      >
                        {filters.dateFilter.enabled ? "Activ" : "De la / Până la"}
                      </Button>
                    </div>
                    {filters.dateFilter.enabled && (
                      <div className="grid grid-cols-2 gap-2 pl-14">
                        <div className="space-y-1">
                          <Label htmlFor="popover-start-date" className="text-xs text-muted-foreground">De la</Label>
                          <Input id="popover-start-date" type="date" value={filters.dateFilter.startDate || ''} onChange={(e) => setFilters(prev => ({ ...prev, dateFilter: { ...prev.dateFilter, startDate: e.target.value || null } }))} className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="popover-end-date" className="text-xs text-muted-foreground">Până la</Label>
                          <Input id="popover-end-date" type="date" value={filters.dateFilter.endDate || ''} onChange={(e) => setFilters(prev => ({ ...prev, dateFilter: { ...prev.dateFilter, endDate: e.target.value || null } }))} className="h-8 text-sm" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tehnician</Label>
                    <Select
                      value={filters.technicianId || undefined}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, technicianId: value || null }))}
                      disabled={loadingTechnicians}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder={loadingTechnicians ? "..." : "Toți tehnicienii"} />
                      </SelectTrigger>
                      <SelectContent>
                        {technicians.map((tech) => (
                          <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                        ))}
                        {technicians.length === 0 && !loadingTechnicians && (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">Nu există tehnicieni</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="pt-1 border-t text-xs text-muted-foreground">
                    {filteredLeads.length} din {leads.length} lead-uri
                    {filters.searchQuery && ` • „${filters.searchQuery}"`}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Resetează toate filtrele (inclusiv search) – vizibil doar când există filtre */}
            {(filters.dateFilter.enabled || filters.searchQuery || filters.technicianId) && (
              <Button
                data-button-id="receptieResetFiltersButton"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => {
                  setFilters({ dateFilter: { startDate: null, endDate: null, enabled: false }, searchQuery: '', technicianId: null })
                  const next = new URLSearchParams(searchParams?.toString() ?? '')
                  next.delete('q')
                  router.replace(pathname + (next.toString() ? '?' + next.toString() : ''))
                }}
                title="Resetează toate filtrele"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Acțiuni – aliniate la dreapta */}
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              {pipelineSlug?.toLowerCase() === 'receptie' && arhivatStageName && (
                <Button
                  data-button-id="receptieArchiveRidicatTrimisButton"
                  variant="outline"
                  size="sm"
                  disabled={archiveRidicatTrimisLoading || ridicatTrimisFiseIds.length === 0}
                  onClick={async () => {
                    if (ridicatTrimisFiseIds.length === 0) return
                    setArchiveRidicatTrimisLoading(true)
                    try {
                      await handleBulkMoveToStage(ridicatTrimisFiseIds, arhivatStageName)
                      toast({
                        title: 'Arhivare Ridicat și Trimis',
                        description: ridicatTrimisFiseIds.length === 1
                          ? '1 fișă arhivată (fișă + tăvițe + lead mutat la Arhivat).'
                          : `${ridicatTrimisFiseIds.length} fișe arhivate (fișe + tăvițe + lead-uri mutate la Arhivat).`,
                        duration: 4000,
                      })
                      refresh?.()
                    } catch (e) {
                      toast({ title: 'Eroare la arhivare', variant: 'destructive', description: (e as Error)?.message })
                    } finally {
                      setArchiveRidicatTrimisLoading(false)
                    }
                  }}
                  className="h-8 gap-1.5 px-2.5"
                  title="Arhivează toate fișele din De trimis și Ridic personal (fișă + tăvițe + lead la Arhivat)"
                >
                  {archiveRidicatTrimisLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden lg:inline">Arhivează Ridicat și Trimis</span>
                  {ridicatTrimisFiseIds.length > 0 && (
                    <span className="hidden sm:inline text-muted-foreground">({ridicatTrimisFiseIds.length})</span>
                  )}
                </Button>
              )}
              {stages.length > 0 && (
                <Button data-button-id="receptieLayoutButton" variant="outline" size="sm" onClick={() => setCustomizeOpen(true)} className="h-8 gap-1.5 px-2.5" aria-label="Customizare layout" title="Reordonează coloanele">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Layout</span>
                </Button>
              )}
              {(pipelineSlug?.toLowerCase() === 'vanzari' || pipelineSlug?.toLowerCase() === 'receptie' || pipelineSlug?.toLowerCase() === 'parteneri') && (
                <Button data-button-id="receptieAddLeadButton" variant="default" size="sm" onClick={() => setCreateLeadOpen(true)} className="h-8 gap-1.5 px-2.5">
                  <Plus className="h-3.5 w-3.5" />
                  Add Lead
                </Button>
              )}
              {isOwner && (
                <>
                  <Button data-button-id="vanzariAddStageButton" variant="outline" size="sm" onClick={() => setCreateStageOpen(true)} className="h-8 gap-1.5 px-2.5" title="Adaugă un stage nou">
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Stage</span>
                  </Button>
                  <Button data-button-id="vanzariEditBoardButton" variant="outline" size="sm" onClick={openEditor} className="h-8 gap-1.5 px-2.5" aria-label="Edit board" title="Editează pipeline (ordine coloane, nume)">
                    <Settings2 className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Edit</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        {editorData && (
          <PipelineEditor
            open={editorOpen}
            onOpenChange={setEditorOpen}
            pipelineName={editorData.pipelineName}
            stages={editorData.stages}
            onSubmit={async ({ pipelineName, stages }) => {
              const { error } = await updatePipelineAndStages(editorData!.pipelineId, pipelineName, stages)
              if (error) { toast({ variant: "destructive", title: "Save failed", description: String(error.message ?? error) }); return }
              await refresh?.()                                   // ensure UI reflects new order/name
              const newSlug = toSlug(pipelineName);               // if your URL uses slug
              if (newSlug !== pipelineSlug) router.replace(`/leads/${newSlug}`)
              setEditorOpen(false)
              toast({ title: "Board updated" })
              if (typeof window !== "undefined") window.dispatchEvent(new Event("pipelines:updated"))

            }}
          />
        )}

        {/* Layout mobil */}
        {isMobile ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-hidden">
            <MobileBoardLayout
              leads={filteredLeads}
              stages={orderedStages}
              currentPipelineName={activePipelineName || ''}
              pipelines={pipelines}
              onPipelineChange={(pipelineName) => {
                const slug = toSlug(pipelineName)
                router.push(`/leads/${slug}`)
              }}
              onLeadMove={handleMove}
              onLeadClick={handleLeadClick}
              skipDetailsSheetForLead={(pipelineSlug?.toLowerCase().includes('quality') || activePipelineName?.toLowerCase().includes('quality'))
                ? (lead) => (lead as any)?.type === 'tray'
                : undefined}
              onAddLead={(pipelineSlug?.toLowerCase() === 'vanzari' || pipelineSlug?.toLowerCase() === 'receptie' || pipelineSlug?.toLowerCase() === 'parteneri') ? () => setCreateLeadOpen(true) : undefined}
              searchQuery={filters.searchQuery}
              onSearchQueryChange={(v) => setFilters(prev => ({ ...prev, searchQuery: v }))}
              leadToOpenAfterCreate={leadToOpenAfterCreate}
              onLeadToOpenConsumed={() => setLeadToOpenAfterCreate(null)}
              overridePipelineSlug={overridePipelineSlugForPanel}
              onDetailsClose={() => setOverridePipelineSlugForPanel(null)}
              onItemStageUpdated={updateItemStage}
              sidebarContent={
                <div className="p-4">
                  {/* Sidebar content pentru mobil */}
                  <Sidebar canManagePipelines={isOwner} />
                </div>
              }
            />
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-[2px]">
            {stages.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="text-lg font-medium text-muted-foreground mb-2">
                  Pipeline-ul se configurează...
                </div>
                <div className="text-sm text-muted-foreground mb-4">
                  {pipelineSlug === 'saloane' 
                    ? 'Se creează stage-urile pentru pipeline-ul Saloane...'
                    : `Pipeline-ul "${activePipelineName}" nu are stage-uri configurate.`
                  }
                </div>
                {isOwner && pipelineSlug !== 'saloane' && (
                  <Button
                    data-button-id="vanzariCreateStageFirstButton"
                    variant="outline"
                    onClick={() => setCreateStageOpen(true)}
                    className="gap-2"
                    title="Deschide formular creare stage"
                  >
                    <Plus className="h-4 w-4" />
                    Adaugă primul stage
                  </Button>
                )}
              </div>
            ) : (
              <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                <KanbanBoard 
                  leads={filteredLeads} 
                  stages={visibleStages}
                  onLeadMove={handleMove} 
                  onLeadClick={handleLeadClick}
                  onMessageClick={(serviceFileId, conversationId) => {
                    // Deschide detaliile fișei de serviciu cu conversația deschisă
                    runOpenFromUrl('service_file', serviceFileId, 'openServiceFileId')
                  }}
                  onDeleteStage={handleDeleteStage}
                  currentPipelineName={activePipelineName}
                  onPinToggle={handlePinToggle}
                  pipelines={pipelines}
                  onBulkMoveToStage={handleBulkMoveToStage}
                  onBulkMoveToPipeline={handleBulkMoveToPipeline}
                  onRefresh={refresh}
                  onClaimChange={patchLeadClaim}
                  onTagsChange={handleTagsChange}
                  onDeliveryClear={patchLeadDeliveryClear}
                  pipelineSlug={pipelineSlug}
                  onArchiveCard={pipelineSlug?.toLowerCase() === 'receptie' && arhivatStageName ? async (cardId) => {
                    await handleBulkMoveToStage([cardId], arhivatStageName)
                    toast({ title: 'Arhivat', description: 'Card mutat la Arhivat.', duration: 2000 })
                    refresh?.()
                  } : undefined}
                  showArchiveForStage={pipelineSlug?.toLowerCase() === 'receptie' ? (stageName: string) => {
                    const s = String(stageName || '').toLowerCase()
                    return s.includes('de trimis') || s.includes('ridic')
                  } : undefined}
                  onNuRaspundeClearedForReceptie={pipelineSlug?.toLowerCase() === 'receptie' ? moveServiceFileToDeFacturat : undefined}
                  onBulkMoveCurierAjunsAziToAvemComanda={activePipelineName?.toLowerCase().includes('vanzari') ? handleBulkMoveCurierAjunsAziToAvemComanda : undefined}
                />
                
                {/* Panel de detalii: rămâne deschis până la Close/Escape (nu se închide la click în afară) */}
                {selectedLead && (
                  <>
                    {/* Panel de detalii – full ecran (left = lățimea sidebar-ului, care poate fi minimizat) */}
                    <div 
                      className="fixed right-0 top-0 bottom-0 z-50 bg-background border-l border-border shadow-xl overflow-hidden"
                      style={{ left: sidebarWidth }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="h-full overflow-hidden">
              <LeadDetailsPanel
                key={selectedLead.id}              
                lead={selectedLead}
                defaultSection={restoredOpenCardSection ?? undefined}
                onSectionChangeForPersist={updateOpenCardSection}
                onClose={handleCloseModal}
                onStageChange={handleMove}
                stages={stages}
                pipelines={pipelines}
                pipelineSlug={pipelineSlug}
                overridePipelineSlug={overridePipelineSlugForPanel}
                onMoveToPipeline={activePipelineName?.toLowerCase().includes('vanzari') ? undefined : handleMoveToPipeline}
                onBulkMoveToPipelines={activePipelineName?.toLowerCase().includes('vanzari') ? undefined : handleBulkMoveToPipelines}
                pipelineOptions={activePipelineName?.toLowerCase().includes('vanzari') ? [] : pipelineOptions}
                onTagsChange={handleTagsChange}
                onRefresh={refresh}
                onItemStageUpdated={updateItemStage}
                onMoveFisaToDeFacturat={pipelineSlug?.toLowerCase() === 'receptie' ? moveServiceFileToDeFacturat : undefined}
              />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Overlay special pentru carduri din stage DE FACTURAT */}
      <DeFacturatOverlay
        open={deFacturatOverlayOpen}
        onOpenChange={(open) => {
          setDeFacturatOverlayOpen(open)
          if (!open) {
            setDeFacturatOverlayLead(null)
            clearOpenCard()
          }
        }}
        lead={deFacturatOverlayLead}
        pipelinesWithStages={getCachedPipelinesWithStages() ?? undefined}
        onRefresh={refresh}
        onNuRaspundeOptimistic={({ serviceFileId, leadId, nuRaspundeCallbackAt, tag, stageId, stageName }) => {
          patchNuRaspundeReceptie(serviceFileId, leadId, { nuRaspundeCallbackAt, tag, stageId, stageName })
        }}
        onOpenFullDetails={() => {
          if (!deFacturatOverlayLead) return
          const leadAny = deFacturatOverlayLead as any
          setDeFacturatOverlayOpen(false)
          setSelectedLead(deFacturatOverlayLead)
          setDeFacturatOverlayLead(null)
          const pl = String(pipelineSlug || '')
          const itemType: 'lead' | 'service_file' | 'tray' = leadAny?.type === 'tray' ? 'tray' : leadAny?.type === 'service_file' ? 'service_file' : 'lead'
          const itemId = itemType === 'lead' ? (leadAny?.leadId || leadAny?.id) : leadAny?.id
          const pipelineId = leadAny?.pipelineId
          if (pl && pipelineId && itemId) {
            writeOpenCard({ pipelineSlug: pl, pipelineId, itemType, itemId, openedAt: Date.now(), deFacturatOverlay: false })
          }
        }}
      />

      {/* Quality Check – Validation (mobil + desktop). UI ca pipeline-urile departamentelor. */}
      <Dialog open={qcOpen} onOpenChange={(open) => { if (!open) closeQc(); else setQcOpen(true) }}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Quality Check – Validation</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {qcLoading ? (
              <div className="flex items-center gap-2 text-sm py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                Se încarcă detaliile…
              </div>
            ) : (
              <>
                {/* Bloc Tăviță – același UI ca în departamente */}
                <div className="space-y-2 p-3 bg-muted/30 rounded-md border">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm text-foreground">
                      Tăviță #{qcTrayInfo?.number ?? (qcLead as any)?.trayNumber ?? '—'}
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div><span className="font-medium">Dimensiune:</span> {qcTrayInfo?.size ?? 'N/A'}</div>
                    <div>
                      <span className="font-medium">Status:</span>{' '}
                      {(() => {
                        const s = (qcTrayInfo?.status ?? '').toLowerCase()
                        if (/lucru/.test(s)) return 'În lucru'
                        if (/finalizat|gata/.test(s)) return 'Finalizată'
                        if (/asteptare/.test(s)) return 'În așteptare'
                        if (/noua|nou/.test(s)) return 'Nouă'
                        return qcTrayInfo?.status ?? '—'
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1 border-t border-border/50">
                    {(qcLead as any)?.name && <span>Client: <span className="font-semibold text-foreground">{(qcLead as any).name}</span></span>}
                    {(qcLead as any)?.qcSourcePipelineName && <span>Dep.: <span className="font-semibold text-foreground">{(qcLead as any).qcSourcePipelineName}</span></span>}
                  </div>
                  {/* Tehnicieni care au lucrat la tăviță */}
                  {qcTrayInfo?.technicians && qcTrayInfo.technicians.length > 0 && (
                    <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50">
                      <User className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                      <span className="text-muted-foreground">Lucrat de:</span>
                      <span className="font-semibold text-red-600">
                        {qcTrayInfo.technicians.join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Detalii Tăviță – listă Card per item, ca în departamente */}
                <h3 className="font-semibold text-sm text-muted-foreground uppercase">Detalii Tăviță</h3>
                {qcTrayItems.filter((it: any) => it?.service_id || it?.part_id).length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Nu există items în această tăviță</div>
                ) : (
                  <div className="space-y-3">
                    {qcTrayItems
                      .filter((it: any) => it?.service_id || it?.part_id)
                      .map((item: any) => {
                        const name = item.service_id
                          ? (item.service?.name || 'Serviciu necunoscut')
                          : (qcPartsMap[item.part_id] || 'Piesă necunoscută')
                        const isPart = !!item.part_id
                        return (
                          <Card key={item.id} className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium text-sm">{name}</h4>
                                  <Badge variant={isPart ? 'secondary' : 'outline'} className="text-[10px]">
                                    {isPart ? 'Piesă' : 'Serviciu'}
                                  </Badge>
                                </div>
                                {item.instrument_id && (
                                  <p className="text-xs text-muted-foreground">
                                    Instrument: {qcInstrumentsMap[item.instrument_id] || 'Necunoscut'}
                                  </p>
                                )}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Cantitate:</span>
                                  <span className="text-sm font-medium">{Number(item.qty) || 1}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Label htmlFor={`qc-unrepaired-${item.id}`} className="text-xs text-muted-foreground whitespace-nowrap">
                                    Instrumente nereparate:
                                  </Label>
                                  <Input
                                    id={`qc-unrepaired-${item.id}`}
                                    type="number"
                                    min={0}
                                    max={Number(item.qty) || 1}
                                    className="w-16 h-8 text-sm"
                                    value={qcUnrepairedByItemId[item.id] ?? (item as any)?.unrepaired_qty ?? 0}
                                    onChange={(e) => {
                                      const qty = Number(item.qty) || 1
                                      const v = Math.min(qty, Math.max(0, parseInt(e.target.value, 10) || 0))
                                      setQcUnrepairedByItemId((prev) => ({ ...prev, [item.id]: v }))
                                    }}
                                    disabled={qcLoading}
                                  />
                                </div>
                              </div>
                            </div>
                          </Card>
                        )
                      })}
                  </div>
                )}

                {/* Notițe QC – opțional, salvate în payload la Validate / Dont Validate */}
                <div className="space-y-2 p-3 bg-muted/30 rounded-md border">
                  <Label htmlFor="qc-notes" className="text-sm font-medium text-foreground">
                    Notițe (opțional)
                  </Label>
                  <Textarea
                    id="qc-notes"
                    placeholder="Adaugă notițe pentru această validare QC…"
                    value={qcNotes}
                    onChange={(e) => setQcNotes(e.target.value)}
                    className="min-h-[80px] resize-y"
                    disabled={qcLoading}
                  />
                </div>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              data-button-id="vanzariQcCloseButton"
              variant="outline"
              onClick={closeQc}
              disabled={qcAction !== null}
              className="w-full sm:w-auto min-h-11 touch-manipulation"
              title="Închide dialog QC"
            >
              Închide
            </Button>
            <Button
              data-button-id="vanzariQcDontValidateButton"
              variant="destructive"
              onClick={handleQcDontValidate}
              disabled={qcLoading || qcAction !== null}
              className="w-full sm:w-auto min-h-11 touch-manipulation"
              title="Refuză validarea QC"
            >
              {qcAction === 'dont_validate' ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Dont Validate</> : 'Dont Validate'}
            </Button>
            <Button
              data-button-id="vanzariQcValidateButton"
              onClick={handleQcValidate}
              disabled={qcLoading || qcAction !== null}
              className="w-full sm:w-auto min-h-11 touch-manipulation"
              title="Confirmă validarea QC"
            >
              {qcAction === 'validate' ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Validate</> : 'Validate'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Toaster />

      <Dialog open={createStageOpen} onOpenChange={setCreateStageOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 shadow-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Creează Stage Nou</DialogTitle>
          </DialogHeader>
          
          {/* Header cu gradient */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center">
                <LayoutGrid className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Creează Stage Nou</h2>
                <p className="text-indigo-100 text-sm">Adaugă un nou stage în pipeline</p>
              </div>
            </div>
          </div>
          
          {/* Content */}
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              setCreateErr(null)
              setCreatingStage(true)
              try {
                const res = await fetch("/api/stages", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ pipelineSlug, name: stageName }),
                })
                const json = await res.json()
                if (!res.ok) throw new Error(json.error || "Failed to create stage")

                invalidateStageIdsCache()
                clearDashboardFullCache()
                // close + clear + refresh local data
                setCreateStageOpen(false)
                setStageName("")
                await refresh()
              } catch (err: any) {
                setCreateErr(err.message || "Failed to create stage")
              } finally {
                setCreatingStage(false)
              }
            }}
            className="p-6 space-y-5"
          >
            {/* Info box */}
            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-800">
              <div className="flex items-center gap-3">
                <LayoutGrid className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <p className="font-medium text-indigo-900 dark:text-indigo-100">Nume stage</p>
                  <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1">
                    Introdu numele noului stage (ex: LEADURI, ÎN PROCES, FINALIZAT)
                  </p>
                </div>
              </div>
            </div>
            
            {/* Input field */}
            <div className="space-y-2">
              <Label htmlFor="stage-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Nume stage <span className="text-red-500">*</span>
              </Label>
              <Input
                id="stage-name"
                autoFocus
                required
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder="ex: LEADURI"
                disabled={creatingStage}
                className="h-12 text-lg font-semibold border-2 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>

            {createErr && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{createErr}</p>
              </div>
            )}
            
            {/* Footer */}
            <div className="border-t pt-4 flex items-center justify-between gap-3">
              <Button
                data-button-id="vanzariCreateStageCancelButton"
                type="button"
                variant="ghost"
                onClick={() => setCreateStageOpen(false)}
                disabled={creatingStage}
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400"
                title="Închide fără a crea stage"
              >
                Anulează
              </Button>
              <Button
                data-button-id="vanzariCreateStageSubmitButton"
                type="submit"
                disabled={creatingStage || !stageName.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 px-6 shadow-lg"
                title="Creează stage"
              >
                {creatingStage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Se creează...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Creează Stage
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog pentru creare lead nou in Vanzari */}
      <Dialog open={createLeadOpen} onOpenChange={setCreateLeadOpen}>
        <DialogContent className="sm:max-w-5xl p-0 overflow-hidden border-0 shadow-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>Creează Leaduri</DialogTitle>
          </DialogHeader>
          
          {/* Header cu gradient */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center">
                <UserPlus className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Creează Leaduri</h2>
                <p className="text-emerald-100 text-sm">Completează informațiile pentru noul lead</p>
              </div>
            </div>
          </div>
          
          {/* Content - scrollable */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Informații de bază */}
              <div className="space-y-4">
                <div className={`grid grid-cols-1 ${pipelineSlug?.toLowerCase() === 'parteneri' ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
                  <div className="space-y-2">
                    <Label htmlFor="lead-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Nume și Prenume <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="lead-name"
                        value={newLeadData.full_name}
                        onChange={(e) => {
                          const value = e.target.value
                          setNewLeadData(prev => {
                            const updated = { ...prev, full_name: value }
                            if (pipelineSlug?.toLowerCase() !== 'parteneri') {
                              if (!prev.contact_person || prev.contact_person === prev.full_name) {
                                updated.contact_person = value
                              }
                              if (!prev.billing_nume_prenume || prev.billing_nume_prenume === prev.full_name) {
                                updated.billing_nume_prenume = value
                              }
                            }
                            return updated
                          })
                        }}
                        placeholder="Nume și prenume"
                        className="pl-10 h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                        disabled={creatingLead}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lead-phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Telefon <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="lead-phone"
                        type="tel"
                        value={newLeadData.phone_number}
                        onChange={(e) => {
                          const value = e.target.value
                          setNewLeadData(prev => {
                            const updated = { ...prev, phone_number: value }
                            if (pipelineSlug?.toLowerCase() !== 'parteneri') {
                              if (!prev.contact_phone || prev.contact_phone === prev.phone_number) {
                                updated.contact_phone = value
                              }
                            }
                            return updated
                          })
                        }}
                        placeholder="+40 123 456 789"
                        className="pl-10 h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                        disabled={creatingLead}
                      />
                    </div>
                  </div>
                  
                  {pipelineSlug?.toLowerCase() !== 'parteneri' && (
                  <div className="space-y-2">
                    <Label htmlFor="lead-email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Email:
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="lead-email"
                        type="email"
                        value={newLeadData.email}
                        onChange={(e) => setNewLeadData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="email@example.com"
                        className="pl-10 h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                        disabled={creatingLead}
                      />
                    </div>
                  </div>
                  )}
                </div>

                {/* Parteneri: alege partenerul (stage-ul) – obligatoriu – afișat imediat sub Nume și Telefon */}
                {pipelineSlug?.toLowerCase() === 'parteneri' && partnerStagesForSelect.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Partener <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={partnerStageId ?? ''}
                      onValueChange={(v) => setPartnerStageId(v || null)}
                      disabled={creatingLead}
                    >
                      <SelectTrigger className="h-12 border-2 focus:border-emerald-500">
                        <SelectValue placeholder="Alege partenerul" />
                      </SelectTrigger>
                      <SelectContent>
                        {partnerStagesForSelect.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              
              {/* Date de livrare – ascunse pentru Parteneri */}
              {pipelineSlug?.toLowerCase() !== 'parteneri' && (<div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Date de livrare</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="lead-company" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Companie:
                    </Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="lead-company"
                        value={newLeadData.company_name}
                        onChange={(e) => {
                          const value = e.target.value
                          setNewLeadData(prev => {
                            const updated = { ...prev, company_name: value }
                            // Pre-populează numele companiei de facturare dacă este gol sau dacă este sincronizat cu valoarea anterioară
                            if (!prev.billing_nume_companie || prev.billing_nume_companie === prev.company_name) {
                              updated.billing_nume_companie = value
                            }
                            return updated
                          })
                        }}
                        placeholder="Nume companie"
                        className="pl-10 h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                        disabled={creatingLead}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="lead-strada" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Stradă:
                    </Label>
                    <Input
                      id="lead-strada"
                      value={newLeadData.strada}
                      onChange={(e) => {
                        const value = e.target.value
                        setNewLeadData(prev => {
                          const updated = { ...prev, strada: value }
                          // Pre-populează strada de facturare dacă este goală sau dacă este sincronizată cu valoarea anterioară
                          if (!prev.billing_strada || prev.billing_strada === prev.strada) {
                            updated.billing_strada = value
                          }
                          return updated
                        })
                      }}
                      placeholder="Stradă, număr"
                      className="h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={creatingLead}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lead-city" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Oraș:
                    </Label>
                    <Input
                      id="lead-city"
                      value={newLeadData.city}
                      onChange={(e) => {
                        const value = e.target.value
                        setNewLeadData(prev => {
                          const updated = { ...prev, city: value }
                          // Pre-populează orașul de facturare dacă este gol sau dacă este sincronizat cu valoarea anterioară
                          if (!prev.billing_oras || prev.billing_oras === prev.city) {
                            updated.billing_oras = value
                          }
                          return updated
                        })
                      }}
                      placeholder="București"
                      className="h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={creatingLead}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lead-judet" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Județ:
                    </Label>
                    <Input
                      id="lead-judet"
                      value={newLeadData.judet}
                      onChange={(e) => {
                        const value = e.target.value
                        setNewLeadData(prev => {
                          const updated = { ...prev, judet: value }
                          // Pre-populează județul de facturare dacă este gol sau dacă este sincronizat cu valoarea anterioară
                          if (!prev.billing_judet || prev.billing_judet === prev.judet) {
                            updated.billing_judet = value
                          }
                          return updated
                        })
                      }}
                      placeholder="Bistrița"
                      className="h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={creatingLead}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lead-zip" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Cod postal:
                    </Label>
                    <Input
                      id="lead-zip"
                      value={newLeadData.zip}
                      onChange={(e) => {
                        const value = e.target.value
                        setNewLeadData(prev => {
                          const updated = { ...prev, zip: value }
                          // Pre-populează codul poștal de facturare dacă este gol sau dacă este sincronizat cu valoarea anterioară
                          if (!prev.billing_cod_postal || prev.billing_cod_postal === prev.zip) {
                            updated.billing_cod_postal = value
                          }
                          return updated
                        })
                      }}
                      placeholder="123333"
                      className="h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={creatingLead}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lead-contact-person" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Persoana de contact:
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="lead-contact-person"
                        value={newLeadData.contact_person}
                        onChange={(e) => setNewLeadData(prev => ({ ...prev, contact_person: e.target.value }))}
                        placeholder="Nume și prenume"
                        className="pl-10 h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                        disabled={creatingLead}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lead-contact-phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Telefon:
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="lead-contact-phone"
                        type="tel"
                        value={newLeadData.contact_phone}
                        onChange={(e) => setNewLeadData(prev => ({ ...prev, contact_phone: e.target.value }))}
                        placeholder="+40 123 456 789"
                        className="pl-10 h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                        disabled={creatingLead}
                      />
                    </div>
                  </div>
                </div>
              </div>)}
              
              {/* Date de facturare – ascunse pentru Parteneri */}
              {pipelineSlug?.toLowerCase() !== 'parteneri' && (<div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Date de facturare</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="billing-nume-prenume" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Nume și Prenume:
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="billing-nume-prenume"
                        value={newLeadData.billing_nume_prenume}
                        onChange={(e) => {
                          const value = e.target.value
                          setNewLeadData(prev => {
                            const updated = { ...prev, billing_nume_prenume: value }
                            // Pre-populează numele principal dacă este gol sau dacă este sincronizat cu valoarea anterioară
                            if (!prev.full_name || prev.full_name === prev.billing_nume_prenume) {
                              updated.full_name = value
                            }
                            // Pre-populează persoana de contact dacă este goală sau dacă este sincronizată cu valoarea anterioară
                            if (!prev.contact_person || prev.contact_person === prev.billing_nume_prenume) {
                              updated.contact_person = value
                            }
                            return updated
                          })
                        }}
                        placeholder="Nume și prenume"
                        className="pl-10 h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                        disabled={creatingLead}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="billing-nume-companie" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Nume Companie:
                    </Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="billing-nume-companie"
                        value={newLeadData.billing_nume_companie}
                        onChange={(e) => {
                          const value = e.target.value
                          setNewLeadData(prev => {
                            const updated = { ...prev, billing_nume_companie: value }
                            // Pre-populează numele companiei din livrare dacă este gol sau dacă este sincronizat cu valoarea anterioară
                            if (!prev.company_name || prev.company_name === prev.billing_nume_companie) {
                              updated.company_name = value
                            }
                            return updated
                          })
                        }}
                        placeholder="Nume companie"
                        className="pl-10 h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                        disabled={creatingLead}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="billing-cui" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      CUI:
                    </Label>
                    <Input
                      id="billing-cui"
                      value={newLeadData.billing_cui}
                      onChange={(e) => setNewLeadData(prev => ({ ...prev, billing_cui: e.target.value }))}
                      placeholder="CUI"
                      className="h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={creatingLead}
                    />
                  </div>
                  
                  <div className="space-y-2 md:col-span-3">
                    <Label htmlFor="billing-strada" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Strada:
                    </Label>
                    <Input
                      id="billing-strada"
                      value={newLeadData.billing_strada}
                      onChange={(e) => {
                        const value = e.target.value
                        setNewLeadData(prev => {
                          const updated = { ...prev, billing_strada: value }
                          // Pre-populează strada de livrare dacă este goală sau dacă este sincronizată cu valoarea anterioară
                          if (!prev.strada || prev.strada === prev.billing_strada) {
                            updated.strada = value
                          }
                          return updated
                        })
                      }}
                      placeholder="Stradă, număr"
                      className="h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={creatingLead}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="billing-oras" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Oraș:
                    </Label>
                    <Input
                      id="billing-oras"
                      value={newLeadData.billing_oras}
                      onChange={(e) => {
                        const value = e.target.value
                        setNewLeadData(prev => {
                          const updated = { ...prev, billing_oras: value }
                          // Pre-populează orașul de livrare dacă este gol sau dacă este sincronizat cu valoarea anterioară
                          if (!prev.city || prev.city === prev.billing_oras) {
                            updated.city = value
                          }
                          return updated
                        })
                      }}
                      placeholder="Oraș"
                      className="h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={creatingLead}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="billing-judet" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Județ:
                    </Label>
                    <Input
                      id="billing-judet"
                      value={newLeadData.billing_judet}
                      onChange={(e) => {
                        const value = e.target.value
                        setNewLeadData(prev => {
                          const updated = { ...prev, billing_judet: value }
                          // Pre-populează județul de livrare dacă este gol sau dacă este sincronizat cu valoarea anterioară
                          if (!prev.judet || prev.judet === prev.billing_judet) {
                            updated.judet = value
                          }
                          return updated
                        })
                      }}
                      placeholder="Județ"
                      className="h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={creatingLead}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="billing-cod-postal" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Cod postal:
                    </Label>
                    <Input
                      id="billing-cod-postal"
                      value={newLeadData.billing_cod_postal}
                      onChange={(e) => {
                        const value = e.target.value
                        setNewLeadData(prev => {
                          const updated = { ...prev, billing_cod_postal: value }
                          // Pre-populează codul poștal de livrare dacă este gol sau dacă este sincronizat cu valoarea anterioară
                          if (!prev.zip || prev.zip === prev.billing_cod_postal) {
                            updated.zip = value
                          }
                          return updated
                        })
                      }}
                      placeholder="Cod poștal"
                      className="h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={creatingLead}
                    />
                  </div>
                </div>
              </div>)}

              {/* Receptie: alege stage-ul în care apare fișa (Curier trimis, De facturat, Office direct) */}
              {pipelineSlug?.toLowerCase() === 'receptie' && receptieStagesForSelect.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Fișa va fi adăugată în stage-ul
                  </Label>
                  <Select
                    value={receptieStageId ?? ''}
                    onValueChange={(v) => setReceptieStageId(v || null)}
                    disabled={creatingLead}
                  >
                    <SelectTrigger className="h-12 border-2 focus:border-emerald-500">
                      <SelectValue placeholder="Alege stage-ul" />
                    </SelectTrigger>
                    <SelectContent>
                      {receptieStagesForSelect.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

            </div>
          </div>
          
          {/* Footer */}
          <div className="border-t px-6 py-4 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between gap-3 flex-shrink-0">
            <Button
              data-button-id="vanzariCreateLeadCancelButton"
              variant="ghost"
              onClick={() => {
                clearCreateLeadDraft()
                setCreateLeadOpen(false)
                setNewLeadData({ 
                  full_name: '', 
                  email: '', 
                  phone_number: '',
                  company_name: '',
                  city: '',
                  judet: '',
                  strada: '',
                  zip: '',
                  contact_person: '',
                  contact_phone: '',
                  billing_nume_prenume: '',
                  billing_nume_companie: '',
                  billing_cui: '',
                  billing_strada: '',
                  billing_oras: '',
                  billing_judet: '',
                  billing_cod_postal: ''
                })
              }}
              disabled={creatingLead}
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400"
              title="Închide fără a crea lead"
            >
              Anulează
            </Button>
            <Button
              data-button-id="vanzariCreateLeadSubmitButton"
              title="Creează lead în pipeline"
              onClick={async () => {
                if (!newLeadData.full_name.trim()) {
                  toast({
                    title: "Eroare",
                    description: "Numele este obligatoriu",
                    variant: "destructive"
                  })
                  return
                }

                if (!newLeadData.phone_number.trim()) {
                  toast({
                    title: "Eroare",
                    description: "Telefonul este obligatoriu",
                    variant: "destructive"
                  })
                  return
                }

                // Parteneri: stage-ul (partenerul) este obligatoriu
                if (pipelineSlug?.toLowerCase() === 'parteneri' && !partnerStageId) {
                  toast({
                    title: "Eroare",
                    description: "Selectează partenerul (Savy, Annete sau PodoCliniq)",
                    variant: "destructive"
                  })
                  return
                }

                // Previne dublarea comenzii
                if (creatingLead) {
                  return
                }

                setCreatingLead(true)
                try {
                  const pipelinesData = await getPipelines()
                  const isReceptie = pipelineSlug?.toLowerCase() === 'receptie'
                  const isParteneri = pipelineSlug?.toLowerCase() === 'parteneri'

                  let targetPipelineId: string
                  let stageId: string
                  let stageName: string

                  if (isParteneri) {
                    // Parteneri: creează lead direct în pipeline-ul Parteneri cu stage-ul selectat
                    const partnerPipeline = pipelinesData?.find((p: any) => toSlug(p.name) === 'parteneri')
                    if (!partnerPipeline) {
                      throw new Error('Pipeline-ul Parteneri nu a fost găsit')
                    }
                    const selectedStage = (partnerPipeline.stages || []).find((s: any) => s.id === partnerStageId)
                    if (!selectedStage) {
                      throw new Error('Selectează un partener (Savy, Annete sau PodoCliniq)')
                    }
                    targetPipelineId = partnerPipeline.id
                    stageId = selectedStage.id
                    stageName = selectedStage.name || 'Parteneri'
                  } else {
                    const vanzariPipeline = pipelinesData?.find((p: any) => toSlug(p.name) === 'vanzari')
                    if (!vanzariPipeline) {
                      throw new Error('Pipeline-ul Vanzari nu a fost gasit')
                    }
                    targetPipelineId = vanzariPipeline.id

                    if (isReceptie) {
                      const avemComanda = (vanzariPipeline.stages || []).find((s: any) => {
                        const n = String(s?.name || '').toLowerCase()
                        return n.includes('avem') && n.includes('comanda')
                      })
                      if (!avemComanda) {
                        throw new Error('Stage-ul "Avem Comanda" nu a fost găsit în Vânzări')
                      }
                      stageId = avemComanda.id
                      stageName = avemComanda.name || 'Avem Comanda'
                    } else {
                      const firstStage = vanzariPipeline.stages?.[0]
                      if (!firstStage) {
                        throw new Error('Pipeline-ul Vanzari nu are stage-uri')
                      }
                      stageId = firstStage.id
                      stageName = firstStage.name || 'Leaduri'
                    }
                  }

                  const leadPayload = {
                    full_name: newLeadData.full_name.trim(),
                    email: newLeadData.email.trim() || null,
                    phone_number: newLeadData.phone_number.trim() || null,
                    company_name: newLeadData.company_name.trim() || null,
                    city: newLeadData.city.trim() || null,
                    judet: newLeadData.judet.trim() || null,
                    strada: newLeadData.strada.trim() || null,
                    zip: newLeadData.zip.trim() || null,
                    contact_person: newLeadData.contact_person.trim() || null,
                    contact_phone: newLeadData.contact_phone.trim() || null,
                    billing_nume_prenume: newLeadData.billing_nume_prenume.trim() || null,
                    billing_nume_companie: newLeadData.billing_nume_companie.trim() || null,
                    billing_cui: newLeadData.billing_cui.trim() || null,
                    billing_strada: newLeadData.billing_strada.trim() || null,
                    billing_oras: newLeadData.billing_oras.trim() || null,
                    billing_judet: newLeadData.billing_judet.trim() || null,
                    billing_cod_postal: newLeadData.billing_cod_postal.trim() || null,
                    platform: 'manual',
                    created_at: new Date().toISOString()
                  }

                  const { data, error } = await createLeadWithPipeline(
                    leadPayload,
                    targetPipelineId,
                    stageId,
                    { currentUserId: user?.id ?? undefined }
                  )

                  if (error) {
                    throw error
                  }

                  if (isReceptie && data?.lead) {
                    const receptiePipeline = pipelinesData?.find((p: any) => {
                      const slug = toSlug(p?.name || '')
                      const nameLower = String(p?.name || '').toLowerCase()
                      return slug === 'receptie' || nameLower.includes('receptie')
                    })
                    const receptieStages = (receptiePipeline?.stages || []) as Array<{ id: string; name: string }>
                    const receptieStage = receptieStageId
                      ? receptieStages.find((s: any) => s.id === receptieStageId) ?? receptieStages[0]
                      : receptieStages[0]
                    if (!receptiePipeline?.id || !receptieStage?.id) {
                      toast({
                        title: "Lead creat",
                        description: "Fișa nu a putut fi adăugată în Receptie (pipeline/stage negăsit). Poți adăuga manual o fișă din detaliile lead-ului.",
                        variant: "destructive"
                      })
                    } else {
                      const stageNameLower = String(receptieStage?.name || '').toLowerCase()
                      const officeDirect = stageNameLower.includes('office') && stageNameLower.includes('direct')
                      const curierTrimis = stageNameLower.includes('curier') && stageNameLower.includes('trimis')
                      try {
                        // Creează fișa de serviciu cu număr global auto (dacă există deja acel număr, folosește următorul disponibil).
                        const { data: firstNum, error: numErr } = await getNextGlobalServiceFileNumber()
                        if (numErr || firstNum == null) {
                          throw numErr || new Error('Nu s-a putut obține numărul fișei')
                        }
                        let candidate = firstNum
                        const today = new Date().toISOString().slice(0, 10)
                        let serviceFile: any = null
                        let sfErr: any = null
                        let attempts = 5
                        while (attempts > 0 && !serviceFile) {
                          const { data: sf, error } = await createServiceFile({
                            lead_id: (data.lead as any).id,
                            number: `Fisa ${candidate}`,
                            date: today,
                            status: 'noua',
                            office_direct: officeDirect,
                            curier_trimis: curierTrimis,
                          })
                          if (error) {
                            const msg = String(error.message || '')
                            const isDuplicate = msg.includes('există deja') || msg.includes('creată deja') || msg.includes('race condition')
                            if (isDuplicate) {
                              candidate++
                              attempts--
                              sfErr = error
                              continue
                            }
                            sfErr = error
                            break
                          }
                          serviceFile = sf
                        }

                        if (sfErr || !serviceFile?.id) {
                          toast({
                            title: "Lead creat",
                            description: "Fișa de serviciu nu a putut fi creată: " + (sfErr?.message || 'eroare necunoscută'),
                            variant: "destructive"
                          })
                        } else {
                          const { error: addErr } = await addServiceFileToPipeline(serviceFile.id, receptiePipeline.id, receptieStage.id)
                          if (addErr) {
                            toast({
                              title: "Lead creat",
                              description: "Fișa nu a putut fi adăugată pe board Receptie: " + (addErr?.message || ''),
                              variant: "destructive"
                            })
                          } else {
                            await new Promise(r => setTimeout(r, 200))
                            let newCard = (await getSingleKanbanItem('service_file', serviceFile.id, receptiePipeline.id)).data
                            if (!newCard) {
                              await new Promise(r => setTimeout(r, 400))
                              newCard = (await getSingleKanbanItem('service_file', serviceFile.id, receptiePipeline.id)).data
                            }
                            if (newCard) {
                              addNewItemToBoard(newCard as KanbanLead)
                            } else {
                              const leadData = data.lead as { id: string; full_name?: string; email?: string; phone_number?: string }
                              const minimalCard = {
                                id: serviceFile.id,
                                name: newLeadData.full_name || leadData?.full_name || 'Nou',
                                email: newLeadData.email || leadData?.email || '',
                                phone: newLeadData.phone_number || leadData?.phone_number || '',
                                stage: receptieStage.name,
                                stageId: receptieStage.id,
                                pipelineId: receptiePipeline.id,
                                assignmentId: `new-${serviceFile.id}`,
                                leadId: leadData?.id ?? (data.lead as any)?.id ?? '',
                                createdAt: new Date().toISOString(),
                                serviceFileNumber: serviceFile.number ?? `Fisa ${nextNum ?? 1}`,
                                isFisa: true,
                                tags: [],
                              } as KanbanLead
                              addNewItemToBoard(minimalCard)
                            }
                          }
                        }
                      } catch (e) {
                        console.error('Eroare la crearea fișei în Receptie:', e)
                        toast({
                          title: "Lead creat",
                          description: "Fișa în Receptie nu a putut fi creată: " + (e instanceof Error ? e.message : 'eroare'),
                          variant: "destructive"
                        })
                      }
                    }
                  }

                  toast({
                    title: "Lead creat",
                    description: isParteneri
                      ? `Lead-ul "${newLeadData.full_name}" a fost adăugat în Parteneri → ${stageName}`
                      : isReceptie
                        ? `Lead-ul și fișa "${newLeadData.full_name}" au fost adăugate în Receptie. Apare pe board.`
                        : `Lead-ul "${newLeadData.full_name}" a fost adăugat în Vânzări`,
                    action: isReceptie ? (
                      <ToastAction altText="Mergi la Vânzări" onClick={() => router.push('/leads/vanzari')}>
                        Mergi la Vânzări
                      </ToastAction>
                    ) : undefined,
                  })

                  clearCreateLeadDraft()
                  setCreateLeadOpen(false)
                  setNewLeadData({
                    full_name: '',
                    email: '',
                    phone_number: '',
                    company_name: '',
                    city: '',
                    judet: '',
                    strada: '',
                    zip: '',
                    contact_person: '',
                    contact_phone: '',
                    billing_nume_prenume: '',
                    billing_nume_companie: '',
                    billing_cui: '',
                    billing_strada: '',
                    billing_oras: '',
                    billing_judet: '',
                    billing_cod_postal: ''
                  })

                  if (isReceptie && data?.lead) {
                    const lead = data.lead as any
                    const panelLead = {
                      ...lead,
                      name: lead.full_name || lead.name || '',
                      stage: stageName,
                      email: lead.email ?? '',
                      phone: lead.phone_number ?? lead.phone ?? ''
                    }
                    const pl = panelLead as KanbanLead
                    setSelectedLead(pl)
                    setLeadPosition({ x: 0, y: 0, side: 'right' as const })
                    setLeadToOpenAfterCreate(pl)
                    setOverridePipelineSlugForPanel('vanzari')
                  }

                  if (!isReceptie || isParteneri) {
                    await refresh()
                    router.refresh?.()
                  }
                } catch (error: any) {
                  console.error('Eroare la crearea lead-ului:', error)
                  toast({
                    title: "Eroare",
                    description: error?.message || "Nu s-a putut crea lead-ul",
                    variant: "destructive"
                  })
                } finally {
                  setCreatingLead(false)
                }
              }}
              disabled={creatingLead || !newLeadData.full_name.trim() || !newLeadData.phone_number.trim() || (pipelineSlug?.toLowerCase() === 'parteneri' && !partnerStageId)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6 shadow-lg"
            >
              {creatingLead ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Se creează...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Creează Lead
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <StageOrderCustomizer
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        pipelineName={activePipelineName || ''}
        stages={stages}
        orderedStages={orderedStages}
        itemCounts={Object.fromEntries(
          orderedStages.map(s => [s, leads.filter(l => l.stage === s).length])
        )}
        onSave={(ordered) => {
          if (pipelineSlug) {
            setStageOrder(pipelineSlug, ordered)
            toast({ title: "Ordinea a fost salvată" })
          }
        }}
        onReset={() => {
          if (pipelineSlug) {
            setStageOrder(pipelineSlug, stages)
            toast({ title: "Ordinea a fost resetată" })
          }
        }}
      />
    </div>
  )
}
