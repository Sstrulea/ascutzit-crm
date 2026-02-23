'use client'

import { useState, useRef } from 'react'
import { Plus, Minus, X, Tag, Check, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface BrandSerialGroup {
  id: string
  brand: string
  qty: number
  serialNumbers: Array<{
    id: string
    serial: string
    garantie: boolean
  }>
}

interface MobileBrandSerialSectionProps {
  brandSerialGroups: BrandSerialGroup[]
  onAddGroup?: () => void
  onRemoveGroup?: (groupId: string) => void
  onUpdateBrand?: (groupId: string, brand: string) => void
  onUpdateQty?: (groupId: string, qty: number) => void
  onAddSerial?: (groupId: string) => void
  onRemoveSerial?: (groupId: string, serialId: string) => void
  onUpdateSerial?: (groupId: string, serialId: string, serial: string) => void
  onUpdateGarantie?: (groupId: string, serialId: string, garantie: boolean) => void
}

export function MobileBrandSerialSection({
  brandSerialGroups = [],
  onAddGroup,
  onRemoveGroup,
  onUpdateBrand,
  onUpdateQty,
  onAddSerial,
  onRemoveSerial,
  onUpdateSerial,
  onUpdateGarantie,
}: MobileBrandSerialSectionProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({})
  const touchStartX = useRef<Record<string, number>>({})

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupId)) {
        newSet.delete(groupId)
      } else {
        newSet.add(groupId)
      }
      return newSet
    })
  }

  // Touch handlers pentru swipe pe seriale
  const handleSerialTouchStart = (serialKey: string, e: React.TouchEvent) => {
    touchStartX.current[serialKey] = e.touches[0].clientX
  }

  const handleSerialTouchMove = (serialKey: string, e: React.TouchEvent) => {
    const startX = touchStartX.current[serialKey]
    if (startX === undefined) return

    const deltaX = e.touches[0].clientX - startX
    // Permite doar swipe la stânga
    if (deltaX < 0) {
      setSwipeOffsets(prev => ({
        ...prev,
        [serialKey]: Math.max(-60, deltaX)
      }))
    }
  }

  const handleSerialTouchEnd = (serialKey: string) => {
    const offset = swipeOffsets[serialKey] || 0
    if (offset < -30) {
      setSwipeOffsets(prev => ({ ...prev, [serialKey]: -60 }))
    } else {
      setSwipeOffsets(prev => ({ ...prev, [serialKey]: 0 }))
    }
    delete touchStartX.current[serialKey]
  }

  if (brandSerialGroups.length === 0) {
    return (
      <div className="mt-4 space-y-3">
        <Separator />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Brand & Serial</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={onAddGroup}
          >
            <Plus className="h-4 w-4 mr-1" />
            Adaugă brand
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Adaugă informații despre brand și numere de serie pentru acest instrument
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      <Separator />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Brand & Serial</span>
          <span className="text-xs text-muted-foreground">
            ({brandSerialGroups.length} {brandSerialGroups.length === 1 ? 'grup' : 'grupuri'})
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={onAddGroup}
        >
          <Plus className="h-4 w-4 mr-1" />
          Adaugă
        </Button>
      </div>

      <div className="space-y-3">
        {brandSerialGroups.map((group, groupIdx) => {
          const isExpanded = expandedGroups.has(group.id)
          const totalSerials = group.serialNumbers?.length || 0

          return (
            <div
              key={group.id}
              className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
            >
              {/* Header grup */}
              <div 
                className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 cursor-pointer"
                onClick={() => toggleGroup(group.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Input
                      value={group.brand}
                      onFocus={(e) => { e.target.select(); e.stopPropagation() }}
                      onChange={(e) => {
                        e.stopPropagation()
                        onUpdateBrand?.(group.id, e.target.value)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-9 flex-1"
                      placeholder="Nume brand..."
                    />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          onUpdateQty?.(group.id, Math.max(1, group.qty - 1))
                        }}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{group.qty}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          onUpdateQty?.(group.id, group.qty + 1)
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveGroup?.(group.id)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>

              {/* Lista seriale (expandabil) */}
              {isExpanded && (
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">
                      Numere de serie ({totalSerials})
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onAddSerial?.(group.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Adaugă serial
                    </Button>
                  </div>

                  {group.serialNumbers?.map((sn, snIdx) => {
                    const serialKey = `${group.id}-${sn.id}`
                    const offset = swipeOffsets[serialKey] || 0

                    return (
                      <div key={sn.id} className="relative overflow-hidden rounded-lg">
                        {/* Delete background */}
                        <div 
                          className="absolute inset-y-0 right-0 w-16 bg-red-500 flex items-center justify-center"
                          style={{ opacity: Math.abs(offset) / 60 }}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-white hover:text-white"
                            onClick={() => onRemoveSerial?.(group.id, sn.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Serial row */}
                        <div
                          className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg transition-transform"
                          style={{ transform: `translateX(${offset}px)` }}
                          onTouchStart={(e) => handleSerialTouchStart(serialKey, e)}
                          onTouchMove={(e) => handleSerialTouchMove(serialKey, e)}
                          onTouchEnd={() => handleSerialTouchEnd(serialKey)}
                        >
                          <Input
                            value={sn.serial}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => onUpdateSerial?.(group.id, sn.id, e.target.value)}
                            className="h-9 flex-1"
                            placeholder={`Serial ${snIdx + 1}...`}
                          />
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Label className="text-xs text-muted-foreground">Garanție</Label>
                            <Switch
                              checked={sn.garantie}
                              onCheckedChange={(checked) => onUpdateGarantie?.(group.id, sn.id, checked)}
                              className="scale-90"
                            />
                            {sn.garantie && (
                              <Check className="h-4 w-4 text-emerald-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {totalSerials === 0 && (
                    <div className="text-center py-4 text-xs text-muted-foreground">
                      Nu există numere de serie. Apasă "Adaugă serial" pentru a adăuga.
                    </div>
                  )}
                </div>
              )}

              {/* Preview seriale când este collapsat */}
              {!isExpanded && totalSerials > 0 && (
                <div className="px-3 pb-2">
                  <div className="flex flex-wrap gap-1">
                    {group.serialNumbers.slice(0, 3).map((sn, snIdx) => (
                      <span
                        key={sn.id}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px]",
                          sn.garantie
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                        )}
                      >
                        {sn.serial || `Serial ${snIdx + 1}`}
                        {sn.garantie && ' ✓'}
                      </span>
                    ))}
                    {totalSerials > 3 && (
                      <span className="text-[10px] text-muted-foreground px-1">
                        +{totalSerials - 3} mai multe
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
