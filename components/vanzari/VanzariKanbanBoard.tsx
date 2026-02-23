/**
 * MODUL VÂNZARI - KANBAN BOARD
 * =======================================
 * Kanban board specializat pentru Vânzări cu lead-uri și funcționalități specifice
 */

'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Plus, Search, Filter, Download, CheckSquare, 
  XSquare, Phone, PhoneOff, XCircle, Package,
  Building, BarChart3
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { VanzariLeadCard } from './VanzariLeadCard'
import { VanzariLeadDetailsModal } from './VanzariLeadDetailsModal'
import { SellerStatisticsDashboardComponent } from './SellerStatisticsDashboard'
import { 
  setLeadCallback, 
  setLeadNuRaspunde, 
  setLeadNoDeal,
  setLeadCurierTrimis,
  setLeadOfficeDirect 
} from '@/lib/vanzari'
import type { Lead } from '@/app/(crm)/dashboard/page'

interface Pipeline {
  id: string
  name: string
  stages: Array<{
    id: string
    name: string
    order: number
  }>
}
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'

interface VanzariKanbanBoardProps {
  leads: Lead[]
  pipeline: Pipeline | null
  isLoading?: boolean
  onMoveLead?: (leadId: string, newStage: string) => Promise<void>
  onBulkAction?: (leadIds: string[], action: string, params?: any) => Promise<void>
}

export function VanzariKanbanBoard({
  leads,
  pipeline,
  isLoading = false,
  onMoveLead,
  onBulkAction
}: VanzariKanbanBoardProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [showStatistics, setShowStatistics] = useState(false)
  const { toast } = useToast()

  // Filtrează lead-urile după căutare
  const filteredLeads = leads.filter(lead => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      lead.name?.toLowerCase().includes(term) ||
      lead.phone?.toLowerCase().includes(term) ||
      lead.email?.toLowerCase().includes(term)
    )
  })

  // Grupare lead-uri pe stage-uri
  const stages = pipeline?.stages || []
  const stageNames = stages.map(s => s.name)
  const leadsByStage = stages.reduce((acc: Record<string, Lead[]>, stage: { id: string; name: string; order: number }) => {
    acc[stage.name] = filteredLeads.filter(lead => lead.stage === stage.name)
    return acc
  }, {} as Record<string, Lead[]>)

  // Toggle selectie lead
  const toggleLeadSelection = useCallback((leadId: string) => {
    setSelectedLeads((prev: Set<string>) => {
      const newSet = new Set(prev)
      if (newSet.has(leadId)) {
        newSet.delete(leadId)
      } else {
        newSet.add(leadId)
      }
      return newSet
    })
  }, [])

  // Selectare toate lead-urile dintr-un stage
  const selectAllInStage = useCallback((stageName: string) => {
    const stageLeads = leadsByStage[stageName] || []
    setSelectedLeads(prev => {
      const newSet = new Set(prev)
      stageLeads.forEach(lead => newSet.add(lead.id))
      return newSet
    })
  }, [leadsByStage])

  // Deselectare toate
  const clearSelection = useCallback(() => {
    setSelectedLeads(new Set())
  }, [])

  // Bulk callback
  const handleBulkCallback = async () => {
    if (selectedLeads.size === 0) {
      toast({
        title: 'Niciun lead selectat',
        description: 'Selectează cel puțin un lead pentru a aplica acțiunea',
        variant: 'destructive',
      })
      return
    }

    // Pentru bulk callback, ar trebui să folosim o dată comună sau să deschidem un dialog
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)

    try {
      const promises = Array.from(selectedLeads).map(leadId =>
        setLeadCallback(leadId, tomorrow)
      )
      await Promise.all(promises)
      
      toast({
        title: 'Callback programat',
        description: `${selectedLeads.size} lead-uri au fost programate pentru callback`,
      })
      clearSelection()
    } catch (error: any) {
      toast({
        title: 'Eroare',
        description: error?.message || 'Nu s-au putut programa callback-urile',
        variant: 'destructive',
      })
    }
  }

  // Bulk Nu Răspunde
  const handleBulkNuRaspunde = async () => {
    if (selectedLeads.size === 0) {
      toast({
        title: 'Niciun lead selectat',
        description: 'Selectează cel puțin un lead pentru a aplica acțiunea',
        variant: 'destructive',
      })
      return
    }

    try {
      const promises = Array.from(selectedLeads).map(leadId =>
        setLeadNuRaspunde(leadId, '10:00')
      )
      await Promise.all(promises)
      
      toast({
        title: 'Reapel programat',
        description: `${selectedLeads.size} lead-uri au fost programate pentru reapel mâine la 10:00`,
      })
      clearSelection()
    } catch (error: any) {
      toast({
        title: 'Eroare',
        description: error?.message || 'Nu s-au putut programa reapelele',
        variant: 'destructive',
      })
    }
  }

  // Bulk No Deal
  const handleBulkNoDeal = async () => {
    if (selectedLeads.size === 0) {
      toast({
        title: 'Niciun lead selectat',
        description: 'Selectează cel puțin un lead pentru a aplica acțiunea',
        variant: 'destructive',
      })
      return
    }

    if (!confirm(`Ești sigur că vrei să marchezi ${selectedLeads.size} lead-uri ca No Deal?`)) {
      return
    }

    try {
      const promises = Array.from(selectedLeads).map(leadId =>
        setLeadNoDeal(leadId)
      )
      await Promise.all(promises)
      
      toast({
        title: 'No Deal aplicat',
        description: `${selectedLeads.size} lead-uri au fost marcate ca No Deal`,
      })
      clearSelection()
    } catch (error: any) {
      toast({
        title: 'Eroare',
        description: error?.message || 'Nu s-au putut marca lead-urile ca No Deal',
        variant: 'destructive',
      })
    }
  }

  // Mutare lead la drop
  const handleDrop = async (leadId: string, newStage: string) => {
    if (!onMoveLead) return
    
    try {
      await onMoveLead(leadId, newStage)
      toast({
        title: 'Lead mutat',
        description: `Lead-ul a fost mutat în ${newStage}`,
      })
    } catch (error: any) {
      toast({
        title: 'Eroare',
        description: error?.message || 'Nu s-a putut muta lead-ul',
        variant: 'destructive',
      })
    }
  }

  // Deschide detalii lead
  const openLeadDetails = (lead: Lead) => {
    setSelectedLead(lead)
    setDetailsModalOpen(true)
  }

  // Stare drag & drop
  const [draggingLead, setDraggingLead] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Se încarcă lead-urile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4">
        {/* Search și statistici */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Caută după nume, telefon sau email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Button
            variant={showStatistics ? 'default' : 'outline'}
            onClick={() => setShowStatistics(!showStatistics)}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Statistici
          </Button>
        </div>

        {/* Bulk Actions - apare doar când sunt lead-uri selectate */}
        {selectedLeads.size > 0 && (
          <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
            <span className="text-sm font-medium">
              {selectedLeads.size} lead-uri selectate
            </span>
            
            <div className="h-6 w-px bg-border mx-2" />
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkCallback}
              disabled={!onBulkAction && selectedLeads.size > 10}
            >
              <Phone className="h-4 w-4 mr-2" />
              Callback Bulk
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkNuRaspunde}
              disabled={!onBulkAction && selectedLeads.size > 10}
            >
              <PhoneOff className="h-4 w-4 mr-2" />
              Reapel Bulk
            </Button>
            
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkNoDeal}
              disabled={!onBulkAction && selectedLeads.size > 10}
            >
              <XCircle className="h-4 w-4 mr-2" />
              No Deal Bulk
            </Button>
            
            <div className="h-6 w-px bg-border mx-2" />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
            >
              <XSquare className="h-4 w-4 mr-2" />
              Anulează selecția
            </Button>
          </div>
        )}
      </div>

      {/* Dashboard Statistici */}
      {showStatistics && (
        <div className="bg-muted/30 p-6 rounded-lg">
          <SellerStatisticsDashboardComponent />
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <Card key={stage.id} className="min-w-[320px] flex-shrink-0">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {stage.name}
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {leadsByStage[stage.name]?.length || 0}
                </span>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-2">
      {/* Lead-uri din stage */}
      {(leadsByStage[stage.name] || []).map((lead: Lead) => (
                <VanzariLeadCard
                  key={lead.id}
                  lead={lead}
                  onMove={handleDrop}
                  onClick={() => openLeadDetails(lead)}
                  onDragStart={() => setDraggingLead(lead.id)}
                  onDragEnd={() => setDraggingLead(null)}
                  isDragging={draggingLead === lead.id}
                  stages={stageNames}
                />
              ))}
              
              {/* Empty state */}
              {(!leadsByStage[stage.name] || leadsByStage[stage.name].length === 0) && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Niciun lead în acest stage
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal Detalii Lead */}
      <VanzariLeadDetailsModal
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        lead={selectedLead}
        onMove={handleDrop}
      />
    </div>
  )
}