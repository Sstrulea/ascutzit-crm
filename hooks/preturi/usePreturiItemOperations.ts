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
    
      if (isVanzariPipeline) {
        const finalQty = qty
      
      // Verifică dacă există deja un serviciu pentru acest instrument
      // Dacă nu, verifică dacă există un item goal (item_type: null) pentru a-l actualiza
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
      
      try {
        const notesData = {
          item_type: 'service',
          name: svcDef.name,
          price: Number(svcDef.price),
          discount_pct: discount,
          urgent: urgentAllServices,
          brand: null,
          serial_number: null,
          garantie: garantie || false,
        }
        
        let createdItem: any = null
        
        // Dacă există deja un serviciu pentru acest instrument, actualizează-l
        if (existingServiceItem && existingServiceItem.id) {
          // IMPORTANT: Păstrăm technician_id de la item-ul vechi dacă nu e specificat unul nou
          // Astfel tehnicianul nu dispare de pe dashboard când se înlocuiește instrumentul
          const technicianIdToUse = svc.technicianId || (existingServiceItem as any).technician_id || null
          
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
        } else {
          const { data: newItem, error: createError } = await createTrayItem({
            tray_id: targetQuote.id,
            service_id: svcDef.id,
            instrument_id: currentInstrumentForService.id,
            department_id: currentInstrumentForService.department_id,
            technician_id: svc.technicianId || null,
            qty: finalQty,
            notes: JSON.stringify(notesData),
            pipeline: pipelineId ? pipelinesWithIds.find(p => p.id === pipelineId)?.name || null : null,
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
        
        const serviceItem: LeadQuoteItem = {
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
          brand: null,
          serial_number: null,
          garantie: garantie,
        } as unknown as LeadQuoteItem
        
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
      
      setSvc(prev => ({ 
        ...prev, 
        id: '', 
        qty: String(instrumentForm.qty || '1'),
        discount: '0', 
        urgent: false, 
        technicianId: '',
        pipelineId: '',
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
          
          if (newItems.length > 0 && initializeSnapshot) {
            initializeSnapshot(newItems)
          }
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
      instrumentId: ''
    }))
    setServiceSearchQuery('')
    
    setInstrumentForm({
      instrument: '',
      qty: '1',
      garantie: false
    })
    
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
      garantie: false
    })
    
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
