/**
 * MODUL VÂNZARI - LEAD OPERATIONS
 * ===================================
 * Funcții pentru operațiuni pe lead-uri în modulul Vânzări
 */

import { supabaseBrowser } from '@/lib/supabase/supabaseClient';
import { recordVanzariApelForDelivery } from '@/lib/supabase/vanzariApeluri';
import { getOrCreateCurierTrimisTag, getOrCreateOfficeDirectTag, addLeadTagIfNotPresent } from '@/lib/supabase/tagOperations';
import { getNextGlobalServiceFileNumber } from '@/lib/supabase/serviceFileOperations';
import type { Result, Lead, ServiceFile, CallbackOptions, CurierTrimisResult, OfficeDirectResult } from './types';

const supabase = supabaseBrowser();
const VANZARI_PIPELINE_NAME = 'Vânzări';
const RECEPCIE_PIPELINE_NAME = 'Recepție';

// Normalize any thrown value to an Error with a readable message (avoid empty {})
function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === 'object' && 'message' in err) return new Error(String((err as any).message));
  if (typeof err === 'string') return new Error(err);
  try {
    return new Error(JSON.stringify(err));
  } catch {
    return new Error('Eroare necunoscută');
  }
}

// Helper function to get stage ID by name (încearcă și variante fără diacritice: Recepție/Receptie, Vânzări/Vanzari)
async function getStageId(pipelineName: string, stageName: string): Promise<string | null> {
  const alternatives = pipelineName === 'Recepție' ? ['Recepție', 'Receptie'] : pipelineName === 'Vânzări' ? ['Vânzări', 'Vanzari'] : [pipelineName];
  for (const name of alternatives) {
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('name', name)
      .is('is_active', true)
      .maybeSingle();

    if (!pipeline?.id) continue;

    const { data: stage } = await supabase
      .from('stages')
      .select('id')
      .eq('pipeline_id', pipeline.id)
      .eq('name', stageName)
      .is('is_active', true)
      .maybeSingle();

    if (stage?.id) return stage.id;
  }
  return null;
}

// Helper function to move item to stage
async function moveItemToStage(itemId: string, stageId: string, itemType: 'lead' | 'service_file'): Promise<boolean> {
  const { error } = await supabase
    .rpc('move_item_to_stage', {
      p_item_id: itemId,
      p_item_type: itemType,
      p_target_stage_id: stageId
    });

  if (error) {
    console.error('[moveItemToStage] Error:', error);
    return false;
  }

  return true;
}

// Helper function to log item event (nu aruncă – eșecul nu blochează fluxul principal)
async function logItemEvent(
  type: 'lead' | 'service_file' | 'tray',
  itemId: string,
  message: string,
  eventType: string,
  eventDetails?: any
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('items_events')
      .insert([{
        type,
        item_id: itemId,
        event_type: eventType,
        message,
        event_details: eventDetails ?? {},
        actor_id: user?.id ?? null,
        actor_name: user?.user_metadata?.full_name || 'Unknown'
      }]);

    if (error) {
      console.warn('[logItemEvent]', normalizeError(error).message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[logItemEvent]', normalizeError(err).message);
    return false;
  }
}

// Helper function to format date
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/**
 * 1. SET LEAD CALLBACK
 * Setează data de callback și mută lead-ul în stage-ul "Call Back"
 */
export async function setLeadCallback(
  leadId: string,
  callbackDate: Date,
  options?: CallbackOptions
): Promise<Result<Lead>> {
  try {
    const { data: lead, error } = await supabase
      .from('leads')
      .update({
        callback_date: callbackDate.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (error) throw error;
    if (!lead) throw new Error('Lead not found');

    // Mute în stage Call Back
    const callbackStageId = await getStageId(VANZARI_PIPELINE_NAME, 'Call Back');
    if (callbackStageId) {
      await moveItemToStage(leadId, callbackStageId, 'lead');
    }

    // Incrementează statistici
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const today = new Date().toISOString().split('T')[0];
      await incrementSellerStatistic(user.id, today, 'callback_count');
    }

    // Log event
    await logItemEvent(
      'lead',
      leadId,
      `Callback programat pentru ${formatDate(callbackDate)}`,
      'callback_scheduled',
      {
        ...options,
        callback_scheduled_at: callbackDate.toISOString()
      }
    );

    return { data: lead, error: null };
  } catch (error) {
    console.error('[setLeadCallback] Error:', error);
    return { data: null, error };
  }
}

/**
 * 2. SET LEAD NU RĂSPUNDE
 * Setează ora de reapel și mută lead-ul în stage-ul "Nu Răspunde"
 */
export async function setLeadNuRaspunde(
  leadId: string,
  time: string // Format: "15:00"
): Promise<Result<Lead>> {
  try {
    // Parse time
    const [hours, minutes] = time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error('Invalid time format');
    }

    const callbackAt = new Date();
    callbackAt.setHours(hours, minutes, 0, 0);

    // Dacă ora a trecut azi, pune mâine
    if (callbackAt < new Date()) {
      callbackAt.setDate(callbackAt.getDate() + 1);
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .update({
        nu_raspunde_callback_at: callbackAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (error) throw error;
    if (!lead) throw new Error('Lead not found');

    // Mute în stage Nu Răspunde
    const nuRaspundeStageId = await getStageId(VANZARI_PIPELINE_NAME, 'Nu Răspunde');
    if (nuRaspundeStageId) {
      await moveItemToStage(leadId, nuRaspundeStageId, 'lead');
    }

    // Log event
    await logItemEvent(
      'lead',
      leadId,
      `Reapel programat pentru ${time}`,
      'nu_raspunde_scheduled',
      {
        nu_raspunde_type: 'custom',
        nu_raspunde_scheduled_at: callbackAt.toISOString(),
        custom_time: time
      }
    );

    return { data: lead, error: null };
  } catch (error) {
    console.error('[setLeadNuRaspunde] Error:', error);
    return { data: null, error };
  }
}

/**
 * 3. SET LEAD NO DEAL
 * Marchează lead-ul ca No Deal și mută în stage-ul "No Deal".
 *
 * IMPORTANT:
 * - Șterge TOATE tag-urile asociate cu lead-ul (prin DELETE din lead_tags)
 * - Curăță TOATE triggerele (callback_date, nu_raspunde_callback_at)
 * - Curăță atributele de livrare și flag-urile boolean
 */
export async function setLeadNoDeal(leadId: string): Promise<Result<Lead>> {
  try {
    const updateData: any = {
      no_deal: true,
      no_deal_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Șterge TOATE triggerele
      callback_date: null,
      nu_raspunde_callback_at: null,
      // Dezactivează flag-urile
      call_back: false,
      nu_raspunde: false,
      // Curăță atributele de livrare
      curier_trimis_at: null,
      curier_trimis_user_id: null,
      office_direct_at: null,
      office_direct_user_id: null,
    };
    const { data: lead, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .select()
      .single();

    if (error) throw error;
    if (!lead) throw new Error('Lead not found');

    // Șterge TOATE tag-urile asociate cu lead-ul (nu doar Curier Trimis/Office direct)
    try {
      const { error: tagError } = await supabase
        .from('lead_tags')
        .delete()
        .eq('lead_id', leadId);
      
      if (tagError) {
        console.warn('[setLeadNoDeal] Curățare tag-uri a eșuat:', tagError);
      } else {
        console.log('[setLeadNoDeal] Au fost șterse toate tag-urile pentru lead:', leadId);
      }
    } catch (e) {
      console.warn('[setLeadNoDeal] Eroare la curățarea tag-urilor:', e);
    }

    // Curăță fișele de serviciu ale lead-ului (curier trimis, office direct, nu răspunde)
    await supabase
      .from('service_files')
      .update({
        curier_trimis: false,
        office_direct: false,
        curier_scheduled_at: null,
        office_direct_at: null,
        nu_raspunde_callback_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('lead_id', leadId);

    // Mute în stage No Deal
    const noDealStageId = await getStageId(VANZARI_PIPELINE_NAME, 'No Deal');
    if (noDealStageId) {
      await moveItemToStage(leadId, noDealStageId, 'lead');
    }

    // Incrementează statistici
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const today = new Date().toISOString().split('T')[0];
      await incrementSellerStatistic(user.id, today, 'no_deal_count');
    }

    // Log event
    await logItemEvent(
      'lead',
      leadId,
      'Lead marcat ca No Deal - Toate tag-urile și triggerele au fost șterse',
      'no_deal_set'
    );

    return { data: lead, error: null };
  } catch (error) {
    console.error('[setLeadNoDeal] Error:', error);
    return { data: null, error };
  }
}

/** Opțiuni la setare Curier trimis / Office direct */
export interface DeliveryOptions {
  urgent?: boolean;
  retur?: boolean;
}

/**
 * 4. SET LEAD CURIER TRIMIS
 * Marchează lead-ul ca curier trimis și creează automat fișă de serviciu (apare în Receptie – Curier Trimis).
 */
export async function setLeadCurierTrimis(
  leadId: string,
  scheduledDate: Date,
  options?: DeliveryOptions
): Promise<Result<CurierTrimisResult>> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Not authenticated');

    const scheduledIso = scheduledDate.toISOString();
    const urgent = options?.urgent ?? false;
    const retur = options?.retur ?? false;

    // 1. Update lead (inclusiv claimed_by = vânzătorul curent – atribuire automată)
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .update({
        curier_trimis_at: scheduledIso,
        curier_trimis_user_id: user.id,
        claimed_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (leadError) throw leadError;
    if (!lead) throw new Error('Lead not found');

    // 1b. Tag "Curier Trimis" pe lead
    try {
      const tag = await getOrCreateCurierTrimisTag();
      await addLeadTagIfNotPresent(leadId, tag.id);
    } catch (e) {
      console.warn('[setLeadCurierTrimis] Tag Curier Trimis nu s-a putut atribui:', e);
    }

    // 2. Create service file (cu dată, urgent, retur – apare în detalii lead și în Receptie)
    const now = new Date().toISOString();
    const dateOnly = scheduledDate.toISOString().slice(0, 10);
    const { data: nextNum, error: numErr } = await getNextGlobalServiceFileNumber();
    if (numErr || nextNum == null) throw new Error(nextNum == null ? 'Nu s-a putut obține numărul fișei' : (numErr as Error)?.message);
    const { data: serviceFile, error: sfError } = await supabase
      .from('service_files')
      .insert({
        lead_id: leadId,
        number: String(nextNum),
        date: dateOnly,
        status: 'comanda',
        curier_trimis: true,
        curier_scheduled_at: scheduledIso,
        office_direct: false,
        office_direct_at: null,
        urgent,
        retur,
        created_at: now,
        updated_at: now
      } as Record<string, unknown>)
      .select()
      .single();

    if (sfError) throw sfError;
    if (!serviceFile) throw new Error('Failed to create service file');

    // 3. Move service file to Recepție – Curier Trimis (card în Receptie)
    const curierTrimisStageId = await getStageId(RECEPCIE_PIPELINE_NAME, 'Curier Trimis');
    if (curierTrimisStageId) {
      await moveItemToStage(serviceFile.id, curierTrimisStageId, 'service_file');
    }

    // 4. Move lead to Vânzări – Curier Trimis
    const vanzariCurierTrimisStageId = await getStageId(VANZARI_PIPELINE_NAME, 'Curier Trimis');
    if (vanzariCurierTrimisStageId) {
      await recordVanzariApelForDelivery(leadId, vanzariCurierTrimisStageId, user.id);
      await moveItemToStage(leadId, vanzariCurierTrimisStageId, 'lead');
    }

    // 5. Statistici (opțional – nu blochează dacă RPC/tabelul lipsește)
    const today = new Date().toISOString().split('T')[0];
    incrementSellerStatistic(user.id, today, 'curier_trimis_count').catch(() => {});

    // 6. Log în items_events (opțional – nu blochează dacă tabelul lipsește)
    logItemEvent(
      'lead',
      leadId,
      `Curier trimis programat pentru ${formatDate(scheduledDate)}${urgent ? ' (urgent)' : ''}`,
      'curier_trimis_scheduled',
      {
        action_type: 'curier_trimis',
        scheduled_at: scheduledIso,
        urgent,
        service_file_created: true,
        service_file_id: serviceFile.id
      }
    ).catch(() => {});

    return { data: { lead, serviceFile }, error: null };
  } catch (error) {
    const err = normalizeError(error);
    console.error('[setLeadCurierTrimis] Error:', err.message);
    return { data: null, error: err };
  }
}

/**
 * 5. SET LEAD OFFICE DIRECT
 * Marchează lead-ul ca office direct și creează automat fișă de serviciu (apare în Receptie – Office Direct).
 */
export async function setLeadOfficeDirect(
  leadId: string,
  scheduledDate: Date,
  options?: DeliveryOptions
): Promise<Result<OfficeDirectResult>> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Not authenticated');

    const scheduledIso = scheduledDate.toISOString();
    const urgent = options?.urgent ?? false;
    const retur = options?.retur ?? false;

    // 1. Update lead (inclusiv claimed_by = vânzătorul curent – atribuire automată)
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .update({
        office_direct_at: scheduledIso,
        office_direct_user_id: user.id,
        claimed_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (leadError) throw leadError;
    if (!lead) throw new Error('Lead not found');

    // 1b. Tag "Office direct" pe lead
    try {
      const tag = await getOrCreateOfficeDirectTag();
      await addLeadTagIfNotPresent(leadId, tag.id);
    } catch (e) {
      console.warn('[setLeadOfficeDirect] Tag Office direct nu s-a putut atribui:', e);
    }

    // 2. Create service file (cu dată, urgent, retur – apare în detalii lead și în Receptie)
    const now = new Date().toISOString();
    const dateOnly = scheduledDate.toISOString().slice(0, 10);
    const { data: nextNum, error: numErr } = await getNextGlobalServiceFileNumber();
    if (numErr || nextNum == null) throw new Error(nextNum == null ? 'Nu s-a putut obține numărul fișei' : (numErr as Error)?.message);
    const { data: serviceFile, error: sfError } = await supabase
      .from('service_files')
      .insert({
        lead_id: leadId,
        number: String(nextNum),
        date: dateOnly,
        status: 'comanda',
        office_direct: true,
        office_direct_at: scheduledIso,
        curier_trimis: false,
        curier_scheduled_at: null,
        urgent,
        retur,
        created_at: now,
        updated_at: now
      } as Record<string, unknown>)
      .select()
      .single();

    if (sfError) throw sfError;
    if (!serviceFile) throw new Error('Failed to create service file');

    // 3. Move service file to Recepție – Office Direct (card în Receptie)
    const officeDirectStageId = await getStageId(RECEPCIE_PIPELINE_NAME, 'Office Direct');
    if (officeDirectStageId) {
      await moveItemToStage(serviceFile.id, officeDirectStageId, 'service_file');
    }

    // 4. Move lead to Vânzări – Office Direct
    const vanzariOfficeDirectStageId = await getStageId(VANZARI_PIPELINE_NAME, 'Office Direct');
    if (vanzariOfficeDirectStageId) {
      await recordVanzariApelForDelivery(leadId, vanzariOfficeDirectStageId, user.id);
      await moveItemToStage(leadId, vanzariOfficeDirectStageId, 'lead');
    }

    // 5. Statistici (opțional – nu blochează dacă RPC/tabelul lipsește)
    const today = new Date().toISOString().split('T')[0];
    incrementSellerStatistic(user.id, today, 'office_direct_count').catch(() => {});

    // 6. Log în items_events (opțional – nu blochează dacă tabelul lipsește)
    logItemEvent(
      'lead',
      leadId,
      `Office direct programat pentru ${formatDate(scheduledDate)}${urgent ? ' (urgent)' : ''}`,
      'office_direct_scheduled',
      {
        action_type: 'office_direct',
        scheduled_at: scheduledIso,
        urgent,
        service_file_created: true,
        service_file_id: serviceFile.id
      }
    ).catch(() => {});

    return { data: { lead, serviceFile }, error: null };
  } catch (error) {
    const err = normalizeError(error);
    console.error('[setLeadOfficeDirect] Error:', err.message);
    return { data: null, error: err };
  }
}

/**
 * 6. CHECK DELIVERY METHOD STATUS
 * Verifică dacă un lead are deja un mod de livrare selectat (Curier Trimis sau Office Direct).
 * 
 * @param leadId - ID-ul lead-ului de verificat
 * @returns Promise<{
 *   hasDeliveryMethod: boolean - true dacă există cel puțin un mod de livrare selectat
 *   curierTrimis: boolean - true dacă este marcat ca Curier Trimis
 *   officeDirect: boolean - true dacă este marcat ca Office Direct
 * }>
 */
export async function checkLeadDeliveryMethodStatus(
  leadId: string
): Promise<{
  hasDeliveryMethod: boolean
  curierTrimis: boolean
  officeDirect: boolean
}> {
  try {
    const { data: lead, error } = await supabase
      .from('leads')
      .select('curier_trimis_at, office_direct_at')
      .eq('id', leadId)
      .single();

    if (error) {
      console.error('[checkLeadDeliveryMethodStatus] Error:', error);
      return { hasDeliveryMethod: false, curierTrimis: false, officeDirect: false };
    }

    const curierTrimis = !!lead.curier_trimis_at;
    const officeDirect = !!lead.office_direct_at;

    return {
      hasDeliveryMethod: curierTrimis || officeDirect,
      curierTrimis,
      officeDirect
    };
  } catch (error) {
    console.error('[checkLeadDeliveryMethodStatus] Error:', normalizeError(error).message);
    return { hasDeliveryMethod: false, curierTrimis: false, officeDirect: false };
  }
}

/**
 * INCREMENT SELLER STATISTIC
 * Incrementează un contor specific din statistica vânzătorului.
 * Dacă RPC-ul sau tabelul nu există (migrare nerulată), returnează false fără a bloca fluxul.
 */
export async function incrementSellerStatistic(
  userId: string,
  date: string,
  field: string
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('increment_seller_statistic', {
      p_user_id: userId,
      p_date: date,
      p_field: field
    });

    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('[incrementSellerStatistic]', normalizeError(error).message);
    return false;
  }
}
