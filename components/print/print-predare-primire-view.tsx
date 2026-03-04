'use client'

import React from 'react'
import { PRINT_COMPANY } from '@/lib/printCompanyConfig'

/** Un rând în tabelul Instrument / S/N / NR. / Comentarii client */
export interface PredarePrimireRow {
  instrument: string
  brand?: string
  serialNumber: string
  nr: number
  comentariiClient: string
}

export interface PrintPredarePrimireViewProps {
  /** Număr fișă de service */
  serviceFileNumber: string | number
  /** Numere tăvițe (ex: "34L, 40M") */
  trayNumbers: string
  /** Nume client */
  clientName: string
  /** CIF client (opțional) */
  clientCif?: string | null
  /** Reg. com. client (opțional) */
  clientRegCom?: string | null
  /** Adresă client */
  clientAddress: string
  /** Județ client */
  clientJudet: string
  /** Țara client */
  clientTara: string
  /** Telefon client */
  clientPhone: string
  /** Rânduri tabel: instrument, S/N, nr., comentarii client */
  rows: PredarePrimireRow[]
  /** Dacă e true, se aplică stiluri pentru print (ascundere butoane etc.) */
  isPrintMode?: boolean
}

const tableStyles = {
  table: {
    width: '100%' as const,
    borderCollapse: 'collapse' as const,
    border: '1px solid #000',
    fontSize: '11px',
  },
  th: {
    border: '1px solid #000',
    backgroundColor: '#e0e0e0',
    fontWeight: 'bold' as const,
    padding: '6px 8px',
    textAlign: 'left' as const,
    verticalAlign: 'middle' as const,
  },
  td: {
    border: '1px solid #000',
    padding: '5px 8px',
    verticalAlign: 'middle' as const,
  },
}

export function PrintPredarePrimireView({
  serviceFileNumber,
  trayNumbers,
  clientName,
  clientCif,
  clientRegCom,
  clientAddress,
  clientJudet,
  clientTara,
  clientPhone,
  rows,
  isPrintMode = true,
}: PrintPredarePrimireViewProps) {
  return (
    <div id="print-predare-primire-section" className="bg-white text-black p-6 max-w-[210mm] mx-auto">
      {isPrintMode && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            #print-predare-primire-section { padding: 0; }
            thead { display: table-header-group; }
            tbody { display: table-row-group; }
            tr { page-break-inside: avoid; }
            @page { margin: 12mm; }
          }
        `}} />
      )}

      {/* Titlu */}
      <h1 style={{ textAlign: 'center', fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
        FISA DE PREDARE / PRIMIRE IN SERVICE
      </h1>

      {/* Fisa de service nr. | Tavite nr. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '12px' }}>
        <div>
          <strong>FISA DE SERVICE nr.</strong> {String(serviceFileNumber)}
        </div>
        <div>
          <strong>TAVITE nr.:</strong> {trayNumbers || '—'}
        </div>
      </div>

      {/* Furnizor | Client - 2 coloane */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', fontSize: '11px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>FURNIZOR DE SERVICII:</div>
          <div style={{ fontWeight: 'bold' }}>{PRINT_COMPANY.name}</div>
          <div>CIF: {PRINT_COMPANY.cif}</div>
          <div>Reg. com.: {PRINT_COMPANY.regCom}</div>
          <div>Adresa: {PRINT_COMPANY.address}</div>
          <div>Judet: {PRINT_COMPANY.judet}</div>
          <div>IBAN: {PRINT_COMPANY.iban}</div>
          <div>Banca: {PRINT_COMPANY.banca}</div>
          <div>nr.telefon: {PRINT_COMPANY.telefon}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>CLIENT</div>
          <div style={{ fontWeight: 'bold' }}>{clientName || '—'}</div>
          <div>CIF: {clientCif ?? '—'}</div>
          <div>Reg. com.: {clientRegCom ?? '—'}</div>
          <div>Adresa: {clientAddress || '—'}</div>
          <div>Judet: {clientJudet || '—'}</div>
          <div>Tara: {clientTara || '—'}</div>
          <div>nr.telefon: {clientPhone || '—'}</div>
        </div>
      </div>

      {/* Subtitluri Am primit / Am predat */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px' }}>
        <span>Am primit in service:</span>
        <span>Am predat in service:</span>
      </div>

      {/* Tabel INSTRUMENT / S/N / NR. / COMENTARII CLIENT */}
      <table style={tableStyles.table}>
        <thead>
          <tr>
            <th style={{ ...tableStyles.th, width: '32%' }}>INSTRUMENT / UTILAJ</th>
            <th style={{ ...tableStyles.th, width: '22%' }}>S/N:</th>
            <th style={{ ...tableStyles.th, width: '10%', textAlign: 'center' }}>NR.</th>
            <th style={{ ...tableStyles.th, width: '36%' }}>COMENTARII CLIENT</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={tableStyles.td}>—</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                <td style={tableStyles.td}>{row.instrument || '—'}</td>
                <td style={tableStyles.td}>{row.serialNumber || '—'}</td>
                <td style={{ ...tableStyles.td, textAlign: 'center' }}>{row.nr}</td>
                <td style={tableStyles.td}>{row.comentariiClient || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Footer: Am primit | Am predat - semnături */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', fontSize: '11px' }}>
        <div style={{ flex: 1, paddingRight: '16px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Am primit:</div>
          <div>Furnizor de servicii: <strong>{PRINT_COMPANY.name}</strong></div>
          <div style={{ marginTop: '8px' }}>Data de:</div>
          <div style={{ borderBottom: '1px solid #000', minHeight: '18px', marginTop: '2px' }} />
          <div style={{ marginTop: '10px' }}>Semnatura:</div>
          <div style={{ borderBottom: '1px solid #000', minHeight: '24px', marginTop: '2px' }} />
        </div>
        <div style={{ flex: 1, paddingLeft: '16px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Am predat:</div>
          <div>Client: <strong>{clientName || '—'}</strong></div>
          <div style={{ marginTop: '8px' }}>Data de:</div>
          <div style={{ borderBottom: '1px solid #000', minHeight: '18px', marginTop: '2px' }} />
          <div style={{ marginTop: '10px' }}>Semnatura:</div>
          <div style={{ borderBottom: '1px solid #000', minHeight: '24px', marginTop: '2px' }} />
        </div>
      </div>
    </div>
  )
}
