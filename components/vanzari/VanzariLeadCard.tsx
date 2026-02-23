/**
 * MODUL VÂNZARI - LEAD CARD
 * ==============================
 * Card special pentru lead-uri în pipeline-ul Vânzări
 * Include acțiuni rapide integrate
 */

'use client'

import { useState, useMemo } from 'react'
import { Phone, PhoneOff, XCircle, GripVertical, Calendar, Clock, Mail, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { format, formatDistanceToNow, isToday, isYesterday, addDays } from 'date-fns'
import { ro } from 'date-fns/locale'
import { useToast } from '@/hooks/use-toast'
import {
  VanzariCallbackOverlay,
  VanzariNuRaspundeOverlay,
  VanzariNoDealDialog,
  VanzariCurierTrimisOverlay,
  VanzariOfficeDirectOverlay
} from './index'
import { setLeadCallback, setLeadNuRaspunde, setLeadNoDeal, setLeadCurierTrimis, setLeadOfficeDirect } from '@/lib/vanzari'
import type { Lead } from '@/app/(crm)/dashboard/page'

interface VanzariLeadCardProps {
  lead: Lead
  onMove: (leadId: string, newStage: string) => void
  onClick: (event?: React.MouseEvent) => void
  onDragStart: () => void
  onDragEnd: () => void
  isDragging: boolean
  stages: string[]
  isSelected?: boolean
  onSelectChange?: (isSelected: boolean) => void
}

export function VanzariLeadCard({
  lead,
  onMove,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
  stages,
  isSelected = false,
  onSelectChange
}: VanzariLeadCardProps) {
  const [callbackOverlayOpen, setCallbackOverlayOpen] = useState(false)
  const [nuRaspundeOverlayOpen, setNuRaspundeOverlayOpen] = useState(false)
  const [noDealDialogOpen, setNoDealDialogOpen] = useState(false)
  const [curierTrimisOverlayOpen, setCurierTrimisOverlayOpen] = useState(false)
  const [officeDirectOverlayOpen, setOfficeDirectOverlayOpen] = useState(false)
  const [moveMenuOpen, setMoveMenuOpen] = useState(false)
  const { toast } = useToast()

  const leadAny = lead as any

  // Verifică dacă lead-ul are callback expirat
  const isCallbackExpired = useMemo(() => {
    const callbackDate = leadAny?.callback_date
    if (!callbackDate) return false
    return new Date(callbackDate) < new Date()
  }, [leadAny?.callback_date])

  // Verifică dacă lead-ul are reapel expirat
  const isNuRaspundeExpired = useMemo(() => {
    const nuRaspundeAt = leadAny?.nu_raspunde_callback_at
    if (!nuRaspundeAt) return false
    return new Date(nuRaspundeAt) < new Date()
  }, [leadAny?.nu_raspunde_callback_at])

  // Verifică dacă are tag "Suna!"
  const hasSunaTag = useMemo(() => {
    const tags = Array.isArray(lead?.tags) ? lead.tags : []
    return tags.some((t: any) => t?.name === 'Suna!')
  }, [lead?.tags])

  // Verifică dacă stage-ul permite afișarea tag-ului "Suna!" (doar LEADuri sau leaduri straine)
  const isStageAllowedForSuna = useMemo(() => {
    const stageLower = (lead.stage || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
    return stageLower === 'leaduri' || stageLower === 'leads' || stageLower.includes('leaduri straine') || stageLower.includes('leaduristraine')
  }, [lead.stage])

  // Formatare dată callback
  const formatCallbackTime = (date: string | undefined) => {
    if (!date) return null
    const d = new Date(date)
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    const diffDays = diffMs / (1000 * 60 * 60 * 24)

    let timeText = ''
    if (diffMs < 0) {
      timeText = 'Expirat'
    } else if (diffHours < 24) {
      timeText = `în ${Math.floor(diffHours)} ore`
    } else if (diffDays < 7) {
      timeText = `în ${Math.floor(diffDays)} zile`
    } else {
      timeText = `în ${format(d, 'dd MMM', { locale: ro })}`
    }

    return {
      text: timeText,
      fullDate: format(d, 'dd MMM yyyy, HH:mm', { locale: ro })
    }
  }

  // Formatare oră reapel
  const formatNuRaspundeTime = (date: string | undefined) => {
    if (!date) return null
    const d = new Date(date)
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()

    let timeText = ''
    if (diffMs < 0) {
      timeText = 'Expirat'
    } else if (diffMs < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diffMs / (1000 * 60 * 60))
      timeText = hours > 0 ? `în ${hours} ore` : 'azi'
    } else {
      timeText = format(d, 'dd MMM', { locale: ro })
    }

    return {
      time: format(d, 'HH:mm', { locale: ro }),
      text: timeText
    }
  }

  const handleCallback = async (date: Date) => {
    try {
      const { data, error } = await setLeadCallback(lead.id, date)
      if (error) throw error
      toast({
        title: 'Callback programat',
        description: `Lead-ul va fi apelat pe ${format(date, 'dd MMM yyyy, HH:mm', { locale: ro })}`,
      })
    } catch (error: any) {
      toast({
        title: 'Eroare',
        description: error?.message || 'Nu s-a putut programa callback-ul',
        variant: 'destructive',
      })
    }
  }

  const handleNuRaspunde = async (time: string) => {
    try {
      const { data, error } = await setLeadNuRaspunde(lead.id, time)
      if (error) throw error
      toast({
        title: 'Reapel programat',
        description: `Lead-ul va fi reapelat la ora ${time}`,
      })
    } catch (error: any) {
      toast({
        title: 'Eroare',
        description: error?.message || 'Nu s-a putut programa reapelul',
        variant: 'destructive',
      })
    }
  }

  const handleNoDeal = async () => {
    try {
      const { data, error } = await setLeadNoDeal(lead.id)
      if (error) throw error
      toast({
        title: 'No Deal',
        description: 'Lead-ul a fost marcat ca No Deal',
      })
      onMove(lead.id, 'No Deal')
    } catch (error: any) {
      toast({
        title: 'Eroare',
        description: error?.message || 'Nu s-a putut marca lead-ul ca No Deal',
        variant: 'destructive',
      })
    }
  }

  const handleCurierTrimis = async (date: Date) => {
    try {
      const { data, error } = await setLeadCurierTrimis(lead.id, date)
      if (error) throw error
      toast({
        title: 'Curier Trimis',
        description: 'Lead-ul a fost trimis prin curier. Fișa de serviciu creată.',
      })
      onMove(lead.id, 'Curier Trimis')
    } catch (error: any) {
      toast({
        title: 'Eroare',
        description: error?.message || 'Nu s-a putut trimite curierul',
        variant: 'destructive',
      })
    }
  }

  const handleOfficeDirect = async (date: Date) => {
    try {
      const { data, error } = await setLeadOfficeDirect(lead.id, date)
      if (error) throw error
      toast({
        title: 'Office Direct',
        description: 'Lead-ul a fost trimis direct în office. Fișa de serviciu creată.',
      })
      onMove(lead.id, 'Office Direct')
    } catch (error: any) {
      toast({
        title: 'Eroare',
        description: error?.message || 'Nu s-a putut trimite direct în office',
        variant: 'destructive',
      })
    }
  }

  const handleCardClick = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('[data-menu]')
    ) {
      return
    }
    onClick(e)
  }

  const callbackInfo = formatCallbackTime(leadAny?.callback_date)
  const nuRaspundeInfo = formatNuRaspundeTime(leadAny?.nu_raspunde_callback_at)

  return (
    <div
      className={cn(
        'bg-background border rounded-md shadow-sm transition-all hover:shadow-md p-3',
        isDragging && 'opacity-50 rotate-2 scale-105',
        isSelected && 'border-primary border-2 bg-primary/5',
        (isCallbackExpired || isNuRaspundeExpired || (hasSunaTag && isStageAllowedForSuna)) && 'border-red-500 border-2'
      )}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={handleCardClick}
    >
      {/* Header cu checkbox și butoane rapide */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {onSelectChange && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onSelectChange}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <div className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded" data-drag-handle>
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>

        {/* Butoane rapide */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={(e) => { e.stopPropagation(); setCallbackOverlayOpen(true) }}
            title="Programează callback"
          >
            <Phone className="h-3 w-3 mr-1" />
            Callback
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={(e) => { e.stopPropagation(); setNuRaspundeOverlayOpen(true) }}
            title="Nu răspunde - programare reapel"
          >
            <PhoneOff className="h-3 w-3 mr-1" />
            Nu Răspunde
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => { e.stopPropagation(); setNoDealDialogOpen(true) }}
            title="Marchează ca No Deal"
          >
            <XCircle className="h-3 w-3 mr-1" />
            No Deal
          </Button>

          {/* Move dropdown */}
          <div className="relative" data-menu>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => { e.stopPropagation(); setMoveMenuOpen(!moveMenuOpen) }}
              title="Mută în alt stage"
            >
              <span className="sr-only">Move</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </Button>

            {moveMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-popover border rounded-md shadow-lg z-50">
                <div className="p-1 max-h-64 overflow-y-auto">
                  {stages.map((stage) => (
                    <button
                      key={stage}
                      onClick={() => { onMove(lead.id, stage); setMoveMenuOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                      disabled={stage === lead.stage}
                    >
                      {stage}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tag-uri speciale */}
      {(hasSunaTag || isCallbackExpired || isNuRaspundeExpired) && (
        <div className="mb-2">
          {hasSunaTag && isStageAllowedForSuna && (
            <Badge className="bg-red-600 text-white border-red-600 animate-pulse">
              ☎️ SUNA!
            </Badge>
          )}
          {isCallbackExpired && !hasSunaTag && callbackInfo && (
            <Badge className="bg-orange-500 text-white border-orange-500">
              Callback expirat
            </Badge>
          )}
          {isNuRaspundeExpired && !hasSunaTag && nuRaspundeInfo && (
            <Badge className="bg-orange-500 text-white border-orange-500">
              Reapel expirat
            </Badge>
          )}
        </div>
      )}

      {/* Informații lead */}
      <div className="space-y-1 mb-2">
        <h4 className="font-medium text-sm">{lead.name}</h4>

        {lead.email && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}

        {lead.phone && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{lead.phone}</span>
          </div>
        )}

        {leadAny?.address && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{leadAny.address}</span>
          </div>
        )}
      </div>

      {/* Timp callback/reapel */}
      {callbackInfo && (
        <div className="flex items-center gap-1 text-xs">
          <Calendar className="h-3 w-3 text-blue-600 flex-shrink-0" />
          <span className="text-blue-600">
            Callback: {callbackInfo.fullDate} ({callbackInfo.text})
          </span>
        </div>
      )}

      {nuRaspundeInfo && (
        <div className="flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3 text-orange-600 flex-shrink-0" />
          <span className="text-orange-600">
            Reapel: {nuRaspundeInfo.time} ({nuRaspundeInfo.text})
          </span>
        </div>
      )}

      {/* Tag-uri normale */}
      {Array.isArray(lead?.tags) && lead.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags
            .filter((t: any) => t?.name !== 'Suna!')
            .slice(0, 3)
            .map((tag: any) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="text-[10px] px-1.5 py-0.5"
              >
                {tag.name}
              </Badge>
            ))}
          {lead.tags.length > 3 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
              +{lead.tags.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Overlays */}
      <VanzariCallbackOverlay
        isOpen={callbackOverlayOpen}
        onClose={() => setCallbackOverlayOpen(false)}
        onConfirm={handleCallback}
        defaultDate={leadAny?.callback_date ? new Date(leadAny.callback_date) : undefined}
      />

      <VanzariNuRaspundeOverlay
        isOpen={nuRaspundeOverlayOpen}
        onClose={() => setNuRaspundeOverlayOpen(false)}
        onConfirm={handleNuRaspunde}
        defaultTime={leadAny?.nu_raspunde_callback_at}
      />

      <VanzariNoDealDialog
        isOpen={noDealDialogOpen}
        onClose={() => setNoDealDialogOpen(false)}
        onConfirm={handleNoDeal}
        leadName={lead.name}
      />

      <VanzariCurierTrimisOverlay
        isOpen={curierTrimisOverlayOpen}
        onClose={() => setCurierTrimisOverlayOpen(false)}
        onConfirm={handleCurierTrimis}
      />

      <VanzariOfficeDirectOverlay
        isOpen={officeDirectOverlayOpen}
        onClose={() => setOfficeDirectOverlayOpen(false)}
        onConfirm={handleOfficeDirect}
      />
    </div>
  )
}