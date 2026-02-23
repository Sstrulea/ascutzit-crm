/**
 * Componentă pentru tabs-urile din LeadDetailsPanel
 */

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { FileText, History, MessageSquare } from "lucide-react"
import { ReactNode } from "react"

interface LeadDetailsTabsProps {
  section: "fisa" | "de-confirmat" | "istoric"
  onSectionChange: (section: "fisa" | "de-confirmat" | "istoric") => void
  fisaContent: ReactNode
  deConfirmatContent: ReactNode
  istoricContent: ReactNode
  /** Număr de mesaje de la utilizatori – afișat ca badge pe tab-ul Mesagerie */
  userMessageCount?: number | null
}

export function LeadDetailsTabs({
  section,
  onSectionChange,
  fisaContent,
  deConfirmatContent,
  istoricContent,
  userMessageCount,
}: LeadDetailsTabsProps) {
  // IMPORTANT:
  // Nu modificăm `document.body.style.overflow` aici.
  // În trecut, cleanup-ul seta overflow='hidden' și rămânea blocat după închiderea panelului,
  // făcând scrollbarul să dispară definitiv. Scroll-ul este gestionat de layout-ul CRM.

  return (
    <Tabs value={section} onValueChange={(v) => onSectionChange(v as "fisa" | "de-confirmat" | "istoric")} className="w-full flex-1 min-h-0 flex flex-col gap-0">
      <TabsList className="grid w-full grid-cols-3 mb-4 flex-shrink-0">
        <TabsTrigger value="fisa" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">Fișa de serviciu</span>
          <span className="sm:hidden">Fișă</span>
        </TabsTrigger>
        <TabsTrigger value="de-confirmat" className="flex items-center gap-2">
          <span className="relative inline-flex items-center justify-center">
            <MessageSquare className="h-4 w-4" />
            {userMessageCount != null && userMessageCount > 0 && (
              <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {userMessageCount > 99 ? '99+' : userMessageCount}
              </span>
            )}
          </span>
          <span>Mesagerie</span>
        </TabsTrigger>
        <TabsTrigger value="istoric" className="flex items-center gap-2">
          <History className="h-4 w-4" />
          <span>Istoric</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="fisa" className="mt-0 flex-1 min-h-0 overflow-y-auto">
        {fisaContent}
      </TabsContent>

      <TabsContent value="de-confirmat" className="mt-0 flex-1 min-h-0 overflow-hidden flex flex-col">
        {deConfirmatContent}
      </TabsContent>

      <TabsContent value="istoric" className="mt-0 flex-1 min-h-0 overflow-y-auto">
        {istoricContent}
      </TabsContent>
    </Tabs>
  )
}


