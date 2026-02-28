/**
 * Hook pentru încărcarea datelor în componenta LeadDetailsPanel
 */

import { useEffect, useCallback, useMemo } from 'react'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { 
  listServiceFilesForLead, 
  createServiceFile,
  createTray,
  listTraysForServiceFile,
  listTraysForServiceFiles,
  getNextGlobalServiceFileNumber,
  getServiceFile,
} from '@/lib/supabase/serviceFileOperations'
import { listTags } from '@/lib/supabase/tagOperations'
import { listServices } from '@/lib/supabase/serviceOperations'
import { toast } from 'sonner'

const supabaseClient = supabaseBrowser()

// Tipuri pentru UI
type ServiceSheet = {
  id: string
  number: string
  status: string
  date: string
  lead_id: string
  fisa_index?: number
}

type Technician = {
  id: string
  name: string
}

type Lead = {
  id: string
  stage?: string
  tags?: Array<{ id: string }>
  [key: string]: any
}

// Funcții helper pentru transformarea datelor
const listServiceSheetsForLead = async (leadId: string): Promise<ServiceSheet[]> => {
  const { data, error } = await listServiceFilesForLead(leadId)
  if (error) {
    console.error('Error loading service files:', error)
    return []
  }
  // Transformă ServiceFile în ServiceSheet (adaugă fisa_index)
  return (data || []).map((sf, index) => ({
    ...sf,
    fisa_index: index + 1,
    id: sf.id,
  })) as ServiceSheet[]
}

const listTraysForServiceSheet = async (fisaId: string) => {
  const { data, error } = await listTraysForServiceFile(fisaId)
  if (error) {
    const msg = error?.message ?? error?.details ?? (typeof error === 'object' ? JSON.stringify(error) : String(error))
    console.error('Error loading trays:', msg, error?.code ?? '', error)
    return []
  }
  return (data || []) as any[]
}

const listQuotesForLead = async (leadId: string) => {
  const serviceSheets = await listServiceSheetsForLead(leadId)
  if (serviceSheets.length === 0) return []
  const { data: traysBatch, error } = await listTraysForServiceFiles(serviceSheets.map(s => s.id))
  if (error || !traysBatch?.length) return []
  const sheetIds = new Set(serviceSheets.map(s => s.id))
  return traysBatch
    .filter((t: any) => sheetIds.has(t.service_file_id))
    .map((t: any) => ({ ...t, fisa_id: t.service_file_id }))
}

interface UseLeadDetailsDataLoaderProps {
  lead: Lead | null
  isDepartmentPipeline: boolean
  
  // Helpers pentru a obține ID-uri
  getLeadId: () => string | null
  getServiceFileId: () => Promise<string | null>
  getTrayId: () => string | null
  
  // Setters pentru state
  setServiceSheets: React.Dispatch<React.SetStateAction<ServiceSheet[]>>
  setSelectedFisaId: React.Dispatch<React.SetStateAction<string | null>>
  setLoadingSheets: React.Dispatch<React.SetStateAction<boolean>>
  setAllTrays: React.Dispatch<React.SetStateAction<Array<{ id: string; number: string; service_file_id: string }>>>
  setSelectedTrayId: React.Dispatch<React.SetStateAction<string | null>>
  setLoadingTrays: React.Dispatch<React.SetStateAction<boolean>>
  setAllTags: React.Dispatch<React.SetStateAction<any[]>>
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>
  setTechnicians: React.Dispatch<React.SetStateAction<Technician[]>>
  setTrayDetails: React.Dispatch<React.SetStateAction<string>>
  setLoadingTrayDetails: React.Dispatch<React.SetStateAction<boolean>>
  setTechnicianDetails: React.Dispatch<React.SetStateAction<Array<{ stage: string; stageLabel: string; text: string; at: string; userId?: string }>>>
  setTechnicianDetailsFromEvents: React.Dispatch<React.SetStateAction<Array<{ stage: string; stageLabel: string; text: string; at: string; userId?: string }>>>
  setLoadingTechnicianDetails: React.Dispatch<React.SetStateAction<boolean>>
  setLoadingDetails: React.Dispatch<React.SetStateAction<boolean>>
  setTraysDetails: React.Dispatch<React.SetStateAction<any[]>>
  setTotalFisaSum: React.Dispatch<React.SetStateAction<number | null>>
  setLoadingTotalSum: React.Dispatch<React.SetStateAction<boolean>>
  
  // State pentru verificare selecție
  selectedFisaId: string | null
  selectedTrayId: string | null
}

export function useLeadDetailsDataLoader({
  lead,
  isDepartmentPipeline,
  getLeadId,
  getServiceFileId,
  getTrayId,
  setServiceSheets,
  setSelectedFisaId,
  setLoadingSheets,
  setAllTrays,
  setSelectedTrayId,
  setLoadingTrays,
  setAllTags,
  setSelectedTagIds,
  setTechnicians,
  setTrayDetails,
  setLoadingTrayDetails,
  setTechnicianDetails,
  setTechnicianDetailsFromEvents,
  setLoadingTechnicianDetails,
  setLoadingDetails,
  setTraysDetails,
  setTotalFisaSum,
  setLoadingTotalSum,
  selectedFisaId,
  selectedTrayId,
}: UseLeadDetailsDataLoaderProps) {
  const supabase = supabaseBrowser()

  // Funcție helper pentru încărcarea fișelor (folosită atât la inițializare cât și după creare)
  const loadServiceSheets = useCallback(async (leadId: string) => {
    try {
      const sheets = await listServiceSheetsForLead(leadId)
      return sheets
    } catch (error) {
      console.error('Error loading service sheets:', error)
      throw error
    }
  }, [])

  // Memoizează leadId și trayId pentru a evita re-executări inutile
  const leadIdMemo = useMemo(() => getLeadId(), [getLeadId])
  const trayIdMemo = useMemo(() => getTrayId(), [getTrayId])
  const leadTypeMemo = useMemo(() => (lead as any)?.type, [lead])
  const leadIsQuoteMemo = useMemo(() => (lead as any)?.isQuote, [lead])
  const leadQuoteIdMemo = useMemo(() => (lead as any)?.quoteId, [lead])
  
  // Încarcă fișele de serviciu pentru lead
  useEffect(() => {
    if (!leadIdMemo) return
    
    let isMounted = true
    
    const loadData = async () => {
      setLoadingSheets(true)
      try {
        const sheets = await loadServiceSheets(leadIdMemo)
        if (!isMounted) return
        
        setServiceSheets(sheets)
        
        // Dacă este un service_file (vine din pipeline Curier), selectează fișa direct
        const serviceFileId = await getServiceFileId()
        const trayId = getTrayId()
        
        if (serviceFileId) {
          // Cardului service_file - selectează fișa corespunzătoare
          const fisaFromCard = sheets.find(s => s.id === serviceFileId)
          if (fisaFromCard) {
            setSelectedFisaId(fisaFromCard.id)
          } else if (sheets.length > 0) {
            setSelectedFisaId(sheets[0].id)
          }
        } else if (trayId) {
          // Dacă este un tray (vine din pipeline departament), găsește fișa care conține tăvița (batch)
          const { data: traysBatch } = await listTraysForServiceFiles(sheets.map(s => s.id))
          const found = traysBatch?.find((t: any) => t.id === trayId)
          if (found) setSelectedFisaId(found.service_file_id)
          // Dacă nu s-a găsit, selectează prima fișă
          if (!selectedFisaId && sheets.length > 0) {
            setSelectedFisaId(sheets[0].id)
          }
        } else if (leadIsQuoteMemo && leadQuoteIdMemo) {
          // Dacă este un tray, găsește fișa care conține tăvița
          const allQuotes = await listQuotesForLead(leadIdMemo)
          const quote = allQuotes.find(q => q.id === leadQuoteIdMemo)
          if (quote?.fisa_id) {
            const fisaWithQuote = sheets.find(s => s.id === quote.fisa_id)
            if (fisaWithQuote) {
              setSelectedFisaId(fisaWithQuote.id)
            } else if (sheets.length > 0) {
              setSelectedFisaId(sheets[0].id)
            }
          } else if (sheets.length > 0) {
            setSelectedFisaId(sheets[0].id)
          }
        } else {
          // Selectează prima fișă dacă există și nu avem deja una selectată
          const sheetsArray = Array.isArray(sheets) ? sheets : []
          
          if (sheetsArray.length > 0) {
            if (!Array.isArray(sheetsArray)) {
              console.error('❌ [useLeadDetailsDataLoader] ERROR: sheetsArray is NOT an array!', sheetsArray)
              return
            }
            
            // IMPORTANT: Verificăm dacă fișa selectată există în lista de fișe
            // Dacă există, o păstrăm. Dacă nu există (fișă ștearsă), selectăm prima.
            // Această verificare se face doar la încărcarea inițială sau când se schimbă lead-ul,
            // NU când utilizatorul schimbă manual fișa (selectedFisaId nu este în dependențe).
            let currentSelectedExists = false
            if (selectedFisaId && Array.isArray(sheetsArray)) {
              for (let i = 0; i < sheetsArray.length; i++) {
                const s = sheetsArray[i]
                if (s && s.id === selectedFisaId) {
                  currentSelectedExists = true
                  break
                }
              }
            }
            // Resetăm DOAR dacă fișa selectată nu mai există (probabil a fost ștearsă)
            // NU resetăm dacă utilizatorul a selectat manual o altă fișă
            if (!currentSelectedExists && sheetsArray.length > 0) {
              setSelectedFisaId(sheetsArray[0]?.id || null)
            }
          }
        }
      } catch (error) {
        if (!isMounted) return
        console.error('Error loading service sheets:', error)
        toast.error('Eroare la încărcarea fișelor')
      } finally {
        if (isMounted) {
          setLoadingSheets(false)
        }
      }
    }
    
    loadData()
    
    return () => {
      isMounted = false
    }
    // IMPORTANT: selectedFisaId NU este în dependențe pentru a preveni loop-ul
    // când utilizatorul schimbă manual fișa. useEffect-ul se execută doar când
    // se schimbă lead-ul sau contextul, nu când utilizatorul schimbă manual fișa.
  }, [leadIdMemo, leadTypeMemo, leadIsQuoteMemo, leadQuoteIdMemo, loadServiceSheets, getServiceFileId, getTrayId])

  // Încarcă toate tăvițele pentru lead în pipeline-urile departament
  useEffect(() => {
    if (!isDepartmentPipeline) return
    // Dacă nu avem leadIdMemo dar avem trayIdMemo, încărcăm direct din tray
    if (!leadIdMemo && !trayIdMemo) return
    
    let isMounted = true
    
    const loadTrays = async () => {
      setLoadingTrays(true)
      try {
        let allTraysList: Array<{ id: string; number: string; service_file_id: string }> = []
        
        // Dacă avem leadIdMemo, încărcăm toate tăvițele din toate service_files
        if (leadIdMemo) {
          const sheets = await loadServiceSheets(leadIdMemo)
          if (!isMounted) return
          
          // OPTIMIZARE: un singur request pentru toate tăvițele lead-ului (batch)
          if (sheets.length > 0) {
            const { data: traysBatch, error: traysErr } = await listTraysForServiceFiles(sheets.map(s => s.id))
            if (!traysErr && traysBatch?.length) {
              allTraysList.push(...traysBatch.map((t: any) => ({
                id: t.id,
                number: t.number,
                service_file_id: t.service_file_id
              })))
            }
          }
        } else if (trayIdMemo) {
          // Dacă nu avem leadIdMemo dar avem trayIdMemo, încărcăm direct informațiile tray-ului
          // Aceasta rezolvă cazul când cardul tray nu are leadId în relație
          const { data: trayData, error: trayError } = await supabaseClient
            .from('trays')
            .select('id, number, service_file_id, service_file:service_files!inner(lead_id)')
            .eq('id', trayIdMemo)
            .single()
          
          if (!isMounted) return
          
          if (!trayError && trayData) {
            allTraysList.push({
              id: trayData.id,
              number: trayData.number,
              service_file_id: trayData.service_file_id
            })
            
            // Setăm direct selectedFisaId și selectedTrayId
            setSelectedTrayId(trayIdMemo)
            setSelectedFisaId(trayData.service_file_id)
            setAllTrays(allTraysList)
            setLoadingTrays(false)
            return // Return devreme pentru că am setat tot ce trebuia
          }
        }
        
        if (!isMounted) return
        
        setAllTrays(allTraysList)
        
        // Dacă este un tray (vine din pipeline departament), selectează-l direct
        if (trayIdMemo) {
          const foundTray = allTraysList.find(t => t.id === trayIdMemo)
          if (foundTray) {
            setSelectedTrayId(trayIdMemo)
            setSelectedFisaId(foundTray.service_file_id)
          } else if (allTraysList.length > 0) {
            setSelectedTrayId(allTraysList[0].id)
            setSelectedFisaId(allTraysList[0].service_file_id)
          }
        } else if (allTraysList.length > 0 && !selectedTrayId) {
          setSelectedTrayId(allTraysList[0].id)
          setSelectedFisaId(allTraysList[0].service_file_id)
        }
      } catch (error) {
        if (!isMounted) return
        console.error('Error loading trays:', error)
        toast.error('Eroare la încărcarea tăvițelor')
      } finally {
        if (isMounted) {
          setLoadingTrays(false)
        }
      }
    }
    
    loadTrays()
    
    return () => {
      isMounted = false
    }
  }, [isDepartmentPipeline, leadIdMemo, trayIdMemo, loadServiceSheets, selectedTrayId])

  // Real-time subscription pentru tags
  useEffect(() => {
    const ch = supabase
      .channel('rt-tags-lead-panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' },
        () => listTags().then(setAllTags).catch(console.error)
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [setAllTags])

  // Încarcă tags la mount
  useEffect(() => { 
    listTags().then(setAllTags).catch(console.error) 
  }, [setAllTags])

  // Setează tag-urile selectate din lead (și când lead.tags se schimbă din exterior, ex. după ce se scoate un tag de pe card)
  const tagIdsFromLead = (lead?.tags ?? []).map((t: { id?: string }) => t.id).filter(Boolean).sort().join(',')
  useEffect(() => {
    if (!lead) return
    setSelectedTagIds((lead.tags ?? []).map((t: { id?: string }) => t.id).filter(Boolean) as string[])
  }, [lead?.id, tagIdsFromLead, setSelectedTagIds])

  // Detalii comunicate de client (leads.details) sunt inițializate din lead la deschidere
  // în lead-details-panel (useEffect care setează trayDetails din lead?.details).
  // Nu mai încărcăm din service_files.details.

  // Încarcă tehnicienii
  useEffect(() => {
    const loadTechnicians = async () => {
      try {
        const { data: membersData, error } = await supabase
          .from('app_members')
          .select('user_id, name')
          .order('created_at', { ascending: true })
        
        if (error) {
          console.error('Error loading app_members:', error)
          setTechnicians([])
          return
        }
        
        if (!membersData || membersData.length === 0) {
          setTechnicians([])
          return
        }
        
        const techs: Technician[] = (membersData || []).map((m: any) => {
          let name = m.name || m.Name || null
          if (!name && m.user_id) {
            name = `User ${m.user_id.slice(0, 8)}`
          }
          if (!name) {
            name = 'Necunoscut'
          }
          
          return {
            id: m.user_id,
            name: name
          }
        })
        
        techs.sort((a, b) => a.name.localeCompare(b.name))
        setTechnicians(techs)
      } catch (error) {
        console.error('Error loading technicians:', error)
      }
    }
    loadTechnicians()
  }, [setTechnicians])

  // Încarcă technician_details + evenimente QC (items_events) când se schimbă fișa selectată
  useEffect(() => {
    if (!selectedFisaId) {
      setTechnicianDetails([])
      setTechnicianDetailsFromEvents([])
      return
    }
    let cancelled = false
    setLoadingTechnicianDetails(true)
    Promise.all([
      getServiceFile(selectedFisaId).then(({ data, error }) => {
        if (cancelled) return null
        if (error) return []
        const details = (data as any)?.technician_details
        return Array.isArray(details) ? details : []
      }),
      (async () => {
        if (cancelled) return []
        const trays = await listTraysForServiceSheet(selectedFisaId)
        const trayIds = (trays || []).map((t: any) => t.id)
        if (trayIds.length === 0) return []
        const { data: events } = await supabase
          .from('items_events')
          .select('id, event_type, message, created_at, actor_name')
          .eq('type', 'tray')
          .in('item_id', trayIds)
          .in('event_type', ['quality_validated', 'quality_not_validated'])
          .order('created_at', { ascending: false })
          .limit(100)
        if (cancelled || !events?.length) return []
        return events.map((ev: any) => {
          const stageLabel = ev.event_type === 'quality_validated' ? 'QC (Validat)' : 'QC (Nevalidat)'
          const text = ev.actor_name
            ? `${ev.actor_name}: ${ev.message || ''}`
            : (ev.message || '')
          return {
            stage: 'qc',
            stageLabel,
            text,
            at: ev.created_at,
          }
        })
      })(),
    ])
      .then(([details, fromEvents]) => {
        if (cancelled) return
        setTechnicianDetails(details ?? [])
        setTechnicianDetailsFromEvents(fromEvents ?? [])
      })
      .finally(() => {
        if (!cancelled) setLoadingTechnicianDetails(false)
      })
    return () => { cancelled = true }
  }, [selectedFisaId, setTechnicianDetails, setTechnicianDetailsFromEvents, setLoadingTechnicianDetails])

  // Funcție pentru încărcarea detaliilor tăvițelor din fișă
  const loadTraysDetails = useCallback(async (fisaId: string) => {
    if (!fisaId) return
    
    setLoadingDetails(true)
    try {
      // Încarcă serviciile, instrumentele și pipeline-urile pentru a obține prețurile și departamentele
      const [servicesResult, instrumentsResult, pipelinesResult] = await Promise.all([
        listServices().then(s => {
          return s
        }),
        supabaseClient.from('instruments').select('id,name,pipeline,active').then(({ data, error }) => {
          if (error) {
            console.error('Error loading instruments:', error)
            return []
          }
          return data || []
        }),
        supabaseClient.from('pipelines').select('id,name').then(({ data, error }) => {
          if (error) {
            console.error('Error loading pipelines:', error)
            return []
          }
          return data || []
        })
      ])
      
      // Creează un map pentru pipeline-uri (id -> name)
      const pipelineMap = new Map(pipelinesResult.map((p: any) => [p.id, p.name]))
      
      // Creează un map pentru instrumente (id -> pipeline_id)
      const instrumentPipelineMap = new Map(instrumentsResult.map((i: any) => [i.id, i.pipeline]))
      
      // Creează un map pentru instrumente (id -> { id, name })
      const instrumentsMap = new Map(instrumentsResult.map((i: any) => [i.id, { id: i.id, name: i.name }]))
      
      // Încarcă toate tăvițele din fișă
      const trays = await listTraysForServiceSheet(fisaId)
      
      const services = servicesResult
      
      // Pentru fiecare tăviță, încarcă items-urile și calculează totalurile
      // Folosim exact aceeași logică ca în preturi.tsx
      const details = await Promise.all(
        trays.map(async (tray) => {
          const items = await listQuoteItems(tray.id, services, instrumentPipelineMap, pipelineMap, instrumentsMap)
          
          // Exclude items-urile cu item_type: null (doar instrument, fără serviciu) din calculele de totaluri
          const visibleItems = items.filter((it: any) => it.item_type !== null)
          
          // Helper: qty reparabil = qty - nr. nereparate (sursă: tray_items.unrepaired_qty sau notes)
          const getRepairableQty = (it: any) => {
            const qty = it.qty || 1
            const unrepaired = Number(it.unrepaired_qty ?? it.non_repairable_qty) || 0
            return Math.max(0, qty - unrepaired)
          }
          
          // Calculează totalurile folosind aceeași logică ca în preturi.tsx
          // Scădem cantitatea de nereparabile din calcul
          const subtotal = visibleItems.reduce((acc: number, it: any) => acc + getRepairableQty(it) * it.price, 0)
          
          const totalDiscount = visibleItems.reduce(
            (acc: number, it: any) => acc + getRepairableQty(it) * it.price * (Math.min(100, Math.max(0, it.discount_pct)) / 100),
            0
          )
          
          // Urgent se preia din service_file, nu din tăviță
          // Va fi setat mai jos după ce încărcăm service_file
          const isUrgent = false // Va fi actualizat mai jos
          const urgentAmount = 0 // Va fi actualizat mai jos
          
          // Calculează reducerile pentru abonament (10% servicii, 5% piese) - exact ca în preturi.tsx PrintViewData
          const subscriptionType = tray.subscription_type || null
          
          // Calculează totalul pentru servicii (afterDisc + urgent)
          const servicesTotal = visibleItems
            .filter((it: any) => it.item_type === 'service')
            .reduce((acc: number, it: any) => {
              const base = getRepairableQty(it) * it.price
              const disc = base * (Math.min(100, Math.max(0, it.discount_pct)) / 100)
              const afterDisc = base - disc
              const urgent = isUrgent ? afterDisc * (30 / 100) : 0
              return acc + afterDisc + urgent
            }, 0)
          
          // Calculează totalul pentru piese (afterDisc)
          const partsTotal = visibleItems
            .filter((it: any) => it.item_type === 'part')
            .reduce((acc: number, it: any) => {
              const base = getRepairableQty(it) * it.price
              const disc = base * (Math.min(100, Math.max(0, it.discount_pct)) / 100)
              return acc + base - disc
            }, 0)
          
          // Aplică reducerile pentru abonament
          let subscriptionDiscount = 0
          let subscriptionDiscountServices = 0
          let subscriptionDiscountParts = 0
          
          if (subscriptionType === 'services' || subscriptionType === 'both') {
            subscriptionDiscountServices = servicesTotal * 0.10
            subscriptionDiscount += subscriptionDiscountServices
          }
          if (subscriptionType === 'parts' || subscriptionType === 'both') {
            subscriptionDiscountParts = partsTotal * 0.05
            subscriptionDiscount += subscriptionDiscountParts
          }
          
          // Total folosind aceeași formulă ca în preturi.tsx: baseTotal - subscriptionDiscountAmount
          const baseTotal = subtotal - totalDiscount + urgentAmount
          const total = baseTotal - subscriptionDiscount
          
          return {
            tray,
            items,
            subtotal,
            discount: totalDiscount,
            urgent: urgentAmount,
            subscriptionDiscount,
            subscriptionDiscountServices,
            subscriptionDiscountParts,
            subscriptionType,
            total
          }
        })
      )
      
      setTraysDetails(details)
    } catch (error) {
      console.error('Error loading trays details:', error)
      toast.error('Eroare la încărcarea detaliilor')
    } finally {
      setLoadingDetails(false)
    }
  }, [setLoadingDetails, setTraysDetails])

  // Funcție pentru calcularea sumei totale a tuturor tăvițelor din fișă
  const calculateTotalFisaSum = useCallback(async (fisaId: string) => {
    if (!fisaId) {
      setTotalFisaSum(null)
      return
    }
    
    setLoadingTotalSum(true)
    try {
      // Încarcă serviciile, instrumentele și pipeline-urile
      const [services, instrumentsResult, pipelinesResult] = await Promise.all([
        listServices(),
        supabaseClient.from('instruments').select('id,name,pipeline,active').then(({ data, error }) => {
          if (error) {
            console.error('Error loading instruments:', error)
            return []
          }
          return data || []
        }),
        supabaseClient.from('pipelines').select('id,name').then(({ data, error }) => {
          if (error) {
            console.error('Error loading pipelines:', error)
            return []
          }
          return data || []
        })
      ])
      
      // Creează un map pentru pipeline-uri (id -> name)
      const pipelineMap = new Map(pipelinesResult.map((p: any) => [p.id, p.name]))
      
      // Creează un map pentru instrumente (id -> pipeline_id)
      const instrumentPipelineMap = new Map(instrumentsResult.map((i: any) => [i.id, i.pipeline]))
      
      // Creează un map pentru instrumente (id -> { id, name })
      const instrumentsMap = new Map(instrumentsResult.map((i: any) => [i.id, { id: i.id, name: i.name }]))
      
      const trays = await listTraysForServiceSheet(fisaId)
      
      let totalSum = 0
      
      for (const tray of trays) {
        const items = await listQuoteItems(tray.id, services, instrumentPipelineMap, pipelineMap, instrumentsMap)
        
        // Exclude items-urile cu item_type: null (doar instrument, fără serviciu) din calculele de totaluri
        const visibleItems = items.filter((it: any) => it.item_type !== null)
        
        // Helper: qty reparabil = qty - nr. nereparate (unrepaired_qty din DB sau notes)
        const getRepairableQty = (it: any) => {
          const qty = it.qty || 1
          const unrepaired = Number(it.unrepaired_qty ?? it.non_repairable_qty) || 0
          return Math.max(0, qty - unrepaired)
        }
        
        // Calculează totalurile folosind aceeași logică ca în loadTraysDetails
        // Scădem cantitatea de nereparabile din calcul
        const subtotal = visibleItems.reduce((acc: number, it: any) => acc + getRepairableQty(it) * it.price, 0)
        
        const totalDiscount = visibleItems.reduce(
          (acc: number, it: any) => acc + getRepairableQty(it) * it.price * (Math.min(100, Math.max(0, it.discount_pct)) / 100),
          0
        )
        
        // IMPORTANT: Încarcă urgent din service_file, nu din tăviță
        const { data: serviceFileData } = await getServiceFile(fisaId)
        const serviceFileUrgent = serviceFileData?.urgent || false
        const isUrgent = serviceFileUrgent
        const urgentAmount = isUrgent ? visibleItems.reduce((acc: number, it: any) => {
          const afterDisc = getRepairableQty(it) * it.price * (1 - Math.min(100, Math.max(0, it.discount_pct)) / 100)
          return acc + afterDisc * (30 / 100)
        }, 0) : 0
        
        const subscriptionType = tray.subscription_type || null
        
        const servicesTotal = visibleItems
          .filter((it: any) => it.item_type === 'service')
          .reduce((acc: number, it: any) => {
            const base = getRepairableQty(it) * it.price
            const disc = base * (Math.min(100, Math.max(0, it.discount_pct)) / 100)
            const afterDisc = base - disc
            const urgent = isUrgent ? afterDisc * (30 / 100) : 0
            return acc + afterDisc + urgent
          }, 0)
        
        const partsTotal = visibleItems
          .filter((it: any) => it.item_type === 'part')
          .reduce((acc: number, it: any) => {
            const base = getRepairableQty(it) * it.price
            const disc = base * (Math.min(100, Math.max(0, it.discount_pct)) / 100)
            return acc + base - disc
          }, 0)
        
        let subscriptionDiscount = 0
        
        if (subscriptionType === 'services' || subscriptionType === 'both') {
          subscriptionDiscount += servicesTotal * 0.10
        }
        if (subscriptionType === 'parts' || subscriptionType === 'both') {
          subscriptionDiscount += partsTotal * 0.05
        }
        
        const baseTotal = subtotal - totalDiscount + urgentAmount
        const total = baseTotal - subscriptionDiscount
        
        totalSum += total
      }
      
      setTotalFisaSum(totalSum)
    } catch (error) {
      console.error('Error calculating total fisa sum:', error)
      setTotalFisaSum(null)
    } finally {
      setLoadingTotalSum(false)
    }
  }, [setTotalFisaSum, setLoadingTotalSum])

  return {
    loadServiceSheets,
    listServiceSheetsForLead,
    listTraysForServiceSheet,
    listQuotesForLead,
    loadTraysDetails,
    calculateTotalFisaSum,
  }
}

// Export funcții helper pentru utilizare în alte hook-uri
// Funcție simplificată - încarcă items cu servicii din array
const listQuoteItems = async (
  trayId: string, 
  services?: any[], 
  instrumentPipelineMap?: Map<string, string | null>,
  pipelineMap?: Map<string, string>,
  instrumentsMap?: Map<string, { id: string; name: string }>
): Promise<any[]> => {
  
  let data: any[] | null = null
  let error: any = null

  const result = await supabaseClient
    .from('tray_items')
    .select('id, tray_id, instrument_id, service_id, part_id, department_id, technician_id, qty, notes, created_at')
    .eq('tray_id', trayId)
    .order('created_at')

  data = result.data
  error = result.error

  if (error) {
    console.error('[listQuoteItems] Error:', error)
    return []
  }

  // Procesează fiecare item - folosește services array pentru a găsi numele
  return (data || []).map((item: any) => {
    // Parsează notes
    let notesData: any = {}
    if (item.notes) {
      try {
        notesData = JSON.parse(item.notes)
      } catch (e) {}
    }
    
    // Determină item_type
    // IMPORTANT: Un item este "part" DOAR dacă are explicit part_id setat
    // Nu marcam automat ca "part" item-urile care au doar name în notes,
    // deoarece acestea pot fi instrumente sau item-uri incomplete
    let item_type: 'service' | 'part' | null = notesData.item_type || null
    if (!item_type) {
      if (item.service_id) {
        item_type = 'service'
      } else if (item.part_id) {
        item_type = 'part'
      }
      // Dacă nu are nici service_id nici part_id, rămâne null
      // (poate fi doar instrument sau item incomplet)
    }
    
    // Găsește serviciul în array-ul services
    let serviceName = ''
    let servicePrice = 0
    if (item.service_id && services && services.length > 0) {
      const foundService = services.find((s: any) => s.id === item.service_id)
      if (foundService) {
        serviceName = foundService.name || ''
        servicePrice = foundService.price || 0
      } else {
        console.warn('[listQuoteItems] Service not found for service_id:', item.service_id)
      }
    }
    
    // Obține numele - prioritate: service din array > notes
    let displayName = ''
    let price = notesData.price || 0
    
    if (serviceName) {
      displayName = serviceName
      price = servicePrice || price
    } else if (notesData.name) {
      displayName = notesData.name
    }
    
    // Obține numele instrumentului din map
    let instrumentName: string | null = null
    if (item.instrument_id && instrumentsMap) {
      const instr = instrumentsMap.get(item.instrument_id)
      instrumentName = instr?.name || null
    }
    
    // Obține departamentul și pipeline_id
    let department: string | null = null
    let pipelineId: string | null = null
    if (item.instrument_id && instrumentPipelineMap && pipelineMap) {
      pipelineId = instrumentPipelineMap.get(item.instrument_id) || null
      if (pipelineId) {
        department = pipelineMap.get(pipelineId) || null
      }
    }

    return {
      id: item.id,
      tray_id: item.tray_id,
      instrument_id: item.instrument_id,
      service_id: item.service_id,
      part_id: item.part_id,
      department_id: item.department_id,
      technician_id: item.technician_id,
      qty: item.qty || 1,
      notes: item.notes,
      created_at: item.created_at,
      // Câmpuri calculate
      item_type,
      name_snapshot: displayName,
      price: price || 0,
      discount_pct: notesData.discount_pct || 0,
      urgent: notesData.urgent || false,
      brand: notesData.brand || null,
      serial_number: notesData.serial_number || null,
      garantie: notesData.garantie || false,
      pipeline_id: pipelineId,
      department,
      instrument_name: instrumentName,
    }
  })
}

export { listServiceSheetsForLead, listTraysForServiceSheet, listQuotesForLead, listQuoteItems }

