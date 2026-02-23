'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Printer, Package } from 'lucide-react'
import type { Lead } from '@/app/(crm)/dashboard/page'
import type { LeadQuote } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import { PrintTraysData } from '../utils/PrintTraysData'
import type { TrayPrintSheet } from '@/lib/utils/printTrayDocument'
import { toast } from 'sonner'
import { listTraysForServiceSheet } from '@/lib/utils/preturi-helpers'

interface PrintTraysDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead
  quotes: LeadQuote[]
  officeDirect: boolean
  curierTrimis: boolean
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  serviceFileNumber?: string | number
  /** ID fișă serviciu – folosit când quotes e gol pentru a încărca tăvițele din DB. */
  serviceFileId?: string | null
  /** Dacă true: nu se afișează previzualizarea, se deschide direct fereastra de print. */
  directPrint?: boolean
}

export function PrintTraysDialog({
  open,
  onOpenChange,
  lead,
  quotes: quotesProp,
  officeDirect,
  curierTrimis,
  services,
  instruments,
  pipelinesWithIds,
  serviceFileNumber,
  serviceFileId,
  directPrint = false,
}: PrintTraysDialogProps) {
  const printRootRef = useRef<HTMLDivElement | null>(null)
  const printTriggeredRef = useRef(false)
  const [fetchedQuotes, setFetchedQuotes] = useState<LeadQuote[] | null>(null)
  const [loadingFallback, setLoadingFallback] = useState(false)

  const quotes = quotesProp?.length ? quotesProp : (fetchedQuotes ?? [])

  useEffect(() => {
    if (open) printTriggeredRef.current = false
  }, [open])

  // Fallback: când quotes e gol dar avem serviceFileId, încarcă tăvițele din DB
  useEffect(() => {
    if (!open) return
    if (quotesProp?.length) {
      setFetchedQuotes(null)
      return
    }
    if (!serviceFileId) return
    setLoadingFallback(true)
    listTraysForServiceSheet(serviceFileId)
      .then((trays) => {
        setFetchedQuotes(trays)
      })
      .catch((err) => {
        console.error('[PrintTraysDialog] Eroare la încărcarea tăvițelor:', err)
        setFetchedQuotes([])
      })
      .finally(() => setLoadingFallback(false))
  }, [open, serviceFileId, quotesProp?.length])

  /**
   * Conținutul de print e în portalul Radix (dialog). Clonăm în body (#print-trays-print-root),
   * apelăm window.print() o singură dată, ștergem după print.
   */
  const runPrint = useCallback(() => {
    const existingRoot = document.getElementById('print-trays-print-root')
    if (existingRoot) existingRoot.remove()

    const el = document.getElementById('print-trays-section')
    if (!el || el.textContent?.includes('Se încarcă') || el.textContent?.includes('Nu există tăvițe')) {
      if (!directPrint) toast.error('Conținutul pentru print nu e încărcat. Așteaptă încărcarea sau încearcă din nou.')
      return
    }

    const clone = el.cloneNode(true) as HTMLElement
    clone.removeAttribute('id')
    const root = document.createElement('div')
    root.id = 'print-trays-print-root'
    root.appendChild(clone)
    document.documentElement.classList.add('print-trays-only')
    document.body.classList.add('print-trays-only')
    document.body.appendChild(root)
    printRootRef.current = root

    const cleanup = () => {
      root.remove()
      document.documentElement.classList.remove('print-trays-only')
      document.body.classList.remove('print-trays-only')
      printRootRef.current = null
      window.removeEventListener('afterprint', cleanup)
      if (directPrint) onOpenChange(false)
    }
    window.addEventListener('afterprint', cleanup)
    setTimeout(() => window.print(), 100)
  }, [directPrint, onOpenChange])

  const handlePrint = () => runPrint()

  /** La directPrint: print o singură dată per deschidere (onSheetsLoaded poate fi apelat de mai multe ori). */
  const onSheetsLoaded = useCallback(
    (_sheets: TrayPrintSheet[]) => {
      if (!directPrint) return
      if (printTriggeredRef.current) return
      printTriggeredRef.current = true
      setTimeout(() => runPrint(), 400)
    },
    [directPrint, runPrint]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange} {...(directPrint ? { 'data-direct-print': '' } : {})}>
      <DialogContent
        fullScreen
        className={`w-screen h-screen p-0 border-0 shadow-2xl flex flex-col overflow-hidden ${directPrint ? 'print-trays-dialog-direct-print' : ''}`}
        showCloseButton={!directPrint}
      >
        <DialogHeader className={directPrint ? 'sr-only' : ''}>
          <DialogTitle>Print tăvițe</DialogTitle>
        </DialogHeader>

        {!directPrint && (
        <div className="bg-gradient-to-r from-purple-500 to-pink-600 px-6 py-5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Package className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Print tăvițe</h2>
                <p className="text-purple-100 text-sm">Previzualizare și tipărire tăvițe fișă</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handlePrint} variant="secondary" className="gap-2 bg-white/20 hover:bg-white/30 text-white border-0">
                <Printer className="h-4 w-4" />
                Tipărește
              </Button>
              <Button variant="secondary" onClick={() => onOpenChange(false)} className="bg-white/20 hover:bg-white/30 text-white border-0">
                Închide
              </Button>
            </div>
          </div>
        </div>
        )}

        <div className={directPrint ? 'flex-1 overflow-hidden bg-white min-h-0' : 'flex-1 overflow-hidden bg-white'}>
          <div className="p-4 h-full flex flex-col">
            {!directPrint && <div className="text-sm font-medium text-gray-600 mb-2">Previzualizare print tăvițe:</div>}
            <ScrollArea className="flex-1 border rounded-lg bg-white shadow-inner">
              <div className="p-4">
                {loadingFallback ? (
                  <div id="print-trays-section" className="p-4 bg-white text-black">
                    <div className="text-center text-gray-500">Se încarcă tăvițele...</div>
                  </div>
                ) : (
                  <PrintTraysData
                    lead={lead}
                    quotes={quotes}
                    officeDirect={officeDirect}
                    curierTrimis={curierTrimis}
                    services={services}
                    instruments={instruments}
                    pipelinesWithIds={pipelinesWithIds}
                    serviceFileNumber={serviceFileNumber}
                    isPrintMode={true}
                    onSheetsLoaded={onSheetsLoaded}
                  />
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
