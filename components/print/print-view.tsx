'use client'

import React from 'react'
import type { Lead } from '@/app/(crm)/dashboard/page'
import type { Service } from '@/lib/supabase/serviceOperations'

// Tipuri pentru print view
type LeadQuoteItem = any
type LeadQuote = any

interface SheetData {
  quote: LeadQuote
  items: LeadQuoteItem[]
  subtotal: number
  totalDiscount: number
  urgentAmount: number
  total: number
  hasSubscription?: boolean
  subscriptionDiscount?: number
  subscriptionDiscountServices?: number
  subscriptionDiscountParts?: number
  hasSterilization?: boolean
  sterilizationDiscountAmount?: number
  isCash?: boolean
  isCard?: boolean
}

interface PrintViewProps {
  lead: Lead
  sheets: SheetData[]
  allSheetsTotal: number
  urgentMarkupPct: number
  services?: Service[]
  instruments?: Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>
  serviceFileNumber?: string | number
  isPrintMode?: boolean // true pentru print, false pentru vizualizare detalii
}

// Interfață pentru un grup de instrument cu serviciile sale
interface InstrumentGroup {
  instrumentId: string
  instrumentName: string
  brandSerials: Array<{ brand: string; serialNumber: string; garantie: boolean }>
  services: LeadQuoteItem[]
  parts: LeadQuoteItem[]
}

// Calculează totalul pentru un item
function calculateItemTotal(item: LeadQuoteItem, urgentMarkupPct: number): number {
  const disc = Math.min(100, Math.max(0, item.discount_pct || 0))
  const base = (item.qty || 1) * (item.price || 0)
  const afterDisc = base * (1 - disc / 100)
  return item.urgent ? afterDisc * (1 + urgentMarkupPct / 100) : afterDisc
}

// Grupează toate itemurile pe instrument_id
function groupItemsByInstrument(
  sheets: SheetData[], 
  instrumentsMap: Map<string, string>,
  services: Service[]
): InstrumentGroup[] {
  const groups = new Map<string, InstrumentGroup>()
  
  sheets.forEach(sheet => {
    sheet.items.forEach(item => {
      // Skip items fără tip (doar instrumente fără servicii)
      if (!item.item_type) return
      
      const instrumentId = item.instrument_id || 'unknown'
      
      // Obține numele instrumentului (prioritate: instrument_name din item > instrumentsMap > fallback)
      let instrumentName = item.instrument_name || instrumentsMap.get(instrumentId)
      
      // Dacă nu s-a găsit, încearcă prin serviciu
      if (!instrumentName && item.service_id && services.length > 0) {
        const serviceDef = services.find(s => s.id === item.service_id)
        if (serviceDef?.instrument_id) {
          instrumentName = instrumentsMap.get(serviceDef.instrument_id)
        }
      }
      
      if (!instrumentName) {
        instrumentName = 'Instrument necunoscut'
      }
      
      if (!groups.has(instrumentId)) {
        groups.set(instrumentId, {
          instrumentId,
          instrumentName,
          brandSerials: [],
          services: [],
          parts: []
        })
      }
      
      const group = groups.get(instrumentId)!
      
      // Extrage brand și serial din item dacă există
      if (item.brand || item.serial_number) {
        const exists = group.brandSerials.some(
          bs => bs.brand === (item.brand || '') && bs.serialNumber === (item.serial_number || '')
        )
        if (!exists) {
          group.brandSerials.push({
            brand: item.brand || '',
            serialNumber: item.serial_number || '',
            garantie: item.garantie || false
          })
        }
      }
      
      if (item.item_type === 'service') {
        group.services.push(item)
      } else if (item.item_type === 'part') {
        group.parts.push(item)
      }
    })
  })
  
  // Convertește Map în array și sortează după ordinea de apariție
  return Array.from(groups.values())
}

// Stiluri pentru tabel
const styles = {
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    border: '1px solid #000',
    fontSize: '8px',
  },
  headerCell: {
    border: '1px solid #000',
    backgroundColor: '#d0d0d0',
    color: '#000',
    fontWeight: 'bold' as const,
    fontSize: '8px',
    padding: '4px 2px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
  },
  cell: {
    border: '1px solid #000',
    fontSize: '7px',
    padding: '2px 3px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
  },
  cellLeft: {
    border: '1px solid #000',
    fontSize: '7px',
    padding: '2px 3px',
    textAlign: 'left' as const,
    verticalAlign: 'middle' as const,
  },
  instrumentRow: {
    backgroundColor: '#e8e8e8',
  },
  serviceRow: {
    backgroundColor: '#ffffff',
  },
  subtotalRow: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold' as const,
  },
}

// Lățimi coloane (procente) – fără coloană TECH
const colWidths = {
  instrument: '14%',
  nr: '4%',
  serial: '14%',
  serviciu: '18%',
  piese: '14%',
  qty: '4%',
  dept: '10%',
  pret: '8%',
  subtotal: '8%',
}

export function PrintView({
  lead,
  sheets,
  allSheetsTotal,
  urgentMarkupPct,
  services = [],
  instruments = [],
  serviceFileNumber,
  isPrintMode = true
}: PrintViewProps) {
  // Creează map pentru instrumente
  const instrumentsMap = new Map<string, string>()
  instruments.forEach(inst => {
    instrumentsMap.set(inst.id, inst.name)
  })
  
  // Grupează toate itemurile pe instrument
  const instrumentGroups = groupItemsByInstrument(sheets, instrumentsMap, services)
  
  // Calculează totaluri pe departamente
  const departmentTotals: Record<string, number> = {}
  instrumentGroups.forEach(group => {
    [...group.services, ...group.parts].forEach(item => {
      const dept = item.department || 'Alte'
      const itemTotal = calculateItemTotal(item, urgentMarkupPct)
      departmentTotals[dept] = (departmentTotals[dept] || 0) + itemTotal
    })
  })
  
  // Calculează discount-urile totale
  const allSubtotal = sheets.reduce((acc, s) => acc + s.subtotal, 0)
  const allTotalDiscount = sheets.reduce((acc, s) => acc + s.totalDiscount, 0)
  const allUrgentAmount = sheets.reduce((acc, s) => acc + s.urgentAmount, 0)
  
  const firstSheet = sheets[0]
  const hasSubscription = firstSheet?.hasSubscription || false
  const subscriptionDiscountServices = firstSheet?.subscriptionDiscountServices
  const subscriptionDiscountParts = firstSheet?.subscriptionDiscountParts
  
  // Calculează discount abonament
  let subscriptionDiscountAmount = 0
  if (hasSubscription) {
    const servicesTotal = sheets.reduce((acc, sheet) => {
      return acc + sheet.items
        .filter(it => it.item_type === 'service')
        .reduce((sum, it) => sum + calculateItemTotal(it, urgentMarkupPct), 0)
    }, 0)
    
    const partsTotal = sheets.reduce((acc, sheet) => {
      return acc + sheet.items
        .filter(it => it.item_type === 'part')
        .reduce((sum, it) => sum + calculateItemTotal(it, 0), 0)
    }, 0)
    
    if (subscriptionDiscountServices) {
      subscriptionDiscountAmount += servicesTotal * (subscriptionDiscountServices / 100)
    }
    if (subscriptionDiscountParts) {
      subscriptionDiscountAmount += partsTotal * (subscriptionDiscountParts / 100)
    }
  }
  
  // Calculează totalul corect: subtotal - discount + urgent - abonament
  // Folosim allSheetsTotal dacă e valid, altfel calculăm
  const calculatedTotal = allSubtotal - allTotalDiscount + allUrgentAmount - subscriptionDiscountAmount
  const finalTotal = allSheetsTotal > 0 ? allSheetsTotal : calculatedTotal

  return (
    <div 
      id="print-section" 
      className="bg-white text-black" 
      style={{ 
        fontFamily: 'Arial, sans-serif', 
        fontSize: '8px',
        padding: '10px',
        maxWidth: '210mm', // A4 width
      }}
    >
      {/* CSS pentru print - header fix pe fiecare pagină (doar în modul print) */}
      {isPrintMode && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            thead { display: table-header-group; }
            tbody { display: table-row-group; }
            tr { page-break-inside: avoid; }
            @page { margin: 10mm; }
          }
        `}} />
      )}

      {/* Header cu detalii client și furnizor */}
      <div style={{ marginBottom: '12px' }}>
        {/* Titlu și număr fișă */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
          <span style={{ fontSize: '18px', fontWeight: 'bold' }}>FISA DE SERVICE</span>
          <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{serviceFileNumber || sheets[0]?.quote?.number || `NR. ${lead.leadId}` || '-'}</span>
        </div>
        
        {/* Număr comandă / Lead ID */}
        <div style={{ fontSize: '10px', fontStyle: 'italic', marginBottom: '8px' }}>
          la comanda Nr.: {lead.leadId || '-'}
        </div>
        
        {/* Detalii client și furnizor - 2 coloane */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
          {/* Coloana stângă - Client */}
          <div style={{ fontSize: '10px', lineHeight: '1.6' }}>
            <div><strong>CLIENT:</strong> {lead.name?.toUpperCase() || '-'}</div>
            <div><strong>MOB:</strong> {lead.phone || '-'}</div>
            <div><strong>EMAIL:</strong> {lead.email || '-'}</div>
          </div>
          
          {/* Coloana dreapta - Furnizor */}
          <div style={{ fontSize: '10px', lineHeight: '1.6', textAlign: 'left' }}>
            <div><strong>FURNIZOR:</strong> ASCUTZIT.RO SRL</div>
            <div><strong>CUI:</strong> 123456</div>
            <div><strong>REG:</strong> J12 / 1234 / 1235</div>
            <div><strong>ADRESA:</strong> București, str.Bujorul Alb 49</div>
          </div>
        </div>
      </div>

      {/* Tabel principal - grupat pe instrumente */}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.headerCell, width: colWidths.instrument }}>INSTRUMENT</th>
            <th style={{ ...styles.headerCell, width: colWidths.nr }}>CANT.</th>
            <th style={{ ...styles.headerCell, width: colWidths.serial }}>SERIAL NR.</th>
            <th style={{ ...styles.headerCell, width: colWidths.serviciu }}>SERVICIU</th>
            <th style={{ ...styles.headerCell, width: colWidths.piese }}>PIESE</th>
            <th style={{ ...styles.headerCell, width: colWidths.qty }}>QTY</th>
            <th style={{ ...styles.headerCell, width: colWidths.dept }}>DEPT</th>
            <th style={{ ...styles.headerCell, width: colWidths.pret }}>PREȚ</th>
            <th style={{ ...styles.headerCell, width: colWidths.subtotal }}>SUBTOTAL</th>
          </tr>
        </thead>
        <tbody>
          {instrumentGroups.map((group, groupIdx) => {
            // Combină serviciile și piesele într-o singură listă
            const allItems = [...group.services, ...group.parts]
            
            // Dacă nu există items, nu afișăm nimic
            if (allItems.length === 0) return null
            
            // Formatează seria pentru primul rând
            const serialDisplay = group.brandSerials.length > 0
              ? group.brandSerials.map(bs => bs.serialNumber || '-').join(', ')
              : '-'
            
            return (
              <React.Fragment key={`group-${group.instrumentId}-${groupIdx}`}>
                {allItems.map((item, itemIdx) => {
                  const isFirstRow = itemIdx === 0
                  const lineTotal = calculateItemTotal(item, urgentMarkupPct)
                  const isService = item.item_type === 'service'
                  const isPart = item.item_type === 'part'
                  
                  return (
                    <tr 
                      key={`item-${item.id}-${itemIdx}`}
                      style={isFirstRow ? styles.instrumentRow : styles.serviceRow}
                    >
                      {/* DENUMIRE - doar pe primul rând */}
                      <td style={{ 
                        ...styles.cellLeft, 
                        fontWeight: isFirstRow ? 'bold' : 'normal',
                        backgroundColor: isFirstRow ? '#e8e8e8' : undefined
                      }}>
                        {isFirstRow ? group.instrumentName : ''}
                      </td>
                      
                      {/* CANT. - doar pe primul rând */}
                      <td style={{ 
                        ...styles.cell,
                        backgroundColor: isFirstRow ? '#e8e8e8' : undefined
                      }}>
                        {isFirstRow ? '1' : ''}
                      </td>
                      
                      {/* SERIAL NR. - doar pe primul rând */}
                      <td style={{ 
                        ...styles.cell,
                        fontSize: '6px',
                        backgroundColor: isFirstRow ? '#e8e8e8' : undefined
                      }}>
                        {isFirstRow ? serialDisplay : ''}
                      </td>
                      
                      {/* SERVICIU */}
                      <td style={{ ...styles.cellLeft, whiteSpace: 'normal', wordWrap: 'break-word' as const }}>
                        {isService ? item.name_snapshot : (isPart ? 'Schimb piese' : '')}
                      </td>
                      
                      {/* PIESE */}
                      <td style={{ ...styles.cellLeft, whiteSpace: 'normal', wordWrap: 'break-word' as const }}>
                        {isPart ? item.name_snapshot : ''}
                      </td>
                      
                      {/* QTY */}
                      <td style={styles.cell}>{item.qty || 1}</td>
                      
                      {/* DEPT */}
                      <td style={styles.cell}>{item.department || '-'}</td>
                      
                      {/* PREȚ */}
                      <td style={styles.cell}>{(item.price || 0).toFixed(2)}</td>
                      
                      {/* SUBTOTAL */}
                      <td style={{ ...styles.cell, fontWeight: 'bold' }}>{lineTotal.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>

      {/* Secțiune subtotaluri pe departamente */}
      <div style={{ 
        marginTop: '12px', 
        padding: '8px 10px',
        backgroundColor: '#f5f5f5',
        border: '1px solid #ccc',
        borderRadius: '2px'
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '6px' }}>SUBTOTAL PE DEPARTAMENTE:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
          {Object.entries(departmentTotals).map(([dept, total]) => (
            <div key={dept} style={{ display: 'flex', gap: '8px', fontSize: '9px' }}>
              <span style={{ fontWeight: 'bold' }}>{dept.toUpperCase()}:</span>
              <span>{total.toFixed(2)} RON</span>
            </div>
          ))}
        </div>
      </div>

      {/* Secțiune totaluri - aliniată la dreapta */}
      <div style={{ 
        marginTop: '10px',
        display: 'flex',
        justifyContent: 'flex-end'
      }}>
        <div style={{ 
          width: '280px',
          border: '1px solid #000',
          padding: '8px 12px',
          fontSize: '9px'
        }}>
          {/* Subtotal */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Subtotal (toate instrumentele):</span>
            <span>{allSubtotal.toFixed(2)}</span>
          </div>

          {/* Discount per linii */}
          {allTotalDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#c00' }}>
              <span>Discount linii:</span>
              <span>-{allTotalDiscount.toFixed(2)}</span>
            </div>
          )}

          {/* Urgent markup */}
          {allUrgentAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#060' }}>
              <span>Taxe urgență ({urgentMarkupPct}%):</span>
              <span>+{allUrgentAmount.toFixed(2)}</span>
            </div>
          )}

          {/* Abonament servicii */}
          {hasSubscription && subscriptionDiscountServices && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#009' }}>
              <span>Abonament servicii (-{subscriptionDiscountServices}%):</span>
              <span>-{(subscriptionDiscountAmount * (subscriptionDiscountServices / ((subscriptionDiscountServices || 0) + (subscriptionDiscountParts || 0)))).toFixed(2)}</span>
            </div>
          )}

          {/* Abonament piese */}
          {hasSubscription && subscriptionDiscountParts && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#009' }}>
              <span>Abonament piese (-{subscriptionDiscountParts}%):</span>
              <span>-{(subscriptionDiscountAmount * (subscriptionDiscountParts / ((subscriptionDiscountServices || 0) + (subscriptionDiscountParts || 0)))).toFixed(2)}</span>
            </div>
          )}

          {/* Linie separator */}
          <div style={{ borderTop: '2px solid #000', marginTop: '6px', paddingTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold' }}>
              <span>TOTAL DE PLATĂ:</span>
              <span>{finalTotal.toFixed(2)} RON</span>
            </div>
          </div>

          {/* Metoda de plată */}
          {(firstSheet?.isCash || firstSheet?.isCard) && (
            <div style={{ marginTop: '6px', textAlign: 'center', fontSize: '8px', color: '#666' }}>
              Metodă plată: {firstSheet?.isCash ? 'Cash' : ''}{firstSheet?.isCash && firstSheet?.isCard ? ' / ' : ''}{firstSheet?.isCard ? 'Card' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Comentarii client și tehnician */}
      <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1, border: '1px solid #000', padding: '6px', minHeight: '50px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '8px', marginBottom: '5px', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>
            COMENTARII CLIENT:
          </div>
        </div>
        <div style={{ flex: 1, border: '1px solid #000', padding: '6px', minHeight: '50px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '8px', marginBottom: '5px', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>
            COMENTARII TEHNICIAN:
          </div>
        </div>
      </div>
    </div>
  )
}
