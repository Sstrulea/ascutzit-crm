'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Printer, Package } from 'lucide-react'
import type { Lead } from '@/app/(crm)/dashboard/page'
import type { LeadQuote } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import { PrintPredarePrimireView, type PredarePrimireRow, type PredarePrimireEditPatch } from '@/components/print/print-predare-primire-view'
import { listTraysForServiceSheet } from '@/lib/utils/preturi-helpers'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import type { TrayItem } from '@/lib/supabase/serviceFileOperations'
import { toast } from 'sonner'

const supabase = supabaseBrowser()

/** Data de azi în format DD.MM.YYYY */
function todayFormatted(): string {
  const d = new Date()
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

interface PrintPredarePrimireDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead
  quotes: LeadQuote[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>
  services: Service[]
  serviceFileNumber?: string | number
  serviceFileId?: string | null
  /** Dacă true: deschide direct fereastra de print fără previzualizare. */
  directPrint?: boolean
}

export function PrintPredarePrimireDialog({
  open,
  onOpenChange,
  lead,
  quotes: quotesProp,
  instruments,
  services,
  serviceFileNumber,
  serviceFileId,
  directPrint = false,
}: PrintPredarePrimireDialogProps) {
  const printRootRef = useRef<HTMLDivElement | null>(null)
  const printTriggeredRef = useRef(false)
  const [fetchedQuotes, setFetchedQuotes] = useState<LeadQuote[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<PredarePrimireRow[]>([])
  const [trayNumbersStr, setTrayNumbersStr] = useState('')
  /** Pe dispozitive lente: true după ce tray_items sunt încărcate (sau nu există tăvițe), ca butonul Print și clone-ul să fie sigure */
  const [trayItemsLoaded, setTrayItemsLoaded] = useState(false)

  /** State pentru editare în previzualizare – folosit când !directPrint */
  const [printEdit, setPrintEdit] = useState<PredarePrimireEditPatch & { rows: PredarePrimireRow[] }>({
    serviceFileNumber: '',
    trayNumbers: '',
    clientName: '',
    clientCif: '',
    clientRegCom: '',
    clientAddress: '',
    clientJudet: '',
    clientTara: 'Romania',
    clientPhone: '',
    dataPrimire: todayFormatted(),
    rows: [],
  })

  const quotes = quotesProp?.length ? quotesProp : (fetchedQuotes ?? [])

  // Comentarii client din câmpul details al lead-ului (folosit pentru toate rândurile)
  const leadDetailsForComments = (lead as Record<string, unknown>).details as string ?? ''

  // Cheie stabilă pentru lista de tăvițe (evită bucla infinită când parent trimite referință nouă la quotes)
  const quoteIdsKey = quotes.map((q) => q.id).filter(Boolean).sort().join(',')

  useEffect(() => {
    if (open) printTriggeredRef.current = false
  }, [open])

  useEffect(() => {
    if (!open) return
    if (quotesProp?.length) {
      setFetchedQuotes(null)
    } else if (serviceFileId) {
      setLoading(true)
      listTraysForServiceSheet(serviceFileId)
        .then((trays) => setFetchedQuotes(trays || []))
        .catch(() => setFetchedQuotes([]))
        .finally(() => setLoading(false))
    }
  }, [open, serviceFileId, quotesProp?.length])

  // Date client din lead – declarate înainte de useEffect care le folosește
  const leadAny = lead as Record<string, unknown>
  const clientName = (leadAny.name ?? leadAny.full_name ?? '') as string
  const clientPhone = (leadAny.phone ?? leadAny.phone_number ?? '') as string
  const clientAddress = [
    leadAny.address,
    leadAny.address2,
    leadAny.billing_strada,
    leadAny.billing_oras,
    leadAny.strada,
    leadAny.city,
  ]
    .filter(Boolean)
    .join(', ') || (leadAny.company_address as string) || ''
  const clientJudet = (leadAny.judet ?? leadAny.billing_judet ?? '') as string
  const clientTara = (leadAny.country ?? 'Romania') as string
  const clientCif = (leadAny.billing_cui ?? leadAny.cif ?? null) as string | null
  const clientRegCom = (leadAny.billing_reg_com ?? leadAny.reg_com ?? null) as string | null

  // Reset la închidere sau când nu sunt tăvițe
  useEffect(() => {
    if (!open || quotes.length === 0) {
      setRows([])
      setTrayNumbersStr('')
    }
  }, [open, quotes.length])

  // Sincronizează printEdit când datele sunt încărcate (pentru previzualizare editabilă)
  useEffect(() => {
    if (!open || quotes.length === 0) return
    setPrintEdit((prev) => ({
      ...prev,
      serviceFileNumber: String(serviceFileNumber ?? ''),
      trayNumbers: trayNumbersStr ?? '',
      clientName: clientName || '',
      clientCif: clientCif ?? '',
      clientRegCom: clientRegCom ?? '',
      clientAddress: clientAddress || '',
      clientJudet: clientJudet ?? '',
      clientTara: clientTara ?? 'Romania',
      clientPhone: clientPhone ?? '',
      dataPrimire: prev.dataPrimire || todayFormatted(),
      rows: rows.length ? [...rows] : prev.rows,
    }))
  }, [open, quotes.length, serviceFileNumber, trayNumbersStr, clientName, clientCif, clientRegCom, clientAddress, clientJudet, clientTara, clientPhone, rows, quoteIdsKey])

  // Încarcă tray_items și construiește rows – dependențe stabile (fără referință la quotes)
  useEffect(() => {
    if (!open || !quotes.length) {
      setTrayItemsLoaded(false)
      return
    }

    const trayIds = quotes.map((q) => q.id).filter(Boolean)
    if (trayIds.length === 0) {
      setRows([])
      setTrayNumbersStr(quotes.map((q) => (q as LeadQuote & { number?: string }).number ?? '').filter(Boolean).join(', '))
      setTrayItemsLoaded(true)
      return
    }

    setTrayItemsLoaded(false)
    let cancelled = false
    const instrumentsMap = new Map(instruments.map((i) => [i.id, i.name]))

    supabase
      .from('tray_items')
      .select('id, tray_id, instrument_id, service_id, part_id, qty, notes, serials')
      .in('tray_id', trayIds)
      .order('tray_id', { ascending: true })
      .order('id', { ascending: true })
      .then(({ data: items, error }) => {
        if (cancelled || error) {
          if (!cancelled && error) console.error('[PrintPredarePrimire] tray_items error:', error)
          if (!cancelled) setTrayItemsLoaded(true)
          return
        }

        const trayNrs = quotes
          .map((q) => (q as LeadQuote & { number?: string }).number ?? '')
          .filter((n) => n != null && String(n).trim() !== '')
        setTrayNumbersStr(trayNrs.join(', '))

        const built: PredarePrimireRow[] = []
        const rawItems = (items || []) as (TrayItem & { notes?: string | null; serials?: string | null })[]

        for (const item of rawItems) {
          let notesData: Record<string, unknown> = {}
          try {
            if (item.notes) notesData = JSON.parse(item.notes) as Record<string, unknown>
          } catch {}

          const instrumentId = (item.instrument_id || notesData.instrument_id) as string | null
            || (item.service_id && services.find((s) => s.id === item.service_id)?.instrument_id)
            || null
          const instrumentName = instrumentId ? (instrumentsMap.get(instrumentId) ?? '') : (notesData.name_snapshot as string) ?? (notesData.name as string) ?? 'Instrument'
          // S/N din coloana serials (câmpul din UI „S/N (optional, unul per linie sau separate prin virgulă)”)
          const serialNumber = typeof item.serials === 'string' && item.serials.trim()
            ? item.serials.trim()
            : (notesData.serial_number as string) ?? (notesData.serial as string) ?? (Array.isArray(notesData.serials) && notesData.serials[0] != null ? String(notesData.serials[0]) : '')
          // Brand: din notes sau numele instrumentului (ca în UI „Mandrina manichiura”)
          const brand = (notesData.brand as string) ?? (notesData.brand_name as string) ?? instrumentName ?? ''
          const qty = typeof item.qty === 'number' ? item.qty : 1
          // Comentarii client din câmpul details al lead-ului
          const comentariiClient = leadDetailsForComments || ''

          built.push({
            instrument: instrumentName || '—',
            brand: brand || '',
            serialNumber: serialNumber || '',
            nr: qty,
            comentariiClient: comentariiClient || '',
          })
        }

        setRows(built)
        setTrayItemsLoaded(true)
      })

    return () => { cancelled = true }
  }, [open, quotes.length, quoteIdsKey, instruments, services, leadDetailsForComments])

  /** În clone pentru print: înlocuiește input/textarea cu text static ca la print să nu fie editabil. */
  const replaceInputsWithStaticText = useCallback((container: HTMLElement) => {
    container.querySelectorAll('input').forEach((input) => {
      const span = document.createElement('span')
      span.textContent = (input as HTMLInputElement).value || '—'
      span.style.display = 'inline'
      input.parentNode?.replaceChild(span, input)
    })
    container.querySelectorAll('textarea').forEach((textarea) => {
      const div = document.createElement('div')
      div.textContent = (textarea as HTMLTextAreaElement).value || ''
      div.style.whiteSpace = 'pre-wrap'
      div.style.wordBreak = 'break-word'
      textarea.parentNode?.replaceChild(div, textarea)
    })
  }, [])

  const runPrint = useCallback(() => {
    const doCloneAndPrint = () => {
      const existingRoot = document.getElementById('print-predare-primire-print-root')
      if (existingRoot) existingRoot.remove()

      const el = document.getElementById('print-predare-primire-section')
      if (!el || el.textContent?.includes('Se încarcă')) {
        if (!directPrint) toast.error('Conținutul pentru print nu e încărcat. Așteaptă sau încearcă din nou.')
        return
      }

      const clone = el.cloneNode(true) as HTMLElement
      clone.removeAttribute('id')
      replaceInputsWithStaticText(clone)
      const root = document.createElement('div')
      root.id = 'print-predare-primire-print-root'
      root.appendChild(clone)
      document.documentElement.classList.add('print-predare-primire-only')
      document.body.classList.add('print-predare-primire-only')
      document.body.appendChild(root)
      printRootRef.current = root

      const cleanup = () => {
        root.remove()
        document.documentElement.classList.remove('print-predare-primire-only')
        document.body.classList.remove('print-predare-primire-only')
        printRootRef.current = null
        window.removeEventListener('afterprint', cleanup)
        if (directPrint) onOpenChange(false)
      }
      window.addEventListener('afterprint', cleanup)
      // Delay mai mare (150ms) ca pe dispozitive lente layout-ul clonei să fie gata înainte de print
      setTimeout(() => window.print(), 150)
    }

    // Pe dispozitive lente: așteaptă un frame + macrotask ca React să fi scris în DOM valorile curente
    requestAnimationFrame(() => {
      setTimeout(doCloneAndPrint, 0)
    })
  }, [directPrint, onOpenChange, replaceInputsWithStaticText])

  /** Conținut gata pentru print (date încărcate, DOM consistent) – pentru dispozitive lente */
  const contentReady = !loading && quotes.length > 0 && trayItemsLoaded

  const onContentReady = useCallback(() => {
    if (!directPrint) return
    if (printTriggeredRef.current) return
    if (!contentReady) return
    printTriggeredRef.current = true
    // Delay mărit (500ms) ca pe dispozitive lente view-ul să fie randat înainte de clone
    setTimeout(() => runPrint(), 500)
  }, [directPrint, runPrint, contentReady])

  useEffect(() => {
    if (!directPrint || !open) return
    if (contentReady) onContentReady()
  }, [directPrint, open, contentReady, onContentReady])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullScreen
        className="w-screen h-screen p-0 border-0 shadow-2xl flex flex-col overflow-hidden"
        showCloseButton={!directPrint}
      >
        <DialogHeader className={directPrint ? 'sr-only' : ''}>
          <DialogTitle>Fisă predare / primire în service</DialogTitle>
        </DialogHeader>

        {!directPrint && (
          <div className="bg-gradient-to-r from-slate-600 to-slate-700 px-6 py-5 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <Package className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Fisă predare / primire</h2>
                  <p className="text-slate-200 text-sm">Document pentru predarea/primirea instrumentelor în service</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={runPrint}
                  disabled={!contentReady}
                  variant="secondary"
                  className="gap-2 bg-white/20 hover:bg-white/30 text-white border-0 disabled:opacity-60 disabled:pointer-events-none"
                  title={!contentReady ? 'Se încarcă conținutul...' : undefined}
                >
                  <Printer className="h-4 w-4" />
                  {contentReady ? 'Tipărește' : 'Se pregătesc datele...'}
                </Button>
                <Button variant="secondary" onClick={() => onOpenChange(false)} className="bg-white/20 hover:bg-white/30 text-white border-0">
                  Închide
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden bg-white">
          <div className="p-4 h-full flex flex-col">
            {!directPrint && (
              <div className="text-sm font-medium text-gray-600 mb-2">
                Previzualizare – poți edita câmpurile (nr. fișă, tăvițe, date client, instrumente, S/N, comentarii) înainte de print.
              </div>
            )}
            <ScrollArea className="flex-1 border rounded-lg bg-white shadow-inner">
              <div className="p-4">
                {loading ? (
                  <div id="print-predare-primire-section" className="p-4 bg-white text-black">
                    <div className="text-center text-gray-500">Se încarcă datele...</div>
                  </div>
                ) : quotes.length > 0 && !trayItemsLoaded ? (
                  <div id="print-predare-primire-section" className="p-4 bg-white text-black">
                    <div className="text-center text-gray-500">Se încarcă instrumentele și tăvițele...</div>
                  </div>
                ) : !quotes.length ? (
                  <div id="print-predare-primire-section" className="p-4 bg-white text-black">
                    <div className="text-center text-gray-500">Nu există tăvițe pentru această fișă.</div>
                  </div>
                ) : (
                  <PrintPredarePrimireView
                    serviceFileNumber={!directPrint ? (printEdit.serviceFileNumber ?? serviceFileNumber ?? '') : (serviceFileNumber ?? '')}
                    trayNumbers={!directPrint ? (printEdit.trayNumbers ?? trayNumbersStr) : trayNumbersStr}
                    clientName={!directPrint ? ((printEdit.clientName ?? clientName) || '') : (clientName || '—')}
                    clientCif={!directPrint ? (printEdit.clientCif ?? clientCif) : clientCif}
                    clientRegCom={!directPrint ? (printEdit.clientRegCom ?? clientRegCom) : clientRegCom}
                    clientAddress={!directPrint ? ((printEdit.clientAddress ?? clientAddress) || '') : (clientAddress || '—')}
                    clientJudet={!directPrint ? ((printEdit.clientJudet ?? clientJudet) || '') : (clientJudet || '—')}
                    clientTara={!directPrint ? ((printEdit.clientTara ?? clientTara) || 'Romania') : (clientTara || 'Romania')}
                    clientPhone={!directPrint ? ((printEdit.clientPhone ?? clientPhone) || '') : (clientPhone || '—')}
                    dataPrimire={!directPrint ? (printEdit.dataPrimire ?? todayFormatted()) : todayFormatted()}
                    rows={!directPrint && printEdit.rows?.length ? printEdit.rows : rows}
                    isPrintMode={true}
                    editable={!directPrint}
                    onEditChange={!directPrint ? (patch) => setPrintEdit((prev) => ({ ...prev, ...patch })) : undefined}
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
