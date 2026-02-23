/**
 * MODUL VÂNZARI - LEAD DETAILS MODAL
 * =======================================
 * Modal complet pentru detalii lead cu toate acțiunile Vânzări
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Phone, PhoneOff, XCircle, Package, Building, 
  Mail, MapPin, Calendar, Clock, User, 
  Tag, History, FileText, ExternalLink, 
  CheckCircle, AlertCircle, Info
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
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
import { logLeadEvent } from '@/lib/supabase/leadOperations'
import type { Lead } from '@/app/(crm)/dashboard/page'

interface VanzariLeadDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  lead: Lead | null
  onMove?: (leadId: string, newStage: string) => void
}

export function VanzariLeadDetailsModal({
  isOpen,
  onClose,
  lead,
  onMove
}: VanzariLeadDetailsModalProps) {
  const [callbackOverlayOpen, setCallbackOverlayOpen] = useState(false)
  const [nuRaspundeOverlayOpen, setNuRaspundeOverlayOpen] = useState(false)
  const [noDealDialogOpen, setNoDealDialogOpen] = useState(false)
  const [curierTrimisOverlayOpen, setCurierTrimisOverlayOpen] = useState(false)
  const [officeDirectOverlayOpen, setOfficeDirectOverlayOpen] = useState(false)
  const { toast } = useToast()

  // Salvare în istoric o singură dată per deschidere a modalului pentru acel lead
  const lastLoggedOpenLeadIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isOpen) {
      lastLoggedOpenLeadIdRef.current = null
      return
    }
    if (!lead?.id) return
    if (lastLoggedOpenLeadIdRef.current === lead.id) return
    lastLoggedOpenLeadIdRef.current = lead.id
    logLeadEvent(lead.id, 'Detalii lead deschise', 'lead_details_opened', { source: 'vanzari_modal' }).catch(() => {})
  }, [isOpen, lead?.id])

  if (!lead) return null

  const leadAny = lead as any

  // Verifică dacă lead-ul are callback expirat
  const isCallbackExpired = leadAny?.callback_date ? new Date(leadAny.callback_date) < new Date() : false
  const isNuRaspundeExpired = leadAny?.nu_raspunde_callback_at ? new Date(leadAny.nu_raspunde_callback_at) < new Date() : false
  
  // Verifică dacă are tag "Suna!"
  const hasSunaTag = Array.isArray(lead?.tags) 
    ? lead.tags.some((t: any) => t?.name === 'Suna!')
    : false

  // Verifică dacă stage-ul permite afișarea tag-ului "Suna!" (doar LEADuri sau leaduri straine)
  const isStageAllowedForSuna = (() => {
    const stageLower = (lead.stage || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
    return stageLower === 'leaduri' || stageLower === 'leads' || stageLower.includes('leaduri straine') || stageLower.includes('leaduristraine')
  })()

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
      onMove?.(lead.id, 'No Deal')
      onClose()
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
      onMove?.(lead.id, 'Curier Trimis')
      onClose()
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
      onMove?.(lead.id, 'Office Direct')
      onClose()
    } catch (error: any) {
      toast({
        title: 'Eroare',
        description: error?.message || 'Nu s-a putut trimite direct în office',
        variant: 'destructive',
      })
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">Detalii Lead</DialogTitle>
              <div className="flex gap-2">
                {((hasSunaTag && isStageAllowedForSuna) || isCallbackExpired || isNuRaspundeExpired) && (
                  <Badge variant="destructive" className="animate-pulse">
                    ☎️ SUNA!
                  </Badge>
                )}
                <Badge variant="outline">{lead.stage}</Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Informații de bază */}
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{lead.name}</h3>
                <p className="text-sm text-muted-foreground">
                  Creat {leadAny?.created_at ? formatDistanceToNow(new Date(leadAny.created_at), { addSuffix: true, locale: ro }) : ''}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {lead.phone && (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Telefon</p>
                      <p className="font-medium">{lead.phone}</p>
                    </div>
                  </div>
                )}

                {lead.email && (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium text-sm">{lead.email}</p>
                    </div>
                  </div>
                )}

                {leadAny?.address && (
                  <div className="flex items-start gap-2 p-3 bg-muted rounded-lg md:col-span-2">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Adresă</p>
                      <p className="font-medium text-sm">{leadAny.address}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Informații Callback/Reapel */}
            {(leadAny?.callback_date || leadAny?.nu_raspunde_callback_at) && (
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Programări
                </h4>

                {leadAny?.callback_date && (
                  <div className={`p-3 rounded-lg flex items-center justify-between ${
                    isCallbackExpired ? 'bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800' 
                    : 'bg-blue-50 dark:bg-blue-950/20'
                  }`}>
                    <div className="flex items-center gap-2">
                      <Clock className={`h-4 w-4 ${isCallbackExpired ? 'text-orange-600' : 'text-blue-600'}`} />
                      <div>
                        <p className="text-sm font-medium">Callback programat</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(leadAny.callback_date), 'dd MMM yyyy, HH:mm', { locale: ro })}
                        </p>
                      </div>
                    </div>
                    {isCallbackExpired && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Expirat
                      </Badge>
                    )}
                  </div>
                )}

                {leadAny?.nu_raspunde_callback_at && (
                  <div className={`p-3 rounded-lg flex items-center justify-between ${
                    isNuRaspundeExpired ? 'bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800' 
                    : 'bg-green-50 dark:bg-green-950/20'
                  }`}>
                    <div className="flex items-center gap-2">
                      <PhoneOff className={`h-4 w-4 ${isNuRaspundeExpired ? 'text-orange-600' : 'text-green-600'}`} />
                      <div>
                        <p className="text-sm font-medium">Reapel programat</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(leadAny.nu_raspunde_callback_at), 'dd MMM yyyy, HH:mm', { locale: ro })}
                        </p>
                      </div>
                    </div>
                    {isNuRaspundeExpired && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Expirat
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Tag-uri */}
            {Array.isArray(lead?.tags) && lead.tags.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tag-uri
                </h4>
                <div className="flex flex-wrap gap-2">
                  {lead.tags.map((tag: any) => (
                    <Badge 
                      key={tag.id} 
                      variant={tag.name === 'Suna!' ? 'destructive' : 'outline'}
                      className={tag.name === 'Suna!' ? 'animate-pulse' : ''}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Acțiuni rapide */}
            <div className="space-y-3">
              <h4 className="font-medium">Acțiuni Rapide</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-auto py-3 flex-col gap-2"
                  onClick={() => setCallbackOverlayOpen(true)}
                >
                  <Phone className="h-5 w-5 text-blue-600" />
                  <span className="text-sm">Programează Callback</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-3 flex-col gap-2"
                  onClick={() => setNuRaspundeOverlayOpen(true)}
                >
                  <PhoneOff className="h-5 w-5 text-orange-600" />
                  <span className="text-sm">Nu Răspunde - Reapel</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-3 flex-col gap-2"
                  onClick={() => setCurierTrimisOverlayOpen(true)}
                >
                  <Package className="h-5 w-5 text-blue-600" />
                  <span className="text-sm">Curier Trimis</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-3 flex-col gap-2"
                  onClick={() => setOfficeDirectOverlayOpen(true)}
                >
                  <Building className="h-5 w-5 text-green-600" />
                  <span className="text-sm">Office Direct</span>
                </Button>
              </div>

              <div className="pt-2">
                <Button
                  variant="destructive"
                  className="w-full h-auto py-3 flex items-center justify-center gap-2"
                  onClick={() => setNoDealDialogOpen(true)}
                >
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Marchează ca No Deal</span>
                </Button>
              </div>
            </div>

            {/* Notă informativă */}
            <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">Notă despre acțiuni:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li><strong>Callback:</strong> Programează o dată și oră pentru reapel</li>
                    <li><strong>Nu Răspunde:</strong> Programează un reapel automat pentru mâine la ora aleasă</li>
                    <li><strong>Curier Trimis / Office Direct:</strong> Creează automat o fișă de serviciu și mută lead-ul temporar pentru 24h</li>
                    <li><strong>No Deal:</strong> Marchează lead-ul ca pierdut și îl mută în stage-ul "No Deal"</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
    </>
  )
}