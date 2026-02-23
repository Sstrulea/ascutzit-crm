/**
 * MODUL VÂNZARI - FUNCȚII FACTURARE
 * ===================================
 * Funcții pentru proces complet de facturare și arhivare
 */

import { createClient } from '@supabase/supabase-js'
import { 
  calculateServiceFileTotal, 
  validateForFacturare,
  type FacturareData,
  type ServiceFileTotalCalculation
} from './priceCalculator'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface FacturareResult {
  success: boolean
  facturaId?: string
  facturaNumber?: string
  total?: number
  arhivaFisaId?: string
  error?: string
  validationErrors?: string[]
}

export interface AnulareFacturaResult {
  success: boolean
  error?: string
}

/**
 * Facturează un service file complet
 * 
 * Proces:
 * 1. Validare permisiuni și precondiții
 * 2. Calcul total final cu discount-uri
 * 3. Actualizare service_file (status, flags, is_locked)
 * 4. Generare număr factură
 * 5. Arhivare în arhiva_fise_serviciu
 * 6. Ștergere poziții tăvițe din pipeline
 * 7. Înregistrare în items_events
 * 
 * @param serviceFileId - ID-ul service file-ului
 * @param data - Date facturare (discount global, metodă plată, etc.)
 * @param userId - ID-ul utilizatorului care facturează
 * @returns Rezultat facturare
 */
export async function factureazaServiceFile(
  serviceFileId: string,
  data: FacturareData,
  userId: string
): Promise<FacturareResult> {
  try {
    // 1. Validare precondiții
    const validation = await validateForFacturare(serviceFileId)
    if (!validation.valid) {
      return {
        success: false,
        validationErrors: validation.errors
      }
    }

    // 2. Calcul total final
    const calculation = await calculateServiceFileTotal(serviceFileId)

    // 3. Obține număr factură
    const { data: facturaNumber } = await supabase
      .rpc('generate_factura_number')

    if (!facturaNumber) {
      throw new Error('Failed to generate factura number')
    }

    // 4. Actualizare service_file
    const now = new Date().toISOString()
    
    const updateData: any = {
      status: 'facturata',
      is_locked: true, // BLOCARE
      factura_number: facturaNumber,
      factura_date: now,
      global_discount_pct: data.discountGlobal || 0,
      updated_at: now
    }

    // Metodă de plată
    if (data.metodaPlata === 'cash') {
      updateData.cash = true
      updateData.card = false
    } else if (data.metodaPlata === 'card') {
      updateData.card = true
      updateData.cash = false
    }

    // Flag urgent (opțional)
    if (data.urgent !== undefined) {
      updateData.urgent = data.urgent
    }

    const { error: updateError } = await supabase
      .from('service_files')
      .update(updateData)
      .eq('id', serviceFileId)

    if (updateError) {
      throw new Error(`Failed to update service_file: ${updateError.message}`)
    }

    // 5. Arhivare în arhiva_fise_serviciu
    const { data: arhivaResult } = await supabase
      .rpc('archive_service_file', {
        p_service_file_id: serviceFileId,
        p_archived_by: userId,
        p_motiv: 'Facturare completă'
      })

    const arhivaFisaId = arhivaResult as string

    // 6. Ștergere poziții tăvițe din pipeline
    await supabase.rpc('clear_tray_positions_after_facturare', {
      p_service_file_id: serviceFileId
    })

    // 7. Înregistrare în items_events
    const { error: eventError } = await supabase
      .from('items_events')
      .insert({
        type: 'service_file',
        item_id: serviceFileId,
        event_type: 'factura_emisa',
        message: `Factura ${facturaNumber} emisă. Total: ${calculation.finalTotal.toFixed(2)} RON`,
        event_details: {
          factura_number: facturaNumber,
          factura_date: now,
          total: calculation.finalTotal,
          global_discount_pct: data.discountGlobal || 0,
          metoda_plata: data.metodaPlata,
          calculation: {
            total_trays: calculation.totalTrays,
            global_discount: calculation.globalDiscount,
            final_total: calculation.finalTotal
          }
        },
        actor_id: userId
      })

    if (eventError) {
      console.error('Failed to log event:', eventError)
    }

    return {
      success: true,
      facturaId: serviceFileId,
      facturaNumber,
      total: calculation.finalTotal,
      arhivaFisaId
    }

  } catch (error: any) {
    console.error('Facturare error:', error)
    return {
      success: false,
      error: error?.message || 'Unknown error'
    }
  }
}

/**
 * Anulează o factură
 * 
 * Proces:
 * 1. Validare permisiuni (admin/owner only)
 * 2. Deblocare service_file
 * 3. Resetare status
 * 4. Înregistrare în items_events
 * 
 * @param serviceFileId - ID-ul service file-ului
 * @param motiv - Motivul anulării (obligatoriu)
 * @param userId - ID-ul utilizatorului care anulează
 * @returns Rezultat anulare
 */
export async function anuleazaFactura(
  serviceFileId: string,
  motiv: string,
  userId: string
): Promise<AnulareFacturaResult> {
  try {
    // Validare motiv
    if (!motiv || motiv.trim().length === 0) {
      return {
        success: false,
        error: 'Motivul anulării este obligatoriu'
      }
    }

    const now = new Date().toISOString()

    // 1. Verifică dacă service file este facturată
    const { data: serviceFile } = await supabase
      .from('service_files')
      .select('status, is_locked, factura_number')
      .eq('id', serviceFileId)
      .single()

    if (!serviceFile) {
      return {
        success: false,
        error: 'Service file not found'
      }
    }

    if (serviceFile.status !== 'facturata') {
      return {
        success: false,
        error: 'Service file nu este facturat'
      }
    }

    // 2. Deblocare și resetare
    const { error: updateError } = await supabase
      .from('service_files')
      .update({
        is_locked: false, // Deblocare
        anulat: true,
        anulat_motiv: motiv,
        anulat_at: now,
        anulat_de: userId,
        status: 'in_lucru', // Resetare status
        cash: false,
        card: false,
        updated_at: now
      })
      .eq('id', serviceFileId)

    if (updateError) {
      throw new Error(`Failed to update service_file: ${updateError.message}`)
    }

    // 3. Înregistrare în items_events
    const { error: eventError } = await supabase
      .from('items_events')
      .insert({
        type: 'service_file',
        item_id: serviceFileId,
        event_type: 'factura anulata',
        message: `Factura ${serviceFile.factura_number} anulată. Motiv: ${motiv}`,
        event_details: {
          factura_number_anulata: serviceFile.factura_number,
          motiv,
          data_anulare: now,
          anulat_de: userId
        },
        actor_id: userId
      })

    if (eventError) {
      console.error('Failed to log event:', eventError)
    }

    return {
      success: true
    }

  } catch (error: any) {
    console.error('Anulare factura error:', error)
    return {
      success: false,
      error: error?.message || 'Unknown error'
    }
  }
}

/**
 * Obține detaliile complete ale unei facturi
 * 
 * @param serviceFileId - ID-ul service file-ului
 * @returns Calcul complet + detalii
 */
export async function getFacturaDetails(
  serviceFileId: string
): Promise<{
  serviceFile: any
  lead: any
  calculation: ServiceFileTotalCalculation
  facturaNumber: string
  facturaDate: string
}> {
  // Obține service_file și lead
  const { data: serviceFile, error: sfError } = await supabase
    .from('service_files')
    .select(`
      *,
      lead (
        id,
        name,
        email,
        phone,
        address,
        city,
        postal_code
      )
    `)
    .eq('id', serviceFileId)
    .single()

  if (sfError || !serviceFile) {
    throw new Error('Service file not found')
  }

  // Calculează total
  const calculation = await calculateServiceFileTotal(serviceFileId)

  return {
    serviceFile,
    lead: serviceFile.lead,
    calculation,
    facturaNumber: serviceFile.factura_number || 'N/A',
    facturaDate: serviceFile.factura_date || ''
  }
}

/**
 * Generează HTML pentru factură (pentru export PDF)
 * 
 * @param details - Detaliile facturii
 * @returns HTML string
 */
export function generateFacturaHTML(details: {
  serviceFile: any
  lead: any
  calculation: ServiceFileTotalCalculation
  facturaNumber: string
  facturaDate: string
}): string {
  const { serviceFile, lead, calculation, facturaNumber, facturaDate } = details

  // Header
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #333; margin: 0;">FACTURĂ</h1>
        <p style="color: #666; margin: 5px 0;">Nr. ${facturaNumber}</p>
        <p style="color: #666; margin: 5px 0;">Data: ${new Date(facturaDate).toLocaleDateString('ro-RO')}</p>
      </div>
  `

  // Client
  html += `
      <div style="margin-bottom: 30px; padding: 15px; background: #f5f5f5; border-radius: 5px;">
        <h3 style="margin: 0 0 10px 0; color: #333;">CLIENT</h3>
        <p style="margin: 5px 0;"><strong>Nume:</strong> ${lead.name || '-'}</p>
        <p style="margin: 5px 0;"><strong>Email:</strong> ${lead.email || '-'}</p>
        <p style="margin: 5px 0;"><strong>Telefon:</strong> ${lead.phone || '-'}</p>
        <p style="margin: 5px 0;"><strong>Adresă:</strong> ${lead.address || ''} ${lead.city || ''}</p>
      </div>
  `

  // Servicii/Piese
  html += `
      <div style="margin-bottom: 30px;">
        <h3 style="margin: 0 0 15px 0; color: #333;">DEȚALII FACTURĂ</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
          <thead>
            <tr style="background: #007bff; color: white;">
              <th style="padding: 10px; text-align: left; border: 1px solid #007bff;">Denumire</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #007bff;">Cantitate</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #007bff;">Preț unitar</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #007bff;">Discount</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #007bff;">Total</th>
            </tr>
          </thead>
          <tbody>
  `

  for (const tray of calculation.trays) {
    for (const item of tray.items) {
      const itemName = item.trayItem?.service?.name || 
                     item.trayItem?.part?.name || 
                     item.trayItem?.instrument?.name || '-'
      
      html += `
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd;">${itemName}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">${item.trayItem?.qty || 1}</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.unitPrice.toFixed(2)} RON</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.discountPct}%</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.itemTotal.toFixed(2)} RON</td>
            </tr>
      `
    }
  }

  // Total
  html += `
          </tbody>
        </table>
        
        <div style="text-align: right; margin-top: 20px;">
          <p style="margin: 5px 0;"><strong>Subtotal:</strong> ${calculation.totalTrays.toFixed(2)} RON</p>
          <p style="margin: 5px 0; color: #dc3545;"><strong>Discount global (${calculation.globalDiscountPct}%):</strong> -${calculation.globalDiscount.toFixed(2)} RON</p>
          <h2 style="margin: 15px 0 5px 0; color: #28a745;">TOTAL: ${calculation.finalTotal.toFixed(2)} RON</h2>
        </div>
      </div>
  `

  // Footer
  html += `
      <div style="margin-top: 50px; padding-top: 20px; border-top: 2px solid #ddd; text-align: center; color: #666; font-size: 12px;">
        <p>Vă mulțumim pentru colaborare!</p>
      </div>
    </div>
  `

  return html
}