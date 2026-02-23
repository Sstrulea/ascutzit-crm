/**
 * Hook pentru acțiunile specifice pipeline-urilor departament
 */

import { useCallback } from 'react'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { moveItemToStage, addServiceFileToPipeline } from '@/lib/supabase/pipelineOperations'
import { startWorkSession } from '@/lib/supabase/workSessionOperations'
import { toast } from 'sonner'
import { logItemEvent, getTrayDetails, getTechnicianDetails, getUserDetails, getPipelineStageDetails } from '@/lib/supabase/leadOperations'
import { listTrayImages } from '@/lib/supabase/imageOperations'
import { MANDATORY_TRAY_IMAGES_ENABLED } from '@/lib/featureFlags'

// Helper function to normalize stage names for comparison (remove diacritics)
const normalizeStage = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

interface UseLeadDetailsDepartmentActionsProps {
  lead: {
    id: string
    stage?: string
    [key: string]: any
  } | null
  stages: string[]
  isDepartmentPipeline: boolean
  handleStageChange: (newStage: string) => void
  setStage: React.Dispatch<React.SetStateAction<string>>
  onRefresh?: () => void
  onItemStageUpdated?: (itemId: string, stageName: string, stageId: string) => void
  user: { id: string } | null
}

export function useLeadDetailsDepartmentActions({
  lead,
  stages,
  isDepartmentPipeline,
  handleStageChange,
  setStage,
  onRefresh,
  onItemStageUpdated,
  user,
}: UseLeadDetailsDepartmentActionsProps) {

  // Asigură istoric pentru membri: logăm schimbarea de stage în items_events (tab-ul Istoric citește items_events, nu stage_history).
  const logTrayStageChanged = useCallback(
    async (args: { leadAny: any; toStageId: string; toStageName: string; fromStageId?: string | null }) => {
      const leadAny = args.leadAny
      if (!leadAny?.id || !leadAny?.pipelineId) return

      try {
        const currentUserOpt = user ? { id: user.id, email: (user as any).email ?? null } : undefined
        const actorOpt = user
          ? {
              currentUserId: user.id,
              currentUserName: (user as any).email?.split?.('@')[0] ?? null,
              currentUserEmail: (user as any).email ?? null,
            }
          : undefined

        const [trayDetails, currentUserDetails] = await Promise.all([
          getTrayDetails(leadAny.id),
          user?.id ? getUserDetails(user.id, { currentUser: currentUserOpt }) : Promise.resolve(null),
        ])

        const trayLabel = trayDetails
          ? `${trayDetails.number}${trayDetails.size ? ` (${trayDetails.size})` : ''}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
          : leadAny?.trayNumber
            ? `${leadAny.trayNumber}${leadAny.traySize ? ` (${leadAny.traySize})` : ''}`
            : 'nesemnată'

        let pipelineNameForLog = leadAny.pipelineName
        if (!pipelineNameForLog && leadAny.pipelineId) {
          const { pipeline } = await getPipelineStageDetails(leadAny.pipelineId, args.toStageId)
          pipelineNameForLog = pipeline?.name ?? 'Pipeline necunoscut'
        }
        pipelineNameForLog = pipelineNameForLog || 'Pipeline necunoscut'

        const isInLucru = /lucru|in.?lucru/i.test(args.toStageName || '')
        const actorName = (currentUserDetails as any)?.name ?? (currentUserDetails as any)?.display_name ?? (user as any)?.email?.split?.('@')[0] ?? 'Cineva'
        const stageChangeMessage = isInLucru
          ? `${actorName} a luat tăvița "${trayLabel}" în lucru`
          : `Tăvița "${trayLabel}" a fost mutată în stage-ul "${args.toStageName}"`

        await logItemEvent(
          'tray',
          leadAny.id,
          stageChangeMessage,
          'tray_stage_changed',
          {
            from_stage_id: args.fromStageId ?? leadAny.stageId ?? null,
            to_stage_id: args.toStageId,
          },
          {
            tray: trayDetails
              ? {
                  id: trayDetails.id,
                  number: trayDetails.number,
                  size: trayDetails.size,
                  status: trayDetails.status,
                  service_file_id: trayDetails.service_file_id,
                }
              : undefined,
            pipeline: {
              id: leadAny.pipelineId,
              name: pipelineNameForLog,
            },
            stage: {
              id: args.toStageId,
              name: args.toStageName,
            },
            user: (currentUserDetails as any) || undefined,
          },
          actorOpt
        )
      } catch (e) {
        console.error('[logTrayStageChanged] Error logging:', e)
      }
    },
    [user]
  )

  // Handler pentru butonul "Finalizare" (mută în stage-ul Finalizare)
  const handleFinalizare = useCallback(async () => {
    const leadAny = lead as any
    
    console.log('[handleFinalizare] Available stages:', { stages, leadPipelineId: leadAny?.pipelineId })
    
    const finalizareStage = stages.find(s => 
      normalizeStage(s) === normalizeStage('FINALIZATA')
    )
    
    console.log('[handleFinalizare] Looking for FINALIZATA stage:', {
      availableStages: stages,
      foundStage: finalizareStage,
      normalizedSearch: normalizeStage('FINALIZATA')
    })
    
    if (!finalizareStage) {
      toast.error('Stage-ul FINALIZATA nu există în acest pipeline')
      console.error('[handleFinalizare] Stage not found in list:', {
        stageName: 'FINALIZATA',
        availableStages: stages,
        normalizedAvailable: stages.map(s => ({ original: s, normalized: normalizeStage(s) }))
      })
      return
    }

    if (isDepartmentPipeline && leadAny?.type === 'tray' && leadAny?.pipelineId) {
      try {
        // Verifică dacă pipeline-ul este unul dintre departamentele menționate (Horeca, Frizerii, Saloane, Reparații)
        const pipelineName = (leadAny.pipelineName || '').toLowerCase()
        const isTargetDepartment = 
          pipelineName.includes('horeca') ||
          pipelineName.includes('frizerii') ||
          pipelineName.includes('saloane') ||
          pipelineName.includes('reparatii') ||
          pipelineName.includes('reparații')
        
        // Validare: tăvița trebuie să aibă cel puțin o imagine înainte de finalizare (dezactivat temporar via MANDATORY_TRAY_IMAGES_ENABLED)
        if (MANDATORY_TRAY_IMAGES_ENABLED && isTargetDepartment) {
          try {
            const images = await listTrayImages(leadAny.id)
            if (!images || images.length === 0) {
              toast.error('Nu poți finaliza tăvița fără cel puțin o imagine. Adaugă o imagine înainte de finalizare.')
              return
            }
          } catch (imageError) {
            console.error('[handleFinalizare] Eroare la verificarea imaginilor:', imageError)
            toast.error('Eroare la verificarea imaginilor. Te rugăm să încerci din nou.')
            return
          }
        }
        
        const supabase = supabaseBrowser()
        
        console.log('[handleFinalizare] Querying stage in DB:', {
          pipelineId: leadAny.pipelineId,
          stageName: finalizareStage
        })
        
        const { data: stageData, error: stageError } = await supabase
          .from('stages')
          .select('id')
          .eq('pipeline_id', leadAny.pipelineId)
          .eq('name', finalizareStage)
          .single()
        
        console.log('[handleFinalizare] Stage query result:', {
          data: stageData,
          error: stageError,
          errorMessage: stageError?.message,
          errorCode: stageError?.code
        })
        
        if (stageError || !stageData) {
          console.error('Error finding stage:', { error: stageError, stageName: finalizareStage, pipelineId: leadAny.pipelineId })
          toast.error('Nu s-a putut găsi stage-ul în baza de date')
          return
        }

        const { error } = await moveItemToStage(
          'tray',
          leadAny.id,
          leadAny.pipelineId,
          (stageData as any).id,
          leadAny.stageId
        )
        
        if (error) {
          toast.error('Eroare la mutarea cardului')
          console.error('Error moving to Finalizare:', error)
          return
        }

        // Atribuie tehnicianul întregii tăvițe (trays.technician_id)
        if (user?.id) {
          await supabase.from('trays').update({ technician_id: user.id } as any).eq('id', leadAny.id)
        }

        toast.success('Card mutat în FINALIZATA')
        setStage(finalizareStage)
        onItemStageUpdated?.(leadAny.id, finalizareStage, (stageData as any).id)
        logTrayStageChanged({
          leadAny,
          toStageId: (stageData as any).id,
          toStageName: finalizareStage,
          fromStageId: leadAny.stageId ?? null,
        })
      } catch (error) {
        console.error('Error moving to Finalizare:', error)
        toast.error('Eroare la mutarea cardului')
      }
    } else {
      handleStageChange(finalizareStage)
      toast.success('Card mutat în Finalizare')
      onRefresh?.()
    }
  }, [lead, stages, isDepartmentPipeline, handleStageChange, setStage, onRefresh, onItemStageUpdated, logTrayStageChanged])

  // Handler pentru butonul "Aștept piese" (pentru Reparații)
  const handleAsteptPiese = useCallback(async () => {
    const leadAny = lead as any
    
    const asteptPieseStage = stages.find(s => 
      normalizeStage(s) === normalizeStage('ASTEPT PIESE')
    )
    
    if (!asteptPieseStage) {
      toast.error('Stage-ul ASTEPT PIESE nu există în acest pipeline')
      return
    }

    if (isDepartmentPipeline && leadAny?.type === 'tray' && leadAny?.pipelineId) {
      try {
        const supabase = supabaseBrowser()
        const { data: stageData, error: stageError } = await supabase
          .from('stages')
          .select('id')
          .eq('pipeline_id', leadAny.pipelineId)
          .eq('name', asteptPieseStage)
          .single()
        
        if (stageError || !stageData) {
          console.error('Error finding stage:', stageError, 'Looking for:', asteptPieseStage)
          toast.error('Nu s-a putut găsi stage-ul în baza de date')
          return
        }

        const { error } = await moveItemToStage(
          'tray',
          leadAny.id,
          leadAny.pipelineId,
          (stageData as any).id,
          leadAny.stageId
        )
        
        if (error) {
          toast.error('Eroare la mutarea cardului')
          console.error('Error moving to Astept piese:', error)
          return
        }
        
        toast.success('Card mutat în ASTEPT PIESE')
        setStage(asteptPieseStage)
        onItemStageUpdated?.(leadAny.id, asteptPieseStage, (stageData as any).id)
        logTrayStageChanged({
          leadAny,
          toStageId: (stageData as any).id,
          toStageName: asteptPieseStage,
          fromStageId: leadAny.stageId ?? null,
        })
      } catch (error) {
        console.error('Error moving to Astept piese:', error)
        toast.error('Eroare la mutarea cardului')
      }
    } else {
      handleStageChange(asteptPieseStage)
      toast.success('Card mutat în Aștept piese')
      onRefresh?.()
    }
  }, [lead, stages, isDepartmentPipeline, handleStageChange, setStage, onRefresh, onItemStageUpdated, logTrayStageChanged])

  // Handler pentru butonul "În așteptare" (pentru Saloane/Horeca/Frizerii)
  const handleInAsteptare = useCallback(async () => {
    const leadAny = lead as any
    
    const inAsteptareStage = stages.find(s => 
      normalizeStage(s) === normalizeStage('IN ASTEPTARE')
    )
    
    if (!inAsteptareStage) {
      toast.error('Stage-ul IN ASTEPTARE nu există în acest pipeline')
      return
    }

    if (isDepartmentPipeline && leadAny?.type === 'tray' && leadAny?.pipelineId) {
      try {
        const supabase = supabaseBrowser()
        const { data: stageData, error: stageError } = await supabase
          .from('stages')
          .select('id')
          .eq('pipeline_id', leadAny.pipelineId)
          .eq('name', inAsteptareStage)
          .single()
        
        if (stageError || !stageData) {
          console.error('Error finding stage:', stageError, 'Looking for:', inAsteptareStage)
          toast.error('Nu s-a putut găsi stage-ul în baza de date')
          return
        }

        const { error } = await moveItemToStage(
          'tray',
          leadAny.id,
          leadAny.pipelineId,
          (stageData as any).id,
          leadAny.stageId
        )
        
        if (error) {
          toast.error('Eroare la mutarea cardului')
          console.error('Error moving to In asteptare:', error)
          return
        }

        // Atribuie tehnicianul întregii tăvițe (trays.technician_id)
        if (user?.id) {
          await supabase.from('trays').update({ technician_id: user.id } as any).eq('id', leadAny.id)
        }

        toast.success('Card mutat în IN ASTEPTARE')
        setStage(inAsteptareStage)
        onItemStageUpdated?.(leadAny.id, inAsteptareStage, (stageData as any).id)
        logTrayStageChanged({
          leadAny,
          toStageId: (stageData as any).id,
          toStageName: inAsteptareStage,
          fromStageId: leadAny.stageId ?? null,
        })
      } catch (error) {
        console.error('Error moving to In asteptare:', error)
        toast.error('Eroare la mutarea cardului')
      }
    } else {
      handleStageChange(inAsteptareStage)
      toast.success('Card mutat în În așteptare')
      onRefresh?.()
    }
  }, [lead, stages, isDepartmentPipeline, handleStageChange, setStage, onRefresh, onItemStageUpdated, logTrayStageChanged])

  // Handler pentru butonul "În lucru" (atribuie tăvița utilizatorului curent)
  const handleInLucru = useCallback(async () => {
    const leadAny = lead as any
    
    const inLucruStage = stages.find(s =>
      normalizeStage(s) === normalizeStage('IN LUCRU')
    )
    
    if (!inLucruStage) {
      toast.error('Stage-ul IN LUCRU nu există în acest pipeline')
      return
    }

    if (isDepartmentPipeline && leadAny?.type === 'tray' && leadAny?.pipelineId) {
      try {
        if (!user?.id) {
          toast.error('Utilizatorul nu este autentificat')
          return
        }

        const supabase = supabaseBrowser()
        const { data: stageData, error: stageError } = await supabase
          .from('stages')
          .select('id')
          .eq('pipeline_id', leadAny.pipelineId)
          .eq('name', inLucruStage)
          .single()
        
        if (stageError || !stageData) {
          console.error('Error finding stage:', stageError, 'Looking for:', inLucruStage)
          toast.error('Nu s-a putut găsi stage-ul în baza de date')
          return
        }

        // Verifică dacă tăvița este deja în "IN LUCRU"
        const isAlreadyInLucru = leadAny.stageId === (stageData as any).id || 
          normalizeStage(leadAny.stage || '') === normalizeStage('IN LUCRU')

        // Mută în "IN LUCRU" doar dacă nu este deja acolo (pentru a păstra timpul "în lucru")
        if (!isAlreadyInLucru) {
          const { error: moveError } = await moveItemToStage(
            'tray',
            leadAny.id,
            leadAny.pipelineId,
            (stageData as any).id,
            leadAny.stageId
          )
          
          if (moveError) {
            toast.error('Eroare la mutarea cardului')
            console.error('Error moving to In lucru:', moveError)
            return
          }
        } else {
          console.log(`[handleInLucru] Tăvița ${leadAny.id} este deja în IN LUCRU, păstrăm timpul existent`)
        }

        // Obține tehnicianul anterior de pe tăviță (trays.technician_id)
        const { data: prevTrayRow } = await supabase
          .from('trays')
          .select('technician_id')
          .eq('id', leadAny.id)
          .maybeSingle()
        const previousTechnicianId = (prevTrayRow as any)?.technician_id || null

        // Atribuie tehnicianul întregii tăvițe (trays.technician_id), nu per serviciu
        const { error: updateTrayError } = await supabase
          .from('trays')
          .update({ technician_id: user.id } as any)
          .eq('id', leadAny.id)
        if (updateTrayError) {
          console.error('Error assigning tray to user:', updateTrayError)
          toast.error('Eroare la atribuirea tăviței')
          return
        }
        console.log(`[handleInLucru] Updated tray ${leadAny.id} with technician_id=${user.id}`)

        // [FOST: atribuire per serviciu – acum tehnicianul se atribuie la nivel de tăviță]
        // const { data: existingItems, error: checkError } = await supabase
        //   .from('tray_items').select('id').eq('tray_id', leadAny.id)
        // if (hasItems) {
        //   await supabase.from('tray_items').update({ technician_id: user.id }).eq('tray_id', leadAny.id)
        // } else {
        //   await supabase.from('tray_items').insert({ tray_id: leadAny.id, technician_id: user.id, qty: 1, notes: '...' })
        // }

        // Creează sesiune de lucru pentru calculul precis al timpului
        try {
          const { data: sessionId, error: sessionError } = await startWorkSession(
            leadAny.id,
            user.id,
            `Sesiune pornită la preluare tăviță în In Lucru`
          )
          if (sessionError) {
            const err = sessionError as any
            console.error('[handleInLucru] Error starting work session:', err?.message ?? err?.msg ?? err?.details ?? sessionError)
            // Nu blocăm - tăvița a fost mutată cu succes
          } else {
            console.log(`[handleInLucru] Work session started: ${sessionId}`)
          }
        } catch (sessionErr) {
          console.error('[handleInLucru] Error starting work session:', sessionErr)
          // Nu blocăm fluxul
        }
        
        // Loghează mutarea în "In Lucru" și atribuirea tehnicianului (fără Auth – folosim user din props)
        try {
          const currentUserOpt = user ? { id: user.id, email: (user as any).email ?? null } : undefined
          const [trayDetails, previousTechnicianDetails, newTechnicianDetails, currentUserDetails] = await Promise.all([
            getTrayDetails(leadAny.id),
            previousTechnicianId ? getTechnicianDetails(previousTechnicianId) : Promise.resolve(null),
            getTechnicianDetails(user.id, { currentUser: currentUserOpt }),
            getUserDetails(user.id, { currentUser: currentUserOpt }),
          ])
          
          const trayLabel = trayDetails 
            ? `${trayDetails.number}${trayDetails.size ? ` (${trayDetails.size})` : ''}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
            : 'nesemnată'
          
          // Rezolvă numele pipeline-ului din pipelineId dacă lipsește pe card (evită „Pipeline necunoscut” în istoric)
          let pipelineNameForLog = leadAny.pipelineName
          if (!pipelineNameForLog && leadAny.pipelineId) {
            const { pipeline } = await getPipelineStageDetails(leadAny.pipelineId, (stageData as any).id)
            pipelineNameForLog = pipeline?.name ?? 'Pipeline necunoscut'
          }
          pipelineNameForLog = pipelineNameForLog || 'Pipeline necunoscut'

          const actorOpt = user ? {
            currentUserId: user.id,
            currentUserName: (user as any).email?.split?.('@')[0] ?? null,
            currentUserEmail: (user as any).email ?? null,
          } : undefined
          
          const inLucruActorName = newTechnicianDetails?.name ?? (user as any)?.email?.split?.('@')[0] ?? 'Cineva'
          await logItemEvent(
            'tray',
            leadAny.id,
            `${inLucruActorName} a luat tăvița "${trayLabel}" în lucru`,
            'tray_stage_changed',
            {
              from_stage_id: leadAny.stageId || null,
              to_stage_id: (stageData as any).id,
            },
            {
              tray: trayDetails ? {
                id: trayDetails.id,
                number: trayDetails.number,
                size: trayDetails.size,
                status: trayDetails.status,
                service_file_id: trayDetails.service_file_id,
              } : undefined,
              pipeline: {
                id: leadAny.pipelineId,
                name: pipelineNameForLog,
              },
              stage: {
                id: (stageData as any).id,
                name: inLucruStage,
              },
              technician: newTechnicianDetails ? {
                id: newTechnicianDetails.id,
                name: newTechnicianDetails.name,
                email: newTechnicianDetails.email,
              } : undefined,
              user: currentUserDetails || undefined,
            },
            actorOpt
          )
          
          if (previousTechnicianId !== user.id) {
            await logItemEvent(
              'tray',
              leadAny.id,
              `Tehnician "${newTechnicianDetails?.name || (user as any).email || 'user necunoscut'}" a luat tăvița "${trayLabel}" în lucru`,
              'technician_assigned',
              {},
              {
                tray: trayDetails ? {
                  id: trayDetails.id,
                  number: trayDetails.number,
                  size: trayDetails.size,
                  status: trayDetails.status,
                  service_file_id: trayDetails.service_file_id,
                } : undefined,
                previous_technician: previousTechnicianDetails ? {
                  id: previousTechnicianDetails.id,
                  name: previousTechnicianDetails.name,
                  email: previousTechnicianDetails.email,
                } : undefined,
                technician: newTechnicianDetails ? {
                  id: newTechnicianDetails.id,
                  name: newTechnicianDetails.name,
                  email: newTechnicianDetails.email,
                } : undefined,
                pipeline: {
                  id: leadAny.pipelineId,
                  name: pipelineNameForLog,
                },
                stage: {
                  id: (stageData as any).id,
                  name: inLucruStage,
                },
                user: currentUserDetails || undefined,
              },
              actorOpt
            )
          }
        } catch (logError) {
          console.error('[handleInLucru] Error logging:', logError)
          // Nu blocăm fluxul dacă logging-ul eșuează
        }

        // Mută și cardul fișei (service_file) din pipeline-ul "Recepție" în stage-ul "În lucru" al pipeline-ului departamentului
        try {
          // Obține service_file_id din tăviță
          const { data: trayData, error: trayFetchError } = await supabase
            .from('trays')
            .select('service_file_id')
            .eq('id', leadAny.id)
            .single()
          
          if (trayFetchError || !trayData?.service_file_id) {
            console.warn('Nu s-a putut obține service_file_id din tăviță:', trayFetchError)
          } else {
            // IMPORTANT: Adaugă mai întâi cardul fișei în pipeline-ul departamentului
            // Apoi șterge din Recepție doar dacă adăugarea a reușit
            const { data: addResult, error: addServiceFileError } = await addServiceFileToPipeline(
              trayData.service_file_id,
              leadAny.pipelineId, // Pipeline-ul departamentului
              (stageData as any).id // Stage-ul "În lucru" din pipeline-ul departamentului
            )
            
            if (addServiceFileError || !addResult) {
              console.error('Eroare la adăugarea cardului fișei în pipeline-ul departamentului:', addServiceFileError)
              toast.error('Eroare la mutarea cardului fișei în departament')
              // Nu continuăm cu ștergerea dacă adăugarea a eșuat
            } else {
              // Doar dacă adăugarea a reușit, șterge din Recepție
              const { data: receptiePipeline, error: receptieError } = await supabase
                .from('pipelines')
                .select('id')
                .ilike('name', '%receptie%')
                .single()
              
              if (!receptieError && receptiePipeline) {
                // Șterge pipeline_item-ul din pipeline-ul "Recepție" (dacă există)
                const { error: deleteError } = await supabase
                  .from('pipeline_items')
                  .delete()
                  .eq('type', 'service_file')
                  .eq('item_id', trayData.service_file_id)
                  .eq('pipeline_id', receptiePipeline.id)
                
                if (deleteError) {
                  console.warn('Eroare la ștergerea cardului fișei din Recepție:', deleteError)
                  // Nu aruncăm eroare - cardul a fost deja adăugat în departament
                }
              }
            }
          }
        } catch (serviceFileError) {
          console.error('Eroare la mutarea cardului fișei:', serviceFileError)
          toast.error('Eroare la mutarea cardului fișei')
        }

        toast.success('Tăvița a fost atribuită și mutată în IN LUCRU')
        setStage(inLucruStage)
        onItemStageUpdated?.(leadAny.id, inLucruStage, (stageData as any).id)
      } catch (error) {
        console.error('Error moving to In lucru:', error)
        toast.error('Eroare la mutarea cardului')
      }
    } else {
      handleStageChange(inLucruStage)
      toast.success('Card mutat în IN LUCRU')
      onRefresh?.()
    }
  }, [lead, stages, isDepartmentPipeline, handleStageChange, setStage, onRefresh, onItemStageUpdated, user])

  return {
    handleFinalizare,
    handleAsteptPiese,
    handleInAsteptare,
    handleInLucru,
  }
}


