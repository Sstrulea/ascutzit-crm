"use client"

import type React from "react"

import { useState, useEffect, useMemo, useRef } from "react"
import { MoreHorizontal, Mail, Calendar, Clock, User, Phone, Pin, Trash2, CheckCircle2, Circle, Building2, Sparkles, Scissors, Wrench, Building, PhoneOff, PhoneCall, PhoneMissed, XCircle, Info, Package, Pencil, Tag, MessageCircle, UserPlus, UserCheck, UserX, Users, Archive, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { formatTraySizeDisplay } from "@/lib/utils/trayDisplay"
import type { Lead } from "@/app/(crm)/dashboard/page"
import type { TagColor } from "@/lib/supabase/tagOperations"
import { getOrCreatePinnedTag, getOrCreateNuRaspundeTag, getOrCreateSunaTag, getOrCreateCurierTrimisTag, getOrCreateOfficeDirectTag, getOrCreateReturTag, getOrCreateUrgentTag, getOrCreateNuAVenitTag, toggleLeadTag, addLeadTagIfNotPresent, listTags } from "@/lib/supabase/tagOperations"
import { isTagHiddenFromUI } from "@/hooks/leadDetails/useLeadDetailsTags"
import { deleteLead, updateLead, logLeadEvent, logButtonEvent, claimLead } from "@/lib/supabase/leadOperations"
import { setLeadNoDeal, setLeadCurierTrimis, setLeadOfficeDirect } from "@/lib/vanzari/leadOperations"
import { recordVanzariApelForDeliveryByStageName } from "@/lib/supabase/vanzariApeluri"
import { deleteServiceFile, deleteTray, updateServiceFileWithHistory } from "@/lib/supabase/serviceFileOperations"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"
import { CallbackDialog } from "@/components/leads/vanzari/CallbackDialog"
import { NuRaspundeDialog } from "@/components/leads/vanzari/NuRaspundeDialog"
import { useRole, useAuth } from "@/lib/contexts/AuthContext"
import { useTechnicians } from "@/hooks/queries/use-technicians"
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns"
import { ro } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"
import { formatExactDuration } from "@/lib/utils/service-time"

/** Render details text: Instrument/Problemă în bold roșu; Număr De Telefon în albastru marin bold. */
function renderDetailsWithRedHighlight(text: string): React.ReactNode {
  if (!text || !text.trim()) return null
  const lines = text.split(/\r?\n/)
  const isRedLine = (l: string) =>
    /Instrument:?\s/i.test(l) ||
    /Instrumentele\s+Tale/i.test(l) ||
    /Problemă:?\s/i.test(l)
  const isPhoneLine = (l: string) => /Număr\s*De\s*Telefon:?/i.test(l.trim())
  const isLabelOnly = (l: string) => isRedLine(l) && /:\s*$/.test(l.trim())
  const nodes: React.ReactNode[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isRedLine(line)) {
      nodes.push(
        <span key={`r-${i}`} className="font-bold text-red-600 dark:text-red-400">
          {line}
        </span>
      )
      if (isLabelOnly(line) && i + 1 < lines.length && lines[i + 1].trim()) {
        nodes.push('\n')
        nodes.push(
          <span key={`rv-${i}`} className="font-bold text-red-600 dark:text-red-400">
            {lines[i + 1]}
          </span>
        )
        i += 1
      }
      nodes.push(i < lines.length - 1 ? '\n' : '')
    } else if (isPhoneLine(line)) {
      nodes.push(
        <span key={`ph-${i}`} className="font-bold text-[#001f3f] dark:text-blue-300">
          {line}
        </span>
      )
      if (i < lines.length - 1) nodes.push('\n')
    } else {
      nodes.push(line)
      if (i < lines.length - 1) nodes.push('\n')
    }
  }
  return <>{nodes}</>
}

interface LeadCardProps {
  lead: Lead
  onMove: (leadId: string, newStage: string) => void
  onClick: (event?: React.MouseEvent) => void
  onDragStart: () => void
  onDragEnd: () => void
  isDragging: boolean
  stages: string[]
  onPinToggle?: (leadId: string, isPinned: boolean) => void
  isSelected?: boolean
  onSelectChange?: (isSelected: boolean) => void
  leadTotal?: number
  pipelineName?: string
  /** După ștergere reîmprospătează board-ul (fără reload pagină) */
  onRefresh?: () => void
  /** Actualizare optimistă pentru Preia/Eliberează – fără refresh */
  onClaimChange?: (leadId: string, claimedBy: string | null, claimedByName?: string | null) => void
  /** Actualizare în timp real a tag-urilor pe board (ex. Nu răspunde, Urgent) */
  onTagsChange?: (leadId: string, tags: { id: string; name: string }[]) => void
  /** Actualizare live la eliminare Curier Trimis / Office Direct (fără refresh) */
  onDeliveryClear?: (leadId: string) => void
  /** Receptie: afișează buton Arhivare pe card (stage-uri De trimis / Ridic PE...) */
  showArchiveButton?: boolean
  /** Callback la click pe Arhivare – mută cardul în stage Arhivat */
  onArchive?: () => Promise<void>
  /** Receptie: la scoaterea tag-ului Nu răspunde de pe fișă – mută fișa în De facturat și refresh */
  onNuRaspundeClearedForReceptie?: (serviceFileId: string) => void | Promise<void>
}

/** Taguri care nu apar în popup-ul „Taguri” de pe card (nu pot fi alocate de aici). */
const TAGURI_ASCUNSE_DIN_POPUP = ['Follow Up', 'Frizerii', 'Horeca', 'Nevalidata', 'PINNED', 'Reparatii', 'Retur', 'RETUR', 'Saloane']

export function LeadCard({ lead, onMove, onClick, onDragStart, onDragEnd, isDragging, stages, onPinToggle, isSelected = false, onSelectChange, leadTotal = 0, pipelineName, onRefresh, onClaimChange, onTagsChange, onDeliveryClear, showArchiveButton, onArchive, onNuRaspundeClearedForReceptie }: LeadCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isPinning, setIsPinning] = useState(false)
  const [isTogglingNuRaspunde, setIsTogglingNuRaspunde] = useState(false)
  const [isTogglingNuAVenit, setIsTogglingNuAVenit] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showCallbackDialog, setShowCallbackDialog] = useState(false)
  const [showNuRaspundeDialog, setShowNuRaspundeDialog] = useState(false)
  const [isSavingCallback, setIsSavingCallback] = useState(false)
  const [isSavingNuRaspunde, setIsSavingNuRaspunde] = useState(false)
  const [isSavingNoDeal, setIsSavingNoDeal] = useState(false)
  const [isSavingDelivery, setIsSavingDelivery] = useState(false)
  const [showDeliveryOverlay, setShowDeliveryOverlay] = useState(false)
  const [deliveryRetur, setDeliveryRetur] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [deliveryTime, setDeliveryTime] = useState("10:00")
  const [deliveryType, setDeliveryType] = useState<'curier_trimis' | 'office_direct'>('curier_trimis')
  const [deliveryUrgent, setDeliveryUrgent] = useState(false)
  const [showDetailsEditDialog, setShowDetailsEditDialog] = useState(false)
  const [detailsEditValue, setDetailsEditValue] = useState("")
  const [isSavingDetails, setIsSavingDetails] = useState(false)
  const [sunaDismissed, setSunaDismissed] = useState(false)
  const [isSavingSunaDismiss, setIsSavingSunaDismiss] = useState(false)
  const [isSavingCurierDismiss, setIsSavingCurierDismiss] = useState(false)
  const [isSavingOfficeDismiss, setIsSavingOfficeDismiss] = useState(false)
  const [localDetailsOverride, setLocalDetailsOverride] = useState<string | null>(null)
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const [assignableTagsList, setAssignableTagsList] = useState<{ id: string; name: string; color: TagColor }[]>([])
  const [loadingTags, setLoadingTags] = useState(false)
  const [togglingTagId, setTogglingTagId] = useState<string | null>(null)
  const ignoreNextCardClickRef = useRef<boolean>(false)
  
  // Tipul de item (lead/service_file/tray) - definit aici pentru a fi disponibil în useEffect
  const itemType: 'lead' | 'service_file' | 'tray' = (lead as any)?.type === 'tray' ? 'tray' : (lead as any)?.type === 'service_file' ? 'service_file' : 'lead'
  
  // Indicator vizual pentru "Colet ajuns" - starea tăvițelor în departamente
  const [trayStatus, setTrayStatus] = useState<'red' | 'yellow' | 'green' | 'purple' | 'loading' | null>(null)
  const [trayDetails, setTrayDetails] = useState<any[]>([])  // Detaliile tăvițelor pentru a afișa pipeline-ul
  const isInColetAjunsStage = (lead.stage || '').toLowerCase() === 'colet ajuns'
  
  // Încarcă status-ul tăvițelor dacă este în stage-ul "Colet ajuns"
  useEffect(() => {
    if (!isInColetAjunsStage || itemType !== 'service_file') {
      setTrayStatus(null)
      setTrayDetails([])
      return
    }
    
    const loadTrayStatus = async () => {
      setTrayStatus('loading')
      setTrayDetails([])
      try {
        const res = await fetch(`/api/trays/check-department-status?serviceFileId=${lead.id}`)
        const data = await res.json()
        if (data?.status) {
          setTrayStatus(data.status)
          setTrayDetails(data.trays || [])
        } else {
          setTrayStatus(null)
          setTrayDetails([])
        }
      } catch (error) {
        console.error('Eroare la încărcarea status-ului tăvițelor:', error)
        setTrayStatus(null)
        setTrayDetails([])
      }
    }
    
    loadTrayStatus()
  }, [isInColetAjunsStage, itemType, lead.id])
  const { toast } = useToast()
  const leadDetailsDisplay: string | null | undefined = localDetailsOverride !== null ? localDetailsOverride : (lead as any).details
  const leadAny = lead as any
  const leadIdForTags =
    itemType === 'lead'
      ? lead.id
      : (leadAny?.leadId as string | undefined) || (leadAny?.lead_id as string | undefined) || undefined
  useEffect(() => {
    setLocalDetailsOverride(null)
  }, [(lead as any).details])
  useEffect(() => {
    if (tagPopoverOpen && leadIdForTags) {
      setLoadingTags(true)
      const hiddenSet = new Set(TAGURI_ASCUNSE_DIN_POPUP.map((n) => n.toLowerCase().trim()))
      listTags()
        .then((tags) => {
          const filtered = tags.filter((t) => !hiddenSet.has((t.name || '').toLowerCase().trim()))
          setAssignableTagsList(filtered)
        })
        .catch(() => toast({ variant: "destructive", title: "Eroare", description: "Nu s-au putut încărca tag-urile." }))
        .finally(() => setLoadingTags(false))
    }
  }, [tagPopoverOpen, leadIdForTags, toast])
  const handleToggleAssignTag = async (tagId: string) => {
    if (!leadIdForTags || togglingTagId) return
    setTogglingTagId(tagId)
    try {
      await toggleLeadTag(leadIdForTags, tagId)
      const currentTags = Array.isArray(lead?.tags) ? (lead.tags as { id: string; name: string }[]) : []
      const hadTag = currentTags.some((t) => t.id === tagId)
      const addedTag = assignableTagsList.find((t) => t.id === tagId)
      const newTags = hadTag
        ? currentTags.filter((t) => t.id !== tagId)
        : [...currentTags, { id: tagId, name: addedTag?.name ?? "" }]
      onTagsChange?.(lead.id, newTags)
      // Când se atribuie tag-ul Curier Trimis sau Office direct în Vânzări, mută cardul în stage-ul respectiv
      if (!hadTag && addedTag?.name && pipelineName?.toLowerCase().includes('vanzari') && itemType === 'lead' && stages?.length) {
        const tagName = (addedTag.name || '').trim()
        if (tagName === 'Curier Trimis') {
          const stage = stages.find((s) => /curier\s*trimis/i.test(s))
          if (stage) onMove(lead.id, stage)
        } else if (tagName === 'Office direct') {
          const stage = stages.find((s) => /office\s*direct/i.test(s))
          if (stage) onMove(lead.id, stage)
        }
      }
      // Actualizare live – fără refresh
    } catch (err: any) {
      toast({ variant: "destructive", title: "Eroare", description: err?.message ?? "Nu s-a putut actualiza tag-ul." })
    } finally {
      setTogglingTagId(null)
    }
  }
  const { role } = useRole()
  const { user: currentUser } = useAuth()
  const isOwner = role === 'owner'
  const isAdmin = role === 'admin'
  const canDelete = isOwner || isAdmin
  const deleteLabel = itemType === 'tray' ? 'Șterge tăvița' : itemType === 'service_file' ? 'Șterge fișa' : 'Șterge lead'

  const canonicalTag = (name: string) =>
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')

  // Lista de alegeri Move (Vânzări): doar Leaduri, Leaduri Straine, Avem Comanda, Arhivat, Scheduled Call
  const VANZARI_MOVE_STAGES = ['leaduri straine', 'avem comanda', 'arhivat', 'scheduled call']
  const normalizeStageForMove = (s: string) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  const isVanzariPipeline = pipelineName?.toLowerCase().includes('vanzari') ?? false
  const moveStages =
    isVanzariPipeline && stages?.length
      ? stages.filter((stage) => {
          const n = normalizeStageForMove(stage)
          if (n === 'leaduri' || n === 'leads') return true
          return VANZARI_MOVE_STAGES.some((allowed) => n.includes(allowed) || n.replace(/\s/g, '') === allowed.replace(/\s/g, ''))
        })
      : stages ?? []
  // Când timpul de Call Back sau Nu răspunde a expirat, cardul e liber să fie mutat în orice stage (lista completă)
  // Liber spre mutare = nici Call Back nici Nu răspunde nu mai forțează stage-ul (termenele au expirat sau lipsesc)
  const wouldForceCallBack = (lead as any).callback_date && new Date((lead as any).callback_date).getTime() > currentTime.getTime()
  const wouldForceNuRaspunde = (lead as any).nu_raspunde_callback_at && new Date((lead as any).nu_raspunde_callback_at).getTime() > currentTime.getTime()
  const isFreeToMoveAnyStage = isVanzariPipeline && !wouldForceCallBack && !wouldForceNuRaspunde
  const stagesForMoveMenu =
    isFreeToMoveAnyStage && stages?.length
      ? (stages ?? [])
      : (moveStages.length > 0 ? moveStages : stages) ?? []

  const leadIdForDb = (lead as any).leadId || lead.id

  // Preluare lead – doar în stage-urile: Leaduri, Leaduri straine, Nu raspunde, Call Back
  const CLAIM_ALLOWED_STAGES = ['leaduri', 'leaduri straine', 'nu raspunde', 'call back', 'curier ajuns azi']
  const stageNorm = (s: string) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
  const isStageAllowedForClaim = CLAIM_ALLOWED_STAGES.some(
    (allowed) => stageNorm(lead.stage || '').includes(allowed) || stageNorm(lead.stage || '').replace(/\s/g, '') === allowed.replace(/\s/g, '')
  )
  const [isClaiming, setIsClaiming] = useState(false)
  const [assignPopoverOpen, setAssignPopoverOpen] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)
  const { data: membersList } = useTechnicians()
  const isClaimedByMe = !!(currentUser?.id && (lead as any).claimed_by === currentUser.id)
  const isClaimedByOther = !!((lead as any).claimed_by && (lead as any).claimed_by !== currentUser?.id)
  const isParteneriPipeline = pipelineName?.toLowerCase().includes('parteneri') ?? false
  const showClaimButton =
    (isVanzariPipeline || isParteneriPipeline) &&
    (itemType === 'lead' || itemType === 'service_file') &&
    (isStageAllowedForClaim || isParteneriPipeline)

  const actorOption = useMemo(() => ({
    currentUserId: currentUser?.id ?? undefined,
    currentUserName: currentUser?.email?.split('@')[0] ?? null,
    currentUserEmail: currentUser?.email ?? null,
  }), [currentUser?.id, currentUser?.email])

  const handleClaimLead = async () => {
    if (!currentUser?.id || isClaiming) return
    if (isClaimedByOther) return
    setIsClaiming(true)
    try {
      if (isClaimedByMe) {
        const { unclaimLead } = await import('@/lib/supabase/leadOperations')
        await unclaimLead(lead.leadId || lead.id)
      } else {
        const { error } = await claimLead(lead.leadId || lead.id, currentUser.id)
        if (error) {
          const { toast } = await import('sonner')
          toast.error(error.message || 'Nu s-a putut prelua lead-ul')
          return
        }
      }
      logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardClaimButton', buttonLabel: isClaimedByMe ? 'Eliberează' : 'Preia', actorOption }).catch(() => {})
      // Actualizare optimistă – fără refresh complet
      const claimedByName = (currentUser as any)?.user_metadata?.full_name ?? currentUser?.email?.split('@')[0] ?? 'Eu'
      onClaimChange?.(lead.id, isClaimedByMe ? null : currentUser.id, isClaimedByMe ? null : claimedByName)
    } catch (e: any) {
      console.error('Claim lead error:', e)
    } finally {
      setIsClaiming(false)
    }
  }

  const handleAssignTo = async (userId: string, userName: string) => {
    if (!leadIdForDb || isAssigning) return
    setIsAssigning(true)
    try {
      const { error } = await claimLead(leadIdForDb, userId, true)
      if (error) {
        toast({ variant: 'destructive', title: 'Eroare', description: (error as Error)?.message ?? 'Nu s-a putut atribui lead-ul.' })
        return
      }
      logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardAssignButton', buttonLabel: 'Atribuie', actorOption }).catch(() => {})
      onClaimChange?.(lead.id, userId, userName)
      setAssignPopoverOpen(false)
      toast({ title: 'Lead atribuit', description: `Atribuit lui ${userName || 'membru'}.` })
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Eroare', description: e?.message ?? 'Nu s-a putut atribui.' })
    } finally {
      setIsAssigning(false)
    }
  }

  const handleNoDeal = async () => {
    if ((lead as any).type === 'tray' || (lead as any).type === 'service_file') return
    setIsSavingNoDeal(true)
    try {
      const isVanzari = pipelineName && /vanzari|vânzări/i.test(String(pipelineName))
        if (isVanzari) {
        const { error } = await setLeadNoDeal(leadIdForDb)
        if (error) {
          toast({ variant: "destructive", title: "Eroare", description: "Nu s-a putut marca No deal." })
          return
        }
        const noDealStage = stages?.find(s => /no\s*deal|nodeal/i.test(s)) ?? "No deal"
        onMove(lead.id, noDealStage)
        logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardNoDealButton', buttonLabel: 'No Deal', actorOption }).catch(() => {})
        toast({ title: "No deal", description: "Lead mutat în No Deal (datele de Call Back / Nu Răspunde rămân pentru istoric și alerte)." })
      } else {
        const { error } = await updateLead(leadIdForDb, { no_deal: true })
        if (error) {
          toast({ variant: "destructive", title: "Eroare", description: "Nu s-a putut marca No deal." })
          return
        }
        const noDealStage = stages.find(s => /no\s*deal|nodeal/i.test(s)) ?? "No deal"
        logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardNoDealButton', buttonLabel: 'No Deal', actorOption }).catch(() => {})
        onMove(lead.id, noDealStage)
        toast({ title: "No deal", description: `Lead mutat în ${noDealStage}.` })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Eroare", description: err?.message ?? "Nu s-a putut marca No deal." })
    } finally {
      setIsSavingNoDeal(false)
    }
  }

  const handleDeliveryConfirm = async (asUrgent?: boolean) => {
    if ((lead as any).type === 'tray' || (lead as any).type === 'service_file') return
    const urgent = asUrgent ?? deliveryUrgent
    const [hours, minutes] = deliveryTime.split(':').map(Number)
    const dateTime = new Date(deliveryDate)
    dateTime.setHours(hours, minutes, 0, 0)
    const dateTimeIso = dateTime.toISOString()
    setIsSavingDelivery(true)
    try {
      const supabase = supabaseBrowser()
      const isServiceFileCard = itemType === 'service_file'
      const { data: rows, error: fetchErr } = await supabase
        .from('service_files')
        .select('id')
        .eq('lead_id', leadIdForDb)
        .limit(1)
      if (fetchErr || (!isServiceFileCard && !rows?.length)) {
        const result = deliveryType === 'office_direct'
          ? await setLeadOfficeDirect(leadIdForDb, dateTime, { urgent, retur: deliveryRetur })
          : await setLeadCurierTrimis(leadIdForDb, dateTime, { urgent, retur: deliveryRetur })
        if (result.error) {
          toast({ variant: "destructive", title: "Eroare", description: (result.error as Error)?.message ?? "Nu s-a putut crea fișa." })
          return
        }
        try {
          if (urgent) {
            const urgentTag = await getOrCreateUrgentTag()
            await addLeadTagIfNotPresent(leadIdForDb, urgentTag.id)
          }
          if (deliveryRetur) {
            const returTag = await getOrCreateReturTag()
            await addLeadTagIfNotPresent(leadIdForDb, returTag.id)
          }
        } catch (_) { /* tag optional */ }
        logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardConfirmDeliveryButton', buttonLabel: 'Livrare (fișă nouă)', actorOption }).catch(() => {})
        if (currentUser?.id) {
          const claimedByName = (currentUser as any)?.user_metadata?.full_name ?? currentUser?.email?.split('@')[0] ?? 'Eu'
          onClaimChange?.(lead.id, currentUser.id, claimedByName)
        }
        const stageName = deliveryType === 'office_direct' ? stages?.find(s => /office\s*direct/i.test(s)) : stages?.find(s => /curier\s*trimis/i.test(s))
        if (stageName) onMove(lead.id, stageName)
        toast({ title: "Livrare", description: `Fișă creată cu ${deliveryType === 'office_direct' ? 'Office direct' : 'Curier trimis'}${urgent ? ' (urgent)' : ''}${deliveryRetur ? ' (retur)' : ''}. Apare în detalii lead și în Receptie.` })
      } else {
        const serviceFileId = isServiceFileCard ? (lead as any).id : (rows?.[0] as { id: string })?.id
        if (!serviceFileId) {
          toast({ variant: "destructive", title: "Eroare", description: "Fișa de serviciu nu a fost găsită." })
          return
        }
        const updates = deliveryType === 'office_direct'
          ? { office_direct: true, office_direct_at: dateTimeIso, curier_trimis: false, curier_scheduled_at: null, urgent, retur: deliveryRetur }
          : { curier_trimis: true, curier_scheduled_at: dateTimeIso, office_direct: false, office_direct_at: null, urgent, retur: deliveryRetur }
        const { error } = await updateServiceFileWithHistory(serviceFileId, updates)
        if (error) {
          toast({ variant: "destructive", title: "Eroare", description: error?.message ?? "Nu s-a putut seta livrarea." })
          return
        }
        const leadUpdates = deliveryType === 'office_direct'
          ? { office_direct_at: dateTimeIso, office_direct_user_id: currentUser?.id ?? null }
          : { curier_trimis_at: dateTimeIso, curier_trimis_user_id: currentUser?.id ?? null }
        if (currentUser?.id) (leadUpdates as any).claimed_by = currentUser.id
        await updateLead(leadIdForDb, leadUpdates)
        if (currentUser?.id) {
          const claimedByName = (currentUser as any)?.user_metadata?.full_name ?? currentUser?.email?.split('@')[0] ?? 'Eu'
          onClaimChange?.(lead.id, currentUser.id, claimedByName)
        }
        await recordVanzariApelForDeliveryByStageName(
          leadIdForDb,
          deliveryType === 'office_direct' ? 'Office Direct' : 'Curier Trimis',
          currentUser?.id ?? null
        )
        await logLeadEvent(
          leadIdForDb,
          `Livrare setată: ${deliveryType === 'office_direct' ? 'Office direct' : 'Curier trimis'}${urgent ? ' (urgent)' : ''}, data ${dateTimeIso}`,
          deliveryType === 'office_direct' ? 'office_direct_scheduled' : 'curier_trimis_scheduled',
          { scheduled_at: dateTimeIso, type: deliveryType, urgent }
        )
        try {
          if (deliveryType === 'office_direct') {
            const tag = await getOrCreateOfficeDirectTag()
            await addLeadTagIfNotPresent(leadIdForDb, tag.id)
          } else {
            const tag = await getOrCreateCurierTrimisTag()
            await addLeadTagIfNotPresent(leadIdForDb, tag.id)
          }
          if (urgent) {
            const urgentTag = await getOrCreateUrgentTag()
            await addLeadTagIfNotPresent(leadIdForDb, urgentTag.id)
          }
          if (deliveryRetur) {
            const returTag = await getOrCreateReturTag()
            await addLeadTagIfNotPresent(leadIdForDb, returTag.id)
          }
        } catch (_) { /* tag optional */ }
        logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardConfirmDeliveryButton', buttonLabel: 'Livrare (fișă existentă)', actorOption }).catch(() => {})
        const stageName = deliveryType === 'office_direct' ? stages?.find(s => /office\s*direct/i.test(s)) : stages?.find(s => /curier\s*trimis/i.test(s))
        if (stageName) onMove(lead.id, stageName)
        toast({ title: "Livrare", description: (deliveryType === 'office_direct' ? "Office direct" : "Curier trimis") + (urgent ? " (urgent)" : "") + (deliveryRetur ? " (retur)" : "") + " setat. Data salvată în DB și în istoric." })
      }
      setShowDeliveryOverlay(false)
      setDeliveryUrgent(false)
      setDeliveryRetur(false)
    } catch (err: any) {
      toast({ variant: "destructive", title: "Eroare", description: err?.message ?? "Nu s-a putut seta livrarea." })
    } finally {
      setIsSavingDelivery(false)
    }
  }

  const hasCurierTrimis = !!(lead as any).curier_trimis_at
  const hasOfficeDirect = !!(lead as any).office_direct_at
  const isNoDeal = !!(lead as any).no_deal // Ascunde tag-uri și triggere dacă e NO DEAL
  const isNoDealStage = (lead.stage || '').toLowerCase().includes('no deal') // Verifică și după numele stage-ului
  const inNoDeal = isNoDeal || isNoDealStage // Card în No deal → elimină Call back, Nu raspunde, Curier Trimis, Office direct
  const isCurierAjunsAziStage = (lead.stage || '').toLowerCase().includes('curier') && (lead.stage || '').toLowerCase().includes('ajuns') && (lead.stage || '').toLowerCase().includes('azi') // Stage "Curier Ajuns Azi"
  const shouldHideTriggersAndTags = isNoDeal || isNoDealStage || isCurierAjunsAziStage // Combinație: ascunde dacă flag-ul e true SAU stage-ul e No Deal SAU stage-ul e Curier Ajuns Azi

  const handleRemoveCurierTrimis = async () => {
    if ((lead as any).type === 'tray') return
    setIsSavingCurierDismiss(true)
    try {
      const { error: leadErr } = await updateLead(leadIdForDb, { curier_trimis_at: null, curier_trimis_user_id: null })
      if (leadErr) throw leadErr
      try {
        const tag = await getOrCreateCurierTrimisTag()
        await toggleLeadTag(leadIdForDb, tag.id)
        const currentTags = Array.isArray(lead?.tags) ? (lead.tags as { id: string; name: string }[]) : []
        const newTags = currentTags.filter((t) => t.id !== tag.id)
        onTagsChange?.(lead.id, newTags)
      } catch (_) { /* tag optional */ }
      const supabase = supabaseBrowser()
      await (supabase as any).from('service_files').update({ curier_trimis: false, curier_scheduled_at: null, updated_at: new Date().toISOString() }).eq('lead_id', leadIdForDb)
      logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardRemoveCurierButton', buttonLabel: 'Elimină Curier Trimis', actorOption }).catch(() => {})
      onDeliveryClear?.(lead.id)
      toast({ title: "Curier Trimis eliminat", description: "Tag-ul a fost scos de pe lead și fișe." })
    } catch (err: any) {
      toast({ variant: "destructive", title: "Eroare", description: err?.message ?? "Nu s-a putut elimina Curier Trimis." })
    } finally {
      setIsSavingCurierDismiss(false)
    }
  }

  const handleRemoveOfficeDirect = async () => {
    if ((lead as any).type === 'tray') return
    setIsSavingOfficeDismiss(true)
    try {
      const { error: leadErr } = await updateLead(leadIdForDb, { office_direct_at: null, office_direct_user_id: null })
      if (leadErr) throw leadErr
      try {
        const tag = await getOrCreateOfficeDirectTag()
        await toggleLeadTag(leadIdForDb, tag.id)
        const currentTags = Array.isArray(lead?.tags) ? (lead.tags as { id: string; name: string }[]) : []
        const newTags = currentTags.filter((t) => t.id !== tag.id)
        onTagsChange?.(lead.id, newTags)
      } catch (_) { /* tag optional */ }
      const supabase = supabaseBrowser()
      await (supabase as any).from('service_files').update({ office_direct: false, office_direct_at: null, updated_at: new Date().toISOString() }).eq('lead_id', leadIdForDb)
      logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardRemoveOfficeButton', buttonLabel: 'Elimină Office Direct', actorOption }).catch(() => {})
      onDeliveryClear?.(lead.id)
      toast({ title: "Office Direct eliminat", description: "Tag-ul a fost scos de pe lead și fișe." })
    } catch (err: any) {
      toast({ variant: "destructive", title: "Eroare", description: err?.message ?? "Nu s-a putut elimina Office Direct." })
    } finally {
      setIsSavingOfficeDismiss(false)
    }
  }

  const hasNuRaspundeTag = useMemo(() => {
    const tags = Array.isArray(lead?.tags) ? lead.tags : []
    for (const t of tags as any[]) {
      if (t?.name && canonicalTag(String(t.name)) === 'nuraspunde') return true
    }
    return false
  }, [lead?.tags])

  const hasNuAVenitTag = useMemo(() => {
    const tags = Array.isArray(lead?.tags) ? lead.tags : []
    for (const t of tags as any[]) {
      if (t?.name && canonicalTag(String(t.name)) === 'nuavenit') return true
    }
    return false
  }, [lead?.tags])

  const [nuRaspundeActive, setNuRaspundeActive] = useState<boolean>(hasNuRaspundeTag)
  const [nuAVenitActive, setNuAVenitActive] = useState<boolean>(hasNuAVenitTag)
  useEffect(() => {
    setNuRaspundeActive(hasNuRaspundeTag)
  }, [hasNuRaspundeTag])
  useEffect(() => {
    setNuAVenitActive(hasNuAVenitTag)
  }, [hasNuAVenitTag])

  // verifica daca lead-ul este pinned
  const isPinned = useMemo(() => {
    const tags = Array.isArray(lead?.tags) ? lead.tags : []
    // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
    if (Array.isArray(tags)) {
      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i]
        if (tag && tag.name === 'PINNED') {
          return true
        }
      }
    }
    return false
  }, [lead?.tags])

  // functie pentru formatarea inteligenta a datei
  const formatSmartDate = (date: Date) => {
    if (isToday(date)) {
      return `Astăzi, ${format(date, "HH:mm", { locale: ro })}`
    } else if (isYesterday(date)) {
      return `Ieri, ${format(date, "HH:mm", { locale: ro })}`
    } else {
      return format(date, "dd MMM yyyy, HH:mm", { locale: ro })
    }
  }

  // pentru tooltip „Lead creat acum X”
  const leadAge = useMemo(() => {
    if (!lead.createdAt) return null
    const createdDate = new Date(lead.createdAt)
    const now = new Date()
    const diffInHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60)
    const diffInMinutes = (now.getTime() - createdDate.getTime()) / (1000 * 60)
    let timeText = ''
    if (diffInMinutes < 60) timeText = `${Math.floor(diffInMinutes)} minute`
    else if (diffInHours < 24) timeText = `${Math.floor(diffInHours)} ore`
    else timeText = `${Math.floor(diffInHours / 24)} zile`
    return { timeText }
  }, [lead.createdAt])

  // eticheta NOU: afișată doar dacă lead-ul a fost creat cu < 4 ore în urmă
  const isNewBadgeVisible = useMemo(() => {
    if (!lead.createdAt || (lead as any).type === 'service_file') return false
    
    const createdDate = new Date(lead.createdAt)
    const now = new Date()
    const diffInHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60)
    
    // Afișează "NOU" doar dacă lead-ul a fost creat în ultimele 4 ore
    return diffInHours < 4
  }, [lead.createdAt, (lead as any).type, currentTime])

  const stageLower = (lead.stage || '').toLowerCase()
  const isInLeaduriStage = stageLower === 'leads' || stageLower === 'leaduri' ||
    (stageLower.includes('lead') && !stageLower.includes('callback') && !stageLower.includes('nou'))
  const hasFollowUp = (lead.tags || []).some((t: { name?: string }) => t?.name === 'Follow Up')
  const followUpSetAt = (lead as any).follow_up_set_at
  const followUpCallbackAt = (lead as any).follow_up_callback_at
  const followUpOra = followUpCallbackAt || followUpSetAt
  const isFollowUpInLeaduri = isInLeaduriStage && !!hasFollowUp
  const isInCurierTrimisStage = (lead.stage || '').toLowerCase().includes('curier')
  const isInOfficeDirectStage = (lead.stage || '').toLowerCase().includes('office') && (lead.stage || '').toLowerCase().includes('direct')
  const hasCurierTrimisTag = (lead.tags || []).some((t: { name?: string }) => (t?.name || '').trim() === 'Curier Trimis')
  const hasOfficeDirectTag = (lead.tags || []).some((t: { name?: string }) => (t?.name || '').trim() === 'Office direct')
  const sfCurierTrimis = itemType === 'service_file' && !!((lead as any).curier_trimis === true || (lead as any).curier_trimis === 'true')
  const sfOfficeDirect = itemType === 'service_file' && !!((lead as any).office_direct === true || (lead as any).office_direct === 'true')
  const showCurierTrimisOnCard = !inNoDeal && (hasCurierTrimisTag || sfCurierTrimis)
  const showOfficeDirectOnCard = !inNoDeal && (hasOfficeDirectTag || sfOfficeDirect)
  const isArchivedStage = (lead.stage || '').toLowerCase().includes('arhivat')
  const deliveryAlreadyActiveNotArchived = !inNoDeal && !isCurierAjunsAziStage && (hasCurierTrimis || hasOfficeDirect || hasCurierTrimisTag || hasOfficeDirectTag) && !isArchivedStage

  // Callback depășit: data/oră programată este în trecut → nu mai afișăm data, afișăm tag Sună!
  const isCallbackOverdue = useMemo(() => {
    const cb = (lead as any).callback_date
    if (!cb) return false
    return new Date(cb).getTime() <= currentTime.getTime()
  }, [(lead as any).callback_date, currentTime])
  const isNuRaspundeOverdue = useMemo(() => {
    const nr = (lead as any).nu_raspunde_callback_at
    if (!nr) return false
    return new Date(nr).getTime() <= currentTime.getTime()
  }, [(lead as any).nu_raspunde_callback_at, currentTime])
  const showCallbackDate = !inNoDeal && !isCurierAjunsAziStage && (lead as any).callback_date && !isCallbackOverdue
  const hasNuRaspundeTime = !!(lead as any).nu_raspunde_callback_at
  const showNuRaspundeTime = !inNoDeal && !isCurierAjunsAziStage && hasNuRaspundeTime && !isNuRaspundeOverdue
  // Tag „Sună!” doar în stage-urile: LEADuri sau leaduri straine
  const isStageAllowedForSuna = useMemo(() => {
    const s = (lead.stage || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
    return s === 'leaduri' || s === 'leads' || s.includes('leaduri straine') || s.includes('leaduristraine')
  }, [lead.stage])
  const maxOverdueDate = useMemo(() => {
    const dates: string[] = []
    if (!inNoDeal && !isCurierAjunsAziStage && (lead as any).callback_date && isCallbackOverdue) dates.push((lead as any).callback_date)
      if (!inNoDeal && !isCurierAjunsAziStage && (lead as any).nu_raspunde_callback_at && isNuRaspundeOverdue) dates.push((lead as any).nu_raspunde_callback_at)
    if (dates.length === 0) return null
    dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    return dates[0]
  }, [inNoDeal, isCurierAjunsAziStage, (lead as any).callback_date, (lead as any).nu_raspunde_callback_at, isCallbackOverdue, isNuRaspundeOverdue])
  const sunaAcknowledged = (lead as any).suna_acknowledged_at && maxOverdueDate && new Date((lead as any).suna_acknowledged_at) >= new Date(maxOverdueDate)
  const showSunaBadge = !inNoDeal && !isCurierAjunsAziStage && !sunaDismissed && !sunaAcknowledged && isStageAllowedForSuna && ((isCallbackOverdue && (lead as any).callback_date) || (isNuRaspundeOverdue && hasNuRaspundeTime))

  // actualizeaza timpul curent periodic pentru actualizare in timp real
  useEffect(() => {
    // Actualizează mereu la fiecare minut pentru a vedea dispariția etichetei "NOU"
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // 60 secunde - suficient pentru a vedea dispariția etichetei "NOU" după 4 ore
    
    return () => clearInterval(interval)
  }, [])

  // calculeaza timpul petrecut in stage-ul curent (pentru Asteptare, De Confirmat sau Confirmari)
  const timeInStage = useMemo(() => {
    const stageName = lead.stage?.toLowerCase() || ''
    const isAsteptare = stageName.includes('asteptare')
    const isDeConfirmat = stageName.includes('confirmat') && !stageName.includes('confirmari')
    const isConfirmari = stageName.includes('confirmari')
    
    if (!isAsteptare && !isDeConfirmat && !isConfirmari) return null
    
    if (!lead.stageMovedAt) return null
    
    const movedDate = new Date(lead.stageMovedAt)
    const now = currentTime // foloseste currentTime in loc de new Date() pentru actualizare in timp real
    const diffInMs = now.getTime() - movedDate.getTime()
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))
    
    let timeText = ''
    if (diffInMinutes < 60) {
      timeText = `${diffInMinutes} minute`
    } else if (diffInHours < 24) {
      timeText = `${diffInHours} ore`
    } else {
      timeText = `${diffInDays} zile`
    }
    
    let label = ''
    if (isAsteptare) {
      label = 'În așteptare'
    } else if (isConfirmari) {
      label = 'Confirmări'
    } else {
      label = 'De confirmat'
    }
    
    return {
      timeText,
      label
    }
  }, [lead.stage, lead.stageMovedAt, currentTime])

  const tagClass = (c: TagColor) =>
    c === "green" ? "bg-emerald-100 text-emerald-800"
  : c === "yellow" ? "bg-amber-100 text-amber-800"
  : c === "orange" ? "bg-orange-100 text-orange-800"
  : c === "blue" ? "bg-blue-100 text-blue-800"
  :                  "bg-rose-100 text-rose-800"

  // verifica daca un tag este un tag de departament
  const isDepartmentTag = (tagName: string) => {
    const departmentTags = ['Horeca', 'Saloane', 'Frizerii', 'Reparatii']
    return departmentTags.includes(tagName)
  }

  // returneaza stilul pentru insigne de departament
  const getDepartmentBadgeStyle = (tagName: string) => {
    const styles: Record<string, string> = {
      'Horeca': 'bg-gradient-to-r from-orange-500 to-orange-600 border-orange-300',
      'Saloane': 'bg-gradient-to-r from-emerald-500 to-emerald-600 border-emerald-300',
      'Frizerii': 'bg-gradient-to-r from-amber-500 to-amber-600 border-amber-300',
      'Reparatii': 'bg-gradient-to-r from-blue-500 to-blue-600 border-blue-300',
    }
    return styles[tagName] || 'bg-gradient-to-r from-gray-500 to-gray-600 border-gray-300'
  }

  // returneaza iconita potrivita pentru fiecare departament
  const getDepartmentIcon = (departmentName: string) => {
    const name = departmentName.toLowerCase()
    
    if (name.includes('saloane') || name.includes('salon')) {
      return <Sparkles className="h-3 w-3 flex-shrink-0" />
    } else if (name.includes('frizeri') || name.includes('frizerie') || name.includes('barber')) {
      return <Scissors className="h-3 w-3 flex-shrink-0" />
    } else if (name.includes('reparati') || name.includes('service')) {
      return <Wrench className="h-3 w-3 flex-shrink-0" />
    } else if (name.includes('horeca') || name.includes('corporate') || name.includes('business')) {
      return <Building className="h-3 w-3 flex-shrink-0" />
    } else {
      return <Building2 className="h-3 w-3 flex-shrink-0" />
    }
  }

  const handleCardClick = (e: React.MouseEvent) => {
    // După "Move to stage" sau alte acțiuni din meniu, nu deschide detalii (evită click-ul care "cade" pe card când meniul se închide)
    if (ignoreNextCardClickRef.current) {
      ignoreNextCardClickRef.current = false
      return
    }
    // daca se da click pe checkbox, meniu, butoane sau butoane de actiune rapida, nu deschide detalii
    const target = e.target as HTMLElement
    if (
      target.closest("[data-menu]") ||
      target.closest("[data-quick-action]") ||
      target.closest("[data-drag-handle]") ||
      target.closest("[data-checkbox]") ||
      target.closest("button") ||
      target.closest("a[role='button']")
    ) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    
    // Ctrl+Click sau Cmd+Click pentru selectie multipla
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      onSelectChange?.(!isSelected)
      return
    }
    
    onClick(e)
  }

  const handleCheckboxChange = (checked: boolean) => {
    onSelectChange?.(checked)
  }

  const handleStageSelect = (newStage: string) => {
    ignoreNextCardClickRef.current = true
    // Blochează mutarea în stage-urile restricționate în Receptie
    const isReceptiePipeline = pipelineName?.toLowerCase().includes('receptie') || false
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
          description: `Nu poți muta cardul în stage-ul "${newStage}" în pipeline-ul Receptie.`,
          variant: "destructive",
        })
        setIsMenuOpen(false)
        return
      }
    }
    
    onMove(lead.id, newStage)
    setIsMenuOpen(false)
  }

  const handlePinToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPinning) return
    // Pin se aplică pe lead; pentru carduri fișă/tăviță folosim lead_id
    const targetLeadId = itemType === 'lead' ? lead.id : leadIdForTags
    if (!targetLeadId) {
      toast({
        title: "Pin indisponibil",
        description: "Pin-ul se aplică pe lead. Acest card nu are un lead asociat.",
        variant: "destructive",
      })
      return
    }
    setIsPinning(true)
    try {
      const pinnedTag = await getOrCreatePinnedTag()
      await toggleLeadTag(targetLeadId, pinnedTag.id)
      const newIsPinned = !isPinned
      logButtonEvent({ leadId: targetLeadId, buttonId: 'vanzariCardPinButton', buttonLabel: newIsPinned ? 'Pin' : 'Unpin', actorOption }).catch(() => {})
      onPinToggle?.(targetLeadId, newIsPinned)
      toast({
        title: newIsPinned ? "Lead pinned" : "Lead unpinned",
        description: newIsPinned ? "Lead-ul va aparea primul in stage" : "Lead-ul a fost unpinned",
      })
    } catch (error: unknown) {
      const msg =
        typeof error === 'string'
          ? error
          : (error as Error)?.message ?? (error as { message?: string })?.message ?? (error as { code?: string })?.code ?? 'Eroare necunoscută'
      console.error('Eroare la toggle pin:', String(msg), error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut actualiza starea de pin. " + String(msg),
        variant: "destructive",
      })
    } finally {
      setIsPinning(false)
    }
  }

  const handleNuRaspundeToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    ignoreNextCardClickRef.current = true
    if (!leadIdForTags) {
      toast({
        title: "Nu se poate aplica tag-ul",
        description: "Nu am putut identifica lead-ul asociat acestei fișe.",
        variant: "destructive",
      })
      return
    }
    setIsTogglingNuRaspunde(true)
    try {
      const tag = await getOrCreateNuRaspundeTag()
      await toggleLeadTag(leadIdForTags, tag.id)
      const newActive = !nuRaspundeActive
      setNuRaspundeActive(newActive)
      const currentTags = Array.isArray(lead?.tags) ? (lead.tags as { id: string; name: string }[]) : []
      const newTags = newActive
        ? [...currentTags, { id: tag.id, name: tag.name }]
        : currentTags.filter((t) => t.id !== tag.id)
      onTagsChange?.(leadIdForTags, newTags)
      toast({
        title: nuRaspundeActive ? "Tag scos" : "Tag aplicat",
        description: `"Nu raspunde" ${nuRaspundeActive ? "a fost scos" : "a fost aplicat"} pe fișă.`,
      })
      if (!newActive && onNuRaspundeClearedForReceptie && (lead as any).type === 'service_file') {
        await onNuRaspundeClearedForReceptie(lead.id)
      } else {
        onRefresh?.()
      }
    } catch (error) {
      console.error('Eroare la toggle Nu raspunde:', error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut actualiza tag-ul \"Nu raspunde\"",
        variant: "destructive",
      })
    } finally {
      setIsTogglingNuRaspunde(false)
      setIsMenuOpen(false)
    }
  }

  const handleNuAVenitToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    ignoreNextCardClickRef.current = true
    if (!leadIdForTags) {
      toast({
        title: "Nu se poate aplica tag-ul",
        description: "Nu am putut identifica lead-ul asociat acestei fișe.",
        variant: "destructive",
      })
      return
    }
    setIsTogglingNuAVenit(true)
    try {
      const tag = await getOrCreateNuAVenitTag()
      await toggleLeadTag(leadIdForTags, tag.id)
      const newActive = !nuAVenitActive
      setNuAVenitActive(newActive)
      const currentTags = Array.isArray(lead?.tags) ? (lead.tags as { id: string; name: string }[]) : []
      const newTags = newActive
        ? [...currentTags, { id: tag.id, name: tag.name }]
        : currentTags.filter((t) => t.id !== tag.id)
      onTagsChange?.(leadIdForTags, newTags)
      toast({
        title: nuAVenitActive ? "Tag scos" : "Tag aplicat",
        description: `"Nu A Venit" ${nuAVenitActive ? "a fost scos" : "a fost aplicat"} pe fișă.`,
      })
      onRefresh?.()
    } catch (error) {
      console.error('Eroare la toggle Nu A Venit:', error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut actualiza tag-ul \"Nu A Venit\"",
        variant: "destructive",
      })
    } finally {
      setIsTogglingNuAVenit(false)
      setIsMenuOpen(false)
    }
  }

  const isTrayOrServiceFile = (lead as any).type === 'tray' || (lead as any).type === 'service_file' || lead.isQuote
  const isReadOnly = (lead as any).isReadOnly || false
  const qcStatus = (lead as any).qcStatus as ('validated' | 'not_validated' | null | undefined)
  const isQcValidated = qcStatus === 'validated' || (lead as any).qcValidated === true
  const isQcNotValidated = qcStatus === 'not_validated' || (lead as any).qcNotValidated === true
  const qcInValidation = (lead as any).qcInValidation === true // Flag pentru status mov (în validare)
  
  return (
    <div
      className={cn(
        "bg-background border rounded-md shadow-sm transition-all hover:shadow-md",
        isTrayOrServiceFile ? "p-2" : "p-3", // Padding mai mic pentru tăvițe
        isDragging && !isReadOnly && "opacity-50 rotate-2 scale-105",
        isSelected && "border-primary border-2 bg-primary/5",
        isReadOnly && "opacity-75 cursor-not-allowed",
        qcInValidation && "border-purple-500 border-2", // Border mov pentru fișe în validare
        itemType === 'service_file' && nuRaspundeActive && "border-red-600 border-2 animate-border-nu-raspunde",
        // Indicator vizual pentru "Colet ajuns" - schimbare border în funcție de status-ul tăvițelor
        isInColetAjunsStage && itemType === 'service_file' && trayStatus && (
          trayStatus === 'loading' ? "border-gray-300/60" :
          trayStatus === 'red' ? "border-red-500/60" :
          trayStatus === 'yellow' ? "border-yellow-500/60" :
          trayStatus === 'green' ? "border-green-500/60" :
          trayStatus === 'purple' ? "border-purple-500/60" : ""
        ),
      )}
      draggable={!isReadOnly}
      onDragStart={!isReadOnly ? onDragStart : undefined}
      onDragEnd={!isReadOnly ? onDragEnd : undefined}
      onClick={handleCardClick}
    >
      {/* Unim conținutul + controalele și îl împărțim în 3 rânduri (coloană) */}
      <div className="flex flex-col gap-2">
        {/* RÂND 1 (SUS): info + controale */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="min-w-0">
              {/* Afișare pentru pipeline Vânzări - doar elementele cerute */}
              {pipelineName && pipelineName.toLowerCase().includes('vanzari') && !((lead as any).type === 'tray') && !lead.isQuote ? (
                /* Layout pe colțuri: lead și fișă de serviciu – nume, taguri Curier/Office cu X, buton Livrare, atribuire (Preia) */
                <div className="grid grid-cols-[1fr_auto] grid-rows-[auto_1fr] gap-x-3 gap-y-2 min-h-[72px]">
                  <h4 className="font-semibold text-sm text-foreground truncate self-start flex items-center gap-1.5">
                    {lead.name}
                    {(lead as any).type === 'service_file' && (lead as any).serviceFileNumber && (
                      <span className="text-xs font-normal text-muted-foreground">#{(lead as any).serviceFileNumber}</span>
                    )}
                  </h4>
                  <div className="flex items-center gap-1 justify-end self-start" data-checkbox>
                    {/* Iconiță mesaje: badge cu număr (Vânzări – lead/fișă cu mesaje necitite) */}
                    {(itemType === 'lead' || itemType === 'service_file') && (lead as any).userMessageCount != null && (lead as any).userMessageCount > 0 && (
                      <span className="relative inline-flex h-6 w-6 flex-shrink-0 items-center justify-center text-muted-foreground" title="Mesaje de la utilizatori">
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                          {(lead as any).userMessageCount > 99 ? '99+' : (lead as any).userMessageCount}
                        </span>
                      </span>
                    )}
                    {/* Buton info (i în cerc, stil YouTube) – la hover: detaliile comunicate de client deasupra cardului */}
                    <HoverCard openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 rounded-full flex-shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/80"
                          onClick={(e) => { e.stopPropagation(); logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardInfoButton', buttonLabel: 'Info', actorOption }).catch(() => {}) }}
                          data-menu
                        >
                          <Info className="h-3.5 w-3.5" />
                        </Button>
                      </HoverCardTrigger>
                      <HoverCardContent side="top" align="start" className="w-[420px] max-h-[320px] overflow-y-auto text-sm">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="font-medium text-foreground">Detaliile comunicate de client</div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.preventDefault()
                              setDetailsEditValue(String(leadDetailsDisplay ?? "").trim())
                              setShowDetailsEditDialog(true)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Editează
                          </Button>
                        </div>
                        <div className="text-muted-foreground whitespace-pre-wrap break-words">
                          {leadDetailsDisplay && String(leadDetailsDisplay).trim()
                            ? renderDetailsWithRedHighlight(String(leadDetailsDisplay).trim())
                            : <span className="text-muted-foreground">Nu există detalii comunicate de client.</span>}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                    {leadIdForTags && (
                      <Popover open={tagPopoverOpen} onOpenChange={(open) => { setTagPopoverOpen(open); if (open) logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardTagButton', buttonLabel: 'Taguri', actorOption }).catch(() => {}) }}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 rounded-full flex-shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/80"
                            onClick={(e) => e.stopPropagation()}
                            data-menu
                            title="Atribuie taguri"
                          >
                            <Tag className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="end" className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
                          <div className="font-medium text-sm mb-2">Taguri</div>
                          {loadingTags ? (
                            <div className="text-xs text-muted-foreground">Se încarcă...</div>
                          ) : assignableTagsList.length === 0 ? (
                            <div className="text-xs text-muted-foreground">Nu există taguri configurate.</div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {assignableTagsList.map((tag) => {
                                const currentTags = Array.isArray(lead?.tags) ? (lead.tags as { id: string }[]) : []
                                const isSelected = currentTags.some((t) => t.id === tag.id)
                                const isToggling = togglingTagId === tag.id
                                return (
                                  <Badge
                                    key={tag.id}
                                    variant={isSelected ? "default" : "outline"}
                                    className={cn(
                                      "cursor-pointer transition-all text-xs font-medium",
                                      isSelected ? tagClass(tag.color) : "bg-muted/50 hover:bg-muted"
                                    )}
                                    onClick={() => handleToggleAssignTag(tag.id)}
                                  >
                                    {tag.name}
                                    {isToggling ? "..." : ""}
                                  </Badge>
                                )
                              })}
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                    {onSelectChange && (
                      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSelected} onCheckedChange={handleCheckboxChange} data-checkbox />
                      </div>
                    )}
                    {showArchiveButton && onArchive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        title="Arhivează (mută la Arhivat)"
                        data-button-id="receptieCardArchiveButton"
                        disabled={isArchiving}
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (isArchiving) return
                          setIsArchiving(true)
                          try {
                            await onArchive()
                          } finally {
                            setIsArchiving(false)
                          }
                        }}
                      >
                        {isArchiving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                      </Button>
                    )}
                    <DropdownMenu open={isMenuOpen} onOpenChange={(open) => { setIsMenuOpen(open); if (open) logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardMenuButton', buttonLabel: 'Meniu', actorOption }).catch(() => {}) }}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" data-menu onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" data-menu>
                        {(stagesForMoveMenu.length > 0 ? stagesForMoveMenu : stages).map((stage) => {
                          const isReceptiePipeline = pipelineName?.toLowerCase().includes('receptie') || false
                          const stageLower = stage.toLowerCase()
                          let isRestricted = false
                          const isDisabled = stage === lead.stage
                          return (
                            <DropdownMenuItem key={stage} onClick={() => handleStageSelect(stage)} disabled={isDisabled} className={isRestricted ? "opacity-50 cursor-not-allowed" : ""}>
                              Move to {stage}
                              {isRestricted && <span className="ml-2 text-xs text-muted-foreground">(blocat)</span>}
                            </DropdownMenuItem>
                          )
                        })}
                        {itemType === 'service_file' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleNuRaspundeToggle} disabled={isTogglingNuRaspunde} className="text-red-700 focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-950">
                              <PhoneOff className="h-4 w-4 mr-2" />
                              {nuRaspundeActive ? 'Scoate „Nu raspunde”' : 'Atribuie „Nu raspunde”'}
                            </DropdownMenuItem>
                            {isInOfficeDirectStage && (
                              <DropdownMenuItem onClick={handleNuAVenitToggle} disabled={isTogglingNuAVenit} className="text-orange-700 focus:text-orange-700 focus:bg-orange-50 dark:focus:bg-orange-950">
                                <UserX className="h-4 w-4 mr-2" />
                                {nuAVenitActive ? 'Scoate „Nu A Venit”' : 'Nu A Venit'}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); ignoreNextCardClickRef.current = true; setShowDeleteDialog(true) }} className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950">
                              <Trash2 className="h-4 w-4 mr-2" />
                              {deleteLabel}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex flex-col gap-0.5 items-start justify-end self-end min-w-0">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 flex-shrink-0" />
                      <span className="font-medium truncate">Telefon: {lead.phone}</span>
                    </div>
                    {showSunaBadge ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border border-red-600 animate-suna-blink">
                          Sună!
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          title="Elimină tag Sună!"
                          disabled={isSavingSunaDismiss}
                          onClick={async (e) => {
                            e.stopPropagation()
                            setIsSavingSunaDismiss(true)
                            try {
                              await logLeadEvent(
                                leadIdForDb,
                                "Tag Sună! eliminat de pe card.",
                                "suna_tag_eliminated",
                                { tag_name: "Suna!" }
                              )
                              setSunaDismissed(true)
                              const { error: updateErr } = await updateLead(leadIdForDb, { suna_acknowledged_at: new Date().toISOString() })
                              if (updateErr) {
                                console.warn('[LeadCard] suna_acknowledged_at update failed (rulează migrarea supabase dacă e cazul):', updateErr)
                              }
                              if (leadIdForTags) {
                                const sunaTag = await getOrCreateSunaTag()
                                await toggleLeadTag(leadIdForTags, sunaTag.id)
                                const currentTags = Array.isArray(lead?.tags) ? (lead.tags as { id: string; name: string }[]) : []
                                const newTags = currentTags.filter((t) => t.id !== sunaTag.id)
                                onTagsChange?.(lead.id, newTags)
                              }
                            } catch (err: any) {
                              toast({ variant: "destructive", title: "Eroare", description: err?.message ?? "Nu s-a putut elimina tag-ul." })
                            } finally {
                              setIsSavingSunaDismiss(false)
                            }
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    ) : showCallbackDate ? (
                      <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        <span>{format(new Date((lead as any).callback_date), 'dd MMM yyyy, HH:mm', { locale: ro })}</span>
                      </div>
                    ) : showNuRaspundeTime ? (
                      <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 font-medium">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        <span>{format(new Date((lead as any).nu_raspunde_callback_at), 'dd MMM yyyy, HH:mm', { locale: ro })}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        <span>{lead.createdAt ? format(new Date(lead.createdAt), 'dd MMM yyyy, HH:mm', { locale: ro }) : 'N/A'}</span>
                      </div>
                    )}
                    {(showCurierTrimisOnCard || showOfficeDirectOnCard || ((lead as any).claimed_by_name && (isClaimedByMe || isClaimedByOther))) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {(lead as any).claimed_by_name && (isClaimedByMe || isClaimedByOther) && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <UserCheck className="h-3 w-3" />
                            Preluat de {(lead as any).claimed_by_name}
                          </span>
                        )}
                        {showCurierTrimisOnCard && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200 border border-sky-200 dark:border-sky-700">
                            <Package className="h-3 w-3" />
                            Curier Trimis{(lead as any).curier_trimis_user_name ? ` (de ${(lead as any).curier_trimis_user_name})` : ''}
                            {(itemType === 'lead' || itemType === 'service_file') && (
                              <Button variant="ghost" size="sm" className="h-4 w-4 p-0 rounded hover:bg-sky-200 dark:hover:bg-sky-800" title="Elimină Curier Trimis" disabled={isSavingCurierDismiss} onClick={(e) => { e.stopPropagation(); e.preventDefault(); ignoreNextCardClickRef.current = true; handleRemoveCurierTrimis(); }} data-quick-action={true}>
                                <XCircle className="h-3 w-3" />
                              </Button>
                            )}
                          </span>
                        )}
                        {showOfficeDirectOnCard && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200 border border-violet-200 dark:border-violet-700">
                            <Building2 className="h-3 w-3" />
                            Office Direct{(lead as any).office_direct_user_name ? ` (de ${(lead as any).office_direct_user_name})` : ''}
                            {(itemType === 'lead' || itemType === 'service_file') && (
                              <Button variant="ghost" size="sm" className="h-4 w-4 p-0 rounded hover:bg-violet-200 dark:hover:bg-violet-800" title="Elimină Office Direct" disabled={isSavingOfficeDismiss} onClick={(e) => { e.stopPropagation(); e.preventDefault(); ignoreNextCardClickRef.current = true; handleRemoveOfficeDirect(); }} data-quick-action={true}>
                                <XCircle className="h-3 w-3" />
                              </Button>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 justify-end self-end" data-menu data-quick-action onClick={(e) => { e.stopPropagation(); e.preventDefault() }}>
                    {showClaimButton && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 w-7 rounded-full p-0 transition-all ${isClaimedByMe ? 'bg-blue-100 dark:bg-blue-900/40' : isClaimedByOther ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-100 dark:hover:bg-blue-900/30'}`}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleClaimLead() }}
                        title={isClaimedByMe ? 'Eliberează lead-ul' : isClaimedByOther ? `Preluat de ${(lead as any).claimed_by_name || 'altcineva'}` : 'Preia lead-ul'}
                        disabled={isClaiming || isClaimedByOther}
                        data-quick-action={true}
                      >
                        {isClaimedByMe
                          ? <UserCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          : <UserPlus className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
                      </Button>
                    )}
                    {(isOwner || isAdmin) && showClaimButton && (
                      <Popover open={assignPopoverOpen} onOpenChange={setAssignPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 rounded-full p-0 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all"
                            onClick={(e) => { e.stopPropagation(); setAssignPopoverOpen(prev => !prev) }}
                            title="Atribuie lead cuiva"
                            disabled={isAssigning}
                            data-quick-action={true}
                          >
                            <Users className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="end" onOpenAutoFocus={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
                          <p className="text-xs font-medium text-muted-foreground px-2 py-1">Atribuie lead</p>
                          <div className="max-h-[220px] overflow-y-auto space-y-0.5">
                            {(membersList ?? []).map((m) => {
                              const name = m.name || `User ${(m.user_id ?? '').slice(0, 8)}`
                              const isCurrent = (lead as any).claimed_by === m.user_id
                              return (
                                <Button
                                  key={m.user_id}
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start text-sm font-normal h-8"
                                  onClick={() => handleAssignTo(m.user_id, name)}
                                  disabled={isAssigning}
                                >
                                  {isCurrent && <UserCheck className="h-3.5 w-3.5 mr-2 text-green-600" />}
                                  {name}
                                </Button>
                              )
                            })}
                          </div>
                          {(!membersList || membersList.length === 0) && (
                            <p className="text-xs text-muted-foreground px-2 py-2">Niciun membru</p>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 w-7 rounded-full p-0 transition-all ${(inNoDeal || !isCurierAjunsAziStage) ? 'hidden' : ''} ${deliveryAlreadyActiveNotArchived ? 'opacity-50 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent' : 'hover:bg-violet-100 dark:hover:bg-violet-900/30'}`}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (!deliveryAlreadyActiveNotArchived) { logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardDeliveryButton', buttonLabel: 'Livrare', actorOption }).catch(() => {}); setShowDeliveryOverlay(true) } }}
                      title={deliveryAlreadyActiveNotArchived ? 'Curier trimis / Office direct deja active (sau arhivează pentru a reseta)' : 'Curier trimis / Office direct'}
                      disabled={isSavingDelivery || deliveryAlreadyActiveNotArchived}
                      data-quick-action={true}
                    >
                      <Package className={`h-3.5 w-3.5 ${deliveryAlreadyActiveNotArchived ? 'text-violet-400/60 dark:text-violet-500/50' : 'text-violet-600 dark:text-violet-400'}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 w-7 rounded-full p-0 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all ${(isCurierAjunsAziStage || inNoDeal) ? 'hidden' : ''}`}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardCallbackButton', buttonLabel: 'Callback', actorOption }).catch(() => {}); setShowCallbackDialog(true) }}
                      title="Programează Callback"
                      disabled={isSavingCallback}
                      data-quick-action={true}
                    >
                      <PhoneCall className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 w-7 rounded-full p-0 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all ${(isCurierAjunsAziStage || inNoDeal) ? 'hidden' : ''}`}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardNuRaspundeButton', buttonLabel: 'Nu Răspunde', actorOption }).catch(() => {}); setShowNuRaspundeDialog(true) }}
                      title="Marchează Nu Răspunde"
                      disabled={isSavingNuRaspunde}
                      data-quick-action={true}
                    >
                      <PhoneMissed className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 w-7 rounded-full p-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all ${(isCurierAjunsAziStage || inNoDeal) ? 'hidden' : ''}`}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleNoDeal() }}
                      title="Marchează No Deal"
                      disabled={isSavingNoDeal}
                      data-quick-action={true}
                    >
                      <XCircle className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                    </Button>
                  </div>
                </div>
              ) : (lead.isQuote || (lead as any).type === 'tray') ? (
                // Afișare minimalistă pentru tăviță (tray)
                <>
                  {/* Header: Client (fără suma în header) */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm text-foreground truncate">{lead.name}</h4>
                    {((lead as any).trayNumber || (lead as any).traySize || (lead as any).isSplitChild) && (
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {(lead as any).trayNumber && (
                          <span className="text-xs text-muted-foreground">#{((lead as any).trayNumber)}</span>
                        )}
                        {(lead as any).traySize && (
                          <span className="text-xs text-muted-foreground">{(lead as any).traySize}</span>
                        )}
                        {(lead as any).isSplitChild && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold border border-orange-300">
                            🔀 SPLIT
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {lead.phone && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{lead.phone}</span>
                    </div>
                  )}
                  
                  {/* Info row: Tehnicieni + Timp estimat + Timp lucrat */}
                  {(lead.technician || (lead as any).technician2 || (lead as any).technician3 || (lead as any).estimatedTime) && (
                    <div className="space-y-1 mt-1.5">
                      {/* Afișează toți tehnicienii */}
                      {(lead.technician || (lead as any).technician2 || (lead as any).technician3) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-red-600">
                            👤 Tehnicieni:
                          </span>
                          <span className="text-xs font-medium text-foreground">
                            {[lead.technician, (lead as any).technician2, (lead as any).technician3].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                      {(lead as any).estimatedTime && (lead as any).estimatedTime > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-blue-600 font-medium">⏱ Estimat:</span>
                          <span className="text-xs text-blue-600">
                            {(lead as any).estimatedTime >= 60 
                              ? `${Math.floor((lead as any).estimatedTime / 60)}h ${(lead as any).estimatedTime % 60 > 0 ? `${(lead as any).estimatedTime % 60}min` : ''}`
                              : `${(lead as any).estimatedTime}min`}
                          </span>
                        </div>
                      )}
                      {/* Timp în stage-ul "IN LUCRU" sau "IN ASTEPTARE" */}
                      {((lead as any).inLucruSince || (lead as any).inAsteptareSince) && (
                        <div className="space-y-0.5">
                          {(lead as any).inLucruSince && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-green-600">⏲ În lucru:</span>
                              <span className="text-xs text-green-600">{formatExactDuration(new Date((lead as any).inLucruSince))}</span>
                            </div>
                          )}
                          {(lead as any).inAsteptareSince && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-yellow-600">⏸ În așteptare:</span>
                              <span className="text-xs text-yellow-600">{formatExactDuration(new Date((lead as any).inAsteptareSince))}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (lead as any).type === 'service_file' ? (
                // Afișare minimalistă pentru fișă de serviciu (fără status aici; statusul e la MIJLOC)
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-medium text-foreground truncate text-sm">{lead.name}</h4>
                    {(lead as any).serviceFileNumber && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        #{(lead as any).serviceFileNumber}
                      </span>
                    )}
                  </div>
                  
                  {lead.phone && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span className="truncate">{lead.phone}</span>
                    </div>
                  )}
                  {/* Buton "Nu A Venit" pentru fișe în Office Direct */}
                  {itemType === 'service_file' && isInOfficeDirectStage && (
                    <Button
                      variant={nuAVenitActive ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "mt-1.5 h-7 text-xs",
                        nuAVenitActive ? "bg-orange-600 hover:bg-orange-700 text-white" : "border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                      )}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); ignoreNextCardClickRef.current = true; handleNuAVenitToggle(e); }}
                      disabled={isTogglingNuAVenit}
                      data-quick-action
                    >
                      <UserX className="h-3.5 w-3.5 mr-1" />
                      {nuAVenitActive ? 'Nu A Venit ✓' : 'Nu A Venit'}
                    </Button>
                  )}
                  {/* Indicator global status tăvițe pentru "Colet ajuns" */}
                  {isInColetAjunsStage && itemType === 'service_file' && trayStatus && trayStatus !== 'loading' && (
                    <div className="flex flex-col gap-1 mt-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Status:</span>
                        <span className={cn(
                          "inline-flex items-center justify-center w-3 h-3 rounded-full",
                          trayStatus === 'red' ? "bg-red-500" :
                          trayStatus === 'yellow' ? "bg-yellow-500" :
                          trayStatus === 'green' ? "bg-green-500" :
                          trayStatus === 'purple' ? "bg-purple-500" : "bg-gray-400"
                        )} />
                        <span className={cn(
                          "text-xs font-semibold",
                          trayStatus === 'red' ? "text-red-600" :
                          trayStatus === 'yellow' ? "text-yellow-600" :
                          trayStatus === 'green' ? "text-green-600" :
                          trayStatus === 'purple' ? "text-purple-600" : "text-gray-600"
                        )}>
                          {trayStatus === 'red' ? 'Tăvițe lipsă' :
                           trayStatus === 'yellow' ? 'Parțial complet' :
                           trayStatus === 'green' ? 'Corect' :
                           trayStatus === 'purple' ? 'Pipeline greșit' : ''}
                        </span>
                      </div>
                      
                      {/* Pipeline greșit: afișăm în rândurile tăvițelor când avem traysInLucru, altfel aici */}
                      {trayStatus === 'purple' && trayDetails.filter((t: any) => t.status === 'wrong_pipeline' && t.currentPipelineDisplay).length > 0 && !((lead as any).traysInLucru && (lead as any).traysInLucru.length > 0) && (
                        <div className="flex flex-col gap-0.5 text-[10px]">
                          {trayDetails
                            .filter((t: any) => t.status === 'wrong_pipeline' && t.currentPipelineDisplay)
                            .map((t: any, i: number) => (
                              <div key={i} className="text-purple-600 dark:text-purple-400">
                                Tăvița #{t.trayNumber || 'N/A'} → <span className="font-medium">{t.currentPipelineDisplay}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Tăvițe: afișăm doar când NU avem traysInLucru (evită repetarea cu secțiunea Status) */}
                  {(Array.isArray((lead as any).trayNumbers) && (lead as any).trayNumbers.length > 0) && !((lead as any).traysInLucru && (lead as any).traysInLucru.length > 0) && (
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span className="font-medium text-foreground/80">Tăvițe:</span>
                      <span className="flex items-center gap-1 flex-wrap">
                        {((lead as any).trayNumbers as string[]).map((num: string, i: number) => {
                          return (
                            <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded font-medium bg-muted/50 text-foreground">
                              #{num}
                            </span>
                          )
                        })}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                // Afișare pentru lead / service_file
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-foreground truncate">{lead.name}</h4>
                    {isNewBadgeVisible && (
                      <span 
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-sm animate-pulse border border-red-300 cursor-help"
                        title={leadAge?.timeText ? `Lead creat acum ${leadAge.timeText}` : 'Lead nou'}
                      >
                        NOU
                      </span>
                    )}
                    {(lead as any).type === 'service_file' && isQcNotValidated && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm animate-pulse border border-orange-300 cursor-help"
                        title="QC: nevalidat"
                      >
                        NEVALIDAT
                      </span>
                    )}
                    {(lead as any).type === 'service_file' && qcInValidation && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-sm border border-purple-300 cursor-help"
                        title="QC: în validare - toate tăvițele sunt finalizate dar nu toate sunt validate"
                      >
                        ÎN VALIDARE
                      </span>
                    )}
                    {(lead as any).type === 'service_file' && !isQcNotValidated && !qcInValidation && isQcValidated && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 text-white shadow-sm border border-emerald-300 cursor-help"
                        title="QC: validat"
                      >
                        VALIDAT
                      </span>
                    )}
                  </div>
                  
                  {lead.email && (
                    <div className="flex items-center gap-1 mt-1">
                      <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                    </div>
                  )}
                  
                  {lead.phone && (
                    <div className="flex items-center gap-1 mt-1">
                      <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">{lead.phone}</p>
                    </div>
                  )}
                  
                  {lead.technician && (
                    <div className="flex items-center gap-1 mt-1">
                      <User className="h-3 w-3 text-red-600 flex-shrink-0" />
                      <p className="text-xs font-semibold text-red-600 truncate">Tehnician: {lead.technician}</p>
                    </div>
                  )}
                  
                  {/* Afișează data call back dacă lead-ul este în stage-ul Call Back */}
                  {!shouldHideTriggersAndTags && lead.stage && (
                    (() => {
                      const stageName = lead.stage.toUpperCase()
                      const isCallBackStage = stageName.includes('CALLBACK') || stageName.includes('CALL BACK') || stageName.includes('CALL-BACK')
                      const isNuRaspundeStage = stageName.includes('RASPUNDE') || stageName.includes('RASUNDE')
                      const callbackDate = (lead as any).callback_date
                      const nuRaspundeCallbackAt = (lead as any).nu_raspunde_callback_at
                      const callbackOverdueHere = callbackDate ? new Date(callbackDate).getTime() <= Date.now() : false
                      const nuRaspundeOverdueHere = nuRaspundeCallbackAt ? new Date(nuRaspundeCallbackAt).getTime() <= Date.now() : false
                      
                      if (isCallBackStage && callbackDate && callbackOverdueHere && !sunaDismissed && !sunaAcknowledged) {
                        return (
                          <span className="inline-flex items-center gap-1.5 mt-1">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border border-red-600 animate-suna-blink">
                              Sună!
                            </span>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 rounded" title="Elimină tag Sună!" disabled={isSavingSunaDismiss} onClick={(e) => { e.stopPropagation(); (async () => { setIsSavingSunaDismiss(true); try { await logLeadEvent(leadIdForDb, "Tag Sună! eliminat de pe card.", "suna_tag_eliminated", { tag_name: "Suna!" }); setSunaDismissed(true); const { error: updateErr } = await updateLead(leadIdForDb, { suna_acknowledged_at: new Date().toISOString() }); if (updateErr) console.warn('[LeadCard] suna_acknowledged_at update failed:', updateErr); if (leadIdForTags) { const sunaTag = await getOrCreateSunaTag(); await toggleLeadTag(leadIdForTags, sunaTag.id); const currentTags = Array.isArray(lead?.tags) ? (lead.tags as { id: string; name: string }[]) : []; const newTags = currentTags.filter((t) => t.id !== sunaTag.id); onTagsChange?.(lead.id, newTags); } } catch (err: any) { toast({ variant: "destructive", title: "Eroare", description: err?.message ?? "Nu s-a putut elimina tag-ul." }); } finally { setIsSavingSunaDismiss(false); } })(); }}>
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        )
                      }
                      if (isCallBackStage && callbackDate && !callbackOverdueHere) {
                        return (
                          <div className="flex items-center gap-1 mt-1">
                            <Calendar className="h-3 w-3 text-blue-600 flex-shrink-0" />
                            <p className="text-xs font-semibold text-blue-600 truncate">
                              {format(new Date(callbackDate), 'dd MMM yyyy, HH:mm', { locale: ro })}
                            </p>
                          </div>
                        )
                      }
                      if (isNuRaspundeStage && nuRaspundeCallbackAt && nuRaspundeOverdueHere && !sunaDismissed && !sunaAcknowledged) {
                        return (
                          <span className="inline-flex items-center gap-1.5 mt-1">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border border-red-600 animate-suna-blink">
                              Sună!
                            </span>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 rounded" title="Elimină tag Sună!" disabled={isSavingSunaDismiss} onClick={(e) => { e.stopPropagation(); (async () => { setIsSavingSunaDismiss(true); try { await logLeadEvent(leadIdForDb, "Tag Sună! eliminat de pe card.", "suna_tag_eliminated", { tag_name: "Suna!" }); setSunaDismissed(true); const { error: updateErr } = await updateLead(leadIdForDb, { suna_acknowledged_at: new Date().toISOString() }); if (updateErr) console.warn('[LeadCard] suna_acknowledged_at update failed:', updateErr); if (leadIdForTags) { const sunaTag = await getOrCreateSunaTag(); await toggleLeadTag(leadIdForTags, sunaTag.id); const currentTags = Array.isArray(lead?.tags) ? (lead.tags as { id: string; name: string }[]) : []; const newTags = currentTags.filter((t) => t.id !== sunaTag.id); onTagsChange?.(lead.id, newTags); } } catch (err: any) { toast({ variant: "destructive", title: "Eroare", description: err?.message ?? "Nu s-a putut elimina tag-ul." }); } finally { setIsSavingSunaDismiss(false); } })(); }}>
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        )
                      }
                      if (isNuRaspundeStage && nuRaspundeCallbackAt && !nuRaspundeOverdueHere) {
                        return (
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                            <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 truncate">
                              {format(new Date(nuRaspundeCallbackAt), 'dd MMM yyyy, HH:mm', { locale: ro })}
                            </p>
                          </div>
                        )
                      }
                      if (isInLeaduriStage && hasFollowUp && followUpOra) {
                        return (
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                            <p className="text-xs font-semibold text-emerald-600 truncate">
                              {format(new Date(followUpOra), 'HH:mm', { locale: ro })}
                            </p>
                          </div>
                        )
                      }
                      return null
                    })()
                  )}
                </>
              )}
            </div>
          </div>

          {/* Controale (dreapta) - ascunse pentru card Vânzări lead/fișă (sunt în grid) */}
          {!(pipelineName && pipelineName.toLowerCase().includes('vanzari') && !((lead as any).type === 'tray') && !lead.isQuote) && (
          <div className="flex items-center gap-1">
          {/* Iconiță mesaje: badge cu număr (Receptie – fișă; departamente – tăviță; alte pipeline-uri – lead/fișă) */}
          {(itemType === 'lead' || itemType === 'service_file' || itemType === 'tray') && (lead as any).userMessageCount != null && (lead as any).userMessageCount > 0 && (
            <span className="relative inline-flex h-6 w-6 flex-shrink-0 items-center justify-center text-muted-foreground" title="Mesaje de la utilizatori">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {(lead as any).userMessageCount > 99 ? '99+' : (lead as any).userMessageCount}
              </span>
            </span>
          )}
          {/* Checkbox pentru selectie multipla */}
          {onSelectChange && (
            <div className="flex-shrink-0" data-checkbox onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={handleCheckboxChange}
                data-checkbox
              />
            </div>
          )}
          
          {/* Butonul Pin - ascuns în pipeline-ul Vânzări */}
          {(!pipelineName || !pipelineName.toLowerCase().includes('vanzari')) && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 w-6 p-0",
                isPinned && "text-blue-600 dark:text-blue-400"
              )}
              onClick={handlePinToggle}
              disabled={isPinning}
              title={isPinned ? "Unpin lead" : "Pin lead"}
              data-menu
            >
              <Pin className={cn("h-3 w-3", isPinned && "fill-current")} />
            </Button>
          )}
          {showArchiveButton && onArchive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title="Arhivează (mută la Arhivat)"
              data-button-id="receptieCardArchiveButton"
              disabled={isArchiving}
              onClick={async (e) => {
                e.stopPropagation()
                if (isArchiving) return
                setIsArchiving(true)
                try {
                  await onArchive()
                } finally {
                  setIsArchiving(false)
                }
              }}
            >
              {isArchiving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
            </Button>
          )}
          <DropdownMenu open={isMenuOpen} onOpenChange={(open) => { setIsMenuOpen(open); if (open && leadIdForDb) logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardMenuButton', buttonLabel: 'Meniu', actorOption }).catch(() => {}) }}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" data-menu onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" data-menu>
              {stages.map((stage) => {
                // Verifică dacă stage-ul este restricționat în Receptie
                const isReceptiePipeline = pipelineName?.toLowerCase().includes('receptie') || false
                const stageLower = stage.toLowerCase()
                // DEZACTIVAT RESTRICȚII - todas staguri sunt disponibile
                // const restrictedStages = ['facturat', 'facturată', 'in asteptare', 'în așteptare', 'in lucru', 'în lucru']
                let isRestricted = false
                // if (isReceptiePipeline) {
                //   for (let i = 0; i < restrictedStages.length; i++) {
                //     const restricted = restrictedStages[i]
                //     if (stageLower.includes(restricted)) {
                //       isRestricted = true
                //       break
                //     }
                //   }
                // }
                const isDisabled = stage === lead.stage
                
                return (
                  <DropdownMenuItem 
                    key={stage} 
                    onClick={() => handleStageSelect(stage)} 
                    disabled={isDisabled}
                    className={isRestricted ? "opacity-50 cursor-not-allowed" : ""}
                  >
                    Move to {stage}
                    {isRestricted && <span className="ml-2 text-xs text-muted-foreground">(blocat)</span>}
                  </DropdownMenuItem>
                )
              })}
              {itemType === 'service_file' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleNuRaspundeToggle}
                    disabled={isTogglingNuRaspunde}
                    className="text-red-700 focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-950"
                  >
                    <PhoneOff className="h-4 w-4 mr-2" />
                    {nuRaspundeActive ? 'Scoate „Nu raspunde”' : 'Atribuie „Nu raspunde”'}
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={(e) => { e.stopPropagation(); ignoreNextCardClickRef.current = true; setShowDeleteDialog(true) }}
                    className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deleteLabel}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
          )}
        </div>

        {/* RÂND 2 (MIJLOC): status + informațiile lui (w-full) */}
        <div className="w-full">
          {/* Status - Tăvițe cu tehnicieni (Receptie: In lucru, In asteptare, De facturat, Nu raspunde, De trimis, Ridic personal, Arhivat) */}
          {(lead as any).type === 'service_file' && (() => {
            if (!pipelineName) return true
            const normalized = pipelineName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            return normalized.includes('receptie')
          })() && (lead as any).traysInLucru && (lead as any).traysInLucru.length > 0 && (
            <div className="space-y-1 w-full">
              {(Array.isArray((lead as any)?.traysInLucru) ? (lead as any).traysInLucru : []).map((trayInfo: any, idx: number) => {
                const qc = trayInfo?.qcValidated as (boolean | null | undefined)
                const qcColorClass =
                  qc === true ? "text-green-600" : qc === false ? "text-red-600" : "text-purple-600"
                const wrongPipeline = isInColetAjunsStage && trayStatus === 'purple' && trayDetails?.find((t: any) => t.status === 'wrong_pipeline' && t.currentPipelineDisplay && (String(t.trayNumber) === String(trayInfo.trayNumber)))?.currentPipelineDisplay
                const trayLabel = trayInfo.trayNumber
                  ? `#${trayInfo.trayNumber}${trayInfo.traySize ? ` ${formatTraySizeDisplay(trayInfo.traySize)}` : ''}${wrongPipeline ? ` → ${wrongPipeline}` : ''}`
                  : '—'
                return (
                  <div key={idx} className="text-xs flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground font-medium">
                      {trayLabel}
                    </span>
                    
                    {/* Iconuri pentru status */}
                        {trayInfo.status === 'finalizare' && (
                      <>
                        <CheckCircle2 className={`h-3.5 w-3.5 ${qcColorClass} flex-shrink-0`} />
                        {trayInfo.technician && (
                          <span className={`font-semibold ${qcColorClass}`}>{trayInfo.technician}</span>
                        )}
                        {trayInfo.department && (
                          <span className={`${qcColorClass} flex-shrink-0`}>
                            {getDepartmentIcon(trayInfo.department)}
                          </span>
                        )}
                      </>
                    )}
                    
                    {trayInfo.status === 'in_lucru' && (
                      <>
                        {trayInfo.technician ? (
                          <>
                            <Circle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                            <span className="font-semibold text-red-600">{trayInfo.technician}</span>
                          </>
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                        {trayInfo.department && (
                          <>
                            <span className="text-red-600 flex-shrink-0">
                              {getDepartmentIcon(trayInfo.department)}
                            </span>
                            
                          </>
                        )}
                      </>
                    )}
                    
                    {trayInfo.status === 'in_asteptare' && (
                      <>
                        {trayInfo.technician ? (
                          <>
                            <Circle className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0" />
                            <span className="font-semibold text-yellow-600">{trayInfo.technician}</span>
                          </>
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                        {trayInfo.department && (
                          <>
                            <span className="text-yellow-600 flex-shrink-0">
                              {getDepartmentIcon(trayInfo.department)}
                            </span>
                            
                          </>
                        )}
                      </>
                    )}
                    
                    {trayInfo.status === 'noua' && (
                      <>
                        {trayInfo.technician ? (
                          <>
                            <Circle className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                            <span className="font-semibold text-blue-600">{trayInfo.technician}</span>
                          </>
                        ) : (
                          <>
                          <Circle className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <span className="font-semibold text-slate-400">No Teh.</span>
                          </>
                        )}
                        {trayInfo.department && (
                          <>
                            <span className="text-slate-400 flex-shrink-0">
                              {getDepartmentIcon(trayInfo.department)}
                            </span>
                            
                          </>
                        )}
                      </>
                    )}
                    
                    {/* Pentru tăvițe fără status definit dar cu tehnician */}
                    {!trayInfo.status && trayInfo.technician && (
                      <>
                        <Circle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                        <span className="font-semibold text-red-600">{trayInfo.technician}</span>
                      </>
                    )}
                    
                    {/* Pentru tăvițe neatribuite (fără status și fără tehnician) */}
                    {!trayInfo.status && !trayInfo.technician && (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    )}

                    {/* Timp de execuție: IN_LUCRU -> FINALIZARE (ex: 2h 34min) */}
                    {trayInfo.executionTime && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>Execuție: {trayInfo.executionTime}</span>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* RÂND 4 (JOS): dată + tag-uri + total (dacă e cazul) - HIDDEN pentru Vânzări */}
        {(!pipelineName || !pipelineName.toLowerCase().includes('vanzari')) && (
          <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            {(lead.createdAt || isFollowUpInLeaduri || (lead as any).qcValidatedAt) && (
              <div className="space-y-0.5">
                {isFollowUpInLeaduri && (followUpOra || lead.createdAt) ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {format(new Date(followUpOra || lead.createdAt!), 'HH:mm', { locale: ro })}
                  </p>
                ) : (lead as any).qcValidatedAt ? (
                  <p className="text-xs text-muted-foreground truncate" title="Data validării Quality Check">
                    {formatSmartDate(new Date((lead as any).qcValidatedAt))}
                  </p>
                ) : lead.createdAt ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {formatSmartDate(new Date(lead.createdAt))}
                  </p>
                ) : null}
                
                {timeInStage && (
                  <p className="text-xs text-orange-600 font-medium truncate">
                    {timeInStage.label}: {timeInStage.timeText}
                  </p>
                )}

                {/* Timp total "la noi" (de la repartizare pe departamente până la RIDICAT) */}
                {(lead as any).timeAtUsText && (
                  <p className="text-xs text-muted-foreground truncate">
                    La noi: <span className="font-semibold">{(lead as any).timeAtUsText}</span>
                    {(lead as any).timeAtUsDone ? <span className="text-muted-foreground"> (ridicat)</span> : <span className="text-muted-foreground"> (în curs)</span>}
                  </p>
                )}
              </div>
            )}
            
            {(() => {
                let displayedTags = !shouldHideTriggersAndTags
                  ? (Array.isArray(lead?.tags) ? lead.tags : []).filter(tag => !isTagHiddenFromUI(tag?.name))
                  : [] // NO DEAL: nu afișăm niciun tag
                // Mută RETUR la final (pentru a nu apărea primul)
                const returTag = displayedTags.find(tag => tag.name === 'RETUR')
                if (returTag) {
                  displayedTags = displayedTags.filter(tag => tag.name !== 'RETUR')
                  displayedTags.push(returTag)
                }
                return displayedTags.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {displayedTags.map(tag => {
                  const isUrgent = tag.name.toLowerCase() === 'urgent'
                  const isRetur = tag.name === 'RETUR'
                  const isNuRaspunde = canonicalTag(tag.name) === 'nuraspunde'
                  const isSuna = canonicalTag(tag.name) === 'suna' || tag.name === 'Suna!'
                  const isUrgentOrRetur = isUrgent || isRetur

                  // Tag "Suna!" – afișat cu X pentru eliminare (după expirarea termenului Call back / Nu răspunde)
                  if (isSuna && leadIdForTags && itemType === 'lead') {
                    return (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="bg-red-600 text-white border-red-600 dark:bg-red-500 dark:border-red-500 text-[10px] px-1.5 py-0.5 cursor-pointer hover:bg-red-700 hover:opacity-90 transition-opacity inline-flex items-center gap-0.5"
                        onClick={async (e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          ignoreNextCardClickRef.current = true
                          setIsSavingSunaDismiss(true)
                          try {
                            await logLeadEvent(leadIdForDb, "Tag Sună! eliminat de pe card.", "suna_tag_eliminated", { tag_name: "Suna!" })
                            setSunaDismissed(true)
                            const { error: updateErr } = await updateLead(leadIdForDb, { suna_acknowledged_at: new Date().toISOString() })
                            if (updateErr) console.warn('[LeadCard] suna_acknowledged_at update failed:', updateErr)
                            await toggleLeadTag(leadIdForTags, tag.id)
                            const currentTags = Array.isArray(lead?.tags) ? lead.tags : []
                            onTagsChange?.(lead.id, (currentTags as any[]).filter((t: any) => t.id !== tag.id))
                          } catch (err: any) {
                            toast({ variant: 'destructive', title: 'Eroare', description: err?.message ?? 'Nu s-a putut elimina eticheta.' })
                          } finally {
                            setIsSavingSunaDismiss(false)
                          }
                        }}
                        title="Click pentru a elimina eticheta Suna!"
                      >
                        {tag.name} ×
                      </Badge>
                    )
                  }

                  // Tag "Nu raspunde" – clickabil pentru a-l scoate (doar pe fișe de serviciu)
                  if (isNuRaspunde && itemType === 'service_file') {
                    return (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="bg-red-600 text-white border-red-600 text-[10px] px-1.5 py-0.5 cursor-pointer hover:bg-red-700 hover:opacity-90 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNuRaspundeToggle(e)
                        }}
                        title="Click pentru a scoate tag-ul Nu raspunde"
                      >
                        {tag.name} ×
                      </Badge>
                    )
                  }
                  
                  if (isDepartmentTag(tag.name)) {
                    return (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className={getDepartmentBadgeStyle(tag.name) + " text-[10px] px-1.5 py-0.5"}
                      >
                        {getDepartmentIcon(tag.name)}
                        {tag.name}
                      </Badge>
                    )
                  }
                  return (
                    <Badge 
                      key={tag.id} 
                      variant="outline" 
                      className={`${tagClass(tag.color)} text-[10px] px-1.5 py-0.5`}
                    >
                      {tag.name}
                    </Badge>
                  )
                })}
              </div>
                ) : null
              })()}
          </div>

          {/* Afișează totalul pentru toate tipurile (lead, fișă, tăviță) în toate pipeline-urile, inclusiv Vânzări */}
          {(() => {
            const total = typeof leadTotal === 'number' ? leadTotal : 0
            return (
              <div className="text-xs font-medium text-muted-foreground flex-shrink-0">
                {total > 0 ? (
                  <span className="bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 px-2 py-1 rounded text-xs font-semibold" title="Total tăvițe / servicii">
                    Total: {total.toFixed(2)} RON
                  </span>
                ) : (
                  <span className="text-muted-foreground" title="Fără tăvițe sau total 0">
                    Total: 0.00 RON
                  </span>
                )}
              </div>
            )
          })()}
        </div>
      )}
      </div>

      {/* Overlay Callback: selectare dată/oră, Anulează / Confirmă. La confirmare: salvează callback_date, mută în Call Back, refresh. */}
      {pipelineName && pipelineName.toLowerCase().includes('vanzari') && !((lead as any).type === 'tray') && !((lead as any).type === 'service_file') && !lead.isQuote && (
        <CallbackDialog
          open={showCallbackDialog}
          onOpenChange={setShowCallbackDialog}
          onConfirm={async (date: Date, _note?: string) => {
            const leadIdForDb = (lead as any).leadId || lead.id
            setIsSavingCallback(true)
            try {
              const { error } = await updateLead(leadIdForDb, { callback_date: date.toISOString() })
              if (error) {
                toast({ variant: "destructive", title: "Eroare", description: "Nu s-a putut programa callback-ul." })
                return
              }
              logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardCallbackConfirmButton', buttonLabel: 'Callback confirmat', actorOption }).catch(() => {})
              const callBackStage = stages.find(s => /call\s*back|callback/i.test(s)) ?? "Call Back"
              onMove(lead.id, callBackStage)
              setShowCallbackDialog(false)
              toast({
                title: "Callback programat",
                description: `Lead mutat în ${callBackStage}. Data: ${format(date, "dd MMM yyyy, HH:mm", { locale: ro })}`,
              })
            } catch (err: any) {
              toast({ variant: "destructive", title: "Eroare", description: err?.message ?? "Nu s-a putut programa callback-ul." })
            } finally {
              setIsSavingCallback(false)
            }
          }}
          leadName={lead.name}
          leadPhone={lead.phone ?? undefined}
        />
      )}

      {/* Overlay Nu răspunde: oră/minut, Anulează / Confirmă. La confirmare: salvează nu_raspunde_callback_at, mută în Nu răspunde, refresh. */}
      {pipelineName && pipelineName.toLowerCase().includes('vanzari') && !((lead as any).type === 'tray') && !((lead as any).type === 'service_file') && !lead.isQuote && (
        <NuRaspundeDialog
          open={showNuRaspundeDialog}
          onOpenChange={setShowNuRaspundeDialog}
          onConfirm={async (timeStr: string) => {
            const base = new Date()
            const [y, m, d] = [base.getFullYear(), base.getMonth(), base.getDate()]
            const [hh, mm] = [parseInt(timeStr.slice(0, 2), 10), parseInt(timeStr.slice(3, 5), 10)]
            let target = new Date(y, m, d, hh, mm, 0, 0)
            if (target.getTime() <= base.getTime()) target = new Date(target.getTime() + 24 * 60 * 60 * 1000)
            setIsSavingNuRaspunde(true)
            try {
              const { error } = await updateLead(leadIdForDb, { nu_raspunde_callback_at: target.toISOString() })
              if (error) {
                toast({ variant: "destructive", title: "Eroare", description: "Nu s-a putut programa Nu răspunde." })
                return
              }
              logButtonEvent({ leadId: leadIdForDb, buttonId: 'vanzariCardNuRaspundeConfirmButton', buttonLabel: 'Nu răspunde confirmat', actorOption }).catch(() => {})
              const nuRaspundeStage = stages.find(s => /nu\s*raspunde|nuraspunde/i.test(s)) ?? "Nu răspunde"
              onMove(lead.id, nuRaspundeStage)
              setShowNuRaspundeDialog(false)
              toast({
                title: "Nu răspunde programat",
                description: `Lead mutat în ${nuRaspundeStage}. Reapel: ${format(target, "dd MMM yyyy, HH:mm", { locale: ro })}`,
              })
            } catch (err: any) {
              toast({ variant: "destructive", title: "Eroare", description: err?.message ?? "Nu s-a putut programa." })
            } finally {
              setIsSavingNuRaspunde(false)
            }
          }}
          leadName={lead.name}
        />
      )}

      {/* Overlay Livrare: dată, oră, Office direct / Curier trimis, urgent/retur, Confirmă salvează tot */}
      {pipelineName && pipelineName.toLowerCase().includes('vanzari') && !((lead as any).type === 'tray') && !lead.isQuote && (
        <Dialog open={showDeliveryOverlay} onOpenChange={(open) => { setShowDeliveryOverlay(open); if (!open) { setDeliveryDate(new Date().toISOString().slice(0, 10)); setDeliveryTime('10:00'); setDeliveryType('curier_trimis'); setDeliveryUrgent(false); setDeliveryRetur(false) } }}>
          <DialogContent className="sm:max-w-[400px]" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-violet-600" />
                Livrare
              </DialogTitle>
              <DialogDescription>
                Alege data și ora, apoi tipul de livrare (Office direct sau Curier trimis).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="delivery-date">Data</Label>
                  <Input
                    id="delivery-date"
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-time">Ora</Label>
                  <Input
                    id="delivery-time"
                    type="time"
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tip livrare</Label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="delivery-type"
                      checked={deliveryType === 'curier_trimis'}
                      onChange={() => setDeliveryType('curier_trimis')}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium">Curier trimis</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="delivery-type"
                      checked={deliveryType === 'office_direct'}
                      onChange={() => setDeliveryType('office_direct')}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium">Office direct</span>
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    id="delivery-urgent"
                    type="checkbox"
                    checked={deliveryUrgent}
                    onChange={(e) => setDeliveryUrgent(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="delivery-urgent" className="text-sm font-medium cursor-pointer">Marchează ca urgent</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="delivery-retur"
                    type="checkbox"
                    checked={deliveryRetur}
                    onChange={(e) => setDeliveryRetur(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="delivery-retur" className="text-sm font-medium cursor-pointer">Marchează ca retur</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleDeliveryConfirm()} disabled={isSavingDelivery}>
                {isSavingDelivery ? "Se salvează..." : "Confirmă"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog editare detalii comunicate de client (notițe salvate în lead.details) */}
      <Dialog open={showDetailsEditDialog} onOpenChange={setShowDetailsEditDialog}>
        <DialogContent className="sm:max-w-[500px]" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Detaliile comunicate de client</DialogTitle>
            <DialogDescription>
              Adaugă sau editează notițe. Modificările se salvează în detalii lead.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={detailsEditValue}
              onChange={(e) => setDetailsEditValue(e.target.value)}
              placeholder="Introdu notițe sau detalii comunicate de client..."
              className="min-h-[180px] resize-y text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsEditDialog(false)} disabled={isSavingDetails}>
              Anulează
            </Button>
            <Button
              disabled={isSavingDetails}
              onClick={async () => {
                setIsSavingDetails(true)
                try {
                  const { error } = await updateLead(leadIdForDb, { details: detailsEditValue || null })
                  if (error) {
                    toast({ variant: "destructive", title: "Eroare", description: (error as Error)?.message ?? "Nu s-a putut salva." })
                    return
                  }
                  setLocalDetailsOverride(detailsEditValue || null)
                  toast({ title: "Salvat", description: "Detaliile au fost actualizate." })
                  setShowDetailsEditDialog(false)
                } catch (err: any) {
                  toast({ variant: "destructive", title: "Eroare", description: err?.message ?? "Nu s-a putut salva." })
                } finally {
                  setIsSavingDetails(false)
                }
              }}
            >
              {isSavingDetails ? "Se salvează..." : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmare pentru ștergere (lead / fișă / tăviță în funcție de pipeline) */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {itemType === 'tray' && 'Ești sigur că vrei să ștergi această tăviță?'}
              {itemType === 'service_file' && 'Ești sigur că vrei să ștergi această fișă de serviciu?'}
              {itemType === 'lead' && 'Ești sigur că vrei să ștergi acest lead?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itemType === 'tray' && (
                <>Tăvița și toate item-urile din ea vor fi șterse permanent. <strong className="text-red-600">Ireversibil.</strong></>
              )}
              {itemType === 'service_file' && (
                <>Fișa de serviciu și toate tăvițele ei vor fi șterse. Lead-ul rămâne. <strong className="text-red-600">Ireversibil.</strong></>
              )}
              {itemType === 'lead' && (
                <>
                  Lead-ul "{lead.name}" și toate datele asociate (fișe, tăvițe, tag-uri, istoric) vor fi șterse permanent.
                  <strong className="text-red-600 block mt-2">Ireversibil.</strong>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Anulează</AlertDialogCancel>
            <AlertDialogAction
              onClick={(async () => {
                setIsDeleting(true)
                try {
                  if (itemType === 'lead') {
                    const leadId = leadAny?.leadId || lead.id
                    const { success, error } = await deleteLead(leadId)
                    if (success) {
                      toast({ title: "Lead șters", description: `Lead-ul "${lead.name}" a fost șters.` })
                      setShowDeleteDialog(false)
                      onRefresh?.()
                      // Declanșează eveniment pentru actualizarea rezultatelor de căutare
                      window.dispatchEvent(new CustomEvent('lead:deleted', { detail: { leadId } }))
                      window.dispatchEvent(new Event('refresh'))
                    } else throw error || new Error('Eroare la ștergerea lead-ului')
                  } else if (itemType === 'service_file') {
                    const { success, error } = await deleteServiceFile(lead.id)
                    if (success) {
                      toast({ title: "Fișă ștearsă", description: "Fișa de serviciu a fost ștearsă." })
                      setShowDeleteDialog(false)
                      onRefresh?.()
                      // Declanșează eveniment pentru actualizarea rezultatelor de căutare
                      window.dispatchEvent(new CustomEvent('service_file:deleted', { detail: { serviceFileId: lead.id } }))
                      window.dispatchEvent(new Event('refresh'))
                    } else throw error || new Error('Eroare la ștergerea fișei')
                  } else {
                    const { success, error } = await deleteTray(lead.id)
                    if (success) {
                      toast({ title: "Tăviță ștearsă", description: "Tăvița a fost ștearsă." })
                      setShowDeleteDialog(false)
                      onRefresh?.()
                      // Declanșează eveniment pentru actualizarea rezultatelor de căutare
                      window.dispatchEvent(new CustomEvent('tray:deleted', { detail: { trayId: lead.id } }))
                      window.dispatchEvent(new Event('refresh'))
                    } else throw error || new Error('Eroare la ștergerea tăviței')
                  }
                } catch (error: any) {
                  console.error('Eroare la ștergere:', error)
                  toast({ variant: "destructive", title: "Eroare", description: error?.message || "A apărut o eroare la ștergere." })
                } finally {
                  setIsDeleting(false)
                }
              })}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? "Se șterge..." : "Șterge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}