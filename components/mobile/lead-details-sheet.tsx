'use client'

import { useState, useEffect, useRef } from 'react'
import { KanbanLead } from '@/lib/types/database'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Mail, Phone, Clock, Tag, FileText, Package, User, Loader2, Wrench, ExternalLink, CheckCircle, Plus, Trash2, Pencil, Save, X as XIcon, MessageSquare, ImagePlus, Image as ImageIcon, Download, Camera, ChevronDown, ChevronRight, CalendarDays, PhoneOff, Users, Star, StarOff } from 'lucide-react'
import { formatDistanceToNow, addDays, addWeeks, addMonths, format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { cn, formatCallbackDateDisplay } from '@/lib/utils'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { listServiceFilesForLead, listTraysForServiceFile, listTrayItemsForTray, updateTrayItem, updateTray, type TrayItem } from '@/lib/supabase/serviceFileOperations'
import { parseServiceFileDetails } from '@/lib/utils/serviceFileDetails'
import { uploadTrayImage, deleteTrayImage, listTrayImages, saveTrayImageReference, deleteTrayImageReference, type TrayImage } from '@/lib/supabase/imageOperations'
import { moveItemToStage } from '@/lib/supabase/pipelineOperations'
import { startWorkSession } from '@/lib/supabase/workSessionOperations'
import { logTrayItemChange, logLeadEvent, updateLeadWithHistory, getTrayDetails, logItemEvent, getPipelineStageDetails, logTrayImageAdded, logTrayImageDeleted } from '@/lib/supabase/leadOperations'
import { toggleLeadTag } from '@/lib/supabase/tagOperations'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { toast } from 'sonner'
import { useMemo, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import LeadMessenger from '@/components/leads/lead-messenger'
import { useTechnicians } from '@/hooks/queries/use-technicians'
import { usePipelinesCache } from '@/hooks/usePipelinesCache'
import { splitTrayToRealTrays, splitTrayItemsToTechnician, getServiceFile, appendTechnicianDetail } from '@/lib/supabase/serviceFileOperations'
import type { TechnicianDetailEntry } from '@/lib/supabase/serviceFileOperations'
import { LeadTechnicianDetailsSection } from '@/components/lead-details/sections'
import { SplitTrayToRealTraysDialog } from '@/components/preturi/dialogs/SplitTrayToRealTraysDialog'
import { SplitTrayTechnicianDialog } from '@/components/preturi/dialogs/SplitTrayTechnicianDialog'
import { SPLIT_TRAY_FEATURE_ENABLED } from '@/lib/preturiFeatureFlags'

const supabase = supabaseBrowser()
const toSlug = (s: string) => String(s).toLowerCase().replace(/\s+/g, '-')

interface ServiceFile {
  id: string
  number: string
  status: string
  date: string
}

interface Tray {
  id: string
  number: string
  status: string
  service_file_id: string
}

interface LeadDetailsSheetProps {
  lead: KanbanLead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onMove?: () => void
  onEdit?: () => void
  pipelineSlug?: string
  overridePipelineSlug?: string | null
  stages?: string[]
  onStageChange?: (leadId: string, newStage: string) => void
  /** Actualizare optimistă a board-ului după acțiune rapidă (tray departament) – fără refresh. */
  onItemStageUpdated?: (itemId: string, stageName: string, stageId: string) => void
}

export function LeadDetailsSheet({
  lead,
  open,
  onOpenChange,
  onMove,
  onEdit,
  pipelineSlug,
  overridePipelineSlug,
  stages = [],
  onStageChange,
  onItemStageUpdated,
}: LeadDetailsSheetProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [serviceFiles, setServiceFiles] = useState<ServiceFile[]>([])
  const [trays, setTrays] = useState<Tray[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [isTechnician, setIsTechnician] = useState(false)

  const effectivePipelineSlug = overridePipelineSlug ?? pipelineSlug

  // Salvare în istoric o singură dată per deschidere a sheet-ului pentru acel lead
  const lastLoggedOpenLeadIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open) {
      lastLoggedOpenLeadIdRef.current = null
      return
    }
    if (!lead) return
    const leadId = (lead as any).leadId ?? (lead as any).lead_id ?? (lead as any).id
    if (!leadId || typeof leadId !== 'string') return
    if (lastLoggedOpenLeadIdRef.current === leadId) return
    lastLoggedOpenLeadIdRef.current = leadId
    logLeadEvent(leadId, 'Detalii lead deschise', 'lead_details_opened', { source: 'mobile_sheet' }).catch(() => {})
  }, [open, lead?.id, (lead as any)?.leadId])

  // Verifică dacă suntem în pipeline-ul Vanzari
  const isVanzariPipeline = useMemo(() => {
    if (!effectivePipelineSlug) return false
    return effectivePipelineSlug.toLowerCase().includes('vanzari') || effectivePipelineSlug.toLowerCase().includes('sales')
  }, [effectivePipelineSlug])
  
  // State pentru tab-ul "Fișă" (pentru tehnicieni)
  const [trayItems, setTrayItems] = useState<TrayItem[]>([])
  const [loadingTrayItems, setLoadingTrayItems] = useState(false)
  const [services, setServices] = useState<Array<{ id: string; name: string; price: number; instrument_id: string | null }>>([])
  const [instruments, setInstruments] = useState<Array<{ id: string; name: string; department_id?: string | null }>>([])
  const [parts, setParts] = useState<Array<{ id: string; name: string; price: number }>>([])
  const [editingItem, setEditingItem] = useState<string | null>(null)
  /** ID-ul item-ului în curs de salvare (pentru a evita dubla apăsare și a bloca Anulează până la final). */
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{
    qty?: number
    discount_pct?: number
    urgent?: boolean
    price?: number
    unrepaired_qty?: number
    garantie?: boolean
    serials?: string
  }>({})
  
  // State pentru tab activ (ca să ascundem FAB-ul pe Mesagerie și să nu acopere butonul Trimite)
  const [activeTab, setActiveTab] = useState('info')
  // State pentru dialoguri împărțire tăviță (mobil)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitRealOpen, setSplitRealOpen] = useState(false)
  const [trayItemsRefreshKey, setTrayItemsRefreshKey] = useState(0)
  
  // State pentru dialog-uri de adăugare
  const [addServiceOpen, setAddServiceOpen] = useState(false)
  const [addPartOpen, setAddPartOpen] = useState(false)
  const [newService, setNewService] = useState({ service_id: '', qty: 1 })
  const [newPart, setNewPart] = useState({ part_id: '', qty: 1 })
  
  // State pentru imagini tăviță
  const [trayImages, setTrayImages] = useState<TrayImage[]>([])
  const [assignedImageId, setAssignedImageId] = useState<string | null>(null)
  const [editingTrayId, setEditingTrayId] = useState<string | null>(null)
  const [editTrayNumber, setEditTrayNumber] = useState('')
  const [savingTrayEdit, setSavingTrayEdit] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [loadingImages, setLoadingImages] = useState(false)
  const [assigningImageId, setAssigningImageId] = useState<string | null>(null)
  
  // State pentru detalii fișă client (nu mai per tăviță)
  const [trayDetails, setTrayDetails] = useState<string>('')
  const [loadingTrayDetails, setLoadingTrayDetails] = useState(false)
  const [savingTrayDetails, setSavingTrayDetails] = useState(false)
  
  // State pentru informații tăviță
  const [trayInfo, setTrayInfo] = useState<{ number?: string; status?: string } | null>(null)
  
  const [isDetailsOpen, setIsDetailsOpen] = useState(true)
  const [isContactOpen, setIsContactOpen] = useState(true)
  const [isTechnicianDetailsOpen, setIsTechnicianDetailsOpen] = useState(true)
  const [technicianDetails, setTechnicianDetails] = useState<TechnicianDetailEntry[]>([])
  const [loadingTechnicianDetails, setLoadingTechnicianDetails] = useState(false)
  const [savingTechnicianDetails, setSavingTechnicianDetails] = useState(false)
  
  // State pentru callback Vânzări
  const [callbackCalendarOpen, setCallbackCalendarOpen] = useState(false)
  const [callbackLoading, setCallbackLoading] = useState(false)
  const [callbackHour, setCallbackHour] = useState('09')
  const [callbackMinute, setCallbackMinute] = useState('00')
  type CallbackOpt = 'tomorrow' | '3days' | 'week' | 'month' | '3months' | 'custom'
  const [callbackPendingOption, setCallbackPendingOption] = useState<CallbackOpt | null>(null)
  const [callbackSelectedDate, setCallbackSelectedDate] = useState<Date | undefined>(undefined)

  const callbackHours = Array.from({ length: 11 }, (_, i) => String(i + 8).padStart(2, '0'))
  const callbackMinutes = ['00', '15', '30', '45']

  const applyCallbackTime = useCallback((date: Date) => {
    const d = new Date(date)
    d.setHours(parseInt(callbackHour, 10), parseInt(callbackMinute, 10), 0, 0)
    return d
  }, [callbackHour, callbackMinute])

  // Verificări pentru pipeline-uri departament
  const isDepartmentPipeline = useMemo(() => {
    if (!effectivePipelineSlug) return false
    const slug = effectivePipelineSlug.toLowerCase()
    return slug === 'saloane' || slug === 'frizerii' || slug === 'horeca' || slug === 'reparatii'
  }, [effectivePipelineSlug])

  const isReparatiiPipeline = useMemo(() => {
    if (!effectivePipelineSlug) return false
    return effectivePipelineSlug.toLowerCase() === 'reparatii'
  }, [effectivePipelineSlug])

  const isSaloaneHorecaFrizeriiPipeline = useMemo(() => {
    if (!effectivePipelineSlug) return false
    const slug = effectivePipelineSlug.toLowerCase()
    return slug === 'saloane' || slug === 'frizerii' || slug === 'horeca'
  }, [effectivePipelineSlug])

  const isReceptiePipeline = useMemo(() => {
    if (!effectivePipelineSlug) return false
    return effectivePipelineSlug.toLowerCase().includes('receptie') || effectivePipelineSlug.toLowerCase().includes('reception')
  }, [effectivePipelineSlug])

  const { data: techniciansData } = useTechnicians()
  const techniciansForSplit = useMemo(() => {
    const list = techniciansData || []
    return list.map((t: { user_id: string; name: string | null }) => ({ id: t.user_id, name: t.name || `User ${t.user_id.slice(0, 8)}` }))
  }, [techniciansData])

  const { getPipelines } = usePipelinesCache()
  const [pipelinesWithIds, setPipelinesWithIds] = useState<Array<{ id: string; name: string }>>([])
  useEffect(() => {
    if (!open) return
    getPipelines().then((data: any[]) => {
      if (Array.isArray(data)) setPipelinesWithIds(data.map((p: any) => ({ id: p.id, name: p.name })))
    }).catch(() => setPipelinesWithIds([]))
  }, [open, getPipelines])

  const pipelineIdForTray = useMemo(() => {
    const leadAny = lead as any
    if (leadAny?.pipelineId) return leadAny.pipelineId
    const slug = effectivePipelineSlug ? toSlug(effectivePipelineSlug) : ''
    const found = pipelinesWithIds.find(p => toSlug(p.name) === slug)
    return found?.id ?? null
  }, [lead, effectivePipelineSlug, pipelinesWithIds])
  
  // Persistă tab-ul în sessionStorage ca la revenire din cameră (remount) să rămâi în Mesagerie
  const SHEET_TAB_KEY = 'leadDetailsSheetTab'
  const SHEET_OPEN_FLAG_KEY = 'leadDetailsSheetWasOpen'
  useEffect(() => {
    if (typeof window !== 'undefined' && activeTab) {
      try { window.sessionStorage.setItem(SHEET_TAB_KEY, activeTab) } catch (_) {}
    }
  }, [activeTab])

  // La deschiderea sheet-ului (trecere din închis → deschis) resetează tab-ul la Info.
  // Când revii din cameră, componenta poate remonta – păstrăm tab-ul din sessionStorage.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (!open) {
        window.sessionStorage.setItem(SHEET_OPEN_FLAG_KEY, 'false')
        return
      }
      const wasOpen = window.sessionStorage.getItem(SHEET_OPEN_FLAG_KEY)
      window.sessionStorage.setItem(SHEET_OPEN_FLAG_KEY, 'true')
      if (wasOpen === 'false' || !wasOpen) {
        setActiveTab('info')
      } else {
        const stored = window.sessionStorage.getItem(SHEET_TAB_KEY)
        if (stored && ['info', 'files', 'messaging'].includes(stored)) setActiveTab(stored)
      }
    } catch (_) {}
  }, [open])
  
  // Pentru Receptie mobil: prima tăviță a primei fișe (card fișă + o singură opțiune atașare imagini)
  const [receptieTrayId, setReceptieTrayId] = useState<string | null>(null)
  const [receptieTrayInfo, setReceptieTrayInfo] = useState<{ number?: string; status?: string } | null>(null)
  const [receptieFile, setReceptieFile] = useState<ServiceFile | null>(null)
  
  // Verifică dacă utilizatorul este tehnician
  useEffect(() => {
    async function checkTechnician() {
      if (!user?.id) {
        setIsTechnician(false)
        return
      }
      const { data } = await supabase
        .from('app_members')
        .select('user_id, role')
        .eq('user_id', user.id)
        .single()
      
      setIsTechnician(!!data && (data as any).role !== 'owner' && (data as any).role !== 'admin')
    }
    checkTechnician()
  }, [user])
  
  const handleOpenTray = useCallback(async (trayId: string) => {
    const details = await getTrayDetails(trayId)
    if (!details?.id) {
      toast.error('Tăvița nu mai există (posibil arhivată). Conținutul a fost mutat în arhivă.')
      return
    }
    router.push(`/tehnician/tray/${trayId}`)
    onOpenChange(false) // Închide sheet-ul
  }, [router, onOpenChange])

  const openEditTray = useCallback((trayId: string, currentNumber: string) => {
    setEditingTrayId(trayId)
    setEditTrayNumber(currentNumber || '')
  }, [])

  const handleSaveTrayEdit = useCallback(async () => {
    if (!editingTrayId || !editTrayNumber.trim()) return
    setSavingTrayEdit(true)
    try {
      const { error } = await updateTray(editingTrayId, { number: editTrayNumber.trim() })
      if (error) throw error
      setEditingTrayId(null)
      toast.success('Numărul tăviței a fost actualizat')
      const newNumber = editTrayNumber.trim()
      setTrays(prev => prev.map(t => t.id === editingTrayId ? { ...t, number: newNumber } : t))
      const leadAny = lead as any
      const viewedTrayId = leadAny?.type === 'tray' ? (leadAny.realTrayId || leadAny.id) : null
      setTrayInfo(prev => prev && viewedTrayId === editingTrayId ? { ...prev, number: newNumber } : prev)
      setReceptieTrayInfo(prev => prev && receptieTrayId === editingTrayId ? { ...prev, number: newNumber } : prev)
    } catch (e: any) {
      toast.error(e?.message || 'Eroare la actualizarea tăviței')
    } finally {
      setSavingTrayEdit(false)
    }
  }, [editingTrayId, editTrayNumber, receptieTrayId, lead])

  // Obține leadId - poate fi lead.id sau lead.leadId
  // IMPORTANT: Pentru service_file și tray, NU returnăm lead.id ca fallback 
  // deoarece ar fi ID-ul fișei de serviciu, nu al lead-ului
  const getLeadId = () => {
    if (!lead) return null
    const leadAny = lead as any
    // Pentru service_file sau tray, folosim doar leadId din relație
    if (leadAny?.type === 'service_file' || leadAny?.type === 'tray') {
      return leadAny.leadId || null
    }
    // Pentru lead-uri normale, lead.leadId sau lead.id
    return lead.leadId || lead.id
  }

  // Handler pentru butonul "Finalizare"
  const handleFinalizare = useCallback(async () => {
    if (!lead) return
    const leadAny = lead as any
    
    const finalizareStage = stages.find(s => s.toUpperCase() === 'FINALIZATA')
    
    if (!finalizareStage) {
      toast.error('Stage-ul FINALIZATA nu există în acest pipeline')
      return
    }

    if (isDepartmentPipeline && leadAny?.type === 'tray' && leadAny?.pipelineId) {
      try {
        const { data: stageData, error: stageError } = await supabase
          .from('stages')
          .select('id')
          .eq('pipeline_id', leadAny.pipelineId)
          .eq('name', finalizareStage)
          .single()
        
        if (stageError || !stageData) {
          console.error('Error finding stage:', stageError, 'Looking for:', finalizareStage)
          toast.error('Nu s-a putut găsi stage-ul în baza de date')
          return
        }

        const { error } = await moveItemToStage(
          'tray',
          leadAny.id,
          leadAny.pipelineId,
          (stageData as any).id,
          leadAny.stageId
        )
        
        if (error) {
          toast.error('Eroare la mutarea cardului')
          console.error('Error moving to Finalizare:', error)
          return
        }
        
        toast.success('Card mutat în FINALIZATA')
        // Istoric: stage change (items_events) – pentru membri
        try {
          const trayDetails = await getTrayDetails(leadAny.id)
          const trayLabel = trayDetails
            ? `${trayDetails.number}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
            : 'nesemnată'
          let pipelineNameForLog = leadAny.pipelineName
          if (!pipelineNameForLog && leadAny.pipelineId) {
            const { pipeline } = await getPipelineStageDetails(leadAny.pipelineId, (stageData as any).id)
            pipelineNameForLog = pipeline?.name ?? 'Pipeline necunoscut'
          }
          pipelineNameForLog = pipelineNameForLog || 'Pipeline necunoscut'
          const actorOpt = user
            ? {
                currentUserId: user.id,
                currentUserName: (user as any).email?.split?.('@')[0] ?? null,
                currentUserEmail: (user as any).email ?? null,
              }
            : undefined
          await logItemEvent(
            'tray',
            leadAny.id,
            `Tăvița "${trayLabel}" a fost mutată în stage-ul "${finalizareStage}"`,
            'tray_stage_changed',
            {
              from_stage_id: leadAny.stageId || null,
              to_stage_id: (stageData as any).id,
            },
            {
              tray: trayDetails
                ? {
                    id: trayDetails.id,
                    number: trayDetails.number,
                    status: trayDetails.status,
                    service_file_id: trayDetails.service_file_id,
                  }
                : undefined,
              pipeline: { id: leadAny.pipelineId, name: pipelineNameForLog },
              stage: { id: (stageData as any).id, name: finalizareStage },
              user: user
                ? {
                    id: user.id,
                    name: (user as any).email?.split?.('@')[0] ?? 'user',
                    email: (user as any).email ?? null,
                  }
                : undefined,
            },
            actorOpt
          )
        } catch (_) {}
        onItemStageUpdated?.(leadAny.id, finalizareStage, (stageData as any).id)
        onOpenChange(false)
      } catch (error) {
        console.error('Error moving to Finalizare:', error)
        toast.error('Eroare la mutarea cardului')
      }
    } else if (onStageChange) {
      onStageChange(getLeadId()!, finalizareStage)
      toast.success('Card mutat în FINALIZATA')
    }
  }, [lead, stages, isDepartmentPipeline, onStageChange, onOpenChange, onItemStageUpdated])

  // Handler pentru butonul "Aștept piese" (pentru Reparații)
  const handleAsteptPiese = useCallback(async () => {
    if (!lead) return
    const leadAny = lead as any
    
    const asteptPieseStage = stages.find(s => s.toUpperCase() === 'ASTEPT PIESE')
    
    if (!asteptPieseStage) {
      toast.error('Stage-ul ASTEPT PIESE nu există în acest pipeline')
      return
    }

    if (isDepartmentPipeline && leadAny?.type === 'tray' && leadAny?.pipelineId) {
      try {
        const { data: stageData, error: stageError } = await supabase
          .from('stages')
          .select('id')
          .eq('pipeline_id', leadAny.pipelineId)
          .eq('name', asteptPieseStage)
          .single()
        
        if (stageError || !stageData) {
          console.error('Error finding stage:', stageError, 'Looking for:', asteptPieseStage)
          toast.error('Nu s-a putut găsi stage-ul în baza de date')
          return
        }

        const { error } = await moveItemToStage(
          'tray',
          leadAny.id,
          leadAny.pipelineId,
          (stageData as any).id,
          leadAny.stageId
        )
        
        if (error) {
          toast.error('Eroare la mutarea cardului')
          console.error('Error moving to Astept piese:', error)
          return
        }
        
        toast.success('Card mutat în ASTEPT PIESE')
        // Istoric: stage change (items_events) – pentru membri
        try {
          const trayDetails = await getTrayDetails(leadAny.id)
          const trayLabel = trayDetails
            ? `${trayDetails.number}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
            : 'nesemnată'
          let pipelineNameForLog = leadAny.pipelineName
          if (!pipelineNameForLog && leadAny.pipelineId) {
            const { pipeline } = await getPipelineStageDetails(leadAny.pipelineId, (stageData as any).id)
            pipelineNameForLog = pipeline?.name ?? 'Pipeline necunoscut'
          }
          pipelineNameForLog = pipelineNameForLog || 'Pipeline necunoscut'
          const actorOpt = user
            ? {
                currentUserId: user.id,
                currentUserName: (user as any).email?.split?.('@')[0] ?? null,
                currentUserEmail: (user as any).email ?? null,
              }
            : undefined
          await logItemEvent(
            'tray',
            leadAny.id,
            `Tăvița "${trayLabel}" a fost mutată în stage-ul "${asteptPieseStage}"`,
            'tray_stage_changed',
            {
              from_stage_id: leadAny.stageId || null,
              to_stage_id: (stageData as any).id,
            },
            {
              tray: trayDetails
                ? {
                    id: trayDetails.id,
                    number: trayDetails.number,
                    status: trayDetails.status,
                    service_file_id: trayDetails.service_file_id,
                  }
                : undefined,
              pipeline: { id: leadAny.pipelineId, name: pipelineNameForLog },
              stage: { id: (stageData as any).id, name: asteptPieseStage },
              user: user
                ? {
                    id: user.id,
                    name: (user as any).email?.split?.('@')[0] ?? 'user',
                    email: (user as any).email ?? null,
                  }
                : undefined,
            },
            actorOpt
          )
        } catch (_) {}
        onItemStageUpdated?.(leadAny.id, asteptPieseStage, (stageData as any).id)
        onOpenChange(false)
      } catch (error) {
        console.error('Error moving to Astept piese:', error)
        toast.error('Eroare la mutarea cardului')
      }
    } else if (onStageChange) {
      onStageChange(getLeadId()!, asteptPieseStage)
      toast.success('Card mutat în ASTEPT PIESE')
    }
  }, [lead, stages, isDepartmentPipeline, onStageChange, onOpenChange, onItemStageUpdated])

  // Handler pentru butonul "În așteptare" (pentru Saloane/Horeca/Frizerii)
  const handleInAsteptare = useCallback(async () => {
    if (!lead) return
    const leadAny = lead as any
    
    const inAsteptareStage = stages.find(s => s.toUpperCase() === 'IN ASTEPTARE')
    
    if (!inAsteptareStage) {
      toast.error('Stage-ul IN ASTEPTARE nu există în acest pipeline')
      return
    }

    if (isDepartmentPipeline && leadAny?.type === 'tray' && leadAny?.pipelineId) {
      try {
        const { data: stageData, error: stageError } = await supabase
          .from('stages')
          .select('id')
          .eq('pipeline_id', leadAny.pipelineId)
          .eq('name', inAsteptareStage)
          .single()
        
        if (stageError || !stageData) {
          console.error('Error finding stage:', stageError, 'Looking for:', inAsteptareStage)
          toast.error('Nu s-a putut găsi stage-ul în baza de date')
          return
        }

        const { error } = await moveItemToStage(
          'tray',
          leadAny.id,
          leadAny.pipelineId,
          (stageData as any).id,
          leadAny.stageId
        )
        
        if (error) {
          toast.error('Eroare la mutarea cardului')
          console.error('Error moving to In asteptare:', error)
          return
        }
        
        toast.success('Card mutat în IN ASTEPTARE')
        // Istoric: stage change (items_events) – pentru membri
        try {
          const trayDetails = await getTrayDetails(leadAny.id)
          const trayLabel = trayDetails
            ? `${trayDetails.number}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
            : 'nesemnată'
          let pipelineNameForLog = leadAny.pipelineName
          if (!pipelineNameForLog && leadAny.pipelineId) {
            const { pipeline } = await getPipelineStageDetails(leadAny.pipelineId, (stageData as any).id)
            pipelineNameForLog = pipeline?.name ?? 'Pipeline necunoscut'
          }
          pipelineNameForLog = pipelineNameForLog || 'Pipeline necunoscut'
          const actorOpt = user
            ? {
                currentUserId: user.id,
                currentUserName: (user as any).email?.split?.('@')[0] ?? null,
                currentUserEmail: (user as any).email ?? null,
              }
            : undefined
          await logItemEvent(
            'tray',
            leadAny.id,
            `Tăvița "${trayLabel}" a fost mutată în stage-ul "${inAsteptareStage}"`,
            'tray_stage_changed',
            {
              from_stage_id: leadAny.stageId || null,
              to_stage_id: (stageData as any).id,
            },
            {
              tray: trayDetails
                ? {
                    id: trayDetails.id,
                    number: trayDetails.number,
                    status: trayDetails.status,
                    service_file_id: trayDetails.service_file_id,
                  }
                : undefined,
              pipeline: { id: leadAny.pipelineId, name: pipelineNameForLog },
              stage: { id: (stageData as any).id, name: inAsteptareStage },
              user: user
                ? {
                    id: user.id,
                    name: (user as any).email?.split?.('@')[0] ?? 'user',
                    email: (user as any).email ?? null,
                  }
                : undefined,
            },
            actorOpt
          )
        } catch (_) {}
        onItemStageUpdated?.(leadAny.id, inAsteptareStage, (stageData as any).id)
        onOpenChange(false)
      } catch (error) {
        console.error('Error moving to In asteptare:', error)
        toast.error('Eroare la mutarea cardului')
      }
    } else if (onStageChange) {
      onStageChange(getLeadId()!, inAsteptareStage)
      toast.success('Card mutat în IN ASTEPTARE')
    }
  }, [lead, stages, isDepartmentPipeline, onStageChange, onOpenChange, onItemStageUpdated])

  // Handler pentru butonul "În lucru" (atribuie tăvița utilizatorului curent)
  const handleInLucru = useCallback(async () => {
    if (!lead || !user?.id) return
    const leadAny = lead as any
    
    const inLucruStage = stages.find(s => s.toUpperCase() === 'IN LUCRU')
    
    if (!inLucruStage) {
      toast.error('Stage-ul IN LUCRU nu există în acest pipeline')
      return
    }

    if (isDepartmentPipeline && leadAny?.type === 'tray' && leadAny?.pipelineId) {
      try {
        const { data: stageData, error: stageError } = await supabase
          .from('stages')
          .select('id')
          .eq('pipeline_id', leadAny.pipelineId)
          .eq('name', inLucruStage)
          .single()
        
        if (stageError || !stageData) {
          console.error('Error finding stage:', stageError, 'Looking for:', inLucruStage)
          toast.error('Nu s-a putut găsi stage-ul în baza de date')
          return
        }

        // Verifică dacă tăvița este deja în "IN LUCRU"
        const isAlreadyInLucru = leadAny.stageId === (stageData as any).id || 
          (leadAny.stage || '').toUpperCase() === 'IN LUCRU'

        // Mută în "IN LUCRU" doar dacă nu este deja acolo (pentru a păstra timpul "în lucru")
        if (!isAlreadyInLucru) {
          const { error: moveError } = await moveItemToStage(
            'tray',
            leadAny.id,
            leadAny.pipelineId,
            (stageData as any).id,
            leadAny.stageId
          )
          
          if (moveError) {
            toast.error('Eroare la mutarea cardului')
            console.error('Error moving to In lucru:', moveError)
            return
          }
        } else {
          console.log(`[handleInLucru] Tăvița ${leadAny.id} este deja în IN LUCRU, păstrăm timpul existent`)
        }

        // Atribuie tehnicianul întregii tăvițe (trays.technician_id), nu per serviciu
        const { error: updateTrayError } = await supabase
          .from('trays')
          .update({ technician_id: user.id } as never)
          .eq('id', leadAny.id)
        if (updateTrayError) {
          console.error('Error assigning tray to user:', updateTrayError)
          toast.error('Eroare la atribuirea tăviței')
          return
        }
        console.log(`[handleInLucru] Updated tray ${leadAny.id} with technician_id=${user.id}`)

        // [FOST: atribuire per serviciu – acum tehnicianul se atribuie la nivel de tăviță]
        // const { data: existingItems } = await supabase.from('tray_items').select('id').eq('tray_id', leadAny.id)
        // if (hasItems) {
        //   await supabase.from('tray_items').update({ technician_id: user.id }).eq('tray_id', leadAny.id)
        // } else {
        //   await supabase.from('tray_items').insert({ tray_id: leadAny.id, technician_id: user.id, qty: 1, notes: '...' })
        // }

        // Creează sesiune de lucru pentru calculul precis al timpului
        try {
          const { data: sessionId, error: sessionError } = await startWorkSession(
            leadAny.id,
            user.id,
            `Sesiune pornită la preluare tăviță în In Lucru`
          )
          if (sessionError) {
            console.error('[handleInLucru] Error starting work session:', sessionError)
          } else {
            console.log(`[handleInLucru] Work session started: ${sessionId}`)
          }
        } catch (sessionErr) {
          console.error('[handleInLucru] Error starting work session:', sessionErr)
        }
        
        toast.success('Tăvița a fost atribuită și mutată în IN LUCRU')
        // Istoric: stage change + (opțional) tehnician_assigned (items_events) – pentru membri
        try {
          const trayDetails = await getTrayDetails(leadAny.id)
          const trayLabel = trayDetails
            ? `${trayDetails.number}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
            : 'nesemnată'
          let pipelineNameForLog = leadAny.pipelineName
          if (!pipelineNameForLog && leadAny.pipelineId) {
            const { pipeline } = await getPipelineStageDetails(leadAny.pipelineId, (stageData as any).id)
            pipelineNameForLog = pipeline?.name ?? 'Pipeline necunoscut'
          }
          pipelineNameForLog = pipelineNameForLog || 'Pipeline necunoscut'
          const actorOpt = user
            ? {
                currentUserId: user.id,
                currentUserName: (user as any).email?.split?.('@')[0] ?? null,
                currentUserEmail: (user as any).email ?? null,
              }
            : undefined
          const inLucruActorName = (user as any)?.email?.split?.('@')[0] ?? (user as any)?.name ?? 'Cineva'
          await logItemEvent(
            'tray',
            leadAny.id,
            `${inLucruActorName} a luat tăvița "${trayLabel}" în lucru`,
            'tray_stage_changed',
            {
              from_stage_id: leadAny.stageId || null,
              to_stage_id: (stageData as any).id,
            },
            {
              tray: trayDetails
                ? {
                    id: trayDetails.id,
                    number: trayDetails.number,
                    status: trayDetails.status,
                    service_file_id: trayDetails.service_file_id,
                  }
                : undefined,
              pipeline: { id: leadAny.pipelineId, name: pipelineNameForLog },
              stage: { id: (stageData as any).id, name: inLucruStage },
              user: user
                ? {
                    id: user.id,
                    name: (user as any).email?.split?.('@')[0] ?? 'user',
                    email: (user as any).email ?? null,
                  }
                : undefined,
            },
            actorOpt
          )
          await logItemEvent(
            'tray',
            leadAny.id,
            `Tehnician "${inLucruActorName}" a luat tăvița "${trayLabel}" în lucru`,
            'technician_assigned',
            {},
            {
              tray: trayDetails
                ? {
                    id: trayDetails.id,
                    number: trayDetails.number,
                    status: trayDetails.status,
                    service_file_id: trayDetails.service_file_id,
                  }
                : undefined,
              pipeline: { id: leadAny.pipelineId, name: pipelineNameForLog },
              stage: { id: (stageData as any).id, name: inLucruStage },
              user: user
                ? {
                    id: user.id,
                    name: (user as any).email?.split?.('@')[0] ?? 'user',
                    email: (user as any).email ?? null,
                  }
                : undefined,
            },
            actorOpt
          )
        } catch (_) {}
        onItemStageUpdated?.(leadAny.id, inLucruStage, (stageData as any).id)
        onOpenChange(false)
      } catch (error) {
        console.error('Error moving to In lucru:', error)
        toast.error('Eroare la mutarea cardului')
      }
    } else if (onStageChange) {
      onStageChange(getLeadId()!, inLucruStage)
      toast.success('Card mutat în IN LUCRU')
    }
  }, [lead, stages, isDepartmentPipeline, onStageChange, onOpenChange, onItemStageUpdated, user])

  // Încarcă fișele și tăvițele pentru lead
  useEffect(() => {
    const leadId = getLeadId()
    if (!leadId || !open) {
      setServiceFiles([])
      setTrays([])
      return
    }

    const loadFilesAndTrays = async () => {
      setLoadingFiles(true)
      try {
        // Încarcă fișele de serviciu pentru lead
        const { data: files, error: filesError } = await listServiceFilesForLead(leadId)
        if (filesError) {
          console.error('Eroare la încărcare fișe:', filesError)
          setServiceFiles([])
        } else {
          setServiceFiles(files || [])
          
          // Încarcă tăvițele pentru toate fișele
          if (files && files.length > 0) {
            const allTrays: Tray[] = []
            for (const file of files) {
              const { data: fileTrays, error: traysError } = await listTraysForServiceFile(file.id)
              if (!traysError && fileTrays) {
                allTrays.push(...fileTrays.map((t: any) => ({
                  id: t.id,
                  number: t.number,
                  status: t.status,
                  service_file_id: file.id,
                })))
              }
            }
            setTrays(allTrays)
          } else {
            setTrays([])
          }
        }
      } catch (error) {
        console.error('Eroare la încărcare date:', error)
        setServiceFiles([])
        setTrays([])
      } finally {
        setLoadingFiles(false)
      }
    }

    loadFilesAndTrays()
  }, [lead, open])

  // Informații client (leads.details): inițializare la schimbare lead
  useEffect(() => {
    if (!lead) return
    setTrayDetails(parseServiceFileDetails((lead as any)?.details ?? null))
  }, [lead?.id])

  // Receptie mobil: încarcă prima fișă + prima tăviță, imagini (detalii = lead.details)
  useEffect(() => {
    if (!isReceptiePipeline || !open || !lead || serviceFiles.length === 0 || trays.length === 0) {
      setReceptieTrayId(null)
      setReceptieTrayInfo(null)
      setReceptieFile(null)
      setTrayImages([])
      return
    }
    const file = serviceFiles[0]
    const tray = trays.find(t => t.service_file_id === file.id) ?? trays[0]
    if (!tray) return
    setReceptieFile(file)
    setReceptieTrayId(tray.id)
    setReceptieTrayInfo({ number: tray.number, status: tray.status })
    let cancelled = false
    ;(async () => {
      try {
        const images = await listTrayImages(tray.id)
        if (cancelled) return
        setTrayImages(images ?? [])
      } catch (e) {
        if (!cancelled) console.warn('[LeadDetailsSheet] Receptie tray load:', e)
      }
    })()
    return () => { cancelled = true }
  }, [isReceptiePipeline, open, lead, serviceFiles, trays])

  // Service file ID pentru technician details: receptieFile sau prima fișă
  const technicianDetailsServiceFileId = receptieFile?.id ?? serviceFiles[0]?.id ?? null

  // Încarcă technician_details când avem service file
  useEffect(() => {
    if (!technicianDetailsServiceFileId) {
      setTechnicianDetails([])
      return
    }
    let cancelled = false
    setLoadingTechnicianDetails(true)
    getServiceFile(technicianDetailsServiceFileId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setTechnicianDetails([])
          return
        }
        const details = (data as any)?.technician_details
        setTechnicianDetails(Array.isArray(details) ? details : [])
      })
      .finally(() => {
        if (!cancelled) setLoadingTechnicianDetails(false)
      })
    return () => { cancelled = true }
  }, [technicianDetailsServiceFileId])

  // Handler pentru callback Vânzări
  const handleVanzariCallback = useCallback(async (date: Date, label: string) => {
    if (!lead || !isVanzariPipeline) return
    
    const leadId = (lead as any)?.leadId || lead?.id
    if (!leadId) {
      toast.error('Lead-ul nu a fost găsit')
      return
    }

    // Găsește stage-ul CALLBACK
    const callbackStage = stages.find(stage => {
      const stageUpper = stage.toUpperCase()
      return stageUpper === 'CALLBACK' || 
             stageUpper === 'CALL BACK' ||
             stageUpper === 'CALL-BACK' ||
             stageUpper.includes('CALLBACK')
    })

    if (!callbackStage) {
      toast.error('Stage-ul CallBack nu există în acest pipeline')
      return
    }

    setCallbackLoading(true)
    try {
      const callbackDateValue = date.toISOString()
      
      // Salvează callback_date în DB
      await updateLeadWithHistory(leadId, {
        callback_date: callbackDateValue,
        updated_at: new Date().toISOString()
      })

      // Mută în stage-ul CallBack
      if (onStageChange) {
        onStageChange(leadId, callbackStage)
      }

      // Loghează evenimentul
      await logLeadEvent(leadId, `Callback setat: ${formatCallbackDateDisplay(callbackDateValue)} (${label})`, 'callback_set', {
        callback_date: callbackDateValue,
        target_stage: callbackStage
      })

      toast.success(`Callback setat: ${formatCallbackDateDisplay(callbackDateValue)}`)
      onOpenChange(false)
    } catch (error) {
      console.error('[handleVanzariCallback] Eroare:', error)
      toast.error('Eroare la setarea callback-ului')
    } finally {
      setCallbackLoading(false)
    }
  }, [lead, isVanzariPipeline, stages, onStageChange, onOpenChange])

  const callbackCanSave = callbackPendingOption !== 'custom' || !!callbackSelectedDate
  const getCallbackPendingDate = useCallback((): Date | null => {
    if (callbackPendingOption === 'custom') return callbackSelectedDate ?? null
    const now = new Date()
    if (callbackPendingOption === 'tomorrow') return addDays(now, 1)
    if (callbackPendingOption === '3days') return addDays(now, 3)
    if (callbackPendingOption === 'week') return addWeeks(now, 1)
    if (callbackPendingOption === 'month') return addMonths(now, 1)
    if (callbackPendingOption === '3months') return addMonths(now, 3)
    return addDays(now, 1)
  }, [callbackPendingOption, callbackSelectedDate])
  const getCallbackPendingLabel = useCallback((): string => {
    if (callbackPendingOption === 'custom') return 'dată personalizată'
    if (callbackPendingOption === 'tomorrow') return 'Mâine'
    if (callbackPendingOption === '3days') return '3 zile'
    if (callbackPendingOption === 'week') return 'Săptămână'
    if (callbackPendingOption === 'month') return 'Lună'
    if (callbackPendingOption === '3months') return '3 luni'
    return 'Mâine'
  }, [callbackPendingOption])
  const handleCallbackSalvare = useCallback(async () => {
    const date = getCallbackPendingDate()
    if (!date) return
    const d = applyCallbackTime(date)
    await handleVanzariCallback(d, getCallbackPendingLabel())
  }, [getCallbackPendingDate, getCallbackPendingLabel, applyCallbackTime, handleVanzariCallback])

  // Handler pentru revenire la Leaduri din CallBack
  const handleRevenireLaLeaduri = useCallback(async () => {
    if (!lead || !isVanzariPipeline) return
    
    const leadId = (lead as any)?.leadId || lead?.id
    if (!leadId) {
      toast.error('Lead-ul nu a fost găsit')
      return
    }

    // Găsește stage-ul LEADURI
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

    setCallbackLoading(true)
    try {
      // Șterge callback_date în DB
      await updateLeadWithHistory(leadId, {
        callback_date: null,
        updated_at: new Date().toISOString()
      })

      // Mută în stage-ul Leaduri
      if (onStageChange) {
        onStageChange(leadId, leaduriStage)
      }

      // Loghează evenimentul
      await logLeadEvent(leadId, `Lead revenit din CallBack în ${leaduriStage}`, 'callback_cleared', {
        target_stage: leaduriStage
      })

      toast.success(`Lead revenit în ${leaduriStage}`)
      onOpenChange(false)
    } catch (error) {
      console.error('[handleRevenireLaLeaduri] Eroare:', error)
      toast.error('Eroare la revenirea lead-ului')
    } finally {
      setCallbackLoading(false)
    }
  }, [lead, isVanzariPipeline, stages, onStageChange, onOpenChange])

  // Obține tray_id pentru lead de tip "tray" în pipeline departament.
  // Cardurile virtuale (per tehnician) au id = "trayId__tech__technicianId"; folosim realTrayId.
  const getTrayId = useCallback(() => {
    if (!lead || !isDepartmentPipeline) return null
    const leadAny = lead as any
    if (leadAny.type !== 'tray') return null
    return leadAny.realTrayId || leadAny.id || null
  }, [lead, isDepartmentPipeline])

  // Pentru Receptie mobil: tray-ul primei fișe; altfel getTrayId (departament)
  const getEffectiveTrayId = useCallback(() => {
    if (isReceptiePipeline && receptieTrayId) return receptieTrayId
    return getTrayId()
  }, [isReceptiePipeline, receptieTrayId, getTrayId])

  // Încarcă datele tăviței: imagini pentru toți; items + instrumente + servicii și pentru departament (toți), nu doar tehnicieni
  const shouldLoadTrayDetails = !!getTrayId() && open && (isTechnician || (isDepartmentPipeline && (lead as any)?.type === 'tray'))
  useEffect(() => {
    const trayId = getTrayId()
    if (!trayId || !open) {
      setTrayItems([])
      setTrayImages([])
      if (!shouldLoadTrayDetails) setTrayInfo(null)
      return
    }

    const loadTrayData = async () => {
      setLoadingTrayItems(true)
      try {
        if (shouldLoadTrayDetails) {
          const { data: items, error: itemsError } = await listTrayItemsForTray(trayId)
          if (itemsError) {
            console.error('Eroare la încărcare items:', itemsError)
            setTrayItems([])
          } else {
            setTrayItems(items || [])
          }

          const { data: servicesData, error: servicesError } = await supabase
            .from('services')
            .select('id, name, price, instrument_id')
            .order('name')
          if (!servicesError && servicesData) setServices(servicesData)

          const { data: instrumentsData, error: instrumentsError } = await supabase
            .from('instruments')
            .select('id, name, department_id')
            .order('name')
          if (!instrumentsError && instrumentsData) setInstruments(instrumentsData)

          if (isReparatiiPipeline) {
            const { data: partsData, error: partsError } = await supabase
              .from('parts')
              .select('id, name, price')
              .order('name')
            if (!partsError && partsData) setParts(partsData)
          }

          try {
            const { data: trayData, error: trayError } = await supabase
              .from('trays')
              .select('number, size, status')
              .eq('id', trayId)
              .single()
            if (!trayError && trayData) {
              setTrayInfo({
                number: (trayData as any).number,
                status: (trayData as any).status,
              })
            }
          } catch (error) {
            console.error('Eroare la încărcare informații tăviță:', error)
          }
        } else {
          setTrayItems([])
          setTrayInfo(null)
          setTrayImages([])
          setAssignedImageId(null)
        }

        // Încarcă imaginile tăviței și imaginea reprezentativă (pentru toți) – doar când avem trayId
        if (trayId) try {
          const { getTray } = await import('@/lib/supabase/serviceFileOperations')
          const [images, { data: tray }] = await Promise.all([
            listTrayImages(trayId),
            getTray(trayId),
          ])
          setTrayImages(images)
          setAssignedImageId((tray as any)?.assigned_image_id ?? null)
        } catch (error) {
          console.error('Eroare la încărcare imagini:', error)
          setTrayImages([])
          setAssignedImageId(null)
        }
      } catch (error) {
        console.error('Eroare la încărcare date tăviță:', error)
        setTrayItems([])
      } finally {
        setLoadingTrayItems(false)
      }
    }

    loadTrayData()
  }, [lead, open, isTechnician, isDepartmentPipeline, isReparatiiPipeline, getTrayId, shouldLoadTrayDetails, trayItemsRefreshKey])

  // Helper pentru a extrage discount, urgent, brand, serial_number, garantie din notes
  const getItemNotesData = useCallback((item: TrayItem) => {
    let notesData: any = {}
    if (item.notes) {
      try {
        notesData = JSON.parse(item.notes)
      } catch (e) {
        // Notes nu este JSON
      }
    }
    const itemAny = item as any
    return {
      discount_pct: notesData.discount_pct || 0,
      urgent: notesData.urgent || false,
      ...notesData,
      brand: notesData.brand ?? itemAny.brand ?? null,
      serial_number: notesData.serial_number ?? itemAny.serial_number ?? null,
      garantie: notesData.garantie ?? itemAny.garantie ?? false,
    }
  }, [])

  // Helper pentru numele item-ului (folosit la logare istoric)
  const getItemNameForLog = useCallback((item: TrayItem) => {
    if (item.service_id) {
      if ((item as any).service) return (item as any).service.name
      const s = services.find(sv => sv.id === item.service_id)
      return s?.name || 'Serviciu'
    }
    if (item.part_id) {
      const p = parts.find(pa => pa.id === item.part_id)
      return p?.name || 'Piesă'
    }
    return 'Item'
  }, [services, parts])

  // Funcție pentru actualizare item (qty, discount_pct, urgent)
  const handleUpdateItem = useCallback(async (
    itemId: string, 
    field: 'qty' | 'discount_pct' | 'urgent', 
    value: number | boolean
  ) => {
    try {
      const item = trayItems.find(i => i.id === itemId)
      if (!item) return

      const oldVal = field === 'qty' ? item.qty : getItemNotesData(item)[field]
      const trayId = getTrayId()

      if (field === 'qty') {
        const { error } = await updateTrayItem(itemId, { qty: value as number })
        if (error) {
          toast.error('Eroare la actualizare')
          console.error('Error updating item:', error)
          return
        }
        setTrayItems(prev => prev.map(i => 
          i.id === itemId ? { ...i, qty: value as number } : i
        ))
        if (trayId) {
          const notesData = getItemNotesData(item)
          const price = (item as any).price ?? (item as any).service?.price ?? notesData.price
          const inst = item.instrument_id ? instruments.find(i => i.id === item.instrument_id) : null
          logTrayItemChange({
            trayId,
            message: `Cantitate actualizată: ${getItemNameForLog(item)} (${oldVal} → ${value})`,
            eventType: 'tray_item_updated',
            payload: {
              item_id: itemId,
              item_name: getItemNameForLog(item),
              field: 'qty',
              old_value: oldVal,
              new_value: value,
              qty: value,
              price: price != null ? price : null,
              discount_pct: notesData.discount_pct,
              instrument_id: item.instrument_id ?? null,
              instrument_name: inst?.name ?? null,
              non_repairable_qty: notesData.non_repairable_qty ?? null,
            },
          }).catch(() => {})
        }
      } else {
        const notesData = getItemNotesData(item)
        const updatedNotes = { ...notesData, [field]: value }
        const { error } = await updateTrayItem(itemId, { notes: JSON.stringify(updatedNotes) })
        if (error) {
          toast.error('Eroare la actualizare')
          console.error('Error updating item:', error)
          return
        }
        setTrayItems(prev => prev.map(i => 
          i.id === itemId ? { ...i, notes: JSON.stringify(updatedNotes) } : i
        ))
        if (trayId) {
          const label = field === 'discount_pct' ? 'Discount' : 'Urgent'
          const notesData = getItemNotesData(item)
          const inst = item.instrument_id ? instruments.find(i => i.id === item.instrument_id) : null
          logTrayItemChange({
            trayId,
            message: `${label} actualizat: ${getItemNameForLog(item)} (${String(oldVal)} → ${String(value)})`,
            eventType: 'tray_item_updated',
            payload: {
              item_id: itemId,
              item_name: getItemNameForLog(item),
              field,
              old_value: oldVal,
              new_value: value,
              qty: item.qty,
              price: (item as any).price ?? (item as any).service?.price ?? null,
              discount_pct: field === 'discount_pct' ? value : notesData.discount_pct,
              instrument_id: item.instrument_id ?? null,
              instrument_name: inst?.name ?? null,
              non_repairable_qty: notesData.non_repairable_qty ?? null,
            },
          }).catch(() => {})
        }
      }
      toast.success('Actualizat cu succes')
    } catch (error) {
      console.error('Error updating item:', error)
      toast.error('Eroare la actualizare')
    }
  }, [trayItems, getItemNotesData, getTrayId, getItemNameForLog, instruments])

  // Funcție pentru ștergere item
  const handleDeleteItem = useCallback(async (itemId: string) => {
    if (!confirm('Ești sigur că vrei să ștergi acest item?')) return

    const item = trayItems.find(i => i.id === itemId)
    const trayId = getTrayId()
    if (item && trayId) {
      const notesData = getItemNotesData(item)
      const itemName = getItemNameForLog(item)
      const itemType = item.part_id ? 'part' : 'service'
      const inst = item.instrument_id ? instruments.find(i => i.id === item.instrument_id) : null
      const svc = (item as any).service || (item.service_id ? services.find(s => s.id === item.service_id) : null)
      const pt = item.part_id ? parts.find(p => p.id === item.part_id) : null
      const price = (item as any).price ?? (item as any).service?.price
      const payload: Record<string, any> = {
        item_id: itemId,
        item_name: itemName,
        item_type: itemType,
        qty: item.qty,
        price: price != null ? price : null,
        discount_pct: notesData.discount_pct,
        urgent: notesData.urgent,
        brand: notesData.brand ?? null,
        serial_number: notesData.serial_number ?? null,
        garantie: notesData.garantie ?? false,
        non_repairable_qty: notesData.non_repairable_qty ?? null,
        instrument_id: inst?.id ?? null,
        instrument_name: inst?.name ?? null,
      }
      if (inst) payload.instrument = { id: inst.id, name: inst.name }
      if (svc) payload.service = { id: svc.id, name: svc.name }
      if (pt) payload.part = { id: pt.id, name: pt.name }
      logTrayItemChange({
        trayId,
        message: `Item șters: ${itemName}`,
        eventType: 'tray_item_deleted',
        payload,
      }).catch(() => {})
    }
    
    try {
      const { error } = await supabase
        .from('tray_items')
        .delete()
        .eq('id', itemId)
      
      if (error) {
        toast.error('Eroare la ștergere')
        console.error('Error deleting item:', error)
        return
      }
      
      setTrayItems(prev => prev.filter(i => i.id !== itemId))
      toast.success('Item șters cu succes')
    } catch (error) {
      console.error('Error deleting item:', error)
      toast.error('Eroare la ștergere')
    }
  }, [trayItems, getTrayId, getItemNameForLog, getItemNotesData, instruments, services, parts])

  // Funcție pentru adăugare serviciu
  const handleAddService = useCallback(async () => {
    const trayId = getTrayId()
    if (!trayId || !newService.service_id) {
      toast.error('Selectează un serviciu')
      return
    }

    try {
      // Găsește instrumentul pentru serviciu
      const service = services.find(s => s.id === newService.service_id)
      if (!service || !service.instrument_id) {
        toast.error('Serviciul nu are instrument asociat')
        return
      }

      const instrument = instruments.find(i => i.id === service.instrument_id)
      let departmentId: string | null = instrument?.department_id ?? null
      if (departmentId == null) {
        const { data: firstDept } = await supabase.from('departments').select('id').limit(1).maybeSingle()
        departmentId = (firstDept as { id?: string } | null)?.id ?? null
      }
      if (departmentId == null) {
        toast.error('Nu s-a putut determina departamentul. Adaugă un departament în Catalog.')
        return
      }

      const { data: inserted, error } = await supabase
        .from('tray_items')
        .insert({
          tray_id: trayId,
          service_id: newService.service_id,
          instrument_id: service.instrument_id,
          department_id: departmentId,
          qty: newService.qty,
        } as never)
        .select('id')
        .single()

      if (error) {
        const errMsg = (error as { message?: string })?.message ?? String(error)
        toast.error('Eroare la adăugare serviciu')
        console.error('Error adding service:', errMsg, error)
        return
      }

      const instSvc = service.instrument_id ? instruments.find(i => i.id === service.instrument_id) : null
      logTrayItemChange({
        trayId,
        message: `Serviciu adăugat: ${service.name} (cantitate ${newService.qty})`,
        eventType: 'tray_item_added',
        payload: {
          item_id: (inserted as any)?.id,
          item_name: service.name,
          item_type: 'service',
          qty: newService.qty,
          price: (service as any).price ?? null,
          instrument_id: service.instrument_id ?? null,
          instrument_name: instSvc?.name ?? null,
          discount_pct: (newService as any).discount_pct ?? null,
          non_repairable_qty: 0,
        },
      }).catch(() => {})

      const { data: items } = await listTrayItemsForTray(trayId)
      if (items) setTrayItems(items)

      setNewService({ service_id: '', qty: 1 })
      setAddServiceOpen(false)
      toast.success('Serviciu adăugat cu succes')
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('Error adding service:', errMsg, error)
      toast.error('Eroare la adăugare serviciu')
    }
  }, [newService, services, instruments, getTrayId, user])

  // Funcție pentru adăugare piesă (doar Reparatii)
  const handleAddPart = useCallback(async () => {
    const trayId = getTrayId()
    if (!trayId || !newPart.part_id) {
      toast.error('Selectează o piesă')
      return
    }

    if (!isReparatiiPipeline) {
      toast.error('Piesele pot fi adăugate doar în pipeline-ul Reparatii')
      return
    }

    try {
      const part = parts.find(p => p.id === newPart.part_id)
      if (!part) {
        toast.error('Piesa nu a fost găsită')
        return
      }

      // Găsește primul instrument din tăviță pentru a seta instrument_id și department_id
      const trayItemsArray = Array.isArray(trayItems) ? trayItems : []
      const firstInstrument = instruments.find(inst => {
        // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
        if (!inst || !inst.id) return false
        for (let i = 0; i < trayItemsArray.length; i++) {
          const item = trayItemsArray[i]
          if (item && item.instrument_id === inst.id) {
            return true
          }
        }
        return false
      })

      let departmentId: string | null = firstInstrument?.department_id ?? null
      if (departmentId == null) {
        const { data: firstDept } = await supabase.from('departments').select('id').limit(1).maybeSingle()
        departmentId = (firstDept as { id?: string } | null)?.id ?? null
      }
      if (departmentId == null) {
        toast.error('Nu s-a putut determina departamentul. Adaugă un departament în Catalog.')
        return
      }

      const { data: inserted, error } = await supabase
        .from('tray_items')
        .insert({
          tray_id: trayId,
          part_id: newPart.part_id,
          instrument_id: firstInstrument?.id || null,
          department_id: departmentId,
          qty: newPart.qty,
        } as never)
        .select('id')
        .single()

      if (error) {
        toast.error('Eroare la adăugare piesă')
        console.error('Error adding part:', error)
        return
      }

      logTrayItemChange({
        trayId,
        message: `Piesă adăugată: ${part.name} (cantitate ${newPart.qty})`,
        eventType: 'tray_item_added',
        payload: {
          item_id: (inserted as any)?.id,
          item_name: part.name,
          item_type: 'part',
          qty: newPart.qty,
          price: (part as any).price ?? null,
          instrument_id: firstInstrument?.id ?? null,
          instrument_name: firstInstrument?.name ?? null,
          discount_pct: null,
          non_repairable_qty: 0,
        },
      }).catch(() => {})

      const { data: items } = await listTrayItemsForTray(trayId)
      if (items) setTrayItems(items)

      setNewPart({ part_id: '', qty: 1 })
      setAddPartOpen(false)
      toast.success('Piesă adăugată cu succes')
    } catch (error) {
      console.error('Error adding part:', error)
      toast.error('Eroare la adăugare piesă')
    }
  }, [newPart, parts, instruments, trayItems, getTrayId, isReparatiiPipeline, user])

  // Helper pentru a obține numele unui item
  const getItemName = useCallback((item: TrayItem) => {
    if (item.service_id) {
      if ((item as any).service) {
        return (item as any).service.name
      }
      // Dacă nu există service în item, caută în lista de servicii
      const service = services.find(s => s.id === item.service_id)
      return service?.name || 'Serviciu necunoscut'
    }
    if (item.part_id) {
      // Pentru piese, caută în lista de piese
      const part = parts.find(p => p.id === item.part_id)
      return part?.name || 'Piesă necunoscută'
    }
    return 'Item necunoscut'
  }, [parts, services])

  // Funcție pentru upload imagine
  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    
    const trayId = getEffectiveTrayId()
    if (!trayId) {
      toast.error('Tăvița nu a fost găsită')
      return
    }

    // Procesează fiecare fișier
    for (const file of Array.from(files)) {
      // Validare tip fișier
      if (!file.type.startsWith('image/')) {
        toast.error('Tip de fișier invalid', {
          description: 'Te rog selectează o imagine validă (JPG, PNG, etc.)'
        })
        continue
      }

      // Receptie: orice dimensiune; rest: max 5MB
      if (!isReceptiePipeline && file.size > 5 * 1024 * 1024) {
        toast.error('Fișier prea mare', {
          description: 'Dimensiunea maximă este 5MB'
        })
        continue
      }

      setUploadingImage(true)
      const toastId = toast.loading('Se încarcă imaginea...')
      
      try {
        const { url, path } = await uploadTrayImage(trayId, file)
        const savedImage = await saveTrayImageReference(trayId, url, path, file.name)
        setTrayImages(prev => [savedImage, ...prev])
        logTrayImageAdded({ trayId, filename: file.name, imageId: savedImage.id }).catch(() => {})
        toast.success('Imagine încărcată cu succes', { id: toastId })
      } catch (error: any) {
        console.error('Error uploading image:', error)
        toast.error('Eroare la încărcare', { 
          id: toastId,
          description: error?.message || 'Te rog încearcă din nou' 
        })
      } finally {
        setUploadingImage(false)
      }
    }
    
    // Reset input
    event.target.value = ''
  }, [getEffectiveTrayId, isReceptiePipeline])

  // Funcție pentru ștergere imagine
  const handleImageDelete = useCallback(async (imageId: string, filePath: string) => {
    if (!confirm('Ești sigur că vrei să ștergi această imagine?')) return
    
    const trayId = getEffectiveTrayId()
    const imageToDelete = trayImages.find(img => img.id === imageId)
    const filename = imageToDelete?.filename ?? filePath.split('/').pop() ?? 'imagine'
    try {
      await deleteTrayImage(filePath)
      await deleteTrayImageReference(imageId)
      if (trayId) {
        logTrayImageDeleted({ trayId, filename }).catch(() => {})
      }
      setTrayImages(prev => prev.filter(img => img.id !== imageId))
      if (assignedImageId === imageId) setAssignedImageId(null)
      toast.success('Imagine ștearsă')
    } catch (error: any) {
      console.error('Error deleting image:', error)
      toast.error('Eroare la ștergere', {
        description: error?.message || 'Te rog încearcă din nou'
      })
    }
  }, [assignedImageId, getEffectiveTrayId, trayImages])

  // Setează sau scoate imaginea reprezentativă (Recepție / departamente)
  const handleAssignImage = useCallback(async (imageId: string | null) => {
    const trayId = getEffectiveTrayId()
    if (!trayId) return
    setAssigningImageId(imageId ?? 'clear')
    try {
      const { setTrayAssignedImage } = await import('@/lib/supabase/imageOperations')
      const { error } = await setTrayAssignedImage(trayId, imageId)
      if (error) {
        toast.error(error?.message ?? 'Nu s-a putut seta imaginea reprezentativă.')
        return
      }
      setAssignedImageId(imageId)
      toast.success(imageId ? 'Imagine reprezentativă setată' : 'Imagine reprezentativă anulată')
    } catch (e: any) {
      toast.error(e?.message ?? 'Eroare')
    } finally {
      setAssigningImageId(null)
    }
  }, [getEffectiveTrayId])

  if (!lead) return null

  const getTimeAgo = (dateString: string) => {
    try {
      if (!dateString) return 'Data necunoscută'
      const date = new Date(dateString)
      if (Number.isNaN(date.getTime())) return 'Data necunoscută'
      return formatDistanceToNow(date, { addSuffix: true, locale: ro })
    } catch {
      return 'Data necunoscută'
    }
  }

  const getTagColor = (color?: string) => {
    switch (color) {
      case 'green': return 'bg-green-100 text-green-800 border-green-200'
      case 'yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'red': return 'bg-red-100 text-red-800 border-red-200'
      case 'blue': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'orange': return 'bg-orange-100 text-orange-800 border-orange-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      'noua': 'Nouă',
      'in_lucru': 'În lucru',
      'finalizata': 'Finalizată',
      'comanda': 'Comandă',
      'facturata': 'Facturată',
      'in_receptie': 'În recepție',
      'gata': 'Gata',
    }
    return statusMap[status] || status
  }

  const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const stageOrStatus = norm(lead?.stage || '') || norm(trayInfo?.status || '')
  const activeInLucru = /lucru|in_lucru/.test(stageOrStatus)
  const activeFinalizare = /finalizat|gata|finalizata|finalizare/.test(stageOrStatus)
  const activeAsteptPiese = /astept\s*piese|astept_piese/.test(stageOrStatus)
  const activeInAsteptare = /asteptare|in_asteptare/.test(stageOrStatus)
  // Finalizare apare doar când cardul e în: În lucru, În așteptare piese sau În așteptare
  const showFinalizare = activeInLucru || activeAsteptPiese || activeInAsteptare

  // Handler pentru închidere - nu mai atribuie automat tag-ul "Retur"
  // Tag-ul "RETUR" poate fi atribuit/eliminat manual de utilizator

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="h-[90vh] max-h-[100dvh] flex flex-col overflow-hidden p-4 sm:p-6 rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="mb-4 flex-shrink-0 pb-2">
          <SheetTitle className="text-xl font-semibold leading-tight">{lead.name || 'Fără nume'}</SheetTitle>
          <SheetDescription className="text-muted-foreground text-sm mt-1">
            {lead?.stage ?? ''} • {getTimeAgo((lead as any)?.createdAt ?? (lead as any)?.created_at ?? '')}
          </SheetDescription>
        </SheetHeader>

        {isReceptiePipeline ? (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 px-0 pb-2">
            {/* Receptie mobil: doar card fișă + o singură opțiune de atașare imagini */}
            <div className="space-y-4">
              {/* Card fișă */}
              <div className="p-3 bg-muted/30 rounded-lg border space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm text-foreground">Fișă serviciu</h3>
                </div>
                {loadingFiles ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Se încarcă…
                  </div>
                ) : !receptieFile && serviceFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Nu există fișă de serviciu</p>
                ) : (
                  <>
                    {receptieFile && (
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div><span className="font-medium">Fișă:</span> #{receptieFile.number}</div>
                        <div><span className="font-medium">Status:</span> {getStatusLabel(receptieFile.status)}</div>
                        {receptieFile.date && (
                          <div className="col-span-2"><span className="font-medium">Data:</span> {new Date(receptieFile.date).toLocaleDateString('ro-RO')}</div>
                        )}
                      </div>
                    )}
                    {receptieTrayInfo && receptieTrayId && (
                      <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Package className="h-3.5 w-3.5" />
                          <span>Tăviță #{receptieTrayInfo.number || '—'} • {getStatusLabel(receptieTrayInfo.status || '')}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 touch-manipulation"
                          onClick={(e) => { e.stopPropagation(); openEditTray(receptieTrayId, receptieTrayInfo.number ?? '') }}
                          aria-label="Editează nr. tăviței"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Caseta 1: Detalii comunicate de client */}
              <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <div className="rounded-xl border bg-gradient-to-br from-slate-50/80 to-white dark:from-slate-900/80 dark:to-slate-800/50 shadow-sm overflow-hidden">
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/10 flex items-center justify-center">
                        <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <span className="font-semibold text-sm">Detalii comunicate de client</span>
                    </div>
                    {isDetailsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-4">
                      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                      <p className="text-sm text-foreground whitespace-pre-wrap min-h-[2.5rem] pt-3">{trayDetails || '—'}</p>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>

              {/* Caseta Detalii comunicate de tehnician */}
              {technicianDetailsServiceFileId && (
                <LeadTechnicianDetailsSection
                  isOpen={isTechnicianDetailsOpen}
                  onOpenChange={setIsTechnicianDetailsOpen}
                  entries={technicianDetails}
                  canEdit={isDepartmentPipeline}
                  onAppend={async (text, stage, stageLabel) => {
                    if (!technicianDetailsServiceFileId) return technicianDetails
                    setSavingTechnicianDetails(true)
                    try {
                      const { data, error } = await appendTechnicianDetail(technicianDetailsServiceFileId, { stage, stageLabel, text }, user?.id)
                      if (error) {
                        toast.error('Eroare la salvare: ' + (error?.message ?? ''))
                        return technicianDetails
                      }
                      const updated = data ?? []
                      setTechnicianDetails(updated)
                      toast.success('Notă adăugată.')
                      return updated
                    } finally {
                      setSavingTechnicianDetails(false)
                    }
                  }}
                  saving={savingTechnicianDetails}
                  loading={loadingTechnicianDetails}
                />
              )}

              {/* Caseta 2: Informații contact */}
              <Collapsible open={isContactOpen} onOpenChange={setIsContactOpen}>
                <div className="rounded-xl border bg-gradient-to-br from-slate-50/80 to-white dark:from-slate-900/80 dark:to-slate-800/50 shadow-sm overflow-hidden">
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-left">
                        <span className="font-semibold text-sm block">Informații contact</span>
                        <span className="text-[10px] text-muted-foreground">{lead.name || '—'} • {lead.phone || 'Fără telefon'}</span>
                      </div>
                    </div>
                    {isContactOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-4">
                      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                      <div className="space-y-2 pt-3">
                        {lead.email && (
                          <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs font-medium">Email</p>
                              <p className="text-sm text-muted-foreground">{lead.email}</p>
                            </div>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs font-medium">Telefon</p>
                              <p className="text-sm text-muted-foreground">{lead.phone}</p>
                            </div>
                          </div>
                        )}
                        {!lead.email && !lead.phone && <p className="text-sm text-muted-foreground">—</p>}
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>

              {/* O singură opțiune de atașare imagini – doar dacă există tăviță */}
              {receptieTrayId && (
                <div className="space-y-3 pt-2 border-t">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">Imagini</h3>
                  {uploadingImage ? (
                    <div className="flex flex-col items-center justify-center w-full py-6 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5">
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                      <span className="text-sm font-medium text-primary mt-2">Se încarcă...</span>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      {/* Input pentru galerie (fără capture) */}
                      <input
                        type="file"
                        id="tray-image-upload-receptie-gallery"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        multiple
                      />
                      {/* Input pentru cameră (cu capture) */}
                      <input
                        type="file"
                        id="tray-image-upload-receptie-camera"
                        accept="image/*"
                        capture="environment"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      
                      {/* Buton Galerie */}
                      <label
                        htmlFor="tray-image-upload-receptie-gallery"
                        className="flex-1 flex flex-col items-center justify-center py-4 px-3 rounded-lg border-2 border-dashed border-blue-300 hover:border-blue-400 hover:bg-blue-50 dark:border-blue-700 dark:hover:border-blue-600 dark:hover:bg-blue-950/30 bg-blue-50/50 dark:bg-blue-950/20 transition-all cursor-pointer touch-manipulation min-h-11"
                      >
                        <ImagePlus className="h-6 w-6 text-blue-600 dark:text-blue-400 mb-1.5" />
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Galerie</span>
                      </label>

                      {/* Buton Cameră */}
                      <label
                        htmlFor="tray-image-upload-receptie-camera"
                        className="flex-1 flex flex-col items-center justify-center py-4 px-3 rounded-lg border-2 border-dashed border-green-300 hover:border-green-400 hover:bg-green-50 dark:border-green-700 dark:hover:border-green-600 dark:hover:bg-green-950/30 bg-green-50/50 dark:bg-green-950/20 transition-all cursor-pointer touch-manipulation min-h-11"
                      >
                        <Camera className="h-6 w-6 text-green-600 dark:text-green-400 mb-1.5" />
                        <span className="text-sm font-medium text-green-700 dark:text-green-300">Cameră</span>
                      </label>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground/70 text-center mt-1">Orice dimensiune</p>
                  {trayImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {trayImages.map((img) => {
                        const isAssigned = assignedImageId === img.id
                        const isAssigning = assigningImageId === img.id || (assigningImageId === 'clear' && isAssigned)
                        return (
                          <div key={img.id} className={`group relative aspect-square rounded-lg overflow-hidden bg-muted/30 ring-1 ring-border ${isAssigned ? 'ring-2 ring-primary' : ''}`}>
                            <img src={img.url} alt={img.filename} className="w-full h-full object-cover" />
                            {isAssigned && (
                              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-medium flex items-center gap-1">
                                <Star className="h-3 w-3 fill-current" />
                                Reprezentativă
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-black/70 flex flex-col gap-0.5">
                              <Button variant="ghost" size="sm" className="h-6 min-h-0 text-[10px] text-white hover:bg-white/20 touch-manipulation py-0" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAssignImage(isAssigned ? null : img.id) }} disabled={isAssigning}>
                                {isAssigning ? <Loader2 className="h-3 w-3 animate-spin" /> : isAssigned ? <><StarOff className="h-3 w-3 mr-1 inline" /> Anulează</> : <><Star className="h-3 w-3 mr-1 inline" /> Setează reprezentativă</>}
                              </Button>
                            </div>
                            <Button variant="destructive" size="sm" className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleImageDelete(img.id, img.file_path) }}>
                              <XIcon className="h-4 w-4" />
                            </Button>
                            <a href={img.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-0" title="Deschide" />
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {trayImages.length === 0 && !uploadingImage && (
                    <p className="text-sm text-muted-foreground text-center py-2">Nu există imagini încărcate</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 min-h-0 flex flex-col overflow-hidden">
          <TabsList className={cn(
            "flex w-full overflow-x-auto scrollbar-hide gap-1 flex-shrink-0",
            "min-w-full"
          )}>
            <TabsTrigger value="info" className="text-xs px-2 flex-shrink-0 whitespace-nowrap">
              Info
            </TabsTrigger>
            <TabsTrigger value="files" className="text-xs px-2 flex-shrink-0 whitespace-nowrap">
              Detalii
            </TabsTrigger>
            <TabsTrigger value="messaging" className="text-xs px-2 flex-shrink-0">
              <MessageSquare className="h-3.5 w-3.5" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4 px-[4px] min-h-0 overflow-y-auto">
            {/* Butoane Callback pentru Vânzări */}
            {isVanzariPipeline && (
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Programează Callback:</span>
                </div>
                
                {/* Verifică dacă lead-ul e în CallBack */}
                {(() => {
                  const stageNorm = (lead?.stage || '').toLowerCase()
                  const isInCallback = /callback|call_back|call-back/.test(stageNorm)
                  const callbackDate = (lead as any)?.callback_date
                  
                  if (isInCallback) {
                    return (
                      <div className="space-y-2">
                        {callbackDate && (
                          <div className="flex items-center gap-2 text-xs text-orange-600 font-medium">
                            <Clock className="h-3 w-3" />
                            Callback programat: {formatCallbackDateDisplay(callbackDate)}
                          </div>
                        )}
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleRevenireLaLeaduri}
                          disabled={callbackLoading}
                          className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-xs"
                        >
                          {callbackLoading ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <PhoneOff className="h-3 w-3 mr-2" />}
                          Revino la Leaduri
                        </Button>
                      </div>
                    )
                  }
                  
                  const activeCls = 'bg-gray-100 dark:bg-gray-800 border-gray-400 dark:border-gray-500 text-gray-800 dark:text-gray-200 font-semibold ring-1 ring-gray-300 dark:ring-gray-600'
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Label className="text-xs text-muted-foreground shrink-0">Ora:</Label>
                        <Select value={callbackHour} onValueChange={setCallbackHour}>
                          <SelectTrigger className="h-8 w-16 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {callbackHours.map((h) => (
                              <SelectItem key={h} value={h}>{h}:00</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={callbackMinute} onValueChange={setCallbackMinute}>
                          <SelectTrigger className="h-8 w-14 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {callbackMinutes.map((m) => (
                              <SelectItem key={m} value={m}>:{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          disabled={!callbackCanSave || callbackLoading}
                          onClick={handleCallbackSalvare}
                          className={cn('h-8 px-3 text-xs gap-1.5 bg-gray-600 hover:bg-gray-700 text-white')}
                        >
                          {callbackLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          Salvare
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCallbackPendingOption('tomorrow')}
                          disabled={callbackLoading}
                          className={cn('h-9 text-xs', callbackPendingOption === 'tomorrow' && activeCls)}
                        >
                          Mâine
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCallbackPendingOption('3days')}
                          disabled={callbackLoading}
                          className={cn('h-9 text-xs', callbackPendingOption === '3days' && activeCls)}
                        >
                          3 zile
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCallbackPendingOption('week')}
                          disabled={callbackLoading}
                          className={cn('h-9 text-xs', callbackPendingOption === 'week' && activeCls)}
                        >
                          Săpt.
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCallbackPendingOption('month')}
                          disabled={callbackLoading}
                          className={cn('h-9 text-xs', callbackPendingOption === 'month' && activeCls)}
                        >
                          Lună
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCallbackPendingOption('3months')}
                          disabled={callbackLoading}
                          className={cn('h-9 text-xs', callbackPendingOption === '3months' && activeCls)}
                        >
                          3 luni
                        </Button>
                        <Popover open={callbackCalendarOpen} onOpenChange={setCallbackCalendarOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCallbackPendingOption('custom')}
                              disabled={callbackLoading}
                              className={cn('h-9 text-xs', callbackPendingOption === 'custom' && activeCls)}
                            >
                              <CalendarDays className="h-3 w-3" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                              mode="single"
                              selected={callbackSelectedDate}
                              onSelect={(date) => {
                                if (date) {
                                  setCallbackSelectedDate(date)
                                  setCallbackPendingOption('custom')
                                  setCallbackCalendarOpen(false)
                                }
                              }}
                              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                              locale={ro}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Caseta 1: Detalii comunicate de client */}
            <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
              <div className="rounded-xl border bg-gradient-to-br from-slate-50/80 to-white dark:from-slate-900/80 dark:to-slate-800/50 shadow-sm overflow-hidden">
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/10 flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <span className="font-semibold text-sm">Detalii comunicate de client</span>
                  </div>
                  {isDetailsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-4">
                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    <div className="pt-3">
                      {loadingTrayDetails ? (
                        <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                      ) : (
                        <>
                          <Textarea
                            value={trayDetails}
                            onChange={(e) => {
                              if (!isVanzariPipeline && !isReceptiePipeline) return
                              if (isTechnician) return
                              setTrayDetails(e.target.value)
                            }}
                            placeholder={(isVanzariPipeline || isReceptiePipeline) && !isTechnician ? 'Detalii (din formular sau manual)...' : 'Doar vizualizare'}
                            className="min-h-[100px] text-xs sm:text-sm resize-none"
                            readOnly={isTechnician || (!isVanzariPipeline && !isReceptiePipeline)}
                          />
                          {!isTechnician && (isVanzariPipeline || isReceptiePipeline) && (
                            <div className="flex justify-end mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  const leadId = (lead as any)?.leadId || lead?.id
                                  if (!leadId) { toast.error('Lead-ul nu a fost găsit'); return }
                                  const trimmed = (trayDetails ?? '').trim()
                                  if (!trimmed) { toast.error('Introduceți informații înainte de salvare'); return }
                                  setSavingTrayDetails(true)
                                  try {
                                    const { error } = await updateLeadWithHistory(leadId, { details: trimmed })
                                    if (error) {
                                      toast.error('Eroare la salvare: ' + (error?.message ?? ''))
                                      return
                                    }
                                    toast.success('Salvat')
                                  } catch (e: any) { toast.error('Eroare: ' + (e?.message ?? '')) }
                                  finally { setSavingTrayDetails(false) }
                                }}
                                disabled={savingTrayDetails}
                              >
                                {savingTrayDetails ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Salvare...</> : 'Salvează'}
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Caseta Detalii comunicate de tehnician */}
            {technicianDetailsServiceFileId && (
              <LeadTechnicianDetailsSection
                isOpen={isTechnicianDetailsOpen}
                onOpenChange={setIsTechnicianDetailsOpen}
                entries={technicianDetails}
                canEdit={isDepartmentPipeline}
                onAppend={async (text, stage, stageLabel) => {
                  if (!technicianDetailsServiceFileId) return technicianDetails
                  setSavingTechnicianDetails(true)
                  try {
                    const { data, error } = await appendTechnicianDetail(technicianDetailsServiceFileId, { stage, stageLabel, text }, user?.id)
                    if (error) {
                      toast.error('Eroare la salvare: ' + (error?.message ?? ''))
                      return technicianDetails
                    }
                    const updated = data ?? []
                    setTechnicianDetails(updated)
                    toast.success('Notă adăugată.')
                    return updated
                  } finally {
                    setSavingTechnicianDetails(false)
                  }
                }}
                saving={savingTechnicianDetails}
                loading={loadingTechnicianDetails}
              />
            )}

            {/* Caseta 2: Informații contact */}
            <Collapsible open={isContactOpen} onOpenChange={setIsContactOpen}>
              <div className="rounded-xl border bg-gradient-to-br from-slate-50/80 to-white dark:from-slate-900/80 dark:to-slate-800/50 shadow-sm overflow-hidden">
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <span className="font-semibold text-sm block">Informații contact</span>
                      <span className="text-[10px] text-muted-foreground">{lead.name || '—'} • {lead.phone || 'Fără telefon'}</span>
                    </div>
                  </div>
                  {isContactOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-4">
                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    <div className="space-y-2 pt-3">
                      {lead.email && (
                        <div className="flex items-center gap-3">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs font-medium">Email</p>
                            <p className="text-sm text-muted-foreground">{lead.email}</p>
                          </div>
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-3">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs font-medium">Telefon</p>
                            <p className="text-sm text-muted-foreground">{lead.phone}</p>
                          </div>
                        </div>
                      )}
                      {!lead.email && !lead.phone && <p className="text-sm text-muted-foreground">—</p>}
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Tag-uri */}
            {lead.tags && lead.tags.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase">
                  Tag-uri
                </h3>
                <div className="flex flex-wrap gap-2">
                  {lead.tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant="outline"
                      className={cn(
                        "text-sm px-3 py-1 border",
                        getTagColor(tag.color)
                      )}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Tehnician */}
            {lead.technician && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase">
                  Tehnician
                </h3>
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm">{lead.technician}</p>
                </div>
              </div>
            )}

            {/* Informații suplimentare */}
            {(lead.campaignName || lead.adName || lead.formName) && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase">
                  Sursa
                </h3>
                {lead.campaignName && (
                  <p className="text-sm">
                    <span className="font-medium">Campanie:</span> {lead.campaignName}
                  </p>
                )}
                {lead.adName && (
                  <p className="text-sm">
                    <span className="font-medium">Anunț:</span> {lead.adName}
                  </p>
                )}
                {lead.formName && (
                  <p className="text-sm">
                    <span className="font-medium">Formular:</span> {lead.formName}
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="files" className="space-y-4 mt-4 px-0 min-h-0 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="space-y-4">
              {/* Dacă este un card de tăviță directă din pipeline departament, afișează doar detaliile tăviței */}
              {isDepartmentPipeline && (lead as any)?.type === 'tray' && getTrayId() ? (
                <>
                  {/* Butoane de acțiune pentru pipeline departament */}
                  <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/50 rounded-xl">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleInLucru}
                      className={cn(
                        "flex items-center gap-2 text-xs border-0 min-h-[44px] touch-manipulation",
                        activeInLucru
                          ? "bg-violet-600 hover:bg-violet-700 text-white ring-2 ring-violet-400 shadow-sm"
                          : "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:hover:bg-violet-900/60"
                      )}
                    >
                      <Wrench className="h-3 w-3" />
                      În lucru
                    </Button>
                    {showFinalizare && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleFinalizare}
                        className={cn(
                          "flex items-center gap-2 text-xs border-0 min-h-[44px] touch-manipulation",
                          activeFinalizare
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400 shadow-sm"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                        )}
                      >
                        <CheckCircle className="h-3 w-3" />
                        Finalizare
                      </Button>
                    )}
                    {isReparatiiPipeline && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAsteptPiese}
                        className={cn(
                          "flex items-center gap-2 text-xs border-2 min-h-[44px] touch-manipulation",
                          activeAsteptPiese
                            ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600 ring-2 ring-amber-400 shadow-sm"
                            : "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/40"
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        Aștept piese
                      </Button>
                    )}
                    {isSaloaneHorecaFrizeriiPipeline && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleInAsteptare}
                        className={cn(
                          "flex items-center gap-2 text-xs border-2 min-h-[44px] touch-manipulation",
                          activeInAsteptare
                            ? "bg-sky-600 hover:bg-sky-700 text-white border-sky-600 ring-2 ring-sky-400 shadow-sm"
                            : "bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-700 dark:hover:bg-sky-900/40"
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        În așteptare
                      </Button>
                    )}
                  </div>

                  {/* Detalii tăviță: instrument, servicii – vizibil pentru toți; edit doar pentru tehnicieni */}
                  <div className="space-y-4">
                    {/* Informații despre tăviță */}
                    {trayInfo && (
                        <div className="space-y-2 p-4 bg-muted/30 rounded-xl border">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-primary" />
                            <h3 className="font-semibold text-sm text-foreground">
                              Tăviță #{trayInfo?.number ?? '—'}
                            </h3>
                            {getTrayId() && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 touch-manipulation"
                                onClick={(e) => { e.stopPropagation(); openEditTray(getTrayId()!, trayInfo?.number ?? '') }}
                                aria-label="Editează nr. tăviței"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Status:</span> {getStatusLabel(trayInfo.status || '')}
                          </div>
                        </div>
                      )}

                    <h3 className="font-semibold text-sm text-muted-foreground uppercase">
                      Instrument, servicii
                    </h3>
                    
                    {loadingTrayItems ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Doar Împarte tăvița – ascuns când împărțirea tăvițelor e dezactivată */}
                        {SPLIT_TRAY_FEATURE_ENABLED && isDepartmentPipeline && getTrayId() && pipelineIdForTray && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 border-slate-300 dark:border-slate-600"
                              onClick={() => setSplitRealOpen(true)}
                              title="Împarte tăvița în 2 sau 3 tăvițe (mutare independentă)"
                            >
                              <Users className="h-4 w-4" />
                              Împarte tăvița
                            </Button>
                          </div>
                        )}

                        {/* Lista items – instrument, serviciu, cantitate, preț */}
                          {trayItems.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                              Nu există items în această tăviță
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {trayItems
                                .filter(item => item.service_id || item.part_id)
                                .map((item) => (
                                  <Card key={item.id} className="p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                          <h4 className="font-medium text-sm">
                                            {getItemName(item)}
                                          </h4>
                                          <Badge variant={item.part_id ? 'secondary' : 'outline'} className="text-[10px]">
                                            {item.part_id ? 'Piesă' : 'Serviciu'}
                                          </Badge>
                                        </div>
                                        {item.instrument_id && (
                                          <p className="text-xs text-muted-foreground">
                                            Instrument: {instruments.find(i => i.id === item.instrument_id)?.name || 'Necunoscut'}
                                          </p>
                                        )}
                                        {/* Cantitate, preț, discount, urgent, nereparat, garanție, serial – vizibil pentru toți */}
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                          <span>Cantitate: <strong className="text-foreground">{item.qty}</strong></span>
                                          {((item as any).price != null || (item as any).service?.price != null || getItemNotesData(item).price != null) && (
                                            <span>Preț: <strong className="text-foreground">
                                              {Number((item as any).price ?? (item as any).service?.price ?? getItemNotesData(item).price ?? 0).toFixed(2)} RON
                                            </strong></span>
                                          )}
                                          {getItemNotesData(item).discount_pct > 0 && (
                                            <span className="text-amber-600">Discount {getItemNotesData(item).discount_pct}%</span>
                                          )}
                                          {getItemNotesData(item).urgent && (
                                            <Badge variant="outline" className="text-[10px] bg-red-100 text-red-800 border-red-200">
                                              Urgent (+30%)
                                            </Badge>
                                          )}
                                          {((item as any).unrepaired_qty ?? getItemNotesData(item).unrepairedCount) > 0 && (
                                            <span>Nereparat: <strong className="text-foreground">{(item as any).unrepaired_qty ?? getItemNotesData(item).unrepairedCount}</strong></span>
                                          )}
                                          {getItemNotesData(item).garantie && (
                                            <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200">
                                              Garanție
                                            </Badge>
                                          )}
                                          {(item as any).serials && String((item as any).serials).trim() && (
                                            <span className="truncate max-w-[120px]" title={(item as any).serials}>Serie: {(item as any).serials}</span>
                                          )}
                                        </div>
                                        {/* Editare – disponibil pentru toți utilizatorii */}
                                        <div className="space-y-2 pt-2 border-t">
                                          <div className="flex items-center gap-2">
                                            <Label className="text-xs text-muted-foreground">Cantitate:</Label>
                                            {editingItem === item.id ? (
                                              <Input
                                                type="number"
                                                value={editValues.qty ?? item.qty}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => setEditValues({ ...editValues, qty: Number(e.target.value) })}
                                                className="w-16 h-7 text-xs"
                                                min="1"
                                              />
                                            ) : (
                                              <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">{item.qty}</span>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => {
                                                    const notesData = getItemNotesData(item)
                                                    const price = notesData.price ?? (item as any).service?.price ?? (item as any).price ?? 0
                                                    const unrepaired = (item as any).unrepaired_qty ?? notesData.unrepairedCount ?? notesData.unrepaired_qty ?? 0
                                                    setEditingItem(item.id)
                                                    setEditValues({
                                                      qty: item.qty,
                                                      discount_pct: notesData.discount_pct,
                                                      urgent: notesData.urgent,
                                                      price: Number(price) || 0,
                                                      unrepaired_qty: Math.min(item.qty, Math.max(0, Number(unrepaired) || 0)),
                                                      garantie: notesData.garantie ?? false,
                                                      serials: (item as any).serials ?? '',
                                                    })
                                                  }}
                                                  className="h-6 w-6 p-0"
                                                >
                                                  <Pencil className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            )}
                                          </div>

                                          {/* Discount */}
                                          {editingItem === item.id ? (
                                            <div className="flex items-center gap-2">
                                              <Label className="text-xs text-muted-foreground">Discount %:</Label>
                                              <Input
                                                type="number"
                                                value={editValues.discount_pct ?? getItemNotesData(item).discount_pct}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => setEditValues({ ...editValues, discount_pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                                                className="w-16 h-7 text-xs"
                                                min="0"
                                                max="100"
                                              />
                                            </div>
                                          ) : (
                                            getItemNotesData(item).discount_pct > 0 && (
                                              <div className="flex items-center gap-2">
                                                <Label className="text-xs text-muted-foreground">Discount:</Label>
                                                <span className="text-xs font-medium text-amber-600">
                                                  {getItemNotesData(item).discount_pct}%
                                                </span>
                                              </div>
                                            )
                                          )}

                                          {/* Urgent */}
                                          {editingItem === item.id ? (
                                            <div className="flex items-center gap-2">
                                              <Label className="text-xs text-muted-foreground">Urgent:</Label>
                                              <Switch
                                                checked={editValues.urgent ?? getItemNotesData(item).urgent}
                                                onCheckedChange={(checked) => setEditValues({ ...editValues, urgent: checked })}
                                              />
                                            </div>
                                          ) : (
                                            getItemNotesData(item).urgent && (
                                              <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px] bg-red-100 text-red-800 border-red-200">
                                                  Urgent (+30%)
                                                </Badge>
                                              </div>
                                            )
                                          )}

                                          {/* Preț unitar */}
                                          {editingItem === item.id && (
                                            <div className="flex items-center gap-2">
                                              <Label className="text-xs text-muted-foreground">Preț unitar (RON):</Label>
                                              <Input
                                                type="number"
                                                min={0}
                                                step={0.01}
                                                value={editValues.price ?? getItemNotesData(item).price ?? (item as any).service?.price ?? (item as any).price ?? 0}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => setEditValues({ ...editValues, price: Math.max(0, Number(e.target.value) || 0) })}
                                                className="w-24 h-7 text-xs"
                                              />
                                            </div>
                                          )}

                                          {/* Nereparat */}
                                          {editingItem === item.id && (
                                            <div className="flex items-center gap-2">
                                              <Label className="text-xs text-muted-foreground">Nereparat:</Label>
                                              <Input
                                                type="number"
                                                min={0}
                                                max={item.qty}
                                                value={editValues.unrepaired_qty ?? (item as any).unrepaired_qty ?? getItemNotesData(item).unrepairedCount ?? 0}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => setEditValues({ ...editValues, unrepaired_qty: Math.min(item.qty, Math.max(0, Number(e.target.value) || 0)) })}
                                                className="w-16 h-7 text-xs"
                                              />
                                            </div>
                                          )}

                                          {/* Garanție */}
                                          {editingItem === item.id && (
                                            <div className="flex items-center gap-2">
                                              <Label className="text-xs text-muted-foreground">Garanție:</Label>
                                              <Switch
                                                checked={editValues.garantie ?? getItemNotesData(item).garantie ?? false}
                                                onCheckedChange={(checked) => setEditValues({ ...editValues, garantie: checked })}
                                              />
                                            </div>
                                          )}

                                          {/* Nr. serie */}
                                          {editingItem === item.id && (
                                            <div className="flex flex-col gap-1">
                                              <Label className="text-xs text-muted-foreground">Nr. serie:</Label>
                                              <Input
                                                value={editValues.serials ?? (item as any).serials ?? ''}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => setEditValues({ ...editValues, serials: e.target.value })}
                                                placeholder="ex: 123, 124..."
                                                className="h-7 text-xs"
                                              />
                                            </div>
                                          )}

                                          {/* Butoane salvare/anulare pentru editare */}
                                          {editingItem === item.id && (
                                            <div className="flex items-center gap-2 pt-2 border-t">
                                              <Button
                                                size="sm"
                                                variant="default"
                                                disabled={savingItemId === item.id}
                                                onClick={async () => {
                                                  if (savingItemId === item.id) return
                                                  setSavingItemId(item.id)
                                                  try {
                                                    const notesData = getItemNotesData(item)
                                                    const mergedNotes = {
                                                      ...notesData,
                                                      ...(editValues.discount_pct !== undefined && { discount_pct: editValues.discount_pct }),
                                                      ...(editValues.urgent !== undefined && { urgent: editValues.urgent }),
                                                      ...(editValues.price !== undefined && { price: editValues.price }),
                                                      ...(editValues.garantie !== undefined && { garantie: editValues.garantie }),
                                                    }
                                                    const payload: Parameters<typeof updateTrayItem>[1] = {
                                                      notes: JSON.stringify(mergedNotes),
                                                    }
                                                    if (editValues.qty !== undefined) payload.qty = editValues.qty
                                                    if (editValues.unrepaired_qty !== undefined) payload.unrepaired_qty = editValues.unrepaired_qty
                                                    if (editValues.serials !== undefined) payload.serials = editValues.serials.trim() || null
                                                    let result = await updateTrayItem(item.id, payload)
                                                    if (result.error) {
                                                      toast.info('Reîncercare...')
                                                      result = await updateTrayItem(item.id, payload)
                                                    }
                                                    if (result.error) {
                                                      toast.error('Eroare la actualizare. Verifică conexiunea.')
                                                      setSavingItemId(null)
                                                      return
                                                    }
                                                    setTrayItems(prev => prev.map(i => {
                                                      if (i.id !== item.id) return i
                                                      return {
                                                        ...i,
                                                        ...(editValues.qty !== undefined && { qty: editValues.qty }),
                                                        ...(editValues.unrepaired_qty !== undefined && { unrepaired_qty: editValues.unrepaired_qty } as any),
                                                        ...(editValues.serials !== undefined && { serials: editValues.serials.trim() || null } as any),
                                                        notes: JSON.stringify(mergedNotes),
                                                      }
                                                    }))
                                                    setEditingItem(null)
                                                    setEditValues({})
                                                    toast.success('Actualizat cu succes')
                                                  } catch (err) {
                                                    console.error(err)
                                                    toast.error('Eroare la actualizare')
                                                  } finally {
                                                    setSavingItemId(null)
                                                  }
                                                }}
                                                className="flex-1 h-8 text-xs"
                                              >
                                                {savingItemId === item.id ? (
                                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                ) : (
                                                  <Save className="h-3 w-3 mr-1" />
                                                )}
                                                {savingItemId === item.id ? 'Se salvează...' : 'Salvează'}
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={savingItemId === item.id}
                                                onClick={() => {
                                                  if (savingItemId === item.id) return
                                                  setEditingItem(null)
                                                  setEditValues({})
                                                }}
                                                className="flex-1 h-8 text-xs"
                                              >
                                                <XIcon className="h-3 w-3 mr-1" />
                                                Anulează
                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      {/* Buton ștergere – disponibil pentru toți */}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="h-8 w-8 p-0 text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </Card>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                  </div>

                  {/* Imagini Tăviță – vizibil pentru toți (adăugare din galerie + poză în timp real) */}
                  <div className="space-y-3 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase">
                        Imagini Tăviță
                      </h3>
                      {trayImages.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {trayImages.length} {trayImages.length === 1 ? 'imagine' : 'imagini'}
                        </span>
                      )}
                    </div>

                    {loadingTrayItems ? (
                      <div className="flex flex-col items-center justify-center py-6 rounded-lg border-2 border-dashed border-muted bg-muted/20">
                        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                        <span className="text-sm text-muted-foreground mt-2">Se încarcă...</span>
                      </div>
                    ) : uploadingImage ? (
                      <div className="flex flex-col items-center justify-center w-full py-4 px-4 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5">
                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
                        <span className="text-sm font-medium text-primary mt-2">Se încarcă imaginea...</span>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <label
                            htmlFor="tray-image-upload-gallery-mobile"
                            className="relative flex flex-col items-center justify-center py-4 px-3 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 bg-muted/20 transition-all cursor-pointer touch-manipulation min-h-11"
                          >
                            <input
                              type="file"
                              id="tray-image-upload-gallery-mobile"
                              accept="image/*"
                              onChange={handleImageUpload}
                              className="hidden"
                              multiple
                            />
                            <ImageIcon className="h-5 w-5 text-muted-foreground mb-1.5" />
                            <span className="text-sm font-medium text-muted-foreground text-center">Din galerie</span>
                          </label>
                          <label
                            htmlFor="tray-image-upload-camera-mobile"
                            className="relative flex flex-col items-center justify-center py-4 px-3 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 bg-muted/20 transition-all cursor-pointer touch-manipulation min-h-11"
                          >
                            <input
                              type="file"
                              id="tray-image-upload-camera-mobile"
                              accept="image/*"
                              capture="environment"
                              onChange={handleImageUpload}
                              className="hidden"
                              multiple
                            />
                            <Camera className="h-5 w-5 text-muted-foreground mb-1.5" />
                            <span className="text-sm font-medium text-muted-foreground text-center">Fă poza</span>
                          </label>
                        </div>
                        <p className="text-xs text-muted-foreground/70 text-center">Max 5MB per imagine</p>

                        {trayImages.length > 0 && (
                          <div className="grid grid-cols-2 gap-3">
                            {trayImages.map((image) => {
                              const isAssigned = assignedImageId === image.id
                              const isAssigning = assigningImageId === image.id || (assigningImageId === 'clear' && isAssigned)
                              return (
                                <div
                                  key={image.id}
                                  className={`group relative aspect-square rounded-lg overflow-hidden bg-muted/30 ring-1 ring-border ${isAssigned ? 'ring-2 ring-primary' : ''}`}
                                >
                                  <img src={image.url} alt={image.filename} className="w-full h-full object-cover" />
                                  {isAssigned && (
                                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-medium flex items-center gap-1">
                                      <Star className="h-3 w-3 fill-current" />
                                      Reprezentativă
                                    </div>
                                  )}
                                  <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-black/70 flex flex-col gap-0.5">
                                    <Button variant="ghost" size="sm" className="h-6 min-h-0 text-[10px] text-white hover:bg-white/20 touch-manipulation py-0" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAssignImage(isAssigned ? null : image.id) }} disabled={isAssigning}>
                                      {isAssigning ? <Loader2 className="h-3 w-3 animate-spin" /> : isAssigned ? <><StarOff className="h-3 w-3 mr-1 inline" /> Anulează</> : <><Star className="h-3 w-3 mr-1 inline" /> Setează reprezentativă</>}
                                    </Button>
                                  </div>
                                  <Button variant="destructive" size="sm" className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleImageDelete(image.id, image.file_path) }}>
                                    <XIcon className="h-4 w-4" />
                                  </Button>
                                  <a href={image.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-0" title="Deschide în tab nou" />
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {trayImages.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Nu există imagini încărcate
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Pentru lead-uri normale sau când nu este tăviță directă, afișează lista de fișe și tăvițe */}
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">
                    Fișe de serviciu și tăvițe
                  </h3>
                  
                  {loadingFiles ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      {/* Fișe de serviciu */}
                      {serviceFiles.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                            Fișe de serviciu
                          </h4>
                          {serviceFiles.map((file) => {
                            const fileTrays = trays.filter(t => t.service_file_id === file.id)
                            return (
                              <div key={file.id} className="border rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-3">
                                  <FileText className="h-5 w-5 text-muted-foreground" />
                                  <div className="flex-1">
                                    <p className="font-medium">Fișă #{file.number}</p>
                                    <p className="text-sm text-muted-foreground">
                                      Status: {getStatusLabel(file.status)}
                                    </p>
                                    {file.date && (
                                      <p className="text-xs text-muted-foreground">
                                        {new Date(file.date).toLocaleDateString('ro-RO')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Tăvițe pentru această fișă */}
                                {fileTrays.length > 0 ? (
                                  <div className="ml-8 space-y-2 pt-2 border-t">
                                    {fileTrays.map((tray) => (
                                      <div 
                                        key={tray.id} 
                                        className="flex items-center justify-between gap-3 p-2 border rounded-lg cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                                        onClick={() => handleOpenTray(tray.id)}
                                      >
                                        <div className="flex items-center gap-3 flex-1">
                                          <Package className="h-4 w-4 text-muted-foreground" />
                                          <div className="flex-1">
                                            <p className="text-sm font-medium">Tăviță #{tray.number}</p>
                                            <p className="text-xs text-muted-foreground">
                                              {getStatusLabel(tray.status)}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 touch-manipulation"
                                            onClick={(e) => { e.stopPropagation(); openEditTray(tray.id, tray.number) }}
                                            aria-label="Editează nr. tăviței"
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground/80 ml-8 pt-2 border-t">
                                    Dacă fișa a fost arhivată, conținutul a fost mutat în arhivă.
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Tăvițe fără fișă (dacă există) */}
                      {(() => {
                        const serviceFilesArray = Array.isArray(serviceFiles) ? serviceFiles : []
                        const traysWithoutFile = trays.filter(t => {
                          // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
                          if (!t || !t.service_file_id) return true
                          for (let i = 0; i < serviceFilesArray.length; i++) {
                            const f = serviceFilesArray[i]
                            if (f && f.id === t.service_file_id) {
                              return false
                            }
                          }
                          return true
                        })
                        return traysWithoutFile.length > 0
                      })() && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                            Tăvițe
                          </h4>
                          {(() => {
                            const serviceFilesArray = Array.isArray(serviceFiles) ? serviceFiles : []
                            return trays
                              .filter(t => {
                                // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
                                if (!t || !t.service_file_id) return true
                                for (let i = 0; i < serviceFilesArray.length; i++) {
                                  const f = serviceFilesArray[i]
                                  if (f && f.id === t.service_file_id) {
                                    return false
                                  }
                                }
                                return true
                              })
                              .map((tray) => (
                              <div 
                                key={tray.id} 
                                className="flex items-center justify-between gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                                onClick={() => handleOpenTray(tray.id)}
                              >
                                <div className="flex items-center gap-3 flex-1">
                                  <Package className="h-5 w-5 text-muted-foreground" />
                                  <div className="flex-1">
                                    <p className="font-medium">Tăviță #{tray.number}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {getStatusLabel(tray.status)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 touch-manipulation"
                                    onClick={(e) => { e.stopPropagation(); openEditTray(tray.id, tray.number) }}
                                    aria-label="Editează nr. tăviței"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-2"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleOpenTray(tray.id)
                                    }}
                                  >
                                    <Wrench className="h-4 w-4" />
                                    Deschide
                                  </Button>
                                </div>
                              </div>
                            ))
                          })()}
                        </div>
                      )}

                      {/* Mesaj dacă nu există fișe sau tăvițe */}
                      {serviceFiles.length === 0 && trays.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          Nu există fișe sau tăvițe asociate
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* Dialog editare nr. tăviței */}
          <Dialog open={!!editingTrayId} onOpenChange={(open) => !open && setEditingTrayId(null)}>
            <DialogContent className="max-w-[90vw] sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Editează nr. tăviței</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Număr</Label>
                  <Input
                    placeholder="ex: 26, 27..."
                    value={editTrayNumber}
                    onChange={(e) => setEditTrayNumber(e.target.value)}
                    className="h-10 text-sm mt-1"
                    autoFocus
                    disabled={savingTrayEdit}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setEditingTrayId(null)} disabled={savingTrayEdit}>
                    Anulează
                  </Button>
                  <Button onClick={handleSaveTrayEdit} disabled={!editTrayNumber.trim() || savingTrayEdit}>
                    {savingTrayEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvează'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Dialog adăugare serviciu */}
          <Dialog open={addServiceOpen} onOpenChange={setAddServiceOpen}>
                <DialogContent className="max-w-[90vw] sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Adaugă Serviciu</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Serviciu</Label>
                      <Select
                        value={newService.service_id}
                        onValueChange={(value) => setNewService(prev => ({ ...prev, service_id: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selectează serviciu" />
                        </SelectTrigger>
                        <SelectContent>
                          {services
                            .filter(s => {
                              // Filtrează serviciile care au instrumente care există deja în tăviță
                              const trayInstruments = new Set(trayItems.map(item => item.instrument_id).filter(Boolean))
                              return s.instrument_id && trayInstruments.has(s.instrument_id)
                            })
                            .map((service) => (
                              <SelectItem key={service.id} value={service.id}>
                                {service.name} - {(service.price ?? 0).toFixed(2)} RON
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Cantitate</Label>
                      <Input
                        type="number"
                        value={newService.qty}
                        onChange={(e) => setNewService(prev => ({ ...prev, qty: Number(e.target.value) || 1 }))}
                        min="1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleAddService} className="flex-1">
                        Adaugă
                      </Button>
                      <Button variant="outline" onClick={() => setAddServiceOpen(false)}>
                        Anulează
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Dialog adăugare piesă */}
              {isReparatiiPipeline && (
                <Dialog open={addPartOpen} onOpenChange={setAddPartOpen}>
                  <DialogContent className="max-w-[90vw] sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Adaugă Piesă</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Piesă</Label>
                        <Select
                          value={newPart.part_id}
                          onValueChange={(value) => setNewPart(prev => ({ ...prev, part_id: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selectează piesă" />
                          </SelectTrigger>
                          <SelectContent>
                            {parts.map((part) => (
                              <SelectItem key={part.id} value={part.id}>
                                {part.name} - {(part.price ?? 0).toFixed(2)} RON
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Cantitate</Label>
                        <Input
                          type="number"
                          value={newPart.qty}
                          onChange={(e) => setNewPart(prev => ({ ...prev, qty: Number(e.target.value) || 1 }))}
                          min="1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleAddPart} className="flex-1">
                          Adaugă
                        </Button>
                        <Button variant="outline" onClick={() => setAddPartOpen(false)}>
                          Anulează
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

          {/* Dialog Împarte volumul către alt tehnician (mobil – la fel ca desktop) – doar când feature e activ */}
          {SPLIT_TRAY_FEATURE_ENABLED && isDepartmentPipeline && getTrayId() && trayItems.length > 0 && techniciansForSplit.length > 0 && (
            <SplitTrayTechnicianDialog
              open={splitOpen}
              onOpenChange={setSplitOpen}
              items={trayItems as any}
              technicians={techniciansForSplit}
              instruments={instruments}
              services={services as any}
              onConfirm={async ({ targetTechnicianId, moves }) => {
                const { error } = await splitTrayItemsToTechnician({
                  trayId: getTrayId()!,
                  targetTechnicianId,
                  moves,
                })
                if (error) {
                  toast.error(error?.message ?? 'Nu s-a putut împărți către tehnician')
                  throw error
                }
                toast.success('Volum împărțit către tehnician')
                setSplitOpen(false)
                setTrayItemsRefreshKey(k => k + 1)
              }}
            />
          )}

          {/* Dialog Împarte tăvița în 2/3 tăvițe (mobil – la fel ca desktop) – doar când feature e activ */}
          {SPLIT_TRAY_FEATURE_ENABLED && isDepartmentPipeline && getTrayId() && pipelineIdForTray && user && (
            <SplitTrayToRealTraysDialog
              open={splitRealOpen}
              onOpenChange={setSplitRealOpen}
              items={trayItems as any}
              instruments={instruments}
              technicians={techniciansForSplit}
              currentUserId={user.id}
              currentUserDisplayName={(user as any).user_metadata?.display_name ?? (user as any).email?.split?.('@')[0] ?? 'Eu'}
              onConfirm={async (args) => {
                const { data, error } = await splitTrayToRealTrays({
                  originalTrayId: getTrayId()!,
                  pipelineId: pipelineIdForTray,
                  assignments: args.assignments,
                })
                if (error) {
                  toast.error(error?.message ?? 'Nu s-a putut împărți tăvița')
                  throw error
                }
                toast.success('Tăvița a fost împărțită')
                setSplitRealOpen(false)
                onItemStageUpdated?.(getTrayId()!, '', '')
                setTrayItemsRefreshKey(k => k + 1)
              }}
            />
          )}

          {/* Tab Mesagerie - full height, lasă spațiu pentru butoane */}
          <TabsContent value="messaging" className="mt-2 px-[4px] flex flex-col flex-1 min-h-0 overflow-hidden">
            {getLeadId() ? (
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <LeadMessenger 
                  leadId={getLeadId()!} 
                  leadTechnician={lead.technician || null}
                  compact
                />
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Nu s-a putut identifica lead-ul
              </div>
            )}
          </TabsContent>
        </Tabs>
        )}

        {/* FAB pentru adăugare serviciu – ascuns pe tab Mesagerie ca să nu acopere butonul Trimite */}
        {getTrayId() && activeTab !== 'messaging' && (
          <Button
            onClick={() => setAddServiceOpen(true)}
            className="fixed bottom-24 right-6 h-14 w-14 rounded-full shadow-lg z-50"
            size="icon"
          >
            <Plus className="h-6 w-6" />
          </Button>
        )}

        {/* Action buttons – mereu la fund cu înălțime fixă */}
        {!isReceptiePipeline && (onMove || onEdit) && (
          <div className="flex gap-2 mt-auto pt-3 border-t flex-shrink-0 bg-background">
            {onMove && (
              <Button variant="outline" size="sm" className="flex-1 h-11 min-h-11" onClick={onMove}>
                Mută lead
              </Button>
            )}
            {onEdit && (
              <Button variant="default" size="sm" className="flex-1 h-11 min-h-11" onClick={onEdit}>
                Editează
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

