/**
 * Hook pentru operațiile cu tăvițe (create, update, delete, move, validate, send to pipeline)
 */

import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { useAuth } from '@/lib/contexts/AuthContext'
import { 
  listTraysForServiceFile,
  deleteTray,
  deleteTrayItem,
  splitTrayItemsToTechnician,
  splitTrayToRealTrays,
  consolidateTrayItemsForTechnician,
  updateServiceFileWithHistory,
} from '@/lib/supabase/serviceFileOperations'
import { logItemEvent, getTrayDetails, getUserDetails, getTechnicianDetails } from '@/lib/supabase/leadOperations'
import { listTrayImages } from '@/lib/supabase/imageOperations'
import { addTrayToPipeline, getReturStageId, leadHasReturTag } from '@/lib/supabase/pipelineOperations'
import { notifyTechniciansAboutNewTrays } from '@/lib/supabase/notificationOperations'
import { 
  createQuoteForLead,
  updateQuote,
  listQuotesForLead,
  listQuoteItems,
} from '@/lib/utils/preturi-helpers'
import { isVanzareTray } from '@/lib/utils/vanzare-helpers'
import { MANDATORY_TRAY_IMAGES_ENABLED } from '@/lib/featureFlags'
import type { LeadQuote, LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'

const supabase = supabaseBrowser()

interface UsePreturiTrayOperationsProps {
  leadId: string
  fisaId?: string | null
  selectedQuoteId: string | null
  selectedQuote: LeadQuote | null
  quotes: LeadQuote[]
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  isReceptiePipeline: boolean
  
  // Informații fișă/client (pentru salvare automată)
  trayDetails?: string | null
  globalDiscountPct?: number
  
  // State setters
  setQuotes: React.Dispatch<React.SetStateAction<LeadQuote[]>>
  setSelectedQuoteId: React.Dispatch<React.SetStateAction<string | null>>
  setItems: React.Dispatch<React.SetStateAction<LeadQuoteItem[]>>
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  setCreatingTray: React.Dispatch<React.SetStateAction<boolean>>
  setUpdatingTray: React.Dispatch<React.SetStateAction<boolean>>
  setDeletingTray: React.Dispatch<React.SetStateAction<boolean>>
  setMovingInstrument: React.Dispatch<React.SetStateAction<boolean>>
  setSendingTrays: React.Dispatch<React.SetStateAction<boolean>>
  setShowCreateTrayDialog: React.Dispatch<React.SetStateAction<boolean>>
  setShowEditTrayDialog: React.Dispatch<React.SetStateAction<boolean>>
  setShowMoveInstrumentDialog: React.Dispatch<React.SetStateAction<boolean>>
  setShowSendConfirmation: React.Dispatch<React.SetStateAction<boolean>>
  setShowDeleteTrayConfirmation: React.Dispatch<React.SetStateAction<boolean>>
  setTrayToDelete: React.Dispatch<React.SetStateAction<string | null>>
  setTraysAlreadyInDepartments: React.Dispatch<React.SetStateAction<boolean>>
  setNewTrayNumber: React.Dispatch<React.SetStateAction<string>>
  setEditingTrayNumber: React.Dispatch<React.SetStateAction<string>>
  setInstrumentToMove: React.Dispatch<React.SetStateAction<{ 
    instrument: { id: string; name: string }
    items: LeadQuoteItem[] 
  } | null>>
  setTargetTrayId: React.Dispatch<React.SetStateAction<string>>
  
  // State values
  newTrayNumber: string
  editingTrayNumber: string
  trayToDelete: string | null
  instrumentToMove: { 
    instrument: { id: string; name: string }
    items: LeadQuoteItem[] 
  } | null
  targetTrayId: string
  
  // Callbacks
  recalcAllSheetsTotal: (quotes: LeadQuote[]) => Promise<void>
  /** Apelat după ștergere reușită (ex. refresh Kanban). */
  onAfterDeleteTray?: () => void
}

export function usePreturiTrayOperations({
  leadId,
  fisaId,
  selectedQuoteId,
  selectedQuote,
  quotes,
  services,
  instruments,
  pipelinesWithIds,
  isReceptiePipeline,
  trayDetails,
  globalDiscountPct,
  setQuotes,
  setSelectedQuoteId,
  setItems,
  setLoading,
  setCreatingTray,
  setUpdatingTray,
  setDeletingTray,
  setMovingInstrument,
  setSendingTrays,
  setShowCreateTrayDialog,
  setShowEditTrayDialog,
  setShowMoveInstrumentDialog,
  setShowSendConfirmation,
  setShowDeleteTrayConfirmation,
  setTrayToDelete,
  setTraysAlreadyInDepartments,
  setNewTrayNumber,
  setEditingTrayNumber,
  setInstrumentToMove,
  setTargetTrayId,
  newTrayNumber,
  editingTrayNumber,
  trayToDelete,
  instrumentToMove,
  targetTrayId,
  recalcAllSheetsTotal,
  onAfterDeleteTray,
}: UsePreturiTrayOperationsProps) {
  const { user: authUser } = useAuth()

  // Funcție pentru deschiderea dialog-ului de creare tăviță
  const onAddSheet = useCallback(async () => {
    if (!fisaId) {
      console.error('[usePreturiTrayOperations] Cannot create tray - missing fisaId')
      toast.error('Nu există fișă de serviciu selectată. Te rog selectează sau creează o fișă de serviciu.')
      return
    }
    setNewTrayNumber('')
    setShowCreateTrayDialog(true)
  }, [fisaId, leadId, setNewTrayNumber, setShowCreateTrayDialog])

  // Funcție pentru crearea unei tăvițe noi. Opțional: overrides pentru creare inline (ex. din TrayTabs).
  const handleCreateTray = useCallback(async (overrides?: { number: string }) => {
    const num = (overrides?.number != null ? overrides.number : newTrayNumber).trim()
    if (!num) {
      toast.error('Introduceți numărul tăviței')
      return
    }

    // Verifică unicitate număr per fișă (nu poate exista două tăvițe cu același număr pe aceeași fișă)
    try {
      const { checkTrayAvailability } = await import('@/lib/supabase/serviceFileOperations')
      const { available, error: availError } = await checkTrayAvailability(num, { serviceFileId: fisaId || undefined })
      
      if (availError) {
        console.error('Error checking tray availability:', availError)
        toast.error('Eroare la verificarea disponibilității tăviței')
        return
      }
      
      if (!available) {
        toast.error(`O tăviță cu numărul "${num}" există deja pe această fișă. Alege un alt număr.`)
        return
      }
    } catch (err: any) {
      console.error('Error validating tray availability:', err)
      toast.error('Eroare la validarea tăviței: ' + (err?.message || 'Eroare necunoscută'))
      return
    }

    setCreatingTray(true)
    setLoading(true)
    try {
      const created = await createQuoteForLead(leadId, num, fisaId || null)
      const next = [...quotes, created].sort((a, b) => (a.sheet_index || 0) - (b.sheet_index || 0))
      setQuotes(next)
      setSelectedQuoteId(created.id)
      setItems([])
      await recalcAllSheetsTotal(next)
      if (!overrides) {
        setShowCreateTrayDialog(false)
        setNewTrayNumber('')
      }
      toast.success('Tăvița a fost creată cu succes')
      
      // Loghează evenimentul în istoric cu detalii complete
      try {
        const trayNumber = num
        
        const currentUserOpt = authUser ? { id: authUser.id, email: authUser.email ?? null } : undefined
        const [trayDetails, currentUser] = await Promise.all([
          created.id ? getTrayDetails(created.id) : Promise.resolve(null),
          getUserDetails(authUser?.id ?? null, { currentUser: currentUserOpt }),
        ])
        
        const trayLabel = trayDetails 
          ? `${trayDetails.number}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
          : trayNumber
        
        // Log pentru tăviță
        if (created.id) {
          await logItemEvent(
            'tray',
            created.id,
            `Tăvița "${trayLabel}" a fost creată`,
            'tray_created',
            {
              tray_id: created.id,
              tray_number: trayNumber,
              service_file_id: fisaId || null
            },
            {
              tray: trayDetails ? {
                id: trayDetails.id,
                number: trayDetails.number,
                status: trayDetails.status,
                service_file_id: trayDetails.service_file_id,
              } : {
                id: created.id,
                number: trayNumber,
                status: 'in_receptie',
                service_file_id: fisaId || null,
              },
              pipeline: trayDetails?.pipeline || undefined,
              stage: trayDetails?.stage || undefined,
              user: currentUser || undefined,
            },
            { currentUserId: authUser?.id, currentUserName: authUser?.email?.split('@')[0] ?? null, currentUserEmail: authUser?.email ?? null }
          )
        }
        
        if (fisaId) {
          await logItemEvent(
            'service_file',
            fisaId,
            `Tăvița "${trayLabel}" a fost creată în fișa de serviciu`,
            'tray_created',
            {
              tray_id: created.id,
              tray_number: trayNumber
            },
            {
              tray: trayDetails ? {
                id: trayDetails.id,
                number: trayDetails.number,
                status: trayDetails.status,
                service_file_id: trayDetails.service_file_id,
              } : {
                id: created.id,
                number: trayNumber,
                status: 'in_receptie',
                service_file_id: fisaId,
              },
              user: currentUser || undefined,
            },
            { currentUserId: authUser?.id, currentUserName: authUser?.email?.split('@')[0] ?? null, currentUserEmail: authUser?.email ?? null }
          )
        }
      } catch (logError) {
        console.error('Eroare la logarea creării tăviței:', logError)
        // Nu blocăm fluxul dacă logging-ul eșuează
      }
    } catch (error: any) {
      console.error('Error creating tray:', error)
      toast.error('Eroare la crearea tăviței: ' + (error?.message || 'Eroare necunoscută'))
    } finally {
      setCreatingTray(false)
      setLoading(false)
    }
  }, [
    newTrayNumber,
    fisaId,
    leadId,
    quotes,
    setCreatingTray,
    setLoading,
    setQuotes,
    setSelectedQuoteId,
    setItems,
    setShowCreateTrayDialog,
    setNewTrayNumber,
    recalcAllSheetsTotal,
  ])

  // Funcție pentru deschiderea dialog-ului de editare tăviță
  const onEditTray = useCallback(() => {
    if (!selectedQuote) return
    setEditingTrayNumber(selectedQuote.number || '')
    setShowEditTrayDialog(true)
  }, [selectedQuote, setEditingTrayNumber, setShowEditTrayDialog])

  // Funcție pentru editare tăviță inline (direct din TrayTabs) - disponibilă pentru toți utilizatorii
  const handleEditTrayInline = useCallback(async (trayId: string, newNumber: string) => {
    if (!trayId || !newNumber.trim()) {
      toast.error('Introduceți numărul tăviței')
      return
    }

    const targetTray = quotes.find(q => q.id === trayId)
    if (!targetTray) {
      toast.error('Tăvița nu a fost găsită')
      return
    }

    // Verifică dacă numărul nou este diferit de cel curent
    if (newNumber.trim() !== (targetTray.number || '')) {
      try {
        const { checkTrayAvailability } = await import('@/lib/supabase/serviceFileOperations')
        const { available, error: availError } = await checkTrayAvailability(newNumber.trim(), {
          serviceFileId: fisaId || undefined,
          excludeTrayId: trayId,
        })

        if (availError) {
          console.error('Error checking tray availability:', availError)
          toast.error('Eroare la verificarea disponibilității tăviței')
          return
        }

        if (!available) {
          toast.error(`O tăviță cu numărul "${newNumber.trim()}" există deja pe această fișă. Alege un alt număr.`)
          return
        }
      } catch (err: any) {
        console.error('Error validating tray availability:', err)
        toast.error('Eroare la validarea tăviței: ' + (err?.message || 'Eroare necunoscută'))
        return
      }
    }

    setUpdatingTray(true)
    setLoading(true)
    try {
      await updateQuote(trayId, {
        number: newNumber.trim(),
      })
      
      let updatedQuotes: any[] = []
      if (fisaId) {
        const { data: traysData } = await listTraysForServiceFile(fisaId)
        updatedQuotes = traysData || []
      } else {
        updatedQuotes = await listQuotesForLead(leadId)
      }
      
      setQuotes(updatedQuotes)
      toast.success('Tăvița a fost actualizată')
      
      // Loghează evenimentul în istoric
      try {
        const oldNumber = targetTray.number || ''
        if (oldNumber !== newNumber.trim()) {
          await logItemEvent(
            'tray',
            trayId,
            `Tăvița a fost actualizată: număr "${oldNumber}" → "${newNumber.trim()}"`,
            'tray_updated',
            {
              tray_id: trayId,
              old_number: oldNumber,
              new_number: newNumber.trim(),
            }
          )
          
          if (fisaId) {
            await logItemEvent(
              'service_file',
              fisaId,
              `Tăvița "${newNumber.trim() || oldNumber}" a fost actualizată`,
              'tray_updated',
              {
                tray_id: trayId,
                old_number: oldNumber,
                new_number: newNumber.trim(),
              }
            )
          }
        }
      } catch (logError) {
        console.error('Eroare la logarea actualizării tăviței:', logError)
      }
    } catch (error: any) {
      console.error('Error updating tray:', error)
      toast.error('Eroare la actualizarea tăviței: ' + (error?.message || 'Eroare necunoscută'))
    } finally {
      setUpdatingTray(false)
      setLoading(false)
    }
  }, [
    quotes,
    fisaId,
    leadId,
    setUpdatingTray,
    setLoading,
    setQuotes,
  ])

  // Funcție pentru salvarea editărilor tăviței
  const handleUpdateTray = useCallback(async () => {
    if (!selectedQuote || !editingTrayNumber.trim()) {
      toast.error('Introduceți numărul tăviței')
      return
    }

    // Verifică dacă numărul nou este diferit de cel curent
    if (editingTrayNumber.trim() !== (selectedQuote.number || '')) {
      // Unicitate per fișă: nici o altă tăviță pe aceeași fișă să nu aibă același număr
      try {
        const { checkTrayAvailability } = await import('@/lib/supabase/serviceFileOperations')
        const { available, error: availError } = await checkTrayAvailability(editingTrayNumber.trim(), {
          serviceFileId: fisaId || undefined,
          excludeTrayId: selectedQuote.id,
        })
        
        if (availError) {
          console.error('Error checking tray availability:', availError)
          toast.error('Eroare la verificarea disponibilității tăviței')
          return
        }
        
        if (!available) {
          toast.error(`O tăviță cu numărul "${editingTrayNumber.trim()}" există deja pe această fișă. Alege un alt număr.`)
          return
        }
      } catch (err: any) {
        console.error('Error validating tray availability:', err)
        toast.error('Eroare la validarea tăviței: ' + (err?.message || 'Eroare necunoscută'))
        return
      }
    }

    setUpdatingTray(true)
    setLoading(true)
    try {
      await updateQuote(selectedQuote.id, {
        number: editingTrayNumber.trim(),
      })
      
      let updatedQuotes: any[] = []
      if (fisaId) {
        const { data: traysData } = await listTraysForServiceFile(fisaId)
        updatedQuotes = traysData || []
      } else {
        updatedQuotes = await listQuotesForLead(leadId)
      }
      
      setQuotes(updatedQuotes)
      
      const updatedQuote = updatedQuotes.find((q: any) => q.id === selectedQuote.id)
      if (updatedQuote) {
        setSelectedQuoteId(updatedQuote.id)
      }
      
      setShowEditTrayDialog(false)
      setEditingTrayNumber('')
      toast.success('Tăvița a fost actualizată cu succes')
      
      // Loghează evenimentul în istoric
      try {
        const oldNumber = selectedQuote.number || ''
        const newNumber = editingTrayNumber.trim()
        if (oldNumber !== newNumber) {
          await logItemEvent(
            'tray',
            selectedQuote.id,
            `Tăvița a fost actualizată: număr "${oldNumber}" → "${newNumber}"`,
            'tray_updated',
            {
              tray_id: selectedQuote.id,
              old_number: oldNumber,
              new_number: newNumber,
            }
          )
          if (fisaId) {
            await logItemEvent(
              'service_file',
              fisaId,
              `Tăvița "${newNumber || oldNumber}" a fost actualizată`,
              'tray_updated',
              {
                tray_id: selectedQuote.id,
                old_number: oldNumber,
                new_number: newNumber,
              }
            )
          }
        }
      } catch (logError) {
        console.error('Eroare la logarea actualizării tăviței:', logError)
      }
    } catch (error: any) {
      console.error('Error updating tray:', error)
      toast.error('Eroare la actualizarea tăviței: ' + (error?.message || 'Eroare necunoscută'))
    } finally {
      setUpdatingTray(false)
      setLoading(false)
    }
  }, [
    selectedQuote,
    editingTrayNumber,
    fisaId,
    leadId,
    setUpdatingTray,
    setLoading,
    setQuotes,
    setSelectedQuoteId,
    setShowEditTrayDialog,
    setEditingTrayNumber,
  ])

  // Funcție pentru ștergerea unei tăvițe
  const handleDeleteTray = useCallback(async () => {
    if (!trayToDelete) return

    setDeletingTray(true)
    try {
      const trayItems = await listQuoteItems(trayToDelete, services, instruments, pipelinesWithIds)
      
      // 🔥 OPTIMIZARE: Batch delete folosind .in() în loc de N delete-uri secvențiale
      if (trayItems.length > 0) {
        const itemIds = trayItems.map((item: any) => item.id)
        const { error: deleteError } = await supabase
          .from('tray_items')
          .delete()
          .in('id', itemIds)
        
        if (deleteError) {
          console.error('Eroare la ștergerea item-urilor:', deleteError)
          toast.error('Eroare la ștergerea item-urilor din tăviță')
          return
        }
      }

      const { success, error } = await deleteTray(trayToDelete)
      
      if (error || !success) {
        toast.error('Eroare la ștergerea tăviței')
        console.error('Error deleting tray:', error)
        return
      }

      toast.success('Tăvița a fost ștearsă')
      
      // Loghează evenimentul în istoric înainte de ștergere
      try {
        const trayToDeleteObj = quotes.find((q: any) => q.id === trayToDelete)
        if (trayToDeleteObj) {
          const trayNumber = trayToDeleteObj.number || 'nesemnată'
          
          // Log pentru tăviță (înainte de ștergere)
          await logItemEvent(
            'tray',
            trayToDelete,
            `Tăvița "${trayNumber}" a fost ștearsă`,
            'tray_deleted',
            {
              tray_id: trayToDelete,
              tray_number: trayNumber,
            }
          )
          
          // Log pentru fișa de serviciu
          if (fisaId) {
            await logItemEvent(
              'service_file',
              fisaId,
              `Tăvița "${trayNumber}" a fost ștearsă din fișa de serviciu`,
              'tray_deleted',
              {
                tray_id: trayToDelete,
                tray_number: trayNumber,
              }
            )
          }
        }
      } catch (logError) {
        console.error('Eroare la logarea ștergerii tăviței:', logError)
        // Nu blocăm fluxul dacă logging-ul eșuează
      }
      
      setQuotes((prev: any) => prev.filter((q: any) => q.id !== trayToDelete))
      
      if (selectedQuoteId === trayToDelete) {
        const remainingQuotes = quotes.filter((q: any) => q.id !== trayToDelete)
        if (remainingQuotes.length > 0) {
          setSelectedQuoteId(remainingQuotes[0].id)
        } else {
          setSelectedQuoteId(null)
        }
      }

      // Sincronizează board-ul Kanban (Receptie/Departament) – același proces, altă locație
      onAfterDeleteTray?.()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tray:deleted', { detail: { trayId: trayToDelete } }))
        window.dispatchEvent(new Event('refresh'))
      }
    } catch (error) {
      console.error('Error deleting tray:', error)
      toast.error('Eroare la ștergerea tăviței')
    } finally {
      setDeletingTray(false)
      setShowDeleteTrayConfirmation(false)
      setTrayToDelete(null)
    }
  }, [
    trayToDelete,
    selectedQuoteId,
    quotes,
    services,
    instruments,
    pipelinesWithIds,
    setDeletingTray,
    setShowDeleteTrayConfirmation,
    setTrayToDelete,
    setQuotes,
    setSelectedQuoteId,
  ])

  // Funcție pentru mutarea unui instrument între tăvițe.
  // Poate fi apelată: (trayId?) din dialog, sau (trayId, group) pentru mutare directă (ex. din bandă + popover),
  // sau (trayId, group, { newTrayNumber }) pentru „Creează tăviță nouă” din popover (fără dialog).
  const handleMoveInstrument = useCallback(async (
    trayIdOverride?: string,
    groupOverride?: { instrument: { id: string; name: string }; items: any[] } | null,
    options?: { newTrayNumber?: string }
  ) => {
    const groupToUse = groupOverride ?? instrumentToMove
    let actualTrayId = trayIdOverride ?? targetTrayId

    if (!groupToUse || !actualTrayId || actualTrayId.trim() === '') {
      toast.error(groupOverride ? 'Selectează o tăviță țintă' : 'Selectează o tăviță țintă')
      return
    }

    // IMPORTANT: Salvează automat informațiile despre fișă/client înainte de mutarea instrumentelor
    // Informațiile sunt legate de service_files.details (DOAR TEXT), nu de tăvițe, deci trebuie salvate explicit
    // cash și card sunt păstrate în câmpuri separate și NU sunt modificate aici
    // IMPORTANT: Verifică dacă există deja detalii populate - dacă da, nu permitem modificarea
    if (fisaId && trayDetails !== undefined && trayDetails !== null) {
      try {
        // Verifică dacă există deja detalii populate în DB
        const { getServiceFile } = await import('@/lib/supabase/serviceFileOperations')
        const { data: existingServiceFile } = await getServiceFile(fisaId)
        if (existingServiceFile?.details) {
          // Încearcă să parseze ca JSON pentru a extrage textul
          let existingDetailsText = ''
          try {
            const parsedDetails = typeof existingServiceFile.details === 'string' 
              ? JSON.parse(existingServiceFile.details) 
              : existingServiceFile.details
            if (typeof parsedDetails === 'object' && parsedDetails !== null && parsedDetails.text !== undefined) {
              existingDetailsText = parsedDetails.text || ''
            } else {
              existingDetailsText = typeof existingServiceFile.details === 'string' ? existingServiceFile.details : ''
            }
          } catch {
            existingDetailsText = typeof existingServiceFile.details === 'string' ? existingServiceFile.details : ''
          }
          
          // Dacă există detalii populate și nu sunt goale, nu permitem salvarea
          if (existingDetailsText && existingDetailsText.trim().length > 0) {
            console.log('[handleMoveInstrument] Detaliile sunt deja populate și constante. Nu se permit modificări.')
            // Nu salvăm, dar continuăm cu mutarea instrumentului
          } else {
            // Nu există detalii populate, putem salva
            // IMPORTANT: details conține DOAR text (detalii client), nu cash/card
            // cash și card sunt în câmpuri separate și nu trebuie modificate la mutarea instrumentelor
            const { cleanDetailsForSave } = await import('@/lib/utils/serviceFileDetails')
            const detailsToSave = cleanDetailsForSave(trayDetails)

            // Nu salvăm dacă details este gol (pentru a nu suprascrie datele existente)
            // DAR continuăm cu mutarea instrumentului chiar dacă details este gol
            if (detailsToSave !== undefined && detailsToSave.trim() !== '') {
              const { error: saveError } = await updateServiceFileWithHistory(fisaId, { details: detailsToSave })
              if (saveError) {
                console.warn('[handleMoveInstrument] Eroare la salvarea automată a detaliilor fișei:', saveError)
                // Nu blocăm mutarea dacă salvarea detaliilor eșuează
              } else {
                console.log('[handleMoveInstrument] Detalii fișă salvate automat (doar text) înainte de mutare.')
              }
            }
          }
        } else {
          // Nu există detalii în DB, putem salva
          // IMPORTANT: details conține DOAR text (detalii client), nu cash/card
          // cash și card sunt în câmpuri separate și nu trebuie modificate la mutarea instrumentelor
          const { cleanDetailsForSave } = await import('@/lib/utils/serviceFileDetails')
          const detailsToSave = cleanDetailsForSave(trayDetails)

          // Nu salvăm dacă details este gol (pentru a nu suprascrie datele existente)
          // DAR continuăm cu mutarea instrumentului chiar dacă details este gol
          if (detailsToSave !== undefined && detailsToSave.trim() !== '') {
            const { error: saveError } = await updateServiceFileWithHistory(fisaId, { details: detailsToSave })
            if (saveError) {
              console.warn('[handleMoveInstrument] Eroare la salvarea automată a detaliilor fișei:', saveError)
              // Nu blocăm mutarea dacă salvarea detaliilor eșuează
            } else {
              console.log('[handleMoveInstrument] Detalii fișă salvate automat (doar text) înainte de mutare.')
            }
          }
        }
      } catch (error) {
        console.warn('[handleMoveInstrument] Eroare la salvarea automată a detaliilor fișei:', error)
        // Nu blocăm mutarea dacă salvarea detaliilor eșuează
      }
    }

    // Dacă trebuie să creezi o tăviță nouă (din dialog sau din popover cu options)
    const newNum = (actualTrayId === 'new' && options?.newTrayNumber != null) ? options.newTrayNumber.trim() : (newTrayNumber || '').trim()
    if (actualTrayId === 'new') {
      if (!newNum) {
        toast.error('Introduceți numărul tăviței')
        return
      }
      
      if (!fisaId) {
        toast.error('Fișa de serviciu nu este setată')
        return
      }

      // Verifică disponibilitatea tăviței la nivel global (număr + mărime unice)
      try {
        const { checkTrayAvailability } = await import('@/lib/supabase/serviceFileOperations')
        const { available, error: availError } = await checkTrayAvailability(newNum)
        
        if (availError) {
          console.error('Error checking tray availability:', availError)
          toast.error('Eroare la verificarea disponibilității tăviței')
          return
        }
        
        if (!available) {
          toast.error(`Tăvița cu numărul "${newNum}" este deja înregistrată în sistem. Te rog alege un alt număr.`)
          return
        }
      } catch (err: any) {
        console.error('Error validating tray availability:', err)
        toast.error('Eroare la validarea tăviței: ' + (err?.message || 'Eroare necunoscută'))
        return
      }

      setMovingInstrument(true)
      try {
        // Creează tăvița nouă
        const created = await createQuoteForLead(leadId, newNum, fisaId)
        actualTrayId = created.id
        
        // Actualizează lista de tăvițe
        const { data: updatedQuotesData } = await listTraysForServiceFile(fisaId)
        setQuotes(updatedQuotesData || [])
      } catch (createError: any) {
        setMovingInstrument(false)
        // Extrage mesajul de eroare într-un mod sigur
        let errorMsg = 'Eroare la crearea tăviței'
        try {
          if (createError?.message && typeof createError.message === 'string') {
            errorMsg = createError.message
          }
        } catch {
          // Ignoră dacă extragerea eșuează
        }
        toast.error(errorMsg)
        return
      }
    }

    setMovingInstrument(true)
    try {
      const instrumentName = groupToUse.instrument?.name || 'Instrument'
      const itemIds: string[] = []
      
      if (Array.isArray(groupToUse.items)) {
        for (let i = 0; i < groupToUse.items.length; i++) {
          const item = groupToUse.items[i]
          if (item && item.id && typeof item.id === 'string') {
            itemIds.push(item.id)
          }
        }
      }
      
      if (itemIds.length === 0) {
        setMovingInstrument(false)
        toast.error('Nu există items de mutat')
        return
      }
      
      // 🔥 OPTIMIZARE: Batch update folosind .in() în loc de N update-uri secvențiale
      // console.log('[handleMoveInstrument] STEP 1: Mutare items', itemIds.length, 'items în tăvița', actualTrayId)
      const { error } = await supabase
        .from('tray_items')
        .update({ tray_id: actualTrayId })
        .in('id', itemIds)
      
      if (error) {
        // Extrage mesajul de eroare într-un mod sigur
        const errorMsg = (error?.message && typeof error.message === 'string') 
          ? error.message 
          : (error?.code && typeof error.code === 'string')
          ? error.code
          : 'Eroare la actualizarea item-ului'
        throw new Error(`Batch update failed: ${errorMsg}`)
      }
      // console.log('[handleMoveInstrument] STEP 2: Items mutate cu succes')

      // Folosește doar string-uri simple, nu obiectul instrumentToMove
      // console.log('[handleMoveInstrument] STEP 3: Toast success')
      try {
        toast.success(`Instrumentul "${instrumentName}" și serviciile lui au fost mutate cu succes`)
      } catch (toastError) {
        // console.log('[handleMoveInstrument] Toast error (ignorat)')
      }
      
      // Loghează evenimentul în istoric cu detalii complete
      try {
        const itemsCount = itemIds.length
        
        const currentUserOpt = authUser ? { id: authUser.id, email: authUser.email ?? null } : undefined
        const [sourceTrayDetails, targetTrayDetails, currentUser] = await Promise.all([
          selectedQuoteId ? getTrayDetails(selectedQuoteId) : Promise.resolve(null),
          actualTrayId ? getTrayDetails(actualTrayId) : Promise.resolve(null),
          getUserDetails(authUser?.id ?? null, { currentUser: currentUserOpt }),
        ])
        
        // Formatează numele tăvițelor pentru mesaj
        const sourceTrayLabel = sourceTrayDetails 
          ? `${sourceTrayDetails.number}${sourceTrayDetails.status ? ` - ${sourceTrayDetails.status}` : ''}`
          : 'nesemnată'
        const targetTrayLabel = targetTrayDetails
          ? `${targetTrayDetails.number}${targetTrayDetails.status ? ` - ${targetTrayDetails.status}` : ''}`
          : 'nesemnată'
        
        // Log pentru tăvița sursă
        if (selectedQuoteId && sourceTrayDetails) {
          await logItemEvent(
            'tray',
            selectedQuoteId,
            `Instrumentul "${instrumentName}" (${itemsCount} item${itemsCount !== 1 ? 'e' : ''}) a fost mutat din tăvița "${sourceTrayLabel}"`,
            'instrument_moved',
            {
              source_tray_id: selectedQuoteId,
              target_tray_id: actualTrayId,
              instrument_name: instrumentName,
              instrument_id: groupToUse?.instrument?.id || null,
              items_count: itemsCount
            },
            {
              tray: {
                id: sourceTrayDetails.id,
                number: sourceTrayDetails.number,
                status: sourceTrayDetails.status,
                service_file_id: sourceTrayDetails.service_file_id,
              },
              pipeline: sourceTrayDetails.pipeline,
              stage: sourceTrayDetails.stage,
              user: currentUser || undefined,
            },
            { currentUserId: authUser?.id, currentUserName: authUser?.email?.split('@')[0] ?? null, currentUserEmail: authUser?.email ?? null }
          )
        }
        
        if (actualTrayId && actualTrayId !== selectedQuoteId && targetTrayDetails) {
          await logItemEvent(
            'tray',
            actualTrayId,
            `Instrumentul "${instrumentName}" (${itemsCount} item${itemsCount !== 1 ? 'e' : ''}) a fost mutat în tăvița "${targetTrayLabel}"`,
            'instrument_moved',
            {
              source_tray_id: selectedQuoteId,
              target_tray_id: actualTrayId,
              instrument_name: instrumentName,
              instrument_id: groupToUse?.instrument?.id || null,
              items_count: itemsCount
            },
            {
              tray: {
                id: targetTrayDetails.id,
                number: targetTrayDetails.number,
                status: targetTrayDetails.status,
                service_file_id: targetTrayDetails.service_file_id,
              },
              pipeline: targetTrayDetails.pipeline,
              stage: targetTrayDetails.stage,
              user: currentUser || undefined,
            },
            { currentUserId: authUser?.id, currentUserName: authUser?.email?.split('@')[0] ?? null, currentUserEmail: authUser?.email ?? null }
          )
        }
        
        // Log pentru fișa de serviciu
        if (fisaId) {
          await logItemEvent(
            'service_file',
            fisaId,
            `Instrumentul "${instrumentName}" (${itemsCount} item${itemsCount !== 1 ? 'e' : ''}) a fost mutat de la tăvița "${sourceTrayLabel}" la tăvița "${targetTrayLabel}"`,
            'instrument_moved',
            {
              source_tray_id: selectedQuoteId,
              target_tray_id: actualTrayId,
              instrument_name: instrumentName,
              instrument_id: groupToUse?.instrument?.id || null,
              items_count: itemsCount,
              source_tray: sourceTrayDetails ? {
                id: sourceTrayDetails.id,
                number: sourceTrayDetails.number,
                status: sourceTrayDetails.status,
                service_file_id: sourceTrayDetails.service_file_id,
              } : null,
              target_tray: targetTrayDetails ? {
                id: targetTrayDetails.id,
                number: targetTrayDetails.number,
                status: targetTrayDetails.status,
                service_file_id: targetTrayDetails.service_file_id,
              } : null,
            },
            {
              user: currentUser || undefined,
            },
            { currentUserId: authUser?.id, currentUserName: authUser?.email?.split('@')[0] ?? null, currentUserEmail: authUser?.email ?? null }
          )
        }
      } catch (logError) {
        console.error('Eroare la logarea mutării instrumentului:', logError)
        // Nu blocăm fluxul dacă logging-ul eșuează
      }
      
      // Actualizează lista de tăvițe și items-urile
      // console.log('[handleMoveInstrument] STEP 4: Actualizare tăvițe')
      if (fisaId) {
        const { data: updatedQuotesData } = await listTraysForServiceFile(fisaId)
        const updatedQuotes = updatedQuotesData || []
        // console.log('[handleMoveInstrument] STEP 5: setQuotes cu', updatedQuotes.length, 'tăvițe')
        setQuotes(updatedQuotes)
        
        // Dacă am creat o tăviță nouă, o selectăm automat
        if (actualTrayId && (trayIdOverride === 'new' || targetTrayId === 'new')) {
          // console.log('[handleMoveInstrument] STEP 6: Selectare tăviță nouă')
          setSelectedQuoteId(actualTrayId)
          const qi = await listQuoteItems(actualTrayId, services, instruments, pipelinesWithIds)
          // console.log('[handleMoveInstrument] STEP 7: setItems cu', qi?.length || 0, 'items')
          setItems(qi ?? [])
        } else if (selectedQuoteId) {
          // Altfel, actualizează items-urile pentru tăvița curent selectată
          const qi = await listQuoteItems(selectedQuoteId, services, instruments, pipelinesWithIds)
          setItems(qi ?? [])
        }
        
        // Verificare ștergere tăviță undefined (fără număr) - se aplică în toate pipeline-urile
        const currentUndefinedTray = updatedQuotes.find((q: any) => !q.number || q.number === '')
        
        if (currentUndefinedTray) {
          const [undefinedTrayItems, undefinedTrayImages] = await Promise.all([
            listQuoteItems(currentUndefinedTray.id, services, instruments, pipelinesWithIds),
            listTrayImages(currentUndefinedTray.id)
          ])
          
          // Dacă tăvița undefined MAI ARE items, revenim pe ea pentru a continua distribuirea
          if (undefinedTrayItems && undefinedTrayItems.length > 0) {
            // IMPORTANT: Revenim pe tăvița undefined pentru a continua distribuirea
            setSelectedQuoteId(currentUndefinedTray.id)
            setItems(undefinedTrayItems)
            // Nu ștergem tăvița, mai are items de distribuit
          } else if ((!undefinedTrayItems || undefinedTrayItems.length === 0) && (!undefinedTrayImages || undefinedTrayImages.length === 0)) {
            // Ștergem tăvița undefined DOAR dacă este goală (nu are nici items, nici imagini)
            try {
              const { success, error } = await deleteTray(currentUndefinedTray.id)
              if (success && !error) {
                const { data: refreshedQuotesData } = await listTraysForServiceFile(fisaId)
                const refreshedQuotes = refreshedQuotesData || []
                setQuotes(refreshedQuotes)
                
                // Selectează prima tăviță cu număr
                if (refreshedQuotes.length > 0) {
                  const firstNumberedTray = refreshedQuotes.find((q: any) => q.number && q.number.trim() !== '')
                  setSelectedQuoteId(firstNumberedTray?.id || refreshedQuotes[0].id)
                  const qi = await listQuoteItems(firstNumberedTray?.id || refreshedQuotes[0].id, services, instruments, pipelinesWithIds)
                  setItems(qi ?? [])
                } else {
                  setSelectedQuoteId(null)
                  setItems([])
                }
                toast.success('Toate instrumentele au fost distribuite! Tăvița nesemnată a fost ștearsă.')
              }
            } catch (deleteError: any) {
              // Eroare la ștergerea tăviței - nu blocăm fluxul principal
            }
          }
        }
      }
      
      // Resetează câmpurile pentru tăviță nouă
      // console.log('[handleMoveInstrument] STEP FINAL: Resetare state')
      setNewTrayNumber('')
      if (!groupOverride) {
        setShowMoveInstrumentDialog(false)
        setInstrumentToMove(null)
        setTargetTrayId('')
      }
    } catch (error: any) {
      // IMPORTANT: Nu folosim niciodată obiectul error direct în console.error sau toast
      // pentru a evita referințe circulare (HTMLButtonElement, FiberNode, etc.)
      
      // Extrage mesajul de eroare într-un mod sigur, fără referințe circulare
      let errorDetails = 'Eroare necunoscută'
      try {
        if (error) {
          // Încearcă să extragă mesajul într-un mod sigur
          if (typeof error === 'string') {
            errorDetails = error
          } else if (error?.message && typeof error.message === 'string') {
            errorDetails = error.message
          } else if (error?.code && typeof error.code === 'string') {
            errorDetails = `Cod eroare: ${error.code}`
          }
        }
      } catch {
        // Dacă extragerea eșuează, folosește mesajul default
        errorDetails = 'Eroare la mutarea instrumentului'
      }
      
      // Log doar string-ul, nu obiectul error
      try {
        // Folosim console.log în loc de console.error pentru a evita serializarea automată
        // console.log('[handleMoveInstrument] Eroare:', errorDetails)
      } catch {
        // Ignoră dacă logging-ul eșuează
      }
      
      // Afișează eroarea în toast
      try {
        toast.error(`Eroare la mutarea instrumentului: ${errorDetails}`)
      } catch {
        // Dacă toast.error eșuează, ignoră
      }
    } finally {
      setMovingInstrument(false)
    }
  }, [
    targetTrayId,
    instrumentToMove,
    selectedQuoteId,
    fisaId,
    leadId,
    isReceptiePipeline,
    services,
    instruments,
    pipelinesWithIds,
    newTrayNumber,
    setMovingInstrument,
    setShowMoveInstrumentDialog,
    setInstrumentToMove,
    setTargetTrayId,
    setItems,
    setQuotes,
    setSelectedQuoteId,
    setNewTrayNumber,
  ])

  // ==================== ÎMPĂRȚIRE TĂVIȚĂ (VOLUM) CĂTRE ALT TEHNICIAN ====================
  const handleSplitTrayItemsToTechnician = useCallback(async (args: {
    trayId?: string
    mode?: 'split' | 'merge'
    targetTechnicianId: string
    moves: Array<{
      trayItemId: string
      qtyMove: number
      // meta pentru istoric (opțional)
      item_type?: 'service' | 'part' | null
      name_snapshot?: string | null
      instrument_id?: string | null
      service_id?: string | null
      part_id?: string | null
      from_technician_id?: string | null
      qty_total?: number | null
      has_brands_or_serials?: boolean | null
    }>
  }) => {
    const trayId = (args.trayId || selectedQuoteId || '').trim()
    const targetTechnicianId = (args.targetTechnicianId || '').trim()
    const moves = Array.isArray(args.moves) ? args.moves : []
    const mode: 'split' | 'merge' = args.mode === 'merge' ? 'merge' : 'split'

    if (!trayId) {
      toast.error('Nu există tăviță selectată')
      return
    }
    if (!targetTechnicianId) {
      toast.error('Selectează tehnicianul țintă')
      return
    }
    if (moves.length === 0) {
      toast.error('Selectează cel puțin o poziție')
      return
    }

    // Normalizează moves (doar id + qty pentru RPC)
    const rpcMoves = moves
      .filter(m => m?.trayItemId && Number(m.qtyMove) > 0)
      .map(m => ({ trayItemId: m.trayItemId, qtyMove: Number(m.qtyMove) }))

    if (rpcMoves.length === 0) {
      toast.error('Nu există cantități valide de mutat')
      return
    }

    try {
      const { data: rpcRes, error: rpcErr } = await splitTrayItemsToTechnician({
        trayId,
        targetTechnicianId,
        moves: rpcMoves,
      })
      if (rpcErr) throw rpcErr

      // La reunire: consolidează rândurile cu același instrument/serviciu (ex: Cleste x2 + Cleste x3 → Cleste x5)
      if (mode === 'merge') {
        try {
          const { data: cons, error: consErr } = await consolidateTrayItemsForTechnician(trayId, targetTechnicianId)
          if (consErr) console.warn('[handleSplitTrayItemsToTechnician] Consolidare:', consErr)
          else if (cons?.mergedCount && cons.mergedCount > 0) {
            toast.success(`Reunire aplicată. ${cons.mergedCount} înregistrări consolidate (ex: Cleste x2 + x3 → x5).`)
          }
        } catch {
          // best effort
        }
      }

      // Refresh items UI
      try {
        const qi = await listQuoteItems(trayId, services, instruments, pipelinesWithIds)
        setItems(qi ?? [])
      } catch {
        // best effort
      }

      // ===== Istoric (items_events) =====
      try {
        const currentUserOpt = authUser ? { id: authUser.id, email: authUser.email ?? null } : undefined
        const actor = await getUserDetails(authUser?.id ?? null, { currentUser: currentUserOpt })
        const targetTech = await getTechnicianDetails(targetTechnicianId, { currentUser: currentUserOpt })
        const trayDetailsFull = await getTrayDetails(trayId)

        const byId = new Map(moves.map(m => [m.trayItemId, m]))
        const rpcMovesOut = Array.isArray((rpcRes as any)?.moves) ? ((rpcRes as any).moves as any[]) : []

        // Mapuri pentru nume (pt. istoric clar)
        const instrumentNameById = new Map<string, string>()
        for (const inst of instruments || []) {
          if (inst?.id) instrumentNameById.set(inst.id, String(inst.name || 'Instrument'))
        }
        const serviceNameById = new Map<string, string>()
        for (const s of services || []) {
          if (s?.id) serviceNameById.set(s.id, String((s as any).name || 'Serviciu'))
        }

        const enrichedMoves = rpcMovesOut.map((m: any) => {
          const srcId = String(m?.source_tray_item_id || '')
          const meta = byId.get(srcId)
          const instrumentId = (meta?.instrument_id ?? m?.instrument_id ?? null) as string | null
          const serviceId = (meta?.service_id ?? m?.service_id ?? null) as string | null
          const partId = (meta?.part_id ?? m?.part_id ?? null) as string | null
          const itemType = (meta?.item_type ?? null) as any
          const nameSnapshot = meta?.name_snapshot ?? null

          return {
            operation: m?.operation || null,
            source_tray_item_id: srcId || null,
            created_tray_item_id: m?.created_tray_item_id || null,
            qty_moved: m?.qty_moved ?? meta?.qtyMove ?? null,
            qty_before: m?.qty_before ?? meta?.qty_total ?? null,
            qty_after: m?.qty_after ?? null,
            from_technician_id: meta?.from_technician_id ?? m?.from_technician_id ?? null,
            to_technician_id: m?.to_technician_id ?? targetTechnicianId,
            instrument_id: instrumentId,
            instrument_name: instrumentId ? (instrumentNameById.get(instrumentId) || null) : null,
            service_id: serviceId,
            service_name: serviceId ? (serviceNameById.get(serviceId) || nameSnapshot || null) : (nameSnapshot || null),
            part_id: partId,
            item_type: itemType,
            name_snapshot: nameSnapshot,
          }
        })

        const msg =
          targetTech?.name
            ? `${mode === 'merge' ? 'Reunire' : 'Împărțire'} tăviță: ${enrichedMoves.length} poziție${enrichedMoves.length === 1 ? '' : 'i'} către ${targetTech.name}`
            : `${mode === 'merge' ? 'Reunire' : 'Împărțire'} tăviță: ${enrichedMoves.length} poziție${enrichedMoves.length === 1 ? '' : 'i'} către alt tehnician`

        const basePayload = {
          tray_id: trayId,
          mode,
          target_technician_id: targetTechnicianId,
          moves: enrichedMoves,
        }

        // Tray event
        const actorOpt = { currentUserId: authUser?.id, currentUserName: authUser?.email?.split('@')[0] ?? null, currentUserEmail: authUser?.email ?? null }
        await logItemEvent(
          'tray',
          trayId,
          msg,
          mode === 'merge' ? 'tray_items_merged_to_technician' : 'tray_items_split_to_technician',
          basePayload,
          {
            tray: trayDetailsFull ? {
              id: trayDetailsFull.id,
              number: trayDetailsFull.number,
              status: trayDetailsFull.status,
              service_file_id: trayDetailsFull.service_file_id,
            } : undefined,
            technician: targetTech || undefined,
            user: actor || undefined,
          },
          actorOpt
        )

        if (fisaId) {
          await logItemEvent(
            'service_file',
            fisaId,
            msg,
            mode === 'merge' ? 'tray_items_merged_to_technician' : 'tray_items_split_to_technician',
            {
              ...basePayload,
              service_file_id: fisaId,
            },
            {
              technician: targetTech || undefined,
              user: actor || undefined,
            },
            actorOpt
          )
        }
      } catch (logErr) {
        console.error('[handleSplitTrayItemsToTechnician] Eroare la logare istoric:', logErr)
      }

      toast.success(mode === 'merge' ? 'Reunirea a fost aplicată' : 'Împărțirea a fost aplicată')
    } catch (e: any) {
      // Extrage mesaj din toate formele posibile (RPC, Supabase, obiect returnat de splitTrayItemsToTechnician)
      const rawMsg =
        typeof e?.message === 'string'
          ? e.message
          : typeof e?.raw?.message === 'string'
            ? e.raw.message
            : Array.isArray(e?.details) && e.details.length > 0 && typeof e.details[0]?.message === 'string'
              ? e.details[0].message
              : null
      const errStr = [rawMsg, e?.code, e?.raw?.code].filter(Boolean).join(' ').toLowerCase()
      const isTargetEqualsCurrent =
        errStr.includes('target_equals_current_technician') || errStr.includes('target equals current')

      const msg = isTargetEqualsCurrent
        ? (mode === 'merge'
            ? 'Toate pozițiile selectate sunt deja la acest tehnician. Deselectează-le sau alege alt tehnician.'
            : 'Pozițiile selectate sunt deja la acest tehnician.')
        : rawMsg && rawMsg.trim()
          ? rawMsg.trim()
          : mode === 'merge'
            ? 'Nu s-a putut aplica reunirea. Verifică consola pentru detalii.'
            : 'Nu s-a putut aplica împărțirea. Verifică consola pentru detalii.'

      toast.error(msg)

      // Log complet pentru depanare (inclusiv la reunire)
      const safe = {
        mode,
        code: e?.code ?? e?.raw?.code ?? null,
        message: msg,
        rawMessage: rawMsg,
        details: e?.details ?? e?.raw?.details ?? null,
        hint: e?.hint ?? e?.raw?.hint ?? null,
      }
      console.error(`[handleSplitTrayItemsToTechnician] Error (mode=${mode}):`, safe, e)
    }
  }, [selectedQuoteId, services, instruments, pipelinesWithIds, setItems, fisaId])

  /** Împarte tăvița în 2 sau 3 tăvițe reale (plan: number+username, status Splited). Rezolvă pipelineId din pipeline_items. */
  const handleSplitTrayToRealTrays = useCallback(async (params: {
    originalTrayId: string
    assignments: Array<{
      technicianId: string
      displayName: string
      trayItemIds?: string[]
      items?: { trayItemId: string; quantity: number }[]
    }>
  }) => {
    const { originalTrayId, assignments } = params
    if (!originalTrayId || !assignments?.length || (assignments.length !== 2 && assignments.length !== 3)) {
      toast.error('Selectează 2 sau 3 asignări (eu + 1 sau 2 tehnicieni)')
      return
    }

    const departmentPipelineIds = pipelinesWithIds.map((p: { id: string }) => p.id)
    if (departmentPipelineIds.length === 0) {
      toast.error('Nu există pipeline de departament')
      return
    }

    try {
      const { data: pi, error: piErr } = await supabase
        .from('pipeline_items')
        .select('pipeline_id')
        .eq('type', 'tray')
        .eq('item_id', originalTrayId)
        .in('pipeline_id', departmentPipelineIds)
        .limit(1)
        .maybeSingle()

      if (piErr || !pi?.pipeline_id) {
        toast.error('Tăvița nu este în niciun pipeline de departament sau nu s-a găsit poziția.')
        return
      }

      const { data, error } = await splitTrayToRealTrays({
        originalTrayId,
        pipelineId: pi.pipeline_id,
        assignments,
      })

      if (error) throw error
      if (!data) {
        toast.error('Nu s-a returnat niciun rezultat')
        return
      }

      const newTrayCount = (data.new_tray_ids || []).length
      const technicianNames = assignments.map((a) => a.displayName).filter(Boolean)
      try {
        await logItemEvent(
          'tray',
          originalTrayId,
          `Tăvița a fost împărțită în ${newTrayCount} tăvițe reale`,
          'tray_split_to_real',
          {
            new_tray_ids: data.new_tray_ids,
            count: newTrayCount,
            technician_names: technicianNames.length > 0 ? technicianNames : undefined,
            technician_ids: assignments.map((a) => a.technicianId).filter(Boolean),
          }
        )
      } catch (e) {
        console.warn('[handleSplitTrayToRealTrays] logItemEvent:', e)
      }

      toast.success(`Împărțire aplicată: ${newTrayCount} tăvițe create.`, {
        description: 'Dacă instrumentele nu s-au distribuit în tăvițe, rulează în proiect: npx supabase db push',
      })

      setQuotes(prev => {
        const next = [...(prev || [])]
        const orig = next.find((q: LeadQuote) => q.id === originalTrayId)
        if (orig) {
          const idx = next.findIndex((q: LeadQuote) => q.id === originalTrayId)
          if (idx >= 0) next[idx] = { ...orig, status: data.status_set as any }
        }
        return next
      })

      const newIds = (data.new_tray_ids || []) as string[]
      if (newIds.length > 0 && fisaId) {
        try {
          const { data: allTrays } = await listTraysForServiceFile(fisaId)
          if (allTrays?.length) {
            setQuotes(allTrays.map((t: any) => ({ id: t.id, number: t.number, status: t.status })))
          }
        } catch {
          // reîncarcă doar lista de quotes dacă e nevoie
        }
      }

      if (selectedQuoteId === originalTrayId) {
        setSelectedQuoteId(newIds[0] ?? selectedQuoteId)
        setItems([])
      }
    } catch (e: any) {
      const rawMsg =
        e?.message ??
        e?.msg ??
        e?.details ??
        (e?.error_description && String(e.error_description))
      const msg =
        typeof rawMsg === 'string'
          ? rawMsg
          : e && typeof e === 'object'
            ? JSON.stringify(e)
            : 'Nu s-a putut aplica împărțirea.'
      toast.error(msg)
      console.error('[handleSplitTrayToRealTrays]', msg, e?.code ?? '', e?.details ?? '', e)
    }
  }, [pipelinesWithIds, setQuotes, setSelectedQuoteId, setItems, selectedQuoteId, fisaId])

  // NOTE: onChangeSheet este mutat în usePreturiEffects.ts din cauza dependențelor complexe

  // Funcție pentru validarea tăvițelor înainte de trimitere
  const validateTraysBeforeSend = useCallback(async (): Promise<{ valid: boolean; errors: string[] }> => {
    const errors: string[] = []

    // Mapare robustă pipeline (instrument.pipeline poate fi ID sau nume)
    const pipelineIdToName = new Map<string, string>()
    const pipelineNameToName = new Map<string, string>() // pentru căutare case-insensitive
    pipelinesWithIds.forEach((p: any) => {
      if (!p?.id || !p?.name) return
      pipelineIdToName.set(p.id, p.name)
      pipelineNameToName.set(String(p.name).toLowerCase(), p.name)
    })
    const resolvePipelineName = (raw: string | null): string | null => {
      if (!raw) return null
      const byId = pipelineIdToName.get(raw)
      if (byId) return byId
      const byName = pipelineNameToName.get(String(raw).toLowerCase())
      return byName || null
    }
    
    for (let i = 0; i < quotes.length; i++) {
      const tray = quotes[i]
      
      // Ignoră tăvița "unassigned" (fără număr)
      if (!tray.number || tray.number.trim() === '') {
        continue
      }

      // Ignoră tăvițele de vânzare – nu se expediază în departamente
      if (isVanzareTray(tray.number)) {
        continue
      }
      
      const trayItems = await listQuoteItems(tray.id, services, instruments, pipelinesWithIds)
      
      // Nu permite trimiterea tăvițelor goale (fără servicii/piese/instrumente) la departamente
      if (!trayItems || trayItems.length === 0) {
        errors.push(`Tăvița "${tray.number}" este goală. Adaugă cel puțin un serviciu, piesă sau instrument înainte de trimitere.`)
        continue
      }
      
      // Validare: într-o tăviță nu pot exista instrumente din departamente diferite.
      // Determinăm departamentul după instruments.pipeline (care poate fi ID sau nume pipeline).
      const instrumentIds = trayItems
        .map((item: any) => item.instrument_id)
        .filter((id: string | null) => id !== null) as string[]

      if (instrumentIds.length > 0) {
        const { data: instrumentsData, error: instrumentsError } = await supabase
          .from('instruments')
          .select('id, name, pipeline')
          .in('id', instrumentIds)

        if (instrumentsError) {
          // Nu blocăm agresiv dacă nu putem valida – dar avertizăm
          console.error('[validateTraysBeforeSend] Eroare la încărcarea instrumentelor:', instrumentsError)
          errors.push(`Tăvița ${tray.number}: Eroare la validarea departamentelor instrumentelor`)
        } else if (instrumentsData) {
          const pipelineToInstruments = new Map<string, string[]>()
          const instrumentsWithoutPipeline: string[] = []
          const unknownPipelineToInstruments = new Map<string, string[]>() // raw value -> instrument names

          for (const inst of instrumentsData as Array<{ id: string; name: string; pipeline: string | null }>) {
            const displayName = inst.name || inst.id
            if (!inst.pipeline) {
              instrumentsWithoutPipeline.push(displayName)
              continue
            }
            const resolved = resolvePipelineName(inst.pipeline)
            if (!resolved) {
              const list = unknownPipelineToInstruments.get(inst.pipeline) || []
              list.push(displayName)
              unknownPipelineToInstruments.set(inst.pipeline, list)
              continue
            }
            const list = pipelineToInstruments.get(resolved) || []
            list.push(displayName)
            pipelineToInstruments.set(resolved, list)
          }

          if (instrumentsWithoutPipeline.length > 0) {
            errors.push(
              `Tăvița ${tray.number} nu se poate expedia: instrumentele "${instrumentsWithoutPipeline.join(', ')}" nu au Pipeline setat. Setează pipeline-ul (Saloane/Horeca/Frizerii/Reparatii) și încearcă din nou.`
            )
          }

          if (unknownPipelineToInstruments.size > 0) {
            const parts = Array.from(unknownPipelineToInstruments.entries()).map(
              ([raw, names]) => `Pipeline necunoscut "${raw}" (instrumente: ${names.join(', ')})`
            )
            errors.push(
              `Tăvița ${tray.number}: ${parts.join('; ')}. Verifică valorile din Catalog → Instrumente.`
            )
          }

          if (pipelineToInstruments.size > 1) {
            const parts = Array.from(pipelineToInstruments.entries()).map(
              ([pipeline, names]) => `${pipeline}: ${names.join(', ')}`
            )
            errors.push(
              `Tăvița ${tray.number} nu se poate expedia: conține instrumente din departamente/pipeline-uri diferite. ${parts.join(' | ')}. Mută instrumentele în tăvițe separate (dropdown lângă fiecare instrument), apoi apasă Salvează înainte de Trimite tăvițele.`
            )
          }
        }
      }
      
      // Validare pentru Recepție: fiecare tăviță trebuie să aibă cel puțin o imagine (dezactivat temporar via MANDATORY_TRAY_IMAGES_ENABLED)
      if (MANDATORY_TRAY_IMAGES_ENABLED && isReceptiePipeline) {
        try {
          const images = await listTrayImages(tray.id)
          if (!images || images.length === 0) {
            errors.push(`Tăvița ${tray.number} nu are imagini. Adaugă cel puțin o imagine înainte de trimitere.`)
          }
        } catch (imageError) {
          console.error(`[validateTraysBeforeSend] Eroare la verificarea imaginilor pentru tăvița ${tray.number}:`, imageError)
          errors.push(`Tăvița ${tray.number}: Eroare la verificarea imaginilor`)
        }
      }
      
      // NOTE: Nu mai validăm dacă tăvița are servicii.
      // Tehnicienii pot atribui serviciile necesare în departament.
    }
    
    return { valid: errors.length === 0, errors }
  }, [quotes, services, instruments, pipelinesWithIds, isReceptiePipeline])

  // Funcție pentru verificarea dacă tăvițele sunt deja în departamente
  const checkTraysInDepartments = useCallback(async (trayIds: string[]) => {
    if (trayIds.length === 0) {
      setTraysAlreadyInDepartments(false)
      return
    }

    try {
      
      const { data: deptPipelines, error: deptError } = await supabase
        .from('pipelines')
        .select('id, name')
        .in('name', ['Saloane', 'Horeca', 'Frizerii', 'Reparatii'])

      if (deptError) {
        console.error('[usePreturiTrayOperations] Error getting department pipelines:', deptError?.message || 'Unknown error')
        setTraysAlreadyInDepartments(false)
        return
      }

      if (!deptPipelines || deptPipelines.length === 0) {
        setTraysAlreadyInDepartments(false)
        return
      }

      const deptPipelineIds = deptPipelines.map((p: any) => p.id)
      
      const { data: pipelineItems, error } = await supabase
        .from('pipeline_items')
        .select('item_id, pipeline_id')
        .eq('type', 'tray')
        .in('item_id', trayIds)
        .in('pipeline_id', deptPipelineIds)

      if (error) {
        console.error('[usePreturiTrayOperations] Error checking trays in departments:', error?.message || 'Unknown error')
        setTraysAlreadyInDepartments(false)
        return
      }

      const hasTraysInDepartments = pipelineItems && pipelineItems.length > 0
      setTraysAlreadyInDepartments(hasTraysInDepartments)
    } catch (error) {
      console.error('❌ Eroare la verificarea tăvițelor în departamente:', error)
      setTraysAlreadyInDepartments(false)
    }
  }, [setTraysAlreadyInDepartments])

  // Ref pentru a evita rularea dublă (double-click sau double-invoke)
  const sendAllTraysInProgressRef = useRef(false)

  // Funcție pentru trimiterea tuturor tăvițelor în pipeline-urile departamentelor
  // (MOD SIMPLIFICAT: NU mai excludem nimic – nici tăvițele de vânzare, nici cele „goale”)
  const sendAllTraysToPipeline = useCallback(async () => {
    if (sendAllTraysInProgressRef.current) return
    sendAllTraysInProgressRef.current = true

    // Șterge tăvițele unassigned (fără număr) înainte de trimitere – nu se trimit la departamente și nu trebuie să rămână pe fișă
    const unassigned = quotes.filter((q: any) => {
      const num = q?.number != null ? String(q.number).trim() : ''
      return !num
    })
    for (const q of unassigned) {
      const { success } = await deleteTray(q.id)
      if (!success) console.warn('[sendAllTraysToPipeline] Nu s-a putut șterge tăvița unassigned:', q.id)
    }
    if (unassigned.length > 0) {
      const keepIds = new Set(unassigned.map((q: any) => q.id))
      setQuotes((prev) => prev.filter((p) => !keepIds.has(p.id)))
      if (selectedQuoteId && keepIds.has(selectedQuoteId)) {
        const remaining = quotes.filter((q: any) => !keepIds.has(q.id))
        setSelectedQuoteId(remaining.length > 0 ? remaining[0].id : null)
      }
    }

    // Recalculează quotes după eventuale ștergeri (folosim state actualizat prin callback în pasul următor)
    const quotesAfterClean = unassigned.length > 0 ? quotes.filter((q: any) => (q?.number != null ? String(q.number).trim() : '') !== '') : quotes
    const traysWithNumber = quotesAfterClean.filter((q: any) => {
      const num = q?.number != null ? String(q.number).trim() : ''
      if (!num) return false
      return !isVanzareTray(num)
    })
    // Trimite doar tăvițele care au cel puțin un item (evită eroarea "tăvița X este goală" și aliniază cu numărul afișat pe card)
    const traysToSend: typeof traysWithNumber = []
    for (const q of traysWithNumber) {
      const items = await listQuoteItems(q.id, services, instruments, pipelinesWithIds)
      if (items && items.length > 0) traysToSend.push(q)
    }
    if (traysToSend.length === 0) {
      sendAllTraysInProgressRef.current = false
      toast.error('Nu există tăvițe de trimis. Adaugă tăvițe cu număr și conținut (servicii/piese) înainte de trimitere.')
      return
    }

    setSendingTrays(true)
    
    // Validează tăvițele înainte de trimitere.
    // Condiții esențiale:
    // - fiecare tăviță (cu număr, non-vânzare) are cel puțin un instrument
    // - instrumentele din tăviță au Pipeline setat și sunt toate din același departament
    // - (opțional) imagini, dacă MANDATORY_TRAY_IMAGES_ENABLED
    const validation = await validateTraysBeforeSend()
    if (!validation.valid) {
      sendAllTraysInProgressRef.current = false
      const msg =
        validation.errors.length === 1
          ? validation.errors[0]
          : `Nu poți trimite tăvițele. Probleme găsite:\n- ${validation.errors.join('\n- ')}`
      toast.error(msg, { duration: 8000 })
      setSendingTrays(false)
      return
    }

    // Salvează discountul global în service file înainte de trimitere
    if (fisaId && globalDiscountPct !== undefined) {
      try {
        await updateServiceFileWithHistory(fisaId, { global_discount_pct: globalDiscountPct })
      } catch (error) {
        console.warn('[sendAllTraysToPipeline] Eroare la salvarea discountului global:', error)
        // Nu blocăm trimiterea dacă salvarea discountului eșuează
      }
    }

    let successCount = 0
    let errorCount = 0
    const results: string[] = []

    let leadIdForRetur: string | null = null
    if (fisaId) {
      const { data: sf } = await supabase.from('service_files').select('lead_id').eq('id', fisaId).maybeSingle()
      leadIdForRetur = (sf as any)?.lead_id ?? null
    }
    let cachedLeadHasRetur: boolean | null = null
    const cachedReturStageByPipelineId: Record<string, string | null> = {}

    try {
      for (const tray of traysToSend) {
        const trayItems = await listQuoteItems(tray.id, services, instruments, pipelinesWithIds)
        // MOD SIMPLIFICAT: chiar dacă trayItems este gol, trimitem tăvița în departament.
        
        // Validare pentru Recepție: fiecare tăviță trebuie să aibă cel puțin o imagine (dezactivat temporar via MANDATORY_TRAY_IMAGES_ENABLED)
        if (MANDATORY_TRAY_IMAGES_ENABLED && isReceptiePipeline) {
          try {
            const images = await listTrayImages(tray.id)
            if (!images || images.length === 0) {
              const trayLabel = tray.number || String(traysToSend.indexOf(tray) + 1)
              results.push(`Tăvița ${trayLabel}: Nu are imagini. Adaugă cel puțin o imagine înainte de trimitere.`)
              errorCount++
              continue
            }
          } catch (imageError) {
            console.error(`[sendAllTraysToPipeline] Eroare la verificarea imaginilor pentru tăvița ${tray.id}:`, imageError)
            const trayLabel = tray.number || String(traysToSend.indexOf(tray) + 1)
            results.push(`Tăvița ${trayLabel}: Eroare la verificarea imaginilor`)
            errorCount++
            continue
          }
        }

        const instrumentIds = trayItems
          .map((item: any) => item.instrument_id)
          .filter((id: string | null) => id !== null) as string[]
        
        const pipelineCounts: Record<string, number> = {}
        
        if (instrumentIds.length > 0) {
          const { data: instrumentsData, error: instrumentsError } = await supabase
            .from('instruments')
            .select('id, name, pipeline')
            .in('id', instrumentIds)
          
          if (instrumentsError) {
            console.error('Eroare la încărcarea instrumentelor:', instrumentsError)
          } else if (instrumentsData) {
            // Creează map pentru căutare după ID sau după nume
            const pipelineIdToName = new Map<string, string>()
            const pipelineNameToName = new Map<string, string>() // pentru căutare case-insensitive
            pipelinesWithIds.forEach((p: any) => {
              pipelineIdToName.set(p.id, p.name)
              pipelineNameToName.set(p.name.toLowerCase(), p.name)
            })
            
            for (const inst of instrumentsData as Array<{ id: string; name: string; pipeline: string | null }>) {
              if (inst.pipeline) {
                // Încearcă să găsească după ID mai întâi
                let pipelineName = pipelineIdToName.get(inst.pipeline)
                
                // Dacă nu găsește după ID, încearcă după nume (case-insensitive)
                if (!pipelineName) {
                  pipelineName = pipelineNameToName.get(inst.pipeline.toLowerCase())
                }
                
                if (pipelineName) {
                  pipelineCounts[pipelineName] = (pipelineCounts[pipelineName] || 0) + 1
                }
              }
            }
          }
        }

        let targetPipelineName: string | null = null
        let maxCount = 0
        for (const [pipelineName, count] of Object.entries(pipelineCounts)) {
          if (count > maxCount) {
            maxCount = count
            targetPipelineName = pipelineName
          }
        }

        // MOD SIMPLIFICAT: dacă nu putem determina pipeline-ul din instrumente,
        // alegem un pipeline implicit (primul departament disponibil) în loc să blocăm trimiterea.
        if (!targetPipelineName) {
          const preferredDeptNames = ['Frizerii', 'Saloane', 'Horeca', 'Reparatii']
          const deptFallback =
            pipelinesWithIds.find((p: any) =>
              preferredDeptNames.map(n => n.toLowerCase()).includes(String(p.name || '').toLowerCase())
            ) || pipelinesWithIds[0]

          if (deptFallback) {
            targetPipelineName = deptFallback.name
          } else {
            // Dacă nu există niciun pipeline disponibil, doar atunci raportăm eroare
            const trayLabel = tray.number || String(traysToSend.indexOf(tray) + 1)
            results.push(`Tăvița ${trayLabel}: Nu există niciun pipeline de departament disponibil pentru trimitere.`)
            errorCount++
            continue
          }
        }

        const departmentPipeline = pipelinesWithIds.find((p: any) => 
          p.name.toLowerCase() === targetPipelineName.toLowerCase()
        )

        if (!departmentPipeline) {
          results.push(`Tăvița ${tray.number || (traysToSend.indexOf(tray) + 1)}: Pipeline "${targetPipelineName}" negăsit`)
          errorCount++
          continue
        }

        const { data: stages, error: stagesError } = await supabase
          .from('stages')
          .select('id, name, position')
          .eq('pipeline_id', departmentPipeline.id)
          .order('position', { ascending: true })

        if (stagesError || !stages || stages.length === 0) {
          results.push(`Tăvița ${tray.number || (traysToSend.indexOf(tray) + 1)}: Stage-uri negăsite`)
          errorCount++
          continue
        }

        const stagesTyped = stages as Array<{ id: string; name: string; position: number }>
        const nouaStage = stagesTyped.find((s: any) => s.name.toLowerCase() === 'noua') || stagesTyped[0]

        let stageToUse = nouaStage
        if (leadIdForRetur != null) {
          if (cachedLeadHasRetur === null) {
            cachedLeadHasRetur = await leadHasReturTag(leadIdForRetur)
          }
          if (cachedLeadHasRetur) {
            if (cachedReturStageByPipelineId[departmentPipeline.id] === undefined) {
              cachedReturStageByPipelineId[departmentPipeline.id] = await getReturStageId(departmentPipeline.id)
            }
            const returId = cachedReturStageByPipelineId[departmentPipeline.id]
            if (returId) {
              const returStage = stagesTyped.find((s) => s.id === returId)
              if (returStage) stageToUse = returStage
            }
          }
        }

        const currentUserOpt = authUser ? { id: authUser.id, email: authUser.email ?? null } : undefined
        const [sourceTrayDetails, currentUser] = await Promise.all([
          getTrayDetails(tray.id),
          getUserDetails(authUser?.id ?? null, { currentUser: currentUserOpt }),
        ])
        
        // Asigură unicitatea tăviței în departamente:
        // înainte de a o trimite în noul pipeline de departament, ștergem orice rând
        // existent pentru aceeași tăviță în ALTE pipeline-uri de departament,
        // astfel încât tăvița să nu mai apară simultan la Saloane + Reparații etc.
        try {
          const departmentNames = ['Saloane', 'Horeca', 'Frizerii', 'Reparatii']
          const departmentIds = pipelinesWithIds
            .filter((p: any) =>
              departmentNames.map((n) => n.toLowerCase()).includes(String(p.name || '').toLowerCase())
            )
            .map((p: any) => p.id)
          const otherDeptIds = departmentIds.filter((id: string) => id !== departmentPipeline.id)
          if (otherDeptIds.length > 0) {
            await supabase
              .from('pipeline_items')
              .delete()
              .eq('type', 'tray')
              .eq('item_id', tray.id)
              .in('pipeline_id', otherDeptIds)
          }
        } catch (cleanupError) {
          console.warn(
            '[sendAllTraysToPipeline] Nu am putut curăța pipeline_items vechi pentru tăviță în alte departamente:',
            cleanupError
          )
        }

        const { data: pipelineItemData, error } = await addTrayToPipeline(
          tray.id,
          departmentPipeline.id,
          stageToUse.id
        )

        if (error) {
          results.push(`Tăvița ${tray.number || (traysToSend.indexOf(tray) + 1)}: Eroare - ${(error as any).message}`)
          errorCount++
        } else {
          results.push(`Tăvița ${tray.number || (traysToSend.indexOf(tray) + 1)} → ${targetPipelineName}`)
          successCount++
          
          // Loghează repartizarea o singură dată per tăviță: la service_file când avem fișă (istoric lead/fișă), altfel la tray
          try {
            const updatedTrayDetails = await getTrayDetails(tray.id)
            const trayLabel = updatedTrayDetails
              ? `${updatedTrayDetails.number}${updatedTrayDetails.status ? ` - ${updatedTrayDetails.status}` : ''}`
              : `${tray.number || (traysToSend.indexOf(tray) + 1)}`
            const message = `Tăvița "${trayLabel}" a fost repartizată în pipeline-ul "${targetPipelineName}" (stage: ${stageToUse.name})`
            const payload = {
              tray_id: tray.id,
              source_pipeline_id: sourceTrayDetails?.pipeline?.id || null,
              target_pipeline_id: departmentPipeline.id,
              target_stage_id: stageToUse.id,
            }
            const details = {
              tray: updatedTrayDetails ? {
                id: updatedTrayDetails.id,
                number: updatedTrayDetails.number,
                status: updatedTrayDetails.status,
                service_file_id: updatedTrayDetails.service_file_id,
              } : {
                id: tray.id,
                number: tray.number || 'nesemnată',
                status: 'in_receptie',
                service_file_id: fisaId || null,
              },
              source_pipeline: sourceTrayDetails?.pipeline || undefined,
              pipeline: { id: departmentPipeline.id, name: targetPipelineName },
              stage: { id: nouaStage.id, name: nouaStage.name },
              user: currentUser || undefined,
            }
            const actorOpt = { currentUserId: authUser?.id, currentUserName: authUser?.email?.split('@')[0] ?? null, currentUserEmail: authUser?.email ?? null }
            if (fisaId) {
              await logItemEvent('service_file', fisaId, message, 'tray_moved_to_pipeline', payload, details, actorOpt)
            } else {
              await logItemEvent('tray', tray.id, message, 'tray_moved_to_pipeline', payload, details, actorOpt)
            }
          } catch (logError) {
            console.error('[sendAllTraysToPipeline] Error logging tray move:', logError)
          }
        }
      }

      // IMPORTANT: Creează conversație pentru lead indiferent de rezultat (daca cel putin o tăviță a fost trimisă)
      if (successCount > 0) {
        toast.success(`${successCount} tăviț${successCount === 1 ? 'ă transmisă' : 'e transmise'} cu succes!`)
        setTraysAlreadyInDepartments(true)
        // La Trimite Tăvițele, fișa iese din status „colet neridicat” (va apărea din nou în CURIER TRIMIS / Colet ajuns etc. după strategie)
        if (fisaId) {
          try {
            await updateServiceFileWithHistory(fisaId, { colet_neridicat: false })
          } catch (clearErr: any) {
            console.warn('[sendAllTraysToPipeline] Nu s-a putut reseta colet_neridicat:', clearErr?.message)
          }
        }
        // 🔔 NOTIFICĂ TEHNICIENII DESPRE TĂVIȚELE NOI
        try {
          // Colectează informații despre pipeline-urile în care au fost mutate tăvițele
          const traysToNotify: Array<{ id: string; number: string; pipelineId?: string; pipelineName?: string }> = []
          
          // Parcurge rezultatele pentru a găsi pipeline_id-ul pentru fiecare tăviță trimisă cu succes
          for (let i = 0; i < quotes.length; i++) {
            const tray = quotes[i]
            const result = results[i]
            
            // Verifică dacă tăvița a fost trimisă cu succes (resultul conține "→ PipelineName")
            if (result && result.includes('→')) {
              // Extrage numele pipeline-ului din rezultat
              const pipelineNameMatch = result.match(/→\s*(.+)/)
              if (pipelineNameMatch) {
                const pipelineName = pipelineNameMatch[1].trim()
                // Găsește pipeline-ul după nume
                const pipeline = pipelinesWithIds.find((p: any) => 
                  p.name.toLowerCase() === pipelineName.toLowerCase()
                )
                
                traysToNotify.push({
                  id: tray.id,
                  number: tray.number || 'Fără număr',
                  pipelineId: pipeline?.id,
                  pipelineName: pipeline?.name || pipelineName,
                })
              } else {
                traysToNotify.push({
                  id: tray.id,
                  number: tray.number || 'Fără număr',
                })
              }
            }
          }
          
          if (traysToNotify.length === 0) {
            traysToNotify.push(...quotes.map((q: any) => ({
              id: q.id,
              number: q.number || 'Fără număr',
            })))
          }
          
          const notifyResult = await notifyTechniciansAboutNewTrays({
            trays: traysToNotify,
            serviceFileId: fisaId || '',
          })
          
          if (notifyResult.notifiedCount > 0) {
            console.log(`[sendAllTraysToPipeline] ${notifyResult.notifiedCount} utilizatori notificați`)
          } else {
            console.warn(`[sendAllTraysToPipeline] Nu s-au notificat utilizatori. Erori:`, notifyResult.errors)
          }
          if (notifyResult.errors.length > 0) {
            console.warn('[sendAllTraysToPipeline] Erori notificări:', notifyResult.errors)
          }
        } catch (notifyError: any) {
          // Nu blocăm fluxul principal dacă notificările eșuează
          console.error('[sendAllTraysToPipeline] Eroare la notificări:', notifyError?.message, notifyError?.stack)
        }
      } else if (successCount > 0 && errorCount > 0) {
        toast.warning(`${successCount} trimise, ${errorCount} erori`)
        const trayIds = quotes.map((q: any) => q.id)
        await checkTraysInDepartments(trayIds)
      } else if (errorCount > 0) {
        // Afișează detalii despre erori
        const errorDetails = results.filter(r => r.includes('Eroare') || r.includes('negăsit') || r.includes('Nu s-a'))
        const detailedMessage = errorDetails.length > 0 
          ? `Erori la trimitere:\n${errorDetails.join('\n')}`
          : `Erori la trimitere: ${errorCount}`
        toast.error(detailedMessage, { duration: 8000 })
        console.error('[sendAllTraysToPipeline] Detalii erori:', results)
      }

    } catch (error: any) {
      console.error('[usePreturiTrayOperations] Error sending trays:', error?.message || 'Unknown error')
      toast.error(`Eroare: ${error?.message || 'Eroare necunoscută'}`)
    } finally {
      sendAllTraysInProgressRef.current = false
      setSendingTrays(false)
      setShowSendConfirmation(false)
    }
  }, [
    quotes,
    fisaId,
    globalDiscountPct,
    services,
    instruments,
    pipelinesWithIds,
    setSendingTrays,
    setShowSendConfirmation,
    setTraysAlreadyInDepartments,
    validateTraysBeforeSend,
    checkTraysInDepartments,
  ])

  return {
    onAddSheet,
    handleCreateTray,
    onEditTray,
    handleUpdateTray,
    handleEditTrayInline,
    handleDeleteTray,
    handleMoveInstrument,
    handleSplitTrayItemsToTechnician,
    handleSplitTrayToRealTrays,
    // NOTE: onChangeSheet este mutat în usePreturiEffects.ts
    validateTraysBeforeSend,
    checkTraysInDepartments,
    sendAllTraysToPipeline,
  } as {
    onAddSheet: () => Promise<void>
    handleCreateTray: (overrides?: { number: string }) => Promise<void>
    onEditTray: () => void
    handleUpdateTray: () => Promise<void>
    handleEditTrayInline: (trayId: string, newNumber: string) => Promise<void>
    handleDeleteTray: () => Promise<void>
    handleMoveInstrument: (trayIdOverride?: string, groupOverride?: { instrument: { id: string; name: string }; items: any[] } | null, options?: { newTrayNumber?: string }) => Promise<void>
    handleSplitTrayItemsToTechnician: (args: {
      trayId?: string
      targetTechnicianId: string
      moves: Array<{
        trayItemId: string
        qtyMove: number
        item_type?: 'service' | 'part' | null
        name_snapshot?: string | null
        instrument_id?: string | null
        service_id?: string | null
        part_id?: string | null
        from_technician_id?: string | null
        qty_total?: number | null
        has_brands_or_serials?: boolean | null
      }>
    }) => Promise<void>
    handleSplitTrayToRealTrays: (params: {
      originalTrayId: string
      assignments: Array<{ technicianId: string; displayName: string; trayItemIds: string[] }>
    }) => Promise<void>
    validateTraysBeforeSend: () => Promise<{ valid: boolean; errors: string[] }>
    checkTraysInDepartments: (trayIds: string[]) => Promise<void>
    sendAllTraysToPipeline: () => Promise<void>
  }
}

