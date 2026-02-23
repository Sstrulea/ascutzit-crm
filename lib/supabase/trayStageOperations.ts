'use client'

/**
 * Tray Stage Operations
 * 
 * Acest fișier conține funcțiile pentru logging-ul mutărilor tăvițelor între stage-uri.
 * Funcțiile creează înregistrări în tabelul stage_history pentru a urmări
 * istoricul complet al mutărilor tăvițelor.
 */

import { supabaseBrowser } from './supabaseClient'
import type {
  TrayStageHistory,
  TrayStageHistoryWithDetails,
  LogTrayStageChangeParams,
  LogTrayStageChangeResult,
  LogTrayInitialStageParams,
  LogTrayStageMoveParams,
  LogTrayPipelineMoveParams,
  GetTrayStageHistoryParams,
  GetTrayStageHistoryResult,
  GetTrayCurrentStageResult,
  GetTrayLastMoveResult,
  GetTrayHistoryInPipelineResult,
  GetTrayStageHistoryStatsResult,
} from '@/lib/types/database'

/**
 * Loghează o schimbare de stage pentru o tăviță.
 * Această funcție creează o înregistrare în tabelul stage_history
 * pentru a urmări istoricul mutărilor tăvițelor între stage-uri.
 * 
 * @param params - Parametrii mutării (trayId, pipelineId, toStageId, etc.)
 * @returns Rezultatul operației cu data sau eroarea
 * @throws Nu aruncă erori, returnează eroarea în obiectul de return pentru flexibilitate
 * 
 * @example
 * ```typescript
 * const result = await logTrayStageChange({
 *   trayId: 'tray-123',
 *   pipelineId: 'pipeline-456',
 *   toStageId: 'stage-789',
 *   fromStageId: 'stage-456',
 *   notes: 'Mutare manuală'
 * })
 * 
 * if (result.error) {
 *   console.error('Eroare la logare:', result.error)
 * } else {
 *   console.log('Logare reușită:', result.data)
 * }
 * ```
 */
export async function logTrayStageChange(
  params: LogTrayStageChangeParams
): Promise<LogTrayStageChangeResult> {
  // 1. Validare parametri
  if (!params.trayId || params.trayId.trim() === '') {
    return { data: null, error: new Error('trayId is required') }
  }
  if (!params.pipelineId || params.pipelineId.trim() === '') {
    return { data: null, error: new Error('pipelineId is required') }
  }
  if (!params.toStageId || params.toStageId.trim() === '') {
    return { data: null, error: new Error('toStageId is required') }
  }

  // Validare: fromStageId nu trebuie să fie același cu toStageId
  if (params.fromStageId && params.fromStageId === params.toStageId) {
    return { 
      data: null, 
      error: new Error('fromStageId cannot be the same as toStageId') 
    }
  }

  try {
    const supabase = supabaseBrowser()
    
    // 2. Validare existență tray / pipeline / stage pentru a evita încălcarea FK în stage_history
    try {
      const [{ data: trayRow, error: trayErr }, { data: stageRow, error: stageErr }] = await Promise.all([
        supabase.from('trays' as any).select('id').eq('id', params.trayId).maybeSingle(),
        supabase.from('stages' as any).select('id').eq('id', params.toStageId).maybeSingle(),
      ])

      // Dacă tabela nu există (42P01) lăsăm insert-ul să se ocupe de eroare ca până acum
      if (trayErr && trayErr.code !== '42P01') {
        console.warn('[logTrayStageChange] Error checking tray existence:', trayErr)
      }
      if (stageErr && stageErr.code !== '42P01') {
        console.warn('[logTrayStageChange] Error checking stage existence:', stageErr)
      }

      // Dacă tăvița nu există deloc în DB, nu mai încercăm să inserăm în stage_history
      if (!trayRow) {
        console.warn('[logTrayStageChange] Tray not found in trays table, skipping stage_history insert for trayId:', params.trayId)
        return { data: null, error: null }
      }

      // Dacă stage-ul nu există, la fel: nu logăm (evităm FK violation), dar nu blocăm fluxul principal
      if (!stageRow) {
        console.warn('[logTrayStageChange] Stage not found in stages table, skipping stage_history insert for toStageId:', params.toStageId)
        return { data: null, error: null }
      }
    } catch (checkExistErr) {
      console.warn('[logTrayStageChange] Error during existence checks (continuing):', checkExistErr)
      // Continuăm – eventualele erori de schemă vor fi prinse la insert
    }

    // 3. movedBy: din params (apelantul trece user?.id din useAuth()) – fără getUser()
    const movedBy = params.movedBy ?? null

    // 4. Verificare duplicate (opțional, pentru a preveni duplicate accidentale)
    // Verifică dacă există o înregistrare identică în ultimele 5 secunde
    // NOTĂ: Ignoră eroarea dacă tabela nu există (va fi gestionată la insert)
    try {
      const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString()
      const { data: recent, error: checkError } = await supabase
        .from('stage_history' as any)
        .select('id')
        .eq('tray_id', params.trayId)
        .eq('pipeline_id', params.pipelineId)
        .eq('to_stage_id', params.toStageId)
        .eq('from_stage_id', params.fromStageId ?? null as any)
        .gte('moved_at', fiveSecondsAgo)
        .maybeSingle()

      // Dacă eroarea este că tabela nu există, continuă (va fi gestionată la insert)
      if (checkError && checkError.code !== '42P01') {
        console.warn('[logTrayStageChange] Error checking for duplicates:', checkError)
        // Continuă cu insert-ul, eroarea va fi gestionată acolo
      }

      if (recent) {
        console.warn('[logTrayStageChange] Duplicate log detected, skipping')
        return { data: null, error: new Error('Duplicate log entry detected') }
      }
    } catch (checkErr) {
      // Ignoră erorile la verificarea duplicate-ului, continuă cu insert-ul
      console.warn('[logTrayStageChange] Error checking for duplicates (continuing):', checkErr)
    }

    // 5. Insert în baza de date
    // Notă: moved_at și created_at sunt setate automat de DB (DEFAULT NOW())
    // IMPORTANT: Nu includem lead_id pentru tăvițe - dacă lead_id este NOT NULL,
    // trebuie să nu fie inclus deloc în insert, nu setat la null
    
    // Loghează parametrii înainte de a construi insertData pentru debugging
    console.log('[logTrayStageChange] Params received:', {
      trayId: params.trayId,
      pipelineId: params.pipelineId,
      fromStageId: params.fromStageId,
      toStageId: params.toStageId,
      movedBy: movedBy,
      notes: params.notes,
    })
    
    const insertData: any = {
      tray_id: params.trayId,
      pipeline_id: params.pipelineId,
      from_stage_id: params.fromStageId ?? null,
      to_stage_id: params.toStageId,
      moved_by: movedBy,
      notes: params.notes ?? null,
      // moved_at și created_at sunt setate automat de DB
    }
    
    // Loghează insertData înainte de insert pentru debugging
    console.log('[logTrayStageChange] Insert data prepared:', JSON.stringify(insertData, null, 2))
    
    // Nu includem lead_id pentru tăvițe - lăsăm DB să folosească valoarea default (NULL)
    // Dacă lead_id este NOT NULL, va trebui să fie gestionat diferit
    
    const { data, error } = await supabase
      .from('stage_history' as any)
      .insert([insertData] as any)
      .select()
      .single()

    if (error) {
      // IMPORTANT: Erorile Supabase au proprietăți non-enumerabile
      // Trebuie să le accesăm direct, nu prin Object.keys()
      const errorCode = error?.code || 'No error code'
      const errorDetails = error?.details || 'No error details'
      const errorHint = error?.hint || 'No error hint'
      
      // Inițializează errorMessage cu valoarea din eroare sau o valoare default
      let errorMessage = error?.message || 'Eroare la inserarea în stage_history'
      
      // Loghează eroarea cu toate detaliile
      console.error('[logTrayStageChange] ❌ ERROR INSERTING INTO stage_history:', {
        message: errorMessage,
        code: errorCode,
        details: errorDetails,
        hint: errorHint,
        // Încearcă serializarea completă
        fullError: JSON.stringify(error, null, 2),
        // Parametrii care au fost folosiți
        params: {
          trayId: params.trayId,
          pipelineId: params.pipelineId,
          fromStageId: params.fromStageId,
          toStageId: params.toStageId,
        },
        // Datele care au fost încercate a fi inserate
        insertData: JSON.stringify(insertData, null, 2),
      })
      
      // Loghează fiecare proprietate separat pentru claritate
      console.error('[logTrayStageChange] Error message:', errorMessage)
      console.error('[logTrayStageChange] Error code:', errorCode)
      console.error('[logTrayStageChange] Error details:', errorDetails)
      console.error('[logTrayStageChange] Error hint:', errorHint)
      console.error('[logTrayStageChange] Insert data attempted:', JSON.stringify(insertData, null, 2))
      
      // Creează o eroare mai descriptivă bazată pe codul erorii
      
      if (error?.code === '42P01') {
        errorMessage = 'Tabela stage_history nu există. Verifică că tabelul există în baza de date.'
      } else if (error?.code === '23503') {
        errorMessage = `Foreign key constraint violation: ${error?.details || 'Verifică că tray_id, pipeline_id și to_stage_id există'}`
      } else if (error?.code === '42501') {
        errorMessage = 'Permisiune insuficientă. Verifică RLS policies pentru stage_history'
      } else if (error?.message) {
        errorMessage = error.message
      } else if (error?.code) {
        errorMessage = `Eroare ${error.code}: ${error?.details || 'Eroare necunoscută'}`
      } else {
        // Dacă eroarea este goală sau nu are proprietăți, încercă să obținem informații din stringified
        try {
          const errorStringified = JSON.stringify(error, null, 2)
          const parsed = JSON.parse(errorStringified)
          if (parsed?.message) errorMessage = parsed.message
          else if (parsed?.code) errorMessage = `Eroare ${parsed.code}`
          else {
            errorMessage = `Eroare necunoscută (tabela poate să nu existe sau RLS blochează inserarea). Verifică: 1) Tabela există? 2) RLS policies? 3) Foreign keys valide?`
          }
        } catch {
          errorMessage = `Eroare necunoscută (tabela poate să nu existe sau RLS blochează inserarea). Verifică: 1) Tabela există? 2) RLS policies? 3) Foreign keys valide?`
        }
      }
      
      // Returnează o eroare standardizată - asigură-te că are întotdeauna un mesaj
      const finalError = error?.message 
        ? error 
        : (error instanceof Error 
          ? new Error(errorMessage) 
          : new Error(errorMessage))
      
      // Asigură-te că eroarea are un mesaj
      if (!finalError.message) {
        finalError.message = errorMessage
      }
      
      return { 
        data: null, 
        error: finalError
      }
    }

    return { data, error: null }
  } catch (error: any) {
    console.error('[logTrayStageChange] Unexpected error:', error)
    
    // Asigură-te că eroarea are întotdeauna un mesaj
    let errorMessage = 'Eroare neașteptată la logging'
    if (error instanceof Error) {
      errorMessage = error.message || 'Eroare neașteptată (fără mesaj)'
    } else if (error && typeof error === 'object') {
      errorMessage = (error as any)?.message || JSON.stringify(error) || 'Eroare neașteptată (obiect)'
    } else {
      errorMessage = String(error) || 'Eroare neașteptată'
    }
    
    return { 
      data: null, 
      error: error instanceof Error && error.message ? error : new Error(errorMessage)
    }
  }
}

/**
 * Loghează adăugarea inițială a unei tăvițe într-un pipeline.
 * Această funcție este un wrapper convenabil pentru prima adăugare a unei tăvițe
 * într-un pipeline, unde fromStageId este întotdeauna null.
 * 
 * @param params - Parametrii adăugării inițiale
 * @returns Rezultatul operației de logare
 * 
 * @example
 * ```typescript
 * const result = await logTrayInitialStage({
 *   trayId: 'tray-123',
 *   pipelineId: 'pipeline-456',
 *   stageId: 'stage-789',
 *   notes: 'Tăvița a fost adăugată în pipeline'
 * })
 * ```
 */
export async function logTrayInitialStage(
  params: LogTrayInitialStageParams
): Promise<LogTrayStageChangeResult> {
  return logTrayStageChange({
    trayId: params.trayId,
    pipelineId: params.pipelineId,
    toStageId: params.stageId,
    fromStageId: null, // Prima adăugare, deci nu există stage anterior
    movedBy: params.movedBy,
    notes: params.notes,
  })
}

/**
 * Loghează mutarea unei tăvițe între stage-uri în același pipeline.
 * Această funcție este un wrapper convenabil pentru mutările între stage-uri
 * în același pipeline, unde pipelineId rămâne constant.
 * 
 * @param params - Parametrii mutării între stage-uri
 * @returns Rezultatul operației de logare
 * 
 * @example
 * ```typescript
 * const result = await logTrayStageMove({
 *   trayId: 'tray-123',
 *   pipelineId: 'pipeline-456',
 *   fromStageId: 'stage-789',
 *   toStageId: 'stage-101',
 *   notes: 'Mutare către următorul stage'
 * })
 * ```
 */
export async function logTrayStageMove(
  params: LogTrayStageMoveParams
): Promise<LogTrayStageChangeResult> {
  // Validare: fromStageId și toStageId sunt obligatorii
  if (!params.fromStageId || params.fromStageId.trim() === '') {
    return { data: null, error: new Error('fromStageId is required for stage move') }
  }
  if (!params.toStageId || params.toStageId.trim() === '') {
    return { data: null, error: new Error('toStageId is required for stage move') }
  }

  return logTrayStageChange({
    trayId: params.trayId,
    pipelineId: params.pipelineId,
    fromStageId: params.fromStageId,
    toStageId: params.toStageId,
    movedBy: params.movedBy,
    notes: params.notes,
  })
}

/**
 * Loghează mutarea unei tăvițe între pipeline-uri diferite.
 * 
 * IMPORTANT: Această funcție loghează doar adăugarea în noul pipeline,
 * nu loghează "ieșirea" din vechiul pipeline. Motivul: nu are sens să loghezi
 * o mutare în același stage (tăvița rămâne în același stage, doar pipeline-ul se schimbă).
 * 
 * @param params - Parametrii mutării între pipeline-uri
 * @returns Rezultatul operației de logare
 * 
 * @example
 * ```typescript
 * const result = await logTrayPipelineMove({
 *   trayId: 'tray-123',
 *   fromPipelineId: 'pipeline-456',
 *   fromStageId: 'stage-789',
 *   toPipelineId: 'pipeline-101',
 *   toStageId: 'stage-202',
 *   notes: 'Mutare între pipeline-uri'
 * })
 * ```
 */
export async function logTrayPipelineMove(
  params: LogTrayPipelineMoveParams
): Promise<LogTrayStageChangeResult> {
  // Loghează doar adăugarea în noul pipeline
  // Nu loghează "ieșirea" din vechiul pipeline (nu are sens să loghezi o mutare în același stage)
  const notes = params.notes || 
    `Tăvița a fost mutată din pipeline ${params.fromPipelineId} (stage ${params.fromStageId || 'N/A'}) în pipeline ${params.toPipelineId} (stage ${params.toStageId})`

  return logTrayStageChange({
    trayId: params.trayId,
    pipelineId: params.toPipelineId, // Noul pipeline
    fromStageId: null, // Nou pipeline, deci nu există stage anterior în acest pipeline
    toStageId: params.toStageId,
    movedBy: params.movedBy,
    notes,
  })
}

// ==================== QUERY FUNCTIONS ====================

/**
 * Obține istoricul complet al mutărilor unei tăvițe.
 * Această funcție returnează toate mutările unei tăvițe cu detalii despre stage-uri,
 * pipeline și utilizator, cu suport pentru paginare și filtrare avansată.
 * 
 * @param params - Parametrii pentru query (trayId, limit, offset, filtre opționale)
 * @returns Rezultatul query-ului cu array-ul de istoric, count pentru paginare și eroarea dacă există
 * 
 * @example
 * ```typescript
 * const result = await getTrayStageHistory({
 *   trayId: 'tray-123',
 *   limit: 20,
 *   offset: 0,
 *   pipelineId: 'pipeline-456',
 *   dateFrom: '2026-01-01T00:00:00Z'
 * })
 * 
 * if (result.error) {
 *   console.error('Eroare:', result.error)
 * } else {
 *   console.log(`Găsite ${result.count} mutări`)
 *   console.log('Istoric:', result.data)
 * }
 * ```
 */
export async function getTrayStageHistory(
  params: GetTrayStageHistoryParams
): Promise<GetTrayStageHistoryResult> {
  try {
    // Validare parametri
    if (!params.trayId || typeof params.trayId !== 'string' || params.trayId.trim() === '') {
      return { data: [], count: null, error: new Error('trayId is required') }
    }
    
    const limit = Math.min(Math.max(params.limit || 100, 1), 1000) // Limită între 1 și 1000
    const offset = Math.max(params.offset || 0, 0) // Nu poate fi negativ

    const supabase = supabaseBrowser()
    
    // Construiește query-ul cu filtrare
    let query = supabase
      .from('stage_history' as any)
      .select(`
        *,
        from_stage:stages!stage_history_from_stage_id_fkey(id, name),
        to_stage:stages!stage_history_to_stage_id_fkey(id, name),
        pipeline:pipelines!stage_history_pipeline_id_fkey(id, name),
        moved_by_user:auth.users!stage_history_moved_by_fkey(id, email)
      `, { count: 'exact' }) // IMPORTANT: Adaugă count pentru paginare
      .eq('tray_id', params.trayId)

    // Aplică filtre opționale
    if (params.pipelineId) {
      query = query.eq('pipeline_id', params.pipelineId)
    }
    if (params.fromStageId) {
      query = query.eq('from_stage_id', params.fromStageId)
    }
    if (params.toStageId) {
      query = query.eq('to_stage_id', params.toStageId)
    }
    if (params.movedBy) {
      query = query.eq('moved_by', params.movedBy)
    }
    if (params.dateFrom) {
      query = query.gte('moved_at', params.dateFrom)
    }
    if (params.dateTo) {
      query = query.lte('moved_at', params.dateTo)
    }

    // Aplică sortare și paginare
    const { data, error, count } = await query
      .order('moved_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('[getTrayStageHistory] Error:', error)
      return { data: [], count: null, error }
    }

    // Transformă datele în formatul așteptat
    const history: TrayStageHistoryWithDetails[] = (data || []).map((item: any) => ({
      ...item,
      from_stage: item.from_stage ? {
        id: item.from_stage.id,
        name: item.from_stage.name,
      } : null,
      to_stage: {
        id: item.to_stage.id,
        name: item.to_stage.name,
      },
      pipeline: {
        id: item.pipeline.id,
        name: item.pipeline.name,
      },
      moved_by_user: item.moved_by_user ? {
        id: item.moved_by_user.id,
        email: item.moved_by_user.email,
      } : null,
    }))

    return { data: history, count: count || null, error: null }
  } catch (error: any) {
    console.error('[getTrayStageHistory] Unexpected error:', error)
    return { data: [], count: null, error }
  }
}

/**
 * Obține stage-ul curent al unei tăvițe.
 * IMPORTANT: Obține stage-ul din `pipeline_items`, nu din ultima mutare din istoric.
 * Motiv: Stage-ul curent este cel din `pipeline_items`, care este sursa de adevăr.
 * 
 * @param trayId - ID-ul tăviței
 * @returns Rezultatul cu stage-ul curent sau null dacă tăvița nu este în niciun pipeline
 * 
 * @example
 * ```typescript
 * const result = await getTrayCurrentStage('tray-123')
 * if (result.data) {
 *   console.log(`Tăvița este în stage-ul ${result.data.stageName} din pipeline-ul ${result.data.pipelineName}`)
 * }
 * ```
 */
export async function getTrayCurrentStage(
  trayId: string
): Promise<GetTrayCurrentStageResult> {
  try {
    // Validare parametri
    if (!trayId || typeof trayId !== 'string' || trayId.trim() === '') {
      return { data: null, error: new Error('trayId is required') }
    }

    const supabase = supabaseBrowser()
    
    // Obține stage-ul curent din pipeline_items (sursa de adevăr)
    const { data: pipelineItems, error } = await supabase
      .from('pipeline_items')
      .select(`
        stage_id,
        pipeline_id,
        stage:stages!pipeline_items_stage_id_fkey(id, name),
        pipeline:pipelines!pipeline_items_pipeline_id_fkey(id, name)
      `)
      .eq('type', 'tray')
      .eq('item_id', trayId)

    if (error) {
      console.error('[getTrayCurrentStage] Error:', error)
      return { data: null, error }
    }

    // Poate exista în mai multe pipeline-uri, luăm primul
    if (!pipelineItems || pipelineItems.length === 0) {
      return { data: null, error: null }
    }

    const firstItem = pipelineItems[0] as any
    if (!firstItem.stage) {
      return { data: null, error: null }
    }

    return {
      data: {
        stageId: firstItem.stage.id,
        stageName: firstItem.stage.name,
        pipelineId: firstItem.pipeline_id,
        pipelineName: firstItem.pipeline?.name || null,
      },
      error: null,
    }
  } catch (error: any) {
    console.error('[getTrayCurrentStage] Unexpected error:', error)
    return { data: null, error }
  }
}

/**
 * Obține ultima mutare a unei tăvițe.
 * Returnează ultima mutare din istoric (sortare pe `moved_at DESC`).
 * 
 * @param trayId - ID-ul tăviței
 * @returns Rezultatul cu ultima mutare sau null dacă nu există istoric
 * 
 * @example
 * ```typescript
 * const result = await getTrayLastMove('tray-123')
 * if (result.data) {
 *   console.log(`Ultima mutare: ${result.data.to_stage.name} la ${result.data.moved_at}`)
 * }
 * ```
 */
export async function getTrayLastMove(
  trayId: string
): Promise<GetTrayLastMoveResult> {
  try {
    // Validare parametri
    if (!trayId || typeof trayId !== 'string' || trayId.trim() === '') {
      return { data: null, error: new Error('trayId is required') }
    }

    const supabase = supabaseBrowser()
    
    const { data, error } = await supabase
      .from('stage_history' as any)
      .select(`
        *,
        from_stage:stages!stage_history_from_stage_id_fkey(id, name),
        to_stage:stages!stage_history_to_stage_id_fkey(id, name),
        pipeline:pipelines!stage_history_pipeline_id_fkey(id, name),
        moved_by_user:auth.users!stage_history_moved_by_fkey(id, email)
      `)
      .eq('tray_id', trayId)
      .order('moved_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[getTrayLastMove] Error:', error)
      return { data: null, error }
    }

    if (!data) {
      return { data: null, error: null }
    }

    // Transformă datele în formatul așteptat
    const dataAny = data as any
    const history: TrayStageHistoryWithDetails = {
      ...dataAny,
      from_stage: dataAny.from_stage ? {
        id: dataAny.from_stage.id,
        name: dataAny.from_stage.name,
      } : null,
      to_stage: {
        id: dataAny.to_stage.id,
        name: dataAny.to_stage.name,
      },
      pipeline: {
        id: dataAny.pipeline.id,
        name: dataAny.pipeline.name,
      },
      moved_by_user: dataAny.moved_by_user ? {
        id: dataAny.moved_by_user.id,
        email: dataAny.moved_by_user.email,
      } : null,
    }

    return { data: history, error: null }
  } catch (error: any) {
    console.error('[getTrayLastMove] Unexpected error:', error)
    return { data: null, error }
  }
}

/**
 * Obține istoricul unei tăvițe într-un pipeline specific.
 * Folosește indexul compus `(tray_id, pipeline_id, moved_at DESC)` pentru optimizare.
 * 
 * @param trayId - ID-ul tăviței
 * @param pipelineId - ID-ul pipeline-ului
 * @param limit - Numărul maxim de rezultate (default: 100, max: 1000)
 * @param offset - Offset pentru paginare (default: 0)
 * @returns Rezultatul cu istoricul filtrat pe pipeline, count și eroarea dacă există
 * 
 * @example
 * ```typescript
 * const result = await getTrayHistoryInPipeline('tray-123', 'pipeline-456', 20, 0)
 * console.log(`Găsite ${result.count} mutări în acest pipeline`)
 * ```
 */
export async function getTrayHistoryInPipeline(
  trayId: string,
  pipelineId: string,
  limit: number = 100,
  offset: number = 0
): Promise<GetTrayHistoryInPipelineResult> {
  try {
    // Validare parametri
    if (!trayId || typeof trayId !== 'string' || trayId.trim() === '') {
      return { data: [], count: null, error: new Error('trayId is required') }
    }
    if (!pipelineId || typeof pipelineId !== 'string' || pipelineId.trim() === '') {
      return { data: [], count: null, error: new Error('pipelineId is required') }
    }

    const validLimit = Math.min(Math.max(limit, 1), 1000)
    const validOffset = Math.max(offset, 0)

    const supabase = supabaseBrowser()
    
    const { data, error, count } = await supabase
      .from('stage_history' as any)
      .select(`
        *,
        from_stage:stages!stage_history_from_stage_id_fkey(id, name),
        to_stage:stages!stage_history_to_stage_id_fkey(id, name),
        pipeline:pipelines!stage_history_pipeline_id_fkey(id, name),
        moved_by_user:auth.users!stage_history_moved_by_fkey(id, email)
      `, { count: 'exact' })
      .eq('tray_id', trayId)
      .eq('pipeline_id', pipelineId)
      .order('moved_at', { ascending: false })
      .range(validOffset, validOffset + validLimit - 1)

    if (error) {
      console.error('[getTrayHistoryInPipeline] Error:', error)
      return { data: [], count: null, error }
    }

    // Transformă datele în formatul așteptat
    const history: TrayStageHistoryWithDetails[] = (data || []).map((item: any) => ({
      ...item,
      from_stage: item.from_stage ? {
        id: item.from_stage.id,
        name: item.from_stage.name,
      } : null,
      to_stage: {
        id: item.to_stage.id,
        name: item.to_stage.name,
      },
      pipeline: {
        id: item.pipeline.id,
        name: item.pipeline.name,
      },
      moved_by_user: item.moved_by_user ? {
        id: item.moved_by_user.id,
        email: item.moved_by_user.email,
      } : null,
    }))

    return { data: history, count: count || null, error: null }
  } catch (error: any) {
    console.error('[getTrayHistoryInPipeline] Unexpected error:', error)
    return { data: [], count: null, error }
  }
}

/**
 * Obține statistici despre istoricul unei tăvițe.
 * IMPORTANT: Obține stage-ul curent din `pipeline_items`, nu din ultima mutare din istoric.
 * Calculează `timeInCurrentStage` din momentul actual (nu din ultima mutare).
 * 
 * @param trayId - ID-ul tăviței
 * @returns Rezultatul cu statisticile despre istoric
 * 
 * @example
 * ```typescript
 * const result = await getTrayStageHistoryStats('tray-123')
 * if (result.data) {
 *   console.log(`Total mutări: ${result.data.totalMoves}`)
 *   console.log(`Timp în stage-ul curent: ${result.data.timeInCurrentStage} secunde`)
 * }
 * ```
 */
export async function getTrayStageHistoryStats(
  trayId: string
): Promise<GetTrayStageHistoryStatsResult> {
  try {
    // Validare parametri
    if (!trayId || typeof trayId !== 'string' || trayId.trim() === '') {
      return { data: null, error: new Error('trayId is required') }
    }

    const supabase = supabaseBrowser()
    
    // 1. Obține statisticile de bază din istoric
    const { data: history, error: historyError } = await supabase
      .from('stage_history' as any)
      .select('moved_at')
      .eq('tray_id', trayId)
      .order('moved_at', { ascending: true })

    if (historyError) {
      console.error('[getTrayStageHistoryStats] Error:', historyError)
      return { data: null, error: historyError }
    }

    const totalMoves = history?.length || 0
    const firstMoveAt = history && history.length > 0 ? (history[0] as any).moved_at : null
    const lastMoveAt = history && history.length > 0 ? (history[history.length - 1] as any).moved_at : null

    // 2. Obține stage-ul curent din pipeline_items (NU din ultima mutare din istoric)
    const { data: currentPipelineItems, error: currentError } = await supabase
      .from('pipeline_items')
      .select(`
        stage_id,
        pipeline_id,
        stage:stages!pipeline_items_stage_id_fkey(id, name),
        pipeline:pipelines!pipeline_items_pipeline_id_fkey(id, name)
      `)
      .eq('type', 'tray')
      .eq('item_id', trayId)

    let currentStage = null
    let timeInCurrentStage = null

    if (!currentError && currentPipelineItems && currentPipelineItems.length > 0) {
      const firstItem = currentPipelineItems[0] as any
      if (firstItem.stage) {
        currentStage = {
          id: firstItem.stage.id,
          name: firstItem.stage.name,
          pipelineId: firstItem.pipeline_id,
          pipelineName: firstItem.pipeline?.name || null,
        }

        // 3. Calculează timpul în stage-ul curent (din momentul actual)
        // Obține ultima mutare în acest stage din istoric
        const { data: lastMoveInStage } = await supabase
          .from('stage_history' as any)
          .select('moved_at')
          .eq('tray_id', trayId)
          .eq('to_stage_id', firstItem.stage.id)
          .order('moved_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const lastMoveAny = lastMoveInStage as any
        if (lastMoveAny?.moved_at) {
          const lastMoveTime = new Date(lastMoveAny.moved_at).getTime()
          const now = Date.now()
          timeInCurrentStage = Math.floor((now - lastMoveTime) / 1000) // în secunde
        }
      }
    }

    return {
      data: {
        totalMoves,
        currentStage,
        firstMoveAt,
        lastMoveAt,
        timeInCurrentStage,
      },
      error: null,
    }
  } catch (error: any) {
    console.error('[getTrayStageHistoryStats] Unexpected error:', error)
    return { data: null, error }
  }
}
