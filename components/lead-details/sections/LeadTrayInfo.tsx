/**
 * Componentă pentru informațiile despre tăviță
 */

import { Textarea } from "@/components/ui/textarea"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Package, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { useRole } from "@/lib/contexts/AuthContext"

interface LeadTrayInfoProps {
  isTrayInfoOpen: boolean
  setIsTrayInfoOpen: (open: boolean) => void
  isDepartmentPipeline: boolean
  isTechnician: boolean
  isVanzator: boolean
  allTrays: Array<{ id: string; number: string; service_file_id: string }>
  selectedTrayId: string | null
  getTrayId: () => string | null
  trayDetails: string
  setTrayDetails: (details: string) => void
  loadingTrayDetails: boolean
}

export function LeadTrayInfo({
  isTrayInfoOpen,
  setIsTrayInfoOpen,
  isDepartmentPipeline,
  isTechnician,
  isVanzator,
  allTrays,
  selectedTrayId,
  getTrayId,
  trayDetails,
  setTrayDetails,
  loadingTrayDetails,
}: LeadTrayInfoProps) {
  const { isAdmin } = useRole()
  // Vizibil doar pentru pipeline-urile tehnice (departamente) sau pentru tehnicieni pe card de tăviță
  if (!isDepartmentPipeline && !(isTechnician && getTrayId())) {
    return null
  }

  return (
    <Collapsible open={isTrayInfoOpen} onOpenChange={setIsTrayInfoOpen}>
      <div className="rounded-lg border bg-muted/30">
        <CollapsibleTrigger className="flex items-center justify-between w-full p-2 sm:p-3 hover:bg-muted/50 transition-colors rounded-t-lg">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            <span className="font-medium text-xs sm:text-sm">Informații Tavita</span>
          </div>
          {isTrayInfoOpen ? <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
        </CollapsibleTrigger>
        
        <CollapsibleContent className="px-2 sm:px-3 pb-2 sm:pb-3 space-y-2 sm:space-y-3">
          {isDepartmentPipeline ? (
            <>
              {/* Pentru tehnician, afișează doar tăvița curentă */}
              {isTechnician && getTrayId() && (
                <div className="text-sm text-muted-foreground mb-2">
                  <span className="font-medium">Tăviță curentă: </span>
                  {allTrays.find(t => t.id === getTrayId())?.number || 'N/A'}
                </div>
              )}

              {/* Informații client (leads.details) */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase mb-2 block">
                  Informații client
                </label>
                {loadingTrayDetails ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Textarea
                    value={trayDetails}
                    onChange={(e) => {
                      if (isAdmin) {
                        setTrayDetails(e.target.value)
                      }
                    }}
                    placeholder={isAdmin 
                      ? "Introduceți informațiile client (din formular sau manual)..." 
                      : "Doar administratorii pot edita aceste informații."
                    }
                    className="min-h-[80px] sm:min-h-[100px] lg:min-h-[120px] text-xs sm:text-sm resize-none"
                    readOnly={!isAdmin}
                  />
                )}
              </div>
              
              {/* Mesaj dacă nu sunt tăvițe */}
              {isVanzator && allTrays.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Nu există tăvițe pentru acest lead. Creează mai întâi o fișă de serviciu cu tăvițe.
                </div>
              )}
            </>
          ) : null}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}


