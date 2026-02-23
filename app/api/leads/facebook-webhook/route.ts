// Facebook Lead Ads Webhook Endpoint for CRM
// Handles webhook verification and lead data retrieval

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildLeadDetailsFromFieldData,
  customDisclaimerResponsesToDetailsText,
  fieldValuesToDetailsText,
  isForeignPhone,
} from '@/lib/facebook-lead-helpers';

// Initialize Supabase client with service role key (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =============================================================================
// GET: Webhook Verification (Facebook sends this to verify your endpoint)
// =============================================================================
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('[Facebook Webhook] Verification request:', { mode, token, challenge });

  // Verify the token matches what you set in Facebook Developer Console
  if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
    console.log('[Facebook Webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  console.log('[Facebook Webhook] Verification failed - token mismatch');
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// =============================================================================
// POST: Receive Lead Notifications from Facebook
// =============================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('[Facebook Webhook] Received payload:', JSON.stringify(body, null, 2));

    // Facebook sends webhooks in this format:
    // {
    //   "object": "page",
    //   "entry": [{
    //     "id": "page_id",
    //     "time": 1234567890,
    //     "changes": [{
    //       "field": "leadgen",
    //       "value": {
    //         "leadgen_id": "123456789",
    //         "page_id": "page_id",
    //         "form_id": "form_id",
    //         "created_time": 1234567890
    //       }
    //     }]
    //   }]
    // }

    if (body.object !== 'page') {
      console.log('[Facebook Webhook] Not a page event, ignoring');
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    // Process each entry
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'leadgen') {
          const leadgenData = change.value;
          console.log('[Facebook Webhook] Processing leadgen:', leadgenData);
          
          // Fetch full lead data from Facebook Graph API
          await processLead(leadgenData);
        }
      }
    }

    // Always return 200 to Facebook (even if processing fails)
    // Otherwise Facebook will retry and you'll get duplicate notifications
    return NextResponse.json({ status: 'received' }, { status: 200 });
    
  } catch (error) {
    console.error('[Facebook Webhook] Error processing webhook:', error);
    // Still return 200 to prevent Facebook from retrying
    return NextResponse.json({ status: 'error', message: 'Internal error' }, { status: 200 });
  }
}

// =============================================================================
// Fetch Full Lead Data from Facebook Graph API
// =============================================================================
async function processLead(leadgenData: {
  leadgen_id: string;
  page_id: string;
  form_id: string;
  created_time: number;
  ad_id?: string;
  adset_id?: string;
}) {
  const { leadgen_id, page_id, form_id, created_time, ad_id, adset_id } = leadgenData;

  try {
    // Check if lead already exists (prevent duplicates)
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('lead_id', leadgen_id)
      .single();

    if (existingLead) {
      console.log(`[Facebook Webhook] Lead ${leadgen_id} already exists, skipping`);
      return;
    }

    // Fetch full lead data from Facebook Graph API
    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    const graphUrl = `https://graph.facebook.com/v19.0/${leadgen_id}?access_token=${accessToken}`;
    
    console.log('[Facebook Webhook] Fetching lead data from Graph API...');
    
    const leadResponse = await fetch(graphUrl);
    const leadData = await leadResponse.json();

    if (leadData.error) {
      console.error('[Facebook Webhook] Graph API error:', leadData.error);
      throw new Error(leadData.error.message);
    }

    console.log('[Facebook Webhook] Lead data from Graph API:', JSON.stringify(leadData, null, 2));

    // Parse field_data: toate tipurile (text, select, multi-select, store locator). values sau value.
    const fieldData: Record<string, string> = {};
    for (const field of leadData.field_data || []) {
      const name = field?.name;
      if (name == null || String(name).trim() === '') continue;
      const raw = field.values ?? field.value;
      const text = fieldValuesToDetailsText(raw);
      if (text) fieldData[name] = text;
    }

    console.log('[Facebook Webhook] Parsed field data:', fieldData);

    // Fetch additional info (form name, page name, ad info)
    const [formInfo, pageInfo, adInfo, adsetInfo, campaignInfo] = await Promise.all([
      fetchFacebookData(`${form_id}?fields=name`, accessToken),
      fetchFacebookData(`${page_id}?fields=name`, accessToken),
      ad_id ? fetchFacebookData(`${ad_id}?fields=name,campaign_id`, accessToken) : null,
      adset_id ? fetchFacebookData(`${adset_id}?fields=name,campaign_id`, accessToken) : null,
      null, // Will fetch campaign separately if we have campaign_id
    ]);

    // Get campaign info if we have the ID
    let campaignData = null;
    const campaignId = adInfo?.campaign_id || adsetInfo?.campaign_id;
    if (campaignId) {
      campaignData = await fetchFacebookData(`${campaignId}?fields=name`, accessToken);
    }

    // Parse base fields (doar chei exacte en; formularul poate folosi "Nume Complet", "Număr De Telefon" etc. → nu se mapează)
    const fullName = fieldData.full_name || fieldData.name || `${fieldData.first_name || ''} ${fieldData.last_name || ''}`.trim() || null
    const phoneNumber = fieldData.phone_number || fieldData.phone || null
    const email = fieldData.email || null

    const fieldKeys = Object.keys(fieldData)
    if (!fullName && fieldKeys.length > 0) {
      console.warn('[Facebook Webhook] full_name NULL — leadurile vor apărea ca "Unknown". Chei căutate: full_name, name, first_name+last_name. Chei din formular:', fieldKeys)
    }
    console.log('[Facebook Webhook] Mapare contact: full_name=%s, phone=%s, email=%s', fullName ?? '(null)', phoneNumber ?? '(null)', email ?? '(null)')

    // ==========================================================================
    // DEDUPLICARE: Verifică dacă există un lead cu același telefon în Arhivat
    // Dacă da, îl mută în "Leaduri" în loc să creeze unul nou
    // ==========================================================================
    if (phoneNumber) {
      const normalizedPhone = phoneNumber.replace(/\s+/g, '').replace(/-/g, '')
      
      // Caută lead existent cu același telefon
      const { data: existingLeadByPhone } = await supabase
        .from('leads')
        .select('id, full_name, phone_number')
        .or(`phone_number.eq.${normalizedPhone},phone_number.ilike.%${normalizedPhone.slice(-9)}%`)
        .limit(1)
        .maybeSingle()

      if (existingLeadByPhone) {
        console.log('[Facebook Webhook] Găsit lead existent cu același telefon:', existingLeadByPhone.id)
        
        // Verifică dacă lead-ul e în stage-ul Arhivat
        const { data: pipelineItem } = await supabase
          .from('pipeline_items')
          .select('id, pipeline_id, stage_id, stages!inner(name)')
          .eq('type', 'lead')
          .eq('item_id', existingLeadByPhone.id)
          .maybeSingle()

        const stageName = (pipelineItem?.stages as any)?.name?.toLowerCase() || ''
        const isInArchive = stageName.includes('arhivat') || stageName.includes('arhiva') || stageName.includes('archive')

        if (isInArchive && pipelineItem) {
          console.log('[Facebook Webhook] Lead existent e în Arhivat → îl mutăm în Leaduri')
          
          // Găsește stage-ul "Leaduri" în același pipeline
          const { data: leaduriStage } = await supabase
            .from('stages')
            .select('id, name')
            .eq('pipeline_id', pipelineItem.pipeline_id)
            .eq('is_active', true)
            .or('name.ilike.%leaduri%,name.ilike.%leads%')
            .not('name', 'ilike', '%straina%')
            .not('name', 'ilike', '%arhiv%')
            .limit(1)
            .maybeSingle()

          if (leaduriStage) {
            // Mută lead-ul în stage-ul Leaduri
            const { error: moveError } = await supabase
              .from('pipeline_items')
              .update({ 
                stage_id: leaduriStage.id,
                updated_at: new Date().toISOString()
              })
              .eq('id', pipelineItem.id)

            if (moveError) {
              console.error('[Facebook Webhook] Eroare la mutarea lead-ului în Leaduri:', moveError)
            } else {
              console.log(`[Facebook Webhook] Lead ${existingLeadByPhone.id} mutat din Arhivat în ${leaduriStage.name}`)
              
              // Actualizează lead-ul cu noile date din Facebook (opțional)
              await supabase
                .from('leads')
                .update({
                  lead_id: leadgen_id, // Actualizează Facebook lead ID
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingLeadByPhone.id)

              // Log eveniment
              await logLeadEvent(existingLeadByPhone.id, 'lead_reactivated', 
                `Lead reactivat din Arhivat (nou formular Facebook cu același telefon)`, {
                source: 'facebook',
                new_leadgen_id: leadgen_id,
                form_id: form_id,
              })

              return existingLeadByPhone // Nu mai creăm lead nou
            }
          } else {
            console.warn('[Facebook Webhook] Nu s-a găsit stage-ul Leaduri pentru reactivare')
          }
        } else {
          console.log('[Facebook Webhook] Lead existent NU e în Arhivat (stage: %s) → creăm lead nou', stageName || 'necunoscut')
        }
      }
    }
    const companyName = fieldData.company_name || fieldData.company || null
    const city = fieldData.city || null
    const strada = fieldData.street_address || fieldData.address || null
    const zip = fieldData.zip_code || fieldData.zip || fieldData.postal_code || null
    const judet = fieldData.state || fieldData.region || fieldData.judet || null

    // Câmpuri explicite din formular (Facebook poate folosi alte denumiri)
    const contactPersonFromForm = fieldData.contact_person || fieldData.contact_name || null
    const contactPhoneFromForm = fieldData.contact_phone || fieldData.contact_phone_number || fieldData.phone_contact || null

    // Pre-populare: Persoana de contact + Telefon contact. Dacă nu există câmpuri dedicate,
    // folosim mereu numele/telefonul principal ca „date de contact”.
    const contactPerson = contactPersonFromForm || fullName || null
    const contactPhone = contactPhoneFromForm || phoneNumber || null

    // Billing și restul
    const billingNumePrenume = fullName || null
    const billingNumeCompanie = companyName || null
    const billingStrada = strada || null
    const billingOras = city || null
    const billingJudet = judet || null
    const billingCodPostal = zip || null

    // Prepare lead record for Supabase
    const leadRecord = {
      // Facebook IDs
      lead_id: leadgen_id,
      form_id: form_id,
      page_id: page_id,
      ad_id: ad_id || null,
      adset_id: adset_id || null,
      campaign_id: campaignId || null,
      
      // Names
      form_name: formInfo?.name || null,
      page_name: pageInfo?.name || null,
      ad_name: adInfo?.name || null,
      adset_name: adsetInfo?.name || null,
      campaign_name: campaignData?.name || null,
      
      // Contact info (common field names from Facebook Lead Ads)
      full_name: fullName,
      email: email,
      phone_number: phoneNumber,
      
      // Store raw values as backup
      raw_full_name: fieldData.full_name || fieldData.name || null,
      raw_email: fieldData.email || null,
      raw_phone_number: fieldData.phone_number || fieldData.phone || null,
      
      // Additional fields (adjust based on your Facebook forms)
      company_name: companyName,
      city: city,
      address: strada,
      strada: strada,
      zip: zip,
      judet: judet,
      
      // Pre-populated fields based on contact info (telefon principal → telefon contact, nume → persoana de contact)
      contact_person: contactPerson,
      contact_phone: contactPhone,
      
      // Billing fields (pre-populated from delivery/contact fields)
      billing_nume_prenume: billingNumePrenume,
      billing_nume_companie: billingNumeCompanie,
      billing_strada: billingStrada,
      billing_oras: billingOras,
      billing_judet: billingJudet,
      billing_cod_postal: billingCodPostal,
      
      // Custom disclaimer responses (store as JSON string)
      custom_disclaimer_responses: leadData.custom_disclaimer_responses 
        ? JSON.stringify(leadData.custom_disclaimer_responses) 
        : null,
      
      // Detalii comunicate de client: field_data + custom_disclaimer_responses (toate tipurile de formular).
      details: (() => {
        const fromFields = buildLeadDetailsFromFieldData(fieldData) ?? '';
        const fromDisclaimers = customDisclaimerResponsesToDetailsText(leadData.custom_disclaimer_responses);
        const combined = [fromFields, fromDisclaimers].filter(Boolean).join('\n\n').trim();
        return combined || null;
      })(),
      
      // Metadata
      platform: 'facebook',
      form_created_time: new Date(created_time * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log('[Facebook Webhook] Inserting lead record:', leadRecord);

    // Insert into leads table
    const { data: insertedLead, error: insertError } = await supabase
      .from('leads')
      .insert(leadRecord)
      .select()
      .single();

    if (insertError) {
      console.error('[Facebook Webhook] Error inserting lead:', insertError);
      throw insertError;
    }

    console.log('[Facebook Webhook] Lead inserted successfully:', insertedLead.id);

    // Add to pipeline (if pipeline IDs are configured)
    // Leaduri străine: număr care nu începe cu +40 sau 40 → stage „Leaduri straina”.
    // Opțional: setați LEADURI_STRAINA_STAGE_ID; altfel se caută un stage cu nume conținând „leaduri” și „straina”.
    if (process.env.DEFAULT_PIPELINE_ID && process.env.DEFAULT_STAGE_ID) {
      const pipelineId = process.env.DEFAULT_PIPELINE_ID;
      let stageId = process.env.DEFAULT_STAGE_ID;

      // Leaduri străine: număr care nu începe cu +40 sau 40 → stage „Leaduri straina”
      if (isForeignPhone(phoneNumber)) {
        const strainaStageId = process.env.LEADURI_STRAINA_STAGE_ID;
        if (strainaStageId) {
          stageId = strainaStageId;
          console.log('[Facebook Webhook] Lead cu număr străin → stage Leaduri straina');
        } else {
          const { data: strainaStage } = await supabase
            .from('stages')
            .select('id')
            .eq('pipeline_id', pipelineId)
            .eq('is_active', true)
            .ilike('name', '%leaduri%straina%')
            .limit(1)
            .maybeSingle();
          if (strainaStage?.id) {
            stageId = strainaStage.id;
            console.log('[Facebook Webhook] Lead cu număr străin → stage Leaduri straina (căutat după nume)');
          }
        }
      }

      const pipelineItem = {
        type: 'lead',
        item_id: insertedLead.id,
        pipeline_id: pipelineId,
        stage_id: stageId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: pipelineError } = await supabase
        .from('pipeline_items')
        .insert(pipelineItem);

      if (pipelineError) {
        console.error('[Facebook Webhook] Error adding to pipeline:', pipelineError);
        // Don't throw - lead is already created
      } else {
        console.log('[Facebook Webhook] Lead added to pipeline successfully');
      }
    }

    // Log event
    await logLeadEvent(insertedLead.id, 'lead_created', 'Lead created from Facebook Lead Ads', {
      source: 'facebook',
      form_name: leadRecord.form_name,
      page_name: leadRecord.page_name,
    });

    return insertedLead;

  } catch (error) {
    console.error('[Facebook Webhook] Error processing lead:', error);
    throw error;
  }
}

// buildLeadDetailsFromFieldData: @/lib/facebook-lead-helpers

// =============================================================================
// Helper: Fetch data from Facebook Graph API
// =============================================================================
async function fetchFacebookData(endpoint: string, accessToken: string | undefined): Promise<any> {
  if (!accessToken) return null;
  
  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${endpoint}&access_token=${accessToken}`);
    const data = await response.json();
    
    if (data.error) {
      console.warn(`[Facebook Webhook] Warning fetching ${endpoint}:`, data.error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.warn(`[Facebook Webhook] Error fetching ${endpoint}:`, error);
    return null;
  }
}

// =============================================================================
// Helper: Log lead event to items_events table
// =============================================================================
async function logLeadEvent(
  leadId: string, 
  eventType: string, 
  message: string, 
  payload: Record<string, any> = {}
) {
  try {
    await supabase.from('items_events').insert({
      type: 'lead',
      item_id: leadId,
      event_type: eventType,
      message: message,
      payload: payload,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[Facebook Webhook] Error logging event:', error);
  }
}