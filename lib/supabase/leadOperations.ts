'use client'

import { supabaseBrowser } from './supabaseClient'
import type { Pipeline, Stage, Lead, PipelineWithStages } from '../types/database'
import { moveLeadToPipeline as moveLeadToPipelineFn, type MoveItemResult } from './pipelineOperations'

const supabase = supabaseBrowser()

export type PipelineOption = { id: string; name: string; is_active: boolean; active_stages: number }

export type { MoveItemResult }
export type MoveResult = MoveItemResult

/**
 * Funcție helper pentru atribuirea automată a tag-urilor de departament unui lead.
 * Această funcție analizează numele pipeline-ului și atribuie automat tag-ul corespunzător
 * departamentului (Horeca, Saloane, Frizerii, Reparatii). Dacă tag-ul nu există, îl creează.
 * Un lead poate avea doar un singur tag de departament, deci funcția elimină automat
 * celelalte tag-uri de departament înainte de a atribui noul tag.
 * 
 * @param leadId - ID-ul lead-ului căruia i se atribuie tag-ul
 * @param pipelineName - Numele pipeline-ului din care se deduce departamentul
 */
async function assignDepartmentTagToLead(leadId: string, pipelineName: string) {
  const departmentTags = [
    { name: 'Horeca', color: 'orange' as const },
    { name: 'Saloane', color: 'green' as const },
    { name: 'Frizerii', color: 'yellow' as const },
    { name: 'Reparatii', color: 'blue' as const },
  ]

  // Determină tag-ul de departament bazat pe numele pipeline-ului
  const pipelineNameUpper = pipelineName.toUpperCase()
  let departmentTagName: string | null = null
  if (pipelineNameUpper.includes('HORECA')) {
    departmentTagName = 'Horeca'
  } else if (pipelineNameUpper.includes('SALOANE') || pipelineNameUpper.includes('SALON')) {
    departmentTagName = 'Saloane'
  } else if (pipelineNameUpper.includes('FRIZER') || pipelineNameUpper.includes('BARBER')) {
    departmentTagName = 'Frizerii'
  } else if (pipelineNameUpper.includes('REPARAT') || pipelineNameUpper.includes('SERVICE')) {
    departmentTagName = 'Reparatii'
  }

  if (!departmentTagName) return

  // gaseste sau creeaza tag-ul
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id')
    .eq('name', departmentTagName)
    .single()

  let tagId: string
  if (existingTag) {
    tagId = existingTag.id
  } else {
    const tagData = departmentTags.find(t => t.name === departmentTagName)
    if (!tagData) return
    
    const { data: newTag, error: tagError } = await supabase
      .from('tags')
      .insert([{ name: tagData.name, color: tagData.color }] as any)
      .select('id')
      .single()
    
    if (tagError || !newTag) return
    tagId = newTag.id
  }

  // verifica daca tag-ul este deja atribuit
  const { data: existingAssignment } = await supabase
    .from('lead_tags')
    .select('lead_id')
    .eq('lead_id', leadId)
    .eq('tag_id', tagId)
    .maybeSingle()

  // atribuie tag-ul daca nu este deja atribuit
  if (!existingAssignment) {
    await supabase
      .from('lead_tags')
      .insert([{ lead_id: leadId, tag_id: tagId }] as any)
  }

  // elimina celelalte tag-uri de departament (un lead poate avea doar un tag de departament)
  const otherDepartmentTags = departmentTags.filter(t => t.name !== departmentTagName)
  const otherTagNames = otherDepartmentTags.map(t => t.name)
  
  const { data: otherTags } = await supabase
    .from('tags')
    .select('id')
    .in('name', otherTagNames)

  if (otherTags && otherTags.length > 0) {
    const otherTagIds = otherTags.map(t => t.id)
    await supabase
      .from('lead_tags')
      .delete()
      .eq('lead_id', leadId)
      .in('tag_id', otherTagIds)
  }
}


/**
 * Obține lista de opțiuni de pipeline-uri disponibile.
 * Folosește o funcție RPC (Remote Procedure Call) din Supabase pentru a obține
 * pipeline-urile active cu numărul de stage-uri active pentru fiecare.
 * Această funcție este folosită în dropdown-uri și selecții de pipeline-uri.
 * 
 * @returns Array cu opțiunile de pipeline-uri, fiecare conținând:
 *   - id: ID-ul pipeline-ului
 *   - name: Numele pipeline-ului
 *   - is_active: Dacă pipeline-ul este activ
 *   - active_stages: Numărul de stage-uri active din pipeline
 * @throws Eroare dacă apelul RPC eșuează
 */
const PIPELINE_OPTIONS_CACHE_MS = 5 * 60 * 1000 // 5 min
const PIPELINES_STAGES_STORAGE_KEY = 'crm:pipelinesWithStages:v1'
let pipelineOptionsCache: { data: PipelineOption[]; ts: number } | null = null
let pipelineOptionsPromise: Promise<PipelineOption[]> | null = null

export function invalidatePipelineOptionsCache() {
  pipelineOptionsCache = null
  pipelineOptionsPromise = null
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(PIPELINES_STAGES_STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}

export async function getPipelineOptions(forceRefresh = false): Promise<PipelineOption[]> {
  const now = Date.now()
  if (!forceRefresh && pipelineOptionsCache && now - pipelineOptionsCache.ts < PIPELINE_OPTIONS_CACHE_MS) {
    return pipelineOptionsCache.data
  }
  if (pipelineOptionsPromise && !forceRefresh) return pipelineOptionsPromise
  pipelineOptionsPromise = (async () => {
    const { data, error } = await supabase.rpc('get_pipeline_options')
    if (error) throw error
    const result = (data ?? []) as PipelineOption[]
    pipelineOptionsCache = { data: result, ts: Date.now() }
    return result
  })()
  const out = await pipelineOptionsPromise
  pipelineOptionsPromise = null
  return out
}

const PIPELINES_STAGES_TTL_MS = 5 * 60 * 1000 // 5 min

/**
 * Obține toate pipeline-urile active cu stage-urile lor asociate.
 * Cache în sessionStorage (TTL 5 min) – persistă la refresh.
 * invalidatePipelineOptionsCache() șterge și acest cache.
 */
export async function getPipelinesWithStages() {
  try {
    if (typeof window !== 'undefined') {
      const raw = sessionStorage.getItem(PIPELINES_STAGES_STORAGE_KEY)
      if (raw) {
        const { ts, data } = JSON.parse(raw) as { ts: number; data: any[] }
        if (Date.now() - ts < PIPELINES_STAGES_TTL_MS && Array.isArray(data)) {
          return { data, error: null }
        }
      }
    }

    const { data: pipelines, error: pipelineError } = await supabase
      .from('pipelines')
      .select('*')
      .eq('is_active', true)
      .order('position')

    if (pipelineError) throw pipelineError

    const { data: stages, error: stageError } = await supabase
      .from('stages')
      .select('*')
      .eq('is_active', true)
      .order('position')

    if (stageError) throw stageError

    const pipelinesWithStages = pipelines.map(pipeline => ({
      ...pipeline,
      stages: stages.filter(stage => stage.pipeline_id === pipeline.id)
    }))

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(PIPELINES_STAGES_STORAGE_KEY, JSON.stringify({ ts: Date.now(), data: pipelinesWithStages }))
      } catch {
        // quota
      }
    }

    return { data: pipelinesWithStages, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Creează un nou lead în baza de date.
 * Un lead reprezintă un potențial client care a completat un formular sau a fost
 * adăugat manual în sistem. Lead-ul conține informații de contact (nume, email, telefon)
 * și detalii despre sursa lead-ului (campanie, anunț, formular, etc.).
 * 
 * @param leadData - Datele lead-ului de creat (orice câmpuri din tabelul leads)
 * @returns Obiect cu:
 *   - data: Lead-ul creat sau null dacă apare o eroare
 *   - error: null dacă reușește, sau eroarea dacă apare o problemă
 */
export async function createLead(leadData: any) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .insert([leadData])
      .select()
      .single()

    if (error) throw error

    // Înregistrare în istoric: lead creat (pentru afișare data creării și în Istoric)
    if (data?.id) {
      await logItemEvent(
        'lead',
        data.id,
        `Lead creat${data.full_name ? `: ${data.full_name}` : ''}`,
        'lead_created',
        { lead_id: data.id, full_name: data.full_name ?? null, created_at: data.created_at ?? new Date().toISOString() }
      ).catch((err) => console.error('[createLead] logItemEvent:', err))
    }

    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Creează un lead și îl adaugă automat într-un pipeline specificat.
 * Această funcție combină crearea lead-ului cu adăugarea sa într-un pipeline,
 * asigurând că lead-ul este imediat disponibil în workflow-ul corespunzător.
 * După creare, atribuie automat tag-ul de departament bazat pe numele pipeline-ului.
 * 
 * @param leadData - Datele lead-ului de creat
 * @param pipelineId - ID-ul pipeline-ului în care se adaugă lead-ul
 * @param stageId - ID-ul stage-ului inițial în care se plasează lead-ul
 * @param options - Opțional: currentUserId din useAuth() – evită getSession() (Faza 3.4)
 * @returns Obiect cu:
 *   - data: Obiect cu lead-ul creat și assignment-ul în pipeline, sau null dacă apare o eroare
 *   - error: null dacă reușește, sau eroarea dacă apare o problemă
 */
export async function createLeadWithPipeline(
  leadData: any,
  pipelineId: string,
  stageId: string,
  options?: { currentUserId?: string }
): Promise<{ data: { lead: any; assignment: any } | null; error: any }> {
  try {
    const payload = { ...leadData }
    if (options?.currentUserId != null) payload.created_by = options.currentUserId
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert([payload])
      .select()
      .single()

    if (leadError) throw leadError

    // Înregistrare în istoric: lead creat (pentru afișare data creării și în tab Istoric)
    const actorOption = options?.currentUserId
      ? { currentUserId: options.currentUserId, currentUserName: undefined, currentUserEmail: undefined }
      : undefined
    await logItemEvent(
      'lead',
      lead.id,
      `Lead creat${lead.full_name ? `: ${lead.full_name}` : ''}`,
      'lead_created',
      { lead_id: lead.id, full_name: lead.full_name ?? null, created_at: lead.created_at ?? new Date().toISOString(), pipeline_id: pipelineId, stage_id: stageId },
      undefined,
      actorOption
    ).catch((err) => console.error('[createLeadWithPipeline] logItemEvent:', err))

    // Adaugă lead-ul în pipeline
    const moveResult = await moveLeadToPipelineFn(lead.id, pipelineId, stageId)

    if (!moveResult.ok || !moveResult.data || moveResult.data.length === 0) {
      const errorMessage = moveResult.ok === false ? moveResult.message : 'Nu s-a putut adăuga lead-ul în pipeline'
      throw new Error(errorMessage)
    }

    // Atribuie automat tag-ul de departament după criere
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('name')
      .eq('id', pipelineId)
      .single()
    
    if (pipeline?.name) {
      await assignDepartmentTagToLead(lead.id, pipeline.name)
    }

    // ✅ TRIGGER: Crează conversație PUBLICĂ pentru lead cand se creează lead-ul
    try {
      console.log('🔍 Creating conversation for newly created lead:', lead.id)
      
      // Faza 3.4: currentUserId din apelant (useAuth) – evită getSession()
      let currentUserId = options?.currentUserId
      if (currentUserId == null) {
        const { data: { session } } = await supabase.auth.getSession()
        currentUserId = session?.user?.id ?? undefined
      }
      if (!currentUserId) {
        console.warn('⚠️ No authenticated user found - cannot create conversation')
      } else {
        // Verifică dacă conversația deja există (safety check)
        const { data: existingConv, error: searchError } = await supabase
          .from('conversations')
          .select('id')
          .eq('related_id', lead.id)
          .eq('type', 'lead')
          .maybeSingle()

        if (searchError && searchError.code !== 'PGRST116') {
          console.warn('⚠️ Error searching for conversation:', searchError)
        } else if (!existingConv) {
          // Conversația nu există, crează-o
          console.log('➕ Creating new conversation for lead:', lead.id)
          const { data: newConv, error: insertError } = await supabase
            .from('conversations')
            .insert({
              related_id: lead.id,
              type: 'lead',
              created_by: currentUserId, // Created by current user
            })
            .select('id')
            .single()

          if (insertError) {
            console.error('❌ Error creating conversation:', insertError)
          } else {
            console.log('✅ Conversation created successfully for lead:', newConv?.id)
          }
        } else {
          console.log('✅ Conversation already exists for lead:', existingConv.id)
        }
      }
    } catch (convError) {
      console.error('⚠️ Error in conversation creation process:', convError)
      // Nu oprim procesul dacă crearea conversației eșuează
    }

    return {
      data: {
        lead,
        assignment: { id: moveResult.data[0].pipeline_item_id, pipeline_id: pipelineId, stage_id: stageId },
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Mută un lead într-un pipeline specificat (folosește noua arhitectură cu pipeline_items).
 * Această funcție mută un lead dintr-un pipeline în altul, sau îl adaugă într-un pipeline
 * dacă nu era deja într-unul. Lead-ul este plasat automat în primul stage activ al pipeline-ului
 * țintă dacă nu se specifică un stage. După mutare, atribuie automat tag-ul de departament
 * bazat pe numele noului pipeline.
 * 
 * @param leadId - ID-ul lead-ului de mutat
 * @param targetPipelineId - ID-ul pipeline-ului țintă
 * @param notes - Note opționale despre mutare (pentru istoric)
 * @returns Rezultatul mutării cu ok: true/false, data cu pipeline_item_id și new_stage_id, sau eroare
 */
export async function moveLeadToPipeline(
  leadId: string,
  targetPipelineId: string,
  notes?: string
): Promise<MoveResult> {
  const result = await moveLeadToPipelineFn(leadId, targetPipelineId, undefined, notes)

  // Atribuie automat tag-ul de departament după mutare
  if (result.ok && result.data && result.data.length > 0) {
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('name')
      .eq('id', targetPipelineId)
      .single()

    if (pipeline?.name) {
      await assignDepartmentTagToLead(leadId, pipeline.name)
    }
  }

  return result
}

/**
 * Mută un lead într-un pipeline identificat după nume (nu după ID).
 * Această funcție este o variantă convenabilă care permite mutarea unui lead folosind
 * numele pipeline-ului în loc de ID. Funcția caută pipeline-ul activ cu numele specificat
 * și apoi apelează moveLeadToPipeline cu ID-ul găsit.
 * 
 * @param leadId - ID-ul lead-ului de mutat
 * @param targetPipelineName - Numele pipeline-ului țintă (trebuie să fie exact)
 * @param notes - Note opționale despre mutare (pentru istoric)
 * @returns Rezultatul mutării cu ok: true/false, data cu pipeline_item_id și new_stage_id, sau eroare
 */
export async function moveLeadToPipelineByName(
  leadId: string,
  targetPipelineName: string,
  notes?: string
): Promise<MoveResult> {
  // Găsește pipeline-ul după nume (doar active)
  const { data: pipeline, error: pErr } = await supabase
    .from('pipelines')
    .select('id')
    .eq('name', targetPipelineName)
    .eq('is_active', true)
    .single()

  if (pErr || !pipeline?.id) {
    return { ok: false, code: 'TARGET_PIPELINE_NOT_ACTIVE', message: pErr?.message ?? 'Pipeline not found or inactive' }
  }

  return moveLeadToPipeline(leadId, pipeline.id, notes)
}


/** Etichete pentru afișare în istoric la modificări date client / detalii. */
export const LEAD_FIELD_LABELS: Record<string, string> = {
  full_name: 'Nume',
  phone_number: 'Telefon',
  email: 'Email',
  company_name: 'Companie',
  company_address: 'Adresă companie',
  address: 'Adresă',
  strada: 'Stradă',
  city: 'Oraș',
  zip: 'Cod poștal',
  judet: 'Județ',
  contact_person: 'Persoana de contact',
  contact_phone: 'Telefon contact',
  billing_nume_prenume: 'Facturare: Nume și prenume',
  billing_nume_companie: 'Facturare: Companie',
  billing_cui: 'Facturare: CUI',
  billing_strada: 'Facturare: Stradă',
  billing_oras: 'Facturare: Oraș',
  billing_judet: 'Facturare: Județ',
  billing_cod_postal: 'Facturare: Cod poștal',
  details: 'Detalii comunicate de client',
  tray_details: 'Detalii tăviță',
  callback_date: 'Data callback',
  nu_raspunde_callback_at: 'Nu răspunde (callback at)',
  nu_raspunde: 'Nu răspunde',
  no_deal: 'No Deal',
  campaign_name: 'Campanie',
  ad_name: 'Anunț',
  form_name: 'Formular',
}

/**
 * Actualizează un lead existent în baza de date.
 * Permite modificarea oricăror câmpuri ale lead-ului: nume, email, telefon, detalii despre
 * campanie, anunț, formular, etc. Funcția este folosită pentru editarea informațiilor unui client.
 * 
 * @param leadId - ID-ul lead-ului de actualizat
 * @param updates - Obiect cu câmpurile de actualizat (orice câmpuri din tabelul leads)
 * @returns Obiect cu:
 *   - data: Lead-ul actualizat sau null dacă apare o eroare
 *   - error: null dacă reușește, sau eroarea dacă apare o problemă
 */
export async function updateLead(leadId: string, updates: any) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .select()
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Preia un lead – setează claimed_by pe userId curent.
 * Dacă force=false și lead-ul e deja preluat de altcineva, returnează eroare.
 */
export async function claimLead(
  leadId: string,
  userId: string,
  force = false
): Promise<{ data: any; error: any }> {
  try {
    if (!force) {
      const { data: existing } = await supabase
        .from('leads')
        .select('claimed_by')
        .eq('id', leadId)
        .single()
      if (existing?.claimed_by && existing.claimed_by !== userId) {
        return { data: null, error: { message: 'Lead-ul este deja preluat de altcineva.' } }
      }
    }
    const { data, error } = await supabase
      .from('leads')
      .update({ claimed_by: userId })
      .eq('id', leadId)
      .select()
      .single()
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Eliberează un lead – setează claimed_by pe null.
 */
export async function unclaimLead(leadId: string): Promise<{ data: any; error: any }> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .update({ claimed_by: null })
      .eq('id', leadId)
      .select()
      .single()
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

export type UpdateLeadWithHistoryActor = {
  currentUserId?: string
  currentUserName?: string | null
  currentUserEmail?: string | null
}

/**
 * Actualizează lead-ul și loghează în items_events fiecare câmp modificat cu
 * versiunea precedentă și cea prezentă (pentru audit / istoric admin).
 * Folosiți această funcție în loc de updateLead când doriți păstrarea istoricului modificărilor.
 */
export async function updateLeadWithHistory(
  leadId: string,
  updates: Record<string, any>,
  actorOption?: UpdateLeadWithHistoryActor
): Promise<{ data: any; error: any }> {
  const keys = Object.keys(updates).filter(k => k !== 'updated_at')
  if (keys.length === 0) {
    return updateLead(leadId, updates)
  }

  try {
    const { data: current, error: fetchErr } = await supabase
      .from('leads')
      .select(keys.join(','))
      .eq('id', leadId)
      .single()

    if (fetchErr || !current) {
      const result = await updateLead(leadId, updates)
      return result
    }

    const changes: Array<{ field: string; field_label: string; previous_value: any; new_value: any }> = []
    for (const field of keys) {
      const prev = (current as any)[field]
      const next = updates[field]
      const prevStr = prev == null ? '' : String(prev)
      const nextStr = next == null ? '' : String(next)
      if (prevStr.trim() !== nextStr.trim()) {
        changes.push({
          field,
          field_label: LEAD_FIELD_LABELS[field] || field,
          previous_value: prev,
          new_value: next,
        })
      }
    }

    const { data, error } = await updateLead(leadId, updates)
    if (error) return { data: null, error }

    if (changes.length > 0) {
      const fmt = (v: any) => (v != null && v !== '' ? String(v).trim() : '—')
      const oneLine = (c: (typeof changes)[0]) => `${c.field_label}: ${fmt(c.previous_value)} --- > ${fmt(c.new_value)}`
      const message =
        changes.length === 1
          ? oneLine(changes[0])
          : `${oneLine(changes[0])} și alte ${changes.length - 1} câmpuri`
      await logItemEvent(
        'lead',
        leadId,
        message,
        'lead_field_updated',
        { changes },
        undefined,
        actorOption
      ).catch((err) => console.error('[updateLeadWithHistory] logItemEvent:', err))
    }

    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

/**
 * Șterge un lead din baza de date și toate datele asociate.
 * ATENȚIE: Ștergerea unui lead este ireversibilă și va șterge toate datele asociate:
 * fișe de serviciu, tăvițe, item-uri, evenimente, tag-uri, etc.
 * Folosiți cu precauție, deoarece operația este permanentă.
 * 
 * Ordinea de ștergere:
 * 1. Șterge toate fișele de serviciu (care vor șterge automat tăvițele și tray_items prin cascade)
 * 2. Șterge pipeline_items pentru lead și service_files
 * 3. Șterge lead_tags
 * 4. Șterge stage_history
 * 5. Șterge lead-ul
 * 
 * @param leadId - ID-ul lead-ului de șters
 * @returns Obiect cu:
 *   - success: true dacă ștergerea a reușit, false altfel
 *   - error: null dacă reușește, sau eroarea dacă apare o problemă
 */
export async function deleteLead(leadId: string) {
  try {
    // 1. Obține toate fișele de serviciu pentru acest lead
    const { data: serviceFiles, error: sfError } = await supabase
      .from('service_files')
      .select('id')
      .eq('lead_id', leadId)

    if (sfError) throw sfError

    // 2. Șterge toate fișele de serviciu (cascade va șterge automat tăvițele și tray_items)
    if (serviceFiles && serviceFiles.length > 0) {
      const serviceFileIds = serviceFiles.map(sf => sf.id)
      
      // Șterge pipeline_items pentru service_files
      const { error: piError } = await supabase
        .from('pipeline_items')
        .delete()
        .in('item_id', serviceFileIds)
        .eq('type', 'service_file')

      if (piError) throw piError

      // Șterge fișele de serviciu (cascade va șterge trays și tray_items)
      const { error: deleteSfError } = await supabase
        .from('service_files')
        .delete()
        .eq('lead_id', leadId)

      if (deleteSfError) throw deleteSfError
    }

    // 3. Șterge pipeline_items pentru lead
    const { error: leadPiError } = await supabase
      .from('pipeline_items')
      .delete()
      .eq('item_id', leadId)
      .eq('type', 'lead')

    if (leadPiError) throw leadPiError

    // 4. Șterge lead_tags
    const { error: tagsError } = await supabase
      .from('lead_tags')
      .delete()
      .eq('lead_id', leadId)

    if (tagsError) throw tagsError

    // 5. Șterge stage_history
    const { error: historyError } = await supabase
      .from('stage_history')
      .delete()
      .eq('lead_id', leadId)

    if (historyError) throw historyError

    // 6. Șterge lead-ul
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId)

    if (error) throw error
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error }
  }
}

/**
 * Caută lead-uri după un termen de căutare.
 * Funcția caută în trei câmpuri principale: nume complet, email și număr de telefon.
 * Căutarea este case-insensitive și folosește pattern matching (ilike) pentru a găsi
 * potriviri parțiale. Rezultatele includ toate lead-urile care conțin termenul de căutare
 * în oricare dintre cele trei câmpuri.
 * 
 * @param searchTerm - Termenul de căutare (se caută în nume, email, telefon)
 * @returns Obiect cu:
 *   - data: Array cu lead-urile găsite sau null dacă apare o eroare
 *   - error: null dacă reușește, sau eroarea dacă apare o problemă
 */
export async function searchLeads(searchTerm: string) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone_number.ilike.%${searchTerm}%`)

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Actualizează un pipeline și reordonează stage-urile sale.
 * Această funcție permite modificarea numelui unui pipeline și reordonarea stage-urilor
 * într-o singură operație atomică. Folosește o funcție RPC din Supabase pentru a asigura
 * consistența datelor. Stage-urile sunt reordonate în funcție de ordinea în array-ul furnizat.
 * 
 * @param pipelineId - ID-ul pipeline-ului de actualizat
 * @param pipelineName - Noul nume al pipeline-ului (sau null pentru a păstra numele actual)
 * @param stages - Array cu stage-urile în ordinea finală dorită (fiecare cu id și name)
 * @returns Obiect cu error: null dacă reușește, sau eroarea dacă apare o problemă
 */
export async function updatePipelineAndStages(
  pipelineId: string,
  pipelineName: string,                     // pass current/new name
  stages: { id: string; name: string }[]    // final order
) {
  const payload = stages.map((s, i) => ({ id: s.id, position: i, name: s.name.trim() }))
  const { error } = await supabase.rpc('update_pipeline_and_reorder_stages', {
    p_pipeline_id: pipelineId,
    p_pipeline_name: pipelineName?.trim() ?? null, // send null if you want to skip renaming
    p_items: payload
})
  return { error }
}

// ==================== HELPER FUNCTIONS FOR DETAILED TRACKING ====================

/**
 * Obține detalii complete despre o tăviță, inclusiv pipeline și stage curent.
 * 
 * @param trayId - ID-ul tăviței
 * @returns Detalii complete despre tăviță sau null dacă nu există
 */
export async function getTrayDetails(trayId: string): Promise<{
  id: string
  number: string
  status: string
  service_file_id: string | null
  pipeline: { id: string; name: string } | null
  stage: { id: string; name: string } | null
} | null> {
  if (!trayId || typeof trayId !== 'string' || trayId.trim() === '') {
    return null
  }
  
  try {
    const supabase = supabaseBrowser()
    
    // Obține detaliile tăviței și pipeline/stage în paralel
    const [trayResult, pipelineItemResult] = await Promise.all([
      supabase
        .from('trays')
        .select('id, number, status, service_file_id')
        .eq('id', trayId)
        .single(),
      supabase
        .from('pipeline_items')
        .select(`
          pipeline_id,
          stage_id,
          pipeline:pipelines!inner(id, name),
          stage:stages!inner(id, name)
        `)
        .eq('type', 'tray')
        .eq('item_id', trayId)
        .maybeSingle()
    ])
    
    if (trayResult.error || !trayResult.data) {
      if (trayResult.error?.code !== 'PGRST116') { // PGRST116 = not found
        console.error('[getTrayDetails] Error fetching tray:', trayResult.error)
      }
      return null
    }
    
    const tray = trayResult.data
    const pipelineItem = pipelineItemResult.data
    
    return {
      id: tray.id,
      number: tray.number || 'nesemnată',
      status: tray.status || '',
      service_file_id: tray.service_file_id,
      pipeline: pipelineItem?.pipeline ? {
        id: (pipelineItem.pipeline as any).id,
        name: (pipelineItem.pipeline as any).name,
      } : null,
      stage: pipelineItem?.stage ? {
        id: (pipelineItem.stage as any).id,
        name: (pipelineItem.stage as any).name,
      } : null,
    }
  } catch (error) {
    console.error('[getTrayDetails] Unexpected error:', error)
    return null
  }
}

/**
 * Obține detalii complete despre un tehnician (user).
 * 
 * NOTĂ: Email-ul poate fi obținut doar pentru user-ul curent din cauza limitărilor RLS.
 * Pentru alți utilizatori, email-ul va fi null.
 */
/** Opțiuni pentru a evita apelul Auth când caller-ul furnizează deja user-ul curent (ex. din useAuth()). */
export type CurrentUserOption = { id: string; email?: string | null }

export async function getTechnicianDetails(
  technicianId: string | null,
  options?: { currentUser?: CurrentUserOption }
): Promise<{
  id: string
  name: string
  email: string | null
} | null> {
  if (!technicianId) return null
  
  try {
    const supabase = supabaseBrowser()
    let email: string | null = null

    // Faza 3: dacă caller-ul a furnizat user-ul curent și e același cu technicianId, nu mai apelăm Auth
    if (options?.currentUser?.id === technicianId) {
      email = options.currentUser.email ?? null
    } else {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (currentUser?.id === technicianId) {
        email = currentUser.email || null
      }
    }
    
    // Încearcă să obțină din app_members
    const { data: member, error: memberError } = await supabase
      .from('app_members')
      .select('user_id, name')
      .eq('user_id', technicianId)
      .maybeSingle()
    
    // Dacă nu găsește în app_members, folosește email-ul sau ID-ul
    let name: string
    if (member) {
      name = (member as any).name || (member as any).Name || email || `Tehnician ${technicianId.slice(0, 8)}`
    } else if (email) {
      name = email.split('@')[0] // Folosește partea dinainte de @ ca nume
    } else {
      name = `Tehnician ${technicianId.slice(0, 8)}`
    }
    
    return {
      id: technicianId,
      name,
      email,
    }
  } catch (error) {
    console.error('[getTechnicianDetails] Error:', error)
    return {
      id: technicianId,
      name: `Tehnician ${technicianId.slice(0, 8)}`,
      email: null,
    }
  }
}

/**
 * Obține detalii complete despre un user (actor).
 * 
 * NOTĂ: Email-ul poate fi obținut doar pentru user-ul curent din cauza limitărilor RLS.
 * Pentru alți utilizatori, email-ul va fi null.
 */
export async function getUserDetails(
  userId: string | null,
  options?: { currentUser?: CurrentUserOption }
): Promise<{
  id: string
  name: string
  email: string | null
} | null> {
  if (!userId) return null
  
  try {
    const supabase = supabaseBrowser()
    let email: string | null = null

    // Faza 3: dacă caller-ul a furnizat user-ul curent și e același cu userId, nu mai apelăm Auth
    if (options?.currentUser?.id === userId) {
      email = options.currentUser.email ?? null
    } else {
      // getSession evită apel auth server (session.user e suficient pentru email)
      const { data: { session } } = await supabase.auth.getSession()
      const currentUser = session?.user
      email = currentUser?.id === userId ? currentUser.email || null : null
    }
    
    // Încearcă să obțină din app_members
    const { data: member, error: memberError } = await supabase
      .from('app_members')
      .select('user_id, name')
      .eq('user_id', userId)
      .maybeSingle()
    
    // Dacă nu găsește în app_members, folosește email-ul sau ID-ul
    let name: string
    if (member) {
      name = (member as any).name || (member as any).Name || email || `User ${userId.slice(0, 8)}`
    } else if (email) {
      name = email.split('@')[0] // Folosește partea dinainte de @ ca nume
    } else {
      name = `User ${userId.slice(0, 8)}`
    }
    
    return {
      id: userId,
      name,
      email,
    }
  } catch (error) {
    console.error('[getUserDetails] Error:', error)
    return {
      id: userId,
      name: `User ${userId.slice(0, 8)}`,
      email: null,
    }
  }
}

/**
 * Obține detalii despre pipeline și stage.
 */
export async function getPipelineStageDetails(
  pipelineId: string | null,
  stageId: string | null
): Promise<{
  pipeline: { id: string; name: string } | null
  stage: { id: string; name: string } | null
}> {
  if (!pipelineId || !stageId) {
    return { pipeline: null, stage: null }
  }
  
  try {
    const supabase = supabaseBrowser()
    
    const [pipelineResult, stageResult] = await Promise.all([
      supabase
        .from('pipelines')
        .select('id, name')
        .eq('id', pipelineId)
        .maybeSingle(),
      supabase
        .from('stages')
        .select('id, name')
        .eq('id', stageId)
        .maybeSingle(),
    ])
    
    return {
      pipeline: pipelineResult.data ? {
        id: pipelineResult.data.id,
        name: pipelineResult.data.name,
      } : null,
      stage: stageResult.data ? {
        id: stageResult.data.id,
        name: stageResult.data.name,
      } : null,
    }
  } catch (error) {
    console.error('[getPipelineStageDetails] Error:', error)
    return { pipeline: null, stage: null }
  }
}

/**
 * Obține pipeline și stage curent pentru o tăviță.
 * 
 * @param trayId - ID-ul tăviței
 * @returns Pipeline și stage curent sau null dacă tăvița nu este în niciun pipeline
 */
export async function getTrayPipelineStage(trayId: string): Promise<{
  pipeline: { id: string; name: string } | null
  stage: { id: string; name: string } | null
}> {
  if (!trayId || typeof trayId !== 'string' || trayId.trim() === '') {
    return { pipeline: null, stage: null }
  }
  
  try {
    const supabase = supabaseBrowser()
    
    const { data: pipelineItem, error } = await supabase
      .from('pipeline_items')
      .select(`
        pipeline_id,
        stage_id,
        pipeline:pipelines!inner(id, name),
        stage:stages!inner(id, name)
      `)
      .eq('type', 'tray')
      .eq('item_id', trayId)
      .maybeSingle()
    
    if (error) {
      if (error.code !== 'PGRST116') { // PGRST116 = not found
        console.error('[getTrayPipelineStage] Error:', error)
      }
      return { pipeline: null, stage: null }
    }
    
    if (!pipelineItem) return { pipeline: null, stage: null }
    
    return {
      pipeline: pipelineItem.pipeline ? {
        id: (pipelineItem.pipeline as any).id,
        name: (pipelineItem.pipeline as any).name,
      } : null,
      stage: pipelineItem.stage ? {
        id: (pipelineItem.stage as any).id,
        name: (pipelineItem.stage as any).name,
      } : null,
    }
  } catch (error) {
    console.error('[getTrayPipelineStage] Unexpected error:', error)
    return { pipeline: null, stage: null }
  }
}

// ==================== LOGGING FUNCTIONS ====================

/**
 * Loghează un eveniment pentru un item (lead, service_file sau tray).
 * Această funcție creează o înregistrare în tabelul items_events pentru a urmări istoricul
 * acțiunilor și schimbărilor asupra unui item. Evenimentele pot fi mesaje, mutări de stage,
 * actualizări, etc. Funcția identifică automat utilizatorul curent și încearcă să obțină
 * numele acestuia din app_members sau user_metadata.
 * 
 * @param itemType - Tipul item-ului: 'lead', 'service_file' sau 'tray'
 * @param itemId - ID-ul item-ului pentru care se loghează evenimentul
 * @param message - Mesajul evenimentului (descrierea acțiunii)
 * @param eventType - Tipul evenimentului (ex: 'message', 'stage_change', 'update') - implicit 'message'
 * @param payload - Obiect JSON opțional cu date suplimentare despre eveniment
 * @param details - Detalii opționale pentru a extinde automat payload-ul (tray, technician, pipeline, stage, user)
 * @param actorOption - Faza 3: când caller-ul furnizează user-ul curent (ex. din useAuth()), evităm getUser()
 * @returns Datele evenimentului creat (id, type, item_id, event_type, message, actor_name, created_at)
 * @throws Eroare dacă crearea evenimentului eșuează
 */
export async function logItemEvent(
  itemType: 'lead' | 'service_file' | 'tray',
  itemId: string,
  message: string,
  eventType: string = 'message',
  payload: Record<string, any> = {},
  details?: {
    tray?: { id: string; number: string; status?: string; service_file_id?: string | null }
    technician?: { id: string; name: string; email?: string | null }
    previous_technician?: { id: string | null; name: string | null; email?: string | null }
    pipeline?: { id: string; name: string }
    stage?: { id: string; name: string }
    user?: { id: string; name: string; email: string | null }
  },
  actorOption?: { currentUserId?: string; currentUserName?: string | null; currentUserEmail?: string | null }
) {
  const supabase = supabaseBrowser()
  let actorId: string | null = null
  let actorName: string | null = null
  let actorEmail: string | null = null

  // Faza 3: dacă caller-ul a furnizat user-ul curent, nu mai apelăm Auth
  if (actorOption?.currentUserId) {
    actorId = actorOption.currentUserId
    actorName = actorOption.currentUserName ?? null
    actorEmail = actorOption.currentUserEmail ?? null
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    actorId = user?.id ?? null
    if (user?.id) {
      const { data: memberData } = await supabase
        .from('app_members')
        .select('*')
        .eq('user_id', user.id)
        .single()
      if (memberData && (memberData as any).name) {
        actorName = (memberData as any).name
      } else {
        actorName =
          (user?.user_metadata as any)?.name ||
          (user?.user_metadata as any)?.full_name ||
          user?.email ||
          null
      }
      actorEmail = user?.email || null
    }
  }

  // Extinde payload-ul cu informațiile din details
  const extendedPayload = {
    ...payload,
    // Adaugă detalii despre tăviță dacă sunt furnizate
    ...(details?.tray && {
      tray: {
        id: details.tray.id,
        number: details.tray.number,
        status: details.tray.status || null,
        service_file_id: details.tray.service_file_id || null,
      },
    }),
    // Adaugă detalii despre tehnician dacă sunt furnizate
    ...(details?.technician && {
      technician: {
        id: details.technician.id,
        name: details.technician.name,
        email: details.technician.email || null,
      },
    }),
    // Adaugă detalii despre tehnicianul anterior dacă sunt furnizate
    ...(details?.previous_technician && {
      previous_technician: {
        id: details.previous_technician.id,
        name: details.previous_technician.name,
        email: details.previous_technician.email || null,
      },
    }),
    // Adaugă detalii despre pipeline dacă sunt furnizate
    ...(details?.pipeline && {
      pipeline: {
        id: details.pipeline.id,
        name: details.pipeline.name,
      },
    }),
    // Adaugă detalii despre stage dacă sunt furnizate
    ...(details?.stage && {
      stage: {
        id: details.stage.id,
        name: details.stage.name,
      },
    }),
    // Adaugă detalii despre user dacă sunt furnizate (sau folosește user-ul curent)
    ...(details?.user ? {
      user: {
        id: details.user.id,
        name: details.user.name,
        email: details.user.email || null,
      },
    } : (actorId ? {
      user: {
        id: actorId,
        name: actorName || 'user necunoscut',
        email: actorEmail || null,
      },
    } : {})),
  }

  const { data, error } = await supabase
    .from("items_events")
    .insert([{
      type: itemType,
      item_id: itemId,
      event_type: eventType,
      message,
      payload: extendedPayload,
      actor_id: actorId,
      actor_name: actorName,
    }] as any)
    .select("id, type, item_id, event_type, message, actor_name, created_at")
    .single()

  if (error) throw error
  return data
}

/**
 * Loghează un eveniment pentru un lead (wrapper peste logItemEvent).
 * Această funcție este un wrapper convenabil care apelează logItemEvent cu itemType='lead'.
 * Este folosită pentru a simplifica logarea evenimentelor specifice lead-urilor.
 * 
 * @param leadId - ID-ul lead-ului pentru care se loghează evenimentul
 * @param message - Mesajul evenimentului (descrierea acțiunii)
 * @param eventType - Tipul evenimentului (ex: 'message', 'stage_change', 'update') - implicit 'message'
 * @param payload - Obiect JSON opțional cu date suplimentare despre eveniment
 * @returns Datele evenimentului creat (id, type, item_id, event_type, message, actor_name, created_at)
 * @throws Eroare dacă crearea evenimentului eșuează
 */
export async function logLeadEvent(
  leadId: string,
  message: string,
  eventType: string = 'message',
  payload: Record<string, any> = {}
) {
  return await logItemEvent('lead', leadId, message, eventType, payload)
}

/**
 * Înregistrează în istoricul lead-ului că un buton a fost activat de utilizatorul curent.
 * Folosit pentru tracking: buton X activat de user Y la data/ora Z (actor_name, created_at din items_events).
 *
 * @param params.leadId - ID lead (prioritar)
 * @param params.serviceFileId - Dacă lipsește leadId, se rezolvă lead_id din service_files
 * @param params.buttonId - data-button-id (ex: vanzariCardDeliveryButton)
 * @param params.buttonLabel - Etichetă pentru mesaj (ex: "Livrare")
 * @param params.actorOption - User curent (evită getuser dacă e deja disponibil)
 */
export async function logButtonEvent(params: {
  leadId?: string | null
  serviceFileId?: string | null
  buttonId: string
  buttonLabel?: string
  actorOption?: { currentUserId?: string; currentUserName?: string | null; currentUserEmail?: string | null }
}): Promise<void> {
  const { leadId, serviceFileId, buttonId, buttonLabel, actorOption } = params
  let resolvedLeadId = leadId
  if (!resolvedLeadId && serviceFileId) {
    const { data: sf } = await supabase
      .from('service_files')
      .select('lead_id')
      .eq('id', serviceFileId)
      .maybeSingle()
    resolvedLeadId = (sf as any)?.lead_id ?? null
  }
  if (!resolvedLeadId) return
  const label = buttonLabel ?? buttonId
  const message = `Buton "${label}" activat`
  await logItemEvent(
    'lead',
    resolvedLeadId,
    message,
    'button_clicked',
    { button_id: buttonId, button_label: label },
    undefined,
    actorOption
  ).catch((err) => console.warn('[logButtonEvent]', err))
}

/**
 * Loghează modificări la detaliile comenzii (tray items): update qty/serviciu/discount/urgent,
 * add serviciu/piesă, delete item. Folosit pe mobil (LeadDetailsSheet), desktop (Preturi) și
 * pagina tehnician. Evenimentele apar în istoric indiferent de dispozitiv.
 *
 * @param trayId - ID tăviță
 * @param message - Mesaj pentru istoric
 * @param eventType - 'tray_item_updated' | 'tray_item_added' | 'tray_item_deleted'
 * @param payload - item_id, item_name, field, old_value, new_value, etc.
 * @param serviceFileId - Opțional; dacă există, se loghează și la service_file.
 */
export async function logTrayItemChange(params: {
  trayId: string
  message: string
  eventType: 'tray_item_updated' | 'tray_item_added' | 'tray_item_deleted'
  payload: Record<string, any>
  serviceFileId?: string | null
  /** Opțional: număr tăviță pentru afișare în istoric după arhivare (dacă lipsește, se încarcă din getTrayDetails) */
  trayNumber?: string | null
}) {
  const { trayId, message, eventType, payload, serviceFileId, trayNumber } = params
  try {
    let tray_number = trayNumber ?? null
    if (tray_number == null && trayId) {
      const details = await getTrayDetails(trayId)
      if (details) tray_number = details.number || null
    }
    const payloadWithTray = { ...payload, tray_id: trayId, tray_number }
    await logItemEvent('tray', trayId, message, eventType, payloadWithTray)
    if (serviceFileId) {
      await logItemEvent('service_file', serviceFileId, message, eventType, {
        ...payloadWithTray,
        service_file_id: serviceFileId,
      })
    }
  } catch (e) {
    console.warn('[logTrayItemChange]', e)
  }
}

/**
 * Loghează în istoric adăugarea unei imagini la o tăviță (cine, când, ce fișier).
 */
export async function logTrayImageAdded(params: {
  trayId: string
  filename: string
  imageId?: string | null
  serviceFileId?: string | null
}) {
  const { trayId, filename, imageId, serviceFileId } = params
  try {
    const message = `Imagine adăugată: ${filename}`
    const payload: Record<string, any> = { tray_id: trayId, filename }
    if (imageId) payload.image_id = imageId
    await logItemEvent('tray', trayId, message, 'tray_image_added', payload)
    if (serviceFileId) {
      await logItemEvent('service_file', serviceFileId, message, 'tray_image_added', {
        ...payload,
        service_file_id: serviceFileId,
      })
    }
  } catch (e) {
    console.warn('[logTrayImageAdded]', e)
  }
}

/**
 * Loghează în istoric ștergerea unei imagini de la o tăviță (cine, când, ce fișier).
 */
export async function logTrayImageDeleted(params: {
  trayId: string
  filename: string
  serviceFileId?: string | null
}) {
  const { trayId, filename, serviceFileId } = params
  try {
    const message = `Imagine ștearsă: ${filename}`
    const payload = { tray_id: trayId, filename }
    await logItemEvent('tray', trayId, message, 'tray_image_deleted', payload)
    if (serviceFileId) {
      await logItemEvent('service_file', serviceFileId, message, 'tray_image_deleted', {
        ...payload,
        service_file_id: serviceFileId,
      })
    }
  } catch (e) {
    console.warn('[logTrayImageDeleted]', e)
  }
}


