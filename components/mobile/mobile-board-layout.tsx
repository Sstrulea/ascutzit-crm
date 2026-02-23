'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { KanbanLead } from '@/lib/types/database'
import { StageTabs } from './stage-tabs'
import { LeadCardMobile } from './lead-card-mobile'
import { MobileBoardHeader } from './mobile-board-header'
import { LeadDetailsSheet } from './lead-details-sheet'
import { useSwipe } from '@/hooks/use-swipe'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

interface MobileBoardLayoutProps {
  leads: KanbanLead[]
  stages: string[]
  currentPipelineName: string
  pipelines: string[]
  onPipelineChange: (pipeline: string) => void
  onLeadMove: (leadId: string, newStage: string) => void
  onLeadClick?: (lead: KanbanLead) => void
  /** Când true pentru un lead, nu se deschide sheet-ul de detalii; doar onLeadClick. Folosit pentru QC pe mobil. */
  skipDetailsSheetForLead?: (lead: KanbanLead) => boolean
  onAddLead?: () => void
  sidebarContent?: React.ReactNode
  /** Căutare clasică: input în header (nu prompt). */
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  /** După creare lead din Receptie: deschide sheet-ul pentru acest lead. Apelat la consum. */
  leadToOpenAfterCreate?: KanbanLead | null
  onLeadToOpenConsumed?: () => void
  /** Override slug pentru view (ex. vanzari când lead creat din Receptie). */
  overridePipelineSlug?: string | null
  /** Apelat când se închide sheet-ul de detalii (pentru clear override). */
  onDetailsClose?: () => void
  /** Actualizare optimistă a board-ului după acțiune rapidă (tray departament) – fără refresh. */
  onItemStageUpdated?: (itemId: string, stageName: string, stageId: string) => void
}

export function MobileBoardLayout({
  leads,
  stages,
  currentPipelineName,
  pipelines,
  onPipelineChange,
  onLeadMove,
  onLeadClick,
  skipDetailsSheetForLead,
  onAddLead,
  sidebarContent,
  searchQuery,
  onSearchQueryChange,
  leadToOpenAfterCreate,
  onLeadToOpenConsumed,
  overridePipelineSlug,
  onDetailsClose,
  onItemStageUpdated,
}: MobileBoardLayoutProps) {
  const [currentStage, setCurrentStage] = useState(stages[0] || '')
  const [selectedLead, setSelectedLead] = useState<KanbanLead | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const consumedRef = useRef(false)
  const [moveSheetOpen, setMoveSheetOpen] = useState(false)
  const [leadToMove, setLeadToMove] = useState<KanbanLead | null>(null)

  // Actualizează stage-ul curent când se schimbă stages
  useEffect(() => {
    if (stages.length > 0 && !stages.includes(currentStage)) {
      setCurrentStage(stages[0])
    }
  }, [stages, currentStage])

  // După creare lead din Receptie: deschide sheet-ul pentru noul lead
  useEffect(() => {
    if (!leadToOpenAfterCreate || consumedRef.current) return
    setSelectedLead(leadToOpenAfterCreate)
    setDetailsOpen(true)
    consumedRef.current = true
    onLeadToOpenConsumed?.()
  }, [leadToOpenAfterCreate, onLeadToOpenConsumed])

  useEffect(() => {
    if (!leadToOpenAfterCreate) consumedRef.current = false
  }, [leadToOpenAfterCreate])

  // Swipe gestures pentru schimbarea stage-urilor
  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      const currentIndex = stages.indexOf(currentStage)
      if (currentIndex < stages.length - 1) {
        setCurrentStage(stages[currentIndex + 1])
      }
    },
    onSwipeRight: () => {
      const currentIndex = stages.indexOf(currentStage)
      if (currentIndex > 0) {
        setCurrentStage(stages[currentIndex - 1])
      }
    },
    threshold: 50,
  })

  // Lead-uri pentru stage-ul curent
  const currentStageLeads = useMemo(() => {
    return leads.filter(lead => lead.stage === currentStage)
  }, [leads, currentStage])

  // Număr de lead-uri per stage
  const leadCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    stages.forEach(stage => {
      counts[stage] = leads.filter(lead => lead.stage === stage).length
    })
    return counts
  }, [leads, stages])

  const isDepartmentPipeline = (() => {
    const n = (currentPipelineName || '').toLowerCase()
    return /saloane|frizerii|horeca|reparatii|reparații/.test(n)
  })()

  const closeDetails = useCallback(() => {
    setDetailsOpen(false)
    onDetailsClose?.()
  }, [onDetailsClose])

  const handleLeadClick = (lead: KanbanLead) => {
    if (skipDetailsSheetForLead?.(lead)) {
      onLeadClick?.(lead)
      return
    }
    
    setSelectedLead(lead)
    setDetailsOpen(true)
    onLeadClick?.(lead)
  }

  const handleMoveClick = (lead: KanbanLead) => {
    setLeadToMove(lead)
    setMoveSheetOpen(true)
  }

  const handleMoveToStage = (newStage: string) => {
    if (leadToMove) {
      onLeadMove(leadToMove.id, newStage)
      setMoveSheetOpen(false)
      setLeadToMove(null)
    }
  }

  return (
    <div className="flex flex-col h-screen md:hidden min-h-[100dvh]">
      {/* Header */}
      <MobileBoardHeader
        pipelineName={currentPipelineName}
        pipelines={pipelines}
        onPipelineChange={onPipelineChange}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        sidebarContent={sidebarContent}
      />

      {/* Stage tabs */}
      <StageTabs
        stages={stages}
        currentStage={currentStage}
        onStageChange={setCurrentStage}
        leadCounts={leadCounts}
      />

      {/* Leads list */}
      <div 
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        {...swipeHandlers}
      >
        {currentStageLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center py-16 px-4">
            <p className="text-muted-foreground text-base mb-4">Nu există lead-uri în acest stage</p>
            {onAddLead && (
              <Button onClick={onAddLead} size="lg" variant="outline" className="min-h-[48px] px-6 touch-manipulation">
                <Plus className="h-5 w-5 mr-2" />
                Adaugă lead
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {currentStageLeads.map((lead) => (
              <LeadCardMobile
                key={lead.id}
                lead={lead}
                onClick={() => handleLeadClick(lead)}
                onMove={() => handleMoveClick(lead)}
                onEdit={() => {
                  closeDetails()
                  // Trigger edit action
                }}
                pipelineName={currentPipelineName}
                isDepartmentPipeline={isDepartmentPipeline}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lead details sheet */}
      <LeadDetailsSheet
        lead={selectedLead}
        open={detailsOpen}
        onOpenChange={(open) => {
          if (!open) closeDetails()
          else setDetailsOpen(true)
        }}
        pipelineSlug={currentPipelineName.toLowerCase().replace(/\s+/g, '-')}
        overridePipelineSlug={overridePipelineSlug}
        stages={stages}
        onStageChange={(leadId, newStage) => {
          onLeadMove(leadId, newStage)
          closeDetails()
        }}
        onItemStageUpdated={onItemStageUpdated}
        onMove={() => {
          if (selectedLead) {
            closeDetails()
            handleMoveClick(selectedLead)
          }
        }}
      />

      {/* Move to stage sheet */}
      <Sheet open={moveSheetOpen} onOpenChange={setMoveSheetOpen}>
        <SheetContent 
          side="bottom" 
          className="h-auto rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="text-lg">Mută lead</SheetTitle>
            <SheetDescription className="text-muted-foreground">
              Selectează stage-ul în care vrei să muți „{leadToMove?.name}"
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">
            {stages
              .filter(stage => stage !== leadToMove?.stage)
              .map((stage) => (
                <Button
                  key={stage}
                  variant="outline"
                  className="w-full justify-start min-h-[48px] text-left px-4 py-3 rounded-xl touch-manipulation"
                  onClick={() => handleMoveToStage(stage)}
                >
                  {stage}
                </Button>
              ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Floating action button - safe area pentru notched devices */}
      {onAddLead && (
        <div 
          className="fixed z-30 md:hidden right-5"
          style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}
        >
          <Button
            size="lg"
            className="h-14 w-14 rounded-full shadow-lg touch-manipulation active:scale-95"
            onClick={onAddLead}
            aria-label="Adaugă lead"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      )}
    </div>
  )
}

