/**
 * MODUL VÂNZARI - VANZARI PANEL
 * ===================================
 * Panel principal pentru acțiuni vânzări în Lead Details
 * 
 * Funcționalități:
 * - Buton Callback cu dialog
 * - Buton "Nu Răspunde" cu dialog
 * - Buton No Deal
 * - Buton Curier Trimis cu dialog
 * - Buton Office Direct cu dialog
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Calendar,
  Clock,
  X,
  Check,
  Package,
  Building,
  Phone,
  Loader2
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  setLeadCallback,
  setLeadNuRaspunde,
  setLeadNoDeal,
  setLeadCurierTrimis,
  setLeadOfficeDirect
} from '@/lib/vanzari'
import type { CallbackOptions } from '@/lib/vanzari'

interface VanzariPanelProps {
  leadId: string
  leadName?: string
  leadPhone?: string
}

// Callback rapide (butoane predefinite)
const CALLBACK_OPTIONS: { label: string; duration: string; value: string }[] = [
  { label: 'În 15 min', duration: '15m', value: '15' },
  { label: 'În 30 min', duration: '30m', value: '30' },
  { label: 'În 1 oră', duration: '1h', value: '60' },
  { label: 'În 2 ore', duration: '2h', value: '120' },
  { label: 'Mâine la 9:00', duration: 'Tomorrow 9am', value: 'tomorrow-9' },
]

export function VanzariPanel({ leadId, leadName, leadPhone }: VanzariPanelProps) {
  // Callback state
  const [callbackDialogOpen, setCallbackDialogOpen] = useState(false)
  const [selectedCallbackTime, setSelectedCallbackTime] = useState<string | null>(null)
  const [customCallbackDate, setCustomCallbackDate] = useState('')
  const [customCallbackTime, setCustomCallbackTime] = useState('')
  const [isSettingCallback, setIsSettingCallback] = useState(false)

  // Nu Răspunde state
  const [nuRaspundeDialogOpen, setNuRaspundeDialogOpen] = useState(false)
  const [nuRaspundeTime, setNuRaspundeTime] = useState('15:00')
  const [isSettingNuRaspunde, setIsSettingNuRaspunde] = useState(false)

  // Curier Trimis state
  const [curierTrimisDialogOpen, setCurierTrimisDialogOpen] = useState(false)
  const [curierTrimisDate, setCurierTrimisDate] = useState('')
  const [curierTrimisTime, setCurierTrimisTime] = useState('10:00')
  const [isSettingCurierTrimis, setIsSettingCurierTrimis] = useState(false)

  // Office Direct state
  const [officeDirectDialogOpen, setOfficeDirectDialogOpen] = useState(false)
  const [officeDirectDate, setOfficeDirectDate] = useState('')
  const [officeDirectTime, setOfficeDirectTime] = useState('10:00')
  const [isSettingOfficeDirect, setIsSettingOfficeDirect] = useState(false)

  // No Deal state
  const [isSettingNoDeal, setIsSettingNoDeal] = useState(false)

  /**
   * Setează callback cu buton rapid
   */
  async function handleQuickCallback(durationMinutes: number) {
    setIsSettingCallback(true)
    try {
      const callbackDate = new Date()
      callbackDate.setMinutes(callbackDate.getMinutes() + durationMinutes)

      const result = await setLeadCallback(leadId, callbackDate, {
        callbackType: 'button_rapid',
        callbackDuration: `${durationMinutes}m`,
        buttonLabel: CALLBACK_OPTIONS.find(opt => opt.value === durationMinutes.toString())?.label
      })

      if (result.error) throw result.error
      toast.success(`Callback programat pentru ${durationMinutes} minute`)
      setCallbackDialogOpen(false)
      setSelectedCallbackTime(null)
    } catch (error: any) {
      console.error('[VanzariPanel] Error setting callback:', error)
      toast.error(error.message || 'Eroare la setare callback')
    } finally {
      setIsSettingCallback(false)
    }
  }

  /**
   * Setează callback pentru mâine la 9:00
   */
  async function handleTomorrowCallback() {
    setIsSettingCallback(true)
    try {
      const callbackDate = new Date()
      callbackDate.setDate(callbackDate.getDate() + 1)
      callbackDate.setHours(9, 0, 0, 0)

      const result = await setLeadCallback(leadId, callbackDate, {
        callbackType: 'button_rapid',
        callbackDuration: 'Tomorrow 9am',
        buttonLabel: 'Mâine la 9:00'
      })

      if (result.error) throw result.error
      toast.success('Callback programat pentru mâine la 9:00')
      setCallbackDialogOpen(false)
      setSelectedCallbackTime(null)
    } catch (error: any) {
      console.error('[VanzariPanel] Error setting callback:', error)
      toast.error(error.message || 'Eroare la setare callback')
    } finally {
      setIsSettingCallback(false)
    }
  }

  /**
   * Setează callback custom
   */
  async function handleCustomCallback() {
    if (!customCallbackDate || !customCallbackTime) {
      toast.error('Completează data și ora')
      return
    }

    setIsSettingCallback(true)
    try {
      const [year, month, day] = customCallbackDate.split('-').map(Number)
      const [hours, minutes] = customCallbackTime.split(':').map(Number)

      const callbackDate = new Date(year, month - 1, day, hours, minutes, 0, 0)

      const result = await setLeadCallback(leadId, callbackDate, {
        callbackType: 'custom',
        buttonLabel: 'Custom'
      })

      if (result.error) throw result.error
      toast.success(`Callback programat pentru ${customCallbackDate} ${customCallbackTime}`)
      setCallbackDialogOpen(false)
      setCustomCallbackDate('')
      setCustomCallbackTime('')
    } catch (error: any) {
      console.error('[VanzariPanel] Error setting callback:', error)
      toast.error(error.message || 'Eroare la setare callback')
    } finally {
      setIsSettingCallback(false)
    }
  }

  /**
   * Setează "Nu Răspunde"
   */
  async function handleNuRaspunde() {
    if (!nuRaspundeTime) {
      toast.error('Completează ora de reapel')
      return
    }

    setIsSettingNuRaspunde(true)
    try {
      const result = await setLeadNuRaspunde(leadId, nuRaspundeTime)
      if (result.error) throw result.error
      toast.success(`Reapel programat pentru ${nuRaspundeTime}`)
      setNuRaspundeDialogOpen(false)
      setNuRaspundeTime('15:00')
    } catch (error: any) {
      console.error('[VanzariPanel] Error setting nu răspunde:', error)
      toast.error(error.message || 'Eroare la setare reapel')
    } finally {
      setIsSettingNuRaspunde(false)
    }
  }

  /**
   * Setează No Deal
   */
  async function handleNoDeal() {
    const confirmed = window.confirm('Ești sigur că vrei să marchezi acest lead ca No Deal?')
    if (!confirmed) return

    setIsSettingNoDeal(true)
    try {
      const result = await setLeadNoDeal(leadId)
      if (result.error) throw result.error
      toast.success('Lead marcat ca No Deal')
    } catch (error: any) {
      console.error('[VanzariPanel] Error setting no deal:', error)
      toast.error(error.message || 'Eroare la marcare No Deal')
    } finally {
      setIsSettingNoDeal(false)
    }
  }

  /**
   * Setează Curier Trimis
   */
  async function handleCurierTrimis() {
    if (!curierTrimisDate || !curierTrimisTime) {
      toast.error('Completează data și ora')
      return
    }

    setIsSettingCurierTrimis(true)
    try {
      const [year, month, day] = curierTrimisDate.split('-').map(Number)
      const [hours, minutes] = curierTrimisTime.split(':').map(Number)

      const scheduledDate = new Date(year, month - 1, day, hours, minutes, 0, 0)

      const result = await setLeadCurierTrimis(leadId, scheduledDate)
      if (result.error) throw result.error
      toast.success(`Curier trimis programat pentru ${curierTrimisDate} ${curierTrimisTime}`)
      toast.success(`Fișă de serviciu creată automat`)
      setCurierTrimisDialogOpen(false)
      setCurierTrimisDate('')
      setCurierTrimisTime('10:00')
    } catch (error: any) {
      console.error('[VanzariPanel] Error setting curier trimis:', error)
      toast.error(error.message || 'Eroare la setare curier trimis')
    } finally {
      setIsSettingCurierTrimis(false)
    }
  }

  /**
   * Setează Office Direct
   */
  async function handleOfficeDirect() {
    if (!officeDirectDate || !officeDirectTime) {
      toast.error('Completează data și ora')
      return
    }

    setIsSettingOfficeDirect(true)
    try {
      const [year, month, day] = officeDirectDate.split('-').map(Number)
      const [hours, minutes] = officeDirectTime.split(':').map(Number)

      const scheduledDate = new Date(year, month - 1, day, hours, minutes, 0, 0)

      const result = await setLeadOfficeDirect(leadId, scheduledDate)
      if (result.error) throw result.error
      toast.success(`Office direct programat pentru ${officeDirectDate} ${officeDirectTime}`)
      toast.success(`Fișă de serviciu creată automat`)
      setOfficeDirectDialogOpen(false)
      setOfficeDirectDate('')
      setOfficeDirectTime('10:00')
    } catch (error: any) {
      console.error('[VanzariPanel] Error setting office direct:', error)
      toast.error(error.message || 'Eroare la setare office direct')
    } finally {
      setIsSettingOfficeDirect(false)
    }
  }

  // Setează data default pentru curier și office direct (azi)
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Acțiuni Vânzări
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Lead Info */}
        {(leadName || leadPhone) && (
          <div className="p-3 bg-muted/50 rounded-lg border">
            <div className="text-sm font-medium">{leadName}</div>
            {leadPhone && (
              <div className="text-xs text-muted-foreground">{leadPhone}</div>
            )}
          </div>
        )}

        {/* Callback Button */}
        <Dialog open={callbackDialogOpen} onOpenChange={setCallbackDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => setSelectedCallbackTime(null)}
              data-button-id="setCallbackButton"
              aria-label="Setează Callback"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Setează Callback
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Setează Callback</DialogTitle>
              <DialogDescription>
                Alege o opțiune rapidă sau setează o dată custom
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Quick Callback Options */}
              <div>
                <Label>Callback Rapid</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {CALLBACK_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      variant={selectedCallbackTime === option.value ? 'default' : 'outline'}
                      onClick={() => {
                        setSelectedCallbackTime(option.value)
                        if (option.value === 'tomorrow-9') {
                          handleTomorrowCallback()
                        } else {
                          handleQuickCallback(parseInt(option.value))
                        }
                      }}
                      disabled={isSettingCallback}
                      className="justify-start"
                      data-button-id={`callback${option.value}Button`}
                      aria-label={option.label}
                    >
                      {option.duration === 'Tomorrow 9am' ? (
                        <Calendar className="h-4 w-4 mr-2" />
                      ) : (
                        <Clock className="h-4 w-4 mr-2" />
                      )}
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Custom Callback */}
              <div>
                <Label>Custom Data</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    type="date"
                    value={customCallbackDate}
                    onChange={(e) => setCustomCallbackDate(e.target.value)}
                    min={todayStr}
                    disabled={isSettingCallback}
                  />
                  <Input
                    type="time"
                    value={customCallbackTime}
                    onChange={(e) => setCustomCallbackTime(e.target.value)}
                    disabled={isSettingCallback}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCustomCallback}
                disabled={isSettingCallback || !customCallbackDate || !customCallbackTime}
                data-button-id="confirmCallbackButton"
                aria-label="Confirmă Callback"
              >
                {isSettingCallback ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Setează Callback
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Nu Răspunde Button */}
        <Dialog open={nuRaspundeDialogOpen} onOpenChange={setNuRaspundeDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start" data-button-id="nuRaspundeReapelButton" aria-label="Nu Răspunde - Reapel">
              <X className="h-4 w-4 mr-2" />
              Nu Răspunde (Reapel)
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nu Răspunde - Reapel</DialogTitle>
              <DialogDescription>
                Setează ora pentru reapelul clientului
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="nu-raspunde-time">Ora de Reapel</Label>
                <Input
                  id="nu-raspunde-time"
                  type="time"
                  value={nuRaspundeTime}
                  onChange={(e) => setNuRaspundeTime(e.target.value)}
                  disabled={isSettingNuRaspunde}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleNuRaspunde}
                disabled={isSettingNuRaspunde || !nuRaspundeTime}
                data-button-id="confirmNuRaspundeButton"
                aria-label="Confirmă Reapel"
              >
                {isSettingNuRaspunde ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Setează Reapel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* No Deal Button */}
        <Button
          variant="outline"
          className="w-full justify-start text-destructive hover:text-destructive"
          onClick={handleNoDeal}
          disabled={isSettingNoDeal}
          data-button-id="noDealButton"
          aria-label="Marchează ca No Deal"
        >
          {isSettingNoDeal ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <X className="h-4 w-4 mr-2" />
          )}
          No Deal
        </Button>

        {/* Curier Trimis Button */}
        <Dialog open={curierTrimisDialogOpen} onOpenChange={setCurierTrimisDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start" data-button-id="curierTrimisButton" aria-label="Curier Trimis">
              <Package className="h-4 w-4 mr-2" />
              Curier Trimis
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Trimite prin Curier</DialogTitle>
              <DialogDescription>
                Programează ridicarea prin curier. Va crea automat o fișă de serviciu.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="curier-date">Data Ridicării</Label>
                <Input
                  id="curier-date"
                  type="date"
                  value={curierTrimisDate}
                  onChange={(e) => setCurierTrimisDate(e.target.value)}
                  min={todayStr}
                  disabled={isSettingCurierTrimis}
                />
              </div>
              <div>
                <Label htmlFor="curier-time">Ora</Label>
                <Input
                  id="curier-time"
                  type="time"
                  value={curierTrimisTime}
                  onChange={(e) => setCurierTrimisTime(e.target.value)}
                  disabled={isSettingCurierTrimis}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCurierTrimis}
                disabled={isSettingCurierTrimis || !curierTrimisDate || !curierTrimisTime}
                data-button-id="confirmCurierTrimisButton"
                aria-label="Confirmă Trimite prin Curier"
              >
                {isSettingCurierTrimis ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Package className="h-4 w-4 mr-2" />
                )}
                Trimite prin Curier
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Office Direct Button */}
        <Dialog open={officeDirectDialogOpen} onOpenChange={setOfficeDirectDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start" data-button-id="officeDirectButton" aria-label="Office Direct">
              <Building className="h-4 w-4 mr-2" />
              Office Direct
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Venire Direct la Birou</DialogTitle>
              <DialogDescription>
                Programează venirea clientului direct la birou. Va crea automat o fișă de serviciu.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="office-date">Data Vizitei</Label>
                <Input
                  id="office-date"
                  type="date"
                  value={officeDirectDate}
                  onChange={(e) => setOfficeDirectDate(e.target.value)}
                  min={todayStr}
                  disabled={isSettingOfficeDirect}
                />
              </div>
              <div>
                <Label htmlFor="office-time">Ora</Label>
                <Input
                  id="office-time"
                  type="time"
                  value={officeDirectTime}
                  onChange={(e) => setOfficeDirectTime(e.target.value)}
                  disabled={isSettingOfficeDirect}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleOfficeDirect}
                disabled={isSettingOfficeDirect || !officeDirectDate || !officeDirectTime}
                data-button-id="confirmOfficeDirectButton"
                aria-label="Confirmă Programează Vizită"
              >
                {isSettingOfficeDirect ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Building className="h-4 w-4 mr-2" />
                )}
                Programează Vizită
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}