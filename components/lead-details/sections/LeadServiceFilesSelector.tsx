/**
 * Componentă pentru selectorul de fișe de serviciu și tăvițe
 */

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Info, Printer } from "lucide-react"
import { format } from "date-fns"
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { TrayTabs } from "@/components/preturi/sections/TrayTabs"
import { PrintViewData } from "@/components/preturi/utils/PrintViewData"
import { PrintTraysDialog } from "@/components/preturi/dialogs/PrintTraysDialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { LeadQuote } from "@/lib/types/preturi"
import { useState, useEffect } from "react"
import { listTraysForServiceSheet } from "@/lib/utils/preturi-helpers"

interface ServiceSheet {
  id: string
  number: string
  status: string
  date: string
  lead_id: string
  created_at?: string
  fisa_index?: number
}

interface Tray {
  id: string
  number: string
  size: string
  service_file_id: string
}

interface LeadServiceFilesSelectorProps {
  isDepartmentPipeline: boolean
  isTechnician: boolean
  isVanzariPipeline: boolean
  isReceptiePipeline: boolean
  isVanzator: boolean
  
  // Service files
  serviceSheets: ServiceSheet[]
  selectedFisaId: string | null
  loadingSheets: boolean
  onFisaIdChange: (fisaId: string) => void
  onCreateServiceSheet: () => void
  
  // Trays (pentru department pipeline)
  allTrays: Tray[]
  selectedTrayId: string | null
  loadingTrays: boolean
  onTrayIdChange: (trayId: string, fisaId: string) => void
  
  // Modal detalii
  detailsModalOpen: boolean
  setDetailsModalOpen: (open: boolean) => void
  onLoadTraysDetails: (fisaId: string) => void
  loadingDetails: boolean
  traysDetails: any[]
  
  // TrayTabs props (opțional)
  quotes?: LeadQuote[]
  selectedQuoteId?: string | null
  isVanzatorMode?: boolean
  sendingTrays?: boolean
  traysAlreadyInDepartments?: boolean
  onTraySelect?: (trayId: string) => void
  onAddTray?: () => void
  onDeleteTray?: (trayId: string) => void
  onSendTrays?: () => void
  
  // Props pentru PrintViewData în dialog detalii (opțional)
  lead?: any
  services?: any[]
  instruments?: any[]
  pipelinesWithIds?: any[]
  allSheetsTotal?: number
  urgentMarkupPct?: number
  subscriptionType?: 'services' | 'parts' | 'both' | ''
  
  // Props pentru PrintTraysDialog
  officeDirect?: boolean
  curierTrimis?: boolean

  /** Când true, selectorul de fișă (dropdown + Adaugă Fișă) e afișat în header; nu-l mai randa aici */
  sheetSelectorInHeader?: boolean
}

export function LeadServiceFilesSelector({
  isDepartmentPipeline,
  isTechnician,
  isVanzariPipeline,
  isReceptiePipeline,
  isVanzator,
  serviceSheets,
  selectedFisaId,
  loadingSheets,
  onFisaIdChange,
  onCreateServiceSheet,
  allTrays,
  selectedTrayId,
  loadingTrays,
  onTrayIdChange,
  detailsModalOpen,
  setDetailsModalOpen,
  onLoadTraysDetails,
  loadingDetails,
  traysDetails,
  quotes,
  selectedQuoteId,
  isVanzatorMode,
  sendingTrays,
  traysAlreadyInDepartments,
  onTraySelect,
  onAddTray,
  onDeleteTray,
  onSendTrays,
  // Props pentru PrintViewData
  lead,
  services,
  instruments,
  pipelinesWithIds,
  allSheetsTotal = 0,
  urgentMarkupPct = 30,
  subscriptionType = '',
  officeDirect = false,
  curierTrimis = false,
  sheetSelectorInHeader = false,
}: LeadServiceFilesSelectorProps) {
  // State pentru dialog-ul de print tăvițe
  const [showPrintTraysDialog, setShowPrintTraysDialog] = useState(false)
  // Când dialogul Detalii Fisa e deschis dar quotes din parent lipsesc, încarcă tăvițele pentru fișa selectată
  const [fetchedQuotesForDetails, setFetchedQuotesForDetails] = useState<LeadQuote[] | null>(null)
  const [loadingQuotesForDetails, setLoadingQuotesForDetails] = useState(false)

  const quotesForDetails = (() => {
    if (!selectedFisaId) return []
    const fromParent = quotes?.filter((q: any) => (q.service_file_id || q.fisa_id) === selectedFisaId) ?? []
    if (fromParent.length > 0) return fromParent
    return fetchedQuotesForDetails ?? []
  })()

  useEffect(() => {
    if (!detailsModalOpen || !selectedFisaId) {
      setFetchedQuotesForDetails(null)
      return
    }
    const fromParent = quotes?.filter((q: any) => (q.service_file_id || q.fisa_id) === selectedFisaId) ?? []
    if (fromParent.length > 0) {
      setFetchedQuotesForDetails(null)
      return
    }
    setLoadingQuotesForDetails(true)
    listTraysForServiceSheet(selectedFisaId)
      .then(setFetchedQuotesForDetails)
      .catch(() => setFetchedQuotesForDetails([]))
      .finally(() => setLoadingQuotesForDetails(false))
  }, [detailsModalOpen, selectedFisaId, quotes])

  // TrayTabs și Detalii Fisa ascunse în Recepție (navigarea e doar în ReceptieView, sub "Recepție Comandă")
  const showTrayTabs = !isDepartmentPipeline && !isReceptiePipeline && !isVanzatorMode && quotes && quotes.length > 0 && onTraySelect && onAddTray && onDeleteTray && onSendTrays
  
  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-3 flex-wrap">
        {!sheetSelectorInHeader && (
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          {isDepartmentPipeline ? (
          <>
            {/* Pentru vânzători / admin / owner: selector de tăviță */}
            {!isTechnician ? (
              <>
                <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  Selectează tăvița:
                </label>
                <div className="flex items-center gap-2 flex-1">
                  <Select
                    value={selectedTrayId || ''}
                    onValueChange={(value) => {
                      const tray = allTrays.find(t => t.id === value)
                      if (tray) {
                        onTrayIdChange(tray.id, tray.service_file_id)
                      }
                    }}
                    disabled={loadingTrays}
                  >
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue placeholder={loadingTrays ? "Se încarcă..." : "Selectează o tăviță"} />
                    </SelectTrigger>
                    <SelectContent>
                      {allTrays.map((tray) => {
                        const displayText = `Tăviță #${tray.number}`
                        return (
                          <SelectItem key={tray.id} value={tray.id}>
                            {displayText}
                          </SelectItem>
                        );
                      })}
                      {allTrays.length === 0 && !loadingTrays && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Nu există tăvițe
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCreateServiceSheet}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Adaugă Fișă Serviciu
                  </Button>
                </div>
              </>
            ) : (
              /* Pentru tehnicieni: se afișează în header-ul DepartmentView, nu aici */
              null
            )}
          </>
        ) : (
          <>
            <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              Selectează fișa de serviciu:
            </label>
            <div className="flex items-center gap-2 flex-1">
              <Select
                value={selectedFisaId || ''}
                onValueChange={(value) => onFisaIdChange(value)}
                disabled={loadingSheets}
              >
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder={loadingSheets ? "Se încarcă..." : "Selectează o fișă"} />
                </SelectTrigger>
                <SelectContent>
                  {serviceSheets.map((sheet) => {
                    const createdDate = sheet.created_at 
                      ? format(new Date(sheet.created_at), 'dd MMM yyyy')
                      : '';
                    const displayText = createdDate 
                      ? `${sheet.number} - ${createdDate}`
                      : sheet.number;
                    return (
                      <SelectItem key={sheet.id} value={sheet.id}>
                        {displayText}
                      </SelectItem>
                    );
                  })}
                  {serviceSheets.length === 0 && !loadingSheets && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Nu există fișe de serviciu
                    </div>
                  )}
                </SelectContent>
              </Select>
              {/* Buton "Fișă nouă" - pentru pipeline-ul Vânzări (toți utilizatorii) 
                  și pentru Receptie (doar vânzători / admin / owner) */}
              {(
                isVanzariPipeline ||               // în Vânzări: întotdeauna vizibil
                (isReceptiePipeline && isVanzator) // în Receptie: doar pentru vânzători/admin/owner
              ) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCreateServiceSheet}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Adaugă Fișă Serviciu
                </Button>
              )}
            </div>
          </>
        )}
        </div>
        )}
        
        {/* Butonul "Tipărește Tăvițe" – pentru pipeline-ul Recepție (se afișează și când quotes e gol – se încarcă la deschidere) */}
        {isReceptiePipeline && selectedFisaId && lead && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPrintTraysDialog(true)}
              className="flex items-center gap-2"
            >
              <Printer className="h-5 w-5" />
              Tipărește Tăvițe
            </Button>
          </div>
        )}
        
        {/* TrayTabs pe același rând cu dropdown-ul */}
        {showTrayTabs && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <TrayTabs
              quotes={quotes!}
              selectedQuoteId={selectedQuoteId || null}
              isVanzariPipeline={isVanzariPipeline}
              isReceptiePipeline={isReceptiePipeline}
              isDepartmentPipeline={isDepartmentPipeline}
              isVanzatorMode={isVanzatorMode || false}
              sendingTrays={sendingTrays || false}
              traysAlreadyInDepartments={traysAlreadyInDepartments || false}
              onTraySelect={onTraySelect!}
              onAddTray={onAddTray!}
              onDeleteTray={onDeleteTray!}
              onSendTrays={onSendTrays!}
              inline={true}
            />
          </div>
        )}
        
        {/* Butonul "Detalii Fisa" – ascuns când e afișat în header (lângă Print) */}
        {selectedFisaId && !isDepartmentPipeline && !isReceptiePipeline && !sheetSelectorInHeader && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDetailsModalOpen(true)
                    onLoadTraysDetails(selectedFisaId)
                  }}
                  className="flex items-center gap-2"
                >
                  <Info className="h-5 w-5" />
                  Detalii Fisa
                </Button>
              </DialogTrigger>
            <DialogContent 
                className="overflow-y-auto"
                style={{ 
                  width: '95vw', 
                  maxWidth: '1400px',
                  height: '95vh',
                  maxHeight: '95vh'
                }}
              >
              <DialogTitle className="sr-only">Detalii Fișă</DialogTitle>
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-3 gap-3">
                  <h2 className="text-lg font-semibold">Detalii Fișă de Serviciu</h2>
                  <div className="flex items-center gap-2 shrink-0">
                    {quotesForDetails.length > 0 && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => window.print()}
                        className="flex items-center gap-2"
                        title="Tipărește fișa de serviciu (FISA DE SERVICE)"
                      >
                        <Printer className="h-4 w-4" />
                        Print fișă
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDetailsModalOpen(false)
                        setShowPrintTraysDialog(true)
                      }}
                      className="flex items-center gap-2"
                      title="Print tăvițe (A4) – la fel ca butonul din header"
                    >
                      <Printer className="h-4 w-4" />
                      Print tăvițe
                    </Button>
                  </div>
                </div>
                
                {/* Afișează PrintViewData; citește quotes din parent sau le încarcă pentru fișa selectată */}
                {lead && quotesForDetails.length > 0 ? (
                  <ScrollArea className="h-[calc(95vh-100px)]">
                    <PrintViewData
                      lead={lead}
                      quotes={quotesForDetails}
                      allSheetsTotal={allSheetsTotal}
                      urgentMarkupPct={urgentMarkupPct}
                      subscriptionType={subscriptionType}
                      services={services || []}
                      instruments={instruments || []}
                      pipelinesWithIds={pipelinesWithIds || []}
                      serviceFileNumber={selectedFisaId ? serviceSheets.find(s => s.id === selectedFisaId)?.number : undefined}
                      isPrintMode={false}
                    />
                  </ScrollArea>
                ) : loadingDetails || loadingQuotesForDetails ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Se încarcă...</span>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Nu există date disponibile pentru această fișă
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
      </div>
      
      {/* Dialog pentru tipărirea tăvițelor – doar pentru Recepție */}
      {lead && (quotes || selectedFisaId) && (
        <PrintTraysDialog
          open={showPrintTraysDialog}
          onOpenChange={setShowPrintTraysDialog}
          lead={lead}
          quotes={selectedFisaId && quotes ? quotes.filter((q: any) => (q.service_file_id || q.fisa_id) === selectedFisaId) : (quotes || [])}
          officeDirect={officeDirect}
          curierTrimis={curierTrimis}
          services={services || []}
          instruments={instruments || []}
          pipelinesWithIds={pipelinesWithIds || []}
          serviceFileNumber={selectedFisaId ? serviceSheets.find(s => s.id === selectedFisaId)?.number : undefined}
          serviceFileId={selectedFisaId || undefined}
          directPrint={true}
        />
      )}
    </div>
  )
}


