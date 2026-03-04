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

export type PredarePrimireEditPatch = Partial<{
  serviceFileNumber: string
  trayNumbers: string
  clientName: string
  clientCif: string
  clientRegCom: string
  clientAddress: string
  clientJudet: string
  clientTara: string
  clientPhone: string
  /** Data la „Am primit in service” (ex: 25.02.2025) */
  dataPrimire: string
  rows: PredarePrimireRow[]
}>

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
  /** Data la „Am primit in service” (ex: 25.02.2025) */
  dataPrimire?: string
  /** Rânduri tabel: instrument, S/N, nr., comentarii client */
  rows: PredarePrimireRow[]
  /** Dacă e true, se aplică stiluri pentru print (ascundere butoane etc.) */
  isPrintMode?: boolean
  /** În previzualizare: câmpuri editabile înainte de print */
  editable?: boolean
  /** Callback la editare (doar când editable) */
  onEditChange?: (patch: PredarePrimireEditPatch) => void
}

const tableStyles = {
  table: {
    width: '100%' as const,
    tableLayout: 'auto' as const,
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
    whiteSpace: 'normal' as const,
    wordBreak: 'break-word' as const,
  },
  td: {
    border: '1px solid #000',
    padding: '5px 8px',
    verticalAlign: 'top' as const,
    whiteSpace: 'normal' as const,
    wordBreak: 'break-word' as const,
  },
  /** Lățimi minime în unități de caractere – tabelul se mărește în funcție de conținut */
  colInstrument: { minWidth: '12ch', width: 'auto' as const },
  colSn: { minWidth: '18ch', width: 'auto' as const },
  colNr: { minWidth: '4ch', width: '1%' as const },
  colComentarii: { minWidth: '20ch', width: 'auto' as const },
}

const inputStyle = {
  width: '100%',
  minWidth: 0,
  border: '1px solid #ccc',
  borderRadius: '2px',
  padding: '2px 4px',
  fontSize: '11px',
  background: '#fff',
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
  dataPrimire = '',
  rows,
  isPrintMode = true,
  editable = false,
  onEditChange,
}: PrintPredarePrimireViewProps) {
  const patch = onEditChange ? (p: PredarePrimireEditPatch) => onEditChange(p) : () => {}

  return (
    <div id="print-predare-primire-section" className="bg-white text-black p-6 max-w-[210mm] mx-auto">
      {isPrintMode && (
        <style dangerouslySetInnerHTML={{ __html: `
          #print-predare-primire-section table { table-layout: auto; }
          #print-predare-primire-section td, #print-predare-primire-section th { word-wrap: break-word; overflow-wrap: break-word; }
          @media print {
            #print-predare-primire-section { padding: 0; }
            #print-predare-primire-section input, #print-predare-primire-section textarea { border: none !important; background: transparent !important; }
            #print-predare-primire-section table { table-layout: auto; width: 100%; }
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
          <strong>FISA DE SERVICE nr.</strong>{' '}
          {editable ? (
            <input
              type="text"
              value={String(serviceFileNumber ?? '')}
              onChange={(e) => patch({ serviceFileNumber: e.target.value })}
              style={{ ...inputStyle, width: '80px', display: 'inline-block' }}
            />
          ) : (
            String(serviceFileNumber ?? '—')
          )}
        </div>
        <div>
          <strong>TAVITE nr.:</strong>{' '}
          {editable ? (
            <input
              type="text"
              value={trayNumbers ?? ''}
              onChange={(e) => patch({ trayNumbers: e.target.value })}
              style={{ ...inputStyle, width: '120px', display: 'inline-block' }}
            />
          ) : (
            (trayNumbers || '—')
          )}
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
          {editable ? (
            <>
              <div style={{ marginBottom: '4px' }}>
                <input type="text" value={clientName || ''} onChange={(e) => patch({ clientName: e.target.value })} placeholder="Nume" style={inputStyle} />
              </div>
              <div>CIF: <input type="text" value={clientCif ?? ''} onChange={(e) => patch({ clientCif: e.target.value })} style={{ ...inputStyle, width: '120px' }} /></div>
              <div>Reg. com.: <input type="text" value={clientRegCom ?? ''} onChange={(e) => patch({ clientRegCom: e.target.value })} style={{ ...inputStyle, width: '140px' }} /></div>
              <div>Adresa: <input type="text" value={clientAddress || ''} onChange={(e) => patch({ clientAddress: e.target.value })} style={inputStyle} /></div>
              <div>Judet: <input type="text" value={clientJudet || ''} onChange={(e) => patch({ clientJudet: e.target.value })} style={{ ...inputStyle, width: '100px' }} /></div>
              <div>Tara: <input type="text" value={clientTara || ''} onChange={(e) => patch({ clientTara: e.target.value })} style={{ ...inputStyle, width: '100px' }} /></div>
              <div>nr.telefon: <input type="text" value={clientPhone || ''} onChange={(e) => patch({ clientPhone: e.target.value })} style={{ ...inputStyle, width: '120px' }} /></div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 'bold' }}>{clientName || '—'}</div>
              <div>CIF: {clientCif ?? '—'}</div>
              <div>Reg. com.: {clientRegCom ?? '—'}</div>
              <div>Adresa: {clientAddress || '—'}</div>
              <div>Judet: {clientJudet || '—'}</div>
              <div>Tara: {clientTara || '—'}</div>
              <div>nr.telefon: {clientPhone || '—'}</div>
            </>
          )}
        </div>
      </div>

      {/* Subtitluri Am primit / Am predat */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px' }}>
        <span>Am primit in service:</span>
        <span>Am predat in service:</span>
      </div>

      {/* Tabel INSTRUMENT / S/N / NR. / COMENTARII CLIENT – adaptiv după conținut */}
      <table style={tableStyles.table}>
        <colgroup>
          <col style={tableStyles.colInstrument} />
          <col style={tableStyles.colSn} />
          <col style={tableStyles.colNr} />
          <col style={tableStyles.colComentarii} />
        </colgroup>
        <thead>
          <tr>
            <th style={tableStyles.th}>INSTRUMENT / UTILAJ</th>
            <th style={tableStyles.th}>S/N:</th>
            <th style={{ ...tableStyles.th, textAlign: 'center' }}>NR.</th>
            <th style={tableStyles.th}>COMENTARII CLIENT</th>
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
                <td style={tableStyles.td}>
                  {editable ? (
                    <input
                      type="text"
                      value={row.instrument || ''}
                      onChange={(e) => {
                        const next = [...rows]
                        next[i] = { ...next[i]!, instrument: e.target.value }
                        patch({ rows: next })
                      }}
                      style={inputStyle}
                    />
                  ) : (
                    (row.instrument || '—')
                  )}
                </td>
                <td style={tableStyles.td}>
                  {editable ? (
                    <input
                      type="text"
                      value={row.serialNumber || ''}
                      onChange={(e) => {
                        const next = [...rows]
                        next[i] = { ...next[i]!, serialNumber: e.target.value }
                        patch({ rows: next })
                      }}
                      style={inputStyle}
                    />
                  ) : (
                    (row.serialNumber || '—')
                  )}
                </td>
                <td style={{ ...tableStyles.td, textAlign: 'center' }}>
                  {editable ? (
                    <input
                      type="number"
                      min={1}
                      value={row.nr}
                      onChange={(e) => {
                        const next = [...rows]
                        next[i] = { ...next[i]!, nr: Math.max(1, parseInt(e.target.value, 10) || 1) }
                        patch({ rows: next })
                      }}
                      style={{ ...inputStyle, width: '40px', textAlign: 'center' }}
                    />
                  ) : (
                    row.nr
                  )}
                </td>
                <td style={tableStyles.td}>
                  {editable ? (
                    <textarea
                      value={row.comentariiClient || ''}
                      onChange={(e) => {
                        const next = [...rows]
                        next[i] = { ...next[i]!, comentariiClient: e.target.value }
                        patch({ rows: next })
                      }}
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: '36px' }}
                    />
                  ) : (
                    (row.comentariiClient || '—')
                  )}
                </td>
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
          {editable ? (
            <input
              type="text"
              value={dataPrimire}
              onChange={(e) => patch({ dataPrimire: e.target.value })}
              placeholder="ex: 25.02.2025"
              style={{ ...inputStyle, marginTop: '2px', minHeight: '18px', borderBottom: '1px solid #000', borderRadius: 0 }}
            />
          ) : (
            <div style={{ borderBottom: '1px solid #000', minHeight: '18px', marginTop: '2px' }}>{dataPrimire || ''}</div>
          )}
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
