/**
 * Hook pentru încărcarea datelor inițiale în componenta Preturi
 */

import { useEffect, useCallback } from 'react'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { listServices } from '@/lib/supabase/serviceOperations'
import { listParts } from '@/lib/supabase/partOperations'
import { listTraysForServiceFile } from '@/lib/supabase/serviceFileOperations'
import { listQuotesForLead } from '@/lib/utils/preturi-helpers'
import { loadVanzariViewV4FromDb } from '@/lib/history/vanzariViewV4Load'
import { getPipelinesWithStages } from '@/lib/supabase/leadOperations'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Part } from '@/lib/supabase/partOperations'
import type { LeadQuote } from '@/lib/types/preturi'

const supabase = supabaseBrowser()

interface UsePreturiDataLoaderProps {
  leadId: string
  fisaId?: string | null
  initialQuoteId?: string | null
  pipelineSlug?: string
  isDepartmentPipeline?: boolean
  setLoading: (loading: boolean) => void
  setServices: (services: Service[]) => void
  setParts: (parts: Part[]) => void
  setInstruments: (instruments: Array<{ id: string; name: string; weight: number; department_id: string | null; repairable?: boolean }>) => void
  setTechnicians: (technicians: Array<{ id: string; name: string }>) => void
  setDepartments: (departments: Array<{ id: string; name: string }>) => void
  setPipelines: (pipelines: string[]) => void
  setPipelinesWithIds: (pipelines: Array<{ id: string; name: string }>) => void
  setPipeLoading: (loading: boolean) => void
  setQuotes: (quotes: LeadQuote[]) => void
  setSelectedQuoteId: (id: string | null) => void
  setV4InitialData: (data: import('@/lib/history/vanzariViewV4Load').V4InitialData | null) => void
}

export function usePreturiDataLoader({
  leadId,
  fisaId,
  initialQuoteId,
  pipelineSlug,
  isDepartmentPipeline = false,
  setLoading,
  setServices,
  setParts,
  setInstruments,
  setTechnicians,
  setDepartments,
  setPipelines,
  setPipelinesWithIds,
  setPipeLoading,
  setQuotes,
  setSelectedQuoteId,
  setV4InitialData,
}: UsePreturiDataLoaderProps) {
  // Nu mai reîmprospătăm datele la revenirea pe tab – evita încărcarea la fiecare schimb de tab.
  // Refresh rămâne la acțiuni explicite (schimb fișă, salvare, etc.).

  // Funcție pentru refresh pipelines
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

  // Funcție pentru refresh departments
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

  // Încarcă toate datele inițiale
  useEffect(() => {
    let mounted = true

    const loadAllData = async () => {
      setLoading(true)
      try {
        // Load services, parts, instruments, technicians, pipelines, departments în paralel
        const [
          servicesData,
          partsData,
          instrumentsData,
          techniciansData,
          pipelinesData,
        ] = await Promise.all([
          listServices(),
          listParts(),
          // Încarcă TOATE instrumentele (active + inactive) pentru a le afișa în tăviță
          // Filtrarea pe "active" se face doar la selecție (dropdown)
          supabase.from('instruments').select('id,name,weight,department_id,pipeline,active').order('name'),
          supabase
            .from('app_members')
            .select('user_id, name, role')
            .order('name', { ascending: true }),
          getPipelinesWithStages(),
        ])

        if (!mounted) return

        // Set services
        if (servicesData) {
          setServices(servicesData)
        }

        // Set parts
        if (partsData) {
          setParts(partsData)
        }

        // Set instruments (incarcă TOATE, filtrarea pe active se face în componente)
        if (instrumentsData.data) {
          setInstruments(
            instrumentsData.data.map((inst: any) => ({
              id: inst.id,
              name: inst.name,
              weight: inst.weight || 0,
              department_id: inst.department_id,
              pipeline: inst.pipeline,
              repairable: inst.repairable !== false,
              active: inst.active !== false,
            }))
          )
        } else if (instrumentsData.error) {
          console.error('[usePreturiDataLoader] Eroare la încărcarea instrumentelor:', instrumentsData.error)
        }

        // Set technicians
        if (techniciansData.data) {
          const members = techniciansData.data as any[]

          // dacă suntem pe un pipeline de departament, încercăm să filtrăm doar userii cu acces la acel pipeline
          let filtered = members
          try {
            const slug = String(pipelineSlug || '').toLowerCase().trim()
            const allPipes = (pipelinesData as any)?.data as any[] | null
            const pipelineForSlug =
              slug && Array.isArray(allPipes)
                ? allPipes.find(p => String(p?.name || '').toLowerCase().includes(slug))
                : null
            const pipelineId = pipelineForSlug?.id || null

            if (isDepartmentPipeline && pipelineId) {
              const { data: perms, error: permsError } = await supabase
                .from('user_pipeline_permissions')
                .select('user_id')
                .eq('pipeline_id', pipelineId)

              if (!permsError) {
                const allowed = new Set((perms || []).map((p: any) => p.user_id))
                filtered = members.filter(m => {
                  const role = String(m?.role || '').toLowerCase()
                  if (role === 'owner' || role === 'admin') return true
                  return allowed.has(m.user_id)
                })
              }
            }
          } catch {
            // dacă nu putem citi permisiunile (RLS), păstrăm lista completă
            filtered = members
          }

          setTechnicians(
            filtered.map((m: any) => ({
              id: m.user_id,
              name: m.name || `User ${String(m.user_id).slice(0, 8)}`,
            }))
          )
        }

        // Set pipelines
        if (pipelinesData && pipelinesData.data && Array.isArray(pipelinesData.data)) {
          const pipelinesList = pipelinesData.data as Array<{ id: string; name: string }>
          setPipelinesWithIds(pipelinesList.map(p => ({ id: p.id, name: p.name })))
          setPipelines(pipelinesList.map(p => p.name))
        }

        // Load departments
        await refreshDepartments()

        // Load quotes (tăvițe)
        const quotesData = fisaId 
          ? await listTraysForServiceFile(fisaId)
          : await listQuotesForLead(leadId)
        
        if (!mounted) return

        let quotesArray = Array.isArray(quotesData) ? quotesData : (quotesData as any)?.data || []
        
        // DEZACTIVAT: Nu mai creăm automat o tăviță fantomă dacă nu există tăvițe.
        // Aceasta cauza un BUG GRAV: la fiecare deschidere a unui lead finalizat/trimis,
        // se crea o tăviță fără număr, fără date, care apărea ca "NOUA" în pipeline.
        // Utilizatorul poate crea manual o tăviță dacă are nevoie.
        // if (fisaId && quotesArray.length === 0) { ... createTray ... }
        
        // Actualizează quotes doar dacă s-au schimbat
        setQuotes(prevQuotes => {
          // Compară dacă array-urile sunt diferite
          const prevQuotesArray = Array.isArray(prevQuotes) ? prevQuotes : []
          if (prevQuotesArray.length !== quotesArray.length) {
            return quotesArray
          }
          const idsMatch = prevQuotesArray.every((q, idx) => q && q.id === quotesArray[idx]?.id)
          return idsMatch ? prevQuotesArray : quotesArray
        })

        // Încarcă datele V4 (tray_items) pentru fișă – 1 apel listTrayItemsForTrays, pentru afișare la revenire pe fișă
        // În pipeline departament: filtrează doar itemurile cu department_id = id departament (nume pipeline = nume departament)
        if (fisaId && quotesArray.length > 0) {
          const catalog = instrumentsData?.data
            ? (instrumentsData.data as any[]).map((i: any) => ({ id: i.id, name: i.name }))
            : []
          let filterDepartmentId: string | null = null
          if (isDepartmentPipeline && pipelineSlug && pipelinesData?.data && Array.isArray(pipelinesData.data)) {
            const pipelinesList = pipelinesData.data as Array<{ id: string; name: string }>
            const toSlug = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, '-')
            const pipelineForSlug = pipelinesList.find((p: any) => toSlug(p?.name || '') === toSlug(pipelineSlug))
            const pipelineName = pipelineForSlug?.name
            // tray_items.department_id vine din instruments.department_id (tabelul departments), nu din pipelines – rezolvăm id-ul departamentului după nume
            if (pipelineName) {
              const { data: deptData } = await supabase.from('departments').select('id,name').order('name')
              const departmentsList = (deptData ?? []) as Array<{ id: string; name: string }>
              const dept = departmentsList.find((d: any) => toSlug(d?.name || '') === toSlug(pipelineName))
              if (dept?.id) filterDepartmentId = dept.id
            }
          }
          const { data: v4Data } = await loadVanzariViewV4FromDb(fisaId, catalog, {
            traysPreloaded: quotesArray,
            filterDepartmentId: filterDepartmentId ?? undefined,
          })
          if (mounted && v4Data) setV4InitialData(v4Data)
        } else {
          if (mounted) setV4InitialData(null)
        }

        // Selectează prima tăviță sau cea specificată; când nu există tăvițe (ex. fișă arhivată), curăță selecția
        if (quotesArray && quotesArray.length > 0) {
          // Prioritizează tăvița "undefined" (fără număr) dacă există
          const undefinedTray = quotesArray.find((q: any) => !q.number || q.number === '')
          const quoteToSelect = initialQuoteId 
            ? quotesArray.find((q: any) => q.id === initialQuoteId) || undefinedTray || quotesArray[0]
            : undefinedTray || quotesArray[0]
          setSelectedQuoteId(quoteToSelect.id)
        } else {
          setSelectedQuoteId(null)
        }
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadAllData()

    return () => {
      mounted = false
    }
  }, [
    leadId,
    fisaId,
    initialQuoteId,
    pipelineSlug,
    isDepartmentPipeline,
    refreshDepartments,
    setLoading,
    setServices,
    setParts,
    setInstruments,
    setTechnicians,
    setPipelines,
    setPipelinesWithIds,
    setQuotes,
    setSelectedQuoteId,
    setV4InitialData,
  ])

  return {
    refreshPipelines,
    refreshDepartments,
  }
}
