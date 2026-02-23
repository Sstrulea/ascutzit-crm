'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  FileText,
  Package,
  User,
  PhoneOff,
  ExternalLink,
  AlertCircle,
  RotateCcw,
  Percent,
  MessageSquare,
  Printer,
  Pin,
  ArrowUpCircle,
} from 'lucide-react'
import { getServiceFile, listTraysForServiceFile } from '@/lib/supabase/serviceFileOperations'
import { moveItemToStage, getPipelineIdForItem } from '@/lib/supabase/pipelineOperations'
import { fetchStagesForPipeline } from '@/lib/supabase/kanban/fetchers'
import { matchesStagePattern, findStageByPattern } from '@/lib/supabase/kanban/constants'
import { getOrCreateNuRaspundeTag, toggleLeadTag, getOrCreatePinnedTag, getOrCreateUrgentareTag, addLeadTagIfNotPresent } from '@/lib/supabase/tagOperations'
import { listServices } from '@/lib/supabase/serviceOperations'
import { listQuoteItems } from '@/lib/utils/preturi-helpers'
import { useToast } from '@/hooks/use-toast'
import { PrintView, PrintTraysView } from '@/components/print'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import type { KanbanLead } from '@/lib/types/database'
import type { LeadQuoteItem } from '@/lib/types/preturi'

type SheetData = {
  quote: { id: string; number: string; service_file_id: string }
  items: LeadQuoteItem[]
  subtotal: number
  totalDiscount: number
  urgentAmount: number
  total: number
}

const supabase = supabaseBrowser()

export interface NuRaspundeOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Cardul Kanban (service_file în stage NU RASPUNDE) */
  lead: KanbanLead | null
  /** Pipeline-uri cu stage-uri (pentru Receptie) */
  pipelinesWithStages?: Array<{ id: string; name: string; stages?: Array<{ id: string; name: string }> }>
  onRefresh?: () => void
  /** Deschide panelul complet de detalii */
  onOpenFullDetails?: () => void
}

const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

export function NuRaspundeOverlay({
  open,
  onOpenChange,
  lead: kanbanLead,
  pipelinesWithStages = [],
  onRefresh,
  onOpenFullDetails,
}: NuRaspundeOverlayProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [serviceFile, setServiceFile] = useState<any>(null)
  const [leadFull, setLeadFull] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [quotes, setQuotes] = useState<any[]>([])
  const [sheetsData, setSheetsData] = useState<SheetData[]>([])
  const [allSheetsTotal, setAllSheetsTotal] = useState(0)
  const [services, setServices] = useState<any[]>([])
  const [instruments, setInstruments] = useState<Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>>([])
  const [convMessages, setConvMessages] = useState<Array<{ id: string; content: string | null; message_type: string | null; created_at: string; sender_id?: string }>>([])
  const [senderNamesByUserId, setSenderNamesByUserId] = useState<Record<string, string>>({})
  const [techniciansByTrayId, setTechniciansByTrayId] = useState<Map<string, string>>(new Map())
  const [printSection, setPrintSection] = useState<'fisa' | 'tavite' | null>(null)
  const [isPinning, setIsPinning] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [retrimiteLoading, setRetrimiteLoading] = useState(false)
  const [isUrgentaring, setIsUrgentaring] = useState(false)
  const kanbanLeadRef = useRef(kanbanLead)
  kanbanLeadRef.current = kanbanLead

  const fisaId = serviceFile?.id ?? (kanbanLead?.type === 'service_file' ? (kanbanLead as any)?.id : null)
  const leadId = leadFull?.id ?? (kanbanLead as any)?.leadId ?? (kanbanLead as any)?.lead_id ?? (kanbanLead?.type === 'service_file' ? null : (kanbanLead as any)?.id)

  const tags = Array.isArray((kanbanLead as any)?.tags) ? (kanbanLead as any).tags : []
  const isUrgentare = tags.some((t: any) => t?.name === 'Urgentare')

  useEffect(() => {
    const pinned = tags.some((t: any) => t?.name === 'PINNED')
    setIsPinned(pinned)
  }, [kanbanLead?.tags])

  const loadData = useCallback(async () => {
    const kl = kanbanLeadRef.current
    if (!open || !kl) return
    setLoading(true)
    setConvMessages([])
    setSenderNamesByUserId({})
    try {
      const isFisa = (kl as any)?.type === 'service_file'
      const fid = isFisa ? (kl as any)?.id : null
      const lid = isFisa ? ((kl as any)?.leadId ?? (kl as any)?.lead_id) : (kl as any)?.id

      let sf: any = null
      let finalLeadId: string | null = null
      let finalFisaId: string | null = null

      if (isFisa && fid) {
        const { data: sfData } = await getServiceFile(fid)
        sf = sfData
        finalLeadId = sf?.lead_id ?? lid ?? null
        finalFisaId = fid
      } else if (lid) {
        const { listServiceFilesForLead } = await import('@/lib/supabase/serviceFileOperations')
        const { data: files } = await listServiceFilesForLead(lid)
        sf = (files || [])[0]
        finalLeadId = lid
        finalFisaId = sf?.id ?? null
      }

      const fetchConvMessages = async (leadIdParam: string) => {
        const { data: conv } = await supabase.from('conversations').select('id').eq('related_id', leadIdParam).eq('type', 'lead').maybeSingle()
        if (!conv?.id) return []
        const { data: msgs } = await supabase.from('messages').select('id, content, message_type, created_at, sender_id').eq('conversation_id', conv.id).order('created_at', { ascending: true })
        return (msgs || []).filter((m: any) => (m.message_type || '').toLowerCase() !== 'system')
      }

      const pipes = pipelinesWithStages?.length
        ? pipelinesWithStages.map((p: any) => ({ id: p.id, name: p.name }))
        : (await supabase.from('pipelines').select('id,name').then(({ data }) => data || []))

      const [leadRes, servicesRes, instrumentsRes, msgsList] = await Promise.all([
        finalLeadId ? supabase.from('leads').select('*').eq('id', finalLeadId).single() : Promise.resolve({ data: null }),
        listServices(),
        supabase.from('instruments').select('id,name,weight,department_id,pipeline,active').then(({ data }) => ({ data: data || [] })),
        finalLeadId ? fetchConvMessages(finalLeadId) : Promise.resolve([]),
      ])

      const leadData = leadRes?.data ?? kl
      const messagesList = Array.isArray(msgsList) ? msgsList : []
      setLeadFull(leadData)
      setServiceFile(sf || null)
      setServices(servicesRes || [])
      setInstruments((instrumentsRes as any)?.data ?? [])
      setConvMessages(messagesList)

      const senderIds = [...new Set((messagesList as any[]).map((m: any) => m.sender_id).filter(Boolean))]
      if (senderIds.length > 0) {
        const { data: members } = await supabase.from('app_members').select('user_id, name').in('user_id', senderIds)
        const map: Record<string, string> = {}
        ;(members || []).forEach((m: any) => { map[m.user_id] = (m.name || '').trim() || `User ${String(m.user_id).slice(0, 8)}` })
        setSenderNamesByUserId(map)
      } else {
        setSenderNamesByUserId({})
      }

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

      const instrumentsData = (instrumentsRes as any)?.data ?? []
      const allItems: LeadQuoteItem[] = []
      for (const q of quotesList) {
        const items = await listQuoteItems(q.id, servicesRes, instrumentsData, pipes)
        allItems.push(...items.map((it: any) => ({ ...it, tray_id: q.id })))
      }

      const itemsByTray = new Map<string, LeadQuoteItem[]>()
      allItems.forEach((it: any) => {
        const tid = it.tray_id || (it as any).tray_id
        if (!tid) return
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
            acc + getRepairableQty(it) * (it.price || 0) * (Math.min(100, Math.max(0, it.discount_pct || 0)) / 100),
          0
        )
        const isUrgentFisa = !!sf?.urgent
        const urgentAmount = visibleItems.reduce((acc: number, it: any) => {
          const afterDisc = getRepairableQty(it) * (it.price || 0) * (1 - Math.min(100, Math.max(0, it.discount_pct || 0)) / 100)
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
      setAllSheetsTotal(sheets.reduce((acc, s) => acc + s.total, 0))
    } catch (e) {
      console.warn('[NuRaspundeOverlay] loadData:', e)
      setLeadFull(kanbanLead as any)
      setServiceFile(null)
      setQuotes([])
      setSheetsData([])
      setAllSheetsTotal(0)
      setConvMessages([])
      setSenderNamesByUserId({})
    } finally {
      setLoading(false)
    }
  }, [open, pipelinesWithStages])

  useEffect(() => {
    if (open && kanbanLead) loadData()
  }, [open, (kanbanLead as any)?.id, (kanbanLead as any)?.type, loadData])

  const getReceptieStages = useCallback(async () => {
    const receptie = (pipelinesWithStages || []).find((p: any) => norm(p.name || '').includes('receptie'))
    if (!receptie?.id) return { receptie: null, deTrimis: null, ridicPersonal: null, deFacturat: null }
    const { data: stages } = await fetchStagesForPipeline(receptie.id)
    const deTrimis = stages?.find((s: any) => norm(s.name).includes('de trimis') || norm(s.name).includes('detrimis'))
    const ridicPersonal = stages?.find((s: any) => norm(s.name).includes('ridic personal') || norm(s.name).includes('ridicpersonal'))
    const deFacturat = stages?.find((s: any) => matchesStagePattern(String(s?.name ?? ''), 'DE_FACTURAT'))
    return { receptie, deTrimis, ridicPersonal, deFacturat }
  }, [pipelinesWithStages])

  const clearNuRaspundeAndMove = useCallback(async (targetStage: { id: string; name: string } | null) => {
    if (!fisaId || !targetStage) return
    const { updateServiceFile } = await import('@/lib/supabase/serviceFileOperations')
    setActionLoading(true)
    try {
      await updateServiceFile(fisaId, { nu_raspunde_callback_at: null })
      if (leadId) {
        const tag = await getOrCreateNuRaspundeTag()
        await toggleLeadTag(leadId, tag.id)
      }
      const { receptie } = await getReceptieStages()
      if (!receptie?.id) throw new Error('Pipeline Recepție negăsit')
      const { error } = await moveItemToStage('service_file', fisaId, receptie.id, targetStage.id)
      if (error) throw error
      toast({
        title: 'Actualizat',
        description: `Fișa mutată în ${targetStage.name}. Tag „Nu răspunde” eliminat.`,
      })
      onRefresh?.()
      onOpenChange(false)
    } catch (e: any) {
      toast({ title: 'Eroare', description: e?.message ?? 'Nu s-a putut muta fișa', variant: 'destructive' })
    } finally {
      setActionLoading(false)
    }
  }, [fisaId, leadId, getReceptieStages, onRefresh, onOpenChange, toast])

  const handleMoveToDeTrimis = useCallback(async () => {
    const { deTrimis } = await getReceptieStages()
    if (!deTrimis) {
      toast({ title: 'Eroare', description: 'Stage „De trimis” negăsit în Recepție', variant: 'destructive' })
      return
    }
    await clearNuRaspundeAndMove(deTrimis)
  }, [getReceptieStages, clearNuRaspundeAndMove, toast])

  const handleMoveToRidicPersonal = useCallback(async () => {
    const { ridicPersonal } = await getReceptieStages()
    if (!ridicPersonal) {
      toast({ title: 'Eroare', description: 'Stage „Ridic personal” negăsit în Recepție', variant: 'destructive' })
      return
    }
    await clearNuRaspundeAndMove(ridicPersonal)
  }, [getReceptieStages, clearNuRaspundeAndMove, toast])

  const handleEliminaTag = useCallback(async () => {
    const { deFacturat } = await getReceptieStages()
    if (!deFacturat) {
      toast({ title: 'Eroare', description: 'Stage „De facturat” negăsit în Recepție', variant: 'destructive' })
      return
    }
    await clearNuRaspundeAndMove(deFacturat)
  }, [getReceptieStages, clearNuRaspundeAndMove, toast])

  const DEPARTMENT_NAMES = ['Saloane', 'Frizerii', 'Horeca', 'Reparatii']

  const handlePinToggle = useCallback(async () => {
    if (!leadId) return
    setIsPinning(true)
    try {
      const pinnedTag = await getOrCreatePinnedTag()
      await toggleLeadTag(leadId, pinnedTag.id)
      setIsPinned((p) => !p)
      toast({
        title: !isPinned ? 'Fișă fixată' : 'Fișă desfixată',
        description: !isPinned ? 'Fișa va apărea prima în stage' : 'Fișa a fost desfixată',
      })
      onRefresh?.()
    } finally {
      setIsPinning(false)
    }
  }, [leadId, isPinned, onRefresh, toast])

  const handleRetrimiteInDepartamentSiColetAjuns = useCallback(async () => {
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
      const { updateServiceFile } = await import('@/lib/supabase/serviceFileOperations')
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
        if (error) console.warn('[NuRaspundeOverlay] move tray to Noua:', error)
      }
      const pinnedTag = await getOrCreatePinnedTag()
      await addLeadTagIfNotPresent(leadId, pinnedTag.id)
      const { error: moveErr } = await moveItemToStage('service_file', fisaId, receptie.id, coletAjunsStage.id)
      if (moveErr) throw moveErr
      toast.success('Tăvițele au fost retrimise în departament (Noua), tag Fixed aplicat, fișa mutată în Colet ajuns.')
      onRefresh?.()
      onOpenChange(false)
    } catch (e: any) {
      toast({ title: 'Eroare', description: e?.message ?? 'Nu s-a putut retrimite', variant: 'destructive' })
    } finally {
      setRetrimiteLoading(false)
    }
  }, [fisaId, leadId, quotes, pipelinesWithStages, onRefresh, onOpenChange, toast])

  const handleUrgentareToggle = useCallback(async () => {
    if (!leadId) return
    setIsUrgentaring(true)
    try {
      const urgentareTag = await getOrCreateUrgentareTag()
      await toggleLeadTag(leadId, urgentareTag.id)
      onRefresh?.()
      toast({
        title: isUrgentare ? 'Urgentare anulată' : 'Urgentare activată',
        description: isUrgentare ? 'Fișa nu mai apare prima în listă.' : 'Fișa va apărea prima în listă.',
      })
    } finally {
      setIsUrgentaring(false)
    }
  }, [leadId, isUrgentare, onRefresh, toast])

  const clientName = leadFull?.full_name ?? leadFull?.name ?? (leadFull as any)?.company_name ?? '—'
  const clientPhone = leadFull?.phone_number ?? leadFull?.phone ?? '—'

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
            <PhoneOff className="h-6 w-6 shrink-0 text-amber-600" />
            <span className="break-words">Nu răspunde – Fișă #{serviceFile?.number ?? (kanbanLead as any)?.serviceFileNumber ?? '—'}</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{clientName}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Package className="h-4 w-4" />
                <span>Fișă #{serviceFile?.number ?? '—'}</span>
              </div>
              {clientPhone && clientPhone !== '—' && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Tel: {clientPhone}</span>
                </div>
              )}
            </div>

            {/* Status livrare */}
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Livrare:</span>
              {serviceFile?.curier_trimis ? (
                <Badge variant="default" className="font-medium">Curier trimis</Badge>
              ) : serviceFile?.office_direct ? (
                <Badge variant="secondary" className="font-medium">Ridic la sediu (office direct)</Badge>
              ) : (
                <span className="text-muted-foreground italic">Neselectat</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-b border-border pb-5">
              <Button
                disabled={!fisaId || actionLoading}
                onClick={handleMoveToDeTrimis}
                className="gap-2 text-base min-h-11"
                title="Mută fișa în De trimis și elimină tag-ul Nu răspunde"
              >
                {actionLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                ) : (
                  <FileText className="h-5 w-5 shrink-0" />
                )}
                Mută în De trimis
              </Button>
              <Button
                variant="outline"
                disabled={!fisaId || actionLoading}
                onClick={handleMoveToRidicPersonal}
                className="gap-2 text-base min-h-11"
                title="Mută fișa în Ridic personal și elimină tag-ul Nu răspunde"
              >
                <FileText className="h-5 w-5 shrink-0" />
                Mută în Ridic personal
              </Button>
              <Button
                variant="outline"
                disabled={!fisaId || actionLoading}
                onClick={handleEliminaTag}
                className="gap-2 text-base min-h-11 border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                title="Elimină tag-ul Nu răspunde și mută fișa în De facturat"
              >
                <PhoneOff className="h-5 w-5 shrink-0" />
                Elimină tag „Nu răspunde” (mută în De facturat)
              </Button>
              <Button
                variant="outline"
                onClick={() => { setPrintSection('tavite'); setTimeout(() => window.print(), 300); }}
                disabled={sheetsData.length === 0}
                className="gap-2 text-base min-h-11"
              >
                <Printer className="h-5 w-5 shrink-0" />
                Print Tăvițe
              </Button>
              <Button
                variant="outline"
                onClick={() => { setPrintSection('fisa'); setTimeout(() => window.print(), 100); }}
                disabled={sheetsData.length === 0}
                className="gap-2 text-base min-h-11"
              >
                <FileText className="h-5 w-5 shrink-0" />
                Print Fișă
              </Button>
              {onOpenFullDetails && (
                <Button variant="ghost" onClick={onOpenFullDetails} className="gap-2 text-base min-h-11">
                  <ExternalLink className="h-5 w-5 shrink-0" />
                  Deschide detalii complete
                </Button>
              )}
              <Button
                data-button-id="receptieNuRaspundePinButton"
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
                data-button-id="receptieNuRaspundeRetrimiteDepartamentButton"
                variant="outline"
                onClick={handleRetrimiteInDepartamentSiColetAjuns}
                disabled={!fisaId || !leadId || retrimiteLoading}
                className="gap-2 text-base min-h-11 border-emerald-600/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                title="Retrimite tăvițele în departament (stage Noua) cu tag Fixed, fișa în Colet ajuns"
              >
                {retrimiteLoading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <RotateCcw className="h-5 w-5 shrink-0" />}
                Retrimite în departament
              </Button>
              <Button
                data-button-id="receptieNuRaspundeUrgentareButton"
                variant="outline"
                onClick={handleUrgentareToggle}
                disabled={!leadId || isUrgentaring}
                className={`gap-2 text-base min-h-11 ${isUrgentare ? 'border-orange-500/50 text-orange-700 dark:text-orange-400 bg-orange-500/10' : ''}`}
                title={isUrgentare ? 'Anulează urgentare' : 'Urgentare (apare primul în listă)'}
              >
                {isUrgentaring ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <ArrowUpCircle className={`h-5 w-5 shrink-0 ${isUrgentare ? 'fill-current' : ''}`} />}
                {isUrgentare ? 'Anulează urgentare' : 'Urgentare'}
              </Button>
            </div>

            {/* Opțiuni fișă */}
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

            {/* Instrumente și servicii */}
            <section className="min-w-0">
              <h3 className="text-base font-semibold text-foreground mb-2">Instrumente și servicii</h3>
              <div className="rounded-lg border overflow-hidden min-w-0">
                <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                  <table className="w-full min-w-[640px] text-sm border-collapse">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
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
                            const unrepaired = Number((it as any).unrepaired_qty ?? it.non_repairable_qty) || 0
                            const repairableQty = Math.max(0, qty - unrepaired)
                            const price = it.price ?? 0
                            const disc = Math.min(100, Math.max(0, it.discount_pct || 0))
                            const afterDisc = repairableQty * price * (1 - disc / 100)
                            const isUrgent = it.urgent || !!serviceFile?.urgent
                            const total = isUrgent ? afterDisc * (1 + URGENT_MARKUP_PCT / 100) : afterDisc
                            const name = it.name_snapshot || (it.service_id && services.find((s) => s.id === it.service_id)?.name) || '—'
                            const hasGarantie = it.garantie ?? (it as any).brand_groups?.some((g: any) => g.garantie) ?? false
                            const isUnrepaired = unrepaired > 0
                            const rowCls = isUnrepaired ? 'text-red-600 dark:text-red-400 font-bold' : ''
                            return (
                              <tr key={`${sheet.quote.id}-${it.id}-${idx}`} className={`border-b border-border/50 ${rowCls}`}>
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
              </div>
            </section>

            {/* Detalii Tehnician */}
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

            {/* Detalii comunicate de client */}
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

            {/* Mesaje conversație */}
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
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Zone ascunse pentru print */}
    <div id="nu-raspunde-print-area" className="hidden print:!block print:!visible">
      {printSection === 'fisa' && leadFull && sheetsData.length > 0 && (
        <PrintView
          lead={{
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
          }}
          sheets={sheetsData as any}
          allSheetsTotal={allSheetsTotal}
          urgentMarkupPct={URGENT_MARKUP_PCT}
          services={services}
          instruments={instruments}
          serviceFileNumber={serviceFile?.number}
          isPrintMode
        />
      )}
      {printSection === 'tavite' && leadFull && sheetsData.length > 0 && (
        <PrintTraysView
          lead={{
            id: leadFull.id,
            leadId: leadFull.id,
            name: leadFull.full_name ?? leadFull.name ?? '',
            phone: leadFull.phone_number ?? leadFull.phone ?? '',
            email: leadFull.email ?? '',
            company_name: leadFull.company_name ?? null,
            address: leadFull.address ?? leadFull.strada ?? null,
          }}
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
        #nu-raspunde-print-area, #nu-raspunde-print-area * { visibility: visible; }
        #nu-raspunde-print-area { position: absolute; left: 0; top: 0; width: 100%; }
      }
    `}} />
    </>
  )
}
