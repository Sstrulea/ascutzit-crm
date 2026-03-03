'use client'

import React from 'react'
import type { Lead } from '@/app/(crm)/dashboard/page'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { LeadQuote, LeadQuoteItem } from '@/lib/types/preturi'

interface SheetData {
  quote: LeadQuote
  items: LeadQuoteItem[]
  subtotal: number
  totalDiscount: number
  urgentAmount: number
  total: number
}

interface PrintTraysViewProps {
  lead: Lead
  sheets: SheetData[]
  serviceFileNumber?: string | number
  officeDirect: boolean
  curierTrimis: boolean
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>
  techniciansByTrayId?: Map<string, string>
  isPrintMode?: boolean
}

// Stiluri pentru tabel instrument – text de 1.5x pentru print
const styles = {
  table: {
    width: '100%' as const,
    borderCollapse: 'collapse' as const,
    border: '1px solid #000',
    fontSize: '26px',
  },
  headerCell: {
    border: '1px solid #000',
    backgroundColor: '#d0d0d0',
    color: '#000',
    fontWeight: 'bold' as const,
    fontSize: '26px',
    padding: '6px 5px',
    textAlign: 'left' as const,
    verticalAlign: 'middle' as const,
  },
  cell: {
    border: '1px solid #000',
    fontSize: '23px',
    padding: '5px 5px',
    textAlign: 'left' as const,
    verticalAlign: 'middle' as const,
  },
  cellCenter: {
    border: '1px solid #000',
    fontSize: '23px',
    padding: '5px 5px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
  },
  cellRight: {
    border: '1px solid #000',
    fontSize: '23px',
    padding: '5px 5px',
    textAlign: 'right' as const,
    verticalAlign: 'middle' as const,
  },
  instrumentRow: {
    backgroundColor: '#e8e8e8',
  },
  serviceRow: {
    backgroundColor: '#ffffff',
  },
}

function groupItemsByInstrument(items: LeadQuoteItem[], instrumentsMap: Map<string, string>) {
  const groups = new Map<string, { name: string; items: LeadQuoteItem[] }>()
  for (const it of items) {
    if (!it.item_type) continue
    const iid = it.instrument_id || 'unknown'
    const name = it.instrument_name || instrumentsMap.get(iid) || 'Instrument'
    if (!groups.has(iid)) groups.set(iid, { name, items: [] })
    groups.get(iid)!.items.push(it)
  }
  return Array.from(groups.values())
}

function getSerialBrandLabel(item: LeadQuoteItem): string {
  if (item.serial_number || item.brand) {
    return [item.brand, item.serial_number].filter(Boolean).join(' – ') || '—'
  }
  return '—'
}

export function PrintTraysView({
  lead,
  sheets,
  serviceFileNumber,
  officeDirect,
  curierTrimis,
  services,
  instruments,
  techniciansByTrayId = new Map(),
  isPrintMode = true,
}: PrintTraysViewProps) {
  const instrumentsMap = new Map(instruments.map((i) => [i.id, i.name]))
  const livrare = officeDirect ? 'Office direct' : curierTrimis ? 'Curier trimis' : '—'

  return (
    <div
      id="print-trays-section"
      className="bg-white text-black"
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: '17px',
        padding: '12px',
        maxWidth: '210mm',
      }}
    >
      {/* CSS pentru print – aceeași structură ca în PrintView (fișa de serviciu) */}
      {isPrintMode && (
        <style
          dangerouslySetInnerHTML={{
            __html: `
            @media print {
              thead { display: table-header-group; }
              tbody { display: table-row-group; }
              tr { page-break-inside: avoid; }
              .tray-block { page-break-inside: avoid; }
              @page { margin: 10mm; }
            }
          `,
          }}
        />
      )}

      {/* Header – TĂVIȚE; toate tăvițele fișei în dreapta, separate prin virgulă */}
      <div style={{ marginBottom: '12px', border: '2px solid #000', padding: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px', gap: '12px' }}>
          <span style={{ fontSize: '36px', fontWeight: 'bold' }}>TĂVIȚE</span>
          {(() => {
            const allTrayNrs = sheets.map((s) => (s.quote as { number?: string })?.number).filter(Boolean) as string[]
            return allTrayNrs.length > 0 ? (
              <span style={{ fontSize: '24px', fontWeight: 'bold', textAlign: 'right' }}>{allTrayNrs.join(', ')}</span>
            ) : null
          })()}
        </div>
        <div style={{ fontSize: '20px', fontStyle: 'italic', marginBottom: '8px', fontWeight: 'bold' }}>
          Comanda Nr.: {lead.leadId ?? lead.id ?? '-'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '20px', lineHeight: '1.8' }}>
          <div>
            <div><strong>FIȘĂ:</strong> {String(serviceFileNumber ?? '—')}</div>
            <div><strong>CLIENT:</strong> {lead.name?.toUpperCase() ?? '-'}</div>
            <div><strong>NR. TELEFON:</strong> {lead.phone ?? '-'}</div>
            <div><strong>LIVRARE:</strong> {livrare}</div>
          </div>
          <div>
            <div><strong>STRADĂ:</strong> {lead.street ?? lead.strada ?? lead.address ?? '-'}</div>
            <div><strong>ORAȘ:</strong> {lead.city ?? '-'}</div>
            <div><strong>JUDEȚ:</strong> {lead.county ?? lead.judet ?? '-'}</div>
          </div>
        </div>
      </div>

      {/* Tabele pe tăviță – aceeași convenție thead/tbody ca în PrintView */}
      {sheets.map((sheet, idx) => {
        const q = sheet.quote as { id: string; number?: string; size?: string }
        const nr = q?.number ?? `Tăviță ${idx + 1}`
        const size = ''
        const groups = groupItemsByInstrument(sheet.items, instrumentsMap)

        if (groups.length === 0 && sheet.items.length === 0) {
          return (
            <div key={sheet.quote.id} className="tray-block" style={{ marginBottom: '12px', padding: '10px', pageBreakInside: 'avoid' }}>
              <div style={{ fontSize: '26px', color: '#666' }}>Fără instrumente/servicii</div>
            </div>
          )
        }

        return (
          <div key={sheet.quote.id} className="tray-block" style={{ marginBottom: '16px', pageBreakInside: 'avoid' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.headerCell, width: '18%' }}>Instrument</th>
                  <th style={{ ...styles.headerCell, width: '12%' }}>Serial / Brand</th>
                  <th style={{ ...styles.headerCell, width: '36%' }}>Serviciu / Piesă</th>
                  <th style={{ ...styles.headerCell, width: '8%', textAlign: 'center' }}>Cant.</th>
                  <th style={{ ...styles.headerCell, width: '12%', textAlign: 'right' }}>Preț</th>
                  <th style={{ ...styles.headerCell, width: '14%', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((g) => {
                  const firstSerialInGroup = g.items.map((it) => getSerialBrandLabel(it)).find((s) => s !== '—') || '—'
                  return g.items.map((item, i) => {
                    const sn = getSerialBrandLabel(item)
                    const name = item.name_snapshot || (item.service_id && services.find((s) => s.id === item.service_id)?.name) || '—'
                    const price = (item as { price?: number }).price ?? 0
                    const qty = item.qty ?? 1
                    const disc = Math.min(100, Math.max(0, item.discount_pct ?? 0))
                    const total = qty * price * (1 - disc / 100)
                    const isFirst = i === 0
                    const displaySn = isFirst ? (sn !== '—' ? sn : firstSerialInGroup) : sn
                    return (
                      <tr key={item.id} style={isFirst ? styles.instrumentRow : styles.serviceRow}>
                        <td style={styles.cell}>{isFirst ? g.name : ''}</td>
                        <td style={styles.cell}>{isFirst ? displaySn : (sn !== '—' ? sn : '')}</td>
                        <td style={styles.cell}>{name}</td>
                        <td style={styles.cellCenter}>{qty}</td>
                        <td style={styles.cellRight}>{price.toFixed(2)}</td>
                        <td style={styles.cellRight}>{total.toFixed(2)} RON</td>
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
