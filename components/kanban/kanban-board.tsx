"use client"

import type React from "react"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { LazyLeadCard } from "./LazyLeadCard"
import { cn } from "@/lib/utils"
import type { KanbanLead } from "../lib/types/database"
import { Trash2, Loader2, TrendingUp, Inbox, Move, X, ArrowUpDown, ArrowUp, ArrowDown, MessageSquare, Package, PhoneCall, PhoneMissed, XCircle, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Layers, Minus } from "lucide-react"
import { toast } from "sonner"
import { updateLead, updateLeadWithHistory } from "@/lib/supabase/leadOperations"
import { setLeadNoDeal } from "@/lib/vanzari/leadOperations"
import { CallbackDialog } from "@/components/leads/vanzari/CallbackDialog"
import { NuRaspundeDialog } from "@/components/leads/vanzari/NuRaspundeDialog"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { useRole } from "@/lib/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { MessageCard } from "./message-card"
import { useMessagesFromTechnicians } from "@/hooks/useMessagesFromTechnicians"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogFooter
} from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { isLivrariOrCurierAjunsAziStage } from "@/lib/supabase/kanban/constants"

interface KanbanBoardProps {
  leads: KanbanLead[]
  stages: string[]
  onLeadMove: (leadId: string, newStage: string) => void
  onLeadClick: (lead: KanbanLead, event?: React.MouseEvent) => void
  onMessageClick?: (serviceFileId: string, conversationId: string) => void
  onDeleteStage?: (stageName: string) => Promise<void>
  currentPipelineName?: string
  onPinToggle?: (leadId: string, isPinned: boolean) => void
  pipelines?: string[]
  onBulkMoveToStage?: (leadIds: string[], newStage: string) => Promise<void>
  onBulkMoveToPipeline?: (leadIds: string[], pipelineName: string) => Promise<void>
  /** După ștergere card (lead/fișă/tăviță) reîmprospătează board-ul fără reload */
  onRefresh?: () => void
  /** Actualizare optimistă pentru Preia/Eliberează – fără refresh */
  onClaimChange?: (leadId: string, claimedBy: string | null, claimedByName?: string | null) => void
  /** Actualizare în timp real a tag-urilor (ex. Nu răspunde, Urgent) */
  onTagsChange?: (leadId: string, tags: { id: string; name: string }[]) => void
  /** Actualizare live la eliminare Curier Trimis / Office Direct (fără refresh) */
  onDeliveryClear?: (leadId: string) => void
  /** Slug pipeline curent (ex. receptie) – pentru butonul Colet neridicat (Recepție vs Vânzări) */
  pipelineSlug?: string
  /** Receptie: callback la Arhivare pe card – mută cardul în stage Arhivat */
  onArchiveCard?: (cardId: string) => Promise<void>
  /** Receptie: returnează true pentru stage-urile unde se afișează butonul Arhivare (ex. De trimis, Ridic PE...) */
  showArchiveForStage?: (stageName: string) => boolean
  /** Receptie: la scoaterea tag-ului Nu răspunde de pe card (fișă) – mută fișa în De facturat și refresh */
  onNuRaspundeClearedForReceptie?: (serviceFileId: string) => void | Promise<void>
  /** Owner only: mută toate lead-urile din stage-ul „Curier Ajuns Azi” în „Avem Comandă” */
  onBulkMoveCurierAjunsAziToAvemComanda?: (leadIds: string[]) => Promise<void>
  /** Vânzări: la adăugarea tag-ului Sună! mută lead-ul în stage-ul Suna */
  onSunaTagAdded?: (leadId: string) => void
  /** Vânzări: la scoaterea tag-ului Sună! mută lead-ul în Leaduri sau Leaduri Straine (după telefon) */
  onSunaTagRemoved?: (leadId: string, phone: string | undefined) => void
}

export function KanbanBoard({ 
  leads, 
  stages, 
  onLeadMove, 
  onLeadClick, 
  onMessageClick,
  onDeleteStage, 
  currentPipelineName, 
  onPinToggle,
  pipelines = [],
  onBulkMoveToStage,
  onBulkMoveToPipeline,
  onRefresh,
  onClaimChange,
  onTagsChange,
  onDeliveryClear,
  pipelineSlug,
  onArchiveCard,
  showArchiveForStage,
  onNuRaspundeClearedForReceptie,
  onBulkMoveCurierAjunsAziToAvemComanda,
  onSunaTagAdded,
  onSunaTagRemoved,
}: KanbanBoardProps) {
  const { role } = useRole()
  const canMovePipeline = role === 'owner' || role === 'admin'
  
  const [draggedLead, setDraggedLead] = useState<string | null>(null)
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [stageTotals, setStageTotals] = useState<Record<string, number>>({})
  const [loadingTotals, setLoadingTotals] = useState<Record<string, boolean>>({})
  const [leadTotals, setLeadTotals] = useState<Record<string, number>>({})

  const { isOwner } = useRole()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [targetStage, setTargetStage] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  
  // Încarcă mesajele de la tehnicieni pentru stage-ul Messages
  const isReceptiePipeline = currentPipelineName?.toLowerCase().includes('receptie') || false
  // Normalizare fără diacritice ca „Vânzări” să fie recunoscut (vanzari)
  const pipelineNameNorm = (currentPipelineName ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const isVanzariPipeline = pipelineNameNorm.includes('vanzari') || false
  const hasMessagesStage = stages.some(s => s.toLowerCase() === 'messages')
  /** La Vânzări, lead-urile rămân doar în acest pipeline și nu pot fi mutate în alt pipeline. */
  const canShowMoveToPipeline = canMovePipeline && !isVanzariPipeline
  const { messages: technicianMessages, loading: messagesLoading } = useMessagesFromTechnicians({
    enabled: isReceptiePipeline && hasMessagesStage,
    limit: 50
  })
  
  // dialog pentru mutarea in batch
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [moveType, setMoveType] = useState<'stage' | 'pipeline' | null>(null)
  const [selectedTargetStage, setSelectedTargetStage] = useState<string>('')
  const [selectedTargetPipeline, setSelectedTargetPipeline] = useState<string>('')
  const [isMoving, setIsMoving] = useState(false)
  const [layout, setLayout] = useState<'vertical' | 'horizontal' | 'compact' | 'focus'>('vertical')
  const [focusedStage, setFocusedStage] = useState<string | null>(null)
  const [bulkRidicatLoading, setBulkRidicatLoading] = useState<Record<string, boolean>>({})
  const [curierAjunsAziMoveLoading, setCurierAjunsAziMoveLoading] = useState(false)
  const [coletNeridicatLoading, setColetNeridicatLoading] = useState(false)
  const [bulkCallbackDialogOpen, setBulkCallbackDialogOpen] = useState(false)
  const [bulkNuRaspundeDialogOpen, setBulkNuRaspundeDialogOpen] = useState(false)
  const [bulkActionSaving, setBulkActionSaving] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollToFirstStage = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }, [])
  const scrollToMiddleStage = useCallback(() => {
    const el = scrollContainerRef.current
    if (el) {
      const target = Math.max(0, (el.scrollWidth - el.clientWidth) / 2)
      el.scrollTo({ left: target, behavior: 'smooth' })
    }
  }, [])
  const scrollToLastStage = useCallback(() => {
    const el = scrollContainerRef.current
    if (el) el.scrollTo({ left: el.scrollWidth - el.clientWidth, behavior: 'smooth' })
  }, [])

  // Partner tag stacking – cardurile cu SAVY/ANNETE/PODOCLINIQ sunt grupate
  const PARTNER_TAGS = useMemo(() => ['savy', 'annete', 'podocliniq'], [])
  const [expandedPartnerGroups, setExpandedPartnerGroups] = useState<Set<string>>(new Set())

  const getPartnerTag = useCallback((lead: KanbanLead): string | null => {
    const tags = Array.isArray(lead?.tags) ? lead.tags : []
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i]
      if (t?.name && PARTNER_TAGS.includes(t.name.toLowerCase().trim().replace(/\s+/g, ''))) {
        return t.name.toUpperCase()
      }
    }
    return null
  }, [PARTNER_TAGS])

  const togglePartnerGroup = useCallback((groupKey: string) => {
    setExpandedPartnerGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }, [])
  
  // Id-urile selectate care sunt lead-uri (excluse tray/service_file) pentru acțiuni bulk Vânzări
  const selectedLeadIds = useMemo(() => {
    return Array.from(selectedLeads).filter((id) => {
      const item = leads.find((l) => l.id === id) as any
      return item && item.type !== 'tray' && item.type !== 'service_file'
    })
  }, [selectedLeads, leads])
  
  // State pentru sortarea fiecărui stage ('asc' = crescătoare, 'desc' = descrescătoare)
  // Folosim localStorage pentru persistență
  const [stageSortOrder, setStageSortOrder] = useState<Record<string, 'asc' | 'desc'>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const saved = localStorage.getItem('kanban_stage_sort_order')
      const savedData = saved ? JSON.parse(saved) : {}
      
      // Pentru pipeline-ul Receptie, setăm sortarea implicită descrescătoare (cel mai nou prim)
      // pentru stage-urile "Curier Trimis" și "Office Direct"
      const isReceptiePipeline = currentPipelineName?.toLowerCase().includes('receptie') || false
      if (isReceptiePipeline) {
        const updatedData = { ...savedData }
        
        // Verifică toate stage-urile și setează implicit 'desc' pentru Curier Trimis și Office Direct
        stages.forEach(stage => {
          const stageLower = stage.toLowerCase()
          const isCurierTrimis = stageLower.includes('curier') && stageLower.includes('trimis')
          const isOfficeDirect = stageLower.includes('office') && stageLower.includes('direct')
          
          if ((isCurierTrimis || isOfficeDirect) && !updatedData.hasOwnProperty(stage)) {
            updatedData[stage] = 'desc'
          }
        })
        
        return updatedData
      }
      
      return savedData
    } catch {
      return {}
    }
  })
  
  // Funcție pentru toggle sortare pentru un stage
  const toggleStageSort = useCallback((stage: string) => {
    setStageSortOrder(prev => {
      const current = prev[stage] || 'asc' // Implicit crescătoare (cel mai vechi prim)
      const newOrder: 'asc' | 'desc' = current === 'asc' ? 'desc' : 'asc'
      const updated = { ...prev, [stage]: newOrder }
      
      // Salvează în localStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('kanban_stage_sort_order', JSON.stringify(updated))
        } catch (e) {
          console.error('Eroare la salvarea preferințelor de sortare:', e)
        }
      }
      
      return updated
    })
  }, [])

  // Stage-ul "Arhivat" (în Recepție) - țintă pentru butonul "Ridicat"
  const archivedStageName = useMemo(() => {
    const exact = stages.find(s => s.toLowerCase() === 'arhivat')
    if (exact) return exact
    const contains = stages.find(s => s.toLowerCase().includes('arhiv'))
    return contains || null
  }, [stages])

  const handleRidicatAllInStage = useCallback(async (sourceStage: string, leadIds: string[]) => {
    if (!archivedStageName) {
      toast.error('Stage-ul Arhivat nu a fost găsit în pipeline.')
      return
    }
    if (!leadIds || leadIds.length === 0) return

    setBulkRidicatLoading(prev => ({ ...prev, [sourceStage]: true }))
    try {
      if (onBulkMoveToStage) {
        await onBulkMoveToStage(leadIds, archivedStageName)
      } else {
        for (const id of leadIds) {
          onLeadMove(id, archivedStageName)
        }
      }
    } catch (e) {
      console.error('[KanbanBoard] Eroare la Ridicat -> Arhivat:', e)
      toast.error('Eroare la mutarea în Arhivat. Încearcă din nou.')
    } finally {
      setBulkRidicatLoading(prev => ({ ...prev, [sourceStage]: false }))
    }
  }, [archivedStageName, onBulkMoveToStage, onLeadMove])

  // Handler pentru activarea colet_ajuns pentru fișele din DE TRIMIS
  const handleTrimiAllInStage = useCallback(async (sourceStage: string, leadIds: string[]) => {
    if (!leadIds || leadIds.length === 0) return

    setBulkRidicatLoading(prev => ({ ...prev, [sourceStage]: true }))
    try {
      // Filtrăm doar service_file IDs (pentru că colet_ajuns este pe service_files)
      const serviceFileIds = leadIds
        .map(id => {
          const item = leads.find(l => l.id === id) as any
          return item?.type === 'service_file' ? id : null
        })
        .filter(Boolean)

      if (serviceFileIds.length === 0) {
        toast.warning('Nu există fișe de service în acest stage.')
        return
      }

      // Apelăm API-ul pentru a seta colet_ajuns = true
      const res = await fetch('/api/service-files/set-colet-ajuns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceFileIds })
      })

      const data = await res.json()
      if (data?.success) {
        toast.success(`${data.updatedCount} ${data.updatedCount === 1 ? 'fișă marcată' : 'fișe marcate'} ca "Colet ajuns"`)
        onRefresh?.()
      } else {
        toast.error(data?.error || 'Eroare la marcarea Colet ajuns')
      }
    } catch (e) {
      console.error('[KanbanBoard] Eroare la activarea colet_ajuns:', e)
      toast.error('Eroare la marcarea Colet ajuns. Încearcă din nou.')
    } finally {
      setBulkRidicatLoading(prev => ({ ...prev, [sourceStage]: false }))
    }
  }, [leads, onRefresh])

  // Mută fișele din Curier Trimis în Colet neridicat
  // Recepție: toate fișele din stage → mutare + flag colet_neridicat. Vânzări: doar cele expirate (2+ zile).
  const handleMoveCurierTrimisToColetNeridicat = useCallback(async () => {
    setColetNeridicatLoading(true)
    try {
      const isReceptie = (pipelineSlug ?? '').toLowerCase().includes('receptie')
      const url = isReceptie
        ? '/api/leads/move-to-colet-neridicat'
        : '/api/leads/expire-callbacks'
      const options: RequestInit = {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }
      if (isReceptie) {
        (options as any).body = JSON.stringify({ pipelineSlug: 'receptie' })
      }
      const res = await fetch(url, options)
      const data = await res.json().catch(() => ({}))
      const moved = data?.movedCount ?? data?.coletNeridicatMovedCount ?? 0
      if (data?.ok && moved > 0) {
        toast.success(`${moved} ${moved === 1 ? 'fișă mutată' : 'fișe mutate'} în Colet neridicat`)
        onRefresh?.()
      } else if (data?.ok && moved === 0) {
        toast.info(isReceptie ? 'Nicio fișă în stage-ul CURIER TRIMIS' : 'Nicio fișă eligibilă (Curier Trimis de 2+ zile)')
      } else if (!data?.ok) {
        toast.error(data?.error ?? 'Eroare la mutare')
      }
    } catch (e) {
      console.error('[KanbanBoard] Eroare mutare Curier Trimis -> Colet neridicat:', e)
      toast.error('Eroare la mutare')
    } finally {
      setColetNeridicatLoading(false)
    }
  }, [onRefresh, pipelineSlug])

  async function handleConfirmDelete() {
    if (!targetStage) return
    setDeleteErr(null)
    setDeleting(true)
    try {
      if (typeof onDeleteStage === "function") {
        await onDeleteStage(targetStage)
      }
      setConfirmOpen(false)
      setTargetStage(null)
    } catch (e: any) {
      setDeleteErr(e?.message ?? "Failed to delete stage")
    } finally {
      setDeleting(false)
    }
  }

  // memoizeaza lead-urile grupate pe stage pentru performanta
  const leadsByStage = useMemo(() => {
    const grouped: Record<string, KanbanLead[]> = {}
    
    stages.forEach(stage => {
      grouped[stage] = []
    })
    
    leads.forEach(lead => {
      if (lead.stage && grouped[lead.stage]) {
        grouped[lead.stage].push(lead)
      }
    })
    
    // sorteaza lead-urile pentru fiecare stage
    const isReceptie = currentPipelineName?.toLowerCase().includes('receptie') || false
    
    Object.keys(grouped).forEach(stage => {
      const stageLower = stage.toLowerCase()
      const isDeConfirmat = stageLower.includes('confirmat') && !stageLower.includes('confirmari')
      const isInAsteptare = stageLower.includes('asteptare')
      const isLeadNou = stageLower.includes('lead') && stageLower.includes('nou')
      const isLeadsStage = (stageLower === 'leads' || stageLower === 'leaduri') ||
        (stageLower.includes('lead') && !stageLower.includes('callback') && !stageLower.includes('nou'))
      
      // pentru pipeline-ul Receptie, stage-urile "De confirmat" si "In asteptare" se sorteaza dupa timpul in stage
      const isArchived = stageLower === 'arhivat'
      const shouldSortByTimeInStage = (isReceptie && (isDeConfirmat || isInAsteptare)) || isArchived
      
      grouped[stage].sort((a, b) => {
        // prioritate maxima pentru pinned leads
        const aTags = Array.isArray(a?.tags) ? a.tags : []
        const bTags = Array.isArray(b?.tags) ? b.tags : []
        
        if (!Array.isArray(aTags) || !Array.isArray(bTags)) {
          console.error('❌ [kanban-board] ERROR: aTags or bTags is NOT an array!', { aTags, bTags })
          return 0
        }
        
        // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
        let aIsPinned = false
        for (let i = 0; i < aTags.length; i++) {
          const tag = aTags[i]
          if (tag && tag.name === 'PINNED') {
            aIsPinned = true
            break
          }
        }
        
        let bIsPinned = false
        for (let i = 0; i < bTags.length; i++) {
          const tag = bTags[i]
          if (tag && tag.name === 'PINNED') {
            bIsPinned = true
            break
          }
        }
        
        if (aIsPinned && !bIsPinned) return -1
        if (!aIsPinned && bIsPinned) return 1
        
        // prioritate pentru Urgentare (fișe/tăvițe – primul în listă, după PINNED)
        const aHasUrgentare = aTags.some((t: any) => t && t.name === 'Urgentare')
        const bHasUrgentare = bTags.some((t: any) => t && t.name === 'Urgentare')
        if (aHasUrgentare && !bHasUrgentare) return -1
        if (!aHasUrgentare && bHasUrgentare) return 1
        
        // prioritate pentru cardurile cu tag Retur (afișate primele, după PINNED)
        let aHasRetur = false
        for (let i = 0; i < aTags.length; i++) {
          const tag = aTags[i]
          if (tag && tag.name && tag.name.toLowerCase() === 'retur') {
            aHasRetur = true
            break
          }
        }
        let bHasRetur = false
        for (let i = 0; i < bTags.length; i++) {
          const tag = bTags[i]
          if (tag && tag.name && tag.name.toLowerCase() === 'retur') {
            bHasRetur = true
            break
          }
        }
        if (aHasRetur && !bHasRetur) return -1
        if (!aHasRetur && bHasRetur) return 1
        
        // prioritate pentru cardurile cu tag Sună! (timp depășit – afișate primele, după PINNED) - doar în LEADuri sau leaduri straine
        const isStageAllowedForSuna = stageLower === 'leaduri' || stageLower === 'leads' || stageLower.includes('leaduri straine') || stageLower.includes('leaduristraine')
        const now = Date.now()
        const hasSuna = (item: any) => {
          if (!isStageAllowedForSuna) return false
          const cb = item?.callback_date
          const nr = item?.nu_raspunde_callback_at
          const isCallbackOverdue = !!cb && new Date(cb).getTime() <= now
          const isNuRaspundeOverdue = !!nr && new Date(nr).getTime() <= now
          if (!isCallbackOverdue && !isNuRaspundeOverdue) return false
          const ack = item?.suna_acknowledged_at
          const maxOverdue = [cb, nr].filter(Boolean).sort((x, y) => new Date(y).getTime() - new Date(x).getTime())[0]
          if (ack && maxOverdue && new Date(ack).getTime() >= new Date(maxOverdue).getTime()) return false
          return true
        }
        const aHasSuna = hasSuna(a)
        const bHasSuna = hasSuna(b)
        if (aHasSuna && !bHasSuna) return -1
        if (!aHasSuna && bHasSuna) return 1
        
        
        // prioritate pentru urgent tags - FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
        let aHasUrgent = false
        for (let i = 0; i < aTags.length; i++) {
          const tag = aTags[i]
          if (tag && tag.name && tag.name.toLowerCase() === 'urgent') {
            aHasUrgent = true
            break
          }
        }
        
        let bHasUrgent = false
        for (let i = 0; i < bTags.length; i++) {
          const tag = bTags[i]
          if (tag && tag.name && tag.name.toLowerCase() === 'urgent') {
            bHasUrgent = true
            break
          }
        }
        
        if (aHasUrgent && !bHasUrgent) return -1
        if (!aHasUrgent && bHasUrgent) return 1
        
        // CALL BACK: sortare mereu cel mai vechi → cel mai nou (asc). Fără callback_date la final.
        const isCallBackStage = stageLower.includes('call back') || stageLower.includes('callback')
        if (isCallBackStage) {
          const aRaw = (a as any).callback_date ? new Date((a as any).callback_date).getTime() : 0
          const bRaw = (b as any).callback_date ? new Date((b as any).callback_date).getTime() : 0
          const aDate = aRaw || Number.MAX_SAFE_INTEGER
          const bDate = bRaw || Number.MAX_SAFE_INTEGER
          if (aDate !== bDate) return aDate - bDate
          const aFallback = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const bFallback = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return aFallback - bFallback
        }
        
        // NU RĂSPUNDE: la fel – cel mai vechi → cel mai nou. Fără dată la final.
        const isNuRaspundeStage = stageLower.includes('nu raspunde')
        if (isNuRaspundeStage) {
          const aRaw = (a as any).nu_raspunde_callback_at ? new Date((a as any).nu_raspunde_callback_at).getTime() : 0
          const bRaw = (b as any).nu_raspunde_callback_at ? new Date((b as any).nu_raspunde_callback_at).getTime() : 0
          const aDate = aRaw || Number.MAX_SAFE_INTEGER
          const bDate = bRaw || Number.MAX_SAFE_INTEGER
          if (aDate !== bDate) return aDate - bDate
          const aFallback = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const bFallback = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return aFallback - bFallback
        }
        
        // RECEPȚIE: sortare după data creării fișei de serviciu (nu a lead-ului)
        if (isReceptie) {
          const aServiceFileDate = (a as any).service_file_created_at 
            ? new Date((a as any).service_file_created_at).getTime() 
            : (a.createdAt ? new Date(a.createdAt).getTime() : 0)
          const bServiceFileDate = (b as any).service_file_created_at 
            ? new Date((b as any).service_file_created_at).getTime() 
            : (b.createdAt ? new Date(b.createdAt).getTime() : 0)
          
          // Sortare: respectă preferința de sortare pentru stage
          const sortOrder = stageSortOrder[stage] || 'asc'
          
          if (sortOrder === 'desc') {
            // Descrescătoare: cele mai noi vor fi primele
            return bServiceFileDate - aServiceFileDate
          } else {
            // Crescătoare: cel mai vechi prim
            return aServiceFileDate - bServiceFileDate
          }
        }
        
        // daca suntem in Receptie si stage-ul este "De confirmat" sau "In asteptare" sau "Arhivat", sortam dupa timpul in stage
        if (shouldSortByTimeInStage) {
          const aMovedAt = a.stageMovedAt ? new Date(a.stageMovedAt).getTime() : 0
          const bMovedAt = b.stageMovedAt ? new Date(b.stageMovedAt).getTime() : 0
          
          const sortOrder = stageSortOrder[stage] || 'asc'
          if (aMovedAt !== bMovedAt) {
            return sortOrder === 'desc'
              ? bMovedAt - aMovedAt
              : aMovedAt - bMovedAt
          }
        }
        
        // Sortare implicită după data creării - respectă preferința de sortare pentru stage
        const sortOrder = stageSortOrder[stage] || 'asc' // Implicit crescătoare (cel mai vechi prim)
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0
        
        if (sortOrder === 'desc') {
          // Descrescătoare: cele mai noi vor fi primele
          return bDate - aDate
        } else {
          // Crescătoare: cel mai vechi prim (implicit)
          return aDate - bDate
        }
      })
    })
    
    return grouped
  }, [leads, stages, stageSortOrder])

  const getLeadsByStage = useCallback((stage: string) => {
    return leadsByStage[stage] || []
  }, [leadsByStage])

  // calculeaza totalurile pentru fiecare stage (optimizat cu batch requests)
  useEffect(() => {
    let cancelled = false

    const calculateStageTotals = async () => {
      // Verifică dacă suntem în pipeline-ul Vanzari - dacă da, nu calculăm totaluri
      const isVanzariPipeline = currentPipelineName?.toLowerCase().includes('vanzari') || false
      
      // Stage-uri de exclus din Receptie (doar messages și de confirmat - fără totaluri)
      const excludedReceptieStages = ['messages', 'de confirmat'].map(s => s.toLowerCase())
      const isReceptiePipeline = currentPipelineName?.toLowerCase().includes('receptie') || false
      
      const newTotals: Record<string, number> = {}
      const newLoadingStates: Record<string, boolean> = {}

      // Dacă suntem în Vanzari, nu calculăm totaluri
      if (isVanzariPipeline) {
        stages.forEach(stage => {
          newTotals[stage] = 0
          newLoadingStates[stage] = false
        })
        setStageTotals(newTotals)
        setLoadingTotals(newLoadingStates)
        setLeadTotals({})
        return
      }

      // colecteaza toate lead-urile pentru batch request
      const stageLeadMap: Record<string, string[]> = {}
      let hasAnyLeads = false
      
      for (const stage of stages) {
        // Exclude stage-urile specificate din Receptie
        if (isReceptiePipeline && excludedReceptieStages.includes(stage.toLowerCase())) {
          newTotals[stage] = 0
          newLoadingStates[stage] = false
          continue
        }
        
        const stageLeads = getLeadsByStage(stage)
        if (stageLeads.length === 0) {
          newTotals[stage] = 0
          newLoadingStates[stage] = false
          continue
        }

        hasAnyLeads = true
        newLoadingStates[stage] = true
        // Folosim leadId pentru leads normale, sau id pentru quotes
        // Trebuie să folosim același ID atât pentru stageLeadMap, cât și pentru totalsMap
        const leadIds = stageLeads.map(lead => {
          if (lead.isQuote && lead.quoteId) {
            return lead.id // Pentru quotes, folosim lead.id
          }
          return lead.leadId || lead.id // Pentru leads normale, folosim leadId (sau id dacă leadId nu există)
        })
        stageLeadMap[stage] = leadIds
      }

      if (!hasAnyLeads) {
        setStageTotals(newTotals)
        setLoadingTotals(newLoadingStates)
        setLeadTotals({})
        return
      }

      try {
        // Calculează totalurile pe stage folosind câmpul 'total' din leads (pentru toate tipurile: lead, service_file, tray)
        const totalsMap: Record<string, number> = {}
        
        for (const stage of stages) {
          // Exclude stage-urile specificate din Receptie
          if (isReceptiePipeline && excludedReceptieStages.includes(stage.toLowerCase())) {
            continue
          }
          
          const stageLeads = getLeadsByStage(stage)
          let stageTotal = 0
          
          stageLeads.forEach(lead => {
            const leadAny = lead as any
            const t = leadAny.total != null && typeof leadAny.total === 'number' ? leadAny.total : 0
            stageTotal += t
            totalsMap[lead.id] = t
          })
          
          newTotals[stage] = stageTotal
          newLoadingStates[stage] = false
        }
        
        if (cancelled) return

        if (!cancelled) {
          setStageTotals(newTotals)
          setLoadingTotals(newLoadingStates)
          setLeadTotals(totalsMap)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Eroare la calcularea totalurilor:', error)
          // seteaza toate totalurile la 0 in caz de eroare
          stages.forEach(stage => {
            if (isReceptiePipeline && excludedReceptieStages.includes(stage.toLowerCase())) {
              newTotals[stage] = 0
            } else {
            newTotals[stage] = 0
            }
            newLoadingStates[stage] = false
          })
          setStageTotals(newTotals)
          setLoadingTotals(newLoadingStates)
        }
      }
    }

    if (leads.length > 0 && stages.length > 0) {
      calculateStageTotals()
    }

    return () => {
      cancelled = true
    }
  }, [leadsByStage, stages, getLeadsByStage, currentPipelineName])

  const handleDragStart = (leadId: string) => {
    setDraggedLead(leadId)
  }

  const handleDragEnd = () => {
    setDraggedLead(null)
    setDragOverStage(null)
  }

  const handleDragOver = useCallback((e: React.DragEvent, stage: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Blochează drop-ul pentru stage-urile restricționate în Receptie
    const isReceptiePipeline = currentPipelineName?.toLowerCase().includes('receptie') || false
    if (isReceptiePipeline) {
      const stageLower = stage.toLowerCase()
      // De facturat nu e restricționat – se pot muta tăvițe înapoi la De facturat (ex. din De trimis / Arhivat)
      const restrictedStages = ['in asteptare', 'în așteptare', 'in lucru', 'în lucru']
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      let isRestricted = false
      for (let i = 0; i < restrictedStages.length; i++) {
        const restricted = restrictedStages[i]
        if (stageLower.includes(restricted)) {
          isRestricted = true
          break
        }
      }
      if (isRestricted) {
        return // Nu permite drag over pentru stage-uri restricționate
      }
    }
    
    setDragOverStage(stage)
  }, [currentPipelineName])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // verifica daca parasmi cu adevarat containerul (nu doar un child)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverStage(null)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, stage: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Blochează drop-ul pentru stage-urile restricționate în Receptie
    const isReceptiePipeline = currentPipelineName?.toLowerCase().includes('receptie') || false
    if (isReceptiePipeline) {
      const stageLower = stage.toLowerCase()
      // De facturat nu e restricționat – se pot muta tăvițe înapoi la De facturat (ex. din De trimis / Arhivat)
      const restrictedStages = ['in asteptare', 'în așteptare', 'in lucru', 'în lucru']
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      let isRestricted = false
      for (let i = 0; i < restrictedStages.length; i++) {
        const restricted = restrictedStages[i]
        if (stageLower.includes(restricted)) {
          isRestricted = true
          break
        }
      }
      if (isRestricted) {
        setDraggedLead(null)
        setDragOverStage(null)
        return // Nu permite drop pentru stage-uri restricționate
      }
    }
    
    // daca sunt lead-uri selectate, muta-le pe toate
    if (selectedLeads.size > 0) {
      const leadIds = Array.from(selectedLeads)
      if (onBulkMoveToStage) {
        onBulkMoveToStage(leadIds, stage).then(() => {
          setSelectedLeads(new Set())
        })
      }
    } else if (draggedLead) {
      // muta lead-ul draguit
      onLeadMove(draggedLead, stage)
    }
    
    setDraggedLead(null)
    setDragOverStage(null)
  }, [draggedLead, onLeadMove, selectedLeads, onBulkMoveToStage, currentPipelineName])

  const handleLeadSelect = useCallback((leadId: string, isSelected: boolean) => {
    setSelectedLeads(prev => {
      const next = new Set(prev)
      if (isSelected) {
        next.add(leadId)
      } else {
        next.delete(leadId)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set())
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)))
    }
  }, [leads, selectedLeads.size])

  const handleOpenMoveDialog = useCallback((type: 'stage' | 'pipeline') => {
    setMoveType(type)
    setSelectedTargetStage('')
    setSelectedTargetPipeline('')
    setMoveDialogOpen(true)
  }, [])

  const handleBulkMove = useCallback(async () => {
    if (selectedLeads.size === 0) return
    
    // Verifică permisiunea pentru mutarea în pipeline
    if (moveType === 'pipeline' && !canShowMoveToPipeline) {
      return
    }
    
    const leadIds = Array.from(selectedLeads)
    setIsMoving(true)
    
    try {
      if (moveType === 'stage' && selectedTargetStage && onBulkMoveToStage) {
        await onBulkMoveToStage(leadIds, selectedTargetStage)
      } else if (moveType === 'pipeline' && selectedTargetPipeline && onBulkMoveToPipeline && canShowMoveToPipeline) {
        await onBulkMoveToPipeline(leadIds, selectedTargetPipeline)
      }
      
      setMoveDialogOpen(false)
      setSelectedLeads(new Set())
      setMoveType(null)
      setSelectedTargetStage('')
      setSelectedTargetPipeline('')
    } catch (error) {
      console.error('Eroare la mutarea lead-urilor:', error)
    } finally {
      setIsMoving(false)
    }
  }, [selectedLeads, moveType, selectedTargetStage, selectedTargetPipeline, onBulkMoveToStage, onBulkMoveToPipeline, canShowMoveToPipeline])

  /** Grupează lead-urile dintr-un stage: cardurile cu tag SAVY/ANNETE/PODOCLINIQ devin un stack colapsabil. */
  type GroupedEntry = { type: 'lead'; lead: KanbanLead } | { type: 'partner-group'; tag: string; leads: KanbanLead[]; total: number }
  const groupStageLeads = useCallback((stageLeads: KanbanLead[], stage: string): GroupedEntry[] => {
    const partnerBuckets = new Map<string, KanbanLead[]>()
    const normalLeads: KanbanLead[] = []
    for (const lead of stageLeads) {
      const pt = getPartnerTag(lead)
      if (pt) {
        if (!partnerBuckets.has(pt)) partnerBuckets.set(pt, [])
        partnerBuckets.get(pt)!.push(lead)
      } else {
        normalLeads.push(lead)
      }
    }
    const entries: GroupedEntry[] = []
    // Grupurile de parteneri vin primele
    for (const [tag, pLeads] of partnerBuckets) {
      const total = pLeads.reduce((acc, l) => acc + (leadTotals[l.id] ?? (l as any).total ?? 0), 0)
      entries.push({ type: 'partner-group', tag, leads: pLeads, total })
    }
    // Apoi lead-urile normale
    for (const lead of normalLeads) {
      entries.push({ type: 'lead', lead })
    }
    return entries
  }, [getPartnerTag, leadTotals])

  return (
    <div className="flex flex-col flex-1 min-h-0 ">
      {selectedLeads.size > 0 && (
        <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-md mb-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <span className="font-semibold">
              {selectedLeads.size} lead{selectedLeads.size === 1 ? '' : '-uri'} selectat{selectedLeads.size === 1 ? '' : 'e'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedLeads(new Set())}
            >
              <X className="h-4 w-4 mr-1" />
              Anuleaza
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {isVanzariPipeline && selectedLeadIds.length > 0 && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setBulkCallbackDialogOpen(true)}
                  disabled={bulkActionSaving}
                  title="Programează Call Back pentru toate"
                >
                  <PhoneCall className="h-4 w-4 mr-1 text-emerald-600" />
                  Call Back
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setBulkNuRaspundeDialogOpen(true)}
                  disabled={bulkActionSaving}
                  title="Marchează Nu răspunde pentru toate"
                >
                  <PhoneMissed className="h-4 w-4 mr-1 text-red-600" />
                  Nu răspunde
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const noDealStage = stages.find((s) => /no\s*deal|nodeal/i.test(s)) ?? 'No deal'
                    const isVanzari = currentPipelineName && /vanzari|vânzări/i.test(String(currentPipelineName))
                    setBulkActionSaving(true)
                    try {
                      if (isVanzari) {
                        for (const leadId of selectedLeadIds) {
                          const { error } = await setLeadNoDeal(leadId)
                          if (error) {
                            toast.error('Eroare la marcarea No deal.')
                            break
                          }
                        }
                        setSelectedLeads(new Set())
                        onRefresh?.()
                        toast.success(`${selectedLeadIds.length} lead-uri mutate în No Deal (atribute eliminate).`)
                      } else {
                        for (const leadId of selectedLeadIds) {
                          const { error } = await updateLead(leadId, { no_deal: true })
                          if (error) {
                            toast.error('Eroare la marcarea No deal.')
                            break
                          }
                          onLeadMove(leadId, noDealStage)
                        }
                        setSelectedLeads(new Set())
                        onRefresh?.()
                        toast.success(`${selectedLeadIds.length} lead-uri mutate în ${noDealStage}.`)
                      }
                    } catch (e: any) {
                      toast.error(e?.message ?? 'Eroare la No deal.')
                    } finally {
                      setBulkActionSaving(false)
                    }
                  }}
                  disabled={bulkActionSaving}
                  title="Marchează No deal pentru toate"
                >
                  <XCircle className="h-4 w-4 mr-1 text-gray-600" />
                  No deal
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleOpenMoveDialog('stage')}
            >
              <Move className="h-4 w-4 mr-1" />
              Mută în Stage
            </Button>
            {pipelines.length > 0 && canShowMoveToPipeline && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleOpenMoveDialog('pipeline')}
              >
                <Move className="h-4 w-4 mr-1" />
                Mută în Pipeline
              </Button>
            )}
          </div>
        </div>
      )}

      {layout === 'vertical' || layout === 'compact' ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-end gap-1 mb-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={scrollToFirstStage}
              title="Mergi la primul stage"
            >
              <ChevronsLeft className="h-4 w-4 mr-1" />
              Primul stage
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={scrollToMiddleStage}
              title="Mergi la mijlocul stage-urilor"
            >
              <Minus className="h-4 w-4 mr-1" />
              Stage din mijloc
              <Minus className="h-4 w-4 ml-1" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={scrollToLastStage}
              title="Mergi la ultimul stage"
            >
              Ultimul stage
              <ChevronsRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
          <div
            ref={scrollContainerRef}
            className="flex h-[calc(100vh-8rem)] min-h-[705px] flex-shrink-0 gap-3 overflow-x-auto overflow-y-hidden pb-2 scroll-smooth scrollbar-hide items-stretch"
          >
          {stages.map((stage) => {
            const stageLeads = getLeadsByStage(stage)
            const isDragOver = dragOverStage === stage
            const isLoading = loadingTotals[stage]

            // Pentru header: cardurile stackate (partner-group) nu intră în totalul stage-ului nici ca sumă nici ca număr; doar în stackul lor
            const groupedEntries = groupStageLeads(stageLeads, stage)
            const displayCount = groupedEntries.length
            const displayTotal = groupedEntries.reduce((sum, entry) => {
              if (entry.type === 'lead') return sum + (leadTotals[entry.lead.id] ?? (entry.lead as any).total ?? 0)
              return sum
            }, 0)
            const total = displayTotal
            const stageLeadCount = displayCount

            // Verifică dacă stage-ul este restricționat în Receptie
            const isReceptiePipeline = currentPipelineName?.toLowerCase().includes('receptie') || false
            const stageLower = stage.toLowerCase()
            // De facturat nu e restricționat – se pot muta tăvițe înapoi la De facturat (ex. din De trimis / Arhivat)
            const restrictedStages = ['in asteptare', 'în așteptare', 'in lucru', 'în lucru']
            // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
            let isRestrictedStage = false
            if (isReceptiePipeline) {
              for (let i = 0; i < restrictedStages.length; i++) {
                const restricted = restrictedStages[i]
                if (stageLower.includes(restricted)) {
                  isRestrictedStage = true
                  break
                }
              }
            }

            // Butoane de acțiune rapide în Recepție
            // "Ridicat" pentru stage-urile: "De ridicat" și "Ridic personal"
            // "Trimis" pentru stage-ul: "De trimis"
            const showRidicatButton =
              isReceptiePipeline &&
              (stageLower.includes('de ridicat') || stageLower.includes('ridic personal')) &&
              !!archivedStageName
            
            const showTrimiButton =
              isReceptiePipeline &&
              stageLower.includes('de trimis') &&
              !!archivedStageName
            
            return (
              <div
                key={stage}
                className={cn(
                  "flex-shrink-0 flex flex-col min-h-0 h-full max-h-full bg-card rounded-md border border-border transition-all duration-200 overflow-hidden",
                  // +15% lățime coloane stage:
                  // - w-80 (320px) -> 368px
                  // - w-64 (256px) -> ~295px
                  layout === 'vertical' ? "w-[368px]" : "w-[295px]",
                  layout === 'compact' && "text-xs",
                  isDragOver && !isRestrictedStage && "ring-2 ring-primary ring-offset-2 bg-accent/50 scale-[1.02] shadow-lg",
                  isRestrictedStage && "opacity-60 cursor-not-allowed"
                )}
                style={{ minHeight: 0 }}
                onDragOver={!isRestrictedStage ? (e) => handleDragOver(e, stage) : undefined}
                onDragLeave={!isRestrictedStage ? handleDragLeave : undefined}
                onDrop={!isRestrictedStage ? (e) => handleDrop(e, stage) : undefined}
              >
                {/* Header stage */}
                <div className="shrink-0 p-4 border-b border-border bg-muted/30 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-card-foreground truncate">{stage}</h3>
                        {/* Buton sortare pentru stage */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleStageSort(stage)
                          }}
                          title={stageSortOrder[stage] === 'desc' ? 'Sortare descrescătoare (cel mai nou prim)' : 'Sortare crescătoare (cel mai vechi prim)'}
                        >
                          {stageSortOrder[stage] === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Inbox className="h-3.5 w-3.5" />
                          {stageLeadCount} {stageLeadCount === 1 ? "lead" : "leads"}
                        </span>
                      </div>
                    </div>

                    {/* Acțiune rapidă: Ridicat -> Arhivat (mută toate cardurile din stage) */}
                    {showRidicatButton && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-xs shrink-0"
                        disabled={bulkRidicatLoading[stage] || stageLeads.length === 0}
                        onClick={(e) => {
                          e.stopPropagation()
                          const ids = stageLeads.map(l => l.id)
                          void handleRidicatAllInStage(stage, ids)
                        }}
                        title={`Mută toate cardurile în "${archivedStageName}"`}
                      >
                        {bulkRidicatLoading[stage] ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Ridicat
                          </span>
                        ) : (
                          'Ridicat'
                        )}
                      </Button>
                    )}

                    {/* Acțiune rapidă: Trimis -> Arhivat (mută toate cardurile din stage) */}
                    {showTrimiButton && (
                      <Button
                        data-button-id="receptieStageTrimisButton"
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-xs shrink-0"
                        disabled={bulkRidicatLoading[stage] || stageLeads.length === 0}
                        onClick={(e) => {
                          e.stopPropagation()
                          const ids = stageLeads.map(l => l.id)
                          void handleTrimiAllInStage(stage, ids)
                        }}
                        title={`Mută toate cardurile în "${archivedStageName}"`}
                      >
                        {bulkRidicatLoading[stage] ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Trimis
                          </span>
                        ) : (
                          'Trimis'
                        )}
                      </Button>
                    )}

                    {/* Owner only: Livrari (ex-Curier Ajuns Azi) -> Avem Comandă (mută toate cardurile din stage) */}
                    {(() => {
                      const isCurierAjunsAzi = isLivrariOrCurierAjunsAziStage(stage)
                      const showBtn = isCurierAjunsAzi && isVanzariPipeline && isOwner && onBulkMoveCurierAjunsAziToAvemComanda && stageLeads.length > 0
                      if (!showBtn) return null
                      // ID-uri carduri (l.id) ca fiecare card să fie mutat; pentru service_file l.id e fișa, pentru lead l.id e lead-ul
                      const cardIds = stageLeads.map((l: KanbanLead) => l.id).filter(Boolean) as string[]
                      return (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2 text-xs shrink-0"
                          disabled={curierAjunsAziMoveLoading}
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (cardIds.length === 0) return
                            setCurierAjunsAziMoveLoading(true)
                            try {
                              await onBulkMoveCurierAjunsAziToAvemComanda(cardIds)
                              // Întârziere scurtă ca DB-ul și realtime să persiste înainte de refetch
                              setTimeout(() => onRefresh?.(), 500)
                            } finally {
                              setCurierAjunsAziMoveLoading(false)
                            }
                          }}
                          title="Mută toate lead-urile în Avem Comandă"
                        >
                          {curierAjunsAziMoveLoading ? (
                            <span className="flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Mutare...
                            </span>
                          ) : (
                            'În Avem Comandă'
                          )}
                        </Button>
                      )
                    })()}

                    {/* Container pentru suma totală și butonul Colet neridicat */}
                    {(() => {
                      const isVanzariPipeline = currentPipelineName?.toLowerCase().includes('vanzari') || false
                      const isReceptiePipeline = currentPipelineName?.toLowerCase().includes('receptie') || false
                      const stageLower = stage.toLowerCase()
                      const excludedReceptieStages = ['messages', 'de confirmat'].map(s => s.toLowerCase())
                      const isExcludedStage = isReceptiePipeline && excludedReceptieStages.includes(stageLower)
                      // Fără sumă totală: Colet neridicat, Curier trimis, Office direct, Arhivat (Receptie)
                      const isNoTotalReceptieStage = isReceptiePipeline && (
                        (stageLower.includes('colet') && stageLower.includes('neridicat')) ||
                        (stageLower.includes('curier') && stageLower.includes('trimis')) ||
                        (stageLower.includes('office') && stageLower.includes('direct')) ||
                        stageLower.includes('arhivat')
                      )
                      const showColetNeridicat = isReceptiePipeline && stageLower.includes('curier') && stageLower.includes('trimis')
                      
                      // Nu afișează statistici/totale pentru stage-uri exclude (Messages, De confirmat, Colet neridicat, Curier trimis, Office direct, Arhivat)
                      if (isVanzariPipeline || isExcludedStage || isNoTotalReceptieStage || stageLower === 'messages') {
                        return null
                      }
                      
                      return (
                        <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                          {/* Suma totală */}
                          {isLoading ? (
                            <div className="space-y-1">
                              <Skeleton className="h-4 w-16" />
                              <Skeleton className="h-3 w-12" />
                            </div>
                          ) : (
                            <div className="flex flex-col items-end">
                              <div className="flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-500">
                                <TrendingUp className="h-3.5 w-3.5" />
                                {total.toFixed(2)} RON
                              </div>
                              {total > 0 && (
                                <span className="text-[10px] text-muted-foreground">Total</span>
                              )}
                            </div>
                          )}
                          
                          {/* Recepție – stage CURIER TRIMIS: mută în Colet neridicat fișele cu Curier Trimis de 2+ zile */}
                          {showColetNeridicat && (
                            <Button
                              data-button-id="receptieColetNeridicatButton"
                              variant="secondary"
                              size="sm"
                              className="h-7 px-2 text-xs shrink-0 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-700 font-semibold shadow-sm"
                              disabled={coletNeridicatLoading}
                              onClick={(e) => {
                                e.stopPropagation()
                                void handleMoveCurierTrimisToColetNeridicat()
                              }}
                              title={currentPipelineName?.toLowerCase().includes('receptie') ? 'Mută toate fișele din CURIER TRIMIS în Colet neridicat' : 'Mută în Colet neridicat fișele cu Curier Trimis aplicat acum 2+ zile'}
                            >
                              {coletNeridicatLoading ? (
                                <span className="flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Se mută...
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Package className="h-3 w-3" />
                                  Colet neridicat
                                </span>
                              )}
                            </Button>
                          )}
                        </div>
                      )
                    })()}

                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => { setTargetStage(stage); setConfirmOpen(true) }}
                        aria-label={`Delete stage ${stage}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* content area: înălțime fixă (restul coloanei), scroll propriu per stage */}
                <div
                  className={cn(
                    "flex-1 min-h-0 p-4 space-y-3 overflow-y-auto overflow-x-hidden scroll-smooth scrollbar-stage"
                  )}
                  style={{ minHeight: 0 }}
                >
                  {stageLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-[200px] text-center">
                      <div className="rounded-lg bg-muted p-4 mb-3">
                        <Inbox className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground mb-1">Nu există lead-uri</p>
                      <p className="text-xs text-muted-foreground">
                        Trage un lead aici pentru a-l muta în acest stage
                      </p>
                      {isDragOver && (
                        <div className="mt-4 px-3 py-2 rounded-md bg-primary/10 text-primary text-xs font-medium animate-in fade-in">
                          Eliberează pentru a muta
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {groupStageLeads(stageLeads, stage).map((entry, gi) => {
                        if (entry.type === 'partner-group') {
                          const groupKey = `${stage}::${entry.tag}`
                          const isExpanded = expandedPartnerGroups.has(groupKey)
                          return (
                            <div key={`pg-${entry.tag}`} className="rounded-lg border border-border overflow-hidden">
                              <button
                                type="button"
                                onClick={() => togglePartnerGroup(groupKey)}
                                className="w-full flex items-center gap-2 px-3 py-2 bg-muted/60 hover:bg-muted transition-colors text-left"
                              >
                                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                <Layers className="h-4 w-4 shrink-0 text-emerald-600" />
                                <span className="font-semibold text-sm">{entry.tag}</span>
                                <span className="text-xs text-muted-foreground">({entry.leads.length} {entry.leads.length === 1 ? 'card' : 'carduri'})</span>
                                <span className="ml-auto text-xs font-medium text-emerald-600">{entry.total.toFixed(2)} RON</span>
                              </button>
                              {isExpanded && (
                                <div className="p-2 space-y-2 bg-muted/20">
                                  {entry.leads.map((lead) => (
                                    <LazyLeadCard
                                      key={lead.id}
                                      lead={lead}
                                      onMove={onLeadMove}
                                      onClick={(e) => onLeadClick(lead, e)}
                                      onDragStart={() => handleDragStart(lead.id)}
                                      onDragEnd={handleDragEnd}
                                      isDragging={draggedLead === lead.id}
                                      stages={stages}
                                      onPinToggle={onPinToggle}
                                      isSelected={selectedLeads.has(lead.id)}
                                      onSelectChange={(selected) => handleLeadSelect(lead.id, selected)}
                                      leadTotal={leadTotals[lead.id] ?? (lead as any).total ?? 0}
                                      pipelineName={currentPipelineName}
                                      onRefresh={onRefresh}
                                      onClaimChange={onClaimChange}
                                      onTagsChange={onTagsChange}
                                      onDeliveryClear={onDeliveryClear}
                                      onNuRaspundeClearedForReceptie={onNuRaspundeClearedForReceptie}
                                      showArchiveButton={showArchiveForStage?.(stage)}
                                      onArchive={onArchiveCard ? () => onArchiveCard(lead.id) : undefined}
                                      onSunaTagAdded={onSunaTagAdded}
                                      onSunaTagRemoved={onSunaTagRemoved}
                                    />
                                  ))}
                                </div>
                              )}
                              {!isExpanded && entry.leads.length > 1 && (
                                <div className="relative h-2 bg-muted/30">
                                  <div className="absolute inset-x-2 top-0 h-1 rounded-b bg-border/40" />
                                  <div className="absolute inset-x-4 top-0.5 h-1 rounded-b bg-border/20" />
                                </div>
                              )}
                            </div>
                          )
                        }
                        const lead = entry.lead
                        return (
                          <div
                            key={lead.id}
                            className={cn(
                              "animate-in fade-in slide-in-from-bottom-2",
                              `duration-300 delay-[${gi * 50}ms]`
                            )}
                            style={{ animationDelay: `${gi * 50}ms` }}
                          >
                            <LazyLeadCard
                              lead={lead}
                              onMove={onLeadMove}
                              onClick={(e) => onLeadClick(lead, e)}
                              onDragStart={() => handleDragStart(lead.id)}
                              onDragEnd={handleDragEnd}
                              isDragging={draggedLead === lead.id}
                              stages={stages}
                              onPinToggle={onPinToggle}
                              isSelected={selectedLeads.has(lead.id)}
                              onSelectChange={(selected) => handleLeadSelect(lead.id, selected)}
                              leadTotal={leadTotals[lead.id] ?? (lead as any).total ?? 0}
                              pipelineName={currentPipelineName}
                              onRefresh={onRefresh}
                              onClaimChange={onClaimChange}
                              onTagsChange={onTagsChange}
                              onDeliveryClear={onDeliveryClear}
                              onNuRaspundeClearedForReceptie={onNuRaspundeClearedForReceptie}
                              showArchiveButton={showArchiveForStage?.(stage)}
                              onArchive={onArchiveCard ? () => onArchiveCard(lead.id) : undefined}
                              onSunaTagAdded={onSunaTagAdded}
                              onSunaTagRemoved={onSunaTagRemoved}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : layout === 'horizontal' ? (
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto pb-2 scroll-smooth scrollbar-hide">
          {stages.map((stage) => {
            const stageLeads = getLeadsByStage(stage)
            const isDragOver = dragOverStage === stage
            const isLoading = loadingTotals[stage]
            const groupedEntries = groupStageLeads(stageLeads, stage)
            const stageLeadCount = groupedEntries.length
            const total = groupedEntries.reduce((sum, entry) => {
              if (entry.type === 'lead') return sum + (leadTotals[entry.lead.id] ?? (entry.lead as any).total ?? 0)
              return sum
            }, 0)
            
            // Verifică dacă stage-ul este restricționat în Receptie
            const isReceptiePipeline = currentPipelineName?.toLowerCase().includes('receptie') || false
            const stageLower = stage.toLowerCase()
            // De facturat nu e restricționat – se pot muta tăvițe înapoi la De facturat (ex. din De trimis / Arhivat)
            const restrictedStages = ['in asteptare', 'în așteptare', 'in lucru', 'în lucru']
            // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
            let isRestrictedStage = false
            if (isReceptiePipeline) {
              for (let i = 0; i < restrictedStages.length; i++) {
                const restricted = restrictedStages[i]
                if (stageLower.includes(restricted)) {
                  isRestrictedStage = true
                  break
                }
              }
            }

            return (
              <div
                key={stage}
                className={cn(
                  "bg-card rounded-md border border-border transition-all duration-200",
                  isDragOver && !isRestrictedStage && "ring-2 ring-primary ring-offset-2 bg-accent/50 scale-[1.01] shadow-lg",
                  isRestrictedStage && "opacity-60 cursor-not-allowed"
                )}
                onDragOver={!isRestrictedStage ? (e) => handleDragOver(e, stage) : undefined}
                onDragLeave={!isRestrictedStage ? handleDragLeave : undefined}
                onDrop={!isRestrictedStage ? (e) => handleDrop(e, stage) : undefined}
              >
                {/* header reutilizat */}
                <div className="p-4 border-b border-border bg-muted/30 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-card-foreground truncate">{stage}</h3>
                        {/* Buton sortare pentru stage */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleStageSort(stage)
                          }}
                          title={stageSortOrder[stage] === 'desc' ? 'Sortare descrescătoare (cel mai nou prim)' : 'Sortare crescătoare (cel mai vechi prim)'}
                        >
                          {stageSortOrder[stage] === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Inbox className="h-3.5 w-3.5" />
                          {stageLeadCount} {stageLeadCount === 1 ? "lead" : "leads"}
                        </span>
                      </div>
                    </div>

                    {(() => {
                      const isVanzariPipeline = currentPipelineName?.toLowerCase().includes('vanzari') || false
                      const isReceptiePipeline = currentPipelineName?.toLowerCase().includes('receptie') || false
                      const stageLower = stage.toLowerCase()
                      const excludedReceptieStages = ['messages', 'de confirmat'].map(s => s.toLowerCase())
                      const isExcludedStage = isReceptiePipeline && excludedReceptieStages.includes(stageLower)
                      const isNoTotalReceptieStage = isReceptiePipeline && (
                        (stageLower.includes('colet') && stageLower.includes('neridicat')) ||
                        (stageLower.includes('curier') && stageLower.includes('trimis')) ||
                        (stageLower.includes('office') && stageLower.includes('direct')) ||
                        stageLower.includes('arhivat')
                      )
                      if (isVanzariPipeline || isExcludedStage || isNoTotalReceptieStage || stageLower === 'messages') {
                        return null
                      }
                      return (
                        <div className="text-right flex-shrink-0">
                          {isLoading ? (
                            <div className="space-y-1">
                              <Skeleton className="h-4 w-16" />
                              <Skeleton className="h-3 w-12" />
                            </div>
                          ) : (
                            <div className="flex flex-col items-end">
                              <div className="flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-500">
                                <TrendingUp className="h-3.5 w-3.5" />
                                {total.toFixed(2)} RON
                              </div>
                              {total > 0 && (
                                <span className="text-[10px] text-muted-foreground">Total</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => { setTargetStage(stage); setConfirmOpen(true) }}
                        aria-label={`Delete stage ${stage}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {stageLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                      <div className="rounded-lg bg-muted p-3 mb-2">
                        <Inbox className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground mb-1">Nu există lead-uri</p>
                      <p className="text-xs text-muted-foreground">
                        Trage un lead aici pentru a-l muta în acest stage
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={handleSelectAll}
                        >
                          Selectează {selectedLeads.size === leads.length ? "niciunul" : "toate"}
                        </button>
                        {isLoading && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Se calculează totalurile...</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {groupStageLeads(stageLeads, stage).map((entry) => {
                          if (entry.type === 'partner-group') {
                            const groupKey = `${stage}::${entry.tag}`
                            const isExpanded = expandedPartnerGroups.has(groupKey)
                            return (
                              <div key={`pg-${entry.tag}`} className="w-[368px] flex-shrink-0 rounded-lg border border-border overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => togglePartnerGroup(groupKey)}
                                  className="w-full flex items-center gap-2 px-3 py-2 bg-muted/60 hover:bg-muted transition-colors text-left"
                                >
                                  {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                  <Layers className="h-4 w-4 shrink-0 text-emerald-600" />
                                  <span className="font-semibold text-sm">{entry.tag}</span>
                                  <span className="text-xs text-muted-foreground">({entry.leads.length})</span>
                                  <span className="ml-auto text-xs font-medium text-emerald-600">{entry.total.toFixed(2)} RON</span>
                                </button>
                                {isExpanded && (
                                  <div className="p-2 space-y-2 bg-muted/20">
                                    {entry.leads.map((lead) => (
                                      <LazyLeadCard
                                        key={lead.id}
                                        lead={lead}
                                        onMove={onLeadMove}
                                        onClick={(e) => onLeadClick(lead, e)}
                                        onDragStart={() => handleDragStart(lead.id)}
                                        onDragEnd={handleDragEnd}
                                        isDragging={draggedLead === lead.id}
                                        stages={stages}
                                        onPinToggle={onPinToggle}
                                        isSelected={selectedLeads.has(lead.id)}
                                        onSelectChange={(selected) => handleLeadSelect(lead.id, selected)}
                                        leadTotal={leadTotals[lead.id] ?? (lead as any).total ?? 0}
                                        pipelineName={currentPipelineName}
                                        onRefresh={onRefresh}
                                        onTagsChange={onTagsChange}
                                        onDeliveryClear={onDeliveryClear}
                                        onNuRaspundeClearedForReceptie={onNuRaspundeClearedForReceptie}
                                        onSunaTagAdded={onSunaTagAdded}
                                        onSunaTagRemoved={onSunaTagRemoved}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          }
                          return (
                            <div key={entry.lead.id} className="w-[368px] flex-shrink-0">
                              <LazyLeadCard
                                lead={entry.lead}
                                onMove={onLeadMove}
                                onClick={(e) => onLeadClick(entry.lead, e)}
                                onDragStart={() => handleDragStart(entry.lead.id)}
                                onDragEnd={handleDragEnd}
                                isDragging={draggedLead === entry.lead.id}
                                stages={stages}
                                onPinToggle={onPinToggle}
                                isSelected={selectedLeads.has(entry.lead.id)}
                                onSelectChange={(selected) => handleLeadSelect(entry.lead.id, selected)}
                                leadTotal={leadTotals[entry.lead.id] ?? (entry.lead as any).total ?? 0}
                                pipelineName={currentPipelineName}
                                onRefresh={onRefresh}
                                onTagsChange={onTagsChange}
                                onDeliveryClear={onDeliveryClear}
                                onNuRaspundeClearedForReceptie={onNuRaspundeClearedForReceptie}
                                showArchiveButton={showArchiveForStage?.(stage)}
                                onArchive={onArchiveCard ? () => onArchiveCard(entry.lead.id) : undefined}
                                onSunaTagAdded={onSunaTagAdded}
                                onSunaTagRemoved={onSunaTagRemoved}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          </div>
        </div>
      ) : (
        /* Layout "focus": afișează doar un stage selectat, pe toată lățimea */
        <div className="flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-260px)] pb-2 scroll-smooth">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="text-sm text-muted-foreground">
              Vezi un singur stage o dată – util pentru lucru concentrat.
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Stage focus:</span>
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                value={focusedStage || ''}
                onChange={(e) => setFocusedStage(e.target.value || null)}
              >
                {stages.map(stage => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>
          </div>

          {stages.filter(s => !focusedStage || s === focusedStage).map((stage) => {
            const stageLeads = getLeadsByStage(stage)
            const isDragOver = dragOverStage === stage
            const isLoading = loadingTotals[stage]
            const groupedEntries = groupStageLeads(stageLeads, stage)
            const stageLeadCount = groupedEntries.length
            const total = groupedEntries.reduce((sum, entry) => {
              if (entry.type === 'lead') return sum + (leadTotals[entry.lead.id] ?? (entry.lead as any).total ?? 0)
              return sum
            }, 0)
            
            // Verifică dacă stage-ul este restricționat în Receptie
            const isReceptiePipeline = currentPipelineName?.toLowerCase().includes('receptie') || false
            const stageLower = stage.toLowerCase()
            // De facturat nu e restricționat – se pot muta tăvițe înapoi la De facturat (ex. din De trimis / Arhivat)
            const restrictedStages = ['in asteptare', 'în așteptare', 'in lucru', 'în lucru']
            // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
            let isRestrictedStage = false
            if (isReceptiePipeline) {
              for (let i = 0; i < restrictedStages.length; i++) {
                const restricted = restrictedStages[i]
                if (stageLower.includes(restricted)) {
                  isRestrictedStage = true
                  break
                }
              }
            }

            return (
              <div
                key={stage}
                className={cn(
                  "bg-card rounded-md border border-border transition-all duration-200",
                  isDragOver && !isRestrictedStage && "ring-2 ring-primary ring-offset-2 bg-accent/50 scale-[1.01] shadow-lg",
                  isRestrictedStage && "opacity-60 cursor-not-allowed"
                )}
                onDragOver={!isRestrictedStage ? (e) => handleDragOver(e, stage) : undefined}
                onDragLeave={!isRestrictedStage ? handleDragLeave : undefined}
                onDrop={!isRestrictedStage ? (e) => handleDrop(e, stage) : undefined}
              >
                <div className="p-4 border-b border-border bg-muted/30 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-card-foreground truncate">{stage}</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleStageSort(stage)
                          }}
                          title={stageSortOrder[stage] === 'desc' ? 'Sortare descrescătoare (cel mai nou prim)' : 'Sortare crescătoare (cel mai vechi prim)'}
                        >
                          {stageSortOrder[stage] === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Inbox className="h-3.5 w-3.5" />
                          {stageLeadCount} {stageLeadCount === 1 ? "lead" : "leads"}
                        </span>
                      </div>
                    </div>

                    {(() => {
                      const isVanzariPipeline = currentPipelineName?.toLowerCase().includes('vanzari') || false
                      const isReceptiePipeline = currentPipelineName?.toLowerCase().includes('receptie') || false
                      const stageLower = stage.toLowerCase()
                      const excludedReceptieStages = ['messages', 'de confirmat'].map(s => s.toLowerCase())
                      const isExcludedStage = isReceptiePipeline && excludedReceptieStages.includes(stageLower)
                      const isNoTotalReceptieStage = isReceptiePipeline && (
                        (stageLower.includes('colet') && stageLower.includes('neridicat')) ||
                        (stageLower.includes('curier') && stageLower.includes('trimis')) ||
                        (stageLower.includes('office') && stageLower.includes('direct')) ||
                        stageLower.includes('arhivat')
                      )
                      if (isVanzariPipeline || isExcludedStage || isNoTotalReceptieStage || stageLower === 'messages') {
                        return null
                      }
                      return (
                        <div className="text-right flex-shrink-0">
                          {isLoading ? (
                            <div className="space-y-1">
                              <Skeleton className="h-4 w-16" />
                              <Skeleton className="h-3 w-12" />
                            </div>
                          ) : (
                            <div className="flex flex-col items-end">
                              <div className="flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-500">
                                <TrendingUp className="h-3.5 w-3.5" />
                                {total.toFixed(2)} RON
                              </div>
                              {total > 0 && (
                                <span className="text-[10px] text-muted-foreground">Total</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => { setTargetStage(stage); setConfirmOpen(true) }}
                        aria-label={`Delete stage ${stage}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0 p-4 space-y-3 overflow-y-auto overflow-x-hidden scroll-smooth">
                  {/* Stage special: Messages - afișează mesajele de la tehnicieni */}
                  {stage.toLowerCase() === 'messages' ? (
                    messagesLoading ? (
                      <div className="flex items-center justify-center h-full min-h-[300px]">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : technicianMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
                        <div className="rounded-lg bg-muted p-4 mb-3">
                          <MessageSquare className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium text-foreground mb-1">Nu există mesaje</p>
                        <p className="text-xs text-muted-foreground">
                          Mesajele de la tehnicieni vor apărea aici în timp real
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {technicianMessages.map((message, index) => (
                          <div
                            key={message.id}
                            className={cn(
                              "animate-in fade-in slide-in-from-top-2",
                              `duration-300`
                            )}
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            <MessageCard
                              message={message}
                              onMessageClick={(messageId) => {
                                if (message.service_file_id) {
                                  onMessageClick?.(message.service_file_id, message.conversation_id)
                                }
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )
                  ) : stageLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
                      <div className="rounded-lg bg-muted p-4 mb-3">
                        <Inbox className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground mb-1">Nu există lead-uri</p>
                      <p className="text-xs text-muted-foreground">
                        Trage un lead aici pentru a-l muta în acest stage
                      </p>
                      {isDragOver && (
                        <div className="mt-4 px-3 py-2 rounded bg-primary/10 text-primary text-xs font-medium animate-in fade-in">
                          Eliberează pentru a muta
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {groupStageLeads(stageLeads, stage).map((entry, gi) => {
                        if (entry.type === 'partner-group') {
                          const groupKey = `${stage}::${entry.tag}`
                          const isExpanded = expandedPartnerGroups.has(groupKey)
                          return (
                            <div key={`pg-${entry.tag}`} className="rounded-lg border border-border overflow-hidden">
                              <button
                                type="button"
                                onClick={() => togglePartnerGroup(groupKey)}
                                className="w-full flex items-center gap-2 px-3 py-2 bg-muted/60 hover:bg-muted transition-colors text-left"
                              >
                                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                <Layers className="h-4 w-4 shrink-0 text-emerald-600" />
                                <span className="font-semibold text-sm">{entry.tag}</span>
                                <span className="text-xs text-muted-foreground">({entry.leads.length} {entry.leads.length === 1 ? 'card' : 'carduri'})</span>
                                <span className="ml-auto text-xs font-medium text-emerald-600">{entry.total.toFixed(2)} RON</span>
                              </button>
                              {isExpanded && (
                                <div className="p-2 space-y-2 bg-muted/20">
                                  {entry.leads.map((lead) => (
                                    <LazyLeadCard
                                      key={lead.id}
                                      lead={lead}
                                      onMove={onLeadMove}
                                      onClick={(e) => onLeadClick(lead, e)}
                                      onDragStart={() => handleDragStart(lead.id)}
                                      onDragEnd={handleDragEnd}
                                      isDragging={draggedLead === lead.id}
                                      stages={stages}
                                      onPinToggle={onPinToggle}
                                      isSelected={selectedLeads.has(lead.id)}
                                      onSelectChange={(selected) => handleLeadSelect(lead.id, selected)}
                                      leadTotal={leadTotals[lead.id] ?? (lead as any).total ?? 0}
                                      pipelineName={currentPipelineName}
                                      onRefresh={onRefresh}
                                      onClaimChange={onClaimChange}
                                      onTagsChange={onTagsChange}
                                      onDeliveryClear={onDeliveryClear}
                                      onNuRaspundeClearedForReceptie={onNuRaspundeClearedForReceptie}
                                      showArchiveButton={showArchiveForStage?.(stage)}
                                      onArchive={onArchiveCard ? () => onArchiveCard(lead.id) : undefined}
                                      onSunaTagAdded={onSunaTagAdded}
                                      onSunaTagRemoved={onSunaTagRemoved}
                                    />
                                  ))}
                                </div>
                              )}
                              {!isExpanded && entry.leads.length > 1 && (
                                <div className="relative h-2 bg-muted/30">
                                  <div className="absolute inset-x-2 top-0 h-1 rounded-b bg-border/40" />
                                  <div className="absolute inset-x-4 top-0.5 h-1 rounded-b bg-border/20" />
                                </div>
                              )}
                            </div>
                          )
                        }
                        const lead = entry.lead
                        return (
                          <div
                            key={lead.id}
                            className={cn(
                              "animate-in fade-in slide-in-from-bottom-2",
                              `duration-300 delay-[${gi * 50}ms]`
                            )}
                            style={{ animationDelay: `${gi * 50}ms` }}
                          >
                            <LazyLeadCard
                              lead={lead}
                              onMove={onLeadMove}
                              onClick={(e) => onLeadClick(lead, e)}
                              onDragStart={() => handleDragStart(lead.id)}
                              onDragEnd={handleDragEnd}
                              isDragging={draggedLead === lead.id}
                              stages={stages}
                              onPinToggle={onPinToggle}
                              isSelected={selectedLeads.has(lead.id)}
                              onSelectChange={(selected) => handleLeadSelect(lead.id, selected)}
                              leadTotal={leadTotals[lead.id] ?? (lead as any).total ?? 0}
                              pipelineName={currentPipelineName}
                              onRefresh={onRefresh}
                              onClaimChange={onClaimChange}
                              onTagsChange={onTagsChange}
                              onDeliveryClear={onDeliveryClear}
                              onNuRaspundeClearedForReceptie={onNuRaspundeClearedForReceptie}
                              showArchiveButton={showArchiveForStage?.(stage)}
                              onArchive={onArchiveCard ? () => onArchiveCard(lead.id) : undefined}
                              onSunaTagAdded={onSunaTagAdded}
                              onSunaTagRemoved={onSunaTagRemoved}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to delete “{targetStage}” and all its leads?
            </AlertDialogTitle>
          </AlertDialogHeader>

          {deleteErr && (
            <p className="text-sm text-red-500">{deleteErr}</p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog pentru mutarea in batch */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mută {selectedLeads.size} lead{selectedLeads.size === 1 ? '' : '-uri'} {moveType === 'stage' ? 'în Stage' : 'în Pipeline'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {moveType === 'stage' && (
              <div className="space-y-2">
                <Label>Selectează Stage</Label>
                <Select value={selectedTargetStage} onValueChange={setSelectedTargetStage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alege un stage" />
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
            )}
            
            {moveType === 'pipeline' && canShowMoveToPipeline && (
              <div className="space-y-2">
                <Label>Selectează Pipeline</Label>
                <Select value={selectedTargetPipeline} onValueChange={setSelectedTargetPipeline}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alege un pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((pipeline) => (
                      <SelectItem key={pipeline} value={pipeline}>
                        {pipeline}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMoveDialogOpen(false)}
              disabled={isMoving}
            >
              Anulează
            </Button>
            <Button
              onClick={handleBulkMove}
              disabled={isMoving || (moveType === 'stage' && !selectedTargetStage) || (moveType === 'pipeline' && (!selectedTargetPipeline || !canShowMoveToPipeline))}
            >
              {isMoving ? 'Mutare...' : 'Mută'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Call Back: același dialog, aplicat la toate lead-urile selectate */}
      {isVanzariPipeline && selectedLeadIds.length > 0 && (
        <CallbackDialog
          open={bulkCallbackDialogOpen}
          onOpenChange={setBulkCallbackDialogOpen}
          onConfirm={async (date: Date) => {
            const callBackStage = stages.find((s) => /call\s*back|callback/i.test(s)) ?? 'Call Back'
            setBulkActionSaving(true)
            try {
              for (const leadId of selectedLeadIds) {
                const { error } = await updateLeadWithHistory(leadId, { callback_date: date.toISOString() })
                if (error) {
                  toast.error('Eroare la programarea callback-ului.')
                  break
                }
                onLeadMove(leadId, callBackStage)
              }
              setBulkCallbackDialogOpen(false)
              setSelectedLeads(new Set())
              onRefresh?.()
              toast.success(`${selectedLeadIds.length} lead-uri mutate în ${callBackStage}.`)
            } catch (e: any) {
              toast.error(e?.message ?? 'Eroare la Call Back.')
            } finally {
              setBulkActionSaving(false)
            }
          }}
          leadName={selectedLeadIds.length === 1 ? (leads.find((l) => l.id === selectedLeadIds[0]) as any)?.name : undefined}
        />
      )}

      {/* Bulk Nu răspunde: același dialog, aplicat la toate lead-urile selectate */}
      {isVanzariPipeline && selectedLeadIds.length > 0 && (
        <NuRaspundeDialog
          open={bulkNuRaspundeDialogOpen}
          onOpenChange={setBulkNuRaspundeDialogOpen}
          onConfirm={async (timeStr: string) => {
            const base = new Date()
            const [y, m, d] = [base.getFullYear(), base.getMonth(), base.getDate()]
            const [hh, mm] = [parseInt(timeStr.slice(0, 2), 10), parseInt(timeStr.slice(3, 5), 10)]
            let target = new Date(y, m, d, hh, mm, 0, 0)
            if (target.getTime() <= base.getTime()) target = new Date(target.getTime() + 24 * 60 * 60 * 1000)
            const nuRaspundeStage = stages.find((s) => /nu\s*raspunde|nuraspunde/i.test(s)) ?? 'Nu răspunde'
            setBulkActionSaving(true)
            try {
              for (const leadId of selectedLeadIds) {
                const { error } = await updateLead(leadId, { nu_raspunde_callback_at: target.toISOString() })
                if (error) {
                  toast.error('Eroare la programarea Nu răspunde.')
                  break
                }
                onLeadMove(leadId, nuRaspundeStage)
              }
              setBulkNuRaspundeDialogOpen(false)
              setSelectedLeads(new Set())
              onRefresh?.()
              toast.success(`${selectedLeadIds.length} lead-uri mutate în ${nuRaspundeStage}. Reapel: ${format(target, 'dd MMM yyyy, HH:mm', { locale: ro })}`)
            } catch (e: any) {
              toast.error(e?.message ?? 'Eroare la Nu răspunde.')
            } finally {
              setBulkActionSaving(false)
            }
          }}
          leadName={selectedLeadIds.length === 1 ? (leads.find((l) => l.id === selectedLeadIds[0]) as any)?.name : undefined}
        />
      )}
    </div>
  )
}
