/**
 * Simulare intrare lead de pe Facebook (fără Graph API).
 * POST cu body opțional:
 *   - { field_data?: { name: string; values: string[] }[] }  (format Meta / Graph API)
 *   - sau { field_data?: Record<string, string> }
 * La „Simulează” se trimit date în format Meta; lead-ul se creează din ele.
 *
 * Doar în development (NODE_ENV !== 'production') sau cu header X-Simulate-Secret.
 *
 * -----------------------------------------------------------------------------
 * DETALII COMUNICATE DE CLIENT (leads.details) – în simulare
 * -----------------------------------------------------------------------------
 * field_data conține câmpuri ca full_name, phone_number, message, detalii_comanda etc.
 * Valorile din select/liste (values[]) se convertesc în text cu fieldValuesToDetailsText
 * (join); etichete din FIELD_LABELS când există. buildLeadDetailsFromFieldData extrage
 * textul pentru details; rezultatul se salvează în leads.details la insert.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createApiSupabaseClient } from '@/lib/supabase/api-helpers'
import {
  buildLeadDetailsFromFieldData,
  customDisclaimerResponsesToDetailsText,
  fieldValuesToDetailsText,
  isForeignPhone,
} from '@/lib/facebook-lead-helpers'

/** Format Meta Graph API: field_data[] cu { name, values } */
const DEFAULT_FIELD_DATA_META: { name: string; values: string[] }[] = [
  { name: 'full_name', values: ['Client Simulare Facebook'] },
  { name: 'phone_number', values: ['+40721111111'] },
  { name: 'email', values: ['client.simulare@example.com'] },
  {
    name: 'message',
    values: [
      'Mesaj de test din simularea lead-ului Facebook. Cerere: 2 bucăți reparații.',
    ],
  },
  {
    name: 'detalii_comanda',
    values: ['Comandă demonstrativă pentru testare.'],
  },
  /* Câmpuri select/listă (FIELD_LABELS): simulăm răspunsuri ca din formular Meta */
  { name: 'ce fel de instrument vrei să ascuți?', values: ['Lama mixer'] },
  { name: 'spune-ne despre freza ta:', values: ['Ascuțire, recondiționare'] },
  { name: 'vrei să trimitem curierul după instrumente?', values: ['Da'] },
  { name: 'country', values: ['România'] },
]

/** Exemplu custom_disclaimer_responses (checkbox-uri opționale), ca din Meta. */
const DEFAULT_CUSTOM_DISCLAIMER = [
  { checkbox_key: 'optional_1', is_checked: '1' },
  { checkbox_key: 'optional_2', is_checked: '' },
]

function parseFieldDataFromMetaFormat(
  raw: { name?: string; values?: unknown; value?: unknown }[] | Record<string, string>
): Record<string, string> {
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const f of raw) {
      const name = f?.name
      if (name == null || String(name).trim() === '') continue
      const text = fieldValuesToDetailsText(f.values ?? f.value)
      if (text) out[name] = text
    }
    return out
  }
  return raw as Record<string, string>
}

/** Construiește obiectul pentru insert în leads. details = buildLeadDetailsFromFieldData(fieldData). */
function buildLeadRecordFromFieldData(
  fieldData: Record<string, string>,
  options: { leadId: string }
) {
  const fullName =
    fieldData.full_name ||
    fieldData.name ||
    `${fieldData.first_name || ''} ${fieldData.last_name || ''}`.trim() ||
    null
  const phoneNumber = fieldData.phone_number || fieldData.phone || null
  const email = fieldData.email || null
  const companyName = fieldData.company_name || fieldData.company || null
  const city = fieldData.city || null
  const strada = fieldData.street_address || fieldData.address || null
  const zip = fieldData.zip_code || fieldData.zip || fieldData.postal_code || null
  const judet = fieldData.state || fieldData.region || fieldData.judet || null
  const contactPerson =
    fieldData.contact_person ||
    fieldData.contact_name ||
    fullName ||
    null
  const contactPhone =
    fieldData.contact_phone ||
    fieldData.contact_phone_number ||
    fieldData.phone_contact ||
    phoneNumber ||
    null

  const now = new Date().toISOString()
  return {
    lead_id: options.leadId,
    form_id: 'simulate',
    page_id: 'simulate',
    ad_id: null,
    adset_id: null,
    campaign_id: null,
    form_name: 'Simulare',
    page_name: 'Simulare',
    ad_name: null,
    adset_name: null,
    campaign_name: null,
    full_name: fullName,
    email,
    phone_number: phoneNumber,
    raw_full_name: fieldData.full_name || fieldData.name || null,
    raw_email: fieldData.email || null,
    raw_phone_number: fieldData.phone_number || fieldData.phone || null,
    company_name: companyName,
    city,
    address: strada,
    strada,
    zip,
    judet,
    contact_person: contactPerson,
    contact_phone: contactPhone,
    billing_nume_prenume: fullName || null,
    billing_nume_companie: companyName || null,
    billing_strada: strada || null,
    billing_oras: city || null,
    billing_judet: judet || null,
    billing_cod_postal: zip || null,
    custom_disclaimer_responses: null,
    /* Detalii comunicate de client: din field_data (DETAILS_KEYS + alte câmpuri non-SKIP). */
    details: buildLeadDetailsFromFieldData(fieldData) ?? null,
    platform: 'facebook',
    form_created_time: now,
    created_at: now,
    updated_at: now,
  }
}

async function logLeadEvent(
  supabase: ReturnType<typeof createAdminClient>,
  leadId: string,
  eventType: string,
  message: string,
  payload: Record<string, unknown> = {}
) {
  try {
    await supabase.from('items_events').insert({
      type: 'lead',
      item_id: leadId,
      event_type: eventType,
      message,
      payload,
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('[Simulate Facebook] Error logging event:', e)
  }
}

function isSimulateAllowed(request: NextRequest): boolean {
  const isProd = process.env.NODE_ENV === 'production'
  const secret = request.headers.get('X-Simulate-Secret')
  return !isProd || secret === process.env.SIMULATE_FACEBOOK_SECRET
}

/** Obține pipeline_id + stage_id: din env sau primul pipeline + primul stage din DB. */
async function getDefaultPipelineAndStage(
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ pipelineId: string; stageId: string } | null> {
  const envPipe = process.env.DEFAULT_PIPELINE_ID
  const envStage = process.env.DEFAULT_STAGE_ID
  if (envPipe && envStage) return { pipelineId: envPipe, stageId: envStage }

  const { data: pipes } = await supabase
    .from('pipelines')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
  const pipelineId = pipes?.[0]?.id
  if (!pipelineId) return null

  const { data: stages } = await supabase
    .from('stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true })
    .limit(1)
  const stageId = stages?.[0]?.id
  if (!stageId) return null

  return { pipelineId, stageId }
}

/** Obține stage_id pentru „Leaduri straina” (număr străin): env LEADURI_STRAINA_STAGE_ID sau căutare după nume. */
async function getLeaduriStrainaStageId(
  supabase: ReturnType<typeof createAdminClient>,
  pipelineId: string
): Promise<string | null> {
  const envStage = process.env.LEADURI_STRAINA_STAGE_ID
  if (envStage) return envStage
  const { data: stage } = await supabase
    .from('stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .eq('is_active', true)
    .ilike('name', '%leaduri%straina%')
    .limit(1)
    .maybeSingle()
  return stage?.id ?? null
}

/** GET: pagină simplă cu buton „Simulează” (POST) – util când deschizi URL-ul în browser */
export async function GET(request: NextRequest) {
  if (!isSimulateAllowed(request)) {
    return new NextResponse(
      'Simulare permisă doar în development sau cu header X-Simulate-Secret.',
      { status: 403 }
    )
  }
  const fieldDataMetaJson = JSON.stringify(DEFAULT_FIELD_DATA_META)
  const customDisclaimerJson = JSON.stringify(DEFAULT_CUSTOM_DISCLAIMER)
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Simulare lead Facebook</title></head>
<body style="font-family:system-ui;max-width:560px;margin:2rem auto;padding:1rem;">
  <h1 style="font-size:1.25rem;">Simulare lead Facebook</h1>
  <p style="color:#555;">Trimite <em>field_data</em> + <em>custom_disclaimer_responses</em> (format Meta) și creează un lead de test.</p>
  <button id="btn" style="padding:0.5rem 1rem;font-size:1rem;cursor:pointer;background:#0ea5e9;color:white;border:none;border-radius:6px;">Simulează lead</button>
  <pre id="out" style="margin-top:1.5rem;padding:1rem;background:#f1f5f9;border-radius:8px;font-size:0.875rem;white-space:pre-wrap;word-break:break-all;"></pre>
  <script>
    const FIELD_DATA_META = ${fieldDataMetaJson};
    const CUSTOM_DISCLAIMER = ${customDisclaimerJson};
    document.getElementById('btn').onclick = async () => {
      const btn = document.getElementById('btn');
      const out = document.getElementById('out');
      btn.disabled = true;
      out.textContent = 'Se trimit date (format Meta)...';
      try {
        const r = await fetch(location.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field_data: FIELD_DATA_META, custom_disclaimer_responses: CUSTOM_DISCLAIMER }) });
        const j = await r.json();
        out.textContent = r.ok ? JSON.stringify(j, null, 2) : 'Eroare ' + r.status + ': ' + (j.error || j.details || '');
      } catch (e) {
        out.textContent = 'Eroare: ' + e.message;
      }
      btn.disabled = false;
    };
  </script>
</body></html>`
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function POST(request: NextRequest) {
  if (!isSimulateAllowed(request)) {
    return NextResponse.json(
      {
        error: 'Simulare permisă doar în development sau cu X-Simulate-Secret valid.',
      },
      { status: 403 }
    )
  }

  const defaultFieldData = parseFieldDataFromMetaFormat(DEFAULT_FIELD_DATA_META)
  let fieldData = { ...defaultFieldData }
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (body && typeof body === 'object' && body.field_data) {
      const parsed = parseFieldDataFromMetaFormat(body.field_data as { name?: string; values?: unknown; value?: unknown }[])
      fieldData = { ...defaultFieldData, ...parsed }
    }
  } catch {
    /* use defaults */
  }

  const supabase = createAdminClient()
  const leadId = `simulate_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const leadRecord = buildLeadRecordFromFieldData(fieldData, { leadId })

  const disclaimerText = customDisclaimerResponsesToDetailsText(body?.custom_disclaimer_responses)
  if (disclaimerText) {
    const base = leadRecord.details ?? ''
    leadRecord.details = [base, disclaimerText].filter(Boolean).join('\n\n').trim() || null
  }

  try {
    const apiClient = await createApiSupabaseClient()
    const { data: { session } } = await apiClient.auth.getSession()
    if (session?.user?.id) (leadRecord as Record<string, unknown>).created_by = session.user.id
  } catch {
    /* optional: leave created_by null */
  }

  try {
    const { data: insertedLead, error: insertError } = await supabase
      .from('leads')
      .insert(leadRecord)
      .select()
      .single()

    if (insertError) {
      console.error('[Simulate Facebook] Insert lead error:', insertError)
      return NextResponse.json(
        { error: 'Eroare la inserare lead', details: insertError.message },
        { status: 500 }
      )
    }

    let pipelineAdded = false
    let pipelineIdUsed: string | null = null
    let stageIdUsed: string | null = null

    const defaultPipe = await getDefaultPipelineAndStage(supabase)
    if (defaultPipe) {
      pipelineIdUsed = defaultPipe.pipelineId
      let stageId = defaultPipe.stageId
      if (isForeignPhone(leadRecord.phone_number)) {
        const strainaStageId = await getLeaduriStrainaStageId(supabase, defaultPipe.pipelineId)
        if (strainaStageId) stageId = strainaStageId
      }
      stageIdUsed = stageId
      const { error: pipelineError } = await supabase
        .from('pipeline_items')
        .insert({
          type: 'lead',
          item_id: insertedLead.id,
          pipeline_id: defaultPipe.pipelineId,
          stage_id: stageId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      pipelineAdded = !pipelineError
    }

    await logLeadEvent(
      supabase,
      insertedLead.id,
      'lead_created',
      'Lead creat din simulare Facebook',
      { source: 'simulate', form_name: 'Simulare' }
    )

    return NextResponse.json({
      ok: true,
      leadId: insertedLead.id,
      lead_id: leadId,
      pipelineAdded,
      ...(pipelineIdUsed && stageIdUsed
        ? { pipelineId: pipelineIdUsed, stageId: stageIdUsed }
        : {}),
    })
  } catch (e) {
    console.error('[Simulate Facebook] Error:', e)
    return NextResponse.json(
      { error: 'Eroare la simulare', details: String(e) },
      { status: 500 }
    )
  }
}
