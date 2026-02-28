'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  User,
  Phone,
  Mail,
  MapPin,
  FileCheck,
  Printer,
  FileText,
  Loader2,
  ExternalLink,
  AlertCircle,
  RotateCcw,
  Percent,
  MessageSquare,
  PhoneOff,
  Pin,
  Tag,
  Plus,
  ChevronDown,
  Package,
} from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import {
  listServiceFilesForLead,
  listTraysForServiceFile,
  getServiceFile,
  updateServiceFileWithHistory,
  updateServiceFile,
  clearTrayPositionsOnFacturare,
} from '@/lib/supabase/serviceFileOperations'
import {
  addServiceFileToPipeline,
  tryMoveLeadToArhivatIfAllFacturate,
  moveItemToStage,
  getPipelineIdForItem,
} from '@/lib/supabase/pipelineOperations'
import { findStageByPattern } from '@/lib/supabase/kanban/constants'
import { updateLeadWithHistory } from '@/lib/supabase/leadOperations'
import { fetchStagesForPipeline } from '@/lib/supabase/kanban/fetchers'
import { listServices } from '@/lib/supabase/serviceOperations'
import { listQuoteItems } from '@/lib/utils/preturi-helpers'
import { useToast } from '@/hooks/use-toast'
import { PrintView, PrintTraysView } from '@/components/print'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import { getOrCreateNuRaspundeTag, addLeadTagIfNotPresent, getOrCreatePinnedTag, toggleLeadTag, listTags, type Tag as TagType } from '@/lib/supabase/tagOperations'
import { NuRaspundeDialog } from '@/components/leads/vanzari/NuRaspundeDialog'
import type { LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'

const supabase = supabaseBrowser()

export interface DeFacturatOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Cardul Kanban (service_file în stage DE FACTURAT) */
  lead: any
  /** Pipeline-uri cu stage-uri (pentru facturare: Recepție + Ridic/De trimis) */
  pipelinesWithStages?: Array<{ id: string; name: string; stages?: Array<{ id: string; name: string }> }>
  onRefresh?: () => void
  /** Actualizare optimistă: după „Nu răspunde” reușit, actualizează cardul în timp real (tag + dată + coloană). */
  onNuRaspundeOptimistic?: (params: { serviceFileId: string; leadId: string; nuRaspundeCallbackAt: string; tag: { id: string; name: string }; stageId: string; stageName: string }) => void
  /** Deschide panelul complet de detalii */
  onOpenFullDetails?: () => void
}

type SheetData = {
  quote: { id: string; number: string; service_file_id: string }
  items: LeadQuoteItem[]
  subtotal: number
  totalDiscount: number
  urgentAmount: number
  total: number
}

/** Cache pentru datele overlay De facturat – evită refresh la re-deschidere același tab/card. TTL 5 min. */
const CACHE_TTL_MS = 5 * 60 * 1000
type DeFacturatCacheEntry = {
  leadFull: any
  serviceFile: any
  quotes: any[]
  sheetsData: SheetData[]
  allSheetsTotal: number
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  convMessages: Array<{ id: string; content: string | null; message_type: string | null; created_at: string; sender_id?: string }>
  senderNamesByUserId?: Record<string, string>
  cachedAt: number
}
const defacturatCache = new Map<string, DeFacturatCacheEntry>()

function getCacheKey(lead: any): string {
  if (!lead) return ''
  const type = lead?.type === 'service_file' ? 'sf' : 'lead'
  const id = lead?.id ?? ''
  return `defacturat-${type}-${id}`
}

export function DeFacturatOverlay({
  open,
  onOpenChange,
  lead: kanbanLead,
  pipelinesWithStages = [],
  onRefresh,
  onNuRaspundeOptimistic,
  onOpenFullDetails,
}: DeFacturatOverlayProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [leadFull, setLeadFull] = useState<any>(null)
  const [serviceFile, setServiceFile] = useState<any>(null)
  const [quotes, setQuotes] = useState<any[]>([])
  const [sheetsData, setSheetsData] = useState<SheetData[]>([])
  const [allSheetsTotal, setAllSheetsTotal] = useState(0)
  const [services, setServices] = useState<Service[]>([])
  const [instruments, setInstruments] = useState<Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>>([])
  const [pipelinesWithIds, setPipelinesWithIds] = useState<Array<{ id: string; name: string }>>([])
  const [facturareLoading, setFacturareLoading] = useState(false)
  const [printSection, setPrintSection] = useState<'none' | 'fisa' | 'tavite'>('none')
  const [editAddress, setEditAddress] = useState<{ strada?: string; address?: string; city?: string; judet?: string; zip?: string }>({})
  const [editBilling, setEditBilling] = useState<{ full_name?: string; phone_number?: string; email?: string }>({})
  const [billingSaving, setBillingSaving] = useState(false)
  const [convMessages, setConvMessages] = useState<Array<{ id: string; content: string | null; message_type: string | null; created_at: string; sender_id?: string }>>([])
  const [senderNamesByUserId, setSenderNamesByUserId] = useState<Record<string, string>>({})
  const [showNuRaspundeDialog, setShowNuRaspundeDialog] = useState(false)
  const [isPinning, setIsPinning] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [retrimiteLoading, setRetrimiteLoading] = useState(false)
  const [techniciansByTrayId, setTechniciansByTrayId] = useState<Map<string, string>>(new Map())
  const [allTags, setAllTags] = useState<TagType[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)
  const [togglingTagId, setTogglingTagId] = useState<string | null>(null)
  const [localTags, setLocalTags] = useState<{ id: string; name: string }[]>([])
  const [mobileTab, setMobileTab] = useState<'detalii' | 'istoric'>('detalii')

  const isMobile = useIsMobile()
  const DEPARTMENT_NAMES = ['Saloane', 'Frizerii', 'Horeca', 'Reparatii']

  const fisaId = serviceFile?.id ?? (kanbanLead?.type === 'service_file' ? kanbanLead?.id : null)
  const leadId = leadFull?.id ?? kanbanLead?.leadId ?? kanbanLead?.lead_id ?? (kanbanLead?.type === 'service_file' ? null : kanbanLead?.id)

  useEffect(() => {
    const tags = Array.isArray(kanbanLead?.tags) ? kanbanLead.tags : []
    const pinned = tags.some((t: any) => t?.name === 'PINNED')
    setIsPinned(pinned)
  }, [kanbanLead?.tags])

  useEffect(() => {
    const t = Array.isArray(kanbanLead?.tags) ? kanbanLead.tags : []
    setLocalTags(t)
  }, [open, kanbanLead?.tags])

  useEffect(() => {
    if (!open || !leadId) return
    setTagsLoading(true)
    listTags()
      .then(setAllTags)
      .catch(() => toast({ title: 'Eroare', description: 'Nu s-au putut încărca tag-urile', variant: 'destructive' }))
      .finally(() => setTagsLoading(false))
  }, [open, leadId, toast])

  // Ref stabil pentru kanbanLead – evită recrearea loadData la fiecare render
  const kanbanLeadRef = useRef(kanbanLead)
  kanbanLeadRef.current = kanbanLead

  const loadData = useCallback(async (silentRefresh = false) => {
    const kl = kanbanLeadRef.current
    if (!open || !kl) return
    const cacheKey = getCacheKey(kl)
    const cached = cacheKey ? defacturatCache.get(cacheKey) : null
    const cacheValid = cached && cached.cachedAt > Date.now() - CACHE_TTL_MS

    if (cacheValid && !silentRefresh) {
      setLeadFull(cached.leadFull)
      setServiceFile(cached.serviceFile)
      setQuotes(cached.quotes)
      setSheetsData(cached.sheetsData)
      setAllSheetsTotal(cached.allSheetsTotal)
      setServices(cached.services)
      setInstruments(cached.instruments)
      setPipelinesWithIds(cached.pipelinesWithIds)
      setConvMessages(cached.convMessages ?? [])
      setSenderNamesByUserId(cached.senderNamesByUserId ?? {})
      setLoading(false)
      return
    }
    if (!silentRefresh) setLoading(true)
    try {
      const isFisa = kl?.type === 'service_file'
      const fid = isFisa ? kl?.id : null
      const lid = isFisa ? (kl?.leadId ?? kl?.lead_id) : kl?.id

      let sf: any = null
      let finalLeadId: string | null = null
      let finalFisaId: string | null = null

      if (isFisa && fid) {
        const { data: sfData } = await getServiceFile(fid)
        sf = sfData
        finalLeadId = sf?.lead_id ?? lid ?? null
        finalFisaId = fid
      } else if (lid) {
        const { data: files } = await listServiceFilesForLead(lid)
        const notFacturata = (files || []).find((f: any) => String(f.status || '').toLowerCase() !== 'facturata')
        sf = notFacturata || (files || [])[0]
        finalLeadId = lid
        finalFisaId = sf?.id ?? null
      }

      if (!finalLeadId && !sf?.lead_id) {
        setLeadFull(kl)
        setQuotes([])
        setSheetsData([])
        setLoading(false)
        return
      }
      if (!finalLeadId) finalLeadId = sf?.lead_id ?? null
      if (!finalFisaId) finalFisaId = sf?.id ?? null

      const fetchConvMessages = async (lid: string) => {
        const { data: conv } = await supabase.from('conversations').select('id').eq('related_id', lid).eq('type', 'lead').maybeSingle()
        if (!conv?.id) return []
        const { data: msgs } = await supabase.from('messages').select('id, content, message_type, created_at, sender_id').eq('conversation_id', conv.id).order('created_at', { ascending: true })
        return (msgs || []).filter((m: any) => (m.message_type || '').toLowerCase() !== 'system')
      }

      const [leadRes, servicesRes, instrumentsRes, pipelinesRes, msgsList] = await Promise.all([
        finalLeadId
          ? supabase.from('leads').select('*').eq('id', finalLeadId).single()
          : Promise.resolve({ data: null }),
        listServices(),
        supabase.from('instruments').select('id,name,weight,department_id,pipeline,active').then(({ data }) => ({ data: data || [] })),
        pipelinesWithStages.length > 0
          ? Promise.resolve(pipelinesWithStages.map((p: any) => ({ id: p.id, name: p.name })))
          : supabase.from('pipelines').select('id,name').then(({ data }) => ({ data: data || [] })),
        finalLeadId ? fetchConvMessages(finalLeadId) : Promise.resolve([]),
      ])

      const leadData = leadRes?.data ?? kl
      const messagesList = Array.isArray(msgsList) ? msgsList : []
      setLeadFull(leadData)
      setServiceFile(sf || null)
      setServices(servicesRes || [])
      setInstruments((instrumentsRes as any)?.data ?? instrumentsRes ?? [])
      setConvMessages(messagesList)

      let senderNamesMap: Record<string, string> = {}
      const senderIds = [...new Set((messagesList as any[]).map((m: any) => m.sender_id).filter(Boolean))]
      if (senderIds.length > 0) {
        const { data: members } = await supabase.from('app_members').select('user_id, name').in('user_id', senderIds)
        ;(members || []).forEach((m: any) => { senderNamesMap[m.user_id] = (m.name || '').trim() || `User ${String(m.user_id).slice(0, 8)}` })
        setSenderNamesByUserId(senderNamesMap)
      } else {
        setSenderNamesByUserId({})
      }
      const pipes = pipelinesRes?.data ?? pipelinesRes ?? []
      setPipelinesWithIds(Array.isArray(pipes) ? pipes : [])

      if (!finalFisaId) {
        setQuotes([])
        setSheetsData([])
        setAllSheetsTotal(0)
        setLoading(false)
        return
      }

      const { data: trays } = await listTraysForServiceFile(finalFisaId)
      const quotesList = (trays || []).map((t: any) => ({ ...t, fisa_id: finalFisaId }))
      setQuotes(quotesList)

      // Încarcă numele tehnicienilor pentru print tăvițe
      const techIds = new Set<string>()
      quotesList.forEach((q: any) => {
        if (q?.technician_id) techIds.add(q.technician_id)
        if (q?.technician2_id) techIds.add(q.technician2_id)
        if (q?.technician3_id) techIds.add(q.technician3_id)
      })
      if (techIds.size > 0) {
        const { data: members } = await supabase.from('app_members').select('user_id, name').in('user_id', Array.from(techIds))
        const techMap = new Map<string, string>()
        ;(members || []).forEach((m: any) => { techMap.set(m.user_id, m.name || `User ${String(m.user_id).slice(0, 8)}`) })
        const trayTechMap = new Map<string, string>()
        quotesList.forEach((q: any) => {
          const names: string[] = []
          for (const id of [q?.technician_id, q?.technician2_id, q?.technician3_id].filter(Boolean)) {
            const n = techMap.get(id)
            if (n && !names.includes(n)) names.push(n)
          }
          trayTechMap.set(q.id, names.join(', ') || '—')
        })
        setTechniciansByTrayId(trayTechMap)
      }

      if (quotesList.length === 0) {
        setSheetsData([])
        setAllSheetsTotal(0)
        setLoading(false)
        return
      }

      const instrumentPipelineMap = new Map<string, string | null>()
      const pipelineMap = new Map<string, string>()
      ;(instrumentsRes as any)?.data?.forEach((i: any) => { if (i.pipeline) instrumentPipelineMap.set(i.id, i.pipeline) })
      pipes.forEach((p: any) => pipelineMap.set(p.id, p.name))

      const allItems: LeadQuoteItem[] = []
      for (const q of quotesList) {
        const items = await listQuoteItems(q.id, servicesRes, (instrumentsRes as any)?.data ?? [], pipes)
        allItems.push(...items.map((it: any) => ({ ...it, tray_id: q.id })))
      }

      const itemsByTray = new Map<string, LeadQuoteItem[]>()
      allItems.forEach((it: any) => {
        const tid = it.tray_id || (it as any).tray_id
        if (!itemsByTray.has(tid)) itemsByTray.set(tid, [])
        itemsByTray.get(tid)!.push(it)
      })

      const getRepairableQty = (it: any) => {
        const qty = it.qty || 1
        const unrepaired = Number(it.unrepaired_qty ?? it.non_repairable_qty) || 0
        return Math.max(0, qty - unrepaired)
      }

      const sheets: SheetData[] = quotesList.map((quote: any) => {
        const items = itemsByTray.get(quote.id) || []
        const visibleItems = items.filter((it: any) => it.item_type != null)
        const subtotal = visibleItems.reduce((acc: number, it: any) => acc + getRepairableQty(it) * (it.price || 0), 0)
        const totalDiscount = visibleItems.reduce(
          (acc: number, it: any) =>
            acc +
            getRepairableQty(it) * (it.price || 0) * (Math.min(100, Math.max(0, it.discount_pct || 0)) / 100),
          0
        )
        const isUrgentFisa = !!sf?.urgent
        const urgentAmount = visibleItems.reduce((acc: number, it: any) => {
          const afterDisc =
            getRepairableQty(it) * (it.price || 0) * (1 - Math.min(100, Math.max(0, it.discount_pct || 0)) / 100)
          return acc + ((it.urgent || isUrgentFisa) ? afterDisc * (URGENT_MARKUP_PCT / 100) : 0)
        }, 0)
        const total = subtotal - totalDiscount + urgentAmount
        return {
          quote: { id: quote.id, number: quote.number, service_file_id: quote.service_file_id || finalFisaId },
          items,
          subtotal,
          totalDiscount,
          urgentAmount,
          total,
        }
      })

      setSheetsData(sheets)
      const total = sheets.reduce((acc, s) => acc + s.total, 0)
      setAllSheetsTotal(total)

      if (cacheKey) {
        defacturatCache.set(cacheKey, {
          leadFull: leadData,
          serviceFile: sf || null,
          quotes: quotesList,
          sheetsData: sheets,
          allSheetsTotal: total,
          services: servicesRes || [],
          instruments: (instrumentsRes as any)?.data ?? [],
          pipelinesWithIds: Array.isArray(pipes) ? pipes : [],
          convMessages: messagesList,
          senderNamesByUserId: senderNamesMap,
          cachedAt: Date.now(),
        })
      }
    } catch (e: any) {
      console.error('[DeFacturatOverlay] loadData:', e)
      if (!silentRefresh) {
        toast({ title: 'Eroare la încărcare', description: e?.message || 'Date indisponibile', variant: 'destructive' })
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- kanbanLead este accesat prin ref stabil (kanbanLeadRef)
  }, [open, pipelinesWithStages, toast])

  useEffect(() => {
    if (open && kanbanLead) {
      defacturatCache.delete(getCacheKey(kanbanLead))
      loadData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadData este stabil acum, trigger doar pe id/type schimbat
  }, [open, kanbanLead?.id, kanbanLead?.type])

  useEffect(() => {
    if (!leadFull) {
      setEditAddress({})
      setEditBilling({})
      return
    }
    setEditAddress({
      strada: leadFull.strada ?? leadFull.address ?? '',
      address: leadFull.address ?? leadFull.strada ?? '',
      city: leadFull.city ?? '',
      judet: leadFull.judet ?? '',
      zip: leadFull.zip ?? '',
    })
    setEditBilling({
      full_name: leadFull.full_name ?? leadFull.name ?? '',
      phone_number: leadFull.phone_number ?? leadFull.phone ?? '',
      email: leadFull.email ?? '',
    })
  }, [leadFull?.id, leadFull?.strada, leadFull?.address, leadFull?.city, leadFull?.judet, leadFull?.zip, leadFull?.full_name, leadFull?.name, leadFull?.phone_number, leadFull?.phone, leadFull?.email])

  const saveBilling = useCallback(async () => {
    if (!leadId || billingSaving) return
    const dbUpdate: Record<string, string> = {}
    if (editBilling.full_name !== undefined) dbUpdate.full_name = editBilling.full_name
    if (editBilling.phone_number !== undefined) dbUpdate.phone_number = editBilling.phone_number
    if (editBilling.email !== undefined) dbUpdate.email = editBilling.email
    if (editAddress.strada !== undefined) dbUpdate.strada = editAddress.strada
    if (editAddress.address !== undefined) dbUpdate.address = editAddress.address
    if (editAddress.city !== undefined) dbUpdate.city = editAddress.city
    if (editAddress.judet !== undefined) dbUpdate.judet = editAddress.judet
    if (editAddress.zip !== undefined) dbUpdate.zip = editAddress.zip
    if (Object.keys(dbUpdate).length === 0) return
    setBillingSaving(true)
    try {
      const { error } = await updateLeadWithHistory(leadId, dbUpdate)
      if (error) throw error
      setLeadFull((prev: any) => (prev ? { ...prev, ...dbUpdate } : null))
      toast({ title: 'Salvat', description: 'Datele de facturare au fost actualizate.' })
    } catch (e: any) {
      toast({ title: 'Eroare', description: e?.message ?? 'Nu s-au putut salva datele', variant: 'destructive' })
    } finally {
      setBillingSaving(false)
    }
  }, [leadId, editAddress, editBilling, billingSaving, toast])

  const norm = (s: string) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  const handleFacturare = async (mode: 'facturare' | 'facturare_awb') => {
    if (!fisaId) return
    const receptie = (pipelinesWithStages || []).find(
      (p: any) => norm(p.name || '').includes('receptie')
    )
    if (!receptie?.id) {
      toast({ title: 'Pipeline Recepție negăsit', variant: 'destructive' })
      return
    }
    setFacturareLoading(true)
    try {
      const { error: statusErr } = await updateServiceFileWithHistory(fisaId, { status: 'facturata' })
      if (statusErr) throw statusErr

      const { data: stages, error: stagesErr } = await fetchStagesForPipeline(receptie.id)
      if (stagesErr || !stages?.length) throw new Error('Stage-uri Recepție indisponibile')
      const deTrimis = stages.find((s: any) => norm(s.name).includes('de trimis'))
      const ridicPersonal = stages.find((s: any) => norm(s.name).includes('ridic personal'))
      const target = mode === 'facturare_awb' ? deTrimis : ridicPersonal
      const stageLabel = mode === 'facturare_awb' ? 'De trimis' : 'Ridic personal'
      if (!target) throw new Error(`Stage "${stageLabel}" negăsit`)

      const { error: addErr } = await addServiceFileToPipeline(fisaId, receptie.id, target.id)
      if (addErr) throw addErr

      await clearTrayPositionsOnFacturare(fisaId)

      toast.success(
        mode === 'facturare_awb'
          ? 'Fișă facturată. Card mutat în De trimis.'
          : 'Fișă facturată. Card mutat în Ridic personal.'
      )
      defacturatCache.delete(getCacheKey(kanbanLead))
      onRefresh?.()
      onOpenChange(false)

      if (leadId) {
        try {
          const { moved } = await tryMoveLeadToArhivatIfAllFacturate(leadId)
          if (moved) toast.success('Toate fișele sunt facturate. Lead mutat în Arhivat (Vânzări).')
        } catch (_) {}
      }
    } catch (e: any) {
      toast({ title: 'Eroare la facturare', description: e?.message, variant: 'destructive' })
    } finally {
      setFacturareLoading(false)
    }
  }

  const handleNuRaspundeConfirm = async (timeStr: string, type: string) => {
    if (!fisaId || !leadId) return
    const receptie = (pipelinesWithStages || []).find((p: any) => norm(p.name || '').includes('receptie'))
    if (!receptie?.id) {
      toast({ title: 'Pipeline Recepție negăsit', variant: 'destructive' })
      return
    }
    const tagLeadId = serviceFile?.lead_id ?? leadId
    if (!tagLeadId) {
      toast({ title: 'Eroare', description: 'Lead-ul fișei nu a putut fi identificat', variant: 'destructive' })
      return
    }
    setFacturareLoading(true)
    try {
      const now = new Date()
      let target: Date
      if (type === 'custom') {
        const [h, m] = timeStr.split(':').map(Number)
        target = new Date(now)
        target.setHours(h, m, 0, 0)
        if (target <= now) target.setDate(target.getDate() + 1)
      } else {
        const [h, m] = timeStr.split(':').map(Number)
        target = new Date(now)
        target.setHours(h, m, 0, 0)
        if (target <= now) target.setDate(target.getDate() + 1)
      }

      const nuRaspundeTag = await getOrCreateNuRaspundeTag()
      await addLeadTagIfNotPresent(tagLeadId, nuRaspundeTag.id)

      const { error: updateErr } = await updateServiceFileWithHistory(fisaId, { nu_raspunde_callback_at: target.toISOString() })
      if (updateErr) throw updateErr

      const { data: stages } = await fetchStagesForPipeline(receptie.id)
      const nuRaspundeStage = stages?.find((s: any) => norm(s.name).includes('nuraspunde') || (norm(s.name).includes('nu') && norm(s.name).includes('raspunde')))
      if (!nuRaspundeStage) throw new Error('Stage Nu răspunde negăsit în Recepție')

      const { error: moveErr } = await moveItemToStage('service_file', fisaId, receptie.id, nuRaspundeStage.id)
      if (moveErr) throw moveErr

      setShowNuRaspundeDialog(false)
      defacturatCache.delete(getCacheKey(kanbanLead))
      onNuRaspundeOptimistic?.({
        serviceFileId: fisaId,
        leadId: leadId,
        nuRaspundeCallbackAt: target.toISOString(),
        tag: { id: nuRaspundeTag.id, name: nuRaspundeTag.name },
        stageId: nuRaspundeStage.id,
        stageName: nuRaspundeStage.name ?? 'Nu răspunde',
      })
      onRefresh?.()
      onOpenChange(false)
      toast({ title: 'Nu răspunde programat', description: `Fișa mutată în Nu răspunde. Reapel: ${target.toLocaleString('ro-RO')}` })
    } catch (e: any) {
      toast({ title: 'Eroare', description: e?.message ?? 'Nu s-a putut programa Nu răspunde', variant: 'destructive' })
    } finally {
      setFacturareLoading(false)
    }
  }

  const handlePinToggle = async () => {
    if (!leadId) return
    setIsPinning(true)
    try {
      const pinnedTag = await getOrCreatePinnedTag()
      await toggleLeadTag(leadId, pinnedTag.id)
      const newIsPinned = !isPinned
      setIsPinned(newIsPinned)
      onRefresh?.()
      toast({
        title: newIsPinned ? 'Fișă fixată' : 'Fișă desfixată',
        description: newIsPinned ? 'Fișa va apărea prima în stage' : 'Fișa a fost desfixată',
      })
    } catch (e: any) {
      toast({ title: 'Eroare', description: e?.message ?? 'Nu s-a putut actualiza starea de fixare', variant: 'destructive' })
    } finally {
      setIsPinning(false)
    }
  }

  /** Retrimite tăvițele în departament (stage Noua) cu tag Fixed pe lead, apoi mută fișa în Colet Ajuns. */
  const handleRetrimiteInDepartamentSiColetAjuns = async () => {
    if (!fisaId || !leadId) return
    const receptie = (pipelinesWithStages || []).find((p: any) => norm(p.name || '').includes('receptie'))
    if (!receptie?.id) {
      toast({ title: 'Eroare', description: 'Pipeline Recepție negăsit', variant: 'destructive' })
      return
    }
    const receptieStages = receptie.stages || []
    const coletAjunsStage = findStageByPattern(receptieStages, 'COLET_AJUNS')
    if (!coletAjunsStage) {
      toast({ title: 'Eroare', description: 'Stage „Colet ajuns” negăsit în Recepție', variant: 'destructive' })
      return
    }
    setRetrimiteLoading(true)
    try {
      await updateServiceFile(fisaId, { nu_raspunde_callback_at: null, colet_ajuns: true })
      const nuRaspundeTag = await getOrCreateNuRaspundeTag()
      await toggleLeadTag(leadId, nuRaspundeTag.id)
      const trayIds = (quotes || []).map((q: any) => q.id).filter(Boolean)
      for (const trayId of trayIds) {
        const { data: pipelineId } = await getPipelineIdForItem('tray', trayId)
        if (!pipelineId) continue
        const pipeline = (pipelinesWithStages || []).find((p: any) => p.id === pipelineId)
        if (!pipeline || !DEPARTMENT_NAMES.includes(pipeline.name)) continue
        let stages = Array.isArray(pipeline.stages) ? pipeline.stages : []
        if (stages.length === 0) {
          const { data: fetchedStages } = await fetchStagesForPipeline(pipelineId)
          stages = fetchedStages || []
        }
        const nouaStage = findStageByPattern(stages, 'NOUA')
        if (!nouaStage) continue
        const { error } = await moveItemToStage('tray', trayId, pipelineId, nouaStage.id)
        if (error) console.warn('[DeFacturatOverlay] move tray to Noua:', error)
      }
      const pinnedTag = await getOrCreatePinnedTag()
      await addLeadTagIfNotPresent(leadId, pinnedTag.id)
      const { error: moveErr } = await moveItemToStage('service_file', fisaId, receptie.id, coletAjunsStage.id)
      if (moveErr) throw moveErr
      toast.success('Tăvițele au fost retrimise în departament (Noua), tag Fixed aplicat, fișa mutată în Colet ajuns.')
      defacturatCache.delete(getCacheKey(kanbanLead))
      onRefresh?.()
      onOpenChange(false)
    } catch (e: any) {
      toast({ title: 'Eroare', description: e?.message ?? 'Nu s-a putut retrimite', variant: 'destructive' })
    } finally {
      setRetrimiteLoading(false)
    }
  }

  const handlePrintFisa = () => {
    setPrintSection('fisa')
    setTimeout(() => window.print(), 100)
  }
  const handlePrintTavite = () => {
    setPrintSection('tavite')
    setTimeout(() => window.print(), 300)
  }

  const leadForPrint = leadFull
    ? {
        id: leadFull.id,
        leadId: leadFull.id,
        name: leadFull.full_name ?? leadFull.name ?? '',
        phone: leadFull.phone_number ?? leadFull.phone ?? '',
        email: leadFull.email ?? '',
        company_name: leadFull.company_name ?? null,
        company_address: leadFull.company_address ?? leadFull.address ?? null,
        address: leadFull.address ?? leadFull.strada ?? null,
        street: leadFull.strada ?? leadFull.address ?? null,
        strada: leadFull.strada ?? null,
        city: leadFull.city ?? null,
        county: leadFull.judet ?? null,
        judet: leadFull.judet ?? null,
        zip: leadFull.zip ?? null,
      }
    : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          fullScreen
          className="flex flex-col p-4 sm:p-6 md:p-8 overflow-y-auto max-h-screen text-base"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl font-semibold">
              <FileCheck className="h-6 w-6 shrink-0" />
              <span className="break-words">De facturat – Fișă #{serviceFile?.number ?? kanbanLead?.serviceFileNumber ?? '—'}</span>
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-8">
              {/* Status livrare pentru fișă – afișează Curier trimis / Ridic la sediu ca să știi ce e ales sau ce să alegi */}
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Livrare:</span>
                {serviceFile?.curier_trimis ? (
                  <Badge variant="default" className="font-medium">Curier trimis</Badge>
                ) : serviceFile?.office_direct ? (
                  <Badge variant="secondary" className="font-medium">Ridic la sediu (office direct)</Badge>
                ) : (
                  <span className="text-muted-foreground italic">Neselectat – alege „Ridic personal” sau „De trimis (AWB)” mai jos</span>
                )}
              </div>
              {/* Butoane acțiuni */}
              <div className="flex flex-wrap items-center gap-3 border-b border-border pb-5">
                <Button
                  data-button-id="receptieFacturatRidicPersonalButton"
                  disabled={!fisaId || facturareLoading}
                  onClick={() => handleFacturare('facturare')}
                  className="gap-2 text-base min-h-11 flex-col sm:flex-row h-auto py-3"
                  title="Marchează ca facturat – clientul ridică de la sediu"
                >
                  {facturareLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  ) : (
                    <FileCheck className="h-5 w-5 shrink-0" />
                  )}
                  <span className="flex flex-col items-start sm:items-center">
                    <span>Facturat – Ridic personal</span>
                    <span className="text-xs opacity-90 font-normal">La sediu (clientul ridică)</span>
                  </span>
                </Button>
                <Button
                  data-button-id="receptieFacturatDeTrimisButton"
                  variant="outline"
                  disabled={!fisaId || facturareLoading}
                  onClick={() => handleFacturare('facturare_awb')}
                  className="gap-2 text-base min-h-11 flex-col sm:flex-row h-auto py-3"
                  title="Marchează ca facturat – trimitem cu curierul (AWB)"
                >
                  <FileCheck className="h-5 w-5 shrink-0" />
                  <span className="flex flex-col items-start sm:items-center">
                    <span>Facturat – De trimis (AWB)</span>
                    <span className="text-xs opacity-90 font-normal">Curier trimis</span>
                  </span>
                </Button>
                <Button
                  data-button-id="receptiePrintTaviteButton"
                  variant="outline"
                  onClick={handlePrintTavite}
                  disabled={sheetsData.length === 0}
                  className="gap-2 text-base min-h-11"
                >
                  <Printer className="h-5 w-5 shrink-0" />
                  Print Tăvițe
                </Button>
                <Button
                  data-button-id="receptiePrintFisaButton"
                  variant="outline"
                  onClick={handlePrintFisa}
                  disabled={sheetsData.length === 0}
                  className="gap-2 text-base min-h-11"
                >
                  <FileText className="h-5 w-5 shrink-0" />
                  Print Fișă
                </Button>
                {onOpenFullDetails && (
                  <Button data-button-id="receptieOpenFullDetailsButton" variant="ghost" onClick={onOpenFullDetails} className="gap-2 text-base min-h-11">
                    <ExternalLink className="h-5 w-5 shrink-0" />
                    Deschide detalii complete
                  </Button>
                )}
                <Button
                  data-button-id="receptieDeFacturatNuRaspundeButton"
                  variant="outline"
                  onClick={() => setShowNuRaspundeDialog(true)}
                  disabled={!fisaId || !leadId || facturareLoading}
                  className="gap-2 text-base min-h-11 border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                  title="Marchează ca Nu răspunde, adaugă tag și mută în stage Nu răspunde"
                >
                  <PhoneOff className="h-5 w-5 shrink-0" />
                  Nu răspunde
                </Button>
                <Button
                  data-button-id="receptieDeFacturatPinButton"
                  variant="outline"
                  onClick={handlePinToggle}
                  disabled={!leadId || isPinning}
                  className="gap-2 text-base min-h-11"
                  title={isPinned ? 'Desfixează fișa' : 'Fixează fișa (apare prima în stage)'}
                >
                  {isPinning ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <Pin className={`h-5 w-5 shrink-0 ${isPinned ? 'fill-current' : ''}`} />}
                  {isPinned ? 'Desfixează' : 'Fixează'}
                </Button>
                <Button
                  data-button-id="receptieRetrimiteDepartamentColetAjunsButton"
                  variant="outline"
                  onClick={handleRetrimiteInDepartamentSiColetAjuns}
                  disabled={!fisaId || !leadId || retrimiteLoading}
                  className="gap-2 text-base min-h-11 border-emerald-600/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                  title="Retrimite tăvițele în departament (stage Noua) cu tag Fixed, fișa în Colet ajuns"
                >
                  {retrimiteLoading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <RotateCcw className="h-5 w-5 shrink-0" />}
                  Retrimite în departament
                </Button>
              </div>

              {/* Tag-uri: afișare + atribuire */}
              {leadId && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground shrink-0">
                    <Tag className="h-4 w-4" />
                    Tag-uri
                  </span>
                  {localTags.map((t) => (
                    <Badge key={t.id} variant="secondary" className="text-xs font-medium">
                      {t.name}
                    </Badge>
                  ))}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-sm gap-1"
                        disabled={tagsLoading || allTags.length === 0}
                      >
                        {tagsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Adaugă tag
                        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-[280px] overflow-y-auto w-[200px]">
                      {allTags.map((tag) => {
                        const isOnLead = localTags.some((x) => x.id === tag.id)
                        return (
                          <DropdownMenuItem
                            key={tag.id}
                            onSelect={(e) => {
                              e.preventDefault()
                              if (togglingTagId) return
                              setTogglingTagId(tag.id)
                              const had = localTags.some((x) => x.id === tag.id)
                              setLocalTags((prev) => (had ? prev.filter((x) => x.id !== tag.id) : [...prev, { id: tag.id, name: tag.name }]))
                              toggleLeadTag(leadId, tag.id)
                                .then(() => onRefresh?.())
                                .catch((err) => {
                                  setLocalTags(Array.isArray(kanbanLead?.tags) ? kanbanLead.tags : [])
                                  toast({ title: 'Eroare', description: err?.message ?? 'Nu s-a putut actualiza tag-ul', variant: 'destructive' })
                                })
                                .finally(() => setTogglingTagId(null))
                            }}
                            disabled={togglingTagId !== null}
                          >
                            <span className={`inline-flex items-center gap-2 ${isOnLead ? 'font-semibold' : ''}`}>
                              <span className="rounded px-1.5 py-0.5 text-xs bg-muted">{tag.name}</span>
                              {isOnLead && <span className="text-xs text-muted-foreground">(pe fișă)</span>}
                            </span>
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              <NuRaspundeDialog
                open={showNuRaspundeDialog}
                onOpenChange={setShowNuRaspundeDialog}
                onConfirm={handleNuRaspundeConfirm}
                leadName={leadFull?.full_name ?? leadFull?.name ?? ''}
              />

              {/* Opțiuni fișă: Urgență, Retur, Discount global */}
              {serviceFile && (
                <section className="min-w-0 flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/20 border">
                  {serviceFile.urgent && (
                    <Badge variant="default" className="gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Urgență
                    </Badge>
                  )}
                  {serviceFile.retur && (
                    <Badge variant="secondary" className="gap-1">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Retur
                    </Badge>
                  )}
                  {(serviceFile.global_discount_pct ?? 0) > 0 && (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Percent className="h-4 w-4" />
                      Discount global: <strong className="text-foreground">{Number(serviceFile.global_discount_pct)}%</strong>
                    </span>
                  )}
                </section>
              )}

              {/* 1. Instrumente și servicii – afișat primul */}
              <section className="min-w-0">
                <h3 className="text-base font-semibold text-foreground mb-2">Instrumente și servicii</h3>
                <div className="rounded-lg border overflow-hidden min-w-0">
                  <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                    <table className="w-full min-w-[800px] text-sm border-collapse">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 border-b font-medium">Nr. Tăviță</th>
                          <th className="text-left p-2 border-b font-medium">Tehnicieni</th>
                          <th className="text-left p-2 border-b font-medium">Instrument</th>
                          <th className="text-left p-2 border-b font-medium">Serviciu / Piesă</th>
                          <th className="text-right p-2 border-b font-medium">Cant.</th>
                          <th className="text-center p-2 border-b font-medium">Garanție</th>
                          <th className="text-right p-2 border-b font-medium">Nr. nereparate</th>
                          <th className="text-right p-2 border-b font-medium">Preț</th>
                          <th className="text-right p-2 border-b font-medium">Disc.%</th>
                          <th className="text-right p-2 border-b font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheetsData.flatMap((sheet) =>
                          sheet.items
                            .filter((it: any) => it.item_type)
                            .map((it: any, idx: number) => {
                              const qty = it.qty ?? 1
                              const unrepaired = Number((it as any).unrepaired_qty) || 0
                              const repairableQty = Math.max(0, qty - unrepaired)
                              const price = it.price ?? 0
                              const disc = Math.min(100, Math.max(0, it.discount_pct || 0))
                              const afterDisc = repairableQty * price * (1 - disc / 100)
                              const isUrgent = it.urgent || !!serviceFile?.urgent
                              const total = isUrgent ? afterDisc * (1 + URGENT_MARKUP_PCT / 100) : afterDisc
                              const name =
                                it.name_snapshot ||
                                (it.service_id && services.find((s) => s.id === it.service_id)?.name) ||
                                '—'
                              const hasGarantie = it.garantie ?? false
                              const isUnrepaired = unrepaired > 0
                              const rowCls = isUnrepaired ? 'text-red-600 dark:text-red-400 font-bold' : ''
                              const trayNumber = sheet.quote.number || '—'
                              const technicianName = techniciansByTrayId.get(sheet.quote.id) || '—'
                              return (
                                <tr key={`${sheet.quote.id}-${it.id}-${idx}`} className={`border-b border-border/50 ${rowCls}`}>
                                  <td className="p-2 align-top min-w-0">
                                    <span className="break-words text-red-600 dark:text-red-400 font-bold">#{trayNumber}</span>
                                  </td>
                                  <td className="p-2 align-top min-w-0">
                                    <span className="break-words">{technicianName}</span>
                                  </td>
                                  <td className="p-2 align-top min-w-0">
                                    <span className="break-words">{it.instrument_name ?? instruments.find((i) => i.id === it.instrument_id)?.name ?? '—'}</span>
                                  </td>
                                  <td className="p-2 align-top min-w-0">
                                    <span className="break-words">{name}</span>
                                  </td>
                                  <td className="p-2 text-right align-top whitespace-nowrap">{qty}</td>
                                  <td className="p-2 text-center align-top whitespace-nowrap">{hasGarantie ? 'Da' : '—'}</td>
                                  <td className="p-2 text-right align-top whitespace-nowrap">{isUnrepaired ? unrepaired : '—'}</td>
                                  <td className="p-2 text-right align-top whitespace-nowrap">{price.toFixed(2)} RON</td>
                                  <td className="p-2 text-right align-top whitespace-nowrap">{disc > 0 ? `${disc}%` : '—'}</td>
                                  <td className="p-2 text-right align-top whitespace-nowrap">{total.toFixed(2)} RON</td>
                                </tr>
                              )
                            })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-2 border-t bg-muted/30 text-right font-semibold text-sm">
                    Total: {allSheetsTotal.toFixed(2)} RON
                  </div>
                  <div className="p-2 border-t bg-muted/40 text-right text-sm space-y-1">
                    <div className="text-red-600 dark:text-red-400 font-bold">Curier Toată România 49 + Total: {(allSheetsTotal + 49).toFixed(2)} RON</div>
                    <div className="text-red-600 dark:text-red-400 font-bold">Curier București 39 + Total: {(allSheetsTotal + 39).toFixed(2)} RON</div>
                  </div>
                </div>
              </section>

              {/* 2. Detalii Tehnician – mereu afișat; titlu roșu, bold; conținut roșu, bold, italic */}
              <section className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 shrink-0" />
                  Detalii Tehnician
                </h3>
                <div className="space-y-2 p-3 rounded-lg bg-muted/30 border text-sm">
                  {serviceFile?.technician_details && Array.isArray(serviceFile.technician_details) && serviceFile.technician_details.length > 0 ? (
                    serviceFile.technician_details.map((entry: any, i: number) => (
                      <div key={i} className="flex flex-col gap-0.5">
                        {entry.stageLabel && <span className="font-medium text-muted-foreground">{entry.stageLabel}</span>}
                        <p className="break-words text-red-600 dark:text-red-400 font-bold italic">{entry.text ?? ''}</p>
                        {entry.at && <span className="text-xs text-muted-foreground">{new Date(entry.at).toLocaleString('ro-RO')}</span>}
                      </div>
                    ))
                  ) : (
                    <p className="text-red-600 dark:text-red-400 font-bold italic">Nu există detalii comunicate de tehnician.</p>
                  )}
                </div>
              </section>

              {/* 3. Detalii comunicate de client */}
              {leadId && (
                <section className="min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 shrink-0" />
                    Detalii comunicate de client
                  </h3>
                  <div className="space-y-2 p-3 rounded-lg bg-muted/30 border text-sm">
                    {(leadFull?.details?.trim() || leadFull?.notes?.trim()) ? (
                      <div className="space-y-2">
                        {leadFull?.details?.trim() && <p className="break-words text-foreground">{leadFull.details}</p>}
                        {leadFull?.notes?.trim() && <p className="break-words text-foreground">{leadFull.notes}</p>}
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic">Nu există detalii comunicate de client.</p>
                    )}
                  </div>
                </section>
              )}

              {/* 4. Mesaje trimise în conversație de utilizatori – titlu și conținut roșu, bold */}
              {leadId && (
                <section className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 shrink-0" />
                    Mesaje trimise în conversație de utilizatori
                  </h3>
                  <div className="space-y-2 p-3 rounded-lg bg-muted/30 border text-sm max-h-[200px] overflow-y-auto">
                    {convMessages.length > 0 ? (
                      convMessages.map((msg) => {
                        const type = (msg.message_type || '').toLowerCase()
                        const content = msg.content?.trim()
                        const label = type === 'file' ? '[Fișier]' : type === 'image' ? '[Imagine]' : content || '[Mesaj gol]'
                        const senderName = msg.sender_id ? (senderNamesByUserId[msg.sender_id] || `User ${String(msg.sender_id).slice(0, 8)}`) : null
                        return (
                          <div key={msg.id} className="flex flex-col gap-0.5 py-2 border-b border-border/50 last:border-0">
                            {senderName && <span className="text-xs font-medium text-muted-foreground">{senderName}</span>}
                            <p className="break-words text-red-600 dark:text-red-400 font-bold">{label}</p>
                            <span className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleString('ro-RO')}</span>
                          </div>
                        )
                      })
                    ) : (
                      <p className="text-muted-foreground italic">Nu există mesaje în conversație.</p>
                    )}
                  </div>
                </section>
              )}

              {/* 5. Date facturare – afișat ultimul */}
              <section className="min-w-0">
                <h3 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
                  <User className="h-4 w-4 shrink-0" />
                  Date facturare
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-lg bg-muted/30 border text-sm min-w-0">
                  <div className="col-span-2 sm:col-span-4">
                    <Label className="text-xs text-muted-foreground">Persoana ridicare</Label>
                    <Input
                      className="mt-0.5 h-9 text-sm"
                      value={editBilling.full_name ?? ''}
                      onChange={(e) => setEditBilling((p) => ({ ...p, full_name: e.target.value }))}
                      placeholder="Nume persoană ridicare"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Telefon</Label>
                    <Input
                      className="mt-0.5 h-9 text-sm"
                      value={editBilling.phone_number ?? ''}
                      onChange={(e) => setEditBilling((p) => ({ ...p, phone_number: e.target.value }))}
                      placeholder="+40 ..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input
                      className="mt-0.5 h-9 text-sm"
                      type="email"
                      value={editBilling.email ?? ''}
                      onChange={(e) => setEditBilling((p) => ({ ...p, email: e.target.value }))}
                      placeholder="email@exemplu.ro"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Adresă
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-0.5">
                      <Input
                        className="h-9 text-sm col-span-2"
                        value={editAddress.strada ?? editAddress.address ?? ''}
                        onChange={(e) => setEditAddress((p) => ({ ...p, strada: e.target.value, address: e.target.value }))}
                        placeholder="Stradă / Adresă"
                      />
                      <Input
                        className="h-9 text-sm"
                        value={editAddress.city ?? ''}
                        onChange={(e) => setEditAddress((p) => ({ ...p, city: e.target.value }))}
                        placeholder="Oraș"
                      />
                      <Input
                        className="h-9 text-sm"
                        value={editAddress.judet ?? ''}
                        onChange={(e) => setEditAddress((p) => ({ ...p, judet: e.target.value }))}
                        placeholder="Județ"
                      />
                      <Input
                        className="h-9 text-sm"
                        value={editAddress.zip ?? ''}
                        onChange={(e) => setEditAddress((p) => ({ ...p, zip: e.target.value }))}
                        placeholder="Cod poștal"
                      />
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <Button data-button-id="receptieSaveBillingButton" type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={saveBilling} disabled={billingSaving}>
                      {billingSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvează date facturare'}
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Zone ascunse pentru print */}
      <div id="de-facturat-print-area" className="hidden print:!block print:!visible">
        {printSection === 'fisa' && leadForPrint && sheetsData.length > 0 && (
          <PrintView
            lead={leadForPrint as any}
            sheets={sheetsData as any}
            allSheetsTotal={allSheetsTotal}
            urgentMarkupPct={URGENT_MARKUP_PCT}
            services={services}
            instruments={instruments}
            serviceFileNumber={serviceFile?.number}
            isPrintMode
          />
        )}
        {printSection === 'tavite' && leadForPrint && sheetsData.length > 0 && (
          <PrintTraysView
            lead={leadForPrint as any}
            sheets={sheetsData as any}
            serviceFileNumber={serviceFile?.number}
            officeDirect={!!serviceFile?.office_direct}
            curierTrimis={!!serviceFile?.curier_trimis}
            services={services}
            instruments={instruments}
            techniciansByTrayId={techniciansByTrayId}
            isPrintMode
          />
        )}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #de-facturat-print-area, #de-facturat-print-area * { visibility: visible; }
          #de-facturat-print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}} />
    </>
  )
}
