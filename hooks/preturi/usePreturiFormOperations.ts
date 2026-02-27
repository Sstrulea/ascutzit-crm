/**
 * Hook pentru operațiile cu formulare (reset)
 */

import { useCallback } from 'react'
import type { LeadQuoteItem } from '@/lib/types/preturi'

interface UsePreturiFormOperationsProps {
  instrumentForm: any
  svc: any
  part: any
  items: LeadQuoteItem[]
  instrumentSettings: any
  services: any[]
  instruments?: Array<{ id: string; name: string; department_id: string | null }>
  departments?: Array<{ id: string; name: string }>
  setInstrumentForm: React.Dispatch<React.SetStateAction<any>>
  setSvc: React.Dispatch<React.SetStateAction<any>>
  setPart: React.Dispatch<React.SetStateAction<any>>
  setServiceSearchQuery: React.Dispatch<React.SetStateAction<string>>
  setServiceSearchFocused: React.Dispatch<React.SetStateAction<boolean>>
  setPartSearchQuery: React.Dispatch<React.SetStateAction<string>>
  setPartSearchFocused: React.Dispatch<React.SetStateAction<boolean>>
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>
  setInstrumentSettings: React.Dispatch<React.SetStateAction<any>>
}

export function usePreturiFormOperations({
  instrumentForm,
  svc,
  part,
  items,
  instrumentSettings,
  services,
  instruments = [],
  departments = [],
  setInstrumentForm,
  setSvc,
  setPart,
  setServiceSearchQuery,
  setServiceSearchFocused,
  setPartSearchQuery,
  setPartSearchFocused,
  setIsDirty,
  setInstrumentSettings,
}: UsePreturiFormOperationsProps) {

  // Populează formularul instrumentului cu datele din items
  const populateInstrumentFormFromItems = useCallback((itemsToPopulate: LeadQuoteItem[], instrumentId: string | null, forceReload: boolean = false) => {
    if (!instrumentId) {
      return
    }
    
    const directInstrumentItem = itemsToPopulate.find(item => 
      item.item_type === null && item.instrument_id === instrumentId
    )
    
    const instrumentItems = itemsToPopulate.filter(item => {
      if (item.item_type === null && item.instrument_id === instrumentId) {
        return true
      }
      if (item.item_type === 'service' && item.service_id) {
        const serviceDef = services.find(s => s.id === item.service_id)
        return serviceDef?.instrument_id === instrumentId
      }
      return false
    })
    
    const itemWithPotentialData = directInstrumentItem || (instrumentItems.length > 0 ? instrumentItems[0] : null)
    const savedSettings = instrumentSettings[instrumentId]
    
    setInstrumentForm((prev: any) => {
      if (!forceReload && prev?.instrument === instrumentId) {
        return prev
      }
      
      const qty = savedSettings?.qty || String(itemWithPotentialData?.qty || 1)
      
      return {
        ...prev,
        instrument: instrumentId,
        qty,
      }
    })
    
    if (itemWithPotentialData) {
      const qty = String(itemWithPotentialData.qty || 1)
      setInstrumentSettings((prev: any) => ({
        ...prev,
        [instrumentId]: {
          ...prev[instrumentId],
          qty: savedSettings?.qty || qty,
        }
      }))
    }
  }, [
    services,
    instruments,
    departments,
    instrumentSettings,
    setInstrumentForm,
    setInstrumentSettings,
  ])

  // Funcție pentru resetarea formularului de serviciu
  const handleResetServiceForm = useCallback(async () => {
    const currentInstrumentId = svc?.instrumentId || instrumentForm?.instrument
    
    const savedSettings = currentInstrumentId ? instrumentSettings[currentInstrumentId] : null
    const qty = savedSettings?.qty || instrumentForm?.qty || '1'
    
    setSvc({
      instrumentId: currentInstrumentId,
      id: '',
      qty,
      discount: '0',
      urgent: false,
      technicianId: '',
      pipelineId: '',
      serialNumberId: '',
    })
    
    if (currentInstrumentId) {
      setInstrumentForm((prev: any) => ({
        ...prev,
        instrument: currentInstrumentId,
        qty,
      }))
    }
    
    setServiceSearchQuery('')
    setServiceSearchFocused(false)
  }, [
    svc,
    instrumentForm,
    instrumentSettings,
    setSvc,
    setInstrumentForm,
    setServiceSearchQuery,
    setServiceSearchFocused,
  ])

  // Funcție pentru resetarea formularului de piesă
  const handleResetPartForm = useCallback(() => {
    setPart({
      id: '',
      serialNumberId: '',
      qty: '1',
      discount: '0',
      overridePrice: ''
    })
    setPartSearchQuery('')
    setPartSearchFocused(false)
  }, [setPart, setPartSearchQuery, setPartSearchFocused])

  return {
    handleResetServiceForm,
    handleResetPartForm,
    populateInstrumentFormFromItems,
  }
}
