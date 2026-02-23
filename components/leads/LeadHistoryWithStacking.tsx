"use client"

import { useEffect, useState, useMemo } from "react"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"
import { Clock, History as HistoryIcon, User } from "lucide-react"
import { format, isToday, isYesterday } from "date-fns"
import { ro } from "date-fns/locale"
import { stackEventsSmart, type StackedEvent } from "@/lib/tracking/eventStacker"
import { StackedEventCard } from "./StackedEventCard"
import type { LeadEvent } from "./lead-history"

interface LeadHistoryWithStackingProps {
  leadId: string
  serviceFileId?: string | null
  trayId?: string | null
  isVanzariPipeline?: boolean
  isReceptiePipeline?: boolean
  isDepartmentPipeline?: boolean
}

async function fetchTrayIdsForServiceFile(serviceFileId: string): Promise<string[]> {
  const { data } = await supabaseBrowser()
    .from("trays")
    .select("id")
    .eq("service_file_id", serviceFileId)
  return (data as { id: string }[] || []).map((t) => t.id)
}

async function fetchServiceFileIdsForLead(leadId: string): Promise<string[]> {
  const { data } = await supabaseBrowser()
    .from("service_files")
    .select("id")
    .eq("lead_id", leadId)
  return (data as { id: string }[] || []).map((sf) => sf.id)
}

async function fetchLeadIdFromTray(trayId: string): Promise<string | null> {
  const { data: tray } = await supabaseBrowser().from("trays").select("service_file_id").eq("id", trayId).single()
  const trayData = tray as { service_file_id?: string } | null
  if (!trayData?.service_file_id) return null
  const { data: sf } = await supabaseBrowser().from("service_files").select("lead_id").eq("id", trayData.service_file_id).single()
  const sfData = sf as { lead_id?: string } | null
  return sfData?.lead_id ?? null
}

function normalizeEvent(item: any): LeadEvent {
  return { ...item, lead_id: item.item_id }
}

export default function LeadHistoryWithStacking({
  leadId,
  serviceFileId,
  trayId,
  isVanzariPipeline = false,
  isReceptiePipeline = false,
  isDepartmentPipeline = false,
}: LeadHistoryWithStackingProps) {
  const [items, setItems] = useState<LeadEvent[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    let channel: any = null

    const run = async () => {
      let effectiveLeadId: string | null = leadId || null
      if (!effectiveLeadId && trayId) {
        effectiveLeadId = await fetchLeadIdFromTray(trayId)
        if (cancelled) return
      }

      if (effectiveLeadId) {
        const serviceFileIds = await fetchServiceFileIdsForLead(effectiveLeadId)
        if (cancelled) return
        let trayIds: string[] = []
        if (serviceFileIds.length > 0) {
          const { data: trays } = await supabaseBrowser()
            .from("trays")
            .select("id")
            .in("service_file_id", serviceFileIds)
          trayIds = (trays || []).map((t: any) => t.id)
        }
        if (cancelled) return

        const [leadRes, sfRes, trayRes] = await Promise.all([
          supabaseBrowser().from("items_events").select("*").eq("type", "lead").eq("item_id", effectiveLeadId).order("created_at", { ascending: false }).limit(1000),
          serviceFileIds.length
            ? supabaseBrowser().from("items_events").select("*").eq("type", "service_file").in("item_id", serviceFileIds).order("created_at", { ascending: false }).limit(1000)
            : Promise.resolve({ data: [] as any[], error: null }),
          trayIds.length
            ? supabaseBrowser().from("items_events").select("*").eq("type", "tray").in("item_id", trayIds).order("created_at", { ascending: false }).limit(1000)
            : Promise.resolve({ data: [] as any[], error: null }),
        ])
        if (cancelled) return
        const err = leadRes.error || sfRes.error || trayRes.error
        if (err) {
          setError(err.message)
          setItems([])
        } else {
          const merged = [...(leadRes.data ?? []), ...(sfRes.data ?? []), ...(trayRes.data ?? [])]
          merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          setItems(merged.slice(0, 1000).map(normalizeEvent))
          setError(null)
        }
        setLoading(false)

        const leadIdSet = effectiveLeadId
        const sfIdSet = new Set(serviceFileIds)
        const trayIdSet = new Set(trayIds)
        channel = supabaseBrowser()
          .channel(`global_history_${effectiveLeadId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "items_events" }, (p: any) => {
            if (cancelled) return
            const n = p.new
            if (!n?.type || n.item_id == null) return
            const isLead = n.type === "lead" && n.item_id === leadIdSet
            const isSf = n.type === "service_file" && sfIdSet.has(n.item_id)
            const isTray = n.type === "tray" && trayIdSet.has(n.item_id)
            if (isLead || isSf || isTray) {
              setItems((prev) => [normalizeEvent(n), ...(prev ?? [])])
            }
          })
          .subscribe()
        return
      }

      if (trayId) {
        const { data, error: err } = await supabaseBrowser()
          .from("items_events")
          .select("*")
          .eq("type", "tray")
          .eq("item_id", trayId)
          .order("created_at", { ascending: false })
          .limit(200)
        if (cancelled) return
        if (err) {
          setError(err.message)
          setItems([])
        } else {
          setItems((data ?? []).map(normalizeEvent))
          setError(null)
        }
        setLoading(false)
        channel = supabaseBrowser()
          .channel(`tray_events_${trayId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "items_events", filter: `type=eq.tray&item_id=eq.${trayId}` }, (payload: any) => {
            if (payload.new?.type === "tray" && payload.new?.item_id === trayId) {
              setItems((prev) => [normalizeEvent(payload.new), ...(prev ?? [])])
            }
          })
          .subscribe()
        return
      }

      setItems([])
      setError(null)
      setLoading(false)
    }

    run()
    return () => {
      cancelled = true
      if (channel) supabaseBrowser().removeChannel(channel)
    }
  }, [leadId, serviceFileId, trayId, isVanzariPipeline, isReceptiePipeline, isDepartmentPipeline])

  // Stack events for display
  const stackedEvents = useMemo(() => {
    if (!items || items.length === 0) return []
    const displayItems = showAll ? items : items.slice(0, 50)
    return stackEventsSmart(displayItems)
  }, [items, showAll])

  // Group stacked events by date
  const groupedStackedEvents = useMemo(() => {
    if (stackedEvents.length === 0) return {}
    const groups: Record<string, StackedEvent[]> = {}
    stackedEvents.forEach((stackedEvent) => {
      const date = new Date(stackedEvent.event.created_at)
      const dateKey = format(date, "yyyy-MM-dd", { locale: ro })
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(stackedEvent)
    })
    return groups
  }, [stackedEvents])

  const sortedDates = useMemo(() => {
    return Object.keys(groupedStackedEvents).sort((a, b) => b.localeCompare(a))
  }, [groupedStackedEvents])

  const hasMore = items ? items.length > 50 : false
  const totalStackedEvents = stackedEvents.length

  // Loading and error states
  if (loading) return <div className="p-4 text-sm text-muted-foreground">Se încarcă istoricul…</div>
  if (error) return <div className="p-4 text-sm text-destructive">{error}</div>
  if (!items || items.length === 0) return <div className="p-4 text-sm text-muted-foreground">Nu există evenimente încă.</div>

  return (
    <div className="flex flex-col h-full space-y-4">
      {hasMore && !showAll && (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-lg border border-blue-200 dark:border-blue-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                Se afișează {totalStackedEvents} grupuri din {items.length} evenimente
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300">
                Evenimentele similare sunt grupate. Apasă pentru a vedea toate.
              </div>
            </div>
            <button
              onClick={() => setShowAll(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              Afișează toate ({items.length})
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto space-y-6 min-h-0">
        {sortedDates.map((dateKey) => {
          const dateStackedEvents = groupedStackedEvents[dateKey]
          const date = new Date(dateKey)
          const dateLabel = isToday(date) 
            ? "Astăzi" 
            : isYesterday(date) 
            ? "Ieri" 
            : format(date, "EEEE, d MMMM yyyy", { locale: ro })
          
          return (
            <div key={dateKey} className="space-y-3">
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">{dateLabel}</h3>
                  <span className="text-xs text-muted-foreground">({dateStackedEvents.length} {dateStackedEvents.length === 1 ? 'grup' : 'grupuri'})</span>
                </div>
              </div>
              
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                {dateStackedEvents.map((stackedEvent, idx) => (
                  <StackedEventCard key={`${stackedEvent.stackKey}_${idx}`} stackedEvent={stackedEvent} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      
      {showAll && hasMore && (
        <div className="p-4 bg-muted/30 rounded-lg border border-dashed text-center flex-shrink-0">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <HistoryIcon className="w-4 h-4" />
            <span>Se afișează toate {items.length} evenimente în {totalStackedEvents} grupuri</span>
          </div>
        </div>
      )}
    </div>
  )
}