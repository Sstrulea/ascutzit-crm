'use client'

import { supabaseBrowser } from './supabaseClient'

const supabase = supabaseBrowser()

// Noua structură: tray_item_brands -> tray_item_brand_serials

export type TrayItemBrand = {
  id: string
  tray_item_id: string
  brand: string
  garantie: boolean
  created_at: string
  updated_at: string
  tray_item_brand_serials?: TrayItemBrandSerial[]
}

export type TrayItemBrandSerial = {
  id: string
  brand_id: string
  serial_number: string
  created_at: string
}

/**
 * Obține toate brand-urile cu serial numbers pentru un tray_item
 */
export async function getTrayItemBrands(trayItemId: string): Promise<{ data: TrayItemBrand[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('tray_item_brands')
      .select(`
        id,
        tray_item_id,
        brand,
        garantie,
        created_at,
        updated_at,
        tray_item_brand_serials(id, serial_number, created_at)
      `)
      .eq('tray_item_id', trayItemId)
      .order('created_at')

    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

/**
 * Creează un brand pentru un tray_item
 */
export async function createTrayItemBrand(data: {
  tray_item_id: string
  brand: string
  garantie?: boolean
}): Promise<{ data: TrayItemBrand | null; error: any }> {
  try {
    const { data: result, error } = await supabase
      .from('tray_item_brands')
      .insert([{
        tray_item_id: data.tray_item_id,
        brand: data.brand.trim(),
        garantie: data.garantie || false,
      }])
      .select()
      .single()

    if (error) throw error
    return { data: result as TrayItemBrand, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Creează serial numbers pentru un brand
 */
export async function createBrandSerials(
  brandId: string,
  serialNumbers: string[]
): Promise<{ data: TrayItemBrandSerial[]; error: any }> {
  try {
    const serialsToInsert = serialNumbers
      .filter(sn => sn.trim())
      .map(sn => ({
        brand_id: brandId,
        serial_number: sn.trim(),
      }))

    if (serialsToInsert.length === 0) {
      return { data: [], error: null }
    }

    const { data: result, error } = await supabase
      .from('tray_item_brand_serials')
      .insert(serialsToInsert)
      .select()

    if (error) throw error
    return { data: result as TrayItemBrandSerial[], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

/**
 * Creează brand-uri cu serial numbers pentru un tray_item
 */
export async function createTrayItemBrandsWithSerials(
  trayItemId: string,
  brandSerialGroups: Array<{ brand: string; serialNumbers: string[]; garantie?: boolean }>
): Promise<{ error: any }> {
  try {
    for (const group of brandSerialGroups) {
      const brandName = group.brand?.trim()
      if (!brandName) continue

      // 1. Creează brand-ul
      const { data: brandResult, error: brandError } = await createTrayItemBrand({
        tray_item_id: trayItemId,
        brand: brandName,
        garantie: group.garantie || false,
      })

      if (brandError || !brandResult) {
        console.error('Error creating brand:', brandError)
        continue
      }

      // 2. Creează serial numbers pentru acest brand
      const serialNumbers = group.serialNumbers.filter(sn => sn.trim())
      if (serialNumbers.length > 0) {
        const { error: serialsError } = await createBrandSerials(brandResult.id, serialNumbers)
        if (serialsError) {
          console.error('Error creating serials:', serialsError)
        }
      }
    }

    return { error: null }
  } catch (error) {
    return { error }
  }
}

/**
 * Șterge toate brand-urile (și serial numbers via CASCADE) pentru un tray_item
 */
export async function deleteAllTrayItemBrands(trayItemId: string): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('tray_item_brands')
      .delete()
      .eq('tray_item_id', trayItemId)

    if (error) throw error
    return { error: null }
  } catch (error) {
    return { error }
  }
}



