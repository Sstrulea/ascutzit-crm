/**
 * Hook pentru gestionarea efectelor (useEffect) în componenta Preturi
 */

import { useEffect, useRef, useCallback } from 'react'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { getServiceFile } from '@/lib/supabase/serviceFileOperations'
import { getPipelineItemForItem } from '@/lib/supabase/pipelineOperations'
import { listTags, toggleLeadTag } from '@/lib/supabase/tagOperations'
import type { LeadQuoteItem } from '@/lib/types/preturi'

const supabase = supabaseBrowser()

interface UsePreturiEffectsProps {
  leadId: string
  fisaId?: string | null
  selectedQuoteId: string | null
  isVanzariPipeline: boolean
  isReceptiePipeline: boolean
  pipelinesWithIds: Array<{ id: string; name: string }>
  isCommercialPipeline: boolean
  /** Stage-ul fișei din Kanban (Receptie); dacă e setat, evităm getPipelineItemForItem + stages request. */
  initialServiceFileStage?: string | null
  
  setUrgentTagId: (id: string | null) => void
  setInstrumentForm: React.Dispatch<React.SetStateAction<any>>
  setInstrumentSettings: React.Dispatch<React.SetStateAction<any>>
  setUrgentAllServices: (urgent: boolean) => void
  setSubscriptionType: (type: 'services' | 'parts' | 'both' | '') => void
  setCurrentServiceFileStage: (stage: string | null) => void
  setTrayDetails: (details: string) => void
  setLoadingTrayDetails: (loading: boolean) => void
  setItems: React.Dispatch<React.SetStateAction<LeadQuoteItem[]>>
  setTrayImages: React.Dispatch<React.SetStateAction<any[]>>
  setAssignedImageId: React.Dispatch<React.SetStateAction<string | null>>
  setIsDirty: (dirty: boolean) => void
  setOfficeDirect: (value: boolean) => void
  setCurierTrimis: (value: boolean) => void
  setGlobalDiscountPct: (value: number) => void
  setIsServiceFileLocked: (value: boolean) => void
  setServiceFileStatus: (value: string | null) => void
  setPaymentCash: (value: boolean) => void
  setPaymentCard: (value: boolean) => void
  
  svc: any
  instrumentForm: any
  instrumentSettings: any
  urgentAllServices: boolean
  items: LeadQuoteItem[]
  urgentTagId: string | null
}

export function usePreturiEffects({
  leadId,
  fisaId,
  selectedQuoteId,
  isVanzariPipeline,
  isReceptiePipeline,
  pipelinesWithIds,
  isCommercialPipeline,
  initialServiceFileStage,
  setUrgentTagId,
  setInstrumentForm,
  setInstrumentSettings,
  setUrgentAllServices,
  setSubscriptionType,
  setCurrentServiceFileStage,
  setTrayDetails,
  setLoadingTrayDetails,
  setItems,
  setTrayImages,
  setAssignedImageId,
  setIsDirty,
    setOfficeDirect,
    setCurierTrimis,
    setGlobalDiscountPct,
    setIsServiceFileLocked,
    setServiceFileStatus,
    setPaymentCash,
    setPaymentCard,
    svc,
  instrumentForm,
  instrumentSettings,
  urgentAllServices,
  items,
  urgentTagId,
}: UsePreturiEffectsProps) {
  // Găsește tag-ul urgent la încărcare
  useEffect(() => {
    (async () => {
      const tags = await listTags()
      const urgentTag = tags.find(t => t.name.toLowerCase() === 'urgent')
      if (urgentTag) {
        setUrgentTagId(urgentTag.id)
      }
    })()
  }, [setUrgentTagId])

  // Încarcă imaginile și imaginea reprezentativă pentru tăvița selectată
  useEffect(() => {
    if (!selectedQuoteId) {
      setTrayImages([])
      setAssignedImageId(null)
      return
    }

    const loadImagesAndAssigned = async () => {
      try {
        const [imageOps, { getTray }] = await Promise.all([
          import('@/lib/supabase/imageOperations'),
          import('@/lib/supabase/serviceFileOperations'),
        ])
        const [images, { data: tray }] = await Promise.all([
          imageOps.listTrayImages(selectedQuoteId),
          getTray(selectedQuoteId),
        ])
        setTrayImages(images)
        setAssignedImageId((tray as any)?.assigned_image_id ?? null)
      } catch (error) {
        console.error('Error loading tray images / assigned image:', error)
        setTrayImages([])
        setAssignedImageId(null)
      }
    }

    loadImagesAndAssigned()
  }, [selectedQuoteId, setTrayImages, setAssignedImageId])

// -------------------------------------------------- COD PENTRU POPULARE CASETE -----------------------------------------------------
  // Sincronizează instrumentForm.instrument cu svc.instrumentId
  // IMPORTANT: NU suprascrie dacă svc.instrumentId este GOL - permite popularea manuală din onRowClick
  useEffect(() => {
    // Dacă svc.instrumentId este gol, NU suprascrie instrumentForm (lasă utilizatorul să populeze manual)
    if (!svc.instrumentId) return
    
    if (svc.instrumentId !== instrumentForm.instrument || svc.qty !== instrumentForm.qty) {
      const savedSettings = instrumentSettings[svc.instrumentId]
      setInstrumentForm((prev: any) => ({ 
        ...prev, 
        instrument: svc.instrumentId,
        qty: savedSettings?.qty || svc.qty || '1'
      }))
    }
  }, [svc.instrumentId, svc.qty, instrumentSettings, instrumentForm.instrument, setInstrumentForm])
// -----------------------------------------------------------------------------------------------------------------------------------

  // Aplică urgent tuturor serviciilor și pieselor când urgentAllServices e bifat
  useEffect(() => {
    setItems(prev => {
      // Verifică dacă există iteme care trebuie actualizate
      const itemsArray = Array.isArray(prev) ? prev : []
      
      // Dacă prev nu este un array, returnează un array gol
      if (!Array.isArray(prev)) {
        return []
      }
      
      if (!Array.isArray(itemsArray)) {
        console.error('❌ [usePreturiEffects] ERROR: itemsArray is NOT an array!', itemsArray)
        return []
      }
      
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      let needsUpdate = false
      for (let i = 0; i < itemsArray.length; i++) {
        const it = itemsArray[i]
        if (it && (it.item_type === 'service' || it.item_type === 'part') && it.urgent !== urgentAllServices) {
          needsUpdate = true
          break // Oprim loop-ul când găsim primul item care necesită update
        }
      }
      
      if (!needsUpdate) {
        return prev // Nu face update dacă nu e necesar
      }
      
      // Actualizează itemele și marchează ca dirty
      const updated = prev.map(it => {
        if (!it) return it
        return (it.item_type === 'service' || it.item_type === 'part') ? { ...it, urgent: urgentAllServices } : it
      })
      setIsDirty(true)
      return updated
    })
  }, [urgentAllServices, setItems, setIsDirty])

  // Verifică și atribuie/elimină tag-ul urgent când se schimbă items-urile
  useEffect(() => {
    const itemsArray = Array.isArray(items) ? items : []
    if (!urgentTagId || !itemsArray.length) return

    if (isVanzariPipeline) {
      const removeUrgentTagFromVanzari = async () => {
        try {
          const { data: existing } = await supabase
            .from('lead_tags')
            .select('lead_id')
            .eq('lead_id', leadId)
            .eq('tag_id', urgentTagId)
            .maybeSingle()

          if (existing) {
            await toggleLeadTag(leadId, urgentTagId)
          }
        } catch (error) {
          console.error('Eroare la eliminarea tag-ului urgent din Vanzari:', error)
        }
      }
      removeUrgentTagFromVanzari()
      return
    }
    
    if (!Array.isArray(itemsArray)) {
      console.error('❌ [usePreturiEffects] ERROR: itemsArray is NOT an array for urgent check!', itemsArray)
      return
    }
    
    // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
    let hasUrgentItems = false
    for (let i = 0; i < itemsArray.length; i++) {
      const item = itemsArray[i]
      if (item && item.urgent === true) {
        hasUrgentItems = true
        break // Oprim loop-ul când găsim primul item urgent
      }
    }
    
    const checkAndToggleUrgentTag = async () => {
      try {
        const { data: existing } = await supabase
          .from('lead_tags')
          .select('lead_id')
          .eq('lead_id', leadId)
          .eq('tag_id', urgentTagId)
          .maybeSingle()

        if (hasUrgentItems && !existing) {
          await toggleLeadTag(leadId, urgentTagId)
        } else if (!hasUrgentItems && existing) {
          await toggleLeadTag(leadId, urgentTagId)
        }
      } catch (error) {
        console.error('Eroare la gestionarea tag-ului urgent:', error)
      }
    }

    checkAndToggleUrgentTag()
  }, [items, urgentTagId, leadId, isVanzariPipeline])

  // Reîncarcă urgent și subscription_type din service_file când se schimbă tăvița selectată
  useEffect(() => {
    if (!fisaId || !selectedQuoteId) return
    
    const reloadUrgentAndSubscription = async () => {
      try {
        const { data: serviceFileData } = await getServiceFile(fisaId)
        if (serviceFileData) {
          setUrgentAllServices(serviceFileData.urgent || false)
          setSubscriptionType(serviceFileData.subscription_type || '')
        }
      } catch (error) {
        console.error('Eroare la reîncărcarea urgent și subscription:', error)
      }
    }
    
    reloadUrgentAndSubscription()
  }, [fisaId, selectedQuoteId, setUrgentAllServices, setSubscriptionType])

  // Încarcă stage-ul curent al fișei în pipeline-ul Receptie (sau folosește initialServiceFileStage din Kanban)
  useEffect(() => {
    if (!fisaId || pipelinesWithIds.length === 0) {
      setCurrentServiceFileStage(null)
      return
    }
    if (initialServiceFileStage != null && initialServiceFileStage !== '') {
      setCurrentServiceFileStage(initialServiceFileStage)
      return
    }
    const loadCurrentStage = async () => {
      try {
        let targetPipeline = pipelinesWithIds.find(p => {
          const nameLC = p.name.toLowerCase()
          if (isReceptiePipeline) return nameLC.includes('receptie') || nameLC.includes('reception')
          if (isVanzariPipeline) return nameLC.includes('vanzari') || nameLC.includes('vanzare') || nameLC.includes('sales')
          return false
        })
        if (!targetPipeline) {
          targetPipeline = pipelinesWithIds.find(p =>
            p.name.toLowerCase().includes('receptie') || p.name.toLowerCase().includes('reception')
          )
        }
        if (!targetPipeline) {
          setCurrentServiceFileStage(null)
          return
        }
        const { data: pipelineItem, error } = await getPipelineItemForItem(
          'service_file',
          fisaId,
          targetPipeline.id
        )
        if (error || !pipelineItem) {
          setCurrentServiceFileStage(null)
          return
        }
        if (pipelineItem.stage_id) {
          const { data: stageData, error: stageError } = await supabase
            .from('stages')
            .select('name')
            .eq('id', pipelineItem.stage_id)
            .single()
          if (!stageError && stageData) {
            setCurrentServiceFileStage((stageData as any).name)
          } else {
            setCurrentServiceFileStage(null)
          }
        } else {
          setCurrentServiceFileStage(null)
        }
      } catch (error) {
        console.error('Eroare la încărcarea stage-ului curent:', error)
        setCurrentServiceFileStage(null)
      }
    }
    loadCurrentStage()
  }, [fisaId, isReceptiePipeline, isVanzariPipeline, pipelinesWithIds, setCurrentServiceFileStage, initialServiceFileStage])

  // Un singur getServiceFile: încarcă flags (office_direct, curier_trimis, is_locked, cash, card) + details (trayDetails)
  const loadServiceFileFlags = useCallback(async () => {
    if (!fisaId) {
      setOfficeDirect(false)
      setCurierTrimis(false)
      setGlobalDiscountPct(0)
      setIsServiceFileLocked(false)
      setServiceFileStatus(null)
      setPaymentCash(false)
      setPaymentCard(false)
      setTrayDetails('')
      return
    }
    setLoadingTrayDetails(true)
    try {
      const { data: serviceFileData, error } = await getServiceFile(fisaId)
      if (error) {
        console.error('[usePreturiEffects] Eroare la încărcarea service file:', error)
        setOfficeDirect(false)
        setCurierTrimis(false)
        setGlobalDiscountPct(0)
        setIsServiceFileLocked(false)
        setServiceFileStatus(null)
        setPaymentCash(false)
        setPaymentCard(false)
        setTrayDetails('')
        return
      }
      if (serviceFileData) {
        const serviceFileAny = serviceFileData as any
        const isLockedFromDB = serviceFileAny.is_locked ?? serviceFileAny.is_Locked ?? serviceFileData.is_locked ?? false
        setOfficeDirect(serviceFileData.office_direct || false)
        setCurierTrimis(serviceFileData.curier_trimis || false)
        setPaymentCash(serviceFileData.cash || false)
        setPaymentCard(serviceFileData.card || false)
        setGlobalDiscountPct(serviceFileData.global_discount_pct ?? 0)
        setIsServiceFileLocked(Boolean(isLockedFromDB) === true)
        const statusVal = serviceFileAny.status ?? null
        setServiceFileStatus(typeof statusVal === 'string' ? statusVal : null)
        if (serviceFileData.details) {
          try {
            const detailsObj = typeof serviceFileData.details === 'string'
              ? JSON.parse(serviceFileData.details)
              : serviceFileData.details
            const detailsText = detailsObj?.text || detailsObj?.comments || detailsObj?.trayDetails || ''
            setTrayDetails(detailsText)
          } catch {
            setTrayDetails(typeof serviceFileData.details === 'string' ? serviceFileData.details : '')
          }
        } else {
          setTrayDetails('')
        }
      } else {
        setOfficeDirect(false)
        setCurierTrimis(false)
        setGlobalDiscountPct(0)
        setIsServiceFileLocked(false)
        setServiceFileStatus(null)
        setPaymentCash(false)
        setPaymentCard(false)
        setTrayDetails('')
      }
    } catch (error) {
      console.error('[usePreturiEffects] Eroare la încărcarea service file:', error)
      setOfficeDirect(false)
      setCurierTrimis(false)
      setGlobalDiscountPct(0)
      setIsServiceFileLocked(false)
      setServiceFileStatus(null)
      setPaymentCash(false)
      setPaymentCard(false)
      setTrayDetails('')
    } finally {
      setLoadingTrayDetails(false)
    }
  }, [fisaId, setOfficeDirect, setCurierTrimis, setGlobalDiscountPct, setIsServiceFileLocked, setServiceFileStatus, setPaymentCash, setPaymentCard, setTrayDetails, setLoadingTrayDetails])

  // Un singur apel getServiceFile: flags + trayDetails (loadServiceFileFlags face ambele)
  useEffect(() => {
    loadServiceFileFlags()
  }, [loadServiceFileFlags])

  // Returnăm funcția de reîncărcare pentru a putea fi apelată manual după salvare
  return { reloadServiceFileFlags: loadServiceFileFlags }
}
