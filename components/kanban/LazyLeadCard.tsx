"use client"

import { useRef, useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { LeadCard } from "./lead-card"
import type React from "react"
import type { KanbanLead } from "../lib/types/database"

interface LazyLeadCardProps {
  lead: KanbanLead
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
  onRefresh?: () => void
  onClaimChange?: (leadId: string, claimedBy: string | null, claimedByName?: string | null) => void
  onTagsChange?: (leadId: string, tags: { id: string; name: string }[]) => void
  onDeliveryClear?: (leadId: string) => void
  /** Receptie: afișează buton Arhivare pe card (stage-uri De trimis / Ridic PE...) */
  showArchiveButton?: boolean
  onArchive?: () => Promise<void>
  /** Receptie: la scoaterea tag-ului Nu răspunde de pe fișă – mută fișa în De facturat */
  onNuRaspundeClearedForReceptie?: (serviceFileId: string) => void | Promise<void>
  /** Vânzări: la adăugarea tag-ului Sună! mută lead-ul în stage-ul Suna */
  onSunaTagAdded?: (leadId: string) => void
  /** Vânzări: la scoaterea tag-ului Sună! mută lead-ul în Leaduri sau Leaduri Straine (după telefon) */
  onSunaTagRemoved?: (leadId: string, phone: string | undefined) => void
}

/**
 * Componentă care renderizează lazy cardurile din kanban
 * Se renderizează doar când este vizibilă în viewport
 * După ce este vizibilă, rămâne renderizată (nu se demontează)
 */
export function LazyLeadCard({
  lead,
  onMove,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
  stages,
  onPinToggle,
  isSelected,
  onSelectChange,
  leadTotal,
  pipelineName,
  onRefresh,
  onClaimChange,
  onTagsChange,
  onDeliveryClear,
  showArchiveButton,
  onArchive,
  onNuRaspundeClearedForReceptie,
  onSunaTagAdded,
  onSunaTagRemoved,
}: LazyLeadCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isVisible) {
      // Dacă e deja vizibil, nu mai urmări cu observer
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting) {
          setIsVisible(true)
          // Oprim observerul după ce devino vizibil
          observer.unobserve(entry.target)
        }
      },
      {
        // Preîncarcă cardurile când sunt la 300px distanță de viewport
        rootMargin: "300px",
        threshold: 0,
      }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [isVisible])

  return (
    <div ref={ref}>
      {isVisible ? (
        <LeadCard
          lead={lead}
          onMove={onMove}
          onClick={onClick}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          isDragging={isDragging}
          stages={stages}
          onPinToggle={onPinToggle}
          isSelected={isSelected}
          onSelectChange={onSelectChange}
          leadTotal={leadTotal}
          pipelineName={pipelineName}
          onRefresh={onRefresh}
          onClaimChange={onClaimChange}
          onTagsChange={onTagsChange}
          onDeliveryClear={onDeliveryClear}
          onNuRaspundeClearedForReceptie={onNuRaspundeClearedForReceptie}
          showArchiveButton={showArchiveButton}
          onArchive={onArchive}
          onSunaTagAdded={onSunaTagAdded}
          onSunaTagRemoved={onSunaTagRemoved}
        />
      ) : (
        // Skeleton loader care imită dimensiunile LeadCard
        <div className="space-y-2 p-3 bg-card border rounded-md">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      )}
    </div>
  )
}

