/**
 * Hook principal de orchestrare pentru LeadDetailsPanel
 * Combină toate hook-urile specializate și expune funcțiile și state-urile pentru componente
 */

import { useMemo, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useLeadDetailsState } from './useLeadDetailsState'
import { useLeadDetailsDataLoader } from './useLeadDetailsDataLoader'
import { useLeadDetailsCheckboxes } from './useLeadDetailsCheckboxes'
import { useLeadDetailsTags } from './useLeadDetailsTags'
import { useLeadDetailsPipelines } from './useLeadDetailsPipelines'
import { useLeadDetailsServiceFiles } from './useLeadDetailsServiceFiles'
import { useLeadDetailsTrayDetails } from './useLeadDetailsTrayDetails'
import { useLeadDetailsDepartmentActions } from './useLeadDetailsDepartmentActions'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { appendTechnicianDetail } from '@/lib/supabase/serviceFileOperations'
import type { TechnicianDetailEntry } from '@/lib/supabase/serviceFileOperations'
import type { Lead } from '@/app/(crm)/dashboard/page'
import type { PreturiRef } from '@/lib/types/preturi'

interface UseLeadDetailsBusinessProps {
  lead: Lead | null
  pipelineSlug?: string
  pipelines: string[]
  stages: string[]
  isVanzariPipeline: boolean
  isReceptiePipeline: boolean
  isCurierPipeline: boolean
  isDepartmentPipeline: boolean
  isReparatiiPipeline: boolean
  isSaloaneHorecaFrizeriiPipeline: boolean
  onStageChange: (leadId: string, newStage: string) => void
  onTagsChange?: (leadId: string, tags: any[]) => void
  onMoveToPipeline?: (leadId: string, targetName: string) => Promise<void>
  onBulkMoveToPipelines?: (leadId: string, pipelineNames: string[]) => Promise<void>
  onClose: () => void
  onRefresh?: () => void
  onItemStageUpdated?: (itemId: string, stageName: string, stageId: string) => void
  user: { id: string } | null
  /** Tab inițial la restaurare (fisa / de-confirmat / istoric). */
  initialSection?: 'fisa' | 'de-confirmat' | 'istoric'
  /** Vânzări: la adăugarea tag-ului Sună! mută lead-ul în stage-ul Suna */
  onSunaTagAdded?: (leadId: string) => void
  /** Vânzări: la scoaterea tag-ului Sună! mută lead-ul în Leaduri sau Leaduri Straine (după telefon) */
  onSunaTagRemoved?: (leadId: string, phone: string | undefined) => void
}

export function useLeadDetailsBusiness({
  lead,
  pipelineSlug,
  pipelines,
  stages,
  isVanzariPipeline,
  isReceptiePipeline,
  isCurierPipeline,
  isDepartmentPipeline,
  isReparatiiPipeline,
  isSaloaneHorecaFrizeriiPipeline,
  onStageChange,
  onTagsChange,
  onMoveToPipeline,
  onBulkMoveToPipelines,
  onClose,
  onRefresh,
  onItemStageUpdated,
  user,
  initialSection,
  onSunaTagAdded,
  onSunaTagRemoved,
}: UseLeadDetailsBusinessProps) {
  
  // Ref pentru componenta Preturi - pentru a apela salvarea la Close
  const preturiRef = useRef<PreturiRef>(null)

  // Helper pentru a obține leadId corect 
  const getLeadId = useCallback(() => {
    if (!lead) return null
    const leadAny = lead as any
    // Verifică dacă este service_file sau tray (au leadId din relație)
    if (leadAny?.type === 'service_file' || leadAny?.type === 'tray') {
      // IMPORTANT: Returnăm DOAR leadId din relație, NU lead.id ca fallback!
      // lead.id ar fi ID-ul fișei de serviciu/tray, nu al lead-ului
      if (leadAny.leadId) {
        return leadAny.leadId
      }
      // Dacă nu avem leadId în relație, returnăm null pentru a forța rezolvarea din DB
      console.warn('⚠️ getLeadId: service_file/tray nu are leadId în relație, lead.id:', lead.id)
      return null
    }
    // Pentru tray items (isQuote indică că este un tray)
    if (leadAny?.isQuote && leadAny?.leadId) {
      return leadAny.leadId
    }
    // Pentru lead-uri normale, lead.id este ID-ul lead-ului
    return lead.id
  }, [lead])
  
  // Helper pentru a obține fisaId-ul corect pentru service_files
  const getServiceFileId = useCallback(async () => {
    if (!lead) return null
    const leadAny = lead as any
    if (leadAny?.type === 'service_file') {
      return lead.id // Pentru service_file, id-ul cardului este fisaId
    }
    // Dacă este tray, obținem service_file_id din tray
    if (leadAny?.type === 'tray' || leadAny?.isQuote) {
      const trayId = leadAny?.type === 'tray' ? lead.id : (leadAny?.quoteId || leadAny?.id)
      if (trayId) {
        const supabase = supabaseBrowser()
        const { data: tray } = await supabase
          .from('trays')
          .select('service_file_id')
          .eq('id', trayId)
          .single()
        return tray?.service_file_id || null
      }
    }
    // Dacă este lead, folosim prima fișă de serviciu
    const leadId = getLeadId()
    if (leadId) {
      const { listServiceSheetsForLead } = await import('./useLeadDetailsDataLoader')
      const sheets = await listServiceSheetsForLead(leadId)
      return sheets.length > 0 ? sheets[0].id : null
    }
    return null
  }, [lead, getLeadId]) // ← FĂRĂ supabase
  
  // Helper pentru a obține trayId-ul corect pentru trays
  const getTrayId = useCallback(() => {
    if (!lead) return null
    const leadAny = lead as any
    if (leadAny?.type === 'tray') {
      return lead.id // Pentru tray, id-ul cardului este trayId
    }
    return null
  }, [lead])

  // State management
  const state = useLeadDetailsState(lead?.stage, initialSection)

  // Data loader
  const dataLoader = useLeadDetailsDataLoader({
    lead,
    isDepartmentPipeline,
    getLeadId,
    getServiceFileId,
    getTrayId,
    setServiceSheets: state.setServiceSheets,
    setSelectedFisaId: state.setSelectedFisaId,
    setLoadingSheets: state.setLoadingSheets,
    setAllTrays: state.setAllTrays,
    setSelectedTrayId: state.setSelectedTrayId,
    setLoadingTrays: state.setLoadingTrays,
    setAllTags: state.setAllTags,
    setSelectedTagIds: state.setSelectedTagIds,
    setTechnicians: state.setTechnicians,
    setTrayDetails: state.setTrayDetails,
    setLoadingTrayDetails: state.setLoadingTrayDetails,
    setTechnicianDetails: state.setTechnicianDetails,
    setTechnicianDetailsFromEvents: state.setTechnicianDetailsFromEvents,
    setLoadingTechnicianDetails: state.setLoadingTechnicianDetails,
    setLoadingDetails: state.setLoadingDetails,
    setTraysDetails: state.setTraysDetails,
    setTotalFisaSum: state.setTotalFisaSum,
    setLoadingTotalSum: state.setLoadingTotalSum,
    selectedFisaId: state.selectedFisaId,
    selectedTrayId: state.selectedTrayId,
  })

  // Handler pentru stage change
  const handleStageChange = useCallback((newStage: string) => {
    console.log('[handleStageChange] Called with:', { newStage, lead, onStageChange: !!onStageChange })
    
    state.setStage(newStage)
    const leadId = getLeadId()
    console.log('[handleStageChange] leadId:', leadId)
    
    if (!leadId) {
      console.error('[handleStageChange] Could not get leadId')
      toast.error('Nu s-a putut obține ID-ul lead-ului')
      return
    }
    
    if (!onStageChange) {
      console.error('[handleStageChange] onStageChange is not defined')
      toast.error('Funcția de schimbare etapă nu este disponibilă')
      return
    }
    
    try {
      console.log('[handleStageChange] Calling onStageChange with:', { leadId, newStage })
      onStageChange(leadId, newStage)
    } catch (error) {
      console.error('[handleStageChange] Error changing stage:', error)
      toast.error('Eroare la schimbarea etapei: ' + (error instanceof Error ? error.message : 'Eroare necunoscută'))
    }
  }, [getLeadId, onStageChange, state.setStage, lead])

  // Checkboxes
  const checkboxes = useLeadDetailsCheckboxes({
    lead,
    isVanzariPipeline,
    stages,
    callBack: state.callBack,
    setCallBack: state.setCallBack,
    callbackDate: state.callbackDate,
    setCallbackDate: state.setCallbackDate,
    nuRaspunde: state.nuRaspunde,
    setNuRaspunde: state.setNuRaspunde,
    nuRaspundeCallbackAt: state.nuRaspundeCallbackAt,
    setNuRaspundeCallbackAt: state.setNuRaspundeCallbackAt,
    noDeal: state.noDeal,
    setNoDeal: state.setNoDeal,
    coletAjuns: state.coletAjuns,
    setColetAjuns: state.setColetAjuns,
    curierRetur: state.curierRetur,
    setCurierRetur: state.setCurierRetur,
    coletTrimis: state.coletTrimis,
    setColetTrimis: state.setColetTrimis,
    asteptRidicarea: state.asteptRidicarea,
    setAsteptRidicarea: state.setAsteptRidicarea,
    ridicPersonal: state.ridicPersonal,
    setRidicPersonal: state.setRidicPersonal,
    getLeadId,
    handleStageChange,
    setStage: state.setStage,
  })

  // Tags (Receptie poate atribui/elimina PINNED); getLeadId pentru lead/fișă/tăviță
  const tags = useLeadDetailsTags({
    lead,
    getLeadId,
    allTags: state.allTags,
    selectedTagIds: state.selectedTagIds,
    setSelectedTagIds: state.setSelectedTagIds,
    onTagsChange,
    isReceptiePipeline,
    onSunaTagAdded,
    onSunaTagRemoved,
  })

  // Pipelines
  const pipelinesHook = useLeadDetailsPipelines({
    lead,
    pipelines,
    selectedPipes: state.selectedPipes,
    setSelectedPipes: state.setSelectedPipes,
    movingPipes: state.movingPipes,
    setMovingPipes: state.setMovingPipes,
    onMoveToPipeline,
    onBulkMoveToPipelines,
    getLeadId,
  })

  // Service files
  const serviceFiles = useLeadDetailsServiceFiles({
    getLeadId,
    setServiceSheets: state.setServiceSheets,
    setSelectedFisaId: state.setSelectedFisaId,
    setLoadingSheets: state.setLoadingSheets,
    loadServiceSheets: dataLoader.loadServiceSheets,
  })

  // Tray details (informații client = leads.details)
  const trayDetailsHook = useLeadDetailsTrayDetails({
    fisaId: state.selectedFisaId,
    isVanzariPipeline,
    isReceptiePipeline,
    trayDetails: state.trayDetails,
    setTrayDetails: state.setTrayDetails,
    setSavingTrayDetails: state.setSavingTrayDetails,
    setLoadingTrayDetails: state.setLoadingTrayDetails,
    getLeadId,
  })

  // Technician details append (doar în departamente tehnice)
  const appendTechnicianDetailHandler = useCallback(async (text: string, stage: string, stageLabel: string): Promise<TechnicianDetailEntry[]> => {
    const fisaId = state.selectedFisaId
    if (!fisaId) {
      toast.error('Selectează o fișă de serviciu')
      return state.technicianDetails
    }
    state.setSavingTechnicianDetails(true)
    try {
      const { data, error } = await appendTechnicianDetail(fisaId, { stage, stageLabel, text }, user?.id)
      if (error) {
        toast.error('Eroare la salvare: ' + (error?.message ?? 'Eroare necunoscută'))
        return state.technicianDetails
      }
      const updated = data ?? []
      state.setTechnicianDetails(updated)
      toast.success('Notă adăugată.')
      return updated
    } finally {
      state.setSavingTechnicianDetails(false)
    }
  }, [state.selectedFisaId, state.technicianDetails, state.setTechnicianDetails, state.setSavingTechnicianDetails, user?.id])

  // Department actions
  const departmentActions = useLeadDetailsDepartmentActions({
    lead,
    stages,
    isDepartmentPipeline,
    handleStageChange,
    setStage: state.setStage,
    onRefresh,
    onItemStageUpdated,
    user,
  })

  // Handler pentru Close care salvează înainte de a închide
  const handleCloseWithSave = useCallback(async () => {
    try {
      // Salvează informațiile client (leads.details) înainte de a închide
      if ((isVanzariPipeline || isReceptiePipeline) && getLeadId() && state.trayDetails !== undefined) {
        await trayDetailsHook.saveServiceFileDetails(state.trayDetails)
      }
      
      // Salvează în istoric înainte de a închide
      if (preturiRef.current) {
        await preturiRef.current.save()
      }
    } catch (error) {
      console.error('Eroare la salvare automată:', error)
    }
    // Închide panoul
    onClose()
  }, [onClose, state.trayDetails, trayDetailsHook.saveServiceFileDetails, getLeadId, isVanzariPipeline, isReceptiePipeline])

  return {
    // State
    state,
    
    // Data loader
    dataLoader: {
      ...dataLoader,
      loadTraysDetails: dataLoader.loadTraysDetails,
      calculateTotalFisaSum: dataLoader.calculateTotalFisaSum,
    },
    
    // Checkboxes
    checkboxes,
    
    // Tags
    tags,
    
    // Pipelines
    pipelines: pipelinesHook,
    
    // Service files
    serviceFiles,
    
    // Tray details
    trayDetails: trayDetailsHook,
    
    // Technician details
    appendTechnicianDetail: appendTechnicianDetailHandler,
    
    // Department actions
    departmentActions,
    
    // Helpers
    getLeadId,
    getServiceFileId,
    getTrayId,
    handleStageChange,
    handleCloseWithSave,
    
    // Refs
    preturiRef,
  }
}

