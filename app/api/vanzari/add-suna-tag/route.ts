/**
 * MODUL VÂNZARI - BACKGROUND PROCESS
 * ===================================
 * Verifică lead-urile cu callback expirat și adaugă tag-ul "Suna!"
 * 
 * Rulare recomandată: Cron job la fiecare oră
 * GET /api/vanzari/add-suna-tag
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/api-helpers';

const supabase = createAdminClient();

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('[add-suna-tag] Starting background process...');

    let addedCount = 0;
    let errors = [];

    // 1. Verifică lead-urile din stage "Call Back" cu callback expirat
    const { data: expiredCallbacks, error: callbackError } = await supabase.rpc('get_expired_callback_leads');
    
    if (callbackError) {
      console.error('[add-suna-tag] Error fetching expired callbacks:', callbackError);
      errors.push('Error fetching expired callbacks');
    }

    if (expiredCallbacks && expiredCallbacks.length > 0) {
      console.log(`[add-suna-tag] Found ${expiredCallbacks.length} expired callbacks`);
      
      // Găsește sau creează tag-ul "Suna!"
      const { data: sunaTag, error: tagError } = await supabase
        .from('tags')
        .select('id')
        .ilike('name', 'Suna!')
        .maybeSingle();

      if (tagError) {
        console.error('[add-suna-tag] Error fetching "Suna!" tag:', tagError);
        errors.push('Error fetching "Suna!" tag');
      } else if (!sunaTag) {
        // Creează tag-ul dacă nu există
        const { data: newTag, error: createError } = await supabase
          .from('tags')
          .insert([{ name: 'Suna!', color: 'red' }] as any)
          .select('id')
          .single();

        if (createError) {
          console.error('[add-suna-tag] Error creating "Suna!" tag:', createError);
          errors.push('Error creating "Suna!" tag');
        } else {
          for (const lead of expiredCallbacks) {
            try {
              await supabase
                .from('lead_tags')
                .insert([{ lead_id: lead.lead_id, tag_id: newTag.id }] as any);
              addedCount++;
              console.log(`[add-suna-tag] Added "Suna!" tag to lead ${lead.lead_id}`);
            } catch (err: any) {
              // Ignorăm erorile de duplicate key (23505)
              if (err?.code !== '23505') {
                console.error(`[add-suna-tag] Error adding tag to lead ${lead.lead_id}:`, err);
                errors.push(`Error adding tag to lead ${lead.lead_id}`);
              }
            }
          }
        }
      } else {
        // Atribuie tag-ul existent
        for (const lead of expiredCallbacks) {
          try {
            await supabase
              .from('lead_tags')
              .insert([{ lead_id: lead.lead_id, tag_id: sunaTag.id }] as any);
            addedCount++;
            console.log(`[add-suna-tag] Added "Suna!" tag to lead ${lead.lead_id}`);
          } catch (err: any) {
            // Ignorăm erorile de duplicate key (23505)
            if (err?.code !== '23505') {
              console.error(`[add-suna-tag] Error adding tag to lead ${lead.lead_id}:`, err);
              errors.push(`Error adding tag to lead ${lead.lead_id}`);
            }
          }
        }
      }
    }

    // 2. Verifică lead-urile din stage "Nu Răspunde" cu timp de reapel expirat
    const { data: expiredNuRaspunde, error: nuRaspundeError } = await supabase.rpc('get_expired_nu_raspunde_leads');
    
    if (nuRaspundeError) {
      console.error('[add-suna-tag] Error fetching expired nu răspunde:', nuRaspundeError);
      errors.push('Error fetching expired nu răspunde');
    }

    if (expiredNuRaspunde && expiredNuRaspunde.length > 0) {
      console.log(`[add-suna-tag] Found ${expiredNuRaspunde.length} expired nu răspunde`);
      
      // Găsește tag-ul "Suna!" (ar trebui să existe deja de mai sus)
      const { data: sunaTag2, error: tagError2 } = await supabase
        .from('tags')
        .select('id')
        .ilike('name', 'Suna!')
        .maybeSingle();

      if (sunaTag2) {
        for (const lead of expiredNuRaspunde) {
          try {
            await supabase
              .from('lead_tags')
              .insert([{ lead_id: lead.lead_id, tag_id: sunaTag2.id }] as any);
            addedCount++;
            console.log(`[add-suna-tag] Added "Suna!" tag to lead ${lead.lead_id}`);
          } catch (err: any) {
            // Ignorăm erorile de duplicate key (23505)
            if (err?.code !== '23505') {
              console.error(`[add-suna-tag] Error adding tag to lead ${lead.lead_id}:`, err);
              errors.push(`Error adding tag to lead ${lead.lead_id}`);
            }
          }
        }
      }
    }

    console.log(`[add-suna-tag] Process completed. Added "Suna!" to ${addedCount} leads.`);
    
    return NextResponse.json({
      success: true,
      addedCount,
      expiredCallbacksCount: expiredCallbacks?.length || 0,
      expiredNuRaspundeCount: expiredNuRaspunde?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[add-suna-tag] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}