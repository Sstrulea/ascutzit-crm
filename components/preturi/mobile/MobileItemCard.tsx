'use client'

import { useState, useRef } from 'react'
import { Trash2, AlertTriangle, ChevronRight, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'

interface MobileItemCardProps {
  item: LeadQuoteItem
  services: Service[]
  onTap: () => void
  onDelete: () => void
  onUpdateItem: (id: string, patch: Partial<LeadQuoteItem>) => void
}

export function MobileItemCard({
  item,
  services,
  onTap,
  onDelete,
  onUpdateItem,
}: MobileItemCardProps) {
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)

  const safeServices = Array.isArray(services) ? services : []

  // Calculează totalul liniei
  const qty = item.qty || 1
  const unrepaired = Number((item as any).unrepaired_qty ?? (item as any).non_repairable_qty) || 0
  const repairableQty = Math.max(0, qty - unrepaired)
  const nonRepairableQty = unrepaired
  const lineTotal = repairableQty * item.price

  // Determină numele serviciului
  const isInstrumentOnly = item.item_type === null && item.instrument_id
  const serviceName = item.item_type === 'service' 
    ? item.name_snapshot 
    : item.item_type === 'part' 
      ? item.name_snapshot || 'Piesă'
      : isInstrumentOnly
        ? '(fără serviciu)'
        : ''

  // Touch handlers pentru swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    setIsSwiping(false)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - touchStartX.current
    const deltaY = e.touches[0].clientY - touchStartY.current

    // Determină dacă e swipe orizontal
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      setIsSwiping(true)
      // Permite doar swipe la stânga (ștergere)
      if (deltaX < 0) {
        setSwipeOffset(Math.max(-80, deltaX))
      } else if (swipeOffset < 0) {
        setSwipeOffset(Math.min(0, swipeOffset + deltaX))
      }
    }
  }

  const handleTouchEnd = () => {
    if (swipeOffset < -40) {
      // Arată butonul de ștergere
      setSwipeOffset(-80)
    } else {
      // Resetează
      setSwipeOffset(0)
    }
    
    // Reset după un delay pentru tap
    setTimeout(() => setIsSwiping(false), 100)
  }

  const handleCardTap = () => {
    if (!isSwiping && swipeOffset === 0) {
      onTap()
    } else if (swipeOffset !== 0) {
      // Resetează swipe-ul dacă se face tap
      setSwipeOffset(0)
    }
  }

  const mergedIds = (item as any)._mergedIds as string[] | undefined
  const isMergedRow = !!mergedIds?.length

  const handleQtyChange = (delta: number) => {
    if (isMergedRow) return
    const newQty = Math.max(1, qty + delta)
    onUpdateItem(item.id, { qty: newQty })
  }

  const showDeleteStrip = Math.abs(swipeOffset) > 5
  const deleteStripOpacity = Math.min(1, Math.abs(swipeOffset) / 80)

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete action background – vizibil doar la swipe, ca să nu apară bloc roșu în colț */}
      {showDeleteStrip && (
        <div
          className="absolute inset-y-0 right-0 w-20 flex items-center justify-center pointer-events-none"
          style={{ opacity: deleteStripOpacity }}
          aria-hidden
        >
          <div className="w-full h-full bg-red-500" />
        </div>
      )}
      {showDeleteStrip && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 min-h-[44px] min-w-[44px] h-12 w-12 text-white hover:text-white hover:bg-red-600 touch-manipulation pointer-events-auto"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label="Șterge"
        >
          <Trash2 className="h-6 w-6" />
        </Button>
      )}

      {/* Card content */}
      <div
        ref={cardRef}
        className={cn(
          "relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-transform touch-manipulation",
          item.urgent && "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
        )}
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardTap}
      >
        <div className="p-4">
          {/* Header: Serviciu + Urgent */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {item.urgent && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-[10px] font-bold uppercase flex-shrink-0">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Urgent
                  </span>
                )}
                <span className={cn(
                  "text-sm font-medium truncate",
                  isInstrumentOnly ? "italic text-slate-400" : "text-slate-900 dark:text-slate-100"
                )}>
                  {serviceName}
                </span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
          </div>

          {/* Rezumat nereparabile (pentru fiecare instrument) */}
          {nonRepairableQty > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
              {nonRepairableQty} buc nereparabile, {repairableQty} reparabile
            </p>
          )}

          {/* Footer: Cantitate, Preț, Total */}
          <div className="flex items-center justify-between">
            {/* Stepper cantitate — dezactivat pentru rând consolidat */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="min-h-[44px] min-w-[44px] h-10 w-10 rounded-xl touch-manipulation"
                onClick={(e) => {
                  e.stopPropagation()
                  handleQtyChange(-1)
                }}
                disabled={qty <= 1 || isMergedRow}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-9 text-center text-sm font-medium tabular-nums">{qty}</span>
              <Button
                variant="outline"
                size="icon"
                className="min-h-[44px] min-w-[44px] h-10 w-10 rounded-xl touch-manipulation"
                onClick={(e) => {
                  e.stopPropagation()
                  handleQtyChange(1)
                }}
                disabled={isMergedRow}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Preț și Total */}
            <div className="flex items-center gap-3 text-right">
              <div className="text-xs text-muted-foreground">
                {item.price.toFixed(2)} RON
              </div>
              <div className={cn(
                "text-sm font-semibold",
                item.urgent ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-500"
              )}>
                {lineTotal.toFixed(2)} RON
              </div>
            </div>
          </div>

          {/* Non-repairable indicator */}
          {nonRepairableQty > 0 && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              {nonRepairableQty} din {qty} nereparabile
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
