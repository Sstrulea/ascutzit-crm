/**
 * Hook pentru salvare și logare - Versiune completă refactorizată
 * Include toată logica pentru brand/serial cu garanție
 */

import { useCallback, useRef } from 'react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { toast } from 'sonner'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { cleanDetailsForSave } from '@/lib/utils/serviceFileDetails'
import { 
  updateServiceFileWithHistory, 
  getServiceFile,
  updateServiceFileStatusByContent,
} from '@/lib/supabase/serviceFileOperations'
import { 
  addServiceFileToPipeline, 
} from '@/lib/supabase/pipelineOperations'
import { getPipelinesWithStages, logItemEvent, updateLead } from '@/lib/supabase/leadOperations'
import { createQuoteForLead, updateQuote, listQuoteItems, addInstrumentItem, listTraysForServiceSheet, listQuotesForLead } from '@/lib/utils/preturi-helpers'
import { persistAndLogServiceSheet } from '@/lib/history/serviceSheet'
import { saveVanzariViewV4ToDb, type V4SaveData } from '@/lib/history/vanzariViewV4Save'
import type { LeadQuote, LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Lead } from '@/lib/types/database'

const supabase = supabaseBrowser()

interface UsePreturiSaveOperationsProps {
  // State
  fisaId?: string | null
  trayDetails?: string
  paymentCash: boolean
  paymentCard: boolean
  officeDirect: boolean
  curierTrimis: boolean
  curierScheduledAt: string | null
  retur: boolean
  selectedQuote: LeadQuote | null
  isVanzariPipeline: boolean
  isVanzator: boolean
  leadId: string
  instrumentForm: any
  svc: any
  items: LeadQuoteItem[]
  instrumentSettings: any
  urgentAllServices: boolean
  subscriptionType: 'services' | 'parts' | 'both' | ''
  isCash: boolean
  isCard: boolean
  quotes: LeadQuote[]
  isCurierPipeline: boolean
  vanzariPipelineId: string | null
  vanzariStages: Array<{ id: string; name: string }>
  lead: Lead | null
  
  // Data
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null }>
  departments: Array<{ id: string; name: string }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  
  // Totals
  subtotal: number
  totalDiscount: number
  urgentAmount: number
  total: number
  globalDiscountPct: number
  
  // Setters
  setSaving: React.Dispatch<React.SetStateAction<boolean>>
  setQuotes: React.Dispatch<React.SetStateAction<LeadQuote[]>>
  setSelectedQuoteId: React.Dispatch<React.SetStateAction<string | null>>
  setItems: React.Dispatch<React.SetStateAction<LeadQuoteItem[]>>
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>
  setSvc: React.Dispatch<React.SetStateAction<any>>
  setInstrumentForm: React.Dispatch<React.SetStateAction<any>>
  setIsServiceFileLocked?: React.Dispatch<React.SetStateAction<boolean>> // Setter pentru flag-ul de blocare
  setServiceFileStatus?: (value: string | null) => void // La blocare setăm status 'comanda'
  
  // Callbacks
  recalcAllSheetsTotal: (quotes: LeadQuote[]) => Promise<void>
  populateInstrumentFormFromItems: (items: LeadQuoteItem[], instrumentId: string | null, forceReload: boolean) => void
}

export function usePreturiSaveOperations(props: UsePreturiSaveOperationsProps) {
  const { user } = useAuth()
  const {
    fisaId,
    trayDetails,
    paymentCash,
    paymentCard,
    officeDirect,
    curierTrimis,
    curierScheduledAt,
    retur,
    selectedQuote,
    isVanzariPipeline,
    isVanzator,
    leadId,
    instrumentForm,
    svc,
    items,
    instrumentSettings,
    urgentAllServices,
    subscriptionType,
    isCash,
    isCard,
    quotes,
    isCurierPipeline,
    pipelinesWithIds,
    services,
    instruments,
    departments,
    subtotal,
    totalDiscount,
    urgentAmount,
    total,
    globalDiscountPct,
    setSaving,
    setQuotes,
    setSelectedQuoteId,
    setItems,
    setIsDirty,
    setSvc,
    setInstrumentForm,
    setIsServiceFileLocked,
    setServiceFileStatus,
    recalcAllSheetsTotal,
    populateInstrumentFormFromItems,
  } = props
  
  // Ref pentru snapshot-ul ultimului salvare
  const lastSavedRef = useRef<any[]>([])

  // ==================== HELPER FUNCTIONS ====================

  /**
   * Salvează detaliile fișei de serviciu
   */
  const saveServiceFileDetails = useCallback(async (): Promise<void> => {
    if (!fisaId || trayDetails === undefined) return

    try {
      // IMPORTANT: Verifică dacă există deja detalii populate în DB
      // Dacă există, nu permitem modificarea - detaliile sunt constante
      const { data: existingServiceFile } = await getServiceFile(fisaId)
      if (existingServiceFile?.details) {
        // Încearcă să parseze ca JSON pentru a extrage textul
        let existingDetailsText = ''
        try {
          const parsedDetails = typeof existingServiceFile.details === 'string' 
            ? JSON.parse(existingServiceFile.details) 
            : existingServiceFile.details
          if (typeof parsedDetails === 'object' && parsedDetails !== null && parsedDetails.text !== undefined) {
            existingDetailsText = parsedDetails.text || ''
          } else {
            existingDetailsText = typeof existingServiceFile.details === 'string' ? existingServiceFile.details : ''
          }
        } catch {
          existingDetailsText = typeof existingServiceFile.details === 'string' ? existingServiceFile.details : ''
        }
        
        // Dacă există detalii populate și nu sunt goale, nu permitem salvarea
        if (existingDetailsText && existingDetailsText.trim().length > 0) {
          console.log('[saveServiceFileDetails] Detaliile sunt deja populate și constante. Nu se permit modificări.')
          return // Nu salvăm - detaliile sunt constante
        }
      }

      // IMPORTANT: details conține DOAR text (detalii client), nu cash/card
      // cash și card sunt salvate în câmpuri separate pentru performanță și claritate
      const detailsToSave = cleanDetailsForSave(trayDetails)
      
      if (detailsToSave === undefined) return
      
      const { error } = await updateServiceFileWithHistory(fisaId, { 
        details: detailsToSave,
        cash: paymentCash,
        card: paymentCard
      })
      if (error) {
        console.error('Eroare la salvarea detaliilor fișei:', error)
      }
    } catch (error) {
      console.error('Eroare la salvarea detaliilor fișei:', error)
    }
  }, [fisaId, trayDetails, paymentCash, paymentCard, cleanDetailsForSave])

  /**
   * Salvează checkbox-urile pentru livrare și actualizează pipeline-urile
   */
  const saveDeliveryCheckboxes = useCallback(async (): Promise<void> => {
    if (!fisaId) return

    try {
      const { error } = await updateServiceFileWithHistory(fisaId, {
        office_direct: officeDirect,
        office_direct_at: officeDirect ? new Date().toISOString() : null,
        curier_trimis: curierTrimis,
        curier_scheduled_at: curierTrimis ? curierScheduledAt : null,
      })
      
      if (error) {
        console.error('❌ Eroare la actualizarea service_file:', error)
        toast.error('Eroare la salvarea checkbox-urilor livrare')
        return
      }

      // Actualizează pipeline-urile dacă este necesar
      // IMPORTANT: Fișele se salvează MEREU în Receptie, indiferent de board (Vanzari sau Receptie)
      if (officeDirect || curierTrimis) {
        const { data: pipelinesData } = await getPipelinesWithStages()
        const receptiePipeline = pipelinesWithIds.find(p => p.name.toLowerCase().includes('receptie'))
        if (receptiePipeline && pipelinesData) {
          const receptiePipelineData = pipelinesData.find((p: any) => p.id === receptiePipeline.id)
          if (receptiePipelineData?.stages?.length) {
            const stageName = officeDirect ? 'Office direct' : 'Curier Trimis'
            const stage = receptiePipelineData.stages.find((s: any) => 
              s.is_active && s.name?.toLowerCase() === stageName.toLowerCase()
            )
            
            if (stage) {
              await addServiceFileToPipeline(fisaId, receptiePipeline.id, stage.id)

              // Log pentru start "La noi" (momentul când fișa ajunge în Office direct / Curier Trimis)
              // Important: logăm doar o singură dată per fișă (pentru a avea un start stabil)
              try {
                const { data: existing } = await supabase
                  .from('items_events')
                  .select('id')
                  .eq('type', 'service_file')
                  .eq('item_id', fisaId)
                  .eq('event_type', 'delivery_started')
                  .order('created_at', { ascending: true })
                  .limit(1)

                const alreadyLogged = Array.isArray(existing) && existing.length > 0
                if (!alreadyLogged) {
                  await logItemEvent(
                    'service_file',
                    fisaId,
                    `Fișa a intrat în "${stageName}"`,
                    'delivery_started',
                    { mode: officeDirect ? 'office_direct' : 'curier_trimis' }
                  )
                }
              } catch (e) {
                // nu blocăm salvarea dacă logging-ul eșuează
                console.warn('[saveDeliveryCheckboxes] Nu am putut loga delivery_started:', e)
              }
            }
          }
        }

        // Actualizare lead: curier_trimis_at/office_direct_at = momentul când vânzătorul a făcut livrarea (pentru statistici), nu data programată curier
        if (leadId) {
          const nowIso = new Date().toISOString()
          const leadUpdates: Record<string, unknown> = officeDirect
            ? { office_direct_at: nowIso, office_direct_user_id: user?.id ?? null, curier_trimis_at: null, curier_trimis_user_id: null }
            : { curier_trimis_at: nowIso, curier_trimis_user_id: user?.id ?? null, office_direct_at: null, office_direct_user_id: null }
          if (user?.id) (leadUpdates as any).claimed_by = user.id
          try {
            const { error: leadErr } = await updateLead(leadId, leadUpdates)
            if (leadErr) console.warn('[saveDeliveryCheckboxes] updateLead (curier/office):', leadErr)
          } catch (e) {
            console.warn('[saveDeliveryCheckboxes] updateLead (curier/office):', e)
          }
        }
      }
    } catch (error) {
      console.error('Eroare la salvarea checkbox-urilor livrare:', error)
    }
  }, [fisaId, officeDirect, curierTrimis, pipelinesWithIds, isVanzariPipeline, leadId, user?.id])

  /**
   * Salvează urgent și subscription_type în service_file
   */
  const saveUrgentAndSubscription = useCallback(async (): Promise<void> => {
    if (!fisaId) return

    try {
      const updates: any = { urgent: urgentAllServices }
      
      // subscription_type nu există în tabelul service_files - eliminat
      // Abonamentul se gestionează la nivel de tăviță/item, nu la nivel de fișă
      
      const { error } = await updateServiceFileWithHistory(fisaId, updates)
      if (error) {
        console.error('Eroare la actualizarea urgent/subscription:', error)
        return
      }

      // OPTIMIZARE: Batch UPDATE pentru urgent în loc de loop individual
      // Actualizează urgent pentru toate items-urile din tăvițe
      const trayIds = quotes.map(q => q.id)
      if (trayIds.length > 0) {
        const { data: allTrayItems } = await supabase
          .from('tray_items')
          .select('id, notes')
          .in('tray_id', trayIds) as { data: Array<{ id: string; notes: string | null }> | null }
        
        if (allTrayItems && allTrayItems.length > 0) {
          // Colectează toate items-urile care trebuie actualizate
          const itemsToUpdate: Array<{ id: string; notes: string }> = []
          
          for (const item of allTrayItems) {
            let notesData: any = {}
            if (item.notes) {
              try {
                notesData = JSON.parse(item.notes)
              } catch (e) {
                // Ignoră
              }
            }
            
            if (notesData.item_type === 'service' || notesData.item_type === 'part') {
              notesData.urgent = urgentAllServices
              itemsToUpdate.push({
                id: item.id,
                notes: JSON.stringify(notesData)
              })
            }
          }
          
          // OPTIMIZARE: Batch UPDATE pentru toate items-urile (un singur call în loc de N)
          if (itemsToUpdate.length > 0) {
            // Supabase nu suportă batch UPDATE direct, dar putem folosi Promise.all pentru paralelizare
            // Sau putem face un singur UPDATE cu un WHERE condition complex
            // Pentru moment, folosim Promise.all pentru paralelizare (mai rapid decât secvențial)
            await Promise.all(
              itemsToUpdate.map(item => 
                (supabase.from('tray_items') as any)
                  .update({ notes: item.notes })
                  .eq('id', item.id)
              )
            )
          }
        }
      }
    } catch (error) {
      console.error('Eroare la salvarea urgent/subscription:', error)
    }
  }, [fisaId, urgentAllServices, subscriptionType, quotes])

  /**
   * Asigură că există o tăviță pentru salvare: dacă există deja tăvițe pentru fișa curentă,
   * folosește prima (sau cea „nerepartizată”) în loc să creeze una nouă – evită duplicatele.
   */
  const ensureTrayExists = useCallback(async (): Promise<LeadQuote | null> => {
    if (selectedQuote) return selectedQuote
    
    if (isVanzariPipeline && isVanzator && fisaId) {
      try {
        // Înainte de a crea o tăviță nouă, încarcă tăvițele existente pentru această fișă
        const existingTrays = await listTraysForServiceSheet(fisaId)
        if (existingTrays.length > 0) {
          const preferUnassigned = existingTrays.find((q: any) => !q.number || String(q.number).trim() === '')
          const toUse = preferUnassigned || existingTrays[0]
          setQuotes(existingTrays)
          setSelectedQuoteId(toUse.id)
          // Nu golim items – utilizatorul a adăugat servicii în formular; le salvăm pe tăvița existentă
          return toUse as LeadQuote
        }
        const created = await createQuoteForLead(leadId, '', fisaId)
        setQuotes([created])
        setSelectedQuoteId(created.id)
        setItems([])
        lastSavedRef.current = []
        return created
      } catch (error: any) {
        console.error('Error creating temporary tray:', error)
        toast.error('Eroare la crearea tăviței temporare')
        throw error
      }
    }
    
    return null
  }, [selectedQuote, isVanzariPipeline, isVanzator, fisaId, leadId, setQuotes, setSelectedQuoteId, setItems])

  /**
   * Actualizează snapshot-ul cu items-urile date
   */
  const updateSnapshot = useCallback((items: LeadQuoteItem[]) => {
    lastSavedRef.current = items.map((i: any) => ({
      id: String(i.id),
      name: i.name_snapshot,
      qty: Number(i.qty ?? 1),
      price: Number(i.price ?? 0),
      discount_pct: Number(i.discount_pct ?? 0),
      type: i.item_type ?? null,
      urgent: !!i.urgent,
      department: i.department ?? null,
      technician_id: i.technician_id ?? null,
      pipeline_id: i.pipeline_id ?? null,
      brand: i.brand ?? null,
      serial_number: i.serial_number ?? null,
      garantie: !!i.garantie,
    }))
  }, [])

  /**
   * Salvează brand-uri și serial numbers pentru un instrument
   */
  const saveBrandSerialData = useCallback(async (
    quoteId: string,
    instrumentId: string,
    brandSerialGroups: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }> | string[]; qty?: string }>,
    garantie: boolean
  ): Promise<void> => {
    const instrument = instruments.find(i => i.id === instrumentId)
    if (!instrument || !instrument.department_id) {
      throw new Error('Instrumentul nu a fost găsit sau nu are departament setat')
    }

    // Verifică dacă instrumentul este din departamentul "Ascutit"
    const instrumentDept = departments.find(d => d.id === instrument.department_id)
    const deptNameLower = instrumentDept?.name?.toLowerCase() || ''
    if (deptNameLower.includes('ascutit') || deptNameLower.includes('ascuțit')) {
      throw new Error('Instrumentele din departamentul "Ascutit" nu pot avea brand sau serial number')
    }

    // Reîncarcă items-urile existente din DB
    const allExistingItems = await listQuoteItems(quoteId, services, instruments, pipelinesWithIds)
    const existingItem = allExistingItems.find((i: any) => i.instrument_id === instrumentId && i.item_type === null)

    // Transformă structura pentru salvare: grupăm serial numbers-urile după garanție
    const brandSerialGroupsToSend: Array<{ brand: string | null; serialNumbers: string[]; garantie: boolean }> = []
    
    for (const group of brandSerialGroups) {
      const brandName = group.brand?.trim()
      if (!brandName) continue
      
      // Grupează serial numbers-urile după garanție
      const serialsByGarantie = new Map<boolean, string[]>()
      
      group.serialNumbers.forEach((snData: any) => {
        const serial = typeof snData === 'string' ? snData : snData.serial || ''
        const snGarantie = typeof snData === 'object' ? (snData.garantie || false) : garantie
        
        if (serial && serial.trim()) {
          if (!serialsByGarantie.has(snGarantie)) {
            serialsByGarantie.set(snGarantie, [])
          }
          serialsByGarantie.get(snGarantie)!.push(serial.trim())
        }
      })
      
      // Creează un grup pentru fiecare nivel de garanție
      serialsByGarantie.forEach((serials, snGarantie) => {
        if (serials.length > 0) {
          brandSerialGroupsToSend.push({
            brand: brandName,
            serialNumbers: serials,
            garantie: snGarantie
          })
        }
      })
    }

    const filteredGroups = brandSerialGroupsToSend.filter(g => g.brand || g.serialNumbers.length > 0)
    
    if (filteredGroups.length === 0) return

    const supabaseClient = supabaseBrowser()
    const qty = Number(instrumentForm.qty || instrumentSettings[instrumentId]?.qty || 1)

    if (existingItem && existingItem.id) {
      // Actualizează item-ul existent
      // Actualizează cantitatea
      await (supabaseClient.from('tray_items') as any)
        .update({ qty })
        .eq('id', existingItem.id)

      // OPTIMIZARE: Batch operations pentru reducerea call-urilor
      // Șterge brand-urile existente (un singur call)
      await supabaseClient
        .from('tray_item_brands' as any)
        .delete()
        .eq('tray_item_id', existingItem.id)

      // Grupează toate brand-urile pentru batch INSERT
      // IMPORTANT: Elimină duplicatele (același brand + garanție) pentru a evita erori la INSERT
      const brandsToInsertMap = new Map<string, { tray_item_id: string; brand: string; garantie: boolean }>()
      filteredGroups.forEach(group => {
        const brandName = group.brand?.trim()
        if (!brandName) return
        const garantie = group.garantie || false
        const key = `${brandName}::${garantie}`
        // Dacă nu există deja, adaugă-l
        if (!brandsToInsertMap.has(key)) {
          brandsToInsertMap.set(key, {
            tray_item_id: existingItem.id,
            brand: brandName,
            garantie: garantie,
          })
        }
      })
      const brandsToInsert = Array.from(brandsToInsertMap.values())

      if (brandsToInsert.length > 0) {
        // Batch INSERT pentru toate brand-urile (un singur call în loc de N)
        const { data: brandResults, error: brandsError } = await (supabaseClient.from('tray_item_brands') as any)
          .insert(brandsToInsert)
          .select()

        if (brandsError) {
          console.error('Error creating brands:', brandsError)
          throw brandsError
        }

        // Grupează toate serial numbers-urile pentru batch INSERT
        const serialsToInsert: Array<{ brand_id: string; serial_number: string }> = []
        
        if (brandResults && brandResults.length > 0) {
          // Creează mapare între brand name + garantie și brand_id
          // Folosim datele din rezultat (br) pentru siguranță, nu indexarea array-ului
          const brandMap = new Map<string, string>()
          brandResults.forEach((br: any) => {
            const brandName = br.brand?.trim()
            const garantie = br.garantie || false
            const key = `${brandName}::${garantie}`
            brandMap.set(key, br.id)
          })

          // Colectează toate serial numbers-urile
          filteredGroups.forEach(group => {
            const brandName = group.brand?.trim()
            if (!brandName) return
            
            const garantie = group.garantie || false
            const key = `${brandName}::${garantie}`
            const brandId = brandMap.get(key)
            
            if (brandId && group.serialNumbers.length > 0) {
              group.serialNumbers.forEach(sn => {
                const serial = typeof sn === 'string' ? sn : sn.trim()
                if (serial && serial.trim()) {
                  serialsToInsert.push({
                    brand_id: brandId,
                    serial_number: serial.trim(),
                  })
                }
              })
            }
          })

          // Batch INSERT pentru toate serial numbers-urile (un singur call în loc de N)
          if (serialsToInsert.length > 0) {
            const { error: serialsError } = await supabaseClient
              .from('tray_item_brand_serials' as any)
              .insert(serialsToInsert as any)

            if (serialsError) {
              console.error('Error creating serials:', serialsError)
              throw serialsError
            }
          }
        }
      }

      // Propagă brand/serial la toate serviciile asociate cu acest instrument
      const servicesForInstrument = allExistingItems.filter((item: any) => {
        if (item.item_type !== 'service' || !item.service_id || !item.id) return false
        const serviceDef = services.find(s => s.id === item.service_id)
        return serviceDef?.instrument_id === instrumentId
      })

      // OPTIMIZARE: Batch operations pentru propagarea la servicii
      // Grupează toate operațiile pentru toate serviciile
      const serviceItemsToProcess = servicesForInstrument.filter((item: any) => item.id)
      
      if (serviceItemsToProcess.length > 0) {
        // Șterge brand-urile existente pentru toate serviciile (batch DELETE)
        const serviceItemIds = serviceItemsToProcess.map((item: any) => item.id)
        for (const serviceItemId of serviceItemIds) {
          await supabaseClient
            .from('tray_item_brands' as any)
            .delete()
            .eq('tray_item_id', serviceItemId)
        }

        // Grupează toate brand-urile pentru toate serviciile pentru batch INSERT
        // IMPORTANT: Elimină duplicatele (același serviciu + brand + garanție) pentru a evita erori la INSERT
        const serviceBrandsToInsertMap = new Map<string, { tray_item_id: string; brand: string; garantie: boolean; serviceIndex: number }>()
        
        serviceItemsToProcess.forEach((serviceItem: any, serviceIdx: number) => {
          filteredGroups.forEach(group => {
            const brandName = group.brand?.trim()
            if (!brandName) return
            const garantie = group.garantie || false
            const key = `${serviceItem.id}::${brandName}::${garantie}`
            // Dacă nu există deja pentru acest serviciu, adaugă-l
            if (!serviceBrandsToInsertMap.has(key)) {
              serviceBrandsToInsertMap.set(key, {
                tray_item_id: serviceItem.id,
                brand: brandName,
                garantie: garantie,
                serviceIndex: serviceIdx, // Pentru mapare ulterioară
              })
            }
          })
        })
        
        const serviceBrandsToInsert = Array.from(serviceBrandsToInsertMap.values())

        if (serviceBrandsToInsert.length > 0) {
          // Batch INSERT pentru toate brand-urile pentru toate serviciile (un singur call)
          const brandsForInsert = serviceBrandsToInsert.map(b => ({
            tray_item_id: b.tray_item_id,
            brand: b.brand,
            garantie: b.garantie,
          }))

          const { data: serviceBrandResults, error: serviceBrandsError } = await (supabaseClient.from('tray_item_brands') as any)
            .insert(brandsForInsert)
            .select()

          if (serviceBrandsError) {
            console.error('Error creating service brands:', serviceBrandsError)
            throw serviceBrandsError
          }

          // Grupează toate serial numbers-urile pentru toate serviciile pentru batch INSERT
          const serviceSerialsToInsert: Array<{ brand_id: string; serial_number: string }> = []
          
          if (serviceBrandResults && serviceBrandResults.length > 0) {
            // Creează mapare între serviceIndex + brand name + garantie și brand_id
            // Folosim datele din rezultat (br) și serviceBrandsToInsert pentru mapare corectă
            const serviceBrandMap = new Map<string, string>()
            serviceBrandResults.forEach((br: any, idx: number) => {
              const serviceBrand = serviceBrandsToInsert[idx]
              if (serviceBrand) {
                const key = `${serviceBrand.serviceIndex}::${serviceBrand.brand}::${serviceBrand.garantie}`
                serviceBrandMap.set(key, br.id)
              }
            })

            // Colectează toate serial numbers-urile pentru toate serviciile
            serviceItemsToProcess.forEach((serviceItem: any, serviceIdx: number) => {
              filteredGroups.forEach(group => {
                const brandName = group.brand?.trim()
                if (!brandName) return
                
                const garantie = group.garantie || false
                const key = `${serviceIdx}::${brandName}::${garantie}`
                const brandId = serviceBrandMap.get(key)
                
                if (brandId && group.serialNumbers.length > 0) {
                  group.serialNumbers.forEach(sn => {
                    const serial = typeof sn === 'string' ? sn : sn.trim()
                    if (serial && serial.trim()) {
                      serviceSerialsToInsert.push({
                        brand_id: brandId,
                        serial_number: serial.trim(),
                      })
                    }
                  })
                }
              })
            })

            // Batch INSERT pentru toate serial numbers-urile pentru toate serviciile (un singur call)
            if (serviceSerialsToInsert.length > 0) {
              const { error: serviceSerialsError } = await supabaseClient
                .from('tray_item_brand_serials' as any)
                .insert(serviceSerialsToInsert as any)

              if (serviceSerialsError) {
                console.error('Error creating service serials:', serviceSerialsError)
                throw serviceSerialsError
              }
            }
          }
        }
      }
    } else {
      // Creează un nou item pentru instrument
      const autoPipelineId = instrumentDept?.name?.toLowerCase() === 'reparatii'
        ? pipelinesWithIds.find(p => p.name.toLowerCase() === 'reparatii')?.id || null
        : null

      await addInstrumentItem(quoteId, instrument.name, {
        instrument_id: instrument.id,
        department_id: instrument.department_id,
        qty,
        discount_pct: 0,
        urgent: false,
        technician_id: null,
        pipeline_id: autoPipelineId,
        brandSerialGroups: filteredGroups
      })
    }
  }, [instruments, departments, services, pipelinesWithIds, instrumentForm, instrumentSettings])

  /**
   * Funcția principală de salvare - Versiune completă refactorizată.
   * Dacă este pasat v4Data (din VanzariViewV4), persistă acel conținut în DB și actualizează fișa; altfel folosește items/quotes din state.
   */
  const saveAllAndLog = useCallback(async (v4Data?: V4SaveData) => {
    let isCancelled = false
    
    setSaving(true)
    
    try {
      // Cale V4: salvare din VanzariViewV4 (instruments, servicii, piese, tăvițe) sau doar opțiuni (urgent, retur, office, curier)
      if (v4Data && fisaId) {
        const hasInstrumentsOrTrays = (v4Data.instruments?.length ?? 0) > 0 || (v4Data.trays?.length ?? 0) > 0
        if (hasInstrumentsOrTrays) {
          const defaultDepartmentId = departments.find((d) => d.name === 'Reparatii')?.id ?? departments[0]?.id ?? null
          const { error: v4Err } = await saveVanzariViewV4ToDb(fisaId, v4Data, {
            instrumentsWithDept: instruments.map((i) => ({ id: i.id, name: i.name, department_id: i.department_id })),
            defaultDepartmentId,
            urgent: urgentAllServices,
          })
          if (v4Err) {
            const msg = typeof v4Err.message === 'string' ? v4Err.message : 'Eroare la salvarea în baza de date'
            toast.error(msg)
            setSaving(false)
            return
          }
          await updateServiceFileStatusByContent(fisaId)
        }
        // Salvează mereu opțiunile pe service_file (urgent, retur, office_direct, curier_trimis)
        const combinedUpdates: any = {
          urgent: urgentAllServices,
          retur: retur,
          office_direct: officeDirect,
          curier_trimis: curierTrimis,
        }
        if (officeDirect) combinedUpdates.office_direct_at = new Date().toISOString()
        if (curierTrimis) combinedUpdates.curier_scheduled_at = curierScheduledAt
        const detailsToSave = cleanDetailsForSave(trayDetails)
        if (detailsToSave != null && detailsToSave.trim() !== '') combinedUpdates.details = detailsToSave
        if (paymentCash !== undefined) combinedUpdates.cash = paymentCash
        if (paymentCard !== undefined) combinedUpdates.card = paymentCard
        await updateServiceFileWithHistory(fisaId, combinedUpdates)
        if (officeDirect || curierTrimis) {
          const { data: currentServiceFile } = await getServiceFile(fisaId)
          if (currentServiceFile && !currentServiceFile.is_locked) {
            await updateServiceFileWithHistory(fisaId, { is_locked: true, status: 'comanda' })
            if (setIsServiceFileLocked) setIsServiceFileLocked(true)
            if (setServiceFileStatus) setServiceFileStatus('comanda')
          }
        }
        setIsDirty(false)
        
        // Reîncarcă lista de tăvițe după salvare pentru a vedea tăvițele create în loop
        try {
          if (fisaId) {
            const refreshedQuotes = await listTraysForServiceSheet(fisaId)
            setQuotes(refreshedQuotes)
            // Păstrează selecția pe prima tăviță sau pe cea selectată anterior
            if (refreshedQuotes.length > 0 && !refreshedQuotes.find(q => q.id === selectedQuote?.id)) {
              setSelectedQuoteId(refreshedQuotes[0].id)
            }
          } else if (leadId) {
            const refreshedQuotes = await listQuotesForLead(leadId)
            setQuotes(refreshedQuotes)
            if (refreshedQuotes.length > 0 && !refreshedQuotes.find(q => q.id === selectedQuote?.id)) {
              setSelectedQuoteId(refreshedQuotes[0].id)
            }
          }
        } catch (refreshError) {
          console.error('[saveAllAndLog] Error refreshing quotes after save:', refreshError)
          // Nu blocăm fluxul dacă refresh-ul eșuează
        }
        
        toast.success(hasInstrumentsOrTrays ? 'Salvat în istoric' : 'Opțiuni salvate')
        setSaving(false)
        return
      }

      // 1. Asigură-te că există o tăviță (trebuie să fie prima!)
      const quoteToUse = await ensureTrayExists()
      if (!quoteToUse) {
        toast.error('Nu s-a putut crea sau găsi o tăviță pentru salvare')
        setSaving(false)
        return
      }
      
      // Determină fisaId din quote
      const serviceFileIdToUse = fisaId || quoteToUse.service_file_id
      
      // OPTIMIZARE: Combină saveServiceFileDetails și saveDeliveryCheckboxes într-un singur UPDATE
      // pentru a evita race conditions și a reduce numărul de call-uri
      if (serviceFileIdToUse) {
        // IMPORTANT: details conține DOAR text (detalii client), nu cash/card
        // cash și card sunt salvate în câmpuri separate pentru performanță și claritate
        // Curăță details de paymentCash și paymentCard dacă există
        const detailsToSave = cleanDetailsForSave(trayDetails)
        
        console.log('[DEBUG] saveAllAndLog - About to save:', { serviceFileIdToUse, trayDetails, detailsToSave })
        
        // Combină ambele operații într-un singur UPDATE
        // IMPORTANT: Nu salvăm details dacă este undefined sau gol (pentru a nu suprascrie datele existente)
        const combinedUpdates: any = {}
        if (detailsToSave !== undefined && detailsToSave !== null && detailsToSave.trim() !== '') {
          combinedUpdates.details = detailsToSave
        }
        // Salvează cash și card în câmpuri separate
        if (paymentCash !== undefined) {
          combinedUpdates.cash = paymentCash
        }
        if (paymentCard !== undefined) {
          combinedUpdates.card = paymentCard
        }
        if (officeDirect !== undefined) {
          combinedUpdates.office_direct = officeDirect
          combinedUpdates.office_direct_at = officeDirect ? new Date().toISOString() : null
        }
        if (curierTrimis !== undefined) {
          combinedUpdates.curier_trimis = curierTrimis
          // Salvează data programată pentru curier (sau null dacă se debifează)
          combinedUpdates.curier_scheduled_at = curierTrimis ? curierScheduledAt : null
        }
        
        if (Object.keys(combinedUpdates).length > 0) {
          console.log('[DEBUG] Updating service file with:', combinedUpdates)
          const { error: updateError } = await updateServiceFileWithHistory(serviceFileIdToUse, combinedUpdates)
          if (updateError) {
            console.error('Eroare la salvarea detaliilor și checkbox-urilor:', updateError)
          } else {
            console.log('[DEBUG] Service file updated successfully with details:', combinedUpdates.details)
          }
        }
        
        // Actualizează pipeline-urile dacă este necesar (după UPDATE)
        // IMPORTANT: Fișele se salvează MEREU în Receptie, indiferent de board (Vanzari sau Receptie)
        if (officeDirect || curierTrimis) {
          const { data: pipelinesData } = await getPipelinesWithStages()
          const receptiePipeline = pipelinesWithIds.find(p => p.name.toLowerCase().includes('receptie'))
          if (receptiePipeline && pipelinesData) {
            const receptiePipelineData = pipelinesData.find((p: any) => p.id === receptiePipeline.id)
            if (receptiePipelineData?.stages?.length) {
              const stageName = officeDirect ? 'Office direct' : 'Curier Trimis'
              const stage = receptiePipelineData.stages.find((s: any) => 
                s.is_active && s.name?.toLowerCase() === stageName.toLowerCase()
              )
              if (stage) {
                await addServiceFileToPipeline(serviceFileIdToUse, receptiePipeline.id, stage.id)
                try {
                  const { data: existing } = await supabase
                    .from('items_events')
                    .select('id')
                    .eq('type', 'service_file')
                    .eq('item_id', serviceFileIdToUse)
                    .eq('event_type', 'delivery_started')
                    .order('created_at', { ascending: true })
                    .limit(1)
                  const alreadyLogged = Array.isArray(existing) && existing.length > 0
                  if (!alreadyLogged) {
                    await logItemEvent(
                      'service_file',
                      serviceFileIdToUse,
                      `Fișa a intrat în "${stage.name || 'Curier Trimis'}"`,
                      'delivery_started',
                      { mode: officeDirect ? 'office_direct' : 'curier_trimis' }
                    )
                  }
                } catch (e) {
                  console.warn('[saveAllAndLog] Nu am putut loga delivery_started:', e)
                }
              }
            }
          }
        }
      }
      
      // 4. Salvează brand/serial data dacă există și reîncarcă items-urile
      console.log('[usePreturiSaveOperations] Items to save:', items.length, items.map(i => ({ id: i.id, item_type: i.item_type, instrument_id: i.instrument_id })))
      console.log('[usePreturiSaveOperations] Prev snapshot:', lastSavedRef.current.length, lastSavedRef.current)
      let itemsToSave = items // Folosim items-urile din state ca default
      const instrumentIdToUse = instrumentForm?.instrument || svc?.instrumentId
      const groupsToSave = Array.isArray(instrumentForm.brandSerialGroups) ? instrumentForm.brandSerialGroups : []
      
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      let hasValidBrandSerialData = false
      if (Array.isArray(groupsToSave)) {
        for (let i = 0; i < groupsToSave.length; i++) {
          const g = groupsToSave[i]
          if (!g) continue
          const hasBrand = g.brand && g.brand.trim()
          const serialNumbers = Array.isArray(g.serialNumbers) ? g.serialNumbers : []
          
          // Verifică serial numbers cu for loop în loc de .some()
          let hasSerialNumbers = false
          for (let j = 0; j < serialNumbers.length; j++) {
            const sn = serialNumbers[j]
            const serial = typeof sn === 'string' ? sn : (sn && typeof sn === 'object' ? sn?.serial || '' : '')
            if (serial && serial.trim()) {
              hasSerialNumbers = true
              break
            }
          }
          
          if (hasBrand || hasSerialNumbers) {
            hasValidBrandSerialData = true
            break
          }
        }
      }

      // 3. Salvează brand/serial data și urgent/subscription în paralel (nu depind unul de altul)
      // OPTIMIZARE: Grupează operațiile independente pentru reducerea timpului de execuție
      const saveOperations: Promise<any>[] = []
      
      if (instrumentIdToUse && hasValidBrandSerialData) {
        const garantie = instrumentForm.garantie || instrumentSettings[instrumentIdToUse]?.garantie || false
        saveOperations.push(saveBrandSerialData(quoteToUse.id, instrumentIdToUse, groupsToSave, garantie))
      }
      
      // Salvează urgent și subscription_type (nu depinde de brand/serial)
      saveOperations.push(saveUrgentAndSubscription())
      
      // Așteaptă toate operațiile de salvare să se termine
      await Promise.all(saveOperations)
      
      // OPTIMIZARE: Nu mai reîncărcăm items-urile aici - vor fi reîncărcate după persistAndLogServiceSheet
      // Aceasta reduce numărul de call-uri de la 2 la 1
      // itemsToSave rămâne cu items-urile din state, care vor fi actualizate după persistAndLogServiceSheet
      
      // 6. Cash/card sunt deja salvate în saveServiceFileDetails() prin details JSON
      // Nu mai încercăm să le salvăm în trays pentru că aceste câmpuri nu există acolo
      
      // 7. Verifică limită de instrumente (doar pentru tăvițe definite, nu pentru undefined în Vanzari)
      const isUndefinedTray = quoteToUse && (!quoteToUse.number || quoteToUse.number === '')
      const allowAllInstruments = isVanzariPipeline && isUndefinedTray
      
      if (!isVanzariPipeline && !isCurierPipeline && !allowAllInstruments) {
        const instrumentIds = Array.from(
          new Set(
            itemsToSave
              .filter(it => it.instrument_id)
              .map(it => String(it.instrument_id))
          )
        )
        if (instrumentIds.length > 2) {
          toast.error('Maxim 2 instrumente pot fi asociate aceleiași tăvițe.')
          setSaving(false)
          return
        }
      }
      
      // 8. Salvează items-urile principale prin persistAndLogServiceSheet
      // ELIMINAT: Verificările pentru temp IDs - items-urile se salvează direct în DB, nu mai există temp IDs
      const { items: fresh, snapshot } = await persistAndLogServiceSheet({
        leadId,
        quoteId: quoteToUse.id,
        items: itemsToSave,
        services,
        instruments,
        totals: { subtotal, totalDiscount, urgentAmount, total },
        prevSnapshot: lastSavedRef.current,
        pipelinesWithIds,
        globalDiscountPct,
        subscriptionType: subscriptionType || undefined,
        currentUserId: user?.id ?? undefined,
        currentUserOption: user ? { id: user.id, email: user.email ?? undefined } : undefined,
      })
      
      // 10. Reîncarcă items-urile din DB pentru a avea datele corecte
      try {
        const reloadedItems = await listQuoteItems(quoteToUse.id, services, instruments, pipelinesWithIds)
        
        if (reloadedItems && reloadedItems.length > 0) {
          setItems(reloadedItems)
          updateSnapshot(reloadedItems)
        } else {
          setItems(fresh)
          lastSavedRef.current = snapshot
        }
      } catch (reloadError) {
        console.error('[usePreturiSaveOperations] Error reloading items:', reloadError?.message || 'Unknown error')
        setItems(fresh)
        lastSavedRef.current = snapshot
      }

      // 10b. Actualizează status fișă: 'comanda' dacă are ≥1 instrument, altfel 'noua'
      if (serviceFileIdToUse) {
        try {
          const { error: statusErr } = await updateServiceFileStatusByContent(serviceFileIdToUse)
          if (statusErr) console.warn('[saveAllAndLog] Eroare la actualizarea status comanda:', statusErr)
        } catch (e) {
          console.warn('[saveAllAndLog] Eroare la actualizarea status comanda:', e)
        }
      }
      
      setIsDirty(false)
      
      // 11. Recalculează totalurile
      await recalcAllSheetsTotal(quotes)
      
      // 12. Blochează fișa în DB după salvare dacă checkbox-urile sunt bifate
      // IMPORTANT: is_locked se setează oricând se salvează istoric, dar blocarea funcționează doar pentru VanzariView
      if (!isCancelled && serviceFileIdToUse && (officeDirect || curierTrimis)) {
        console.log('[saveAllAndLog] Verificare blocare fișă:', {
          serviceFileIdToUse,
          officeDirect,
          curierTrimis,
          hasSetIsServiceFileLocked: !!setIsServiceFileLocked
        })
        
        // Verifică dacă fișa este deja blocată în DB
        const { data: currentServiceFile, error: getError } = await getServiceFile(serviceFileIdToUse)
        if (getError) {
          console.error('[saveAllAndLog] Eroare la citirea fișei pentru blocare:', getError)
        } else {
          console.log('[saveAllAndLog] Starea curentă a fișei:', {
            is_locked: currentServiceFile?.is_locked,
            office_direct: currentServiceFile?.office_direct,
            curier_trimis: currentServiceFile?.curier_trimis
          })
          
          if (currentServiceFile && !currentServiceFile.is_locked) {
            // Blochează fișa în DB + setează status 'comanda' (fișă blocată = comandă)
            console.log('[saveAllAndLog] Blochez fișa în DB și setez status comanda...')
            const { error: lockError } = await updateServiceFileWithHistory(serviceFileIdToUse, {
              is_locked: true,
              status: 'comanda'
            })
            if (lockError) {
              console.error('[saveAllAndLog] Eroare la blocarea fișei:', lockError)
            } else {
              console.log('[saveAllAndLog] Fișa blocată cu succes în DB')
              // IMPORTANT: Reîncarcă flag-urile din DB pentru a actualiza state-ul corect
              // Acest lucru asigură că is_locked este sincronizat cu DB
              const { data: refreshedServiceFile, error: refreshError } = await getServiceFile(serviceFileIdToUse)
              if (refreshError) {
                console.error('[saveAllAndLog] Eroare la reîncărcarea fișei după blocare:', refreshError)
                // Fallback: actualizează state-ul local direct (blocat => comanda)
                if (setIsServiceFileLocked) setIsServiceFileLocked(true)
                if (setServiceFileStatus) setServiceFileStatus('comanda')
              } else if (refreshedServiceFile) {
                // Actualizează state-ul local din DB (doar pentru VanzariView)
                const refreshedAny = refreshedServiceFile as any
                const isLockedFromDB = refreshedAny.is_locked ?? refreshedAny.is_Locked ?? refreshedServiceFile.is_locked ?? false
                const isLocked = Boolean(isLockedFromDB) === true
                if (setIsServiceFileLocked) {
                  setIsServiceFileLocked(isLocked)
                  console.log('[saveAllAndLog] State-ul local actualizat din DB: isServiceFileLocked =', isLocked, '(din DB is_locked:', isLockedFromDB, ', is_Locked:', refreshedAny.is_Locked, ')')
                } else {
                  console.warn('[saveAllAndLog] setIsServiceFileLocked nu este disponibil')
                }
                if (setServiceFileStatus) {
                  const st = (refreshedAny.status ?? refreshedServiceFile.status) as string | null
                  setServiceFileStatus(typeof st === 'string' ? st : 'comanda')
                }
              }
            }
          } else if (currentServiceFile && setIsServiceFileLocked) {
            // IMPORTANT: Verifică ambele variante: is_locked și is_Locked
            const currentAny = currentServiceFile as any
            const isLockedFromDB = currentAny.is_locked ?? currentAny.is_Locked ?? currentServiceFile.is_locked ?? false
            
            if (isLockedFromDB) {
              // Dacă fișa este deja blocată în DB, actualizează state-ul local
              console.log('[saveAllAndLog] Fișa este deja blocată în DB, actualizez state-ul local')
              const isLocked = Boolean(isLockedFromDB) === true
              setIsServiceFileLocked(isLocked)
              console.log('[saveAllAndLog] State-ul local actualizat: isServiceFileLocked =', isLocked, '(din DB is_locked:', isLockedFromDB, ', is_Locked:', currentAny.is_Locked, ')')
            }
          }
        }
      } else {
        console.log('[saveAllAndLog] Nu se blochează fișa:', {
          isCancelled,
          serviceFileIdToUse,
          officeDirect,
          curierTrimis,
          reason: !serviceFileIdToUse ? 'Lipsește serviceFileIdToUse' : (!officeDirect && !curierTrimis) ? 'Checkbox-urile nu sunt bifate' : 'Alt motiv'
        })
      }
      
      // 13. Afișează mesaj de succes
      if (!isCancelled) {
        toast.success('Fișa de serviciu a fost salvată cu succes!')
      }
      
    } catch (error: any) {
      console.error('❌ Eroare la salvare:', error)
      
      let errorMsg = 'Eroare necunoscută la salvare'
      if (error instanceof Error) {
        errorMsg = error.message
      } else if (error?.message) {
        errorMsg = error.message
      } else if (error?.hint) {
        errorMsg = error.hint
      }
      
      toast.error(`Eroare la salvare: ${errorMsg}`)
    } finally {
      setSaving(false)
    }
  }, [
    setSaving,
    saveServiceFileDetails,
    saveDeliveryCheckboxes,
    ensureTrayExists,
    saveBrandSerialData,
    instrumentForm,
    svc,
    instrumentSettings,
    saveUrgentAndSubscription,
    isCash,
    isCard,
    isVanzariPipeline,
    isCurierPipeline,
    items,
    leadId,
    services,
    instruments,
    subtotal,
    totalDiscount,
    urgentAmount,
    total,
    pipelinesWithIds,
    setItems,
    updateSnapshot,
    setIsDirty,
    recalcAllSheetsTotal,
    quotes,
    fisaId,
    globalDiscountPct,
    subscriptionType,
    trayDetails,
    paymentCash,
    paymentCard,
    officeDirect,
    curierTrimis,
    curierScheduledAt,
    urgentAllServices,
    retur,
    setIsServiceFileLocked,
    setServiceFileStatus,
  ])

  /** Salvează doar opțiunile fișei (Urgent, Retur, Office direct, Curier trimis) fără a modifica tăvițe/instrumente. */
  const saveOptionsOnly = useCallback(async () => {
    if (!fisaId) {
      toast.error('Nu există fișă de serviciu de salvat')
      return
    }
    setSaving(true)
    try {
      const combinedUpdates: any = {
        urgent: urgentAllServices,
        retur,
        office_direct: officeDirect,
        curier_trimis: curierTrimis,
      }
      if (officeDirect) combinedUpdates.office_direct_at = new Date().toISOString()
      if (curierTrimis) combinedUpdates.curier_scheduled_at = curierScheduledAt
      const detailsToSave = cleanDetailsForSave(trayDetails)
      if (detailsToSave != null && detailsToSave.trim() !== '') combinedUpdates.details = detailsToSave
      if (paymentCash !== undefined) combinedUpdates.cash = paymentCash
      if (paymentCard !== undefined) combinedUpdates.card = paymentCard
      const { error } = await updateServiceFileWithHistory(fisaId, combinedUpdates)
      if (error) {
        toast.error(error?.message ?? 'Eroare la salvare')
        return
      }
      setIsDirty(false)
      toast.success('Opțiuni salvate')
    } catch (e: any) {
      toast.error(e?.message ?? 'Eroare la salvare')
    } finally {
      setSaving(false)
    }
  }, [fisaId, urgentAllServices, retur, officeDirect, curierTrimis, curierScheduledAt, trayDetails, paymentCash, paymentCard, setSaving, setIsDirty])

  // Funcție pentru inițializarea snapshot-ului
  const initializeSnapshot = useCallback((items: LeadQuoteItem[]) => {
    updateSnapshot(items)
  }, [updateSnapshot])

  return {
    saveAllAndLog,
    saveOptionsOnly,
    initializeSnapshot,
  }
}

