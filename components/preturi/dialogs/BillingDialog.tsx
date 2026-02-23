'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { toast } from 'sonner'
import { Loader2, Save, FileText, MapPin, Building2, Printer, User, Mail } from 'lucide-react'
import type { Lead as DatabaseLead } from '@/lib/types/database'
import type { Lead } from '@/app/(crm)/dashboard/page'
import type { LeadQuote } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import { PrintViewData } from '../utils/PrintViewData'
import { listTraysForServiceSheet } from '@/lib/utils/preturi-helpers'

const supabase = supabaseBrowser()

interface BillingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead | DatabaseLead
  quotes: LeadQuote[]
  allSheetsTotal: number
  urgentMarkupPct: number
  subscriptionType: 'services' | 'parts' | 'both' | ''
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  onSave?: () => void
  serviceFileNumber?: string | number // Numărul fișei de serviciu (ex: "4" pentru fișa 4)
  /** ID fișă serviciu – folosit când quotes e gol pentru a încărca tăvițele din DB. */
  serviceFileId?: string | null
}

interface BillingFormData {
  nume_prenume: string
  nume_companie: string
  cui: string
  strada: string
  oras: string
  judet: string
  cod_postal: string
}

export function BillingDialog({
  open,
  onOpenChange,
  lead,
  quotes: quotesProp,
  allSheetsTotal,
  urgentMarkupPct,
  subscriptionType,
  services,
  instruments,
  pipelinesWithIds,
  onSave,
  serviceFileNumber,
  serviceFileId,
}: BillingDialogProps) {
  const [fetchedQuotes, setFetchedQuotes] = useState<LeadQuote[] | null>(null)
  const [loadingQuotes, setLoadingQuotes] = useState(false)
  // Tăvițe doar pentru fișa curentă; dacă din prop nu avem pentru această fișă, folosim fetch
  const quotesForCurrentFisa = useMemo(() => {
    if (!serviceFileId) return quotesProp ?? []
    const fromProp = (quotesProp || []).filter((q: any) => (q.service_file_id || q.fisa_id) === serviceFileId)
    if (fromProp.length > 0) return fromProp
    return fetchedQuotes ?? []
  }, [serviceFileId, quotesProp, fetchedQuotes])
  const quotes = quotesForCurrentFisa

  useEffect(() => {
    if (!open) return
    if (!serviceFileId) return
    const fromProp = (quotesProp || []).filter((q: any) => (q.service_file_id || q.fisa_id) === serviceFileId)
    if (fromProp.length > 0) {
      setFetchedQuotes(null)
      return
    }
    setLoadingQuotes(true)
    listTraysForServiceSheet(serviceFileId)
      .then(setFetchedQuotes)
      .catch((err) => {
        console.error('[BillingDialog] Eroare la încărcarea tăvițelor:', err)
        setFetchedQuotes([])
      })
      .finally(() => setLoadingQuotes(false))
  }, [open, serviceFileId, quotesProp])

  const [formData, setFormData] = useState<BillingFormData>({
    nume_prenume: '',
    nume_companie: '',
    cui: '',
    strada: '',
    oras: '',
    judet: '',
    cod_postal: ''
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Încarcă datele de facturare din DB sau populează cu datele de livrare
  useEffect(() => {
    if (!open || !lead) return

    const loadBillingData = async () => {
      setLoading(true)
      try {
        // Type guard pentru a verifica dacă lead-ul are câmpurile de facturare
        const dbLead = lead as DatabaseLead
        
        // Verifică dacă există date de facturare salvate
        const hasBillingData = dbLead.billing_nume_prenume || 
                                dbLead.billing_nume_companie || 
                                dbLead.billing_cui ||
                                dbLead.billing_strada ||
                                dbLead.billing_oras ||
                                dbLead.billing_judet ||
                                dbLead.billing_cod_postal

        if (hasBillingData) {
          // Folosește datele de facturare salvate
          setFormData({
            nume_prenume: dbLead.billing_nume_prenume || '',
            nume_companie: dbLead.billing_nume_companie || '',
            cui: dbLead.billing_cui || '',
            strada: dbLead.billing_strada || '',
            oras: dbLead.billing_oras || '',
            judet: dbLead.billing_judet || '',
            cod_postal: dbLead.billing_cod_postal || ''
          })
        } else {
          // Populează cu datele de livrare (default)
          // Verifică dacă lead-ul are full_name (DatabaseLead) sau name (KanbanLead)
          const leadName = (dbLead as any).full_name || (lead as any).name || ''
          const leadCity = dbLead.city || (lead as any).city || ''
          const leadJudet = dbLead.judet || ''
          const leadStrada = dbLead.strada || ''
          const leadZip = dbLead.zip || (lead as any).zip || ''
          const leadCompany = dbLead.company_name || (lead as any).company_name || ''
          
          setFormData({
            nume_prenume: leadName,
            nume_companie: leadCompany,
            cui: '',
            strada: leadStrada,
            oras: leadCity,
            judet: leadJudet,
            cod_postal: leadZip
          })
        }
      } catch (error) {
        console.error('Error loading billing data:', error)
        // În caz de eroare, folosește datele de livrare
        const dbLead = lead as DatabaseLead
        const leadName = dbLead.full_name || (lead as any).name || ''
        const leadCity = dbLead.city || (lead as any).city || ''
        const leadCompany = dbLead.company_name || (lead as any).company_name || ''
        
        setFormData({
          nume_prenume: leadName,
          nume_companie: leadCompany,
          cui: '',
          strada: dbLead.strada || '',
          oras: leadCity,
          judet: dbLead.judet || '',
          cod_postal: dbLead.zip || (lead as any).zip || ''
        })
      } finally {
        setLoading(false)
      }
    }

    loadBillingData()
  }, [open, lead])

  const handleSave = async () => {
    if (!lead?.id) return

    setSaving(true)
    try {
      const dbLead = lead as DatabaseLead
      const { error } = await supabase
        .from('leads')
        .update({
          billing_nume_prenume: formData.nume_prenume || null,
          billing_nume_companie: formData.nume_companie || null,
          billing_cui: formData.cui || null,
          billing_strada: formData.strada || null,
          billing_oras: formData.oras || null,
          billing_judet: formData.judet || null,
          billing_cod_postal: formData.cod_postal || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', dbLead.id || lead.id)

      if (error) throw error

      toast.success('Datele de facturare au fost salvate')
      onSave?.()
    } catch (error: any) {
      console.error('Error saving billing data:', error)
      toast.error('Eroare la salvarea datelor de facturare')
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen className="w-screen h-screen p-0 border-0 shadow-2xl flex flex-col overflow-hidden" showCloseButton={true}>
        <DialogHeader className="sr-only">
          <DialogTitle>Date de facturare</DialogTitle>
        </DialogHeader>
        
        {/* Header cu gradient */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-600 px-6 py-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Date de facturare</h2>
              <p className="text-purple-100 text-sm">Completează informațiile de facturare</p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Formular facturare - stânga */}
          <div className="w-full md:w-1/3 border-r overflow-y-auto">
            <div className="p-6">
              <ScrollArea className="h-full">
                <div className="space-y-6">
                  {/* Secțiune informații de contact */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                      <User className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Informații de contact</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="billing-nume-prenume" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Nume și Prenume <span className="text-muted-foreground">(editabil)</span>
                        </Label>
                        <Input
                          id="billing-nume-prenume"
                          value={formData.nume_prenume}
                          onChange={(e) => setFormData(prev => ({ ...prev, nume_prenume: e.target.value }))}
                          placeholder="Nume și prenume"
                          disabled={loading}
                          className="h-12 border-2 focus:border-purple-500 focus:ring-purple-500/20"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="billing-nume-companie" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Nume Companie
                        </Label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            id="billing-nume-companie"
                            value={formData.nume_companie}
                            onChange={(e) => setFormData(prev => ({ ...prev, nume_companie: e.target.value }))}
                            placeholder="Nume companie"
                            disabled={loading}
                            className="pl-10 h-12 border-2 focus:border-purple-500 focus:ring-purple-500/20"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="billing-cui" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          CUI
                        </Label>
                        <Input
                          id="billing-cui"
                          value={formData.cui}
                          onChange={(e) => setFormData(prev => ({ ...prev, cui: e.target.value }))}
                          placeholder="CUI"
                          disabled={loading}
                          className="h-12 border-2 focus:border-purple-500 focus:ring-purple-500/20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Secțiune adresă */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                      <MapPin className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Adresă</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="billing-strada" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Stradă <span className="text-muted-foreground">(editabil)</span>
                        </Label>
                        <Input
                          id="billing-strada"
                          value={formData.strada}
                          onChange={(e) => setFormData(prev => ({ ...prev, strada: e.target.value }))}
                          placeholder="Stradă și număr"
                          disabled={loading}
                          className="h-12 border-2 focus:border-purple-500 focus:ring-purple-500/20"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="billing-oras" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Oraș <span className="text-muted-foreground">(editabil)</span>
                          </Label>
                          <Input
                            id="billing-oras"
                            value={formData.oras}
                            onChange={(e) => setFormData(prev => ({ ...prev, oras: e.target.value }))}
                            placeholder="Oraș"
                            disabled={loading}
                            className="h-12 border-2 focus:border-purple-500 focus:ring-purple-500/20"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="billing-judet" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Județ <span className="text-muted-foreground">(editabil)</span>
                          </Label>
                          <Input
                            id="billing-judet"
                            value={formData.judet}
                            onChange={(e) => setFormData(prev => ({ ...prev, judet: e.target.value }))}
                            placeholder="Județ"
                            disabled={loading}
                            className="h-12 border-2 focus:border-purple-500 focus:ring-purple-500/20"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="billing-cod-postal" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Cod poștal <span className="text-muted-foreground">(editabil)</span>
                        </Label>
                        <Input
                          id="billing-cod-postal"
                          value={formData.cod_postal}
                          onChange={(e) => setFormData(prev => ({ ...prev, cod_postal: e.target.value }))}
                          placeholder="Cod poștal"
                          disabled={loading}
                          className="h-12 border-2 focus:border-purple-500 focus:ring-purple-500/20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Butoane acțiune */}
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      onClick={handleSave}
                      disabled={saving || loading}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2 shadow-lg"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Se salvează...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Salvează datele
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handlePrint}
                      variant="outline"
                      disabled={loading || loadingQuotes}
                      className="gap-2"
                    >
                      <Printer className="h-4 w-4" />
                      Tipărește
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Previzualizare fișă de print - dreapta */}
          <div className="w-full md:w-2/3 overflow-y-auto bg-white">
            <div className="p-4">
              <div className="text-sm font-medium text-gray-600 mb-2">Previzualizare fișă de print:</div>
              <ScrollArea className="h-[calc(100vh-180px)] border rounded-lg bg-white shadow-inner">
                <div className="p-4">
                  {loadingQuotes ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Se încarcă tăvițele...
                    </div>
                  ) : (
                    <PrintViewData
                      lead={lead as any}
                      quotes={quotes}
                      allSheetsTotal={allSheetsTotal}
                      urgentMarkupPct={urgentMarkupPct}
                      subscriptionType={subscriptionType}
                      services={services}
                      instruments={instruments}
                      pipelinesWithIds={pipelinesWithIds}
                      serviceFileNumber={serviceFileNumber}
                    />
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

