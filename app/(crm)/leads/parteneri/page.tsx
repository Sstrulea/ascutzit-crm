"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { debounce } from "@/lib/utils"
import dynamic from "next/dynamic"
import { KanbanBoard } from "@/components/kanban"
import { MobileBoardLayout } from "@/components/mobile/mobile-board-layout"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { useKanbanData } from "@/hooks/useKanbanData"
import type { KanbanLead } from '@/lib/types/database'
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus, Settings2, UserPlus, Loader2 } from "lucide-react"
import { useRole, useAuthContext } from '@/lib/contexts/AuthContext'
import { useSidebar } from '@/lib/contexts/SidebarContext'
import { getPipelineOptions, updatePipelineAndStages } from "@/lib/supabase/leadOperations"
import { usePipelinesCache } from "@/hooks/usePipelinesCache"
import { PipelineEditor } from "@/components/settings"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createLeadWithPipeline } from "@/lib/supabase/leadOperations"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useUserPreferences } from "@/hooks/useUserPreferences"
import { Badge } from "@/components/ui/badge"
import { NetworkStatusBanner } from "@/components/ui/network-status-banner"

const toSlug = (s: string) => String(s).toLowerCase().replace(/\s+/g, "-")

/** Tag-uri partenere permise */
const PARTNER_TAGS = ['Annette', 'Podo Clinic', 'Savy']

const LeadDetailsPanel = dynamic(
  () => import("@/components/leads/lead-details-panel").then(m => m.LeadDetailsPanel),
  { ssr: false }
)

export default function ParteneriPage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const router = useRouter()
  const { sidebarWidth } = useSidebar()
  
  const [isMobile, setIsMobile] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorData, setEditorData] = useState<{
    pipelineId: string
    pipelineName: string
    stages: { id: string; name: string }[]
  } | null>(null)

  // (păstrat pentru compatibilitate – referințe posibile din cache; un singur buton „Editează stage-uri” deschide PipelineEditor)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const [createStageOpen, setCreateStageOpen] = useState(false)
  const [stageName, setStageName] = useState("")
  const [creatingStage, setCreatingStage] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)
  
  const [createLeadOpen, setCreateLeadOpen] = useState(false)
  const [newLeadData, setNewLeadData] = useState({
    full_name: '',
    phone_number: '',
    email: '',
  })
  const [creatingLead, setCreatingLead] = useState(false)
  const [selectedLead, setSelectedLead] = useState<KanbanLead | null>(null)
  const [leadPosition, setLeadPosition] = useState<{ x: number; y: number; side: 'left' | 'right' } | null>(null)
  
  const [pipelinesWithIds, setPipelinesWithIds] = useState<Array<{ id: string; name: string }>>([])
  const [partnerStageId, setPartnerStageId] = useState<string | null>(null)
  const [partnerStagesForSelect, setPartnerStagesForSelect] = useState<Array<{ id: string; name: string }>>([])
  
  const urlQuery = searchParams?.get('q') ?? ''
  const [searchQuery, setSearchQuery] = useState(urlQuery)
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => setSearchQuery(urlQuery), [urlQuery])
  
  const { isOwner, role } = useRole()
  const { hasAccess, isMember, loading: authLoading, user } = useAuthContext()
  const { getPipelines } = usePipelinesCache()
  
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

  const allPipelines = useKanbanData('parteneri', { skipAutoRefreshOnVisible: !!selectedLead || createLeadOpen }).pipelines
  const pipelines = useMemo(() => {
    if (!isMember()) return allPipelines
    return allPipelines.filter(p => {
      const pipelineWithId = pipelinesWithIds.find(pid => pid.name === p)
      return pipelineWithId ? hasAccess(pipelineWithId.id) : false
    })
  }, [allPipelines, pipelinesWithIds, hasAccess, isMember])
  
  const { leads, stages, loading, error, handleLeadMove, refresh, patchLeadTags } = useKanbanData('parteneri', { skipAutoRefreshOnVisible: !!selectedLead || createLeadOpen })
  
  const handleTagsChange = useCallback((leadId: string, tags: any[]) => {
    patchLeadTags(leadId, tags)
    setSelectedLead((prev) => {
      if (!prev) return null
      const match = prev.id === leadId || (prev as any).leadId === leadId
      return match ? { ...prev, tags } : prev
    })
  }, [patchLeadTags])
  
  const { getStageOrder, setStageOrder } = useUserPreferences()
  const orderedStages = useMemo(() => getStageOrder('parteneri', stages), [stages, getStageOrder])
  
  useEffect(() => {
    const loadPartnerStages = async () => {
      if (!createLeadOpen) return
      const cached = await getPipelines()
      const partnerPipe = cached?.find((p: any) => toSlug(p?.name || '') === 'parteneri')
      const allStages = (partnerPipe?.stages || []) as Array<{ id: string; name: string }>
      const allowedNames = ['savy', 'annete', 'podocliniq']
      const filtered = allStages.filter(s => allowedNames.includes(String(s?.name || '').toLowerCase().trim()))
      setPartnerStagesForSelect(filtered)
      setPartnerStageId(filtered.length > 0 ? filtered[0].id : null)
    }
    loadPartnerStages()
  }, [createLeadOpen, getPipelines])

  const filteredLeads = useMemo(() => {
    return leads.filter((lead: any) => {
      const leadTags = Array.isArray(lead?.tags) ? lead.tags : []
      return leadTags.some((tag: { name?: string }) => {
        const tagName = String(tag?.name || '').trim().toLowerCase()
        return PARTNER_TAGS.map(t => t.toLowerCase()).includes(tagName)
      })
    })
  }, [leads])

  const partnerStats = useMemo(() => {
    const stats = { Annette: 0, 'Podo Clinic': 0, Savy: 0, total: 0 }
    filteredLeads.forEach((lead: any) => {
      const leadTags = Array.isArray(lead?.tags) ? lead.tags : []
      leadTags.forEach((tag: { name?: string }) => {
        const tagName = String(tag?.name || '').trim()
        if (tagName.toLowerCase() === 'annette') stats.Annette++
        if (tagName.toLowerCase() === 'podo clinic') stats['Podo Clinic']++
        if (tagName.toLowerCase() === 'savy') stats.Savy++
      })
    })
    stats.total = filteredLeads.length
    return stats
  }, [filteredLeads])

  const searchedLeads = useMemo(() => {
    if (!searchQuery.trim()) return filteredLeads
    const query = searchQuery.toLowerCase().trim()
    return filteredLeads.filter((lead: any) => {
      if (lead.name?.toLowerCase().includes(query)) return true
      if (lead.email?.toLowerCase().includes(query)) return true
      if (lead.phone?.toLowerCase().includes(query)) return true
      const leadTags = Array.isArray(lead?.tags) ? lead.tags : []
      if (Array.isArray(leadTags)) {
        for (const tag of leadTags) {
          if (tag?.name && tag.name.toLowerCase().includes(query)) return true
        }
      }
      return false
    })
  }, [filteredLeads, searchQuery])

  const activePipelineName = "Parteneri"

  const handleCloseModal = () => {
    setSelectedLead(null)
    setLeadPosition(null)
  }

  const handleLeadClick = (lead: KanbanLead, event?: React.MouseEvent) => {
    setSelectedLead(lead as any)
    if (event && event.currentTarget) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right'
      setLeadPosition({ x: rect.left, y: rect.top, side })
    }
  }

  async function openEditor() {
    const data = await getPipelines()
    const current = data?.find((p: any) => toSlug(p.name) === 'parteneri')
    if (!current) return
    setEditorData({
      pipelineId: current.id,
      pipelineName: current.name,
      stages: (current.stages || []).map((s: any) => ({ id: s.id, name: s.name })),
    })
    setEditorOpen(true)
  }

  async function handleCreateStage() {
    setCreateErr(null)
    setCreatingStage(true)
    try {
      const res = await fetch("/api/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineSlug: 'parteneri', name: stageName }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to create stage")
      }
      await refresh()
      toast({ title: "Stage creat", description: `Stage-ul "${stageName}" a fost adăugat.` })
      setCreateStageOpen(false)
      setStageName("")
    } catch (err: any) {
      setCreateErr(err.message || "Failed to create stage")
    } finally {
      setCreatingStage(false)
    }
  }

  const handleSearchChange = debounce((value: string) => {
    setSearchQuery(value)
    const url = new URLSearchParams(searchParams.toString())
    if (value) url.set('q', value)
    else url.delete('q')
    router.replace(pathname + (url.toString() ? '?' + url.toString() : ''))
  }, 300)

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
  }, [selectedLead])

  useEffect(() => {
    if (authLoading || !isMember() || isOwner || role === 'admin') return
    const currentPipeline = pipelinesWithIds.find(p => toSlug(p.name) === 'parteneri')
    if (currentPipeline && !hasAccess(currentPipeline.id)) {
      const firstAllowed = pipelinesWithIds.find(p => hasAccess(p.id))
      if (firstAllowed) router.replace(`/leads/${toSlug(firstAllowed.name)}`)
      else router.replace('/dashboard')
    }
  }, [isMember, pipelinesWithIds, hasAccess, authLoading, router, isOwner, role])

  const hasData = (leads?.length ?? 0) > 0 || (stages?.length ?? 0) > 0

  if (loading && !selectedLead) {
    return (
      <div className="flex flex-1 min-h-0 min-w-0 bg-background overflow-hidden">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Se încarcă...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 min-w-0 bg-background overflow-hidden">
      <NetworkStatusBanner />
      
      {error && !hasData && (
        <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
          <div className="text-red-500 text-center">Eroare la încărcare: {error}</div>
          <p className="text-sm text-muted-foreground text-center max-w-md">Poate fi o problemă de rețea. Verifică conexiunea și reîncearcă.</p>
          <Button variant="outline" onClick={() => refresh()}>Reîncearcă</Button>
        </div>
      )}

      <main className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
        <header className="hidden md:block border-b border-border px-4 py-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-semibold text-foreground shrink-0">{activePipelineName}</h1>
            
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Total: {partnerStats.total}</Badge>
              <Badge variant="outline" className="text-xs">Annette: {partnerStats.Annette}</Badge>
              <Badge variant="outline" className="text-xs">Podo Clinic: {partnerStats['Podo Clinic']}</Badge>
              <Badge variant="outline" className="text-xs">Savy: {partnerStats.Savy}</Badge>
            </div>

            <div className="flex-1 max-w-md min-w-[200px]">
              <Input
                placeholder="Caută parteneri..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <Button variant="default" size="sm" onClick={() => setCreateLeadOpen(true)} className="h-8 gap-1.5 px-2.5">
                <UserPlus className="h-3.5 w-3.5" />
                Add Lead
              </Button>
              {stages.length > 0 && isOwner && (
                <Button variant="outline" size="sm" onClick={openEditor} className="h-8 gap-1.5 px-2.5" title="Editează poziția stage-urilor, denumirile și salvează">
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Editează stage-uri</span>
                </Button>
              )}
              {isOwner && (
                <Button variant="outline" size="sm" onClick={() => setCreateStageOpen(true)} className="h-8 gap-1.5 px-2.5">
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Stage</span>
                </Button>
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
              if (error) {
                toast({ variant: "destructive", title: "Salvare eșuată", description: String(error.message ?? error) })
                throw error
              }
              setStageOrder('parteneri', stages.map((s) => s.name))
              await refresh?.()
              setEditorOpen(false)
              toast({ title: "Stage-uri actualizate" })
              if (typeof window !== "undefined") window.dispatchEvent(new Event("pipelines:updated"))
            }}
          />
        )}

        {isMobile ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <MobileBoardLayout
              leads={searchedLeads}
              stages={orderedStages}
              currentPipelineName={activePipelineName}
              pipelines={pipelines}
              onPipelineChange={(pipelineName) => router.push(`/leads/${toSlug(pipelineName)}`)}
              onLeadMove={handleLeadMove}
              onLeadClick={handleLeadClick}
              onAddLead={() => setCreateLeadOpen(true)}
              searchQuery={searchQuery}
              onSearchQueryChange={handleSearchChange}
              overridePipelineSlug={null}
              onDetailsClose={() => {}}
              onItemStageUpdated={() => {}}
              sidebarContent={<div className="p-4" />}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-[2px]">
            {stages.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="text-lg font-medium text-muted-foreground mb-2">
                  Pipeline-ul Parteneri nu are stage-uri configurate.
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Adaugă stage-uri pentru a începe să gestionezi partenerii.
                </p>
                {isOwner && (
                  <Button variant="outline" onClick={() => setCreateStageOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Adaugă primul stage
                  </Button>
                )}
              </div>
            ) : (
              <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                <KanbanBoard 
                  leads={searchedLeads} 
                  stages={orderedStages}
                  onLeadMove={handleLeadMove} 
                  onLeadClick={handleLeadClick}
                  onDeleteStage={async () => {}}
                  currentPipelineName={activePipelineName}
                  onPinToggle={() => {}}
                  pipelines={pipelines}
                  onBulkMoveToStage={async () => {}}
                  onBulkMoveToPipeline={async () => {}}
                  onRefresh={refresh}
                  onClaimChange={() => {}}
                  onTagsChange={handleTagsChange}
                  onDeliveryClear={() => {}}
                  pipelineSlug="parteneri"
                  onArchiveCard={async () => {}}
                  showArchiveForStage={() => false}
                  onNuRaspundeClearedForReceptie={() => {}}
                  onMessageClick={() => {}}
                />
                
                {selectedLead && (
                  <div 
                    className="fixed right-0 top-0 bottom-0 z-50 bg-background border-l border-border shadow-xl overflow-hidden"
                    style={{ left: sidebarWidth }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="h-full overflow-hidden">
                      <LeadDetailsPanel
                        key={selectedLead.id}              
                        lead={selectedLead}
                        defaultSection={'fisa'}
                        onSectionChangeForPersist={() => {}}
                        onClose={handleCloseModal}
                        onStageChange={handleLeadMove}
                        stages={stages}
                        pipelines={pipelines}
                        pipelineSlug="parteneri"
                        overridePipelineSlug={null}
                        onMoveToPipeline={async () => {}}
                        onBulkMoveToPipelines={async () => {}}
                        pipelineOptions={[]}
                        onTagsChange={handleTagsChange}
                        onRefresh={refresh}
                        onItemStageUpdated={() => {}}
                        onMoveFisaToDeFacturat={() => {}}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <Toaster />

      <Dialog open={createLeadOpen} onOpenChange={setCreateLeadOpen}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden border border-border/80 rounded-xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)]">
          <DialogHeader className="sr-only">
            <DialogTitle>Creează Lead Nou - Parteneri</DialogTitle>
          </DialogHeader>
          
          <div className="relative bg-gradient-to-br from-[#A5B3C6] via-[#9aa9bd] to-[#8a9aaf] text-[#1a1a2e] px-6 py-5 rounded-t-xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
            <div className="relative flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white/25 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-sm">
                <UserPlus className="h-6 w-6 text-[#1a1a2e]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1a1a2e] tracking-tight">Creează Lead Nou - Parteneri</h2>
                <p className="text-[#1a1a2e]/75 text-sm mt-0.5">Completează informațiile pentru noul partener</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 space-y-6 bg-gradient-to-b from-background to-muted/20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="partner-full-name" className="text-sm font-medium text-foreground">
                  Nume și Prenume <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="partner-full-name"
                  value={newLeadData.full_name}
                  onChange={(e) => setNewLeadData(prev => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Nume și prenume"
                  className="h-12 border-2 border-input focus-visible:border-primary focus-visible:ring-primary/20"
                  disabled={creatingLead}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="partner-phone" className="text-sm font-medium text-foreground">
                  Telefon <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="partner-phone"
                  type="tel"
                  value={newLeadData.phone_number}
                  onChange={(e) => setNewLeadData(prev => ({ ...prev, phone_number: e.target.value }))}
                  placeholder="+40 123 456 789"
                  className="h-12 border-2 border-input focus-visible:border-primary focus-visible:ring-primary/20"
                  disabled={creatingLead}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="partner-email" className="text-sm font-medium text-foreground">
                  Email:
                </Label>
                <Input
                  id="partner-email"
                  type="email"
                  value={newLeadData.email}
                  onChange={(e) => setNewLeadData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="h-12 border-2 border-input focus-visible:border-primary focus-visible:ring-primary/20"
                  disabled={creatingLead}
                />
              </div>

              <div className="space-y-2 md:col-span-2 pt-2">
                <Label className="text-sm font-medium text-foreground">
                  Partener <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={partnerStageId ?? ''}
                  onValueChange={(v) => setPartnerStageId(v || null)}
                  disabled={creatingLead}
                >
                  <SelectTrigger className="h-12 border-2 focus:border-primary focus:ring-primary/20">
                    <SelectValue placeholder="Alege partenerul" />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerStagesForSelect.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {createErr && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{createErr}</p>
              </div>
            )}
          </div>
          
          <div className="border-t border-border px-6 py-4 bg-gradient-to-r from-muted/40 to-muted/60 flex items-center justify-between gap-3 flex-shrink-0 rounded-b-xl">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCreateLeadOpen(false)
                setNewLeadData({ full_name: '', phone_number: '', email: '' })
              }}
              disabled={creatingLead}
              className="text-muted-foreground hover:text-foreground"
            >
              Anulează
            </Button>
            <Button
              variant="default"
              onClick={async () => {
                if (!newLeadData.full_name.trim()) {
                  toast({ title: "Eroare", description: "Numele este obligatoriu", variant: "destructive" })
                  return
                }
                if (!newLeadData.phone_number.trim()) {
                  toast({ title: "Eroare", description: "Telefonul este obligatoriu", variant: "destructive" })
                  return
                }
                if (!partnerStageId) {
                  toast({ title: "Eroare", description: "Selectează un partener (Savy, Annete sau PodoCliniq)", variant: "destructive" })
                  return
                }
                setCreatingLead(true)
                try {
                  const pipelinesData = await getPipelines()
                  const partnerPipeline = pipelinesData?.find((p: any) => toSlug(p.name) === 'parteneri')
                  if (!partnerPipeline) throw new Error('Pipeline-ul Parteneri nu a fost găsit')
                  const selectedStage = (partnerPipeline.stages || []).find((s: any) => s.id === partnerStageId)
                  if (!selectedStage) throw new Error('Selectează un partener (Savy, Annete sau PodoCliniq)')

                  const leadPayload = {
                    full_name: newLeadData.full_name.trim(),
                    email: newLeadData.email.trim() || null,
                    phone_number: newLeadData.phone_number.trim() || null,
                    platform: 'manual',
                    created_at: new Date().toISOString()
                  }

                  const { error } = await createLeadWithPipeline(leadPayload, partnerPipeline.id, selectedStage.id)
                  if (error) throw error

                  toast({ title: "Partener creat", description: `Partenerul "${newLeadData.full_name}" a fost adăugat în Parteneri → ${selectedStage.name}` })
                  setCreateLeadOpen(false)
                  setNewLeadData({ full_name: '', phone_number: '', email: '' })
                  await refresh()
                } catch (error: any) {
                  console.error('Eroare la crearea partenerului:', error)
                  toast({ title: "Eroare", description: error?.message || "Nu s-a putut crea partenerul", variant: "destructive" })
                } finally {
                  setCreatingLead(false)
                }
              }}
              disabled={creatingLead || !newLeadData.full_name.trim() || !newLeadData.phone_number.trim() || !partnerStageId}
              className="gap-2 px-6 min-w-[140px] bg-gradient-to-r from-[#A5B3C6] to-[#8a9aaf] hover:from-[#8a9aaf] hover:to-[#7a8a9f] text-[#1a1a2e] font-medium border-0 shadow-md hover:shadow-lg transition-all duration-200"
            >
              {creatingLead ? <><Loader2 className="h-4 w-4 animate-spin" /> Se creează...</> : <><UserPlus className="h-4 w-4" /> Creează Partener</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createStageOpen} onOpenChange={setCreateStageOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border border-border/80 rounded-xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)]">
          <DialogHeader className="sr-only">
            <DialogTitle>Creează Stage Nou</DialogTitle>
          </DialogHeader>
          
          <div className="relative bg-gradient-to-br from-[#A5B3C6] via-[#9aa9bd] to-[#8a9aaf] text-[#1a1a2e] px-6 py-5 rounded-t-xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
            <div className="relative flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white/25 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-sm">
                <Plus className="h-6 w-6 text-[#1a1a2e]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1a1a2e] tracking-tight">Creează Stage Nou</h2>
                <p className="text-[#1a1a2e]/75 text-sm mt-0.5">Adaugă un nou stage în pipeline Parteneri</p>
              </div>
            </div>
          </div>
          
          <form onSubmit={async (e) => { e.preventDefault(); await handleCreateStage(); }} className="flex flex-col">
            <div className="p-6 bg-gradient-to-b from-background to-muted/20">
              <div className="space-y-2">
                <Label htmlFor="partner-stage-name" className="text-sm font-medium text-foreground">
                  Nume stage <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="partner-stage-name"
                  autoFocus
                  required
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                  placeholder="ex: Savy, Annette, PodoCliniq"
                  disabled={creatingStage}
                  className="h-12 text-base border-input focus-visible:border-[#A5B3C6] focus-visible:ring-[#A5B3C6]/20"
                />
              </div>

              {createErr && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">{createErr}</p>
                </div>
              )}
            </div>
            
            <div className="border-t border-border px-6 py-4 bg-gradient-to-r from-muted/40 to-muted/60 flex items-center justify-between gap-3 rounded-b-xl">
              <Button type="button" variant="ghost" onClick={() => setCreateStageOpen(false)} disabled={creatingStage} className="text-muted-foreground hover:text-foreground">
                Anulează
              </Button>
              <Button type="submit" disabled={creatingStage || !stageName.trim()} className="min-w-[140px] bg-gradient-to-r from-[#A5B3C6] to-[#8a9aaf] hover:from-[#8a9aaf] hover:to-[#7a8a9f] text-[#1a1a2e] font-medium gap-2 px-6 border-0 shadow-md hover:shadow-lg transition-all duration-200">
                {creatingStage ? <><Loader2 className="h-4 w-4 animate-spin" /> Se creează...</> : <><Plus className="h-4 w-4" /> Creează Stage</>}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  )
}