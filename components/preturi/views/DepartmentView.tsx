'use client'

import { Button } from '@/components/ui/button'
import { GitMerge, Loader2, Save, Users } from 'lucide-react'
import { AddInstrumentForm } from '../forms/AddInstrumentForm'
import { AddServiceForm } from '../forms/AddServiceForm'
import { AddPartForm } from '../forms/AddPartForm'
import { ItemsTable } from '../sections/ItemsTable'
import { InstrumenteReparatieDefectSection } from '../sections/InstrumenteReparatieDefectSection'
import { TotalsSection } from '../sections/TotalsSection'
import { TrayImagesSection } from '../sections/TrayImagesSection'
import { TrayTabs } from '../sections/TrayTabs'
import { SplitTrayTechnicianDialog } from '../dialogs/SplitTrayTechnicianDialog'
import { SplitTrayToRealTraysDialog } from '../dialogs/SplitTrayToRealTraysDialog'
import { MergeTrayTechnicianDialog } from '../dialogs/MergeTrayTechnicianDialog'
import { MobileItemsView } from '../mobile/MobileItemsView'
import LeadMessenger from '@/components/leads/lead-messenger'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { useEffect, useState } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import type { LeadQuoteItem, LeadQuote } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Part } from '@/lib/supabase/partOperations'
import type { Technician } from '@/lib/types/preturi'
import type { TrayImage } from '@/lib/supabase/imageOperations'

interface DepartmentViewProps {
  // Lead
  leadId?: string | null
  
  // State
  instrumentForm: { 
    instrument: string
    qty: string
    garantie?: boolean
  }
  instrumentSettings?: Record<string, any>
  svc: { id: string; qty: string; discount: string; instrumentId: string }
  part: { id: string; qty: string; serialNumberId: string }
  serviceSearchQuery: string
  serviceSearchFocused: boolean
  partSearchQuery: string
  partSearchFocused: boolean
  items: LeadQuoteItem[]
  subscriptionType: 'services' | 'parts' | 'both' | ''
  
  // Data
  availableInstruments: Array<{ id: string; name: string; department_id?: string | null }>
  availableServices: Service[]
  services: Service[]
  parts: Part[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>
  departments?: Array<{ id: string; name: string }>
  technicians: Technician[]
  pipelinesWithIds: Array<{ id: string; name: string }>
  
  // Callbacks
  onInstrumentChange: (instrumentId: string) => void
  onInstrumentDoubleClick?: (instrumentId: string) => void
  onQtyChange: (qty: string) => void
  onServiceSearchChange: (query: string) => void
  onServiceSearchFocus: () => void
  onServiceSearchBlur: () => void
  onServiceSelect: (serviceId: string, serviceName: string) => void
  onServiceDoubleClick: (serviceId: string, serviceName: string) => void
  onSvcQtyChange: (qty: string) => void
  onSvcDiscountChange: (discount: string) => void
  onAddService: () => void
  onPartSearchChange: (query: string) => void
  onPartSearchFocus: () => void
  onPartSearchBlur: () => void
  onPartSelect: (partId: string, partName: string) => void
  onPartDoubleClick: (partId: string, partName: string) => void
  onPartQtyChange: (qty: string) => void
  onSerialNumberChange: (serialNumberId: string) => void
  onAddPart: () => void
  onUpdateItem: (id: string, patch: Partial<LeadQuoteItem>) => void
  onDelete: (id: string) => void
  onRowClick?: (item: LeadQuoteItem) => void
  onClearForm?: () => void
  setIsDirty?: (dirty: boolean) => void
  
  // Pipeline flags
  currentInstrumentId: string | null
  hasServicesOrInstrumentInSheet: boolean
  isTechnician: boolean
  isDepartmentPipeline: boolean
  isReparatiiPipeline: boolean
  canAddParts: boolean
  canEditUrgentAndSubscription: boolean
  
  // Tray images
  selectedQuoteId?: string | null
  trayImages?: TrayImage[]
  uploadingImage?: boolean
  isImagesExpanded?: boolean
  canAddTrayImages?: boolean
  canViewTrayImages?: boolean
  onToggleImagesExpanded?: () => void
  onImageUpload?: (event: React.ChangeEvent<HTMLInputElement>) => void
  onDownloadAllImages?: () => void
  onImageDelete?: (imageId: string, filePath: string) => void
  
  // Save
  onSaveToHistory?: () => void
  saving?: boolean
  
  // Tray tabs
  quotes?: LeadQuote[]
  onTraySelect?: (trayId: string) => void
  onAddTray?: () => void
  onDeleteTray?: (trayId: string) => void
  sendingTrays?: boolean
  traysAlreadyInDepartments?: boolean
  onSendTrays?: () => void
  
  // Tray actions
  urgentAllServices?: boolean
  paymentCash?: boolean
  paymentCard?: boolean
  officeDirect?: boolean
  curierTrimis?: boolean
  loading?: boolean
  isDirty?: boolean
  fisaId?: string | null
  currentServiceFileStage?: string | null
  onUrgentChange?: (checked: boolean) => Promise<void>
  onSubscriptionChange?: (value: 'services' | 'parts' | 'both' | '') => void
  onOfficeDirectChange?: (checked: boolean) => Promise<void>
  onCurierTrimisChange?: (checked: boolean) => Promise<void>
  onPaymentCashChange?: (checked: boolean) => void
  onPaymentCardChange?: (checked: boolean) => void
  onSave?: () => void
  
  // Tray details
  trayDetails?: string
  loadingTrayDetails?: boolean
  isCommercialPipeline?: boolean
  onDetailsChange?: (details: string) => void

  // Split tray items (volum) către alt tehnician
  onSplitTrayItemsToTechnician?: (args: {
    trayId?: string
    mode?: 'split' | 'merge'
    targetTechnicianId: string
    moves: Array<{
      trayItemId: string
      qtyMove: number
      item_type?: 'service' | 'part' | null
      name_snapshot?: string | null
      instrument_id?: string | null
      service_id?: string | null
      part_id?: string | null
      from_technician_id?: string | null
      qty_total?: number | null
      has_brands_or_serials?: boolean | null
    }>
  }) => Promise<void>

  // Împarte tăvița în 2 sau 3 tăvițe reale (number+username, mutare independentă)
  currentUserId?: string
  currentUserDisplayName?: string
  onSplitTrayToRealTrays?: (params: {
    originalTrayId: string
    assignments: Array<{ technicianId: string; displayName: string; trayItemIds: string[] }>
  }) => Promise<void>
  
  // Tehnician assignment (doar admini)
  isAdmin?: boolean
  onTechnicianChange?: (technicianId: string) => void
}

export function DepartmentView({
  leadId,
  instrumentForm,
  instrumentSettings = {},
  svc,
  part,
  serviceSearchQuery,
  serviceSearchFocused,
  partSearchQuery,
  partSearchFocused,
  items,
  subscriptionType,
  availableInstruments,
  availableServices,
  services,
  parts,
  instruments,
  departments = [],
  technicians,
  pipelinesWithIds,
  onInstrumentChange,
  onInstrumentDoubleClick,
  onQtyChange,
  onServiceSearchChange,
  onServiceSearchFocus,
  onServiceSearchBlur,
  onServiceSelect,
  onServiceDoubleClick,
  onSvcQtyChange,
  onSvcDiscountChange,
  onAddService,
  onPartSearchChange,
  onPartSearchFocus,
  onPartSearchBlur,
  onPartSelect,
  onPartDoubleClick,
  onPartQtyChange,
  onSerialNumberChange,
  onAddPart,
  onUpdateItem,
  onDelete,
  onRowClick,
  onClearForm,
  setIsDirty,
  onAddInstrumentDirect,
  currentInstrumentId,
  hasServicesOrInstrumentInSheet,
  isTechnician,
  isDepartmentPipeline,
  isReparatiiPipeline,
  canAddParts,
  canEditUrgentAndSubscription,
  selectedQuoteId,
  trayImages = [],
  uploadingImage = false,
  isImagesExpanded = false,
  canAddTrayImages = false,
  canViewTrayImages = true,
  onToggleImagesExpanded,
  onImageUpload,
  onDownloadAllImages,
  onImageDelete,
  onSaveToHistory,
  saving = false,
  // Tray tabs
  quotes = [],
  onTraySelect,
  onAddTray,
  onDeleteTray,
  sendingTrays = false,
  traysAlreadyInDepartments = false,
  onSendTrays,
  // Tray actions
  urgentAllServices = false,
  paymentCash = false,
  paymentCard = false,
  officeDirect = false,
  curierTrimis = false,
  loading = false,
  isDirty = false,
  fisaId,
  currentServiceFileStage,
  onUrgentChange,
  onSubscriptionChange,
  onOfficeDirectChange,
  onCurierTrimisChange,
  onPaymentCashChange,
  onPaymentCardChange,
  onSave,
  // Tray details
  trayDetails = '',
  loadingTrayDetails = false,
  isCommercialPipeline = false,
  onDetailsChange,
  onSplitTrayItemsToTechnician,
  currentUserId = '',
  currentUserDisplayName = 'Eu',
  onSplitTrayToRealTrays,
  // Tehnician assignment (doar admini)
  isAdmin = false,
  onTechnicianChange,
}: DepartmentViewProps) {
  const selectedQuote = quotes.find(q => q.id === selectedQuoteId)
  const [resolvedLeadId, setResolvedLeadId] = useState<string | null>(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitRealOpen, setSplitRealOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const isMobile = useIsMobile()
  
  // Transformă instrumentForm pentru mobile
  const currentInstrument = instrumentForm.instrument 
    ? instruments.find(i => i.id === instrumentForm.instrument)
    : null
  
  const mobileInstrumentForm = {
    instrument: currentInstrument ? { id: currentInstrument.id, name: currentInstrument.name } : null,
    qty: parseInt(instrumentForm.qty) || 1,
  }

  // ÎNTOTDEAUNA rezolvăm lead_id din lanțul tray → service_file → lead
  // Nu ne bazăm pe leadId ca prop deoarece poate fi ID-ul fișei de serviciu!
  useEffect(() => {
    // Dacă nu avem nici fisaId nici selectedQuoteId, nu putem rezolva lead_id
    if (!fisaId && !selectedQuoteId) {
      // Dacă avem leadId și nu avem altă metodă, verificăm dacă e un lead valid
      if (leadId) {
        // Verificăm dacă leadId este de fapt un ID de lead (nu de service_file)
        async function verifyLeadId() {
          try {
            const { data: leadData, error: leadError } = await supabaseBrowser()
              .from('leads')
              .select('id')
              .eq('id', leadId)
              .single()
            
            if (!leadError && leadData?.id) {
              console.log('✅ Verified lead_id from prop:', leadData.id)
              setResolvedLeadId(leadData.id)
            } else {
              console.warn('⚠️ leadId prop is not a valid lead ID:', leadId)
              setResolvedLeadId(null)
            }
          } catch (err) {
            console.error('Error verifying lead_id:', err)
            setResolvedLeadId(null)
          }
        }
        verifyLeadId()
      } else {
        setResolvedLeadId(null)
      }
      return
    }

    async function getLeadIdFromTrayOrFisa() {
      try {
        let serviceFileId: string | null = fisaId || null

        // Dacă avem selectedQuoteId (tray_id), obținem service_file_id din tray
        if (selectedQuoteId) {
          const { data: trayData, error: trayError } = await supabaseBrowser()
            .from('trays')
            .select('service_file_id')
            .eq('id', selectedQuoteId)
            .single()

          if (!trayError && trayData?.service_file_id) {
            serviceFileId = trayData.service_file_id
          }
        }

        if (!serviceFileId) {
          console.error('No service_file_id found')
          setResolvedLeadId(null)
          return
        }

        // Obținem lead_id din service_file
        const { data, error } = await supabaseBrowser()
          .from('service_files')
          .select('lead_id')
          .eq('id', serviceFileId)
          .single()

        if (!error && data?.lead_id) {
          console.log('✅ Resolved lead_id from service_file:', data.lead_id)
          setResolvedLeadId(data.lead_id)
        } else {
          console.warn('⚠️ Could not resolve lead_id from service_file:', serviceFileId)
          setResolvedLeadId(null)
        }
      } catch (err) {
        console.error('Error fetching lead_id:', err)
        setResolvedLeadId(null)
      }
    }

    getLeadIdFromTrayOrFisa()
  }, [leadId, fisaId, selectedQuoteId])

  return (
    <div className="space-y-4 border rounded-xl bg-card shadow-sm overflow-visible pb-4">
      {/* Header — responsive pe mobile/tabletă */}
      <div className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-800/30 border-b px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6 min-w-0">
            {isTechnician && selectedQuote && (
              <div className="flex flex-col border-r pr-4 sm:pr-6 border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-0.5">Tăviță curentă</span>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{selectedQuote.number || '?'}</span>
                  </div>
                  <span className="font-semibold text-sm truncate">
                    {selectedQuote.number ? `Tăviță #${selectedQuote.number}` : 'Tăviță nesetată'} 
                  </span>
                </div>
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-base text-foreground">Departament Tehnic</h3>
              <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">Gestionează instrumentele și serviciile</p>
            </div>
          </div>
        </div>
      </div>

      {quotes.length > 0 && (
        <div className="px-2 sm:px-4">
          <TrayTabs
            quotes={quotes}
            selectedQuoteId={selectedQuoteId ?? null}
            isVanzariPipeline={false}
            isReceptiePipeline={false}
            isDepartmentPipeline={isDepartmentPipeline}
            isVanzatorMode={false}
            sendingTrays={sendingTrays}
            traysAlreadyInDepartments={traysAlreadyInDepartments}
            onTraySelect={onTraySelect || (() => {})}
            onAddTray={onAddTray || (() => {})}
            onDeleteTray={onDeleteTray || (() => {})}
            onSendTrays={onSendTrays || (() => {})}
          />
        </div>
      )}
      
      <div className="mx-2 sm:mx-4 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Urgent toggle - read-only (non-funcțional) — accent CRM slate */}
            <div className="flex items-center gap-2.5 opacity-70">
              <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 cursor-not-allowed ${urgentAllServices ? 'bg-slate-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${urgentAllServices ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className={`text-sm font-medium ${urgentAllServices ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                Urgent
              </span>
              {urgentAllServices && (
                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                  +30%
                </span>
              )}
            </div>
            
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
            
            {/* Abonament - read-only */}
            <div className="flex items-center gap-1.5 opacity-70">
              <span className="text-sm text-slate-500 dark:text-slate-400">Abonament</span>
              <div className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-not-allowed">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {subscriptionType === 'services' ? 'Servicii (-10%)' : 
                  subscriptionType === 'parts' ? 'Piese (-5%)' : 
                  subscriptionType === 'both' ? 'Servicii + Piese' : 
                  'Fără abonament'}
                </span>
              </div>
            </div>

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
            
            {/* Office direct - accent CRM */}
            <div className="flex items-center gap-2 opacity-70">
              <div className="h-4 w-4 rounded border-2 flex items-center justify-center cursor-not-allowed bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600">
                {officeDirect && (
                  <svg className="h-3 w-3 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={`text-sm font-medium ${officeDirect ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                Office direct
              </span>
            </div>

            {/* Curier Trimis - accent CRM */}
            <div className="flex items-center gap-2 opacity-70">
              <div className="h-4 w-4 rounded border-2 flex items-center justify-center cursor-not-allowed bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600">
                {curierTrimis && (
                  <svg className="h-3 w-3 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={`text-sm font-medium ${curierTrimis ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                Curier Trimis
              </span>
            </div>
          </div>

          {/* Acțiuni - aliniate la dreapta */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {(onSplitTrayToRealTrays || onSplitTrayItemsToTechnician) && selectedQuoteId && items.length > 0 && technicians.length > 0 && (
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => (onSplitTrayToRealTrays ? setSplitRealOpen(true) : setSplitOpen(true))}
                disabled={saving}
                className="gap-1.5 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                title={onSplitTrayToRealTrays ? "Împarte tăvița în 2 sau 3 tăvițe (mutare independentă)" : "Împarte volumul din tăviță către alt tehnician (în aceeași tăviță)"}
              >
                <Users className="h-4 w-4" />
                Împarte
              </Button>
            )}

            {onSplitTrayItemsToTechnician && selectedQuoteId && items.length > 0 && technicians.length > 0 && (
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setMergeOpen(true)}
                disabled={saving}
                className="gap-1.5 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Reunește pozițiile către un singur tehnician (în aceeași tăviță)"
              >
                <GitMerge className="h-4 w-4" />
                Reunește
              </Button>
            )}

            <Button 
              size="sm"
              type="button"
              onClick={onSaveToHistory} 
              disabled={saving}
              className="shadow-sm gap-1.5 bg-slate-600 hover:bg-slate-700 text-white border-0"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Se salvează…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Salvează în Istoric
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Galerie Imagini */}
      {canViewTrayImages && selectedQuoteId && (
        <TrayImagesSection
          trayImages={trayImages}
          uploadingImage={uploadingImage}
          isImagesExpanded={isImagesExpanded}
          canAddTrayImages={canAddTrayImages}
          canViewTrayImages={canViewTrayImages}
          selectedQuoteId={selectedQuoteId}
          onToggleExpanded={onToggleImagesExpanded || (() => {})}
          onImageUpload={(event) => {
            const file = event.target.files?.[0]
            if (file && onImageUpload) {
              (onImageUpload as any)(file)
            }
          }}
          onDownloadAll={onDownloadAllImages || (() => {})}
          onImageDelete={onImageDelete || (() => {})}
        />
      )}

      {/* Versiune mobilă sau desktop */}
      {isMobile ? (
        <>
          {/* MobileItemsView pentru mobil */}
          <MobileItemsView
            items={items}
            services={services}
            instruments={instruments.map(i => ({ id: i.id, name: i.name, repairable: true }))}
            parts={parts}
            technicians={technicians}
            canChangeTechnician={isAdmin}
            pipelinesWithIds={pipelinesWithIds}
            isReceptiePipeline={false}
            isDepartmentPipeline={isDepartmentPipeline}
            isReparatiiPipeline={isReparatiiPipeline}
            canAddParts={canAddParts}
            canEditUrgentAndSubscription={canEditUrgentAndSubscription}
            selectedInstrument={mobileInstrumentForm.instrument}
            instrumentForm={mobileInstrumentForm}
            onUpdateItem={onUpdateItem}
            onDelete={onDelete}
            onAddService={(service, qty) => {
              onServiceSelect(service.id, service.name)
              onSvcQtyChange(String(qty))
              onAddService()
            }}
            onAddPart={(partItem, qty) => {
              onPartSelect(partItem.id, partItem.name)
              onPartQtyChange(String(qty))
              onAddPart()
            }}
            onInstrumentChange={(inst) => {
              if (inst) {
                onInstrumentChange(inst.id)
              } else {
                onInstrumentChange('')
              }
            }}
            onInstrumentDoubleClick={(inst) => {
              onInstrumentDoubleClick?.(inst.id)
            }}
            onQtyChange={(qty) => onQtyChange(String(qty))}
            onClearForm={onClearForm}
          />
          
          {/* Totaluri pentru mobil */}
          <TotalsSection
            items={items}
            subscriptionType={subscriptionType}
            services={services}
            instruments={instruments}
            canEditDiscount={false}
          />
        </>
      ) : (
        <>
          {/* Formulare: Instrument și Serviciu mereu unul sub altul (nu pe același rând) */}
          <div className="space-y-4">
            <div className="min-w-0">
              <AddInstrumentForm
              instrumentForm={instrumentForm}
              availableInstruments={availableInstruments}
              instruments={instruments.map(i => ({ id: i.id, name: i.name, department_id: i.department_id ?? null, pipeline: i.pipeline ?? null }))}
              departments={departments}
              instrumentSettings={instrumentSettings}
              hasServicesOrInstrumentInSheet={hasServicesOrInstrumentInSheet}
              isVanzariPipeline={false}
              isDepartmentPipeline={isDepartmentPipeline}
              isTechnician={isTechnician}
              onInstrumentChange={onInstrumentChange}
              onInstrumentDoubleClick={onInstrumentDoubleClick}
              onQtyChange={onQtyChange}
              setIsDirty={setIsDirty}
              isAddInstrumentDisabled={false}
              onAddInstrumentDirect={onAddInstrumentDirect}
            />
            </div>
            <div className="min-w-0">
              <AddServiceForm
              svc={svc}
              serviceSearchQuery={serviceSearchQuery}
              serviceSearchFocused={serviceSearchFocused}
              currentInstrumentId={currentInstrumentId}
              availableServices={availableServices}
              instrumentForm={instrumentForm}
              isAdmin={isAdmin}
              technicians={technicians}
              onTechnicianChange={onTechnicianChange}
              onServiceSearchChange={onServiceSearchChange}
              onServiceSearchFocus={onServiceSearchFocus}
              onServiceSearchBlur={onServiceSearchBlur}
              onServiceSelect={onServiceSelect}
              onServiceDoubleClick={onServiceDoubleClick}
              onQtyChange={onSvcQtyChange}
              onDiscountChange={onSvcDiscountChange}
              onAddService={onAddService}
              onClearForm={onClearForm}
            />
            </div>
            {isReparatiiPipeline && canAddParts && (
              <div className="min-w-0">
                <AddPartForm
                part={part}
                partSearchQuery={partSearchQuery}
                partSearchFocused={partSearchFocused}
                parts={parts}
                items={items}
                instrumentForm={instrumentForm}
                canAddParts={canAddParts}
                onPartSearchChange={onPartSearchChange}
                onPartSearchFocus={onPartSearchFocus}
                onPartSearchBlur={onPartSearchBlur}
                onPartSelect={onPartSelect}
                onPartDoubleClick={onPartDoubleClick}
                onQtyChange={onPartQtyChange}
                onSerialNumberChange={onSerialNumberChange}
                onAddPart={onAddPart}
                />
              </div>
            )}
          </div>
          
          {/* Instrumente nereparabile / nu s-au supus reparației / defectate */}
          <InstrumenteReparatieDefectSection
            items={items}
            instruments={instruments}
            services={services}
          />

          {/* Tabel itemi și Totaluri - Desktop */}
          <div className="space-y-4">
            <ItemsTable
              items={items}
              services={services}
              instruments={instruments}
              technicians={technicians}
              pipelinesWithIds={pipelinesWithIds}
              isReceptiePipeline={false}
              canEditUrgentAndSubscription={canEditUrgentAndSubscription}
              canChangeTechnician={isAdmin}
              onUpdateItem={onUpdateItem}
              onDelete={onDelete}
              onRowClick={onRowClick}
            />
            
            <TotalsSection
              items={items}
              subscriptionType={subscriptionType}
              services={services}
              instruments={instruments}
              canEditDiscount={false}
            />
          </div>
        </>
      )}

      {/* Dialog: Împarte volumul către alt tehnician */}
      {selectedQuoteId && (
        <SplitTrayTechnicianDialog
          open={splitOpen}
          onOpenChange={setSplitOpen}
          items={items}
          technicians={technicians}
          instruments={instruments.map(i => ({ id: i.id, name: i.name }))}
          services={services}
          onConfirm={async ({ targetTechnicianId, moves }) => {
            if (!onSplitTrayItemsToTechnician) return

            const byId = new Map(items.map(it => [it.id, it]))
            const movesWithMeta = moves.map(m => {
              const it = byId.get(m.trayItemId)
              return {
                trayItemId: m.trayItemId,
                qtyMove: m.qtyMove,
                item_type: it?.item_type ?? null,
                name_snapshot: it?.name_snapshot ?? null,
                instrument_id: it?.instrument_id ?? null,
                service_id: it?.service_id ?? null,
                part_id: it?.part_id ?? null,
                from_technician_id: null,
                qty_total: it?.qty ?? null,
                has_brands_or_serials: false,
              }
            })

            await onSplitTrayItemsToTechnician({
              trayId: selectedQuoteId,
              mode: 'split',
              targetTechnicianId,
              moves: movesWithMeta,
            })
          }}
        />
      )}

      {/* Dialog: Împarte în 2 sau 3 tăvițe reale */}
      {selectedQuoteId && onSplitTrayToRealTrays && currentUserId && (
        <SplitTrayToRealTraysDialog
          open={splitRealOpen}
          onOpenChange={setSplitRealOpen}
          items={items}
          instruments={instruments.map(i => ({ id: i.id, name: i.name }))}
          technicians={technicians}
          currentUserId={currentUserId}
          currentUserDisplayName={currentUserDisplayName || 'Eu'}
          onConfirm={async ({ assignments }) => {
            await onSplitTrayToRealTrays({ originalTrayId: selectedQuoteId!, assignments })
          }}
        />
      )}

      {/* Dialog: Reunește către tehnician */}
      {selectedQuoteId && (
        <MergeTrayTechnicianDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          items={items}
          technicians={technicians}
          instruments={instruments.map(i => ({ id: i.id, name: i.name }))}
          services={services}
          onConfirm={async ({ targetTechnicianId, moves }) => {
            if (!onSplitTrayItemsToTechnician) return

            const byId = new Map(items.map(it => [it.id, it]))
            const movesWithMeta = moves.map(m => {
              const it = byId.get(m.trayItemId)
              return {
                trayItemId: m.trayItemId,
                qtyMove: m.qtyMove,
                item_type: it?.item_type ?? null,
                name_snapshot: it?.name_snapshot ?? null,
                instrument_id: it?.instrument_id ?? null,
                service_id: it?.service_id ?? null,
                part_id: it?.part_id ?? null,
                from_technician_id: null,
                qty_total: it?.qty ?? null,
                has_brands_or_serials: false,
              }
            })

            await onSplitTrayItemsToTechnician({
              trayId: selectedQuoteId,
              mode: 'merge',
              targetTechnicianId,
              moves: movesWithMeta,
            })
          }}
        />
      )}
    </div>
  )
}

