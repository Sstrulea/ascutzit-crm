/**
 * Hook pentru operațiile cu formulare (brand, serial, reset)
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
    
    // IMPORTANT: Caută mai întâi item-ul direct cu item_type === null (instrumentul direct)
    // Apoi caută în servicii doar dacă nu găsește date la instrumentul direct
    const directInstrumentItem = itemsToPopulate.find(item => 
      item.item_type === null && item.instrument_id === instrumentId
    )
    
    // Găsește toate items-urile care sunt instrumente (item_type: null) sau servicii cu acest instrument
    const instrumentItems = itemsToPopulate.filter(item => {
      // Items care sunt direct instrumente (item_type: null și au instrument_id)
      if (item.item_type === null && item.instrument_id === instrumentId) {
        return true
      }
      // Sau servicii care au acest instrument
      if (item.item_type === 'service' && item.service_id) {
        const serviceDef = services.find(s => s.id === item.service_id)
        return serviceDef?.instrument_id === instrumentId
      }
      return false
    })
    
    // Prioritizează item-ul direct cu instrument (item_type === null)
    let itemWithInstrumentData: LeadQuoteItem | null = null
    
    if (directInstrumentItem) {
      const hasBrandGroups = (directInstrumentItem as any).brand_groups && (directInstrumentItem as any).brand_groups.length > 0
      const hasData = hasBrandGroups || directInstrumentItem.brand || directInstrumentItem.serial_number || directInstrumentItem.garantie
      if (hasData) {
        itemWithInstrumentData = directInstrumentItem
      }
    }
    
    // IMPORTANT: Colectează TOATE brand-urile din TOATE serviciile asociate cu instrumentul
    // Nu doar din primul serviciu găsit, ci din toate serviciile
    let allBrandGroupsFromServices: Array<{ id: string; brand: string; serialNumbers: string[]; garantie: boolean }> = []
    
    if (!itemWithInstrumentData) {
      // Colectează brand-urile din toate serviciile, nu doar din primul
      instrumentItems.forEach(item => {
        const itemBrandGroups = (item as any).brand_groups || []
        if (itemBrandGroups.length > 0) {
          allBrandGroupsFromServices.push(...itemBrandGroups)
        } else if (item.brand || item.serial_number) {
          // Fallback: folosește câmpurile vechi dacă nu există brand_groups
          allBrandGroupsFromServices.push({
            id: item.id || '',
            brand: item.brand || '',
            serialNumbers: item.serial_number ? [item.serial_number] : [],
            garantie: item.garantie || false
          })
        }
      })
      
      // Dacă am găsit brand-uri în servicii, le folosim
      if (allBrandGroupsFromServices.length > 0) {
        itemWithInstrumentData = instrumentItems[0] // Folosim primul item pentru alte date
      } else {
        // Caută primul serviciu cu date pentru compatibilitate
        itemWithInstrumentData = instrumentItems.find(item => {
          const hasBrandGroups = (item as any).brand_groups && (item as any).brand_groups.length > 0
          const hasData = hasBrandGroups || item.brand || item.serial_number || item.garantie
          return hasData
        }) || null
      }
    }
    
    // Chiar dacă nu găsim date, verificăm dacă există un item
    const itemWithPotentialData = directInstrumentItem || (instrumentItems.length > 0 ? instrumentItems[0] : null)
    
    // IMPORTANT: Verifică dacă există brand-uri în formular sau în instrumentSettings
    // chiar dacă nu mai există servicii în items
    const savedSettings = instrumentSettings[instrumentId]
    const hasSavedBrands = savedSettings && savedSettings.brandSerialGroups && savedSettings.brandSerialGroups.length > 0
    
    // Dacă nu există date în items dar există brand-uri salvate, le folosim
    if (!itemWithInstrumentData && !itemWithPotentialData && hasSavedBrands) {
      setInstrumentForm((prev: any) => {
        // Verifică dacă formularul are deja brand-uri pentru același instrument
        const brandSerialGroups = Array.isArray(prev?.brandSerialGroups) ? prev.brandSerialGroups : []
        
        if (!Array.isArray(brandSerialGroups)) {
          console.error('[usePreturiFormOperations] ERROR: brandSerialGroups is NOT an array')
          return prev
        }
        
        // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
        let hasValidBrandsInForm = false
        if (prev?.instrument === instrumentId) {
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
              hasValidBrandsInForm = true
              break
            }
          }
        }
        
        // Dacă există brand-uri în formular, le păstrăm
        if (hasValidBrandsInForm) {
          return prev
        }
        
        // Altfel, folosim brand-urile din instrumentSettings
        const groupsToReturn = savedSettings?.brandSerialGroups || []
        // Calculează qty-ul TOTAL din suma qty-urilor brandurilor
        const totalQtyToReturn = groupsToReturn.reduce((sum: number, group: any) => sum + (Number(group.qty) || 0), 0)
        return {
          ...prev,
          instrument: instrumentId,
          brandSerialGroups: groupsToReturn,
          qty: String(totalQtyToReturn || 1)
        }
      })
      return
    }
    
    if (itemWithInstrumentData || itemWithPotentialData) {
      const targetItem = itemWithInstrumentData || itemWithPotentialData
      
      // Extrage brand-urile și serial numbers din noua structură brand_groups
      let brandSerialGroups: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }>; qty: string }> = []
      
      // Prioritizează brand-urile colectate din toate serviciile
      const brandGroupsToProcess = allBrandGroupsFromServices.length > 0 
        ? allBrandGroupsFromServices 
        : ((targetItem as any).brand_groups || [])
      
      if (brandGroupsToProcess.length > 0) {
        
        // Grupează brand-urile după numele brand-ului pentru a evita duplicatele
        const brandGroupsMap = new Map<string, { brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }> }>()
        
        brandGroupsToProcess.forEach((bg: any) => {
          const brandName = bg.brand?.trim() || ''
          if (!brandName) return
          
          if (!brandGroupsMap.has(brandName)) {
            brandGroupsMap.set(brandName, {
              brand: brandName,
              serialNumbers: []
            })
          }
          
          const brandGroup = brandGroupsMap.get(brandName)!
          
          // Adaugă serial numbers-urile din acest brand (inclusiv cele goale)
          // IMPORTANT: Pentru serial numbers goale, adaugă-le toate pentru a păstra pozițiile ocupate
          const serialNumbers = bg.serialNumbers || []
          serialNumbers.forEach((sn: string) => {
            const serialValue = sn && sn.trim() ? sn.trim() : ''
            
            // Pentru serial numbers cu valoare, verifică duplicatele
            if (serialValue) {
              const serialNumbersArray = Array.isArray(brandGroup.serialNumbers) ? brandGroup.serialNumbers : []
              let serialExists = false
              if (Array.isArray(serialNumbersArray)) {
                for (let j = 0; j < serialNumbersArray.length; j++) {
                  const s = serialNumbersArray[j]
                  if (s && s.serial === serialValue) {
                    serialExists = true
                    break
                  }
                }
              }
              if (!serialExists) {
                brandGroup.serialNumbers.push({
                  serial: serialValue,
                  garantie: bg.garantie || false
                })
              }
            } else {
              // Pentru serial numbers goale, adaugă-le direct (fiecare ocupă un loc)
              brandGroup.serialNumbers.push({
                serial: '',
                garantie: bg.garantie || false
              })
            }
          })
        })
        
        // Transformă map-ul în array
        brandSerialGroups = Array.from(brandGroupsMap.values()).map(bg => {
          const snArray = bg.serialNumbers.length > 0 ? bg.serialNumbers : [{ serial: '', garantie: false }]
          return {
            brand: bg.brand,
            serialNumbers: snArray,
            qty: String(snArray.length) // qty = numărul total de serial numbers (inclusiv cele goale)
          }
        })
      } else if (targetItem?.brand || targetItem?.serial_number) {
        // Fallback la câmpurile vechi pentru compatibilitate
        const serialNumbers = targetItem.serial_number 
          ? [{ serial: targetItem.serial_number, garantie: targetItem.garantie || false }] 
          : [{ serial: '', garantie: false }]
        brandSerialGroups = [{
          brand: targetItem.brand || '',
          serialNumbers: serialNumbers,
          qty: String(serialNumbers.length) // qty = numărul total de serial numbers
        }]
      } else {
        // Dacă nu există date în DB, verifică dacă există brand-uri în formular sau în instrumentSettings
        if (hasSavedBrands) {
          brandSerialGroups = savedSettings.brandSerialGroups
        } else {
          // Verifică dacă instrumentul aparține departamentului de reparații
          const instrument = instruments.find(i => i.id === instrumentId)
          const isReparatiiInstrument = instrument && instrument.department_id ? (() => {
            const department = departments.find(d => d.id === instrument.department_id)
            const deptName = department?.name?.toLowerCase() || ''
            return deptName.includes('reparatii') || deptName.includes('reparații')
          })() : false
          
          // Dacă este instrument din departamentul de reparații, creează un grup gol
          if (isReparatiiInstrument) {
            brandSerialGroups = [{ brand: '', serialNumbers: [{ serial: '', garantie: false }], qty: '1' }]
          } else {
            // Pentru alte instrumente, nu creăm grup gol
            brandSerialGroups = []
          }
        }
      }
      
      // Pentru instrumentele de reparații, asigură-te că există cel puțin un grup gol
      let finalGroups = brandSerialGroups
      // Verifică din nou dacă este instrument de reparații (pentru cazul când nu există items)
      const instrument = instruments.find(i => i.id === instrumentId)
      const isReparatiiInstrumentFinal = instrument && instrument.department_id ? (() => {
        const department = departments.find(d => d.id === instrument.department_id)
        const deptName = department?.name?.toLowerCase() || ''
        return deptName.includes('reparatii') || deptName.includes('reparații')
      })() : false
      
      if (brandSerialGroups.length === 0 && isReparatiiInstrumentFinal) {
        finalGroups = [{ brand: '', serialNumbers: [{ serial: '', garantie: false }], qty: '1' }]
      }
      
      // Populează formularul - dacă forceReload este true, suprascrie întotdeauna
      setInstrumentForm((prev: any) => {
        // IMPORTANT: Dacă formularul are deja brand-uri valide pentru același instrument,
        // le păstrăm chiar dacă forceReload este true (pentru a preveni resetarea după adăugarea serviciului)
        const prevBrandSerialGroups = Array.isArray(prev?.brandSerialGroups) ? prev.brandSerialGroups : []
        
        // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
        let hasValidBrandsInForm = false
        if (prev?.instrument === instrumentId && Array.isArray(prevBrandSerialGroups)) {
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
              hasValidBrandsInForm = true
              break
            }
          }
        }
        
        // Dacă există brand-uri valide în formular SAU în instrumentSettings, păstrează-le
        if (hasValidBrandsInForm || hasSavedBrands) {
          // Dacă nu există date valide în DB sau datele din DB sunt goale, păstrează brand-urile existente
          const finalGroupsArray = Array.isArray(finalGroups) ? finalGroups : []
          
           if (!Array.isArray(finalGroupsArray)) {
             console.error('[usePreturiFormOperations] ERROR: finalGroupsArray is NOT an array')
             return prev
           }
          
          // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
          let hasValidDataInDB = false
          for (let i = 0; i < finalGroupsArray.length; i++) {
            const g = finalGroupsArray[i]
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
              hasValidDataInDB = true
              break
            }
          }
          
          if (!hasValidDataInDB) {
            // Folosește brand-urile din formular sau din instrumentSettings
            const brandsToKeep = hasValidBrandsInForm ? prev?.brandSerialGroups : (savedSettings?.brandSerialGroups || [])
            if (brandsToKeep && brandsToKeep.length > 0) {
              // Calculează qty-ul TOTAL din suma qty-urilor brandurilor
              const totalQtyToKeep = brandsToKeep.reduce((sum: number, group: any) => sum + (Number(group.qty) || 0), 0)
              return {
                ...prev,
                instrument: instrumentId,
                brandSerialGroups: brandsToKeep,
                qty: String(totalQtyToKeep || 1)
              }
            }
          }
        }
        
        // Dacă forceReload este false și formularul are deja date pentru același instrument, nu le suprascriem
        if (!forceReload && prev?.instrument === instrumentId && Array.isArray(prevBrandSerialGroups)) {
          // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
          let hasData = false
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
              hasData = true
              break
            }
          }
          if (hasData) {
            return prev
          }
        }
        
        // Calculează qty-ul TOTAL al instrumentului din suma qty-urilor brandurilor
        const totalQty = finalGroups.reduce((sum: number, group: any) => sum + (Number(group.qty) || 0), 0)
        
        return {
          ...prev,
          instrument: instrumentId,
          brandSerialGroups: finalGroups,
          qty: String(totalQty || 1)
        }
      })
      
      // Actualizează și instrumentSettings doar dacă există date valide
      const brandSerialGroupsArray = Array.isArray(brandSerialGroups) ? brandSerialGroups : []
      
       if (!Array.isArray(brandSerialGroupsArray)) {
         console.error('[usePreturiFormOperations] ERROR: brandSerialGroupsArray is NOT an array')
         return
       }
      
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      let hasValidData = false
      for (let i = 0; i < brandSerialGroupsArray.length; i++) {
        const g = brandSerialGroupsArray[i]
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
          hasValidData = true
          break
        }
      }
      
      if (hasValidData) {
        // Calculează qty-ul TOTAL din suma qty-urilor brandurilor
        const totalQtyForSettings = (Array.isArray(brandSerialGroups) ? brandSerialGroups : []).reduce((sum: number, group: any) => sum + (Number(group.qty) || 0), 0)
        
        setInstrumentSettings((prev: any) => ({
          ...prev,
          [instrumentId]: {
            qty: String(totalQtyForSettings || 1),
            brandSerialGroups: brandSerialGroups
          }
        }))
      }
    } else {
      // Dacă nu există items dar există brand-uri în formular sau în instrumentSettings, le păstrăm
      setInstrumentForm((prev: any) => {
        const prevBrandSerialGroups = Array.isArray(prev?.brandSerialGroups) ? prev.brandSerialGroups : []
        
        // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
        let hasValidBrandsInForm = false
        if (prev?.instrument === instrumentId && Array.isArray(prevBrandSerialGroups)) {
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
              hasValidBrandsInForm = true
              break
            }
          }
        }
        
        if (hasValidBrandsInForm) {
          return prev
        }
        
        if (hasSavedBrands) {
          const groupsToReturn = savedSettings.brandSerialGroups || []
          // Calculează qty-ul TOTAL din suma qty-urilor brandurilor
          const totalQtyForSavedBrands = groupsToReturn.reduce((sum: number, group: any) => sum + (Number(group.qty) || 0), 0)
          return {
            ...prev,
            instrument: instrumentId,
            brandSerialGroups: groupsToReturn,
            qty: String(totalQtyForSavedBrands || 1)
          }
        }
        
        // Verifică dacă instrumentul aparține departamentului de reparații
        const instrument = instruments.find(i => i.id === instrumentId)
        const isReparatiiInstrument = instrument && instrument.department_id ? (() => {
          const department = departments.find(d => d.id === instrument.department_id)
          const deptName = department?.name?.toLowerCase() || ''
          const isReparatii = deptName.includes('reparatii') || deptName.includes('reparații')
          return isReparatii
        })() : false
        
        // Dacă este instrument din departamentul de reparații, creează un grup brand/serial gol
        if (isReparatiiInstrument) {
          const newForm = {
            ...prev,
            instrument: instrumentId,
            brandSerialGroups: [{ brand: '', serialNumbers: [{ serial: '', garantie: false }], qty: '1' }],
            qty: prev?.qty || '1'
          }
          return newForm
        }
        
        // Dacă nu există brand-uri nici în formular nici în settings și nu este instrument de reparații, nu facem nimic
        return prev
      })
    }
  }, [
    services,
    instruments,
    departments,
    instrumentSettings,
    setInstrumentForm,
    setInstrumentSettings,
  ])

  // Adaugă un grup brand + serial numbers
  const onAddBrandSerialGroup = useCallback(() => {
    setInstrumentForm((prev: any) => {
      const prevBrandSerialGroups = Array.isArray(prev?.brandSerialGroups) ? prev.brandSerialGroups : []
      const newGroups = [...prevBrandSerialGroups, { brand: '', serialNumbers: [{ serial: '', garantie: false }], qty: '1' }]
      
      // IMPORTANT: Recalculează cantitatea instrumentului = suma qty-urilor din toate brandurile
      const totalQtyForInstrument = newGroups.reduce((sum: number, group: any) => sum + (Number(group.qty) || 0), 0)
      
      return {
        ...prev,
        brandSerialGroups: newGroups,
        qty: String(totalQtyForInstrument || 1)
      }
    })
    setIsDirty(true)
  }, [setInstrumentForm, setIsDirty])

  // Șterge un grup brand + serial numbers
  const onRemoveBrandSerialGroup = useCallback((groupIndex: number) => {
    setInstrumentForm((prev: any) => {
      const prevBrandSerialGroups = Array.isArray(prev?.brandSerialGroups) ? prev.brandSerialGroups : []
      const updatedGroups = prevBrandSerialGroups.filter((_: any, i: number) => i !== groupIndex)
      
      // IMPORTANT: Recalculează cantitatea instrumentului = suma qty-urilor din toate brandurile
      const totalQtyForRemove = updatedGroups.reduce((sum: number, group: any) => sum + (Number(group.qty) || 0), 0)
      
      return {
        ...prev,
        brandSerialGroups: updatedGroups,
        qty: String(totalQtyForRemove || 1)
      }
    })
    setIsDirty(true)
  }, [setInstrumentForm, setIsDirty])

  // Actualizează brand-ul pentru un grup
  const onUpdateBrand = useCallback((groupIndex: number, value: string) => {
    setInstrumentForm((prev: any) => ({
      ...prev,
      brandSerialGroups: (Array.isArray(prev?.brandSerialGroups) ? prev.brandSerialGroups : []).map((group: any, i: number) => 
        i === groupIndex ? { ...group, brand: value } : group
      )
    }))
    setIsDirty(true)
  }, [setInstrumentForm, setIsDirty])

  const onUpdateBrandQty = useCallback((groupIndex: number, qty: string) => {
    setInstrumentForm((prev: any) => {
      const qtyNum = Math.max(1, Number(qty) || 1)
      const prevBrandSerialGroups = Array.isArray(prev?.brandSerialGroups) ? prev.brandSerialGroups : []
      const updatedGroups = prevBrandSerialGroups.map((group: any, i: number) => {
        if (i === groupIndex) {
          // Generează automat serial numbers bazat pe cantitatea nouă
          const currentSerialNumbers = group.serialNumbers || []
          const newSerialNumbers = Array.from({ length: qtyNum }, (_, idx) => 
            currentSerialNumbers[idx] || { serial: '', garantie: false }
          )
          return { ...group, qty: String(qtyNum), serialNumbers: newSerialNumbers }
        }
        return group
      })
      
      // IMPORTANT: Recalculează cantitatea instrumentului = suma qty-urilor din toate brandurile
      const totalQtyForInstrumentUpdate = updatedGroups.reduce((sum: number, group: any) => sum + (Number(group.qty) || 0), 0)
      
      return { ...prev, brandSerialGroups: updatedGroups, qty: String(totalQtyForInstrumentUpdate || 1) }
    })
    setIsDirty(true)
  }, [setInstrumentForm, setIsDirty])

  // Actualizează un serial number dintr-un grup
  const onUpdateSerialNumber = useCallback((groupIndex: number, serialIndex: number, value: string) => {
    setInstrumentForm((prev: any) => {
      const prevBrandSerialGroups = Array.isArray(prev?.brandSerialGroups) ? prev.brandSerialGroups : []
      const updatedGroups = prevBrandSerialGroups.map((group: any, i: number) => {
        if (i === groupIndex) {
          // Actualizează serial number-ul - permite adăugarea peste cantitatea brand-ului
          const currentSerialNumbers = Array.isArray(group.serialNumbers) ? group.serialNumbers : []
          const updatedSerialNumbers = [...currentSerialNumbers]
          
          // Asigură că există suficient spațiu în array
          while (updatedSerialNumbers.length <= serialIndex) {
            updatedSerialNumbers.push({ serial: '', garantie: false })
          }
          
          // Actualizează serial number-ul la index-ul specificat
          updatedSerialNumbers[serialIndex] = {
            serial: value,
            garantie: updatedSerialNumbers[serialIndex]?.garantie || false
          }
          
          // Actualizează cantitatea brand-ului = lungimea serialNumbers
          const brandQty = updatedSerialNumbers.length
          
          return { ...group, serialNumbers: updatedSerialNumbers, qty: String(brandQty) }
        }
        return group
      })
      
      // IMPORTANT: Recalculează cantitatea instrumentului = suma qty-urilor din toate brandurile
      const totalQtyForUpdate = updatedGroups.reduce((sum: number, group: any) => sum + (Number(group.qty) || 0), 0)
      
      const updatedForm = { ...prev, brandSerialGroups: updatedGroups, qty: String(totalQtyForUpdate || 1) }
      
      // IMPORTANT: Salvează în instrumentSettings pentru a păstra toate serial numbers-urile
      if (prev.instrument) {
        setInstrumentSettings((prevSettings: any) => ({
          ...prevSettings,
          [prev.instrument]: {
            ...prevSettings[prev.instrument],
            brandSerialGroups: updatedGroups,
            qty: String(totalQtyForUpdate || 1)
          }
        }))
      }
      
      return updatedForm
    })
    setIsDirty(true)
  }, [setInstrumentForm, setIsDirty, setInstrumentSettings])

  // Adaugă un serial number nou într-un grup
  const onAddSerialNumber = useCallback((groupIndex: number) => {
    setInstrumentForm((prev: any) => {
      const prevBrandSerialGroups = Array.isArray(prev?.brandSerialGroups) ? prev.brandSerialGroups : []
      const updatedGroups = prevBrandSerialGroups.map((group: any, i: number) => {
        if (i === groupIndex) {
          const currentSerialNumbers = Array.isArray(group.serialNumbers) ? group.serialNumbers : []
          const newSerialNumbers = [...currentSerialNumbers, { serial: '', garantie: false }]
          // Actualizează cantitatea brand-ului = lungimea serialNumbers
          return { ...group, serialNumbers: newSerialNumbers, qty: String(newSerialNumbers.length) }
        }
        return group
      })
      
      // Recalculează cantitatea totală a instrumentului = suma qty-urilor din toate brandurile
      const totalQtyForAdd = updatedGroups.reduce((sum: number, group: any) => sum + (Number(group.qty) || 0), 0)
      
      const updatedForm = { ...prev, brandSerialGroups: updatedGroups, qty: String(totalQtyForAdd || 1) }
      
      // IMPORTANT: Salvează în instrumentSettings pentru a păstra toate serial numbers-urile
      if (prev.instrument) {
        setInstrumentSettings((prevSettings: any) => ({
          ...prevSettings,
          [prev.instrument]: {
            ...prevSettings[prev.instrument],
            brandSerialGroups: updatedGroups,
            qty: String(totalQtyForAdd || 1)
          }
        }))
      }
      
      return updatedForm
    })
    setIsDirty(true)
  }, [setInstrumentForm, setIsDirty, setInstrumentSettings])

  // Șterge un serial number dintr-un grup
  const onRemoveSerialNumber = useCallback((groupIndex: number, serialIndex: number) => {
    setInstrumentForm((prev: any) => {
      const prevBrandSerialGroups = Array.isArray(prev?.brandSerialGroups) ? prev.brandSerialGroups : []
      const updatedGroups = prevBrandSerialGroups.map((group: any, i: number) => {
        if (i === groupIndex) {
          const currentSerialNumbers = Array.isArray(group.serialNumbers) ? group.serialNumbers : []
          // Șterge serial number-ul la index-ul specificat
          const newSerialNumbers = currentSerialNumbers.filter((_: any, idx: number) => idx !== serialIndex)
          // Asigură că există cel puțin un serial number
          const finalSerialNumbers = newSerialNumbers.length > 0 ? newSerialNumbers : [{ serial: '', garantie: false }]
          // Actualizează cantitatea brand-ului = lungimea serialNumbers
          return { ...group, serialNumbers: finalSerialNumbers, qty: String(finalSerialNumbers.length) }
        }
        return group
      })
      
      // Recalculează cantitatea totală a instrumentului = suma qty-urilor din toate brandurile
      const totalQtyForRemoveSerial = updatedGroups.reduce((sum: number, group: any) => sum + (Number(group.qty) || 0), 0)
      
      const updatedForm = { ...prev, brandSerialGroups: updatedGroups, qty: String(totalQtyForRemoveSerial || 1) }
      
      // IMPORTANT: Salvează în instrumentSettings pentru a păstra toate serial numbers-urile
      if (prev.instrument) {
        setInstrumentSettings((prevSettings: any) => ({
          ...prevSettings,
          [prev.instrument]: {
            ...prevSettings[prev.instrument],
            brandSerialGroups: updatedGroups,
            qty: String(totalQtyForRemoveSerial || 1)
          }
        }))
      }
      
      return updatedForm
    })
    setIsDirty(true)
  }, [setInstrumentForm, setIsDirty, setInstrumentSettings])

  // Actualizează garanția pentru un serial number specific
  const onUpdateSerialGarantie = useCallback((groupIndex: number, serialIndex: number, garantie: boolean) => {
    setInstrumentForm((prev: any) => ({
      ...prev,
      brandSerialGroups: (Array.isArray(prev?.brandSerialGroups) ? prev.brandSerialGroups : []).map((group: any, i: number) => {
        if (i === groupIndex) {
          const updatedSerialNumbers = group.serialNumbers.map((sn: any, idx: number) => 
            idx === serialIndex ? { ...sn, garantie } : sn
          )
          return { ...group, serialNumbers: updatedSerialNumbers }
        }
        return group
      })
    }))
    setIsDirty(true)
  }, [setInstrumentForm, setIsDirty])

  // Funcție pentru resetarea formularului de serviciu
  const handleResetServiceForm = useCallback(async () => {
    // Păstrează instrumentId și restaurează brand-urile originale din instrumentSettings sau din DB
    const currentInstrumentId = svc?.instrumentId || instrumentForm?.instrument
    
    // Restaurează brand-urile originale din instrumentSettings
    const savedSettings = currentInstrumentId ? instrumentSettings[currentInstrumentId] : null
    
    // Calculează qty din serial numbers dacă există
    const groupsForQty = savedSettings?.brandSerialGroups || (instrumentForm?.brandSerialGroups || [])
    const totalSerialsForQty = groupsForQty.reduce((sum: number, group: any) => sum + ((Array.isArray(group.serialNumbers) ? group.serialNumbers.length : 0) || 1), 0)
    
    setSvc({
      instrumentId: currentInstrumentId, // Păstrează instrumentId pentru a nu afecta brand-urile
      id: '',
      qty: String(totalSerialsForQty || 1), // Calculează din serial numbers
      discount: '0',
      urgent: false,
      technicianId: '',
      pipelineId: '',
      serialNumberId: '',
      selectedBrands: [],
    })
    
    // Restaurează brand-urile originale din instrumentSettings sau reîncarcă din DB
    if (currentInstrumentId) {
      if (savedSettings?.brandSerialGroups && savedSettings.brandSerialGroups.length > 0) {
        // Restaurează din instrumentSettings
        const groupsToRestaurate = savedSettings.brandSerialGroups
        const totalSerialsRestaured = groupsToRestaurate.reduce((sum: number, group: any) => sum + ((Array.isArray(group.serialNumbers) ? group.serialNumbers.length : 0) || 1), 0)
        setInstrumentForm((prev: any) => ({
          ...prev,
          instrument: currentInstrumentId,
          brandSerialGroups: groupsToRestaurate,
          qty: String(totalSerialsRestaured || 1)
        }))
      } else {
        // Dacă nu există în instrumentSettings, reîncarcă din DB
        // Folosește populateInstrumentFormFromItems pentru a reîncărca brand-urile din DB
        populateInstrumentFormFromItems(items, currentInstrumentId, false)
      }
    }
    
    setServiceSearchQuery('')
    setServiceSearchFocused(false)
  }, [
    svc,
    instrumentForm,
    instrumentSettings,
    items,
    setSvc,
    setInstrumentForm,
    setServiceSearchQuery,
    setServiceSearchFocused,
    populateInstrumentFormFromItems,
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
    onAddBrandSerialGroup,
    onRemoveBrandSerialGroup,
    onUpdateBrand,
    onUpdateBrandQty,
    onUpdateSerialNumber,
    onAddSerialNumber,
    onRemoveSerialNumber,
    onUpdateSerialGarantie,
    handleResetServiceForm,
    handleResetPartForm,
    populateInstrumentFormFromItems,
  }
}

