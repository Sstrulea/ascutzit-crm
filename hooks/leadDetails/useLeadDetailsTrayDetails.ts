/**
 * Hook pentru gestionarea „informații client” (details) în LeadDetailsPanel.
 * details = leads.details, populate din formular sau introduse manual.
 */

import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { debounce } from '@/lib/utils'
import { updateLeadWithHistory } from '@/lib/supabase/leadOperations'

interface UseLeadDetailsTrayDetailsProps {
  fisaId: string | null
  isVanzariPipeline: boolean
  isReceptiePipeline?: boolean
  trayDetails: string
  setTrayDetails: React.Dispatch<React.SetStateAction<string>>
  setSavingTrayDetails: React.Dispatch<React.SetStateAction<boolean>>
  setLoadingTrayDetails: React.Dispatch<React.SetStateAction<boolean>>
  getLeadId: () => string | null
}

export function useLeadDetailsTrayDetails({
  isVanzariPipeline,
  isReceptiePipeline = false,
  setTrayDetails,
  setSavingTrayDetails,
  setLoadingTrayDetails,
  getLeadId,
}: UseLeadDetailsTrayDetailsProps) {

  const saveLeadDetails = useCallback(async (details: string) => {
    if (!isVanzariPipeline && !isReceptiePipeline) {
      toast.error('Detaliile pot fi modificate doar din pipeline-ul Vânzări sau Recepție')
      return
    }

    const leadId = getLeadId()
    if (!leadId) {
      console.warn('[useLeadDetailsTrayDetails] Cannot save details: lead not found')
      return
    }

    const trimmed = (details ?? '').trim()
    if (!trimmed) return

    try {
      setSavingTrayDetails(true)
      const { error } = await updateLeadWithHistory(leadId, { details: trimmed })
      if (error) {
        console.error('[useLeadDetailsTrayDetails] Error saving lead details:', error)
        toast.error('Eroare la salvarea informațiilor client: ' + (error?.message ?? 'Eroare necunoscută'))
        throw error
      }
      toast.success('Detalii salvate.')
    } catch (err: any) {
      throw err
    } finally {
      setSavingTrayDetails(false)
    }
  }, [getLeadId, isVanzariPipeline, isReceptiePipeline, setSavingTrayDetails])

  const debouncedSaveDetails = useMemo(
    () => debounce((details: string) => {
      saveLeadDetails(details)
    }, 1000),
    [saveLeadDetails]
  )

  return {
    saveServiceFileDetails: saveLeadDetails,
    debouncedSaveDetails,
  }
}
