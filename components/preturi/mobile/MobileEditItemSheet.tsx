'use client'

import { useState, useEffect } from 'react'
import { Trash2, Minus, Plus, AlertTriangle, Tag, Check } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface MobileEditItemSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: LeadQuoteItem | null
  services: Service[]
  instruments: Array<{ id: string; name: string; repairable?: boolean }>
  technicians?: Array<{ id: string; name: string }>
  canEditUrgentAndSubscription?: boolean
  canChangeTechnician?: boolean
  onUpdateItem: (id: string, patch: Partial<LeadQuoteItem>) => void
  onDelete: (id: string) => void
}

export function MobileEditItemSheet({
  open,
  onOpenChange,
  item,
  services,
  instruments,
  technicians = [],
  canEditUrgentAndSubscription = false,
  canChangeTechnician = false,
  onUpdateItem,
  onDelete,
}: MobileEditItemSheetProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  
  // Local state pentru editare
  const [localQty, setLocalQty] = useState(1)
  const [localPrice, setLocalPrice] = useState(0)
  const [localNameSnapshot, setLocalNameSnapshot] = useState('')
  const [localBrand, setLocalBrand] = useState('')
  const [localSerialNumber, setLocalSerialNumber] = useState('')
  const [localNonRepairableQty, setLocalNonRepairableQty] = useState(0)
  const [localUrgent, setLocalUrgent] = useState(false)

  // Sincronizează state-ul local cu item-ul
  useEffect(() => {
    if (item) {
      setLocalQty(item.qty || 1)
      setLocalPrice(item.price || 0)
      setLocalNameSnapshot(item.name_snapshot || '')
      setLocalBrand(item.brand || '')
      setLocalSerialNumber(item.serial_number || '')
      setLocalNonRepairableQty(Number((item as any).unrepaired_qty ?? (item as any).non_repairable_qty) || 0)
      setLocalUrgent(item.urgent || false)
    }
  }, [item])

  if (!item) return null

  const safeServices = Array.isArray(services) ? services : []
  const safeInstruments = Array.isArray(instruments) ? instruments : []

  // Determină tipul itemului
  const isService = item.item_type === 'service'
  const isPart = item.item_type === 'part'
  const isInstrumentOnly = item.item_type === null && item.instrument_id

  // Determină numele serviciului/piesei
  const itemName = isService 
    ? item.name_snapshot 
    : isPart 
      ? localNameSnapshot || 'Piesă'
      : isInstrumentOnly
        ? '(fără serviciu)'
        : ''

  // Determină instrumentul
  let instrumentName = ''
  if (item.instrument_id) {
    const inst = safeInstruments.find(i => i.id === item.instrument_id)
    instrumentName = inst?.name || ''
  } else if (item.service_id) {
    const svc = safeServices.find(s => s.id === item.service_id)
    if (svc?.instrument_id) {
      const inst = safeInstruments.find(i => i.id === svc.instrument_id)
      instrumentName = inst?.name || ''
    }
  }

  // Brand/Serial groups
  const brandGroups = Array.isArray((item as any)?.brand_groups) ? (item as any).brand_groups : []
  const hasBrandGroups = brandGroups.length > 0
  const canEditBrandSerial = !hasBrandGroups // Poate edita brand/serial doar dacă nu are brand_groups

  // Calculează totalul
  const repairableQty = Math.max(0, localQty - localNonRepairableQty)
  const lineTotal = repairableQty * localPrice

  const mergedIds = (item as any)._mergedIds as string[] | undefined
  const isMergedRow = !!mergedIds?.length

  const handleSave = () => {
    const patch: Partial<LeadQuoteItem> = {
      qty: localQty,
    }

    if (isPart) {
      patch.price = localPrice
      patch.name_snapshot = localNameSnapshot
    }

    if (canEditBrandSerial) {
      patch.brand = localBrand || null
      patch.serial_number = localSerialNumber || null
    }

    patch.non_repairable_qty = localNonRepairableQty

    if (canEditUrgentAndSubscription) {
      patch.urgent = localUrgent
    }

    if (isMergedRow) {
      // Rând consolidat: aplicăm doar câmpurile „per linie” la toate id-urile (fără qty/non_repairable)
      const { qty: _q, non_repairable_qty: _n, ...patchForAll } = patch
      mergedIds!.forEach((id) => onUpdateItem(id, patchForAll))
    } else {
      onUpdateItem(item.id, patch)
    }
    onOpenChange(false)
  }

  const handleDelete = () => {
    if (isMergedRow) mergedIds!.forEach((id) => onDelete(id))
    else onDelete(item.id)
    setDeleteDialogOpen(false)
    onOpenChange(false)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="bottom" 
          className="h-auto max-h-[85vh] rounded-t-2xl p-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
          title="Editare poziție"
        >
          {/* Header cu drag handle */}
          <div className="flex flex-col items-center pt-3 pb-2">
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
          </div>

          <SheetHeader className="px-4 pb-2">
            <SheetTitle className="text-lg flex items-center gap-2">
              {item.urgent && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-bold uppercase">
                  <AlertTriangle className="h-3 w-3" />
                  Urgent
                </span>
              )}
              {itemName}
            </SheetTitle>
            {instrumentName && (
              <p className="text-sm text-muted-foreground">{instrumentName}</p>
            )}
          </SheetHeader>

          <div className="px-4 py-4 space-y-6 overflow-y-auto">
            {/* Cantitate — dezactivată pentru rând consolidat (mai multe intrări) */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Cantitate</Label>
              {isMergedRow && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Cantitate din mai multe rânduri – reuniți mai întâi pentru a edita.
                </p>
              )}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12"
                  onClick={() => setLocalQty(Math.max(1, localQty - 1))}
                  disabled={localQty <= 1 || isMergedRow}
                >
                  <Minus className="h-5 w-5" />
                </Button>
                <Input
                  type="number"
                  value={localQty}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => !isMergedRow && setLocalQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-12 text-center text-lg font-medium flex-1"
                  min={1}
                  readOnly={isMergedRow}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12"
                  onClick={() => setLocalQty(localQty + 1)}
                  disabled={isMergedRow}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Preț (doar pentru piese) */}
            {isPart && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Preț (RON)</Label>
                <Input
                  type="number"
                  value={localPrice}
                  onChange={(e) => setLocalPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="h-12 text-lg"
                  step="0.01"
                  min={0}
                />
              </div>
            )}

            {/* Nume piesă (doar pentru piese) */}
            {isPart && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nume piesă</Label>
                <Input
                  value={localNameSnapshot}
                  onChange={(e) => setLocalNameSnapshot(e.target.value)}
                  className="h-12"
                  placeholder="Nume piesă..."
                />
              </div>
            )}

            {/* Brand/Serial (dacă nu are brand_groups) */}
            {canEditBrandSerial && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Brand & Serial</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Brand</Label>
                      <Input
                        value={localBrand}
                        onChange={(e) => setLocalBrand(e.target.value)}
                        className="h-10"
                        placeholder="Brand..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Serial</Label>
                      <Input
                        value={localSerialNumber}
                        onChange={(e) => setLocalSerialNumber(e.target.value)}
                        className="h-10"
                        placeholder="Serial..."
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Brand groups (readonly display) */}
            {hasBrandGroups && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Brand & Serial</span>
                  </div>
                  <div className="space-y-2">
                    {brandGroups.map((bg: any, idx: number) => (
                      <div 
                        key={idx}
                        className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg"
                      >
                        <div className="font-medium text-sm">{bg.brand || 'Brand'}</div>
                        {bg.serialNumbers?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {bg.serialNumbers.map((sn: any, snIdx: number) => {
                              const serial = typeof sn === 'string' ? sn : sn?.serial || ''
                              const garantie = typeof sn === 'object' ? sn?.garantie : false
                              return (
                                <span
                                  key={snIdx}
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-xs",
                                    garantie 
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                  )}
                                >
                                  {serial || `Serial ${snIdx + 1}`}
                                  {garantie && ' ✓'}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Cantitate nereparabilă — dezactivată pentru rând consolidat */}
            <Separator />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Nereparabile</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Câte bucăți din cantitate nu se pot repara
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => setLocalNonRepairableQty(Math.max(0, localNonRepairableQty - 1))}
                  disabled={localNonRepairableQty <= 0 || isMergedRow}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={localNonRepairableQty}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => !isMergedRow && setLocalNonRepairableQty(Math.min(localQty, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="h-10 text-center font-medium w-20"
                  min={0}
                  max={localQty}
                  readOnly={isMergedRow}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => setLocalNonRepairableQty(Math.min(localQty, localNonRepairableQty + 1))}
                  disabled={localNonRepairableQty >= localQty || isMergedRow}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">din {localQty}</span>
              </div>
            </div>

            {/* Urgent toggle (dacă are permisiune) */}
            {canEditUrgentAndSubscription && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      Urgent (+30%)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Adaugă 30% la preț pentru urgență
                    </p>
                  </div>
                  <Switch
                    checked={localUrgent}
                    onCheckedChange={setLocalUrgent}
                  />
                </div>
              </>
            )}

            {/* Total */}
            <Separator />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium">Total linie</span>
              <span className={cn(
                "text-xl font-bold",
                item.urgent || localUrgent ? "text-red-600" : "text-emerald-600"
              )}>
                {lineTotal.toFixed(2)} RON
              </span>
            </div>
          </div>

          <SheetFooter className="px-4 pb-4 pt-2 flex-row gap-2">
            <Button
              variant="destructive"
              className="h-12 flex-1"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Șterge
            </Button>
            <Button
              className="h-12 flex-[2]"
              onClick={handleSave}
            >
              <Check className="h-4 w-4 mr-2" />
              Salvează
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Dialog confirmare ștergere */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmare ștergere</AlertDialogTitle>
            <AlertDialogDescription>
              Ești sigur că vrei să ștergi această poziție? Acțiunea nu poate fi anulată.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Șterge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
