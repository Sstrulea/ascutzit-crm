/**
 * Hook pentru logica de business a componentei Preturi
 * 
 * Acest hook combină toate hook-urile specializate pentru operațiile cu Preturi
 */

import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { deleteTrayItem } from '@/lib/supabase/serviceFileOperations'
import { logTrayItemChange } from '@/lib/supabase/leadOperations'
import { createQuoteForLead } from '@/lib/utils/preturi-helpers'
import type { LeadQuote, LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Part } from '@/lib/supabase/partOperations'
import type { Lead } from '@/lib/types/database'

// Importă hook-urile specializate
import { usePreturiTrayOperations } from './preturi/usePreturiTrayOperations'
import { usePreturiItemOperations } from './preturi/usePreturiItemOperations'
import { usePreturiImageOperations } from './preturi/usePreturiImageOperations'
import { usePreturiFormOperations } from './preturi/usePreturiFormOperations'
import { usePreturiSaveOperations } from './preturi/usePreturiSaveOperations'
import { usePreturiCalculations } from './preturi/usePreturiCalculations'
import { usePreturiDeliveryOperations } from './preturi/usePreturiDeliveryOperations'

const supabase = supabaseBrowser()

interface UsePreturiBusinessProps {
  leadId: string
  fisaId?: string | null
  serviceFileNumber?: string | number | null
  selectedQuoteId: string | null
  selectedQuote: LeadQuote | null
  quotes: LeadQuote[]
  items: LeadQuoteItem[]
  services: Service[]
  parts: Part[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null }>
  departments: Array<{ id: string; name: string }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  user: { id: string } | null
  isDepartmentPipeline: boolean
  isVanzariPipeline: boolean
  isReceptiePipeline: boolean
  /** ID departament pentru view-ul filtrat (ex. Saloane); la salvare se trimite la V4 ca să nu șteargă itemii altor departamente. */
  filterDepartmentId?: string | null
  subscriptionType: 'services' | 'parts' | 'both' | ''
  trayImages: any[]
  instrumentForm: any
  svc: any
  part: any
  instrumentSettings: any
  urgentAllServices: boolean
  
  // Additional state for save operations
  trayDetails?: string
  paymentCash: boolean
  paymentCard: boolean
  officeDirect: boolean
  curierTrimis: boolean
  curierScheduledAt: string | null
  retur: boolean
  isVanzator: boolean
  isCurierPipeline: boolean
  vanzariPipelineId: string | null
  vanzariStages: Array<{ id: string; name: string }>
  lead: Lead | null
  isCash: boolean
  isCard: boolean
  subtotal: number
  totalDiscount: number
  urgentAmount: number
  total: number
  
  // State setters
  setItems: React.Dispatch<React.SetStateAction<LeadQuoteItem[]>>
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>
  setSvc: React.Dispatch<React.SetStateAction<any>>
  setInstrumentForm: React.Dispatch<React.SetStateAction<any>>
  setPart: React.Dispatch<React.SetStateAction<any>>
  setServiceSearchQuery: React.Dispatch<React.SetStateAction<string>>
  setServiceSearchFocused: React.Dispatch<React.SetStateAction<boolean>>
  setPartSearchQuery: React.Dispatch<React.SetStateAction<string>>
  setPartSearchFocused: React.Dispatch<React.SetStateAction<boolean>>
  setInstrumentSettings: React.Dispatch<React.SetStateAction<any>>
  setTrayImages: React.Dispatch<React.SetStateAction<any[]>>
  setAssignedImageId: React.Dispatch<React.SetStateAction<string | null>>
  setUploadingImage: React.Dispatch<React.SetStateAction<boolean>>
  setAllSheetsTotal: React.Dispatch<React.SetStateAction<number>>
  setUrgentAllServices: React.Dispatch<React.SetStateAction<boolean>>
  setPipelines: React.Dispatch<React.SetStateAction<string[]>>
  setPipelinesWithIds: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string }>>>
  setDepartments: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string }>>>
  setPipeLoading: React.Dispatch<React.SetStateAction<boolean>>
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  setQuotes: React.Dispatch<React.SetStateAction<LeadQuote[]>>
  setSelectedQuoteId: React.Dispatch<React.SetStateAction<string | null>>
  setCreatingTray: React.Dispatch<React.SetStateAction<boolean>>
  setUpdatingTray: React.Dispatch<React.SetStateAction<boolean>>
  setDeletingTray: React.Dispatch<React.SetStateAction<boolean>>
  setMovingInstrument: React.Dispatch<React.SetStateAction<boolean>>
  setSendingTrays: React.Dispatch<React.SetStateAction<boolean>>
  setShowCreateTrayDialog: React.Dispatch<React.SetStateAction<boolean>>
  setShowEditTrayDialog: React.Dispatch<React.SetStateAction<boolean>>
  setShowMoveInstrumentDialog: React.Dispatch<React.SetStateAction<boolean>>
  setShowSendConfirmation: React.Dispatch<React.SetStateAction<boolean>>
  setShowDeleteTrayConfirmation: React.Dispatch<React.SetStateAction<boolean>>
  setTrayToDelete: React.Dispatch<React.SetStateAction<string | null>>
  setTraysAlreadyInDepartments: React.Dispatch<React.SetStateAction<boolean>>
  setNewTrayNumber: React.Dispatch<React.SetStateAction<string>>
  setEditingTrayNumber: React.Dispatch<React.SetStateAction<string>>
  setInstrumentToMove: React.Dispatch<React.SetStateAction<{ 
    instrument: { id: string; name: string }
    items: LeadQuoteItem[] 
  } | null>>
  setTargetTrayId: React.Dispatch<React.SetStateAction<string>>
  setSaving: React.Dispatch<React.SetStateAction<boolean>>
  setOfficeDirect: React.Dispatch<React.SetStateAction<boolean>>
  setCurierTrimis: React.Dispatch<React.SetStateAction<boolean>>
  setCurierScheduledAt: React.Dispatch<React.SetStateAction<string | null>>
  setRetur: React.Dispatch<React.SetStateAction<boolean>>
  setNuRaspundeCallbackAt: React.Dispatch<React.SetStateAction<string | null>>
  setIsServiceFileLocked: React.Dispatch<React.SetStateAction<boolean>>
  setServiceFileStatus: (value: string | null) => void
  
  // Global discount
  globalDiscountPct: number
  
  // State values
  newTrayNumber: string
  editingTrayNumber: string
  trayToDelete: string | null
  instrumentToMove: { 
    instrument: { id: string; name: string }
    items: LeadQuoteItem[] 
  } | null
  targetTrayId: string
  
  // Callbacks
  recalcAllSheetsTotal: (quotes: LeadQuote[]) => Promise<void>
  populateInstrumentFormFromItems: (items: LeadQuoteItem[], instrumentId: string | null, forceReload: boolean) => void
  /** Apelat după ștergere reușită a unei tăvițe (ex. refresh Kanban). */
  onAfterDeleteTray?: () => void
}

export function usePreturiBusiness({
  leadId,
  fisaId,
  serviceFileNumber,
  selectedQuoteId,
  selectedQuote,
  quotes,
  items,
  services,
  parts,
  instruments,
  departments,
  pipelinesWithIds,
  user,
  isDepartmentPipeline,
  isVanzariPipeline,
  isReceptiePipeline,
  filterDepartmentId,
  subscriptionType,
  trayImages,
  instrumentForm,
  svc,
  part,
  instrumentSettings,
  urgentAllServices,
  trayDetails,
  paymentCash,
  paymentCard,
  officeDirect,
  curierTrimis,
  curierScheduledAt,
  retur,
  isVanzator,
  isCurierPipeline,
  vanzariPipelineId,
  vanzariStages,
  lead,
  isCash,
  isCard,
  subtotal,
  totalDiscount,
  urgentAmount,
  total,
  setItems,
  setIsDirty,
  setSvc,
  setInstrumentForm,
  setPart,
  setServiceSearchQuery,
  setServiceSearchFocused,
  setPartSearchQuery,
  setPartSearchFocused,
  setInstrumentSettings,
  setTrayImages,
  setAssignedImageId,
  setUploadingImage,
  setAllSheetsTotal,
  setUrgentAllServices,
  setPipelines,
  setPipelinesWithIds,
  setDepartments,
  setPipeLoading,
  setLoading,
  setQuotes,
  setSelectedQuoteId,
  setCreatingTray,
  setUpdatingTray,
  setDeletingTray,
  setMovingInstrument,
  setSendingTrays,
  setShowCreateTrayDialog,
  setShowEditTrayDialog,
  setShowMoveInstrumentDialog,
  setShowSendConfirmation,
  setShowDeleteTrayConfirmation,
  setTrayToDelete,
  setTraysAlreadyInDepartments,
  setNewTrayNumber,
  setEditingTrayNumber,
  setInstrumentToMove,
  setTargetTrayId,
  setOfficeDirect,
  setCurierTrimis,
  setCurierScheduledAt,
  setRetur,
  setNuRaspundeCallbackAt,
  setIsServiceFileLocked,
  setServiceFileStatus,
  globalDiscountPct,
  newTrayNumber,
  editingTrayNumber,
  trayToDelete,
  instrumentToMove,
  targetTrayId,
  recalcAllSheetsTotal,
  populateInstrumentFormFromItems,
  setSaving,
  onAfterDeleteTray,
}: UsePreturiBusinessProps) {
  
  // Combină hook-urile specializate
  const calculations = usePreturiCalculations({
    services,
    instruments,
    pipelinesWithIds,
    subscriptionType,
    setAllSheetsTotal,
  })
  
  const imageOperations = usePreturiImageOperations({
    selectedQuoteId,
    trayImages,
    setTrayImages,
    setUploadingImage,
    allowUnlimitedImageSize: isReceptiePipeline,
    serviceFileId: fisaId ?? null,
  })
  
  const formOperations = usePreturiFormOperations({
    instrumentForm,
    svc,
    part,
    items,
    instrumentSettings,
    services,
    instruments,
    departments,
    setInstrumentForm,
    setSvc,
    setPart,
    setServiceSearchQuery,
    setServiceSearchFocused,
    setPartSearchQuery,
    setPartSearchFocused,
    setIsDirty,
    setInstrumentSettings,
  })
  
  const deliveryOperations = usePreturiDeliveryOperations({
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
  })
  
  // Creează o funcție de inițializare snapshot care va fi folosită de itemOperations
  // Această funcție va fi actualizată când saveOperations este creat
  const initializeSnapshotRef = useRef<((items: LeadQuoteItem[]) => void) | null>(null)
  
  const itemOperations = usePreturiItemOperations({
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
    // tempId eliminat - items-urile se salvează direct în DB, nu mai folosim temp IDs
    initializeSnapshot: (items) => {
      if (initializeSnapshotRef.current) {
        initializeSnapshotRef.current(items)
      }
    },
  })
  
  const saveOperations = usePreturiSaveOperations({
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
    vanzariPipelineId,
    vanzariStages,
    lead,
    services,
    instruments,
    departments,
    pipelinesWithIds,
    filterDepartmentId,
    subtotal,
    totalDiscount,
    urgentAmount,
    total,
    setSaving,
    setQuotes,
    setSelectedQuoteId,
    setItems,
    setIsDirty,
    setSvc,
    setInstrumentForm,
    setIsServiceFileLocked: setIsServiceFileLocked,
    setServiceFileStatus,
    recalcAllSheetsTotal,
    populateInstrumentFormFromItems: formOperations.populateInstrumentFormFromItems,
  })
  
  // Actualizează ref-ul cu funcția de inițializare snapshot
  initializeSnapshotRef.current = saveOperations.initializeSnapshot
  
  const trayOperations = usePreturiTrayOperations({
    leadId,
    fisaId,
    selectedQuoteId,
    selectedQuote,
    quotes,
    services,
    instruments,
    pipelinesWithIds,
    isReceptiePipeline,
    trayDetails,
    globalDiscountPct,
    setQuotes,
    setSelectedQuoteId,
    setItems,
    setLoading,
    setCreatingTray,
    setUpdatingTray,
    setDeletingTray,
    setMovingInstrument,
    setSendingTrays,
    setShowCreateTrayDialog,
    setShowEditTrayDialog,
    setShowMoveInstrumentDialog,
    setShowSendConfirmation,
    setShowDeleteTrayConfirmation,
    setTrayToDelete,
    setTraysAlreadyInDepartments,
    setNewTrayNumber,
    setEditingTrayNumber,
    setInstrumentToMove,
    setTargetTrayId,
    newTrayNumber,
    editingTrayNumber,
    trayToDelete,
    instrumentToMove,
    targetTrayId,
    recalcAllSheetsTotal,
    onAfterDeleteTray,
  })
  // tempId eliminat - items-urile se salvează direct în DB, nu mai folosim temp IDs

  // Funcție pentru actualizarea unui item (inclusiv salvare în DB)
  const onUpdateItem = useCallback(async (id: string, patch: Partial<LeadQuoteItem>) => {
    // Actualizează state-ul local imediat pentru UI responsiv
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } as any : it)))
    setIsDirty(true)
    
    // Salvează în baza de date
    // Găsește item-ul curent pentru a construi notes JSON
    const currentItem = items.find(it => it.id === id)
    if (currentItem && id) {
      try {
        // Construiește notes JSON cu toate datele item-ului
        const updatedItem = { ...currentItem, ...patch }
        const notesData = {
          item_type: updatedItem.item_type || currentItem.item_type,
          name: updatedItem.name_snapshot || currentItem.name_snapshot,
          price: updatedItem.price ?? currentItem.price,
          discount_pct: updatedItem.discount_pct ?? currentItem.discount_pct ?? 0,
          urgent: updatedItem.urgent ?? currentItem.urgent ?? false,
          brand: updatedItem.brand ?? currentItem.brand ?? null,
          serial_number: updatedItem.serial_number ?? currentItem.serial_number ?? null,
          garantie: updatedItem.garantie ?? currentItem.garantie ?? false,
          non_repairable_qty: Math.min(
            updatedItem.qty ?? currentItem.qty ?? 1,
            Math.max(0, updatedItem.non_repairable_qty ?? currentItem.non_repairable_qty ?? 0)
          ),
        }
        
        // Construiește update object pentru DB (tray_items – sursă unică pentru cifre)
        const dbUpdate: any = {
          notes: JSON.stringify(notesData),
        }
        
        if (patch.qty !== undefined) dbUpdate.qty = patch.qty
        // Sincronizare nr. nereparate: mereu scriem în coloana unrepaired_qty ca fișa și tăvița să coincidă
        const unrepaired = Math.min(updatedItem.qty ?? currentItem.qty ?? 1, Math.max(0, notesData.non_repairable_qty))
        dbUpdate.unrepaired_qty = unrepaired
        // technician_id a fost eliminat de pe tray_items; atribuirea e la nivel de tăviță (trays.technician_id)
        
        const { updateTrayItem } = await import('@/lib/supabase/serviceFileOperations')
        const { error } = await updateTrayItem(id, dbUpdate)
        
        if (error) {
          console.error('[onUpdateItem] Eroare la salvarea în DB:', error)
        } else {
          const name = currentItem.name_snapshot || (currentItem as any).name || 'Item'
          const parts: string[] = []
          if (patch.qty !== undefined) parts.push(`cantitate ${currentItem.qty} → ${patch.qty}`)
          if (patch.discount_pct !== undefined) parts.push(`discount ${(currentItem as any).discount_pct ?? 0}% → ${patch.discount_pct}%`)
          if (patch.urgent !== undefined) parts.push(`urgent ${String((currentItem as any).urgent ?? false)} → ${String(patch.urgent)}`)
          const msg = parts.length ? `Detalii actualizate: ${name} (${parts.join(', ')})` : `Detalii actualizate: ${name}`
          if (selectedQuoteId) {
            const qtyAfter = patch.qty !== undefined ? patch.qty : currentItem.qty
            const priceAfter = (patch as any).price !== undefined ? (patch as any).price : (currentItem as any).price
            const inst = (currentItem as any).instrument_id && instruments.find((i: { id: string }) => i.id === (currentItem as any).instrument_id)
            logTrayItemChange({
              trayId: selectedQuoteId,
              message: msg,
              eventType: 'tray_item_updated',
              payload: {
                item_id: id,
                item_name: name,
                patch,
                qty: qtyAfter,
                price: priceAfter != null ? priceAfter : null,
                discount_pct: (patch.discount_pct !== undefined ? patch.discount_pct : (currentItem as any).discount_pct) ?? null,
                instrument_id: (currentItem as any).instrument_id ?? null,
                instrument_name: inst?.name ?? null,
                non_repairable_qty: (patch.non_repairable_qty !== undefined ? patch.non_repairable_qty : (currentItem as any).non_repairable_qty) ?? null,
              },
              serviceFileId: fisaId ?? undefined,
            }).catch(() => {})
          }
        }
      } catch (error) {
        console.error('[onUpdateItem] Eroare la salvarea în DB:', error)
      }
    }
  }, [setItems, setIsDirty, items, selectedQuoteId, fisaId])

  // Funcție pentru ștergerea unui item
  const onDelete = useCallback(async (id: string) => {
    const itemToDelete = items.find(it => it.id === id)
    if (!itemToDelete) return
    
    const currentInstrumentId = instrumentForm?.instrument || svc?.instrumentId
    if (currentInstrumentId && itemToDelete.item_type === 'service') {
      const brandSerialGroups = Array.isArray(instrumentForm.brandSerialGroups) ? instrumentForm.brandSerialGroups : []
      
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      let hasBrandsInForm = false
      if (Array.isArray(brandSerialGroups)) {
        for (let i = 0; i < brandSerialGroups.length; i++) {
          const g = brandSerialGroups[i]
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
            hasBrandsInForm = true
            break
          }
        }
      }
      
      if (hasBrandsInForm) {
        setInstrumentSettings((prev: any) => ({
          ...prev,
          [currentInstrumentId]: {
            qty: instrumentForm.qty || '1',
            brandSerialGroups: instrumentForm.brandSerialGroups
          }
        }))
      }
    }
    
    const itemName = itemToDelete.name_snapshot || (itemToDelete as any).service?.name || (itemToDelete as any).name || 'Item'
    const itemType = itemToDelete.item_type ?? (itemToDelete.part_id ? 'part' : 'service')
    const inst = itemToDelete.instrument_id && instruments.find((i: { id: string }) => i.id === itemToDelete.instrument_id)
    const itemService = (itemToDelete as any).service || (itemToDelete.service_id && services.find((s: { id: string }) => s.id === itemToDelete.service_id))
    const pt = itemToDelete.part_id && parts.find((p: { id: string }) => p.id === itemToDelete.part_id)
    const payload: Record<string, any> = {
      item_id: id,
      item_name: itemName,
      item_type: itemType,
      qty: itemToDelete.qty,
      price: (itemToDelete as any).price,
      discount_pct: (itemToDelete as any).discount_pct,
      urgent: (itemToDelete as any).urgent,
      brand: (itemToDelete as any).brand ?? null,
      serial_number: (itemToDelete as any).serial_number ?? null,
      garantie: (itemToDelete as any).garantie ?? false,
      non_repairable_qty: (itemToDelete as any).non_repairable_qty ?? null,
      instrument_id: inst?.id ?? null,
      instrument_name: inst?.name ?? null,
    }
    if (inst) payload.instrument = { id: inst.id, name: inst.name }
    if (itemService) payload.service = { id: itemService.id, name: itemService.name }
    if (pt) payload.part = { id: pt.id, name: pt.name }
    if (selectedQuoteId) {
      logTrayItemChange({
        trayId: selectedQuoteId,
        message: `Item șters: ${itemName}`,
        eventType: 'tray_item_deleted',
        payload,
        serviceFileId: fisaId ?? undefined,
      }).catch(() => {})
    }

    if (id && !String(id).startsWith('temp-') && !String(id).startsWith('local_')) {
      try {
        const { success, error } = await deleteTrayItem(id)
        if (!success || error) {
          console.error('Error deleting tray item from DB:', error)
          toast.error('Eroare la ștergerea serviciului din baza de date')
          return
        }
      } catch (error: any) {
        console.error('Error deleting tray item:', error)
        toast.error('Eroare la ștergerea serviciului')
        return
      }
    }
    
    setItems(prev => {
      const newItems = prev.filter(it => it.id !== id)
      
      if (itemToDelete.item_type === null) {
        setSvc((p: any) => ({ ...p, instrumentId: '' }))
        setInstrumentForm((prev: any) => ({ 
          ...prev, 
          instrument: '',
          brandSerialGroups: [{ brand: '', serialNumbers: [{ serial: '', garantie: false }], qty: '1' }]
        }))
      }
      
      return newItems
    })
    
    setIsDirty(true)
  }, [items, instrumentForm, svc, setItems, setIsDirty, setSvc, setInstrumentForm, setInstrumentSettings, selectedQuoteId, fisaId, instruments, services, parts])

  // Funcție pentru mutarea unui instrument între tăvițe
  const handleMoveInstrument = useCallback(async (targetTrayId: string, instrumentGroup: { instrument: { id: string; name: string }; items: LeadQuoteItem[] }, newTrayNumber?: string) => {
    if (!fisaId) {
      toast.error('Fișa de serviciu nu este setată')
      return
    }

    let finalTrayId = targetTrayId

    if (targetTrayId === 'new' && newTrayNumber) {
      try {
        const created = await createQuoteForLead(leadId, newTrayNumber.trim(), fisaId)
        finalTrayId = created.id
      } catch (error: any) {
        console.error('Error creating tray:', error)
        toast.error('Eroare la crearea tăviței: ' + (error?.message || 'Eroare necunoscută'))
        return
      }
    }

    toast.success(`Instrumentul "${instrumentGroup.instrument.name}" a fost mutat cu succes`)
  }, [leadId, fisaId])

  // Funcții pentru actualizarea checkbox-urilor lead
  const handleNoDealChange = useCallback(async (checked: boolean) => {
    try {
      const { error } = await (supabase
        .from('leads') as any)
        .update({ no_deal: checked })
        .eq('id', leadId)

      if (error) throw error
    } catch (error: any) {
      console.error('Error updating no_deal:', error)
      toast.error('Eroare la actualizarea câmpului No Deal')
    }
  }, [leadId])

  const handleNuRaspundeChange = useCallback(async (checked: boolean, callbackTime?: string) => {
    try {
      const callbackAt = checked ? (callbackTime || null) : null
      // Actualizează flag-ul și ora de callback în tabela leads (pentru afișare pe card)
      const { error } = await (supabase
        .from('leads') as any)
        .update({ nu_raspunde: checked, nu_raspunde_callback_at: callbackAt })
        .eq('id', leadId)

      if (error) throw error
      
      if (setNuRaspundeCallbackAt) {
        setNuRaspundeCallbackAt(callbackAt)
      }
      
      if (checked && callbackTime) {
        const d = new Date(callbackTime)
        const formattedTime = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
        toast.success(`Nu Răspunde - Callback programat la ${formattedTime}`)
      }
      
      if (fisaId) {
        const { updateServiceFileWithHistory } = await import('@/lib/supabase/serviceFileOperations')
        await updateServiceFileWithHistory(fisaId, { nu_raspunde_callback_at: callbackAt })
      }
    } catch (error: any) {
      console.error('Error updating nu_raspunde:', error)
      toast.error('Eroare la actualizarea câmpului Nu Raspunde')
    }
  }, [leadId, fisaId, setNuRaspundeCallbackAt])

  const handleCallBackChange = useCallback(async (checked: boolean) => {
    try {
      const { error } = await (supabase
        .from('leads') as any)
        .update({ call_back: checked })
        .eq('id', leadId)

      if (error) throw error
    } catch (error: any) {
      console.error('Error updating call_back:', error)
      toast.error('Eroare la actualizarea câmpului Call Back')
    }
  }, [leadId])

  // TODO: Adaugă aici toate celelalte funcții din PreturiContainer.tsx:
  // - saveAllAndLog
  // - handleCreateTray
  // - handleUpdateTray
  // - handleDeleteTray
  // - onAddService
  // - onAddPart
  // - handleDeliveryCheckboxChange
  // - handleTrayImageUpload
  // - handleTrayImageDelete
  // - handleDownloadAllImages
  // - sendAllTraysToPipeline
  // - onAddBrandSerialGroup
  // - onRemoveBrandSerialGroup
  // - onUpdateBrand
  // - onUpdateSerialNumber
  // - onUpdateSerialGarantie
  // - handleResetServiceForm
  // - handleResetPartForm
  // - populateInstrumentFormFromItems
  // - recalcAllSheetsTotal
  // - onEditTray
  // - onChangeSheet
  // - onAddSheet
  // - computeItemsTotal
  // - validateTraysBeforeSend
  // - checkTraysInDepartments
  // - onRowClick
  // - onBrandToggle
  // - onInstrumentChange
  // - onQtyChange
  // - onServiceSelect
  // - onServiceDoubleClick
  // - onPartSelect
  // - onPartDoubleClick
  // - handleUrgentChange
  // etc.

  // Wrapper pentru handleTrayImageUpload (adaptează semnătura pentru PreturiOrchestrator)
  const handleTrayImageUploadWrapper = useCallback(async (file: File) => {
    // Creează un event sintetic pentru handleTrayImageUpload
    const syntheticEvent = {
      target: {
        files: [file],
        value: '',
      },
    } as unknown as React.ChangeEvent<HTMLInputElement>
    await imageOperations.handleTrayImageUpload(syntheticEvent)
  }, [imageOperations.handleTrayImageUpload])
  
  // Wrapper pentru handleTrayImageDelete (adaptează semnătura pentru PreturiOrchestrator)
  const handleTrayImageDeleteWrapper = useCallback(async (imageId: string) => {
    // TODO: Obține filePath din trayImages sau din DB
    const image = trayImages.find(img => img.id === imageId)
    if (image) {
      await imageOperations.handleTrayImageDelete(imageId, image.path || image.file_path || '')
    }
  }, [imageOperations.handleTrayImageDelete, trayImages])

  /** Setează imaginea reprezentativă pentru tăvița selectată (Recepție / departamente) */
  const handleAssignTrayImage = useCallback(async (imageId: string | null) => {
    if (!selectedQuoteId) return
    const { setTrayAssignedImage } = await import('@/lib/supabase/imageOperations')
    const { error } = await setTrayAssignedImage(selectedQuoteId, imageId)
    if (error) {
      const { toast } = await import('sonner')
      toast.error(error?.message ?? 'Nu s-a putut seta imaginea reprezentativă.')
      return
    }
    setAssignedImageId(imageId)
  }, [selectedQuoteId, setAssignedImageId])
  
  
  const onAddService = useCallback(async () => {
    toast.info('Funcția onAddService va fi implementată')
  }, [])
  
  const onAddPart = useCallback(async () => {
    toast.info('Funcția onAddPart va fi implementată')
  }, [])
  
  const handleCreateTray = useCallback(async () => {
    toast.info('Funcția handleCreateTray va fi implementată')
  }, [])
  
  const handleUpdateTray = useCallback(async () => {
    toast.info('Funcția handleUpdateTray va fi implementată')
  }, [])
  
  const handleDeleteTray = useCallback(async () => {
    toast.info('Funcția handleDeleteTray va fi implementată')
  }, [])
  
  const sendAllTraysToPipeline = useCallback(async () => {
    toast.info('Funcția sendAllTraysToPipeline va fi implementată')
  }, [])
  
  const handleUrgentChange = useCallback(async (checked: boolean) => {
    setUrgentAllServices(checked)
    setIsDirty(true)
  }, [setUrgentAllServices, setIsDirty])
  
  const onInstrumentChange = useCallback((instrumentId: string) => {
    // IMPORTANT: Prioritizează instrumentSettings peste items
    // instrumentSettings conține toate serial numbers-urile originale, nu doar cele folosite
    const savedSettings = instrumentSettings[instrumentId]
    const hasSavedBrands = savedSettings && savedSettings.brandSerialGroups && savedSettings.brandSerialGroups.length > 0
    
    if (hasSavedBrands) {
      // Folosește brandSerialGroups din instrumentSettings (conține TOATE serial numbers-urile)
      const brandSerialGroups = savedSettings.brandSerialGroups.map((group: any) => ({
        brand: group.brand || '',
        serialNumbers: Array.isArray(group.serialNumbers)
          ? group.serialNumbers.map((sn: any) => 
              typeof sn === 'string' 
                ? { serial: sn, garantie: group.garantie || false }
                : { serial: sn?.serial || '', garantie: sn?.garantie || group.garantie || false }
            )
          : [],
        qty: group.qty || String(Array.isArray(group.serialNumbers) ? group.serialNumbers.length : 1)
      }))
      
      // Calculează cantitatea totală din serial numbers
      const totalQty = brandSerialGroups.reduce((sum: number, group: any) => {
        const serialCount = Array.isArray(group.serialNumbers) ? group.serialNumbers.length : 0
        return sum + (serialCount > 0 ? serialCount : Number(group.qty || 1))
      }, 0)
      
      // Populează formularul cu datele din instrumentSettings
      setInstrumentForm({
        instrument: instrumentId,
        qty: String(totalQty || savedSettings.qty || 1),
        brandSerialGroups: brandSerialGroups
      })
    } else {
      // Nu există în instrumentSettings - verifică items
      const existingItem = items.find((item: any) => 
        item.instrument_id === instrumentId && item.item_type === null
      )
      
      if (existingItem) {
        // Există deja un item cu acest instrument - populează datele
        const brandGroups = (existingItem as any).brand_groups || []
        
        // Transformă brand_groups în formatul pentru formular
        const brandSerialGroups = brandGroups.length > 0
          ? brandGroups.map((bg: any) => ({
              brand: bg.brand || '',
              serialNumbers: Array.isArray(bg.serialNumbers)
                ? bg.serialNumbers.map((sn: any) => 
                    typeof sn === 'string' 
                      ? { serial: sn, garantie: bg.garantie || false }
                      : { serial: sn?.serial || '', garantie: sn?.garantie || bg.garantie || false }
                  )
                : [],
              qty: String(existingItem.qty || 1)
            }))
          : existingItem.brand || existingItem.serial_number
            ? [{
                brand: existingItem.brand || '',
                serialNumbers: existingItem.serial_number 
                  ? [{ serial: existingItem.serial_number, garantie: existingItem.garantie || false }]
                  : [],
                qty: String(existingItem.qty || 1)
              }]
            : [{ brand: '', serialNumbers: [{ serial: '', garantie: false }], qty: String(existingItem.qty || 1) }]
        
        // Calculează cantitatea totală din serial numbers
        const totalQty = brandSerialGroups.reduce((sum: number, group: any) => {
          const serialCount = Array.isArray(group.serialNumbers) ? group.serialNumbers.length : 0
          return sum + (serialCount > 0 ? serialCount : Number(group.qty || 1))
        }, 0)
        
        // Populează formularul cu datele din item-ul existent
        setInstrumentForm({
          instrument: instrumentId,
          qty: String(totalQty || existingItem.qty || 1),
          brandSerialGroups: brandSerialGroups
        })
      } else {
        // Nu există item - folosește logica normală de populare
        // IMPORTANT: Verifică dacă există setări salvate pentru noul instrument
        const newInstrumentSettings = instrumentSettings[instrumentId]
        const shouldResetBrands = instrumentForm.instrument !== instrumentId
        const preservedQty = shouldResetBrands 
          ? (newInstrumentSettings?.qty || '1')  // Folosește cantitatea din setări sau 1
          : (instrumentForm.qty || '1')  // Păstrează cantitatea existentă dacă instrumentul nu s-a schimbat
        
        setInstrumentForm((prev: any) => ({
          ...prev,
          instrument: instrumentId,
          // Pentru instrumente noi din Reparații, inițializează un grup brand/serial gol
          brandSerialGroups: shouldResetBrands
            ? [{ brand: '', serialNumbers: [{ serial: '', garantie: false }], qty: '1' }]
            : prev?.brandSerialGroups || [],
          // Folosește cantitatea din setări sau păstrează cantitatea existentă
          qty: preservedQty
        }))
        
        // Populează brand-urile din items existente (dacă există în servicii)
        formOperations.populateInstrumentFormFromItems(items, instrumentId, false)
      }
    }
    
    // Actualizează și svc.instrumentId pentru sincronizare
    setSvc((prev: any) => ({ ...prev, instrumentId }))
    setIsDirty(true)
  }, [items, formOperations.populateInstrumentFormFromItems, setSvc, setIsDirty, setInstrumentForm])
  
  const onQtyChange = useCallback((qty: string) => {
    setInstrumentForm((prev: any) => ({ ...prev, qty }))
    // Actualizează și în instrumentSettings
    const currentInstrumentId = instrumentForm.instrument
    if (currentInstrumentId) {
      setInstrumentSettings((prev: any) => ({
        ...prev,
        [currentInstrumentId]: {
          ...prev[currentInstrumentId],
          qty,
        }
      }))
    }
    setIsDirty(true)
  }, [instrumentForm.instrument, setInstrumentForm, setInstrumentSettings, setIsDirty])
  
  const onServiceSelect = useCallback((serviceId: string, serviceName: string) => {
    if (!serviceId) {
      setSvc((prev: any) => ({ ...prev, id: '', name: '' }))
      setServiceSearchQuery('')
      return
    }
    
    const service = services.find(s => s.id === serviceId)
    if (!service) return
    
    setSvc((prev: any) => ({
      ...prev,
      id: serviceId,
      name: serviceName,
      price: service.price,
      qty: prev.qty || '1',
      discount: prev.discount || '0',
    }))
    setServiceSearchQuery(serviceName)
    setServiceSearchFocused(false)
  }, [services, setSvc, setServiceSearchQuery, setServiceSearchFocused])
  
  const onServiceDoubleClick = useCallback((serviceId: string, serviceName: string) => {
    // Selectează serviciul și apoi adaugă-l direct
    onServiceSelect(serviceId, serviceName)
    // Apelează onAddService după un mic delay pentru a permite state-ului să se actualizeze
    setTimeout(() => {
      itemOperations.onAddService()
    }, 50)
  }, [onServiceSelect, itemOperations.onAddService])
  
  const onInstrumentDoubleClick = useCallback((instrumentId: string) => {
    if (!instrumentId) return
    // Selectează doar instrumentul. Adăugarea efectivă (fără serviciu) se face în
    // PreturiOrchestrator; nu se mai adaugă automat nici serviciul unic.
    onInstrumentChange(instrumentId)
  }, [onInstrumentChange])
  
  const onPartSelect = useCallback((partId: string, partName: string) => {
    if (!partId) {
      setPart((prev: any) => ({ ...prev, id: '', name: '' }))
      setPartSearchQuery('')
      return
    }
    
    const partDef = parts.find(p => p.id === partId)
    if (!partDef) return
    
    setPart((prev: any) => ({
      ...prev,
      id: partId,
      name: partName,
      price: partDef.price,
      qty: prev.qty || '1',
      discount: prev.discount || '0',
    }))
    setPartSearchQuery(partName)
    setPartSearchFocused(false)
  }, [parts, setPart, setPartSearchQuery, setPartSearchFocused])
  
  const onPartDoubleClick = useCallback((partId: string, partName: string) => {
    // Selectează piesa și apoi adaugă-o direct
    onPartSelect(partId, partName)
    // Apelează onAddPart după un mic delay pentru a permite state-ului să se actualizeze
    setTimeout(() => {
      itemOperations.onAddPart()
    }, 50)
  }, [onPartSelect, itemOperations.onAddPart])
  
  // NOTA: Logica onRowClick a fost mutată în PreturiMain.tsx pentru acces direct la state
  // Acest callback e păstrat pentru compatibilitate dar nu mai e folosit activ
  const onRowClick = useCallback((item: LeadQuoteItem) => {
    // Logica e acum în PreturiMain.tsx - callback direct cu acces la state
    console.log('[usePreturiBusiness] onRowClick called - redirecting to PreturiMain')
  }, [])
  
  // Resetează toate formularele la starea inițială
  const onClearForm = useCallback(() => {
    // Resetează formularul de instrument
    setInstrumentForm({
      instrument: '',
      qty: '1',
      brandSerialGroups: [],
      garantie: false
    })
    
    // Resetează formularul de serviciu
    setSvc({
      id: '',
      name: '',
      price: 0,
      qty: '1',
      discount: '0',
      instrumentId: '',
      urgent: false,
      technicianId: '',
      pipelineId: '',
      serialNumberId: '',
      selectedBrands: []
    })
    setServiceSearchQuery('')
    setServiceSearchFocused(false)
    
    // Resetează formularul de piesă
    setPart({
      id: '',
      name: '',
      price: 0,
      qty: '1',
      discount: '0',
      urgent: false,
      serialNumberId: ''
    })
    setPartSearchQuery('')
    setPartSearchFocused(false)
    
    // Resetează și instrumentSettings pentru instrumentul curent
    const currentInstrumentId = instrumentForm.instrument
    if (currentInstrumentId) {
      setInstrumentSettings((prev: any) => {
        const updated = { ...prev }
        delete updated[currentInstrumentId]
        return updated
      })
    }
    
    setIsDirty(true)
  }, [setSvc, setServiceSearchQuery, setServiceSearchFocused, setPart, setPartSearchQuery, setPartSearchFocused, setInstrumentForm, instrumentForm.instrument, setInstrumentSettings, setIsDirty])
  
  const onBrandToggle = useCallback((brandKey: string, checked: boolean) => {
    setSvc((prev: any) => {
      const currentBrands = Array.isArray(prev?.selectedBrands) ? prev.selectedBrands : []
      let newBrands: string[]
      
      if (checked) {
        // Adaugă brand-ul dacă nu există deja
        newBrands = currentBrands.includes(brandKey) ? currentBrands : [...currentBrands, brandKey]
      } else {
        // Elimină brand-ul
        newBrands = currentBrands.filter((b: string) => b !== brandKey)
      }
      
      return { ...prev, selectedBrands: newBrands }
    })
    setIsDirty(true)
  }, [setSvc, setIsDirty])
  
  // Handler pentru schimbarea tehnicianului (doar pentru admini)
  const onTechnicianChange = useCallback((technicianId: string) => {
    setSvc((prev: any) => ({ ...prev, technicianId: technicianId || '' }))
    setIsDirty(true)
  }, [setSvc, setIsDirty])
  
  // Wrapper pentru handleMoveInstrument (adaptează semnătura pentru PreturiOrchestrator)
  const handleMoveInstrumentWrapper = useCallback(async () => {
    toast.info('Funcția handleMoveInstrument va fi implementată')
  }, [])

  return {
    // Funcții existente (păstrate pentru compatibilitate)
    onUpdateItem,
    onDelete,
    handleMoveInstrument: handleMoveInstrumentWrapper,
    handleNoDealChange,
    handleNuRaspundeChange,
    handleCallBackChange,
    // tempId eliminat - items-urile se salvează direct în DB
    
    // Hook-uri combinate - Calculations
    computeItemsTotal: calculations.computeItemsTotal,
    recalcAllSheetsTotal: calculations.recalcAllSheetsTotal,
    
    // Hook-uri combinate - Image Operations (cu wrapper-uri pentru compatibilitate)
    handleTrayImageUpload: handleTrayImageUploadWrapper,
    handleDownloadAllImages: imageOperations.handleDownloadAllImages,
    handleTrayImageDelete: handleTrayImageDeleteWrapper,
    handleAssignTrayImage,
    
    // Hook-uri combinate - Form Operations
    onAddBrandSerialGroup: formOperations.onAddBrandSerialGroup,
    onRemoveBrandSerialGroup: formOperations.onRemoveBrandSerialGroup,
    onUpdateBrand: formOperations.onUpdateBrand,
    onUpdateBrandQty: formOperations.onUpdateBrandQty,
    onUpdateSerialNumber: formOperations.onUpdateSerialNumber,
    onAddSerialNumber: formOperations.onAddSerialNumber,
    onRemoveSerialNumber: formOperations.onRemoveSerialNumber,
    onUpdateSerialGarantie: formOperations.onUpdateSerialGarantie,
    handleResetServiceForm: formOperations.handleResetServiceForm,
    handleResetPartForm: formOperations.handleResetPartForm,
    populateInstrumentFormFromItems: formOperations.populateInstrumentFormFromItems,
    
    // Hook-uri combinate - Delivery Operations
    refreshPipelines: deliveryOperations.refreshPipelines,
    refreshDepartments: deliveryOperations.refreshDepartments,
    handleDeliveryCheckboxChange: deliveryOperations.handleDeliveryCheckboxChange,
    handleCurierTrimisChange: deliveryOperations.handleCurierTrimisChange,
    handleReturChange: deliveryOperations.handleReturChange,
    
    // Hook-uri combinate - Tray Operations
    onAddSheet: (trayOperations as any).onAddSheet,
    handleCreateTray: (trayOperations as any).handleCreateTray,
    onEditTray: (trayOperations as any).onEditTray,
    handleUpdateTray: (trayOperations as any).handleUpdateTray,
    handleEditTrayInline: (trayOperations as any).handleEditTrayInline,
    handleDeleteTray: (trayOperations as any).handleDeleteTray,
    handleMoveInstrumentToTray: (trayOperations as any).handleMoveInstrument,
    handleMoveInstrumentToNewTray: (group: { instrument: { id: string; name: string }; items: any[] }, number: string) =>
      (trayOperations as any).handleMoveInstrument('new', group, { newTrayNumber: number }),
    handleSplitTrayItemsToTechnician: (trayOperations as any).handleSplitTrayItemsToTechnician,
    handleSplitTrayToRealTrays: (trayOperations as any).handleSplitTrayToRealTrays,
    validateTraysBeforeSend: (trayOperations as any).validateTraysBeforeSend,
    checkTraysInDepartments: (trayOperations as any).checkTraysInDepartments,
    sendAllTraysToPipeline: (trayOperations as any).sendAllTraysToPipeline,
    
    // Hook-uri combinate - Item Operations
    onAddService: itemOperations.onAddService,
    onAddPart: itemOperations.onAddPart,
    
    // Hook-uri combinate - Save Operations
    saveAllAndLog: saveOperations.saveAllAndLog,
    saveOptionsOnly: saveOperations.saveOptionsOnly,
    initializeSnapshot: saveOperations.initializeSnapshot,
    handleUrgentChange,
    onInstrumentChange,
    onQtyChange,
    onServiceSelect,
    onServiceDoubleClick,
    onPartSelect,
    onPartDoubleClick,
    onRowClick,
    onClearForm,
    onBrandToggle,
    onTechnicianChange,
    
    // TrayTabs callbacks
    onTraySelect: (trayId: string) => {
      setSelectedQuoteId(trayId)
    },
    onAddTray: (trayOperations as any).onAddSheet,
    onDeleteTray: (trayOperations as any).handleDeleteTray,
    onSendTrays: (trayOperations as any).sendAllTraysToPipeline,
  }
}
