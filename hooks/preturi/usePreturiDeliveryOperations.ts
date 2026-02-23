/**
 * Hook pentru operațiile cu livrare și pipeline (delivery checkboxes, refresh pipelines/departments)
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { updateServiceFile } from '@/lib/supabase/serviceFileOperations'
import { moveServiceFileToPipeline, addServiceFileToPipeline } from '@/lib/supabase/pipelineOperations'
import { getPipelinesWithStages, updateLead } from '@/lib/supabase/leadOperations'
import { getOrCreateCurierTrimisTag, getOrCreateOfficeDirectTag, addLeadTagIfNotPresent } from '@/lib/supabase/tagOperations'

const supabase = supabaseBrowser()

interface UsePreturiDeliveryOperationsProps {
  fisaId?: string | null
  pipelinesWithIds: Array<{ id: string; name: string }>
  globalDiscountPct: number
  setPipelines: React.Dispatch<React.SetStateAction<string[]>>
  setPipelinesWithIds: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string }>>>
  setDepartments: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string }>>>
  setPipeLoading: React.Dispatch<React.SetStateAction<boolean>>
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>
  setOfficeDirect: React.Dispatch<React.SetStateAction<boolean>>
  setCurierTrimis: React.Dispatch<React.SetStateAction<boolean>>
  setCurierScheduledAt: React.Dispatch<React.SetStateAction<string | null>>
  setRetur: React.Dispatch<React.SetStateAction<boolean>>
}

export function usePreturiDeliveryOperations({
  fisaId,
  pipelinesWithIds,
  globalDiscountPct,
  setPipelines,
  setPipelinesWithIds,
  setDepartments,
  setPipeLoading,
  setIsDirty,
  setOfficeDirect,
  setCurierTrimis,
  setCurierScheduledAt,
  setRetur,
}: UsePreturiDeliveryOperationsProps) {
  const { user } = useAuth()

  // Funcție pentru reîmprospătarea pipeline-urilor
  const refreshPipelines = useCallback(async () => {
    setPipeLoading(true)
    try {
      const { data, error } = await supabase
        .from('pipelines')
        .select('id,name,is_active,position')
        .eq('is_active', true)
        .order('position', { ascending: true })
      if (error) throw error
      setPipelines((data ?? []).map((r: any) => r.name))
      setPipelinesWithIds((data ?? []).map((r: any) => ({ id: r.id, name: r.name })))
    } finally { 
      setPipeLoading(false) 
    }
  }, [setPipelines, setPipelinesWithIds, setPipeLoading])

  // Funcție pentru reîmprospătarea departamentelor
  const refreshDepartments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('id,name')
        .order('name', { ascending: true })
      if (error) throw error
      setDepartments((data ?? []).map((r: any) => ({ id: r.id, name: r.name })))
    } catch (error) {
      console.error('Error loading departments:', error)
    }
  }, [setDepartments])

  const handleDeliveryCheckboxChange = useCallback(async (isOfficeDirect: boolean) => {
    setOfficeDirect(isOfficeDirect)
    setCurierTrimis(!isOfficeDirect)
    setIsDirty(true)
    
    // Persistă imediat Office Direct în DB (pentru ca Recepție să vadă fișa)
    if (fisaId) {
      try {
        const updates: any = {
          office_direct: isOfficeDirect,
          office_direct_at: isOfficeDirect ? new Date().toISOString() : null,
        }
        if (isOfficeDirect) {
          // Când marcăm Office direct, dezactivăm Curier Trimis și în DB
          updates.curier_trimis = false
          updates.curier_scheduled_at = null
        }
        await updateServiceFile(fisaId, updates)
      } catch (e) {
        console.warn('[usePreturiDeliveryOperations] Cannot persist Office Direct immediately:', e)
      }

      // Asigură-te că fișa apare în pipeline-ul Recepție, la stage „Office direct”
      if (isOfficeDirect && Array.isArray(pipelinesWithIds) && pipelinesWithIds.length > 0) {
        try {
          const receptiePipeline = pipelinesWithIds.find((p) =>
            (p.name || '').toLowerCase().includes('receptie')
          )
          if (receptiePipeline) {
            const { data: pipelinesData } = await getPipelinesWithStages()
            const receptieData = (pipelinesData || []).find((p: any) => p.id === receptiePipeline.id)
            const officeStage = receptieData?.stages?.find(
              (s: any) =>
                s.is_active &&
                typeof s.name === 'string' &&
                s.name.toLowerCase().includes('office') &&
                s.name.toLowerCase().includes('direct')
            )
            if (officeStage) {
              await addServiceFileToPipeline(fisaId, receptiePipeline.id, officeStage.id)
            }
          }
        } catch (e) {
          console.warn('[usePreturiDeliveryOperations] Cannot ensure service file in Receptie Office Direct:', e)
        }
      }

      // Atribuie tag-ul „Office direct” și actualizează lead pentru Statistici apeluri
      try {
        const { data: sf } = await supabase
          .from('service_files')
          .select('lead_id')
          .eq('id', fisaId)
          .maybeSingle()
        const leadId = (sf as any)?.lead_id as string | undefined
        if (leadId && isOfficeDirect) {
          const tag = await getOrCreateOfficeDirectTag()
          await addLeadTagIfNotPresent(leadId, tag.id)
          const nowIso = new Date().toISOString()
          await updateLead(leadId, {
            office_direct_at: nowIso,
            office_direct_user_id: user?.id ?? null,
            curier_trimis_at: null,
            curier_trimis_user_id: null,
            ...(user?.id ? { claimed_by: user.id } : {}),
          })
        }
      } catch (e) {
        console.warn('[usePreturiDeliveryOperations] Cannot assign Office Direct tag/lead update:', e)
      }
    }
  }, [fisaId, pipelinesWithIds, setIsDirty, setOfficeDirect, setCurierTrimis, user?.id])

  // Mută fișa în pipeline-ul corespunzător când se bifează checkbox-ul Curier Trimis
  // IMPORTANT: Pentru pipeline-ul Vanzari, checkbox-urile NU salvează automat în DB
  // Ele doar actualizează state-ul local. Salvare în DB se face doar la apăsarea butonului "Salvează în Istoric"
  const handleCurierTrimisChange = useCallback(async (isCurierTrimis: boolean, dateTime?: string) => {
    // IMPORTANT: Actualizează state-ul local IMEDIAT pentru a actualiza UI-ul
    // NU salvează automat în DB - salvare se face doar la apăsarea butonului "Salvează în Istoric"
    setCurierTrimis(isCurierTrimis)
    setOfficeDirect(!isCurierTrimis)
    setIsDirty(true)
    
    // Salvează data și ora programată pentru curier în state
    // Va fi persistată în DB când se apasă "Salvează în Istoric"
    if (isCurierTrimis && dateTime) {
      setCurierScheduledAt(dateTime)
      console.log('[usePreturiDeliveryOperations] Curier Trimis cu data/ora:', dateTime)
    } else if (!isCurierTrimis) {
      // Resetează data programată când se debifează Curier Trimis
      setCurierScheduledAt(null)
    }

    // Atribuie tag-ul „Curier Trimis” pe lead și salvează user + dată (pentru afișare „de [nume]” și regula 24h)
    if (isCurierTrimis && fisaId) {
      try {
        const { data: sf } = await supabase
          .from('service_files')
          .select('lead_id')
          .eq('id', fisaId)
          .maybeSingle()
        const leadId = (sf as any)?.lead_id as string | undefined
        if (leadId) {
          const tag = await getOrCreateCurierTrimisTag()
          await addLeadTagIfNotPresent(leadId, tag.id)
          const nowIso = new Date().toISOString()
          await updateLead(leadId, {
            curier_trimis_at: dateTime || nowIso,
            curier_trimis_user_id: user?.id ?? null,
            office_direct_at: null,
            office_direct_user_id: null,
            ...(user?.id ? { claimed_by: user.id } : {}),
          })
        }
      } catch (e) {
        console.warn('[usePreturiDeliveryOperations] Cannot assign Curier Trimis tag on lead:', e)
      }
    }
    
    // IMPORTANT: Nu mai salvăm automat în DB când se bifează checkbox-urile
    // Salvare se face doar la apăsarea butonului "Salvează în Istoric" sau "Close"
    // Această modificare permite utilizatorului să bifeze checkbox-urile fără să blocheze fișa imediat
  }, [fisaId, setIsDirty, setOfficeDirect, setCurierTrimis, setCurierScheduledAt, user?.id])

  // Gestionează tag-ul de Retur pentru fișa de serviciu
  const handleReturChange = useCallback(async (isRetur: boolean) => {
    if (!fisaId) {
      console.warn('[usePreturiDeliveryOperations] Cannot toggle retur - no fisaId')
      return
    }

    setRetur(isRetur)
    setIsDirty(true)

    try {
      // Găsește sau creează tag-ul "Retur"
      let returTagId: string | null = null
      
      const { data: existingTag } = await supabase
        .from('tags')
        .select('id')
        .ilike('name', 'retur')
        .single()
      
      if (existingTag) {
        returTagId = existingTag.id
      } else if (isRetur) {
        // Creează tag-ul dacă nu există
        const { data: newTag, error: createError } = await supabase
          .from('tags')
          .insert({ name: 'Retur', color: 'orange' })
          .select('id')
          .single()
        
        if (createError) {
          console.error('[usePreturiDeliveryOperations] Error creating Retur tag:', createError)
          toast.error('Eroare la crearea tag-ului Retur')
          return
        }
        returTagId = newTag?.id
      }

      if (!returTagId) {
        console.warn('[usePreturiDeliveryOperations] Retur tag not found and not created')
        return
      }

      // Obține lead_id din service_file
      const { data: serviceFile } = await supabase
        .from('service_files')
        .select('lead_id')
        .eq('id', fisaId)
        .single()

      if (!serviceFile?.lead_id) {
        console.warn('[usePreturiDeliveryOperations] Cannot find lead_id for service file')
        return
      }

      const leadId = serviceFile.lead_id

      if (isRetur) {
        // Adaugă tag-ul la lead
        const { error: addError } = await supabase
          .from('lead_tags')
          .upsert({ lead_id: leadId, tag_id: returTagId }, { onConflict: 'lead_id,tag_id' })
        
        if (addError) {
          console.error('[usePreturiDeliveryOperations] Error adding Retur tag:', addError)
          toast.error('Eroare la adăugarea tag-ului Retur')
          return
        }
        toast.success('Tag Retur adăugat')
      } else {
        // Șterge tag-ul de la lead
        const { error: removeError } = await supabase
          .from('lead_tags')
          .delete()
          .eq('lead_id', leadId)
          .eq('tag_id', returTagId)
        
        if (removeError) {
          console.error('[usePreturiDeliveryOperations] Error removing Retur tag:', removeError)
          toast.error('Eroare la eliminarea tag-ului Retur')
          return
        }
        toast.success('Tag Retur eliminat')
      }
    } catch (error) {
      console.error('[usePreturiDeliveryOperations] Error handling retur change:', error)
      toast.error('Eroare la gestionarea tag-ului Retur')
    }
  }, [fisaId, setRetur, setIsDirty])

  return {
    refreshPipelines,
    refreshDepartments,
    handleDeliveryCheckboxChange,
    handleCurierTrimisChange,
    handleReturChange,
  }
}


