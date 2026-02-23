/**
 * Hook pentru calcule și totaluri
 */

import { useCallback, useRef } from 'react'
import { listQuoteItems } from '@/lib/utils/preturi-helpers'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import type { LeadQuote, LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'

interface UsePreturiCalculationsProps {
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  subscriptionType: 'services' | 'parts' | 'both' | ''
  setAllSheetsTotal: React.Dispatch<React.SetStateAction<number>>
}

export function usePreturiCalculations({
  services,
  instruments,
  pipelinesWithIds,
  subscriptionType,
  setAllSheetsTotal,
}: UsePreturiCalculationsProps) {
  // Cache pentru items-urile tăvițelor pentru a reduce call-urile duplicate
  // Structură: Map<quoteId, { items: LeadQuoteItem[], timestamp: number }>
  const itemsCacheRef = useRef<Map<string, { items: LeadQuoteItem[], timestamp: number }>>(new Map())
  const CACHE_DURATION = 5000 // 5 secunde TTL pentru cache

  // Calculează totalul pentru items-urile unei tăvițe
  const computeItemsTotal = useCallback((sheetItems: LeadQuoteItem[]): number => {
    // Exclude items-urile cu item_type: null (doar instrument, fără serviciu) din calculele de totaluri
    const visibleItems = sheetItems.filter(it => it.item_type !== null)
    
    // Optimizare: un singur reduce în loc de 3 separate
    // Scădem cantitatea de nereparabile din calcul
    const { subtotal, totalDiscount, urgentAmount } = visibleItems.reduce(
      (acc, it) => {
        const qty = it.qty || 1
        const unrepaired = Number((it as any).unrepaired_qty ?? (it as any).non_repairable_qty) || 0
        const repairableQty = Math.max(0, qty - unrepaired)
        const base = repairableQty * it.price
        const discPct = Math.min(100, Math.max(0, it.discount_pct || 0)) / 100
        const disc = base * discPct
        const afterDisc = base - disc
        const urgent = it.urgent ? afterDisc * (URGENT_MARKUP_PCT / 100) : 0
        
        return {
          subtotal: acc.subtotal + base,
          totalDiscount: acc.totalDiscount + disc,
          urgentAmount: acc.urgentAmount + urgent,
        }
      },
      { subtotal: 0, totalDiscount: 0, urgentAmount: 0 }
    )
    
    return subtotal - totalDiscount + urgentAmount
  }, [])

  // Recalculează totalurile pentru toate tăvițele
  const recalcAllSheetsTotal = useCallback(async (forQuotes: LeadQuote[]) => {
    if (!forQuotes.length) { 
      setAllSheetsTotal(0)
      return
    }
    
    try {
      const now = Date.now()
      const quotesToReload: LeadQuote[] = []
      const cachedItemsArray: LeadQuoteItem[][] = []
      
      // Verifică cache-ul pentru fiecare tăviță
      forQuotes.forEach(quote => {
        const cached = itemsCacheRef.current.get(quote.id)
        if (cached && (now - cached.timestamp) < CACHE_DURATION) {
          // Folosește cache - items-urile sunt încă valide
          cachedItemsArray.push(cached.items)
        } else {
          // Reîncarcă - cache expirat sau inexistent
          quotesToReload.push(quote)
          cachedItemsArray.push([]) // Placeholder, va fi înlocuit după reîncărcare
        }
      })
      
      // Reîncarcă doar tăvițele care nu sunt în cache sau au expirat
      let reloadedItems: LeadQuoteItem[][] = []
      if (quotesToReload.length > 0) {
        reloadedItems = await Promise.all(
          quotesToReload.map(q => listQuoteItems(q.id, services, instruments, pipelinesWithIds))
        )
        
        // Actualizează cache-ul cu items-urile reîncărcate
        quotesToReload.forEach((quote, idx) => {
          itemsCacheRef.current.set(quote.id, { 
            items: reloadedItems[idx], 
            timestamp: now 
          })
        })
        
        // Actualizează cachedItemsArray cu items-urile reîncărcate
        let reloadIdx = 0
        forQuotes.forEach((quote, idx) => {
          if (quotesToReload.includes(quote)) {
            cachedItemsArray[idx] = reloadedItems[reloadIdx]
            reloadIdx++
          }
        })
      }
      
      // Folosește items-urile din cache sau reîncărcate
      const all = cachedItemsArray
      
      // Calculează totalul pentru fiecare tăviță (fără subscription discounts)
      let totalSum = 0
      let totalServicesSum = 0
      let totalPartsSum = 0
      
      all.forEach((sheetItems) => {
        // Calculează totalul pentru această tăviță
        const trayTotal = computeItemsTotal(sheetItems ?? [])
        totalSum += trayTotal
        
        // Calculează totalurile pentru servicii și piese (pentru subscription discounts)
        const visibleItems = (sheetItems ?? []).filter(it => it.item_type !== null)
        
        visibleItems.forEach((it) => {
          const qty = it.qty || 1
          const unrepaired = Number((it as any).unrepaired_qty ?? (it as any).non_repairable_qty) || 0
          const repairableQty = Math.max(0, qty - unrepaired)
          const base = repairableQty * it.price
          const discPct = Math.min(100, Math.max(0, it.discount_pct || 0)) / 100
          const disc = base * discPct
          const afterDisc = base - disc
          const urgent = it.urgent ? afterDisc * (URGENT_MARKUP_PCT / 100) : 0
          const itemTotal = afterDisc + urgent
          
          if (it.item_type === 'service') {
            totalServicesSum += itemTotal
          } else if (it.item_type === 'part') {
            totalPartsSum += itemTotal
          }
        })
      })
      
      // Aplică subscription discounts
      let subscriptionDiscountAmount = 0
      if (subscriptionType === 'services' || subscriptionType === 'both') {
        subscriptionDiscountAmount += totalServicesSum * 0.10
      }
      if (subscriptionType === 'parts' || subscriptionType === 'both') {
        subscriptionDiscountAmount += totalPartsSum * 0.05
      }
      
      // Suma totală finală = suma tăvițelor - discount-uri abonament
      const finalTotal = totalSum - subscriptionDiscountAmount
      setAllSheetsTotal(finalTotal)
    } catch (error: any) {
      console.error('[usePreturiCalculations] Error recalculating sheets total:', error?.message || 'Unknown error')
      setAllSheetsTotal(0)
    }
  }, [
    services,
    instruments,
    pipelinesWithIds,
    subscriptionType,
    computeItemsTotal,
    setAllSheetsTotal,
  ])

  return {
    computeItemsTotal,
    recalcAllSheetsTotal,
  }
}



