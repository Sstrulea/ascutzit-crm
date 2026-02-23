/**
 * Standard Pipeline Strategy
 * 
 * Handles standard pipelines (e.g., Vanzari) that display leads.
 * This is the simplest strategy - just loads leads from pipeline_items.
 */

import type { PipelineStrategy } from './base'
import type { KanbanItem, KanbanContext, KanbanTag } from '../types'
import { supabaseBrowser } from '../../supabaseClient'
import { 
  fetchPipelineItems, 
  fetchLeadsByIds, 
  fetchTagsForLeads,
  fetchServiceFilesForLeads,
  fetchTraysForServiceFiles,
  fetchTrayItems,
  fetchServicePrices,
  fetchServiceFilesByIds,
  fetchUserMessageCountByLeadIds,
  fetchUserNamesByIds
} from '../fetchers'
import { loadTechnicianCache } from '../cache'
import { 
  groupPipelineItemsByType, 
  getPipelineItem,
  transformLeadToKanbanItem,
  transformServiceFileToKanbanItem,
  calculateTrayTotals
} from '../transformers'
import type { PipelineItemWithStage } from '../types'
import { isLivrariOrCurierAjunsAziStage } from '../constants'
import { isForeignPhone } from '@/lib/facebook-lead-helpers'

const TZ_RO = 'Europe/Bucharest'

/** Verifică dacă data ISO (timezone-agnostic) este „azi” în Ora României. */
function isTodayRO(iso: string | null | undefined): boolean {
  if (!iso) return false
  const today = new Date().toLocaleDateString('ro-RO', { timeZone: TZ_RO })
  const d = new Date(iso).toLocaleDateString('ro-RO', { timeZone: TZ_RO })
  return d === today
}

/** Pentru query items_events: limita inferioară (acum - 48h) ca să includem toată ziua curentă RO; filtrarea „azi” se face cu isTodayRO în memorie. */
function getTwoDaysAgoISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 2)
  return d.toISOString()
}

/** Fișa creată acum mai mult de 2 zile (data de azi minus data creării fișei > 2 zile) → COLET NERIDICAT. */
function isOlderThanTwoDays(createdAtIso: string | null | undefined): boolean {
  if (!createdAtIso) return false
  const created = new Date(createdAtIso).getTime()
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000
  return created < twoDaysAgo
}

const MS_24H = 24 * 60 * 60 * 1000

/** Lead cu Curier Trimis/Office Direct: doar în Curier Ajuns Azi (≤24h), Avem Comanda (>24h) sau Arhivat. Fără duplicate. */
function isWithin24h(tagAssignedAt: string | null | undefined): boolean {
  if (!tagAssignedAt) return false
  const t = new Date(tagAssignedAt).getTime()
  return Date.now() - t <= MS_24H
}

export class StandardPipelineStrategy implements PipelineStrategy {
  
  canHandle(context: KanbanContext): boolean {
    // Standard pipelines are those that are NOT receptie, curier, or department
    return !context.pipelineInfo.isReceptie && 
           !context.pipelineInfo.isCurier && 
           !context.pipelineInfo.isDepartment
  }
  
  async loadItems(context: KanbanContext): Promise<KanbanItem[]> {
    // Load technician cache in parallel with pipeline items
    const [_, pipelineItemsResult] = await Promise.all([
      loadTechnicianCache(),
      fetchPipelineItems(context.pipelineId)
    ])
    
    if (pipelineItemsResult.error) {
      throw pipelineItemsResult.error
    }
    
    const pipelineItems = pipelineItemsResult.data
    const { leads, itemMap } = groupPipelineItemsByType(pipelineItems)
    
    // ==================== VÂNZĂRI: STAGE "CURIER TRIMIS" ȘI "OFFICE DIRECT" ====================
    // Verifică dacă suntem în pipeline-ul Vânzări (trebuie făcut înainte de orice return)
    const pipelineNameLower = context.pipelineInfo.name.toLowerCase()
    const isVanzari = pipelineNameLower.includes('vanzari') || pipelineNameLower.includes('sales')
    
    // Stage "Curier Trimis": afișăm fișele de serviciu cu curier_trimis=true (ca în Recepție)
    const curierTrimisStage = isVanzari
      ? context.allStages.find(s => {
          if (s.pipeline_id !== context.pipelineId) return false
          const nameLower = (s.name || '').toLowerCase().trim()
          return (nameLower.includes('curier') && nameLower.includes('trimis')) ||
            nameLower.includes('curier_trimis') || nameLower.includes('curier-trimis')
        }) || null
      : null

    // Stage "Office Direct": afișăm fișele de serviciu cu office_direct=true (ca în Recepție)
    const officeDirectStage = isVanzari
      ? context.allStages.find(s => {
          if (s.pipeline_id !== context.pipelineId) return false
          const nameLower = (s.name || '').toLowerCase().trim()
          return (nameLower.includes('office') && nameLower.includes('direct')) ||
            nameLower.includes('office_direct') || nameLower.includes('office-direct')
        }) || null
      : null

    // Stage "Colet Neridicat": fișe cu curier_trimis a căror dată de creare e mai veche de 2 zile (data azi - data creării > 2 zile)
    const coletNeridicatStage = isVanzari
      ? context.allStages.find(s => {
          if (s.pipeline_id !== context.pipelineId) return false
          const nameLower = (s.name || '').toLowerCase().trim()
          return (nameLower.includes('colet') && nameLower.includes('neridicat')) ||
            nameLower.includes('colet_neridicat') || nameLower.includes('colet-neridicat')
        }) || null
      : null

    // Stage "Colet Ajuns": exclude fișe care au ajuns deja aici din COLET NERIDICAT
    const coletAjunsStage = isVanzari
      ? context.allStages.find(s => {
          if (s.pipeline_id !== context.pipelineId) return false
          const nameLower = (s.name || '').toLowerCase().trim()
          return (nameLower.includes('colet') && nameLower.includes('ajuns')) || nameLower.includes('colet_ajuns')
        }) || null
      : null

    // Stage "Curier Ajuns Azi" / "LIVRARI": lead-uri pentru care s-a creat azi (RO) o fișă cu Curier trimis sau Office direct activ
    const curierAjunsAziStage = isVanzari
      ? context.allStages.find(s => {
          if (s.pipeline_id !== context.pipelineId) return false
          return isLivrariOrCurierAjunsAziStage(s.name || '')
        }) || null
      : null

    // Stage "Nu raspunde": fișe de serviciu cu nu_raspunde_callback_at setat
    const nuRaspundeStage = isVanzari
      ? context.allStages.find(s => {
          if (s.pipeline_id !== context.pipelineId) return false
          const n = (s.name || '').toLowerCase()
          return (n.includes('nu') && n.includes('raspunde')) || n.includes('nuraspunde')
        }) || null
      : null

    const serviceFileItems: KanbanItem[] = []
    
    // În Vânzări, stage-urile Curier Trimis și Office Direct: doar fișe „înregistrate” azi. Admin/owner văd toate (de la orice user), restul doar pe cele atribuite de ei.
    let allowedCurierTrimisIds: Set<string> | null = null
    let allowedOfficeDirectIds: Set<string> | null = null
    if (isVanzari && (context.currentUserId || context.isAdminOrOwner)) {
      try {
        const supabase = supabaseBrowser()
        let query = supabase
          .from('items_events')
          .select('item_id, payload, created_at')
          .eq('type', 'service_file')
          .eq('event_type', 'delivery_started')
          .gte('created_at', getTwoDaysAgoISO())
        if (!context.isAdminOrOwner && context.currentUserId) {
          query = query.eq('actor_id', context.currentUserId)
        }
        const { data: events } = await query
        const todayEvents = (events || []).filter((ev: any) => isTodayRO(ev?.created_at))
        const curier = new Set<string>()
        const office = new Set<string>()
        todayEvents.forEach((ev: any) => {
          const mode = ev?.payload?.mode
          if (mode === 'curier_trimis') curier.add(ev.item_id)
          if (mode === 'office_direct') office.add(ev.item_id)
        })
        allowedCurierTrimisIds = curier
        allowedOfficeDirectIds = office
      } catch (e) {
        console.warn('[StandardPipelineStrategy] items_events delivery_started:', (e as any)?.message)
        allowedCurierTrimisIds = new Set()
        allowedOfficeDirectIds = new Set()
      }
    }
    
    // Debug logging
    const vanzariStages = context.allStages.filter(s => s.pipeline_id === context.pipelineId)
    console.log('[StandardPipelineStrategy] Verificare Vânzări:', {
      pipelineName: context.pipelineInfo.name,
      pipelineId: context.pipelineId,
      isVanzari,
      curierTrimisStage: curierTrimisStage ? { id: curierTrimisStage.id, name: curierTrimisStage.name } : null,
      coletNeridicatStage: coletNeridicatStage ? { id: coletNeridicatStage.id, name: coletNeridicatStage.name } : null,
      officeDirectStage: officeDirectStage ? { id: officeDirectStage.id, name: officeDirectStage.name } : null,
      curierAjunsAziStage: curierAjunsAziStage ? { id: curierAjunsAziStage.id, name: curierAjunsAziStage.name } : null,
      allStages: vanzariStages.map(s => ({ id: s.id, name: s.name }))
    })
    
    // Vanzari: nu mai afișăm fișe de serviciu (Curier Trimis, Office Direct, Colet Neridicat, Nu raspunde) - doar lead-uri
    if (false && isVanzari && curierTrimisStage) {
      try {
        const supabase = supabaseBrowser()
        
        // Încarcă fișele de serviciu cu curier_trimis=true direct din DB (DEZACTIVAT)
        const { data: rawCurierFiles, error: serviceFilesError } = await supabase
          .from('service_files')
          .select(`
            id, lead_id, number, status, created_at, updated_at, office_direct, curier_trimis, curier_scheduled_at, urgent,
            lead:leads(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip)
          `)
          .eq('curier_trimis', true)
        
        if (serviceFilesError) {
          console.error('[StandardPipelineStrategy] Eroare la query service_files:', serviceFilesError)
        }
        
        // Doar în Vânzări: carduri doar dacă evenimentul „a intrat în Curier Trimis” (delivery_started) este în ziua de azi (RO). Excluzem fișele mai vechi de 2 zile (acestea merg în COLET NERIDICAT).
        const directServiceFiles = (rawCurierFiles || []).filter((sf: any) => {
          if (allowedCurierTrimisIds === null) return false
          if (!context.isAdminOrOwner && !context.currentUserId) return false
          if (isOlderThanTwoDays(sf.created_at)) return false // mai vechi de 2 zile → COLET NERIDICAT
          return allowedCurierTrimisIds.has(sf.id)
        })
        
        if (directServiceFiles.length > 0) {
          console.log(`[StandardPipelineStrategy] Găsite ${directServiceFiles.length} fișe Curier Trimis (azi, RO)`)
          
          // Obține lead IDs pentru tag-uri
          const serviceFileLeadIds = directServiceFiles
            .map((sf: any) => sf.lead?.id)
            .filter(Boolean) as string[]
          
          if (serviceFileLeadIds.length > 0) {
            const [{ data: serviceFileTagMap }, messageCountRes] = await Promise.all([
              fetchTagsForLeads(serviceFileLeadIds),
              fetchUserMessageCountByLeadIds(serviceFileLeadIds).catch(() => ({ data: new Map<string, number>(), error: null }))
            ])
            const userMessageCountByLeadIdSf = messageCountRes.data ?? new Map<string, number>()
            
            // Calculează totalurile pentru fișele de serviciu
            const serviceFileIds = directServiceFiles.map((sf: any) => sf.id)
            const serviceFileTotalsData = await this.calculateServiceFileTotals(serviceFileIds)
            
            // Transformă fișele de serviciu în KanbanItems
            directServiceFiles.forEach((sf: any) => {
              if (!sf.lead) {
                console.warn(`[StandardPipelineStrategy] Fișa de serviciu ${sf.id} nu are lead asociat`)
                return
              }
              
              const leadId = sf.lead.id
              const leadTagsRaw = serviceFileTagMap.get(leadId) || []
              const leadTags = Array.isArray(leadTagsRaw) ? leadTagsRaw : []
              
              // IMPORTANT: Pentru fișele de serviciu, tag-ul "urgent" vine din câmpul urgent al fișei
              const tagsWithoutUrgent = leadTags.filter(tag => tag?.name?.toLowerCase() !== 'urgent')
              const serviceFileTags = [...tagsWithoutUrgent]
              
              if (sf.urgent === true) {
                const urgentTag = leadTags.find(tag => tag?.name?.toLowerCase() === 'urgent')
                if (urgentTag) {
                  serviceFileTags.push(urgentTag)
                } else {
                  serviceFileTags.push({
                    id: `urgent_${sf.id}`,
                    name: 'URGENT',
                    color: 'red' as const
                  })
                }
              }
              
              const total = serviceFileTotalsData.get(sf.id) || 0
              
              // Creează pipeline item virtual pentru fișa de serviciu
              const virtualPipelineItem: PipelineItemWithStage = {
                id: `virtual_${sf.id}`,
                type: 'service_file',
                item_id: sf.id,
                pipeline_id: context.pipelineId,
                stage_id: curierTrimisStage.id,
                created_at: sf.created_at,
                updated_at: new Date().toISOString(),
                stage: { id: curierTrimisStage.id, name: curierTrimisStage.name },
                isReadOnly: false
              }
              
              const userMessageCount = userMessageCountByLeadIdSf.get(leadId) ?? 0
              const kanbanItem = transformServiceFileToKanbanItem(
                sf as any, // Cast to RawServiceFile - data from DB query matches the structure
                virtualPipelineItem,
                serviceFileTags,
                total,
                false,
                userMessageCount
              )
              
              serviceFileItems.push(kanbanItem)
            })
            
            console.log(`[StandardPipelineStrategy] Transformate ${serviceFileItems.length} fișe de serviciu în KanbanItems`)
          }
        } else {
          console.log('[StandardPipelineStrategy] Nu s-au găsit fișe Curier Trimis (azi, RO)')
        }
      } catch (e: any) {
        console.error('[StandardPipelineStrategy] Eroare la încărcarea fișelor de serviciu "Curier Trimis":', e?.message || e, e?.stack)
      }
    }

    // ==================== VÂNZĂRI: STAGE "COLET NERIDICAT" - DEZACTIVAT (nu mai afișăm fișe) ====================
    if (false && isVanzari && coletNeridicatStage) {
      try {
        const supabase = supabaseBrowser()
        const twoDaysAgoISO = getTwoDaysAgoISO()
        const { data: rawColetNeridicatFiles, error: cnErr } = await supabase
          .from('service_files')
          .select(`
            id, lead_id, number, status, created_at, updated_at, office_direct, curier_trimis, curier_scheduled_at, urgent,
            lead:leads(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip)
          `)
          .eq('curier_trimis', true)
          .lt('created_at', twoDaysAgoISO)

        if (cnErr) {
          console.error('[StandardPipelineStrategy] Eroare la query service_files Colet Neridicat:', cnErr)
        } else if (rawColetNeridicatFiles && rawColetNeridicatFiles.length > 0) {
          let coletNeridicatFiles = (rawColetNeridicatFiles as any[]).filter((sf: any) => isOlderThanTwoDays(sf.created_at) && sf.lead)
          // Exclude fișe care au ajuns deja în stage Colet ajuns
          if (coletNeridicatFiles.length > 0 && coletAjunsStage) {
            const cnSfIds = coletNeridicatFiles.map((sf: any) => sf.id)
            const { data: piInColetAjuns } = await supabase
              .from('pipeline_items')
              .select('item_id')
              .eq('pipeline_id', context.pipelineId)
              .eq('type', 'service_file')
              .eq('stage_id', coletAjunsStage.id)
              .in('item_id', cnSfIds)
            const coletAjunsSfIds = new Set((piInColetAjuns || []).map((r: any) => r.item_id).filter(Boolean))
            coletNeridicatFiles = coletNeridicatFiles.filter((sf: any) => !coletAjunsSfIds.has(sf.id))
          }
          if (coletNeridicatFiles.length > 0) {
            const cnLeadIds = coletNeridicatFiles.map((sf: any) => sf.lead?.id).filter(Boolean) as string[]
            const { data: cnTagMap } = await fetchTagsForLeads(cnLeadIds)
            const cnSfIds = coletNeridicatFiles.map((sf: any) => sf.id)
            const cnTotalsData = await this.calculateServiceFileTotals(cnSfIds)

            coletNeridicatFiles.forEach((sf: any) => {
              if (!sf.lead) return
              const leadId = sf.lead.id
              const leadTagsRaw = cnTagMap?.get(leadId) || []
              const leadTags = Array.isArray(leadTagsRaw) ? leadTagsRaw : []
              const tagsWithoutUrgent = leadTags.filter((t: any) => t?.name?.toLowerCase() !== 'urgent')
              const sfTags = [...tagsWithoutUrgent]
              if (sf.urgent === true) {
                const urgentTag = leadTags.find((t: any) => t?.name?.toLowerCase() === 'urgent')
                if (urgentTag) sfTags.push(urgentTag)
                else sfTags.push({ id: `urgent_${sf.id}`, name: 'URGENT', color: 'red' as const })
              }
              const total = cnTotalsData.get(sf.id) || 0
              const virtualItem: PipelineItemWithStage = {
                id: `virtual_cn_${sf.id}`,
                type: 'service_file',
                item_id: sf.id,
                pipeline_id: context.pipelineId,
                stage_id: coletNeridicatStage.id,
                created_at: sf.created_at,
                updated_at: new Date().toISOString(),
                stage: { id: coletNeridicatStage.id, name: coletNeridicatStage.name },
                isReadOnly: false
              }
              const kanbanItem = transformServiceFileToKanbanItem(sf as any, virtualItem, sfTags, total, false)
              serviceFileItems.push(kanbanItem)
            })
          }
        }
      } catch (e: any) {
        console.error('[StandardPipelineStrategy] Eroare la încărcarea fișelor "Colet Neridicat":', e?.message || e, e?.stack)
      }
    }

    // ==================== VÂNZĂRI: STAGE "OFFICE DIRECT" - DEZACTIVAT (nu mai afișăm fișe) ====================
    if (false && isVanzari && officeDirectStage) {
      try {
        const supabase = supabaseBrowser()
        const { data: rawOfficeDirectFiles, error: odError } = await supabase
          .from('service_files')
          .select(`
            id, lead_id, number, status, created_at, updated_at, office_direct, office_direct_at, curier_trimis, urgent,
            lead:leads(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip)
          `)
          .eq('office_direct', true)

        if (odError) {
          console.error('[StandardPipelineStrategy] Eroare la query service_files office_direct:', odError)
        }

        // Doar în Vânzări: carduri doar dacă evenimentul „a intrat în Office Direct” (delivery_started) este în ziua de azi (RO). Admin/owner văd toate, restul doar pe cele atribuite de ei.
        const officeDirectFiles = (rawOfficeDirectFiles || []).filter((sf: any) => {
          if (allowedOfficeDirectIds === null) return false
          if (!context.isAdminOrOwner && !context.currentUserId) return false
          return allowedOfficeDirectIds.has(sf.id)
        })

        if (officeDirectFiles.length > 0) {
          const odLeadIds = officeDirectFiles
            .map((sf: any) => sf.lead?.id)
            .filter(Boolean) as string[]
          if (odLeadIds.length > 0) {
            const { data: odTagMap } = await fetchTagsForLeads(odLeadIds)
            const odSfIds = officeDirectFiles.map((sf: any) => sf.id)
            const odTotalsData = await this.calculateServiceFileTotals(odSfIds)

            officeDirectFiles.forEach((sf: any) => {
              if (!sf.lead) return
              const leadId = sf.lead.id
              const leadTagsRaw = odTagMap?.get(leadId) || []
              const leadTags = Array.isArray(leadTagsRaw) ? leadTagsRaw : []
              const tagsWithoutUrgent = leadTags.filter((t: any) => t?.name?.toLowerCase() !== 'urgent')
              const sfTags = [...tagsWithoutUrgent]
              if (sf.urgent === true) {
                const urgentTag = leadTags.find((t: any) => t?.name?.toLowerCase() === 'urgent')
                if (urgentTag) sfTags.push(urgentTag)
                else sfTags.push({ id: `urgent_${sf.id}`, name: 'URGENT', color: 'red' as const })
              }
              const total = odTotalsData.get(sf.id) || 0
              const virtualItem: PipelineItemWithStage = {
                id: `virtual_${sf.id}`,
                type: 'service_file',
                item_id: sf.id,
                pipeline_id: context.pipelineId,
                stage_id: officeDirectStage.id,
                created_at: sf.created_at,
                updated_at: new Date().toISOString(),
                stage: { id: officeDirectStage.id, name: officeDirectStage.name },
                isReadOnly: false
              }
              const kanbanItem = transformServiceFileToKanbanItem(
                sf as any,
                virtualItem,
                sfTags,
                total,
                false
              )
              serviceFileItems.push(kanbanItem)
            })
          }
        }
      } catch (e: any) {
        console.error('[StandardPipelineStrategy] Eroare la încărcarea fișelor "Office Direct":', e?.message || e, e?.stack)
      }
    }

    // ==================== VÂNZĂRI: STAGE "NU RASPUNDE" - DEZACTIVAT (nu mai afișăm fișe) ====================
    if (false && isVanzari && nuRaspundeStage) {
      try {
        const supabase = supabaseBrowser()
        const { data: rawNuRaspundeFiles, error: nrError } = await supabase
          .from('service_files')
          .select(`
            id, lead_id, number, status, created_at, updated_at, office_direct, curier_trimis, nu_raspunde_callback_at, urgent,
            lead:leads(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip)
          `)
          .not('nu_raspunde_callback_at', 'is', null)

        if (nrError) {
          console.error('[StandardPipelineStrategy] Eroare la query service_files Nu raspunde:', nrError)
        } else if (rawNuRaspundeFiles && rawNuRaspundeFiles.length > 0) {
          const nuRaspundeFiles = (rawNuRaspundeFiles as any[]).filter((sf: any) => sf.lead)
          if (nuRaspundeFiles.length > 0) {
            const nrLeadIds = nuRaspundeFiles.map((sf: any) => sf.lead?.id).filter(Boolean) as string[]
            const { data: nrTagMap } = await fetchTagsForLeads(nrLeadIds)
            const nrSfIds = nuRaspundeFiles.map((sf: any) => sf.id)
            const nrTotalsData = await this.calculateServiceFileTotals(nrSfIds)

            nuRaspundeFiles.forEach((sf: any) => {
              if (!sf.lead) return
              const leadId = sf.lead.id
              const leadTagsRaw = nrTagMap?.get(leadId) || []
              const leadTags = Array.isArray(leadTagsRaw) ? leadTagsRaw : []
              const tagsWithoutUrgent = leadTags.filter((t: any) => t?.name?.toLowerCase() !== 'urgent')
              const sfTags = [...tagsWithoutUrgent]
              if (sf.urgent === true) {
                const urgentTag = leadTags.find((t: any) => t?.name?.toLowerCase() === 'urgent')
                if (urgentTag) sfTags.push(urgentTag)
                else sfTags.push({ id: `urgent_${sf.id}`, name: 'URGENT', color: 'red' as const })
              }
              const total = nrTotalsData.get(sf.id) || 0
              const virtualItem: PipelineItemWithStage = {
                id: `virtual_nr_${sf.id}`,
                type: 'service_file',
                item_id: sf.id,
                pipeline_id: context.pipelineId,
                stage_id: nuRaspundeStage.id,
                created_at: sf.created_at,
                updated_at: new Date().toISOString(),
                stage: { id: nuRaspundeStage.id, name: nuRaspundeStage.name },
                isReadOnly: false
              }
              const kanbanItem = transformServiceFileToKanbanItem(sf as any, virtualItem, sfTags, total, false)
              serviceFileItems.push(kanbanItem)
            })
          }
        }
      } catch (e: any) {
        console.error('[StandardPipelineStrategy] Eroare la încărcarea fișelor "Nu raspunde":', e?.message || e, e?.stack)
      }
    }

    // Dacă nu există lead-uri, returnează array gol (Vanzari nu mai afișează fișe)
    if (leads.length === 0) {
      return []
    }
    
    // Fetch leads and calculate their totals
    const [leadsResult, totalsData] = await Promise.all([
      fetchLeadsByIds(leads),
      this.calculateLeadTotals(leads)
    ])
    
    if (leadsResult.error) {
      throw leadsResult.error
    }
    
    // Fetch tags, user message counts și nume utilizatori (claimed_by, curier_trimis_user_id, office_direct_user_id)
    const leadData = leadsResult.data
    const userIds = new Set<string>()
    for (const l of leadData) {
      const cb = (l as any).claimed_by
      const ct = (l as any).curier_trimis_user_id
      const od = (l as any).office_direct_user_id
      if (cb) userIds.add(cb)
      if (ct) userIds.add(ct)
      if (od) userIds.add(od)
    }
    const [tagResult, messageCountResult, userNamesResult] = await Promise.all([
      fetchTagsForLeads(leads),
      fetchUserMessageCountByLeadIds(leads).catch(() => ({ data: new Map<string, number>(), error: null })),
      fetchUserNamesByIds(Array.from(userIds))
    ])
    const { data: tagMap } = tagResult
    const userMessageCountByLeadId = messageCountResult.data ?? new Map<string, number>()
    const userNamesMap = userNamesResult.data ?? new Map<string, string>()
    
    // ==================== VÂNZĂRI: STAGE "COMENZI ACTIVE" ====================
    // Dacă pipeline-ul curent este Vânzări și există stage "COMENZI ACTIVE",
    // atunci afișăm automat lead-urile care au comenzi active în alte pipeline-uri
    // (Recepție + Departamente), prin override de stage în UI (fără mutare în DB).

    const comenziActiveStage = isVanzari
      ? context.allStages.find(s =>
          s.pipeline_id === context.pipelineId &&
          String(s.name || '').toLowerCase() === 'comenzi active'
        ) || null
      : null

    // ==================== VÂNZĂRI: STAGE "NO DEAL" ====================
    const noDealStage = isVanzari
      ? context.allStages.find(s => {
          const n = String(s.name || '').toUpperCase()
          return s.pipeline_id === context.pipelineId && (
            n === 'NO DEAL' ||
            n === 'NO-DEAL' ||
            n.includes('NO DEAL')
          )
        }) || null
      : null

    // ==================== VÂNZĂRI: STAGE "CALL BACK" ====================
    const callBackStage = isVanzari
      ? context.allStages.find(s => {
          if (s.pipeline_id !== context.pipelineId) return false
          const n = (s.name || '').toLowerCase()
          return n.includes('call') && n.includes('back') || n.includes('callback') || n.includes('call-back')
        }) || null
      : null

    // ==================== VÂNZĂRI: STAGE "NU RĂSPUNDE" (pentru lead-uri) ====================
    const nuRaspundeStageLead = isVanzari
      ? context.allStages.find(s => {
          if (s.pipeline_id !== context.pipelineId) return false
          const n = (s.name || '').toLowerCase()
          return (n.includes('nu') && n.includes('raspunde')) || n.includes('nuraspunde')
        }) || null
      : null

    // ==================== VÂNZĂRI: STAGE "AVEM COMANDĂ" / "AVEM COMANDA" ====================
    // Lead-uri cu ≥1 fișă de serviciu cu status 'comanda' (fișă cu conținut = ≥1 instrument).
    // Matching flexibil: "Avem Comanda", "Avem Comandă", "avem comanda", etc.
    const norm = (t: string) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
    const vanzariStagesForAvem = context.allStages.filter(s => s.pipeline_id === context.pipelineId)
    const avemComandaStage = isVanzari
      ? vanzariStagesForAvem.find(s => {
          const n = norm(String(s.name || ''))
          const hasAvem = n.includes('avem')
          const hasComand = n.includes('comand')
          return hasAvem && hasComand
        }) || null
      : null
    if (isVanzari && !avemComandaStage && vanzariStagesForAvem.length) {
      console.warn('[StandardPipelineStrategy] Stage "Avem Comanda" negăsit. Nume verificat:', vanzariStagesForAvem.map(s => `"${s.name}"`))
    }

    // ==================== VÂNZĂRI: STAGE "LEADURI STRĂINE" ====================
    // Lead-uri cu număr care nu începe cu +40 (ex. +44, 44) se afișează în Leaduri străine.
    // Dacă lead-ul a fost deja manipulat (mutat în alt stage), cardul rămâne în stage-ul curent.
    const leaduriStrainaStage = isVanzari
      ? vanzariStagesForAvem.find(s => {
          const n = norm(String(s.name || ''))
          return n.includes('leaduri') && (n.includes('straine') || n.includes('străine'))
        }) || null
      : null
    const vanzariFirstStageId = isVanzari && vanzariStagesForAvem.length ? vanzariStagesForAvem[0]?.id : null

    // Stage Arhivat (Vânzări): lead-uri cu Curier Trimis pot apărea aici
    const arhivatStage = isVanzari
      ? vanzariStagesForAvem.find(s => {
          const n = String(s.name || '').toLowerCase()
          return n.includes('arhiv')
        }) || null
      : null

    // Curier Trimis / Office Direct: leadId -> tagAssignedAt (pentru regula 24h)
    const curierOfficeTagAssignedAt = new Map<string, string>()
    if (isVanzari) {
      try {
        const supabase = supabaseBrowser()
        const { data: sfCurier } = await supabase
          .from('service_files')
          .select('lead_id, curier_scheduled_at, office_direct_at, created_at, curier_trimis, office_direct')
          .or('curier_trimis.eq.true,office_direct.eq.true')
        for (const sf of (sfCurier || []) as any[]) {
          const leadId = sf?.lead_id
          if (!leadId) continue
          const at = sf?.curier_scheduled_at || sf?.office_direct_at || sf?.created_at
          if (!at) continue
          const existing = curierOfficeTagAssignedAt.get(leadId)
          if (!existing || new Date(at).getTime() > new Date(existing).getTime()) {
            curierOfficeTagAssignedAt.set(leadId, at)
          }
        }
      } catch (e: any) {
        console.warn('[StandardPipelineStrategy] Eroare curier/office tag map:', e?.message)
      }
    }

    const avemComandaLeadIds = new Set<string>()
    if (isVanzari && avemComandaStage) {
      try {
        const supabase = supabaseBrowser()
        const { data: comandaRows, error } = await supabase
          .from('service_files')
          .select('lead_id')
          .eq('status', 'comanda')
        if (!error && Array.isArray(comandaRows)) {
          for (const r of comandaRows as { lead_id?: string }[]) {
            if (r?.lead_id) avemComandaLeadIds.add(r.lead_id)
          }
        }
      } catch (e: any) {
        console.warn('[StandardPipelineStrategy] Eroare la query Avem Comandă (continuăm fără):', e?.message || e)
      }
    }

    const activeOrdersLeadIds = new Set<string>()
    if (isVanzari && comenziActiveStage) {
      try {
        const supabase = supabaseBrowser()

        // Pipeline-uri externe relevante: Recepție + Departamente
        const externalPipelineIds: string[] = []
        let receptiePipelineId: string | null = null
        for (const p of context.allPipelines) {
          const n = String(p?.name || '').toLowerCase()
          const isReceptie = n.includes('receptie')
          const isDepartment =
            n.includes('saloane') || n.includes('horeca') || n.includes('frizerii') || n.includes('reparatii')
          if (p?.id && (isReceptie || isDepartment)) {
            externalPipelineIds.push(p.id)
          }
          if (p?.id && isReceptie) {
            receptiePipelineId = p.id
          }
        }

        // Mapări: service_file_id -> lead_id, tray_id -> lead_id
        const serviceFileIdToLeadId = new Map<string, string>()
        for (const sf of totalsData.serviceFiles) {
          if (sf?.id && sf?.lead_id) serviceFileIdToLeadId.set(sf.id, sf.lead_id)
        }

        const serviceFileIds = Array.from(serviceFileIdToLeadId.keys())

        // Map: tray_id -> service_file_id (pentru a exclude tăvițe ale fișelor arhivate)
        const trayIdToServiceFileId = new Map<string, string>()
        for (const t of totalsData.trays) {
          if (t?.id && t?.service_file_id) {
            trayIdToServiceFileId.set(t.id, t.service_file_id)
          }
        }

        // Dacă un service_file este în stage "Arhivat" (în Recepție), NU mai e comandă activă
        const archivedServiceFileIds = new Set<string>()
        if (receptiePipelineId && serviceFileIds.length > 0) {
          const archivedStageIds = new Set<string>(
            context.allStages
              .filter(s => s.pipeline_id === receptiePipelineId && String(s.name || '').toLowerCase().includes('arhiv'))
              .map(s => s.id)
          )

          if (archivedStageIds.size > 0) {
            const chunkSize = 500
            for (let i = 0; i < serviceFileIds.length; i += chunkSize) {
              const chunk = serviceFileIds.slice(i, i + chunkSize)
              const { data: sfRows, error: sfErr } = await supabase
                .from('pipeline_items')
                .select('item_id, stage_id')
                .eq('pipeline_id', receptiePipelineId)
                .eq('type', 'service_file')
                .in('item_id', chunk)

              if (sfErr) {
                console.warn('[StandardPipelineStrategy] Eroare la verificarea Arhivat (service_file):', sfErr?.message || sfErr)
                break
              }

              const rowsAny = Array.isArray(sfRows) ? (sfRows as any[]) : []
              for (const r of rowsAny) {
                const itemId = r?.item_id as string | undefined
                const stageId = r?.stage_id as string | undefined
                if (!itemId || !stageId) continue
                if (archivedStageIds.has(stageId)) {
                  archivedServiceFileIds.add(itemId)
                }
              }
            }
          }
        }

        const trayIdToLeadId = new Map<string, string>()
        for (const t of totalsData.trays) {
          const leadId = serviceFileIdToLeadId.get(t.service_file_id)
          if (t?.id && leadId) trayIdToLeadId.set(t.id, leadId)
        }
        const trayIds = Array.from(trayIdToLeadId.keys())

        const externalItemIds = [...serviceFileIds, ...trayIds]

        if (externalPipelineIds.length > 0 && externalItemIds.length > 0) {
          // Query în batch (evităm limitele .in)
          const chunkSize = 500
          for (let i = 0; i < externalItemIds.length; i += chunkSize) {
            const chunk = externalItemIds.slice(i, i + chunkSize)
            const { data: rows, error } = await supabase
              .from('pipeline_items')
              .select('type, item_id, pipeline_id, stage_id')
              .in('pipeline_id', externalPipelineIds)
              .in('type', ['service_file', 'tray'] as any)
              .in('item_id', chunk)

            if (error) {
              console.warn('[StandardPipelineStrategy] Eroare la verificarea comenzilor active:', error?.message || error)
              break
            }

            const rowsAny = Array.isArray(rows) ? (rows as any[]) : []
            for (const r of rowsAny) {
              const type = r?.type as string | undefined
              const itemId = r?.item_id as string | undefined
              if (!type || !itemId) continue

              // Exclude service_file arhivat (și implicit tăvițele lui)
              if (type === 'service_file' && archivedServiceFileIds.has(itemId)) {
                continue
              }
              if (type === 'tray') {
                const sfId = trayIdToServiceFileId.get(itemId)
                if (sfId && archivedServiceFileIds.has(sfId)) {
                  continue
                }
              }

              if (type === 'service_file') {
                const leadId = serviceFileIdToLeadId.get(itemId)
                if (leadId) activeOrdersLeadIds.add(leadId)
              } else if (type === 'tray') {
                const leadId = trayIdToLeadId.get(itemId)
                if (leadId) activeOrdersLeadIds.add(leadId)
              }
            }
          }
        }
      } catch (e: any) {
        console.warn('[StandardPipelineStrategy] Eroare calcul COMENZI ACTIVE (continuăm fără):', e?.message || e)
      }
    }

    // Transform leads to KanbanItems
    const kanbanItems: KanbanItem[] = []
    
    // Sortează leads-urile în ordinea inversă (cel mai nou prim)
    const sortedLeads = [...leadsResult.data].sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime()
      const dateB = new Date(b.created_at || 0).getTime()
      return dateB - dateA // Descending: newest first
    })
    
    const hasCurierTrimisTag = (tags: any[]) => (Array.isArray(tags) ? tags : []).some((t: any) => (t?.name || '').trim().toLowerCase() === 'curier trimis')
    const hasOfficeDirectTag = (tags: any[]) => (Array.isArray(tags) ? tags : []).some((t: any) => (t?.name || '').trim().toLowerCase() === 'office direct')

    sortedLeads.forEach(lead => {
      const pipelineItem = getPipelineItem(itemMap, 'lead', lead.id)
      if (!pipelineItem) return
      
      const tags = tagMap.get(lead.id) || []
      const total = totalsData.leadTotals.get(lead.id) || 0

      // Curier Trimis / Office Direct: lead-ul apare DOAR în Curier Ajuns Azi (≤24h), Avem Comanda (>24h) sau Arhivat. Fără duplicate.
      const hasCurierOrOffice = curierOfficeTagAssignedAt.has(lead.id) || hasCurierTrimisTag(tags) || hasOfficeDirectTag(tags)
      const tagAssignedAt = curierOfficeTagAssignedAt.get(lead.id) || (lead as any).curier_trimis_at || (lead as any).office_direct_at
      const isInArhivat = arhivatStage && pipelineItem.stage_id === arhivatStage.id
      if (isVanzari && hasCurierOrOffice) {
        if (isInArhivat) {
          // Păstrează în Arhivat
        } else if (isWithin24h(tagAssignedAt)) {
          // Dacă utilizatorul a mutat explicit lead-ul în Avem Comandă, păstrăm poziția (nu îl readucem în Curier Ajuns Azi)
          if (avemComandaStage && pipelineItem.stage_id === avemComandaStage.id) {
            const userMessageCount = userMessageCountByLeadId.get(lead.id) ?? 0
            kanbanItems.push(transformLeadToKanbanItem(lead, pipelineItem, tags, total, userMessageCount, userNamesMap))
            return
          }
          // Nu adăuga aici – va apărea în Curier Ajuns Azi
          return
        } else if (avemComandaStage) {
          // > 24h: mută în Avem Comanda (nu în CALL BACK etc.)
          const userMessageCount = userMessageCountByLeadId.get(lead.id) ?? 0
          const avemItem: PipelineItemWithStage = {
            ...pipelineItem,
            stage_id: avemComandaStage.id,
            stage: { id: avemComandaStage.id, name: avemComandaStage.name },
          } as any
          kanbanItems.push(transformLeadToKanbanItem(lead, avemItem, tags, total, userMessageCount, userNamesMap))
          return
        }
      }

      // Override stage (doar Vânzări): prioritate de la cea mai puternică la cea mai slabă
      // Ordine: No deal (3) > Call Back (2) > Nu răspunde (1) > Avem Comandă > Comenzi Active > stage curent
      // (Curier Trimis 5, Office Direct 4 – se aplică la fișe de serviciu; pentru lead-uri doar 3,2,1 + Avem Comandă, Comenzi Active)
      // Când callback_date sau nu_raspunde_callback_at au expirat, NU mai forțăm stage-ul – respectăm mutarea manuală (pipeline_item din DB)
      const now = Date.now()
      const callbackAt = (lead as any).callback_date ? new Date((lead as any).callback_date).getTime() : 0
      const nuRaspundeAt = (lead as any).nu_raspunde_callback_at ? new Date((lead as any).nu_raspunde_callback_at).getTime() : 0
      let finalPipelineItem = pipelineItem
      const leadNoDeal = (lead as any)?.no_deal === true || (lead as any)?.no_deal === 'true' || (lead as any)?.no_deal === 1
      const leadHasCallback = callbackAt > 0 && callbackAt > now
      const leadHasNuRaspunde = nuRaspundeAt > 0 && nuRaspundeAt > now

      if (noDealStage && leadNoDeal) {
        finalPipelineItem = {
          ...pipelineItem,
          stage_id: noDealStage.id,
          stage: { id: noDealStage.id, name: noDealStage.name },
        } as any
      }
      else if (callBackStage && leadHasCallback) {
        finalPipelineItem = {
          ...pipelineItem,
          stage_id: callBackStage.id,
          stage: { id: callBackStage.id, name: callBackStage.name },
        } as any
      }
      else if (nuRaspundeStageLead && leadHasNuRaspunde) {
        finalPipelineItem = {
          ...pipelineItem,
          stage_id: nuRaspundeStageLead.id,
          stage: { id: nuRaspundeStageLead.id, name: nuRaspundeStageLead.name },
        } as any
      }
      else if (avemComandaStage && avemComandaLeadIds.has(lead.id)) {
        finalPipelineItem = {
          ...pipelineItem,
          stage_id: avemComandaStage.id,
          stage: { id: avemComandaStage.id, name: avemComandaStage.name },
        } as any
      }
      else if (comenziActiveStage && activeOrdersLeadIds.has(lead.id)) {
        finalPipelineItem = {
          ...pipelineItem,
          stage_id: comenziActiveStage.id,
          stage: { id: comenziActiveStage.id, name: comenziActiveStage.name },
        } as any
      }
      else if (leaduriStrainaStage && isForeignPhone((lead as any).phone_number) && !leadNoDeal && !leadHasCallback && !leadHasNuRaspunde && !avemComandaLeadIds.has(lead.id) && !activeOrdersLeadIds.has(lead.id)) {
        const curStageId = pipelineItem.stage_id
        const inDefaultOrStraina = (vanzariFirstStageId && curStageId === vanzariFirstStageId) || curStageId === leaduriStrainaStage.id
        if (inDefaultOrStraina) {
          finalPipelineItem = {
            ...pipelineItem,
            stage_id: leaduriStrainaStage.id,
            stage: { id: leaduriStrainaStage.id, name: leaduriStrainaStage.name },
          } as any
        }
      }
      
      const userMessageCount = userMessageCountByLeadId.get(lead.id) ?? 0
      kanbanItems.push(transformLeadToKanbanItem(lead, finalPipelineItem, tags, total, userMessageCount, userNamesMap))
    })

    // ==================== VÂNZĂRI: STAGE "CURIER AJUNS AZI" ====================
    // Lead-uri cu Curier Trimis/Office Direct atribuit în ultimele 24h. Fără duplicate (excluse din CALL BACK etc.).
    if (isVanzari && curierAjunsAziStage) {
      try {
        const curierAjunsAziLeadIds: string[] = []
        for (const lead of sortedLeads) {
          const pipelineItem = getPipelineItem(itemMap, 'lead', lead.id)
          if (!pipelineItem) continue
          // Exclude lead-uri mutate explicit în Avem Comandă – păstrăm poziția aleasă de utilizator
          if (avemComandaStage && pipelineItem.stage_id === avemComandaStage.id) continue
          const tags = tagMap.get(lead.id) || []
          const hasCurierOrOffice = curierOfficeTagAssignedAt.has(lead.id) || hasCurierTrimisTag(tags) || hasOfficeDirectTag(tags)
          if (!hasCurierOrOffice) continue
          const tagAssignedAt = curierOfficeTagAssignedAt.get(lead.id) || (lead as any).curier_trimis_at || (lead as any).office_direct_at
          if (!isWithin24h(tagAssignedAt)) continue
          const isInArhivat = arhivatStage && pipelineItem.stage_id === arhivatStage.id
          if (isInArhivat) continue
          curierAjunsAziLeadIds.push(lead.id)
        }
        if (curierAjunsAziLeadIds.length > 0) {
          const curierAjunsAziLeads = sortedLeads.filter(l => curierAjunsAziLeadIds.includes(l.id))
          const curierAjunsAziTagMap = tagMap
          const curierAjunsAziSorted = [...curierAjunsAziLeads].sort((a, b) => {
            const tA = new Date(a.created_at || 0).getTime()
            const tB = new Date(b.created_at || 0).getTime()
            return tB - tA
          })
          curierAjunsAziSorted.forEach(lead => {
            const tags = curierAjunsAziTagMap.get(lead.id) || []
            const total = totalsData.leadTotals.get(lead.id) || 0
            const virtualPipelineItem: PipelineItemWithStage = {
              id: `virtual_curier_ajuns_azi_${lead.id}`,
              type: 'lead',
              item_id: lead.id,
              pipeline_id: context.pipelineId,
              stage_id: curierAjunsAziStage.id,
              created_at: lead.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
              stage: { id: curierAjunsAziStage.id, name: curierAjunsAziStage.name },
              isReadOnly: false
            }
            const userMessageCount = userMessageCountByLeadId.get(lead.id) ?? 0
            kanbanItems.push(transformLeadToKanbanItem(lead, virtualPipelineItem, tags, total, userMessageCount, userNamesMap))
          })
        }
      } catch (e: any) {
        console.warn('[StandardPipelineStrategy] Eroare stage Curier Ajuns Azi:', e?.message || e)
      }
    }

    // Vanzari: doar lead-uri (nu mai afișăm fișe de serviciu)
    return kanbanItems
  }
  
  /**
   * Calculate totals for leads by summing all their service files and trays
   */
  private async calculateLeadTotals(
    leadIds: string[]
  ): Promise<{ leadTotals: Map<string, number>; serviceFiles: Array<{ id: string; lead_id: string }>; trays: Array<{ id: string; service_file_id: string }> }> {
    const leadTotals = new Map<string, number>()
    const serviceFiles: Array<{ id: string; lead_id: string }> = []
    const trays: Array<{ id: string; service_file_id: string }> = []
    
    if (leadIds.length === 0) {
      return { leadTotals, serviceFiles, trays }
    }
    
    // Get all service files for these leads
    const sfResult = await fetchServiceFilesForLeads(leadIds)
    serviceFiles.push(...(sfResult.data || []))
    if (serviceFiles.length === 0) {
      return { leadTotals, serviceFiles, trays }
    }
    
    const serviceFileIds = serviceFiles.map(sf => sf.id)
    
    // Get all trays for these service files
    const traysResult = await fetchTraysForServiceFiles(serviceFileIds)
    trays.push(...(traysResult.data || []))
    if (trays.length === 0) {
      return { leadTotals, serviceFiles, trays }
    }
    
    const trayIds = trays.map(t => t.id)
    
    // Get tray items and calculate totals
    const { data: trayItems } = await fetchTrayItems(trayIds)
    
    // Get service prices
    const serviceIds = [...new Set(trayItems.map(ti => ti.service_id).filter(Boolean))] as string[]
    const { data: servicePrices } = await fetchServicePrices(serviceIds)
    
    // Calculate tray totals
    const trayTotals = calculateTrayTotals(trayIds, trayItems, servicePrices)
    
    // Aggregate to service file totals
    const sfTotals = new Map<string, number>()
    trays.forEach(t => {
      const trayTotal = trayTotals.get(t.id) || 0
      const currentTotal = sfTotals.get(t.service_file_id) || 0
      sfTotals.set(t.service_file_id, currentTotal + trayTotal)
    })
    
    // Aggregate to lead totals
    serviceFiles.forEach(sf => {
      const sfTotal = sfTotals.get(sf.id) || 0
      const currentTotal = leadTotals.get(sf.lead_id) || 0
      leadTotals.set(sf.lead_id, currentTotal + sfTotal)
    })
    
    return { leadTotals, serviceFiles, trays }
  }
  
  /**
   * Calculate totals for service files by summing all their trays
   */
  private async calculateServiceFileTotals(
    serviceFileIds: string[]
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>()
    
    if (serviceFileIds.length === 0) {
      return totals
    }
    
    // Get all trays for these service files
    const traysResult = await fetchTraysForServiceFiles(serviceFileIds)
    const trays = traysResult.data || []
    
    if (trays.length === 0) {
      return totals
    }
    
    const trayIds = trays.map(t => t.id)
    
    // Get tray items and calculate totals
    const { data: trayItems } = await fetchTrayItems(trayIds)
    
    // Get service prices
    const serviceIds = [...new Set(trayItems.map(ti => ti.service_id).filter(Boolean))] as string[]
    const { data: servicePrices } = await fetchServicePrices(serviceIds)
    
    // Calculate tray totals
    const trayTotals = calculateTrayTotals(trayIds, trayItems, servicePrices)
    
    // Aggregate to service file totals
    trays.forEach(t => {
      const trayTotal = trayTotals.get(t.id) || 0
      const currentTotal = totals.get(t.service_file_id) || 0
      totals.set(t.service_file_id, currentTotal + trayTotal)
    })
    
    return totals
  }
}

