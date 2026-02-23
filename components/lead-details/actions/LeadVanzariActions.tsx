/**
 * Componentă pentru acțiunile rapide în pipeline-ul Vânzări
 * 
 * Butoane pentru setarea callback-ului: Mâine, 3 zile, Săptămână, Lună, 3 Luni, Calendar custom
 * După expirarea termenului (gestionat de cron job), lead-ul revine la Leaduri.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Phone, PhoneOff, Calendar, CalendarDays, Clock, Ban, Save } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { cn, formatCallbackDateDisplay } from "@/lib/utils"
import { addDays, addWeeks, addMonths, format } from "date-fns"
import { ro } from "date-fns/locale"
import { toast } from "sonner"

type CallbackOptionValue = 'tomorrow' | '3days' | 'week' | 'month' | '3months' | 'custom'

interface LeadVanzariActionsProps {
  isVanzariPipeline: boolean
  stages: string[]
  currentStage?: string | null
  callbackDate?: string | null
  onApelat: (callbackDate: string, targetStage: string) => Promise<void>
  onRevenireLaLeaduri: () => Promise<void>
  loading?: boolean
  noDeal?: boolean
  nuRaspunde?: boolean
  nuRaspundeCallbackAt?: string | null
  onNoDealChange?: (checked: boolean) => void
  onNuRaspundeChange?: (checked: boolean, callbackTime?: string) => void
  isVanzator?: boolean
}

function normStage(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

type CallbackOption = {
  label: string
  value: CallbackOptionValue
  getDate: () => Date
}

const CALLBACK_OPTIONS: CallbackOption[] = [
  { label: 'Mâine', value: 'tomorrow', getDate: () => addDays(new Date(), 1) },
  { label: '3 zile', value: '3days', getDate: () => addDays(new Date(), 3) },
  { label: 'Săptămână', value: 'week', getDate: () => addWeeks(new Date(), 1) },
  { label: 'Lună', value: 'month', getDate: () => addMonths(new Date(), 1) },
  { label: '3 luni', value: '3months', getDate: () => addMonths(new Date(), 3) },
]

export function LeadVanzariActions({
  isVanzariPipeline,
  stages,
  currentStage,
  callbackDate,
  onApelat,
  onRevenireLaLeaduri,
  loading = false,
  noDeal = false,
  nuRaspunde = false,
  nuRaspundeCallbackAt,
  onNoDealChange,
  onNuRaspundeChange,
  isVanzator = true,
}: LeadVanzariActionsProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [callbackHour, setCallbackHour] = useState('09')
  const [callbackMinute, setCallbackMinute] = useState('00')
  const [pendingOption, setPendingOption] = useState<CallbackOptionValue | null>(null)
  const [showNuRaspundeDialog, setShowNuRaspundeDialog] = useState(false)
  const [nuRaspundeHour, setNuRaspundeHour] = useState('09')
  const [nuRaspundeMinute, setNuRaspundeMinute] = useState('00')

  const hours = Array.from({ length: 11 }, (_, i) => String(i + 8).padStart(2, '0'))
  const minutes = ['00', '15', '30', '45']

  if (!isVanzariPipeline) return null

  const s = normStage(currentStage || '')
  const isInCallback = /callback|call_back|call-back/.test(s)

  const formatNuRaspundeTime = (val: string | null | undefined) => {
    if (!val) return null
    try {
      return format(new Date(val), 'HH:mm', { locale: ro })
    } catch { return null }
  }
  const nuRaspundeTimeDisplay = formatNuRaspundeTime(nuRaspundeCallbackAt)

  // Găsește stage-ul CALLBACK
  const callbackStage = stages.find(stage => {
    const stageUpper = stage.toUpperCase()
    return stageUpper === 'CALLBACK' || 
           stageUpper === 'CALL BACK' ||
           stageUpper === 'CALL-BACK' ||
           stageUpper.includes('CALLBACK')
  })

  // Găsește stage-ul LEADURI
  const leaduriStage = stages.find(stage => {
    const stageUpper = stage.toUpperCase()
    return stageUpper === 'LEADS' || 
           stageUpper === 'LEAD' ||
           stageUpper === 'LEADURI' ||
           stageUpper.includes('LEADS') ||
           stageUpper.includes('LEAD')
  })

  const applyTime = (date: Date): Date => {
    const d = new Date(date)
    d.setHours(parseInt(callbackHour, 10), parseInt(callbackMinute, 10), 0, 0)
    return d
  }

  const handleCallback = async (date: Date, label: string) => {
    if (!callbackStage) {
      toast.error('Stage-ul CallBack nu există în acest pipeline')
      return
    }

    const d = applyTime(date)
    const callbackDateValue = d.toISOString()
    
    try {
      await onApelat(callbackDateValue, callbackStage)
      toast.success(`Callback setat: ${formatCallbackDateDisplay(callbackDateValue)} (${label})`)
    } catch (error) {
      console.error('[LeadVanzariActions] Eroare la setare callback:', error)
      toast.error('Eroare la setarea callback-ului')
    }
  }

  const handleSelectDateOnly = (date: Date | undefined) => {
    if (!date) return
    setSelectedDate(date)
    setPendingOption('custom')
    setCalendarOpen(false)
  }

  const canSave = Boolean(
    callbackStage &&
    !loading &&
    (pendingOption !== 'custom' || selectedDate)
  )

  const getPendingDate = (): Date | null => {
    if (pendingOption === 'custom') return selectedDate ?? null
    if (pendingOption) {
      const opt = CALLBACK_OPTIONS.find(o => o.value === pendingOption)
      return opt ? opt.getDate() : null
    }
    return addDays(new Date(), 1)
  }

  const getPendingLabel = (): string => {
    if (pendingOption === 'custom') return 'dată personalizată'
    if (pendingOption) {
      const opt = CALLBACK_OPTIONS.find(o => o.value === pendingOption)
      return opt?.label ?? ''
    }
    return 'Mâine'
  }

  const handleSalvare = async () => {
    const date = getPendingDate()
    if (!date || !callbackStage) return
    await handleCallback(date, getPendingLabel())
  }

  const handleRevenire = async () => {
    if (!leaduriStage) {
      toast.error('Stage-ul Leaduri nu există în acest pipeline')
      return
    }

    try {
      await onRevenireLaLeaduri()
      toast.success(`Lead revenit în ${leaduriStage}`)
    } catch (error) {
      console.error('[LeadVanzariActions] Eroare la revenire:', error)
      toast.error('Eroare la revenirea lead-ului')
    }
  }

  return (
    <div className="mb-1.5 p-2 bg-muted/50 rounded-lg space-y-2">
      <div className="flex items-center gap-2">
        <Phone className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Callback · No Deal · Nu răspunde</span>
      </div>

      {/* Toate butoanele pe un singur rând: No Deal, Nu răspunde, Mâine … Calendar, Ora, Salvare */}
      <div className="flex flex-wrap items-center gap-2">
        {noDeal ? (
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50">
            <span className="text-xs font-medium text-red-700 dark:text-red-300 flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5" />
              No Deal activ
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNoDealChange?.(false)}
              disabled={!isVanzator}
              className="h-6 px-2 text-xs text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/50"
              title="Anulează statusul No Deal"
            >
              Anulează
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNoDealChange?.(true)}
            disabled={!isVanzator}
            className="h-8 px-3 text-xs gap-1.5 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50"
            title="Marchează lead-ul ca No Deal (nu s-a încheiat tranzacția)"
          >
            <Ban className="h-3.5 w-3.5" />
            No Deal
          </Button>
        )}
        {nuRaspunde ? (
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <PhoneOff className="h-3.5 w-3.5" />
              Nu răspunde{nuRaspundeTimeDisplay ? ` (${nuRaspundeTimeDisplay})` : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNuRaspundeChange?.(false)}
              disabled={!isVanzator}
              className="h-6 px-2 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50"
              title="Anulează statusul Nu răspunde"
            >
              Anulează
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNuRaspundeDialog(true)}
            disabled={!isVanzator}
            className="h-8 px-3 text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/50"
            title="Marchează că clientul nu răspunde - selectează ora pentru callback"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            Nu răspunde
          </Button>
        )}

        {CALLBACK_OPTIONS.map((option) => {
          const isActive = !isInCallback && pendingOption === option.value
          return (
            <Button
              key={option.value}
              variant="outline"
              size="sm"
              onClick={() => setPendingOption(option.value)}
              disabled={loading || isInCallback}
              className={cn(
                "flex items-center gap-1.5 h-8 px-3 text-xs shrink-0",
                isInCallback && "opacity-50",
                isActive && "bg-gray-100 dark:bg-gray-800 border-gray-400 dark:border-gray-500 text-gray-800 dark:text-gray-200 font-semibold ring-1 ring-gray-300 dark:ring-gray-600"
              )}
              title={`Setează callback pentru ${option.label.toLowerCase()}`}
            >
              <Clock className="h-3 w-3" />
              {option.label}
            </Button>
          )
        })}

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingOption('custom')}
              disabled={loading || isInCallback}
              className={cn(
                "flex items-center gap-1.5 h-8 px-3 text-xs shrink-0",
                isInCallback && "opacity-50",
                !isInCallback && pendingOption === 'custom' && "bg-gray-100 dark:bg-gray-800 border-gray-400 dark:border-gray-500 text-gray-800 dark:text-gray-200 font-semibold ring-1 ring-gray-300 dark:ring-gray-600"
              )}
              title="Selectează o dată personalizată pentru callback"
            >
              <CalendarDays className="h-3 w-3" />
              Calendar
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={selectedDate}
              onSelect={handleSelectDateOnly}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              locale={ro}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Label className="text-xs text-muted-foreground whitespace-nowrap shrink-0">Ora:</Label>
        <Select value={callbackHour} onValueChange={setCallbackHour}>
          <SelectTrigger className="h-8 w-[72px] text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hours.map((h) => (
              <SelectItem key={h} value={h}>{h}:00</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={callbackMinute} onValueChange={setCallbackMinute}>
          <SelectTrigger className="h-8 w-[72px] text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {minutes.map((m) => (
              <SelectItem key={m} value={m}>:{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={handleSalvare}
          className="h-8 px-3 text-xs gap-1.5 bg-gray-600 hover:bg-gray-700 text-white shrink-0"
          title="Salvează callback-ul setat și mută lead-ul în stage-ul Callback"
        >
          <Save className="h-3 w-3" />
          Salvare
        </Button>
      </div>

      {isInCallback && (
        <div className="flex items-center gap-3 pt-2 border-t border-border/50 mt-2">
          {callbackDate && (
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Callback programat: {formatCallbackDateDisplay(callbackDate)}
            </span>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={handleRevenire}
            disabled={loading}
            className="flex items-center gap-1.5 h-7 bg-blue-600 hover:bg-blue-700"
            title="Revine lead-ul în stage-ul Leaduri după callback"
          >
            <PhoneOff className="h-3 w-3" />
            Revino la Leaduri
          </Button>
        </div>
      )}

      {/* Dialog Nu Răspunde — selectare oră */}
      <Dialog
        open={showNuRaspundeDialog}
        onOpenChange={(open) => {
          setShowNuRaspundeDialog(open)
          if (!open) {
            setNuRaspundeHour('09')
            setNuRaspundeMinute('00')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Când să sunăm din nou?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Selectează ora pentru astăzi ({format(new Date(), 'dd MMMM yyyy', { locale: ro })})
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <Label>Ora</Label>
                <Select value={nuRaspundeHour} onValueChange={setNuRaspundeHour}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hours.map((h) => (
                      <SelectItem key={h} value={h}>{h}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <Label>Minute</Label>
                <Select value={nuRaspundeMinute} onValueChange={setNuRaspundeMinute}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {minutes.map((m) => (
                      <SelectItem key={m} value={m}>:{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                <Clock className="inline h-4 w-4 mr-1" />
                Ora programată: {nuRaspundeHour}:{nuRaspundeMinute}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowNuRaspundeDialog(false)} title="Anulează setarea orei pentru Nu răspunde">
              Anulează
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600"
              onClick={() => {
                const today = new Date()
                today.setHours(parseInt(nuRaspundeHour, 10), parseInt(nuRaspundeMinute, 10), 0, 0)
                onNuRaspundeChange?.(true, today.toISOString())
                setShowNuRaspundeDialog(false)
              }}
              title="Confirmă ora setată pentru callback Nu răspunde"
            >
              Confirmă
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
