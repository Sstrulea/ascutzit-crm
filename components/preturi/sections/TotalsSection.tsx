'use client'

import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import type { LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'

interface TotalsSectionProps {
  items: LeadQuoteItem[]
  subscriptionType: 'services' | 'parts' | 'both' | '' | null
  services: Service[]
  instruments: Array<{ id: string; weight: number }>
  // Global discount props
  globalDiscountPct?: number
  onGlobalDiscountChange?: (value: number) => void
  canEditDiscount?: boolean
}

export function TotalsSection({
  items = [],
  subscriptionType,
  services = [],
  instruments = [],
  globalDiscountPct = 0,
  onGlobalDiscountChange,
  canEditDiscount = true,
}: TotalsSectionProps) {
  // Calculează totalurile folosind discountul per-item + discountul GLOBAL
  const { subtotal, itemsDiscount, globalDiscountAmount, totalDiscount, urgentAmount, total, totalWeight, subscriptionDiscount } = useMemo(() => {
    let subtotal = 0
    let itemsDiscount = 0  // Suma discount-urilor individuale per serviciu
    let totalWeight = 0

    if (!Array.isArray(items)) {
      return {
        subtotal: 0,
        itemsDiscount: 0,
        globalDiscountAmount: 0,
        totalDiscount: 0,
        urgentAmount: 0,
        total: 0,
        totalWeight: 0,
        subscriptionDiscount: 0,
      }
    }

    // Calculează subtotalul și discount-urile per-item
    items.forEach(item => {
      if (!item || item.item_type === null) return // Exclude instrument-only items
      const base = (item.qty || 1) * item.price
      subtotal += base
      
      // Calculează discountul individual al item-ului
      const itemDiscPct = Math.min(100, Math.max(0, item.discount_pct || 0))
      itemsDiscount += base * (itemDiscPct / 100)

      // Calculează greutatea pentru acest item
      let instrumentId: string | null = null
      const qty = item.qty || 1

      const safeServices = Array.isArray(services) ? services : []
      const safeInstruments = Array.isArray(instruments) ? instruments : []
      
      if (item.item_type === 'service' && item.service_id) {
        const serviceDef = safeServices.find(s => s && s.id === item.service_id)
        if (serviceDef?.instrument_id) {
          instrumentId = serviceDef.instrument_id
        }
      } else if (item.instrument_id) {
        instrumentId = item.instrument_id
      }

      if (instrumentId) {
        const instrument = safeInstruments.find(i => i && i.id === instrumentId)
        if (instrument && instrument.weight) {
          totalWeight += instrument.weight * qty
        }
      }
    })

    // După discount-urile per-item
    const afterItemsDiscount = subtotal - itemsDiscount
    
    // Discount GLOBAL aplicat pe valoarea rămasă (după discount-urile per-item)
    const globalDisc = Math.min(100, Math.max(0, globalDiscountPct || 0))
    const globalDiscountAmount = afterItemsDiscount * (globalDisc / 100)
    
    // Discount TOTAL = discount-uri per-item + discount global
    const totalDiscount = itemsDiscount + globalDiscountAmount
    
    // Calculează valoarea după toate discount-urile
    const afterAllDiscounts = subtotal - totalDiscount
    
    // Urgent se aplică pe toate items-urile dacă este activat global
    const hasUrgentItems = items.some(item => item && item.urgent)
    const urgentAmount = hasUrgentItems ? afterAllDiscounts * (URGENT_MARKUP_PCT / 100) : 0

    // Aplică discount-urile de abonament
    let subscriptionDiscount = 0
    if (subscriptionType && subscriptionType !== '' && subscriptionType !== null) {
      if (subscriptionType === 'services' || subscriptionType === 'both') {
        // 10% din valoarea serviciilor (după discount-uri)
        const servicesValue = items
          .filter(it => it && it.item_type === 'service')
          .reduce((acc, it) => {
            const base = (it.qty || 1) * it.price
            const itemDisc = base * (Math.min(100, Math.max(0, it.discount_pct || 0)) / 100)
            return acc + (base - itemDisc)
          }, 0)
        const servicesAfterGlobalDiscount = servicesValue * (1 - globalDisc / 100)
        subscriptionDiscount += servicesAfterGlobalDiscount * 0.10
      }

      if (subscriptionType === 'parts' || subscriptionType === 'both') {
        // 5% din valoarea pieselor (după discount-uri)
        const partsValue = items
          .filter(it => it && it.item_type === 'part')
          .reduce((acc, it) => {
            const base = (it.qty || 1) * it.price
            const itemDisc = base * (Math.min(100, Math.max(0, it.discount_pct || 0)) / 100)
            return acc + (base - itemDisc)
          }, 0)
        const partsAfterGlobalDiscount = partsValue * (1 - globalDisc / 100)
        subscriptionDiscount += partsAfterGlobalDiscount * 0.05
      }
    }

    const total = subtotal - totalDiscount + urgentAmount - subscriptionDiscount

    return {
      subtotal,
      itemsDiscount,
      globalDiscountAmount,
      totalDiscount,
      urgentAmount,
      total,
      totalWeight,
      subscriptionDiscount,
    }
  }, [items, subscriptionType, services, instruments, globalDiscountPct])

  return (
    <div className="px-1 sm:px-2">
      <div className="w-full text-xs sm:text-sm bg-muted/20 rounded-lg p-2 sm:p-3">
        {/* Rând cu 5 coloane: Subtotal, Discount Global %, Discount Valoare, Urgent, Total */}
        <div className="grid grid-cols-5 gap-2 sm:gap-4">
          {/* Coloana 1: Subtotal */}
          <div className="flex flex-col">
            <span className="text-muted-foreground text-[10px] sm:text-xs mb-1">Subtotal</span>
            <span className="font-medium text-sm sm:text-base">{subtotal.toFixed(2)} RON</span>
          </div>
          
          {/* Coloana 2: Discount Global % (editabil) */}
          <div className="flex flex-col">
            <span className="text-muted-foreground text-[10px] sm:text-xs mb-1">Discount %</span>
            {canEditDiscount && onGlobalDiscountChange ? (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={globalDiscountPct}
                  onChange={(e) => {
                    const value = Math.min(100, Math.max(0, Number(e.target.value) || 0))
                    onGlobalDiscountChange(value)
                  }}
                  className="h-7 w-16 text-sm text-center font-medium"
                />
                <span className="text-muted-foreground">%</span>
              </div>
            ) : (
              <span className="font-medium text-sm sm:text-base">{globalDiscountPct}%</span>
            )}
          </div>
          
          {/* Coloana 3: Discount Total */}
          <div className="flex flex-col">
            <span className="text-muted-foreground text-[10px] sm:text-xs mb-1">Discount</span>
            <span className="font-medium text-sm sm:text-base text-red-500">-{totalDiscount.toFixed(2)} RON</span>
          </div>
          
          {/* Coloana 4: Urgent */}
          <div className="flex flex-col">
            <span className="text-muted-foreground text-[10px] sm:text-xs mb-1">Urgent (+{URGENT_MARKUP_PCT}%)</span>
            <span className="font-medium text-sm sm:text-base text-amber-600">+{urgentAmount.toFixed(2)} RON</span>
          </div>
          
          {/* Coloana 5: Total */}
          <div className="flex flex-col">
            <span className="text-muted-foreground text-[10px] sm:text-xs mb-1">Total</span>
            <span className="font-semibold text-base sm:text-lg">{total.toFixed(2)} RON</span>
          </div>
        </div>
        
        {/* Discount-uri abonament (dacă există) */}
        {subscriptionType && subscriptionType !== '' && subscriptionType !== null && subscriptionDiscount > 0 && (
          <div className="mt-3 pt-3 border-t border-border/40">
            <div className="flex flex-col gap-1">
              {(subscriptionType === 'services' || subscriptionType === 'both') && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Abonament servicii (-10%)</span>
                  <span className="text-green-600">
                    -{(() => {
                      const servicesValue = items
                        .filter(it => it && it.item_type === 'service')
                        .reduce((acc, it) => acc + (it.qty || 1) * it.price, 0)
                      const servicesAfterDiscount = servicesValue * (1 - globalDiscountPct / 100)
                      return (servicesAfterDiscount * 0.10).toFixed(2)
                    })()} RON
                  </span>
                </div>
              )}
              {(subscriptionType === 'parts' || subscriptionType === 'both') && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Abonament piese (-5%)</span>
                  <span className="text-green-600">
                    -{(() => {
                      const partsValue = items
                        .filter(it => it && it.item_type === 'part')
                        .reduce((acc, it) => acc + (it.qty || 1) * it.price, 0)
                      const partsAfterDiscount = partsValue * (1 - globalDiscountPct / 100)
                      return (partsAfterDiscount * 0.05).toFixed(2)
                    })()} RON
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Greutate tăviță (dacă există) */}
        {totalWeight > 0 && (
          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/40">
            <span className="text-muted-foreground">Greutate tăviță</span>
            <span className="font-medium">{totalWeight.toFixed(2)} kg</span>
          </div>
        )}
      </div>
    </div>
  )
}
