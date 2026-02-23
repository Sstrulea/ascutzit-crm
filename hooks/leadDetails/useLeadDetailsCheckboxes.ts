/**
 * Hook pentru gestionarea checkbox-urilor în componenta LeadDetailsPanel
 */

import { useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { updateLeadWithHistory } from '@/lib/supabase/leadOperations'
import { setLeadNoDeal, setLeadCallback, setLeadNuRaspunde } from '@/lib/vanzari/leadOperations'

interface UseLeadDetailsCheckboxesProps {
  lead: {
    id: string
    stage?: string
    [key: string]: any
  } | null
  isVanzariPipeline: boolean
  stages: string[]
  
  // State-uri pentru checkbox-uri generale
  callBack: boolean
  setCallBack: React.Dispatch<React.SetStateAction<boolean>>
  callbackDate: string | null
  setCallbackDate: React.Dispatch<React.SetStateAction<string | null>>
  nuRaspunde: boolean
  setNuRaspunde: React.Dispatch<React.SetStateAction<boolean>>
  nuRaspundeCallbackAt: string | null
  setNuRaspundeCallbackAt: React.Dispatch<React.SetStateAction<string | null>>
  noDeal: boolean
  setNoDeal: React.Dispatch<React.SetStateAction<boolean>>
  
  // State-uri pentru checkbox-uri Curier
  coletAjuns: boolean
  setColetAjuns: React.Dispatch<React.SetStateAction<boolean>>
  curierRetur: boolean
  setCurierRetur: React.Dispatch<React.SetStateAction<boolean>>
  coletTrimis: boolean
  setColetTrimis: React.Dispatch<React.SetStateAction<boolean>>
  asteptRidicarea: boolean
  setAsteptRidicarea: React.Dispatch<React.SetStateAction<boolean>>
  ridicPersonal: boolean
  setRidicPersonal: React.Dispatch<React.SetStateAction<boolean>>
  
  // Funcții helper
  getLeadId: () => string | null
  handleStageChange: (newStage: string) => void
  setStage: React.Dispatch<React.SetStateAction<string>>
}

export function useLeadDetailsCheckboxes({
  lead,
  isVanzariPipeline,
  stages,
  callBack,
  setCallBack,
  callbackDate,
  setCallbackDate,
  nuRaspunde,
  setNuRaspunde,
  nuRaspundeCallbackAt,
  setNuRaspundeCallbackAt,
  noDeal,
  setNoDeal,
  coletAjuns,
  setColetAjuns,
  curierRetur,
  setCurierRetur,
  coletTrimis,
  setColetTrimis,
  asteptRidicarea,
  setAsteptRidicarea,
  ridicPersonal,
  setRidicPersonal,
  getLeadId,
  handleStageChange,
  setStage,
}: UseLeadDetailsCheckboxesProps) {
  
  // Setează starea checkbox-urilor pe baza stage-ului curent (doar în Vânzări)
  useEffect(() => {
    if (!lead) return
    setStage(lead.stage || '')
    
    if (isVanzariPipeline) {
      const currentStage = lead.stage?.toUpperCase() || ''
      
      // Verifică dacă stage-ul curent corespunde unuia dintre checkbox-uri
      if (currentStage.includes('NO DEAL') || currentStage.includes('NO-DEAL')) {
        setNoDeal(true)
        setCallBack(false)
        setNuRaspunde(false)
      } else if (currentStage.includes('CALLBACK') || currentStage.includes('CALL BACK') || currentStage.includes('CALL-BACK')) {
        setNoDeal(false)
        setCallBack(true)
        setNuRaspunde(false)
      } else if (currentStage.includes('RASPUNDE') || currentStage.includes('RASUNDE')) {
        setNoDeal(false)
        setCallBack(false)
        setNuRaspunde(true)
      } else {
        // Dacă stage-ul nu corespunde niciunui checkbox, dezactivează toate
        setNoDeal(false)
        setCallBack(false)
        setNuRaspunde(false)
      }
    }
  }, [lead?.id, lead?.stage, isVanzariPipeline, setStage, setNoDeal, setCallBack, setNuRaspunde])

  // Funcție pentru gestionarea checkbox-ului "Nu raspunde"
  const handleNuRaspundeChange = useCallback(async (checked: boolean, callbackTime?: string) => {
    const leadId = getLeadId()
    if (checked) {
      setNoDeal(false)
      setCallBack(false)
      setNuRaspunde(true)
      
      if (callbackTime) {
        setNuRaspundeCallbackAt(callbackTime)
        const callbackDate = new Date(callbackTime)
        const formattedTime = callbackDate.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
        toast.success(`Nu Răspunde - Callback programat la ${formattedTime}`)
      }
      
      if (isVanzariPipeline) {
        const nuRaspundeStage = stages.find(stage => 
          stage.toUpperCase() === 'NU RASPUNDE' || 
          stage.toUpperCase() === 'NU RASUNDE' ||
          stage.toUpperCase().includes('RASPUNDE')
        )
        if (nuRaspundeStage) {
          handleStageChange(nuRaspundeStage)
        }
      }
      
      if (leadId && callbackTime) {
        // Extract time from ISO string (e.g., "2025-02-10T15:00:00.000Z" -> "15:00")
        const timeStr = callbackTime.slice(11, 16)
        try {
          // Folosește setLeadNuRaspunde care gestionează automat mutarea în stage și logarea
          const { error } = await setLeadNuRaspunde(leadId, timeStr)
          if (error) {
            console.error('[handleNuRaspundeChange] Eroare la salvare:', error)
            toast.error('Eroare la salvarea Nu Răspunde')
          }
        } catch (e: any) {
          console.error('[handleNuRaspundeChange] Eroare la salvare:', e)
          toast.error('Eroare la salvarea Nu Răspunde')
        }
      }
    } else {
      setNuRaspunde(false)
      setNuRaspundeCallbackAt(null)
      
      if (isVanzariPipeline) {
        const leadsStage = stages.find(stage => {
          const stageUpper = stage.toUpperCase()
          return stageUpper === 'LEADS' || stageUpper === 'LEAD' ||
                 stageUpper.includes('LEADS') || stageUpper.includes('LEAD')
        })
        if (leadsStage) {
          handleStageChange(leadsStage)
          if (leadId) {
            try {
              await updateLeadWithHistory(leadId, {
                nu_raspunde: false,
                nu_raspunde_callback_at: null,
                updated_at: new Date().toISOString()
              })
              toast.success(`Nu Răspunde dezactivat. Lead mutat în ${leadsStage}`)
            } catch (e: any) {
              console.error('[handleNuRaspundeChange] Eroare la salvare:', e)
              toast.error('Eroare la salvarea Nu Răspunde')
            }
          }
        } else if (stages.length > 0) {
          const firstStage = stages[0]
          handleStageChange(firstStage)
          if (leadId) {
            try {
              await updateLeadWithHistory(leadId, {
                nu_raspunde: false,
                nu_raspunde_callback_at: null,
                updated_at: new Date().toISOString()
              })
              toast.success(`Nu Răspunde dezactivat. Lead mutat în ${firstStage}`)
            } catch (e: any) {
              console.error('[handleNuRaspundeChange] Eroare la salvare:', e)
              toast.error('Eroare la salvarea Nu Răspunde')
            }
          }
        } else {
          if (leadId) {
            try {
              await updateLeadWithHistory(leadId, {
                nu_raspunde: false,
                nu_raspunde_callback_at: null,
                updated_at: new Date().toISOString()
              })
            } catch (e: any) {
              console.error('[handleNuRaspundeChange] Eroare la salvare:', e)
              toast.error('Eroare la salvarea Nu Răspunde')
            }
          }
        }
      } else if (leadId) {
        try {
          await updateLeadWithHistory(leadId, {
            nu_raspunde: false,
            nu_raspunde_callback_at: null,
            updated_at: new Date().toISOString()
          })
        } catch (e: any) {
          console.error('[handleNuRaspundeChange] Eroare la salvare:', e)
          toast.error('Eroare la salvarea Nu Răspunde')
        }
      }
    }
  }, [isVanzariPipeline, stages, handleStageChange, setNoDeal, setCallBack, setNuRaspunde, setNuRaspundeCallbackAt, getLeadId])

  // Funcție pentru gestionarea checkbox-ului "No Deal"
  const handleNoDealChange = useCallback(async (checked: boolean) => {
    const leadId = getLeadId()
    if (checked) {
      setNuRaspunde(false)
      setCallBack(false)
      setNoDeal(true)
      if (leadId) {
        try {
          // Folosește setLeadNoDeal care curăță TOATE tag-urile și triggerele
          const { error } = await setLeadNoDeal(leadId)
          if (error) {
            toast.error('Eroare la salvarea No Deal')
            setNoDeal(false)
            return
          }
        } catch (e) {
          toast.error('Eroare la salvarea No Deal')
          setNoDeal(false)
          return
        }
      }
      if (isVanzariPipeline) {
        const noDealStage = stages.find(stage =>
          stage.toUpperCase() === 'NO DEAL' ||
          stage.toUpperCase() === 'NO-DEAL' ||
          stage.toUpperCase().includes('NO DEAL')
        )
        if (noDealStage) {
          handleStageChange(noDealStage)
          toast.success('Card mutat în ' + noDealStage + ' - Toate tag-urile și triggerele au fost șterse')
        }
      }
    } else {
      setNoDeal(false)
      if (leadId) {
        try {
          const { error } = await updateLeadWithHistory(leadId, { no_deal: false, updated_at: new Date().toISOString() })
          if (error) toast.error('Eroare la dezactivarea No Deal')
        } catch {
          toast.error('Eroare la dezactivarea No Deal')
        }
      }
    }
  }, [isVanzariPipeline, stages, handleStageChange, setNuRaspunde, setCallBack, setNoDeal, getLeadId])


  // Funcție pentru gestionarea checkbox-ului "Call Back"
  const handleCallBackChange = useCallback(async (checked: boolean) => {
    if (checked) {
      // VALIDARE: Când se activează Call Back, data trebuie să fie selectată
      if (!callbackDate) {
        toast.error('Te rog selectează o dată pentru Call Back înainte de a activa checkbox-ul')
        return // Nu activăm checkbox-ul dacă nu există dată
      }
      
      setNoDeal(false)
      setNuRaspunde(false)
      setCallBack(true)
      
      if (isVanzariPipeline) {
        const callBackStage = stages.find(stage => 
          stage.toUpperCase() === 'CALLBACK' || 
          stage.toUpperCase() === 'CALL BACK' ||
          stage.toUpperCase() === 'CALL-BACK' ||
          stage.toUpperCase().includes('CALLBACK')
        )
        if (callBackStage) {
          handleStageChange(callBackStage)
        }
      }
      
      // Folosește setLeadCallback care gestionează automat mutarea în stage și logarea
      const leadId = getLeadId()
      if (leadId && callbackDate) {
        try {
          const callbackDateObj = new Date(callbackDate)
          const { error } = await setLeadCallback(leadId, callbackDateObj)
          if (error) {
            console.error('[handleCallBackChange] Eroare la salvare:', error)
            toast.error('Eroare la salvarea Call Back')
          } else {
            toast.success('Call Back activat')
          }
        } catch (e: any) {
          console.error('[handleCallBackChange] Eroare la salvare:', e)
          toast.error('Eroare la salvarea Call Back')
        }
      }
    } else {
      // VALIDARE: Când se dezactivează Call Back, mută automat lead-ul în stage-ul "Leads"
      // Caută stage-ul "Leads" în lista de stage-uri
      const leadsStage = stages.find(stage => {
        const stageUpper = stage.toUpperCase()
        return stageUpper === 'LEADS' || 
               stageUpper === 'LEAD' ||
               stageUpper.includes('LEADS') ||
               stageUpper.includes('LEAD')
      })

      if (leadsStage) {
        // Mută lead-ul în stage-ul "Leads"
        handleStageChange(leadsStage)
        
        // Dezactivează Call Back
        setCallBack(false)
        setCallbackDate(null) // Șterge și data call back
        
        // Salvează schimbările în DB
        const leadId = getLeadId()
        if (leadId) {
          updateLeadWithHistory(leadId, {
            callback_date: null,
            updated_at: new Date().toISOString()
          }).catch((error) => {
            console.error('[handleCallBackChange] Eroare la salvare:', error)
            toast.error('Eroare la salvarea modificărilor')
          })
        }
        
        toast.success(`Call Back dezactivat. Lead mutat în ${leadsStage}`)
      } else {
        // Dacă nu găsește stage-ul "Leads", folosește primul stage disponibil
        if (stages.length > 0) {
          const firstStage = stages[0]
          handleStageChange(firstStage)
          setCallBack(false)
          setCallbackDate(null)
          
          const leadId = getLeadId()
          if (leadId) {
            updateLeadWithHistory(leadId, {
              callback_date: null,
              updated_at: new Date().toISOString()
            }).catch((error) => {
              console.error('[handleCallBackChange] Eroare la salvare:', error)
              toast.error('Eroare la salvarea modificărilor')
            })
          }
          
          toast.success(`Call Back dezactivat. Lead mutat în ${firstStage}`)
        } else {
          toast.error('Nu s-a găsit stage-ul "Leads" și nu există stage-uri disponibile')
          // Re-activează checkbox-ul dacă nu se poate muta
          setCallBack(true)
        }
      }
    }
  }, [isVanzariPipeline, stages, handleStageChange, setNoDeal, setNuRaspunde, setCallBack, callbackDate, getLeadId])

  // Funcție pentru gestionarea datei call back
  const handleCallbackDateChange = useCallback(async (date: string | null) => {
    // IMPORTANT: Actualizează state-ul IMEDIAT pentru feedback vizual
    setCallbackDate(date)
    
    // Salvează data în DB
    const leadId = getLeadId()
    if (!leadId) {
      console.warn('[handleCallbackDateChange] Lead ID lipsește')
      return
    }

    try {
      const { error } = await updateLeadWithHistory(leadId, {
        callback_date: date,
        updated_at: new Date().toISOString()
      })

      if (error) {
        console.error('[handleCallbackDateChange] Eroare la salvare:', error)
        toast.error('Eroare la salvarea datei call back')
        // Revert state-ul dacă salvare eșuează
        setCallbackDate(callbackDate)
      } else {
        console.log('[handleCallbackDateChange] Data call back salvată cu succes:', date)
        // IMPORTANT: Reîncarcă lead-ul pentru a actualiza callback_date în UI
        // Lead-ul se va actualiza automat prin useEffect care depinde de lead.callback_date
        toast.success('Data call back salvată cu succes')
      }
    } catch (error: any) {
      console.error('[handleCallbackDateChange] Eroare:', error)
      toast.error('Eroare la salvarea datei call back: ' + (error?.message || 'Eroare necunoscută'))
      // Revert state-ul dacă salvare eșuează
      setCallbackDate(callbackDate)
    }
  }, [getLeadId, setCallbackDate, callbackDate])

  return {
    // Handlers pentru checkbox-uri generale
    handleNoDealChange,
    handleNuRaspundeChange,
    handleCallBackChange,
    handleCallbackDateChange,
    
    // State-uri pentru checkbox-uri Curier (doar pentru afișare, nu sunt salvate)
    coletAjuns,
    setColetAjuns,
    curierRetur,
    setCurierRetur,
    coletTrimis,
    setColetTrimis,
    asteptRidicarea,
    setAsteptRidicarea,
    ridicPersonal,
    setRidicPersonal,
  }
}


