/**
 * Hook pentru operațiile cu items (servicii, piese, instrumente)
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { createTrayItem, updateTrayItem, createTray } from '@/lib/supabase/serviceFileOperations'
import { logTrayItemChange } from '@/lib/supabase/leadOperations'
import { addInstrumentItem, listQuoteItems } from '@/lib/utils/preturi-helpers'
import { isVanzareService, isVanzareTray, generateVanzareTrayName, findExistingVanzareTray } from '@/lib/utils/vanzare-helpers'
import type { LeadQuote, LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Part } from '@/lib/supabase/partOperations'

const supabase = supabaseBrowser()

interface UsePreturiItemOperationsProps {
  selectedQuote: LeadQuote | null
  svc: any
  part: any
  services: Service[]
  parts: Part[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null }>
  departments: Array<{ id: string; name: string }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  items: LeadQuoteItem[]
  instrumentForm: any
  instrumentSettings: any
  urgentAllServices: boolean
  isVanzariPipeline: boolean
  isReceptiePipeline: boolean
  isDepartmentPipeline: boolean
  user: { id: string } | null
  
  // Props pentru logica de vânzare
  quotes: LeadQuote[]
  fisaId?: string | null
  serviceFileNumber?: string | number | null
  setQuotes: React.Dispatch<React.SetStateAction<LeadQuote[]>>
  setSelectedQuoteId: React.Dispatch<React.SetStateAction<string | null>>
  
  // State setters
  setItems: React.Dispatch<React.SetStateAction<LeadQuoteItem[]>>
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>
  setSvc: React.Dispatch<React.SetStateAction<any>>
  setPart: React.Dispatch<React.SetStateAction<any>>
  setInstrumentForm: React.Dispatch<React.SetStateAction<any>>
  setInstrumentSettings: React.Dispatch<React.SetStateAction<any>>
  setServiceSearchQuery: React.Dispatch<React.SetStateAction<string>>
  setPartSearchQuery: React.Dispatch<React.SetStateAction<string>>
  
  // Helper functions
  // tempId eliminat - items-urile se salvează direct în DB
  initializeSnapshot?: (items: LeadQuoteItem[]) => void
}

export function usePreturiItemOperations({
  selectedQuote,
  svc,
  part,
  services,
  parts,
  instruments,
  departments,
  pipelinesWithIds,
  items,
  instrumentForm,
  instrumentSettings,
  urgentAllServices,
  isVanzariPipeline,
  isReceptiePipeline,
  isDepartmentPipeline,
  user,
  quotes,
  fisaId,
  serviceFileNumber,
  setQuotes,
  setSelectedQuoteId,
  setItems,
  setIsDirty,
  setSvc,
  setPart,
  setInstrumentForm,
  setInstrumentSettings,
  setServiceSearchQuery,
  setPartSearchQuery,
  // tempId eliminat - items-urile se salvează direct în DB
  initializeSnapshot,
}: UsePreturiItemOperationsProps) {

  // Mută onAddService din PreturiContainer.tsx
  const onAddService = useCallback(async () => {
    if (!selectedQuote) {
      toast.error('Nu există o tăviță selectată. Te rog creează sau selectează o tăviță.')
      return
    }
    if (!svc?.id) {
      toast.error('Te rog selectează un serviciu înainte de a apăsa Adaugă')
      return
    }
    
    setIsDirty(true)
    
    // Logica normală pentru servicii individuale
    const svcDef = services.find(s => s.id === svc?.id)
    if (!svcDef) {
      toast.error('Serviciul selectat nu a fost găsit în catalog')
      return
    }
    
    // LOGICA DE VÂNZARE: Dacă serviciul este de tip vânzare și suntem în Recepție,
    // îl atribuim automat unei tăvițe speciale "Vanzare N"
    let targetQuote = selectedQuote
    if (isReceptiePipeline && isVanzareService(svcDef.name)) {
      console.log('[onAddService] Serviciu de vânzare detectat:', svcDef.name)
      
      // Găsește sau creează tăvița de vânzare
      const existingVanzareTray = findExistingVanzareTray(quotes, svcDef.name)
      
      if (existingVanzareTray) {
        console.log('[onAddService] Folosim tăvița de vânzare existentă:', existingVanzareTray.number)
        // Găsește quote-ul complet pentru tăvița de vânzare
        const vanzareQuote = quotes.find(q => q.id === existingVanzareTray.id)
        if (vanzareQuote) {
          targetQuote = vanzareQuote
        }
      } else if (fisaId) {
        // Creează o tăviță de vânzare nouă
        const newTrayName = generateVanzareTrayName(quotes, serviceFileNumber)
        console.log('[onAddService] Creem tăviță de vânzare nouă:', newTrayName)
        
        try {
          const { data: newTray, error } = await createTray({
            service_file_id: fisaId,
            number: newTrayName,
          })
          
          if (error || !newTray) {
            console.error('[onAddService] Eroare la crearea tăviței de vânzare:', error)
            toast.error('Eroare la crearea tăviței de vânzare')
            return
          }
          
          // Adaugă noul tray în lista de quotes
          const newQuote: LeadQuote = {
            id: newTray.id,
            number: newTray.number,
            size: newTray.size,
            created_at: newTray.created_at
          }
          setQuotes(prev => [...prev, newQuote])
          targetQuote = newQuote
          
          toast.success(`Tăviță de vânzare "${newTrayName}" creată automat`)
        } catch (err: any) {
          console.error('[onAddService] Eroare la crearea tăviței de vânzare:', err)
          toast.error('Eroare la crearea tăviței de vânzare: ' + (err?.message || 'Necunoscut'))
          return
        }
      }
    }
    
    // Verifică dacă există un instrument selectat (obligatoriu)
    const currentInstrumentId = instrumentForm?.instrument || svc?.instrumentId
    if (!currentInstrumentId) {
      toast.error('Te rog selectează un instrument înainte de a adăuga un serviciu')
      return
    }
    
    const currentInstrumentForService = instruments.find(i => i.id === currentInstrumentId)
    if (!currentInstrumentForService) {
      toast.error('Instrumentul selectat nu a fost găsit')
      return
    }
    
    if (!currentInstrumentForService.department_id) {
      toast.error('Instrumentul selectat nu are departament setat. Verifică setările instrumentului.')
      return
    }

    // Verifică dacă instrumentul are același departament ca cele existente în tăviță (doar pentru tăvițe definite)
    // NOTĂ: Pentru tăvițele de vânzare, nu verificăm departamentele (permitem orice instrumente)
    const isUndefinedTray = targetQuote && (!targetQuote.number || targetQuote.number === '')
    const isVanzareTrayTarget = isVanzareTray(targetQuote?.number)
    const allowAllInstruments = isVanzariPipeline && isUndefinedTray
    
    // Sărim verificarea departamentelor pentru tăvițele de vânzare
    if (!allowAllInstruments && !isVanzareTrayTarget && targetQuote && targetQuote.number && targetQuote.number.trim() !== '') {
      // Tăviță definită - verifică departamentele
      const existingDepartments = new Set<string | null>()
      items.forEach(item => {
        if (item.instrument_id && item.instrument_id !== currentInstrumentId) {
          let itemInstrumentId: string | null = null
          if (item.item_type === 'service' && item.service_id) {
            const serviceDef = services.find(s => s.id === item.service_id)
            itemInstrumentId = serviceDef?.instrument_id || null
          } else if (item.instrument_id) {
            itemInstrumentId = item.instrument_id
          }
          
          if (itemInstrumentId) {
            const existingInstrument = instruments.find(i => i.id === itemInstrumentId)
            if (existingInstrument && existingInstrument.department_id) {
              existingDepartments.add(existingInstrument.department_id)
            }
          }
        }
      })
      
      if (existingDepartments.size > 0 && currentInstrumentForService.department_id) {
        const allowedDepartment = Array.from(existingDepartments)[0]
        if (currentInstrumentForService.department_id !== allowedDepartment) {
          const departmentName = departments.find(d => d.id === allowedDepartment)?.name || 'acest departament'
          const newDepartmentName = departments.find(d => d.id === currentInstrumentForService.department_id)?.name || 'alt departament'
          toast.error(`Nu poți adăuga instrumente cu departamente diferite în aceeași tăviță. Tăvița conține deja instrumente din ${departmentName}, iar instrumentul selectat este din ${newDepartmentName}.`)
          return
        }
      }
    }

    // Verifică dacă instrumentul este din departamentul "Ascutit" - nu permite brand/serial
    const instrumentDeptForService = departments.find(d => d.id === currentInstrumentForService.department_id)
    const deptNameForService = instrumentDeptForService?.name?.toLowerCase() || ''
    const isAscutitInstrument = deptNameForService.includes('ascutit') || deptNameForService.includes('ascuțit')
    
    // IMPORTANT: Salvează automat toate brand-urile și serial number-urile înainte de a adăuga serviciul
    // Verifică dacă există brand-uri și serial number-uri de salvat
    // EXCEPTIE: Nu salvează brand/serial pentru instrumente din departamentul "Ascutit"
    const brandSerialGroupsArray = Array.isArray(instrumentForm.brandSerialGroups) ? instrumentForm.brandSerialGroups : []
    const groupsToSave = brandSerialGroupsArray.length > 0 
      ? brandSerialGroupsArray
      : [{ brand: '', serialNumbers: [{ serial: '', garantie: false }], qty: '1' }]
    
    // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
    let hasValidBrandSerialData = false
    if (!isAscutitInstrument && Array.isArray(groupsToSave)) {
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

    // IMPORTANT: În pipeline Vânzare, NU salvăm brand/serial înainte de serviciu
    // deoarece serviciul va fi creat cu brand/serial direct, și nu vrem să creăm item-uri goale
    // Pentru alte pipeline-uri, salvăm brand/serial înainte de serviciu pentru compatibilitate
    const shouldSaveBrandSerialBeforeService = hasValidBrandSerialData && selectedQuote && !isAscutitInstrument && !isVanzariPipeline
    
    // Dacă există date de brand/serial, salvează-le automat înainte de a adăuga serviciul
    // NU salva dacă instrumentul este din departamentul "Ascutit" SAU dacă suntem în pipeline Vânzare
    if (shouldSaveBrandSerialBeforeService) {
      try {
        // Găsește item-ul existent pentru instrument sau creează unul nou
        const existingItem = items.find((i: any) => i.instrument_id === currentInstrumentId && i.item_type === null)
        
        const qty = Number(instrumentForm?.qty || 1)
        
        // Transformă structura pentru salvare: grupăm serial numbers-urile după garanție
        // Dacă avem serial numbers cu garanții diferite, creăm brand-uri separate
        const brandSerialGroupsToSend: Array<{ brand: string | null; serialNumbers: string[]; garantie: boolean }> = []
        
        for (const group of groupsToSave) {
          const brandName = group.brand?.trim()
          if (!brandName) continue
          
          // Grupează serial numbers-urile după garanție
          const serialsByGarantie = new Map<boolean, string[]>()
          
          // IMPORTANT: Include toate serial numbers-urile, inclusiv cele goale
          group.serialNumbers.forEach((snData) => {
            const serial = typeof snData === 'string' ? snData : snData.serial || ''
            const snGarantie = typeof snData === 'object' ? (snData.garantie || false) : false
            const serialValue = serial && serial.trim() ? serial.trim() : ''
            
            if (!serialsByGarantie.has(snGarantie)) {
              serialsByGarantie.set(snGarantie, [])
            }
            serialsByGarantie.get(snGarantie)!.push(serialValue)
          })
          
          // Creează un grup pentru fiecare nivel de garanție (inclusiv cu serial numbers goale)
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

        if (filteredGroups.length > 0) {
          if (existingItem && existingItem.id) {
            // Actualizează item-ul existent cu brand-urile și serial number-urile
            // Șterge brand-urile vechi
            const { error: deleteError } = await supabase
              .from('tray_item_brands')
              .delete()
              .eq('tray_item_id', existingItem.id)
            
            if (deleteError && deleteError.code !== '42P01') {
              console.error('Error deleting old brands:', deleteError)
            }
            
            // OPTIMIZARE: Batch operations pentru reducerea call-urilor
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
              const { data: brandResults, error: brandsError } = await supabase
                .from('tray_item_brands')
                .insert(brandsToInsert)
                .select()

              if (brandsError) {
                console.error('Error creating brands:', brandsError)
                // Continuă fără să arunce eroare pentru a nu bloca adăugarea serviciului
              } else if (brandResults && brandResults.length > 0) {
                // Grupează toate serial numbers-urile pentru batch INSERT
                const serialsToInsert: Array<{ brand_id: string; serial_number: string }> = []
                
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
                  
                  if (brandId) {
                    const serialNumbers = group.serialNumbers
                      .map(sn => {
                        const serial = typeof sn === 'string' ? sn : sn.serial || ''
                        return serial.trim()
                      })
                      .filter(sn => sn)
                    
                    serialNumbers.forEach(sn => {
                      serialsToInsert.push({
                        brand_id: brandId,
                        serial_number: sn.trim(),
                      })
                    })
                  }
                })

                // Batch INSERT pentru toate serial numbers-urile (un singur call în loc de N)
                if (serialsToInsert.length > 0) {
                  const { error: serialsError } = await supabase
                    .from('tray_item_brand_serials')
                    .insert(serialsToInsert)

                  if (serialsError) {
                    console.error('Error creating serials:', serialsError)
                  }
                }
              }
            }
          } else {
            // IMPORTANT: Verifică dacă există deja servicii pentru acest instrument
            // Dacă există servicii, nu crea un item nou cu item_type: null
            // Brand-urile vor fi salvate în serviciile existente
            const existingServices = items.filter((item: any) => 
              item.instrument_id === currentInstrumentId && 
              item.item_type === 'service' &&
              item.service_id
            )
            
            // Dacă nu există servicii, creează un item nou pentru instrument
            if (existingServices.length === 0) {
              const instrument = instruments.find(i => i.id === currentInstrumentId)
              if (instrument) {
                let autoPipelineId: string | null = null
                const instrumentDept = departments.find(d => d.id === instrument.department_id)
                const deptName = instrumentDept?.name?.toLowerCase() || instrument.department_id?.toLowerCase()
                if (deptName === 'reparatii') {
                  const reparatiiPipeline = pipelinesWithIds.find(p => p.name.toLowerCase() === 'reparatii')
                  if (reparatiiPipeline) autoPipelineId = reparatiiPipeline.id
                }
                
                await addInstrumentItem(targetQuote.id, instrument.name, {
                  instrument_id: instrument.id,
                  department_id: instrument.department_id,
                  qty: qty,
                  discount_pct: 0,
                  urgent: false,
                  technician_id: null,
                  pipeline_id: autoPipelineId,
                  brandSerialGroups: brandSerialGroupsToSend
                })
                
                // OPTIMIZARE: Nu mai reîncărcăm items-urile aici - vor fi reîncărcate după crearea serviciului
                // Aceasta reduce numărul de call-uri de la 2 la 1
                // Reîncărcarea finală se face după createTrayItem() pentru serviciu (linia ~755)
              }
            }
            // Dacă există servicii, nu creăm item nou - brand-urile vor fi salvate în serviciile existente
          }
        }
      } catch (error) {
        console.error('Error saving brand/serial data before adding service:', error)
        toast.error('Eroare la salvare date brand/serial. Te rog încearcă din nou.')
        return
      }
    }
  
    // IMPORTANT: Folosește întotdeauna cantitatea din instrumentForm.qty dacă există, altfel din svc.qty
    // Astfel, când se adaugă mai multe servicii, toate vor folosi aceeași cantitate din formularul instrumentului
    const qty = Math.max(1, Number(instrumentForm?.qty || svc?.qty || 1))
    const discount = Math.min(100, Math.max(0, Number(svc.discount || 0)))
    
    // Pentru Vanzari: procesează fiecare brand selectat separat
    // Pentru alte pipeline-uri: folosește logica existentă cu serial number
    const garantie = instrumentForm.garantie || false
    
    // Verifică dacă există deja un item cu instrument (item_type: null)
    const existingInstrumentItem = items.find(it => it.item_type === null)
    
    // Obține pipeline_id din svc.pipelineId sau setare automată bazată pe department_id
    let pipelineId = svc.pipelineId || null
    
    // Setează pipeline_id automat dacă instrumentul are department_id = "reparatii"
    if (currentInstrumentForService?.department_id && !pipelineId) {
      const instrumentDept = departments.find(d => d.id === currentInstrumentForService.department_id)
      const deptName = instrumentDept?.name?.toLowerCase() || currentInstrumentForService.department_id?.toLowerCase()
      
      if (deptName === 'reparatii') {
        const reparatiiPipeline = pipelinesWithIds.find(p => p.name.toLowerCase() === 'reparatii')
        if (reparatiiPipeline) {
          pipelineId = reparatiiPipeline.id
        }
      }
    }
    
      // LOGICĂ: Permite selecția serial numbers-urilor pentru serviciu
      // Utilizatorul poate selecta toate sau doar unele serial numbers-uri
      // Serviciul va conține doar serial numbers-urile selectate, afișate clar în tabel
      if (isVanzariPipeline) {
        // Colectează serial numbers-urile selectate
        const brandsToProcess = Array.isArray(svc.selectedBrands) ? svc.selectedBrands : []
        const brandSerialGroupsArray = Array.isArray(instrumentForm?.brandSerialGroups) 
          ? instrumentForm.brandSerialGroups 
          : []
        
        // DEBUG: Verifică datele de intrare
        console.log('[onAddService] brandsToProcess:', brandsToProcess)
        console.log('[onAddService] brandSerialGroupsArray:', JSON.stringify(brandSerialGroupsArray, null, 2))
        
        // Dacă nu sunt selectate serial numbers-uri, folosește toate pentru INSTRUMENTUL CURENT (comportament implicit)
        const useAllSerials = brandsToProcess.length === 0
      
      const brandSerialGroupsToSave: Array<{ brand: string | null; serialNumbers: string[]; garantie: boolean }> = []
      let totalQtyFromBrands = 0
      
      if (useAllSerials) {
        // IMPORTANT: Folosește DOAR serial numbers-urile pentru instrumentul CURENT selectat
        // Nu folosi toate serial-urile tuturor instrumentelor, ci doar cele pentru instrumentul curent
        // Verifică dacă există items în tabel pentru instrumentul curent și folosește serial-urile acelora
        const currentInstrumentItems = items.filter((item: any) => 
          item.instrument_id === currentInstrumentId && 
          (item.item_type === 'service' || item.item_type === null)
        )
        
        // Dacă există items pentru instrumentul curent, folosește serial-urile din acestea
        if (currentInstrumentItems.length > 0) {
          // Colectează toate brand-urile și serial-urile din items-urile existente pentru instrumentul curent
          for (const item of currentInstrumentItems) {
            if (item.brand_groups && Array.isArray(item.brand_groups)) {
              for (const bg of item.brand_groups) {
                if (!bg || typeof bg !== 'object') continue
                const brandName = bg.brand?.trim() || '—'
                const serialNumbers = Array.isArray(bg.serialNumbers) 
                  ? bg.serialNumbers.map((sn: any) => {
                      const serial = typeof sn === 'string' ? sn : (sn?.serial || '')
                      return serial.trim()
                    })
                  : []
                
                const validSerialNumbers = serialNumbers.filter(sn => sn && sn.trim())
                if (validSerialNumbers.length > 0) {
                  totalQtyFromBrands += validSerialNumbers.length
                  brandSerialGroupsToSave.push({
                    brand: brandName,
                    serialNumbers: serialNumbers,
                    garantie: bg.garantie || false
                  })
                }
              }
            }
          }
        } else {
          // Dacă nu există items pentru instrumentul curent, folosește serial-urile din formular
          // (acestea ar trebui să fie doar pentru instrumentul curent)
          for (const group of brandSerialGroupsArray) {
            // IMPORTANT: Permite brand-uri goale - folosește un brand default dacă este gol
            const brandName = group?.brand?.trim() || '—' // Folosește '—' ca brand default dacă este gol
            
            const serialNumbers = Array.isArray(group.serialNumbers)
              ? group.serialNumbers.map((sn: any) => {
                  const serial = typeof sn === 'string' ? sn : (sn?.serial || '')
                  return serial.trim()
                })
              : []
            
            const validSerialNumbers = serialNumbers.filter(sn => sn && sn.trim())
            
            // IMPORTANT: Salvează grupul chiar dacă brand-ul este gol, dacă există serial numbers-uri valide
            if (validSerialNumbers.length > 0) {
              totalQtyFromBrands += validSerialNumbers.length
              // IMPORTANT: Salvează TOATE serial numbers-urile (inclusiv cele goale) pentru a păstra pozițiile
              // Acest lucru asigură că toate serial numbers-urile sunt afișate în tabel
              brandSerialGroupsToSave.push({
                brand: brandName, // Folosește brand-ul (sau '—' dacă este gol)
                serialNumbers: serialNumbers, // Toate serial numbers-urile, inclusiv cele goale
                garantie: group.garantie || false
              })
            }
          }
        }
      } else {
        // Folosește DOAR serial numbers-urile selectate
        // Grupează selecțiile după brand
        const brandGroupsMap = new Map<string, string[]>()
        
        for (const selectedKey of brandsToProcess) {
          const [brandName, serialValue] = selectedKey.split('::')
          if (!brandName) continue
          
          if (!brandGroupsMap.has(brandName)) {
            brandGroupsMap.set(brandName, [])
          }
          brandGroupsMap.get(brandName)!.push(serialValue || '')
        }
        
        // Procesează fiecare brand și serial numbers-urile selectate
        for (const [brandName, selectedSerials] of brandGroupsMap.entries()) {
          const brandGroup = brandSerialGroupsArray.find(
            g => {
              const gBrand = g?.brand?.trim() || ''
              const searchBrand = brandName.trim() || ''
              return gBrand === searchBrand
            }
          )
          
          const serialNumbers: string[] = []
          const allSerials = brandGroup && Array.isArray(brandGroup.serialNumbers) 
            ? brandGroup.serialNumbers 
            : []
          
          // Colectează serial numbers-urile selectate
          for (const selectedSerial of selectedSerials) {
            if (selectedSerial.startsWith('empty-')) {
              const match = selectedSerial.match(/empty-(\d+)-(\d+)/)
              if (match && brandGroup) {
                const snIdx = parseInt(match[2])
                if (snIdx < allSerials.length) {
                  const snData = allSerials[snIdx]
                  const serial = typeof snData === 'string' ? snData : (snData?.serial || '')
                  serialNumbers.push(serial || '')
                }
              }
            } else if (selectedSerial && selectedSerial.trim()) {
              if (brandGroup && allSerials.length > 0) {
                const found = allSerials.find((snData: any) => {
                  const serial = typeof snData === 'string' ? snData : (snData?.serial || '')
                  return serial === selectedSerial
                })
                if (found) {
                  const serial = typeof found === 'string' ? found : (found?.serial || '')
                  serialNumbers.push(serial || '')
                } else {
                  serialNumbers.push(selectedSerial)
                }
              } else {
                serialNumbers.push(selectedSerial)
              }
            }
          }
          
          const validSerialNumbers = serialNumbers.filter(sn => sn && sn.trim())
          if (validSerialNumbers.length > 0) {
            totalQtyFromBrands += validSerialNumbers.length
            brandSerialGroupsToSave.push({
              brand: brandName.trim() || null,
              serialNumbers: validSerialNumbers,
              garantie: brandGroup?.garantie || false
            })
          }
        }
      }
      
      // Folosește cantitatea totală calculată
      const finalQty = totalQtyFromBrands > 0 ? totalQtyFromBrands : qty
      
      // console.log('[onAddService] brandSerialGroupsToSave:', JSON.stringify(brandSerialGroupsToSave, null, 2))
      // console.log('[onAddService] Total brands to save:', brandSerialGroupsToSave.length)
      
      // IMPORTANT: Verifică dacă există deja un serviciu pentru acest instrument
      // Dacă există, actualizează-l cu toate brand-urile și serial numbers-urile
      // Dacă nu există, verifică dacă există un item goal (item_type: null) pentru a-l actualiza
      // PRIORITATE: Dacă există editingItemId în svc, folosește-l pentru actualizare
      const existingServiceItem = (svc as any)?.editingItemId
        ? items.find((it: any) => it.id === (svc as any).editingItemId)
        : items.find((it: any) => 
            it.item_type === 'service' && 
            it.instrument_id === currentInstrumentForService.id &&
            it.service_id === svcDef.id
          )
      
      const existingEmptyItem = existingServiceItem 
        ? null // Dacă există deja serviciul, nu folosim item-uri goale
        : items.find((it: any) => 
            it.item_type === null && 
            it.instrument_id === currentInstrumentForService.id
          )
      
      // IMPORTANT: Creează un SINGUR serviciu cu TOATE brand-urile asociate
      try {
        // Pregătește notes JSON cu toate detaliile serviciului
        // Pentru compatibilitate, folosește primul brand ca brand principal
        const firstBrand = brandSerialGroupsToSave[0]
        const notesData = {
          item_type: 'service',
          name: svcDef.name,
          price: Number(svcDef.price),
          discount_pct: discount,
          urgent: urgentAllServices,
          brand: firstBrand?.brand || null,
          serial_number: firstBrand?.serialNumbers?.[0] || null,
          garantie: garantie || false,
        }
        
        let createdItem: any = null
        
        // Dacă există deja un serviciu pentru acest instrument, actualizează-l
        if (existingServiceItem && existingServiceItem.id) {
          // IMPORTANT: Păstrăm technician_id de la item-ul vechi dacă nu e specificat unul nou
          // Astfel tehnicianul nu dispare de pe dashboard când se înlocuiește instrumentul
          const technicianIdToUse = svc.technicianId || (existingServiceItem as any).technician_id || null
          
          // Actualizează serviciul existent cu toate brand-urile și serial numbers-urile
          const { data: updatedItem, error: updateError } = await updateTrayItem(
            existingServiceItem.id,
            {
              service_id: svcDef.id,
              instrument_id: currentInstrumentForService.id,
              department_id: currentInstrumentForService.department_id,
              technician_id: technicianIdToUse,
              qty: finalQty,
              notes: JSON.stringify(notesData),
              pipeline: pipelineId ? pipelinesWithIds.find(p => p.id === pipelineId)?.name || null : null,
            }
          )
          
          if (updateError) {
            console.error('Error updating existing service:', updateError)
            toast.error(`Eroare la actualizare serviciu: ${updateError.message}`)
            return
          }
          
          if (!updatedItem) {
            console.error('No item updated')
            toast.error('Eroare la actualizarea serviciului')
            return
          }
          
          createdItem = updatedItem
          
          // DEBUG: Verifică dacă brandSerialGroupsToSave este populat
          console.log('[onAddService] Updating existing service item:', existingServiceItem.id)
          console.log('[onAddService] brandSerialGroupsToSave:', JSON.stringify(brandSerialGroupsToSave, null, 2))
          
          // Actualizează brand-urile pentru serviciul existent cu TOATE serial numbers-urile
          if (brandSerialGroupsToSave.length > 0) {
            // IMPORTANT: Obține brand_id-urile vechi înainte de a șterge brand-urile
            const { data: oldBrands } = await supabase
              .from('tray_item_brands')
              .select('id')
              .eq('tray_item_id', existingServiceItem.id)
            
            const oldBrandIds = oldBrands?.map((b: any) => b.id) || []
            
            // Șterge serial numbers-urile vechi
            if (oldBrandIds.length > 0) {
              const { error: deleteSerialsError } = await supabase
                .from('tray_item_brand_serials')
                .delete()
                .in('brand_id', oldBrandIds)
              
              if (deleteSerialsError && deleteSerialsError.code !== '42P01') {
                console.error('Error deleting old serials:', deleteSerialsError)
              }
            }
            
            // Șterge brand-urile vechi
            const { error: deleteError } = await supabase
              .from('tray_item_brands')
              .delete()
              .eq('tray_item_id', existingServiceItem.id)
            
            if (deleteError && deleteError.code !== '42P01') {
              console.error('Error deleting old brands:', deleteError)
            }
            
            // Adaugă brand-urile noi cu TOATE serial numbers-urile
            const brandsToInsertMap = new Map<string, { tray_item_id: string; brand: string; garantie: boolean }>()
            brandSerialGroupsToSave.forEach(group => {
              // IMPORTANT: Permite brand-uri goale - folosește un brand default dacă este gol
              const brandName = (group.brand?.trim() || '—') // Folosește '—' ca brand default dacă este gol
              const garantie = group.garantie || false
              const key = `${brandName}::${garantie}`
              if (!brandsToInsertMap.has(key)) {
                brandsToInsertMap.set(key, {
                  tray_item_id: existingServiceItem.id,
                  brand: brandName, // Folosește brand-ul (sau '—' dacă este gol)
                  garantie: garantie,
                })
              }
            })
            const brandsToInsert = Array.from(brandsToInsertMap.values())

            if (brandsToInsert.length > 0) {
              const { data: brandResults, error: brandsError } = await supabase
                .from('tray_item_brands')
                .insert(brandsToInsert)
                .select()

              if (brandsError) {
                console.error('Error creating brands:', brandsError)
              } else if (brandResults && brandResults.length > 0) {
                // Adaugă TOATE serial numbers-urile pentru fiecare brand
                const serialsToInsert: Array<{ brand_id: string; serial_number: string }> = []
                const brandMap = new Map<string, string>()
                brandResults.forEach((br: any) => {
                  const key = `${br.brand}::${br.garantie}`
                  brandMap.set(key, br.id)
                })

                brandSerialGroupsToSave.forEach(group => {
                  // IMPORTANT: Permite brand-uri goale - folosește un brand default dacă este gol
                  const brandName = (group.brand?.trim() || '—') // Folosește '—' ca brand default dacă este gol
                  const garantie = group.garantie || false
                  const key = `${brandName}::${garantie}`
                  const brandId = brandMap.get(key)
                  
                  if (brandId) {
                    // IMPORTANT: Include TOATE serial numbers-urile (inclusiv cele goale) pentru serviciu
                    // Acest lucru asigură că toate serial numbers-urile sunt salvate și afișate
                    const serialsForBrand = group.serialNumbers || []
                    console.log(`[onAddService] Adding ${serialsForBrand.length} serial numbers for brand "${brandName}":`, serialsForBrand)
                    serialsForBrand.forEach(sn => {
                      const serial = typeof sn === 'string' ? sn : (sn?.serial || '')
                      serialsToInsert.push({
                        brand_id: brandId,
                        serial_number: serial || '', // Salvează și serial numbers-urile goale
                      })
                    })
                  } else {
                    console.warn(`[onAddService] Brand ID not found for brand "${brandName}" with key "${key}"`)
                  }
                })

                if (serialsToInsert.length > 0) {
                  console.log(`[onAddService] Inserting ${serialsToInsert.length} serial numbers for existing service item:`, serialsToInsert)
                  const { error: serialsError } = await supabase
                    .from('tray_item_brand_serials')
                    .insert(serialsToInsert)

                  if (serialsError) {
                    console.error('Error creating serials for existing service:', serialsError)
                    toast.error(`Eroare la salvare serial numbers: ${serialsError.message}`)
                  } else {
                    console.log('[onAddService] Serial numbers saved successfully for existing service item')
                  }
                } else {
                  console.warn('[onAddService] No serial numbers to insert for existing service item - brandSerialGroupsToSave may be empty')
                }
              } else {
                console.warn('[onAddService] No brands created for existing service item')
              }
            } else {
              console.warn('[onAddService] No brands to insert for existing service item')
            }
          } else {
            console.warn('[onAddService] brandSerialGroupsToSave is empty for existing service item')
          }
        } else if (existingEmptyItem && existingEmptyItem.id) {
          // IMPORTANT: Păstrăm technician_id de la item-ul vechi dacă nu e specificat unul nou
          const technicianIdForEmpty = svc.technicianId || (existingEmptyItem as any).technician_id || null
          
          // Actualizează item-ul existent cu serviciul
          const { data: updatedItem, error: updateError } = await updateTrayItem(
            existingEmptyItem.id,
            {
              service_id: svcDef.id,
              instrument_id: currentInstrumentForService.id,
              department_id: currentInstrumentForService.department_id,
              technician_id: technicianIdForEmpty,
              qty: finalQty,
              notes: JSON.stringify(notesData),
              pipeline: pipelineId ? pipelinesWithIds.find(p => p.id === pipelineId)?.name || null : null,
            }
          )
          
          if (updateError) {
            console.error('Error updating existing item with service:', updateError)
            toast.error(`Eroare la actualizare serviciu: ${updateError.message}`)
            return
          }
          
          if (!updatedItem) {
            console.error('No item updated')
            toast.error('Eroare la actualizarea serviciului')
            return
          }
          
          createdItem = updatedItem
          
          // IMPORTANT: Pentru serviciu, folosim DOAR serial numbers-urile selectate (brandSerialGroupsToSave)
          // Nu folosim toate serial numbers-urile din formular, ci doar cele selectate pentru acest serviciu
          // Acest lucru permite afișarea clară a serial numbers-urilor asociate cu fiecare serviciu
          
          // Actualizează brand-urile pentru serviciul existent cu DOAR serial numbers-urile selectate
          if (brandSerialGroupsToSave.length > 0) {
            // IMPORTANT: Obține brand_id-urile vechi înainte de a șterge brand-urile
            const { data: oldBrands } = await supabase
              .from('tray_item_brands')
              .select('id')
              .eq('tray_item_id', existingEmptyItem.id)
            
            const oldBrandIds = oldBrands?.map((b: any) => b.id) || []
            
            // Șterge serial numbers-urile vechi
            if (oldBrandIds.length > 0) {
              const { error: deleteSerialsError } = await supabase
                .from('tray_item_brand_serials')
                .delete()
                .in('brand_id', oldBrandIds)
              
              if (deleteSerialsError && deleteSerialsError.code !== '42P01') {
                console.error('Error deleting old serials:', deleteSerialsError)
              }
            }
            
            // Șterge brand-urile vechi
            const { error: deleteError } = await supabase
              .from('tray_item_brands')
              .delete()
              .eq('tray_item_id', existingEmptyItem.id)
            
            if (deleteError && deleteError.code !== '42P01') {
              console.error('Error deleting old brands:', deleteError)
            }
            
            // Adaugă brand-urile noi cu DOAR serial numbers-urile selectate pentru serviciu
            const brandsToInsertMap = new Map<string, { tray_item_id: string; brand: string; garantie: boolean }>()
            brandSerialGroupsToSave.forEach(group => {
              // IMPORTANT: Permite brand-uri goale - folosește un brand default dacă este gol
              const brandName = (group.brand?.trim() || '—') // Folosește '—' ca brand default dacă este gol
              const garantie = group.garantie || false
              const key = `${brandName}::${garantie}`
              if (!brandsToInsertMap.has(key)) {
                brandsToInsertMap.set(key, {
                  tray_item_id: existingEmptyItem.id,
                  brand: brandName, // Folosește brand-ul (sau '—' dacă este gol)
                  garantie: garantie,
                })
              }
            })
            const brandsToInsert = Array.from(brandsToInsertMap.values())

            if (brandsToInsert.length > 0) {
              const { data: brandResults, error: brandsError } = await supabase
                .from('tray_item_brands')
                .insert(brandsToInsert)
                .select()

              if (brandsError) {
                console.error('Error creating brands:', brandsError)
              } else if (brandResults && brandResults.length > 0) {
                // Adaugă DOAR serial numbers-urile selectate pentru serviciu
                const serialsToInsert: Array<{ brand_id: string; serial_number: string }> = []
                const brandMap = new Map<string, string>()
                brandResults.forEach((br: any) => {
                  const key = `${br.brand}::${br.garantie}`
                  brandMap.set(key, br.id)
                })

                brandSerialGroupsToSave.forEach(group => {
                  // IMPORTANT: Permite brand-uri goale - folosește un brand default dacă este gol
                  const brandName = (group.brand?.trim() || '—') // Folosește '—' ca brand default dacă este gol
                  const garantie = group.garantie || false
                  const key = `${brandName}::${garantie}`
                  const brandId = brandMap.get(key)
                  
                  if (brandId) {
                    // IMPORTANT: Include TOATE serial numbers-urile (inclusiv cele goale) pentru serviciu
                    // Acest lucru asigură că toate serial numbers-urile sunt salvate și afișate
                    const serialsForBrand = group.serialNumbers || []
                    console.log(`[onAddService] Adding ${serialsForBrand.length} serial numbers for brand "${brandName}":`, serialsForBrand)
                    serialsForBrand.forEach(sn => {
                      const serial = typeof sn === 'string' ? sn : (sn?.serial || '')
                      serialsToInsert.push({
                        brand_id: brandId,
                        serial_number: serial || '', // Salvează și serial numbers-urile goale
                      })
                    })
                  } else {
                    console.warn(`[onAddService] Brand ID not found for brand "${brandName}" with key "${key}"`)
                  }
                })

                if (serialsToInsert.length > 0) {
                  const { error: serialsError } = await supabase
                    .from('tray_item_brand_serials')
                    .insert(serialsToInsert)

                  if (serialsError) {
                    console.error('Error creating serials:', serialsError)
                  }
                }
              }
            }
          }
        } else {
          // Creează serviciul în DB cu toate brand-urile
          const { data: newItem, error: createError } = await createTrayItem({
            tray_id: targetQuote.id,
            service_id: svcDef.id,
            instrument_id: currentInstrumentForService.id,
            department_id: currentInstrumentForService.department_id,
            technician_id: svc.technicianId || null,
            qty: finalQty,
            notes: JSON.stringify(notesData),
            pipeline: pipelineId ? pipelinesWithIds.find(p => p.id === pipelineId)?.name || null : null,
            brandSerialGroups: brandSerialGroupsToSave.length > 0 ? brandSerialGroupsToSave : undefined
          })
          
          if (createError) {
            console.error('Error creating service item:', createError)
            toast.error(`Eroare la salvare serviciu: ${createError.message}`)
            return
          }
          
          if (!newItem) {
            console.error('No item created')
            toast.error('Eroare la crearea serviciului')
            return
          }
          
          createdItem = newItem
          logTrayItemChange({
            trayId: targetQuote.id,
            message: `Serviciu adăugat: ${svcDef.name} (cantitate ${finalQty})`,
            eventType: 'tray_item_added',
            payload: {
              item_id: newItem.id,
              item_name: svcDef.name,
              item_type: 'service',
              qty: finalQty,
              price: (svcDef as any).price ?? null,
              instrument_id: currentInstrumentForService.id,
              instrument_name: currentInstrumentForService.name,
              discount_pct: discount ?? null,
              non_repairable_qty: 0,
            },
            serviceFileId: fisaId ?? undefined,
          }).catch(() => {})
        }
        
        if (!createdItem) {
          console.error('No item created/updated')
          toast.error('Eroare la crearea/actualizarea serviciului')
          return
        }
        
        // Transformă item-ul creat/actualizat în LeadQuoteItem pentru afișare
        // IMPORTANT: brand_groups conține DOAR serial numbers-urile selectate pentru acest serviciu
        // Acest lucru permite afișarea clară a serial numbers-urilor asociate cu fiecare serviciu
        const brandGroupsForDisplay = brandSerialGroupsToSave.map(bg => {
          // IMPORTANT: Include TOATE serial numbers-urile (inclusiv cele goale) pentru afișare
          // Acest lucru asigură că toate serial numbers-urile sunt afișate în tabel
          const allSerials = Array.isArray(bg.serialNumbers) 
            ? bg.serialNumbers.map((sn: any) => {
                const serial = typeof sn === 'string' ? sn : (sn?.serial || '')
                return serial || '' // Păstrează și serial numbers-urile goale
              })
            : []
          
          return {
            id: '', // Nu avem ID-ul încă, dar nu este necesar pentru afișare
            brand: bg.brand || '',
            serialNumbers: allSerials, // Toate serial numbers-urile, inclusiv cele goale
            garantie: bg.garantie || false
          }
        })
        
        
        const serviceItem: LeadQuoteItem & { brand_groups?: Array<{ id: string; brand: string; serialNumbers: string[]; garantie: boolean }> } = {
          id: createdItem.id,
          item_type: 'service',
          service_id: svcDef.id,
          instrument_id: currentInstrumentForService.id,
          department_id: currentInstrumentForService.department_id,
          name_snapshot: svcDef.name,
          price: Number(svcDef.price),
          qty: finalQty,
          discount_pct: discount,
          urgent: urgentAllServices,
          technician_id: svc.technicianId || null,
          pipeline_id: pipelineId,
          brand: firstBrand?.brand || null,
          serial_number: firstBrand?.serialNumbers?.[0] || null,
          garantie: garantie,
          brand_groups: brandGroupsForDisplay,
        } as unknown as LeadQuoteItem & { brand_groups?: Array<{ id: string; brand: string; serialNumbers: string[]; garantie: boolean }> }
        
        // Actualizează sau adaugă serviciul în state
        if (existingServiceItem && existingServiceItem.id) {
          // Actualizează serviciul existent în state
          setItems(prev => prev.map(it => 
            it.id === existingServiceItem.id ? serviceItem : it
          ))
        } else if (existingEmptyItem && existingEmptyItem.id) {
          // Actualizează item-ul existent (item_type: null) în state
          setItems(prev => prev.map(it => 
            it.id === existingEmptyItem.id ? serviceItem : it
          ))
        } else {
          // Adaugă serviciul nou în state
          setItems(prev => [...prev, serviceItem])
        }
      } catch (error: any) {
        console.error('Error creating service item:', error)
        toast.error(`Eroare la salvare serviciu: ${error.message || error}`)
        return
      }
      
      // Actualizează cantitatea în formular cu cantitatea totală calculată
      if (totalQtyFromBrands > 0) {
        setInstrumentForm(prev => ({
          ...prev,
          qty: String(totalQtyFromBrands)
        }))
        setSvc(prev => ({
          ...prev,
          qty: String(totalQtyFromBrands)
        }))
      }
      
      // IMPORTANT: Păstrează brand-urile în formular și în instrumentSettings
      // pentru a preveni resetarea lor după reîncărcarea items-urilor
      // Folosește brandSerialGroupsArray deja definit mai sus
      const currentBrandGroups = [...brandSerialGroupsArray] // Creează o copie pentru a preveni mutații
      const currentQtyValue = String(totalQtyFromBrands > 0 ? totalQtyFromBrands : (instrumentForm?.qty || '1'))
      
      // Salvează în instrumentSettings imediat
      setInstrumentSettings(prev => ({
        ...prev,
        [currentInstrumentId]: {
          qty: currentQtyValue,
          brandSerialGroups: currentBrandGroups
        }
      }))
      
      // De asemenea, actualizează formularul imediat pentru a preveni resetarea
      setInstrumentForm(prev => ({
        ...prev,
        instrument: currentInstrumentId,
        brandSerialGroups: currentBrandGroups,
        qty: currentQtyValue
      }))
      
      // Resetează doar câmpurile serviciului, dar PĂSTREAZĂ brand-urile în instrumentForm
      setSvc(prev => ({ 
        ...prev, 
        id: '', 
        qty: String(totalQtyFromBrands > 0 ? totalQtyFromBrands : (instrumentForm.qty || '1')),
        discount: '0', 
        urgent: false, 
        technicianId: '',
        pipelineId: '',
        serialNumberId: '',
        selectedBrands: [] as string[], // Resetează brand-urile selectate pentru serviciu
      }))
      setServiceSearchQuery('')
      setIsDirty(true)
      
      // Reîncarcă items-urile pentru a actualiza lista cu IDs reale din DB
      // Folosim setTimeout pentru a preveni resetarea brand-urilor de către useEffect care se execută când items se schimbă
      setTimeout(async () => {
        try {
          const newItems = await listQuoteItems(targetQuote.id, services, instruments, pipelinesWithIds)
          
          // IMPORTANT: În pipeline Vânzare, șterge item-urile goale (item_type: null) care nu au servicii
          // acestea nu ar trebui să existe după ce s-a adăugat un serviciu
          if (isVanzariPipeline) {
            const emptyItems = newItems.filter((item: any) => 
              item.item_type === null && 
              item.instrument_id === currentInstrumentForService.id &&
              !item.service_id
            )
            
            // Șterge item-urile goale din DB
            for (const emptyItem of emptyItems) {
              if (emptyItem.id) {
                try {
                  await supabase
                    .from('tray_items')
                    .delete()
                    .eq('id', emptyItem.id)
                } catch (error) {
                  console.error('Error deleting empty item:', error)
                }
              }
            }
            
            // Reîncarcă items-urile după ștergere
            if (emptyItems.length > 0) {
              const cleanedItems = await listQuoteItems(targetQuote.id, services, instruments, pipelinesWithIds)
              setItems(cleanedItems)
              
              // Actualizează snapshot-ul
              if (cleanedItems.length > 0 && initializeSnapshot) {
                initializeSnapshot(cleanedItems)
              }
            } else {
              setItems(newItems)
            }
          } else {
            setItems(newItems)
          }
          
          // Actualizează snapshot-ul după reîncărcarea items-urilor din DB
          if (newItems.length > 0 && initializeSnapshot) {
            initializeSnapshot(newItems)
          }
          
          // Restaurează brand-urile imediat după reîncărcare pentru a preveni resetarea de către useEffect
          setTimeout(() => {
            setInstrumentForm(prev => {
              // Dacă formularul încă are brand-urile valide, le păstrăm
              const prevBrandSerialGroups = Array.isArray(prev.brandSerialGroups) ? prev.brandSerialGroups : []
              if (prev.instrument === currentInstrumentId && prevBrandSerialGroups.length > 0) {
                // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
                let hasValidBrands = false
                for (let i = 0; i < prevBrandSerialGroups.length; i++) {
                  const g = prevBrandSerialGroups[i]
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
                    hasValidBrands = true
                    break
                  }
                }
                
                if (hasValidBrands) {
                  return prev
                }
              }
              
              // Restaurează din instrumentSettings (care a fost salvat înainte)
              const savedSettings = instrumentSettings[currentInstrumentId]
              if (savedSettings && savedSettings.brandSerialGroups && savedSettings.brandSerialGroups.length > 0) {
                return {
                  ...prev,
                  instrument: currentInstrumentId,
                  brandSerialGroups: savedSettings.brandSerialGroups,
                  qty: savedSettings.qty || prev.qty || '1'
                }
              }
              
              // Dacă nu există în instrumentSettings, folosește brand-urile salvate anterior
              if (currentBrandGroups && currentBrandGroups.length > 0) {
                return {
                  ...prev,
                  instrument: currentInstrumentId,
                  brandSerialGroups: currentBrandGroups,
                  qty: currentQtyValue || prev.qty || '1'
                }
              }
              
              return prev
            })
          }, 200)
        } catch (error) {
          console.error('Error reloading items:', error)
        }
      }, 100)
      
      return // Iesim din functie pentru Vanzari
    }
    
    // Logica existentă pentru alte pipeline-uri (non-Vanzari)
    // Obține datele instrumentului - folosește serial number-ul selectat sau primul din listă
    // EXCEPTIE: Nu atribui brand/serial pentru instrumente din departamentul "Ascutit"
    let brand: string | null = null
    let serialNumber: string | null = null
    
    if (!isAscutitInstrument) {
      // Verifică dacă a fost selectat un serial number specific
      if (svc?.serialNumberId) {
        // Format: "brand::serialNumber"
        const parts = svc.serialNumberId.split('::')
        brand = parts[0] || null
        serialNumber = parts[1] || null
      } else {
        // Folosește primul serial number disponibil din primul grup
        const brandSerialGroupsArray = Array.isArray(instrumentForm?.brandSerialGroups) ? instrumentForm.brandSerialGroups : []
        const firstGroup = brandSerialGroupsArray[0] || { brand: '', serialNumbers: [{ serial: '', garantie: false }] }
        brand = (firstGroup.brand && firstGroup.brand.trim()) 
          ? firstGroup.brand.trim() 
          : null
        // Folosește primul serial number valid din primul grup
        const firstValidSerial = firstGroup.serialNumbers.find(sn => {
          const serial = typeof sn === 'string' ? sn : sn.serial || ''
          return serial && serial.trim()
        })
        serialNumber = firstValidSerial ? (typeof firstValidSerial === 'string' ? firstValidSerial : firstValidSerial.serial || '').trim() : null
      }
    }
  
    // Dacă există un item cu instrument (item_type: null), folosește name_snapshot pentru a găsi instrumentul
    const existingInstrumentName = existingInstrumentItem?.name_snapshot
    
    // Găsește instrumentul fie după ID, fie după nume
    let currentInstrument = currentInstrumentId 
      ? instruments.find(i => i.id === currentInstrumentId)
      : null
    
    // Dacă nu am găsit instrumentul după ID, încearcă după nume (de la item-ul existent)
    if (!currentInstrument && existingInstrumentName) {
      currentInstrument = instruments.find(i => i.name === existingInstrumentName)
    }
    
    // Setează pipeline_id automat dacă instrumentul are department_id = "reparatii"
    if (currentInstrument?.department_id && !pipelineId) {
      // Verifică dacă department_id este UUID sau text direct
      const instrumentDept = departments.find(d => d.id === currentInstrument.department_id)
      const deptName = instrumentDept?.name?.toLowerCase() || currentInstrument.department_id?.toLowerCase()
      
      if (deptName === 'reparatii') {
        const reparatiiPipeline = pipelinesWithIds.find(p => p.name.toLowerCase() === 'reparatii')
        if (reparatiiPipeline) {
          pipelineId = reparatiiPipeline.id
        }
      }
    }
    
    // Dacă pipeline_id încă nu e setat, verifică și serviciul pentru department_id = "reparatii"
    if (svcDef.department_id && !pipelineId) {
      const department = departments.find(d => d.id === svcDef.department_id)
      const svcDeptName = department?.name?.toLowerCase() || svcDef.department_id?.toLowerCase()
      
      if (svcDeptName === 'reparatii') {
        const reparatiiPipeline = pipelinesWithIds.find(p => p.name.toLowerCase() === 'reparatii')
        if (reparatiiPipeline) {
          pipelineId = reparatiiPipeline.id
        }
      }
    }
    
    if (existingInstrumentItem) {
      // Actualizează item-ul existent cu detaliile serviciului
      setItems(prev => {
        const updatedItems = prev.map(it => 
          it.id === existingInstrumentItem.id 
            ? {
                ...it,
                item_type: 'service',
                service_id: svcDef.id,
                instrument_id: currentInstrumentForService.id, // OBLIGATORIU
                department_id: currentInstrumentForService.department_id, // OBLIGATORIU - din instrument
                name_snapshot: svcDef.name,
                price: Number(svcDef.price),
                qty,
                discount_pct: discount,
                urgent: urgentAllServices,
                technician_id: svc.technicianId || null,
                pipeline_id: pipelineId,
                brand: brand,
                serial_number: serialNumber,
                garantie: garantie,
              } as unknown as LeadQuoteItem
            : it
        )
        // IMPORTANT: NU actualizăm snapshot-ul aici pentru că item-ul poate avea temp ID
        // Snapshot-ul va fi actualizat după reîncărcarea items-urilor din DB cu IDs reale
        return updatedItems
      })
    } else {
      // CRITIC: Salvează direct în DB în loc să folosească temp ID
      try {
        const notesData = {
          item_type: 'service',
          name: svcDef.name,
          price: Number(svcDef.price),
          discount_pct: discount,
          urgent: urgentAllServices,
          brand: brand || null,
          serial_number: serialNumber || null,
          garantie: garantie || false,
        }
        
        const { data: createdItem, error: createError } = await createTrayItem({
          tray_id: targetQuote.id,
          service_id: svcDef.id,
          instrument_id: currentInstrumentForService.id,
          department_id: currentInstrumentForService.department_id,
          technician_id: svc.technicianId || null,
          qty,
          notes: JSON.stringify(notesData),
          pipeline: pipelineId ? pipelinesWithIds.find(p => p.id === pipelineId)?.name || null : null,
        })
        
        if (createError) {
          console.error('Error creating service item:', createError)
          toast.error(`Eroare la salvare serviciu: ${createError.message || createError}`)
          return
        }
        
        if (!createdItem) {
          console.error('No item created')
          toast.error('Eroare la crearea serviciului')
          return
        }
        
        logTrayItemChange({
          trayId: targetQuote.id,
          message: `Serviciu adăugat: ${svcDef.name} (cantitate ${qty})`,
          eventType: 'tray_item_added',
          payload: {
            item_id: createdItem.id,
            item_name: svcDef.name,
            item_type: 'service',
            qty,
            price: (svcDef as any).price ?? null,
            instrument_id: currentInstrumentForService.id,
            instrument_name: currentInstrumentForService.name,
            discount_pct: discount ?? null,
            non_repairable_qty: 0,
          },
          serviceFileId: fisaId ?? undefined,
        }).catch(() => {})

        // Reîncarcă items-urile din DB pentru a obține item-ul creat cu ID real
        const newItems = await listQuoteItems(targetQuote.id, services, instruments, pipelinesWithIds)
        setItems(newItems)
        
        // Actualizează snapshot-ul cu items-urile reîncărcate
        if (newItems.length > 0 && initializeSnapshot) {
          initializeSnapshot(newItems)
        }
      } catch (error: any) {
        console.error('Error creating service item:', error)
        toast.error(`Eroare la salvare serviciu: ${error.message || error}`)
        return
      }
    }
    
    // Resetează complet formularele după adăugare
    // Resetează formularul de serviciu
    setSvc(prev => ({ 
      ...prev, 
      id: '', 
      name: '',
      price: 0,
      qty: '1',
      discount: '0', 
      urgent: false, 
      technicianId: '',
      pipelineId: '',
      serialNumberId: '',
      selectedBrands: [],
      instrumentId: ''
    }))
    setServiceSearchQuery('') // Resetează căutarea serviciului
    
    // Resetează formularul de instrument
    setInstrumentForm({
      instrument: '',
      qty: '1',
      brandSerialGroups: [],
      garantie: false
    })
    
    // Resetează instrumentSettings
    setInstrumentSettings({})
    
    setIsDirty(true)
  }, [
    selectedQuote,
    svc,
    services,
    instruments,
    departments,
    pipelinesWithIds,
    items,
    instrumentForm,
    instrumentSettings,
    urgentAllServices,
    isVanzariPipeline,
    isReceptiePipeline,
    setItems,
    setIsDirty,
    setSvc,
    setInstrumentForm,
    setInstrumentSettings,
    setServiceSearchQuery,
    // tempId eliminat - items-urile se salvează direct în DB
  ])

  // Mută onAddPart din PreturiContainer.tsx
  const onAddPart = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedQuote || !part || !part.id) return
  
    const partDef = parts.find(p => p.id === part.id)
    if (!partDef) return
    
    // Verifică dacă există un instrument selectat (obligatoriu)
    const currentInstrumentId = instrumentForm?.instrument || svc?.instrumentId
    if (!currentInstrumentId) {
      toast.error('Te rog selectează un instrument înainte de a adăuga o piesă')
      return
    }
    
    const currentInstrumentForPart = instruments.find(i => i.id === currentInstrumentId)
    if (!currentInstrumentForPart) {
      toast.error('Instrumentul selectat nu a fost găsit')
      return
    }
    
    if (!currentInstrumentForPart.department_id) {
      toast.error('Instrumentul selectat nu are departament setat. Verifică setările instrumentului.')
      return
    }
  
    // Verifică dacă instrumentul are același departament ca cele existente în tăviță (doar pentru tăvițe definite)
    const isUndefinedTray = selectedQuote && (!selectedQuote.number || selectedQuote.number === '')
    const allowAllInstruments = isVanzariPipeline && isUndefinedTray
    
    if (!allowAllInstruments && selectedQuote && selectedQuote.number && selectedQuote.number.trim() !== '') {
      // Tăviță definită - verifică departamentele
      const existingDepartments = new Set<string | null>()
      items.forEach(item => {
        if (item.instrument_id && item.instrument_id !== currentInstrumentId) {
          let itemInstrumentId: string | null = null
          if (item.item_type === 'service' && item.service_id) {
            const serviceDef = services.find(s => s.id === item.service_id)
            itemInstrumentId = serviceDef?.instrument_id || null
          } else if (item.instrument_id) {
            itemInstrumentId = item.instrument_id
          }
          
          if (itemInstrumentId) {
            const existingInstrument = instruments.find(i => i.id === itemInstrumentId)
            if (existingInstrument && existingInstrument.department_id) {
              existingDepartments.add(existingInstrument.department_id)
            }
          }
        }
      })
      
      if (existingDepartments.size > 0 && currentInstrumentForPart.department_id) {
        const allowedDepartment = Array.from(existingDepartments)[0]
        if (currentInstrumentForPart.department_id !== allowedDepartment) {
          const departmentName = departments.find(d => d.id === allowedDepartment)?.name || 'acest departament'
          const newDepartmentName = departments.find(d => d.id === currentInstrumentForPart.department_id)?.name || 'alt departament'
          toast.error(`Nu poți adăuga instrumente cu departamente diferite în aceeași tăviță. Tăvița conține deja instrumente din ${departmentName}, iar instrumentul selectat este din ${newDepartmentName}.`)
          return
        }
      }
    }
  
    // Verifică dacă instrumentul este din departamentul "Ascutit" - nu permite brand/serial
    const instrumentDeptForPart = departments.find(d => d.id === currentInstrumentForPart.department_id)
    const deptNameForPart = instrumentDeptForPart?.name?.toLowerCase() || ''
    const isAscutitInstrumentForPart = deptNameForPart.includes('ascutit') || deptNameForPart.includes('ascuțit')
    
    // Numără instrumentele unice din tavă
    const uniqueInstruments = new Set<string>()
    items.forEach(item => {
      if (item.item_type === null && item.instrument_id) {
        uniqueInstruments.add(item.instrument_id)
      } else if (item.item_type === 'service' && item.instrument_id) {
        uniqueInstruments.add(item.instrument_id)
      } else if (item.item_type === 'part' && item.instrument_id) {
        uniqueInstruments.add(item.instrument_id)
      }
    })
    
    // Dacă sunt 2+ instrumente, verifică dacă brand-ul și serial number-ul sunt selectate
    // EXCEPTIE: Nu cere brand/serial pentru instrumente din departamentul "Ascutit"
    const hasMultipleInstruments = uniqueInstruments.size > 1
    let partBrand: string | null = null
    let partSerialNumber: string | null = null
    
    if (!isAscutitInstrumentForPart) {
      if (hasMultipleInstruments) {
        // Câmpuri obligatorii pentru 2+ instrumente
        if (!part?.serialNumberId || !part.serialNumberId.includes('::')) {
          toast.error('Te rog selectează brand-ul și serial number-ul instrumentului pentru această piesă')
          return
        }
        const [b, sn] = part.serialNumberId.split('::')
        partBrand = b || null
        partSerialNumber = sn || null
      } else {
        // Un singur instrument - atribuie automat brand-ul și serial number-ul
        const brandSerialGroupsArray = Array.isArray(instrumentForm?.brandSerialGroups) ? instrumentForm.brandSerialGroups : []
        if (brandSerialGroupsArray.length > 0) {
          const firstGroup = brandSerialGroupsArray[0]
          if (firstGroup.brand && firstGroup.serialNumbers.length > 0 && firstGroup.serialNumbers[0]) {
            partBrand = firstGroup.brand
            // Extrage serial number - poate fi string sau obiect {serial, garantie}
            const firstSerial = firstGroup.serialNumbers[0]
            partSerialNumber = typeof firstSerial === 'string' ? firstSerial : (firstSerial.serial || '')
          }
        }
      }
    }
  
    const unit = part?.overridePrice && part.overridePrice !== '' ? Number(part.overridePrice) : Number(partDef.price)
    if (isNaN(unit) || unit < 0) return
  
    const qty = Math.max(1, Number(part?.qty || 1))
    const discount = Math.min(100, Math.max(0, Number(part?.discount || 0)))
  
    // CRITIC: Salvează direct în DB în loc să folosească temp ID
    // Setează automat pipeline_id la "Reparatii" pentru piese
    const reparatiiPipeline = pipelinesWithIds.find(p => p.name === 'Reparatii')
    const pipelineIdForPart = reparatiiPipeline?.id || null
    
    // Atribuie automat tehnicianul pentru piese (doar dacă NU suntem într-un pipeline departament)
    // Pentru pipeline-urile departament (Saloane, Frizerii, Horeca, Reparatii), NU se face atribuire automată
    const technicianIdForPart = isDepartmentPipeline ? null : (user?.id || null)
    
    try {
      const notesData = {
        item_type: 'part',
        name: partDef.name,
        price: unit,
        discount_pct: discount,
        urgent: urgentAllServices,
        brand: partBrand || null,
        serial_number: partSerialNumber || null,
      }
      
      const { data: createdItem, error: createError } = await createTrayItem({
        tray_id: selectedQuote.id,
        part_id: partDef.id,
        instrument_id: currentInstrumentForPart.id,
        department_id: currentInstrumentForPart.department_id,
        technician_id: technicianIdForPart,
        qty,
        notes: JSON.stringify(notesData),
        pipeline: pipelineIdForPart ? pipelinesWithIds.find(p => p.id === pipelineIdForPart)?.name || null : null,
      })
      
      if (createError) {
        console.error('Error creating part item:', createError)
        toast.error(`Eroare la salvare piesă: ${createError.message || createError}`)
        return
      }
      
      if (!createdItem) {
        console.error('No item created')
        toast.error('Eroare la crearea piesei')
        return
      }
      
      logTrayItemChange({
        trayId: selectedQuote.id,
        message: `Piesă adăugată: ${partDef.name} (cantitate ${qty})`,
        eventType: 'tray_item_added',
        payload: {
          item_id: createdItem.id,
          item_name: partDef.name,
          item_type: 'part',
          qty,
          price: (partDef as any).price ?? null,
          instrument_id: currentInstrumentForPart.id,
          instrument_name: currentInstrumentForPart.name,
          discount_pct: discount ?? null,
          non_repairable_qty: 0,
        },
        serviceFileId: fisaId ?? undefined,
      }).catch(() => {})

      // Reîncarcă items-urile din DB pentru a obține item-ul creat cu ID real
      const newItems = await listQuoteItems(selectedQuote.id, services, instruments, pipelinesWithIds)
      setItems(newItems)
      
      // Actualizează snapshot-ul cu items-urile reîncărcate
      if (newItems.length > 0 && initializeSnapshot) {
        initializeSnapshot(newItems)
      }
    } catch (error: any) {
      console.error('Error creating part item:', error)
      toast.error(`Eroare la salvare piesă: ${error.message || error}`)
      return
    }
  
    // Resetează complet formularele după adăugare
    // Resetează formularul de piesă
    setPart({ 
      id: '', 
      name: '',
      price: 0,
      overridePrice: '', 
      qty: '1', 
      discount: '0', 
      urgent: false, 
      serialNumberId: '' 
    })
    setPartSearchQuery('') // Resetează căutarea piesei
    
    // Resetează formularul de instrument
    setInstrumentForm({
      instrument: '',
      qty: '1',
      brandSerialGroups: [],
      garantie: false
    })
    
    // Resetează formularul de serviciu
    setSvc(prev => ({
      ...prev,
      id: '',
      name: '',
      price: 0,
      qty: '1',
      discount: '0',
      urgent: false,
      technicianId: '',
      pipelineId: '',
      serialNumberId: '',
      selectedBrands: [],
      instrumentId: ''
    }))
    setServiceSearchQuery('')
    
    // Resetează instrumentSettings
    setInstrumentSettings({})
    
    setIsDirty(true)
  }, [
    selectedQuote,
    part,
    parts,
    services,
    instruments,
    departments,
    pipelinesWithIds,
    items,
    instrumentForm,
    svc,
    urgentAllServices,
    isVanzariPipeline,
    isDepartmentPipeline,
    user,
    setItems,
    setIsDirty,
    setPart,
    setPartSearchQuery,
    setInstrumentForm,
    setSvc,
    setServiceSearchQuery,
    setInstrumentSettings,
    // tempId eliminat - items-urile se salvează direct în DB
  ])

  return {
    onAddService,
    onAddPart,
  }
}
