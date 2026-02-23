/**
 * Hook pentru gestionarea pipelines-urilor în componenta LeadDetailsPanel
 */

import { useCallback } from 'react'
import { toast } from 'sonner'

interface UseLeadDetailsPipelinesProps {
  lead: {
    id: string
    [key: string]: any
  } | null
  pipelines: string[]
  selectedPipes: string[]
  setSelectedPipes: React.Dispatch<React.SetStateAction<string[]>>
  movingPipes: boolean
  setMovingPipes: React.Dispatch<React.SetStateAction<boolean>>
  onMoveToPipeline?: (leadId: string, targetName: string) => Promise<void>
  onBulkMoveToPipelines?: (leadId: string, pipelineNames: string[]) => Promise<void>
  getLeadId: () => string | null
}

export function useLeadDetailsPipelines({
  lead,
  pipelines,
  selectedPipes,
  setSelectedPipes,
  movingPipes,
  setMovingPipes,
  onMoveToPipeline,
  onBulkMoveToPipelines,
  getLeadId,
}: UseLeadDetailsPipelinesProps) {
  
  const allPipeNames = pipelines ?? []

  // Toggle un pipeline în selecție
  const togglePipe = useCallback((name: string) => {
    setSelectedPipes(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name])
  }, [setSelectedPipes])

  // Selectează toate pipeline-urile
  const pickAll = useCallback(() => {
    setSelectedPipes(allPipeNames)
  }, [allPipeNames, setSelectedPipes])

  // Deselectează toate pipeline-urile
  const clearAll = useCallback(() => {
    setSelectedPipes([])
  }, [setSelectedPipes])

  // Mută lead-ul într-un pipeline
  const handleMoveToPipeline = useCallback(async (targetName: string) => {
    console.log('[handleMoveToPipeline] Called with:', { targetName, lead, onMoveToPipeline: !!onMoveToPipeline })
    
    if (!lead) {
      console.error('[handleMoveToPipeline] No lead')
      toast.error('Nu există lead selectat')
      return
    }
    
    if (!onMoveToPipeline) {
      console.error('[handleMoveToPipeline] onMoveToPipeline is not defined')
      toast.error('Funcția de mutare nu este disponibilă')
      return
    }
    
    const leadId = getLeadId()
    console.log('[handleMoveToPipeline] leadId:', leadId)
    
    if (!leadId) {
      console.error('[handleMoveToPipeline] Could not get leadId')
      toast.error('Nu s-a putut obține ID-ul lead-ului')
      return
    }
    
    try {
      console.log('[handleMoveToPipeline] Calling onMoveToPipeline with:', { leadId, targetName })
      await onMoveToPipeline(leadId, targetName)
      toast.success(`Card mutat în ${targetName}`)
    } catch (error) {
      console.error('[handleMoveToPipeline] Error moving to pipeline:', error)
      toast.error('Eroare la mutarea cardului: ' + (error instanceof Error ? error.message : 'Eroare necunoscută'))
    }
  }, [lead, onMoveToPipeline, getLeadId])

  // Mută lead-ul în multiple pipelines (bulk move)
  const handleBulkMoveToPipelines = useCallback(async () => {
    if (!lead || !onBulkMoveToPipelines || selectedPipes.length === 0) return
    
    const leadId = getLeadId()
    if (!leadId) {
      toast.error('Nu s-a putut obține ID-ul lead-ului')
      return
    }
    
    setMovingPipes(true)
    try {
      await onBulkMoveToPipelines(leadId, selectedPipes)
      toast.success(`Card mutat în ${selectedPipes.length} pipeline-uri`)
      setSelectedPipes([]) // Clear selection after move
    } catch (error) {
      console.error('Error bulk moving to pipelines:', error)
      toast.error('Eroare la mutarea cardului')
    } finally {
      setMovingPipes(false)
    }
  }, [lead, onBulkMoveToPipelines, selectedPipes, getLeadId, setMovingPipes, setSelectedPipes])

  return {
    togglePipe,
    pickAll,
    clearAll,
    handleMoveToPipeline,
    handleBulkMoveToPipelines,
    allPipeNames,
  }
}


