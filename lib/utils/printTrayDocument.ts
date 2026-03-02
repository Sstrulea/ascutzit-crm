/**
 * Document HTML complet pentru print tăvițe – generat din date (ca fișa de serviciu).
 * Fereastra nouă conține conținutul real, nu innerHTML din pagină.
 */

/** Date pentru un item din tăviță (pentru generare HTML) */
export interface TrayPrintItem {
  id: string
  item_type?: 'service' | 'part' | null
  instrument_id?: string | null
  instrument_name?: string | null
  service_id?: string | null
  name_snapshot?: string | null
  brand?: string | null
  serial_number?: string | null
  qty?: number
  price?: number
  discount_pct?: number
}

/** Quote/tăviță pentru print */
export interface TrayPrintQuote {
  id: string
  number?: string | number
}

/** Un „sheet” = o tăviță cu items */
export interface TrayPrintSheet {
  quote: TrayPrintQuote
  items: TrayPrintItem[]
}

export interface TrayPrintData {
  lead: { name?: string | null; phone?: string | null; leadId?: string | null; id?: string | null }
  sheets: TrayPrintSheet[]
  serviceFileNumber?: string | number
  livrare: string
  services: Array<{ id: string; name?: string | null }>
  instruments: Array<{ id: string; name: string }>
}

function escapeHtml(s: string | number | null | undefined): string {
  if (s == null) return '—'
  const t = String(s)
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function groupItemsByInstrument(
  items: TrayPrintItem[],
  instrumentsMap: Map<string, string>
): Array<{ name: string; items: TrayPrintItem[] }> {
  const groups = new Map<string, { name: string; items: TrayPrintItem[] }>()
  for (const it of items) {
    if (!it.item_type) continue
    const iid = it.instrument_id || 'unknown'
    const name = it.instrument_name || instrumentsMap.get(iid) || 'Instrument'
    if (!groups.has(iid)) groups.set(iid, { name, items: [] })
    groups.get(iid)!.items.push(it)
  }
  return Array.from(groups.values())
}

function getSerialBrandLabel(item: TrayPrintItem): string {
  if (item.serial_number || item.brand) {
    return [item.brand, item.serial_number].filter(Boolean).join(' – ') || '—'
  }
  return '—'
}

const PRINT_STYLES = `
  @page { size: A4; margin: 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: 15pt;
    line-height: 1.4;
    color: #333;
    background: #fff;
  }
  .container {
    max-width: 210mm;
    margin: 0 auto;
    padding: 10mm;
  }
  .header { margin-bottom: 10px; }
  .doc-title-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
  .doc-title { font-size: 27px; font-weight: bold; }
  .doc-tray-nr { font-size: 20px; font-weight: bold; }
  .doc-meta { font-size: 15px; font-style: italic; margin-bottom: 6px; }
  .client-block { font-size: 15px; line-height: 1.6; }
  table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #000;
    font-size: 21pt;
    margin-top: 6px;
  }
  th, td { border: 1px solid #000; padding: 7px 8px; }
  th {
    background: #d0d0d0;
    color: #000;
    font-weight: bold;
    text-align: left;
  }
  tr { page-break-inside: avoid; }
  .tray-block { page-break-inside: avoid; margin-bottom: 10px; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .container { padding: 0; }
    .no-print { display: none !important; }
    thead { display: table-header-group; }
    tbody { display: table-row-group; }
  }
  .print-button {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 20px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11pt;
    font-weight: 600;
    z-index: 1000;
  }
  @media print { .print-button { display: none !important; } }
`

/**
 * Construiește HTML-ul complet al documentului de print din date (ca fișa de serviciu).
 */
export function buildTrayPrintDocumentHtml(data: TrayPrintData): string {
  const { lead, sheets, serviceFileNumber, livrare, services, instruments } = data
  const instrumentsMap = new Map(instruments.map((i) => [i.id, i.name]))
  const servicesMap = new Map(services.map((s) => [s.id, s.name || '']))

  const orderNr = lead.leadId ?? lead.id ?? '—'
  const clientName = (lead.name ?? '').toUpperCase() || '—'
  const clientPhone = lead.phone ?? '—'
  const allTrayNrs = sheets.map((s) => s.quote?.number != null ? String(s.quote.number) : '').filter(Boolean)
  const allTrayNrsStr = allTrayNrs.join(', ')

  let bodyHtml = ''
  bodyHtml += '<div class="header">'
  bodyHtml += '<div class="doc-title-row"><span class="doc-title">TĂVIȚE</span>'
  if (allTrayNrsStr) bodyHtml += '<span class="doc-tray-nr">' + escapeHtml(allTrayNrsStr) + '</span>'
  bodyHtml += '</div>'
  bodyHtml += '<div class="doc-meta">la comanda Nr.: ' + escapeHtml(orderNr) + '</div>'
  bodyHtml += '<div class="client-block">'
  bodyHtml += '<div><strong>CLIENT:</strong> ' + escapeHtml(clientName) + '</div>'
  bodyHtml += '<div><strong>MOB:</strong> ' + escapeHtml(clientPhone) + '</div>'
  bodyHtml += '<div><strong>LIVRARE:</strong> ' + escapeHtml(livrare) + '</div>'
  bodyHtml += '</div></div>'

  for (const sheet of sheets) {
    const q = sheet.quote
    const nr = q?.number ?? '—'
    const groups = groupItemsByInstrument(sheet.items, instrumentsMap)

    bodyHtml += '<div class="tray-block">'
    if (groups.length === 0 && sheet.items.length === 0) {
      bodyHtml += '<div style="font-size:21pt;color:#666">Fără instrumente/servicii</div>'
    } else {
      bodyHtml += '<table><thead><tr>'
      bodyHtml += '<th style="width:18%">Instrument</th>'
      bodyHtml += '<th style="width:12%">Serial / Brand</th>'
      bodyHtml += '<th style="width:36%">Serviciu / Piesă</th>'
      bodyHtml += '<th style="width:8%;text-align:center">Cant.</th>'
      bodyHtml += '<th style="width:12%;text-align:right">Preț</th>'
      bodyHtml += '<th style="width:14%;text-align:right">Total</th>'
      bodyHtml += '</tr></thead><tbody>'

      for (const g of groups) {
        const firstSerialInGroup = g.items.map(getSerialBrandLabel).find((s) => s !== '—') || '—'
        for (let i = 0; i < g.items.length; i++) {
          const item = g.items[i]
          const isFirst = i === 0
          const sn = getSerialBrandLabel(item)
          const displaySn = isFirst ? (sn !== '—' ? sn : firstSerialInGroup) : sn
          const name =
            item.name_snapshot ||
            (item.service_id ? servicesMap.get(item.service_id) || '—' : '—')
          const price = item.price ?? 0
          const qty = item.qty ?? 1
          const disc = Math.min(100, Math.max(0, item.discount_pct ?? 0))
          const total = qty * price * (1 - disc / 100)
          const bg = isFirst ? 'background:#e8e8e8' : ''

          bodyHtml += '<tr style="' + bg + '">'
          bodyHtml += '<td>' + escapeHtml(isFirst ? g.name : '') + '</td>'
          bodyHtml += '<td>' + escapeHtml(isFirst ? displaySn : (sn !== '—' ? sn : '')) + '</td>'
          bodyHtml += '<td>' + escapeHtml(name) + '</td>'
          bodyHtml += '<td style="text-align:center">' + escapeHtml(qty) + '</td>'
          bodyHtml += '<td style="text-align:right">' + price.toFixed(2) + '</td>'
          bodyHtml += '<td style="text-align:right">' + total.toFixed(2) + ' RON</td>'
          bodyHtml += '</tr>'
        }
      }
      bodyHtml += '</tbody></table>'
    }
    bodyHtml += '</div>'
  }

  const fullHtml =
    '<!DOCTYPE html><html lang="ro">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Print tăvițe</title><style>' +
    PRINT_STYLES +
    '</style></head>' +
    '<body>' +
    '<button type="button" class="print-button no-print" onclick="window.print()">🖨️ Tipărește</button>' +
    '<div class="container">' +
    bodyHtml +
    '</div>' +
    '</body></html>'

  return fullHtml
}

/**
 * Deschide o fereastră nouă cu documentul de print generat din date.
 * Conținutul este întotdeauna prezent în fereastră (ca la fișa de serviciu).
 */
export function openTrayPrintDocumentFromData(
  data: TrayPrintData,
  options?: { autoPrint?: boolean }
): Window | null {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer')
  if (!printWindow) return null

  const fullHtml = buildTrayPrintDocumentHtml(data)
  const autoPrint = options?.autoPrint !== false

  const docWithPrint =
    fullHtml.slice(0, fullHtml.length - '</body></html>'.length) +
    (autoPrint
      ? '<script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>'
      : '') +
    '</body></html>'

  printWindow.document.write(docWithPrint)
  printWindow.document.close()
  printWindow.focus()

  return printWindow
}

// --- Păstrăm și varianta din innerHTML pentru compatibilitate (fallback) ---
function escapeForDocument(html: string): string {
  return html
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/<\/style>/gi, '<\\/style>')
}

/**
 * Deschide fereastra cu conținut din innerHTML (fallback dacă nu ai date).
 */
export function openTrayPrintDocument(contentHtml: string, options?: { autoPrint?: boolean }): Window | null {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer')
  if (!printWindow) return null

  const safeContent = escapeForDocument(contentHtml)
  const autoPrint = options?.autoPrint !== false

  const fullHtml =
    '<!DOCTYPE html><html lang="ro">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Print tăvițe</title><style>' +
    PRINT_STYLES +
    '</style></head>' +
    '<body>' +
    '<button type="button" class="print-button no-print" onclick="window.print()">🖨️ Tipărește</button>' +
    '<div class="container">' +
    safeContent +
    '</div>' +
    (autoPrint
      ? '<script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>'
      : '') +
    '</body></html>'

  printWindow.document.write(fullHtml)
  printWindow.document.close()
  printWindow.focus()

  return printWindow
}
