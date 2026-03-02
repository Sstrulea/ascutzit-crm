/**
 * Hook pentru gestionarea service files-urilor în componenta LeadDetailsPanel
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { 
  createServiceFile,
  getNextGlobalServiceFileNumber,
  type ServiceFile,
} from '@/lib/supabase/serviceFileOperations'
import { logLeadEvent } from '@/lib/supabase/leadOperations'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { useAuth } from '@/lib/contexts/AuthContext'

interface UseLeadDetailsServiceFilesProps {
  getLeadId: () => string | null
  setServiceSheets: React.Dispatch<React.SetStateAction<any[]>>
  setSelectedFisaId: React.Dispatch<React.SetStateAction<string | null>>
  setLoadingSheets: React.Dispatch<React.SetStateAction<boolean>>
  loadServiceSheets: (leadId: string) => Promise<any[]>
}

// Funcție helper pentru crearea unei fișe de serviciu (Faza 5: currentUserId opțional – evită getSession())
const createServiceSheet = async (leadId: string, name?: string, currentUserId?: string | null): Promise<string> => {
  // Dacă numărul există deja: o singură încercare cu următorul număr (fără buclă, fără crearea a mai multor fișe).
  const isDuplicateError = (msg: string) =>
    msg.includes('există deja') || msg.includes('creată deja') || msg.includes('race condition')

  let currentNumber: number | null = null
  if (!name) {
    const { data: nextGlobalNumber, error: numberError } = await getNextGlobalServiceFileNumber()
    if (numberError || nextGlobalNumber === null) {
      throw numberError || new Error('Nu s-a putut obține numărul următor pentru fișă')
    }
    currentNumber = nextGlobalNumber
  }

  const tryCreate = async (num: string): Promise<{ data: ServiceFile | null; error: any }> => {
    return createServiceFile({
      lead_id: leadId,
      number: num,
      date: new Date().toISOString().split('T')[0],
      status: 'noua',
      notes: null,
    })
  }

  let result = await tryCreate(!name ? `Fisa ${currentNumber}` : name)

  // Pentru auto-number: la duplicate, o singură încercare cu un număr random mai mare decât cel care a dat eroarea
  if (result.error && !name && isDuplicateError(String(result.error?.message || ''))) {
    const randomOffset = 1 + Math.floor(Math.random() * 999)
    const fallbackNumber = currentNumber! + randomOffset
    result = await tryCreate(`Fisa ${fallbackNumber}`)
  }

  if (result.error) {
    throw result.error
  }
  if (!result.data) {
    throw new Error('Crearea fișei a eșuat')
  }

  const data = result.data

  // Continuă cu restul logicii doar dacă crearea a reușit
  try {
    await logLeadEvent(
      leadId,
      `Fișă de serviciu creată: ${data.number}`,
      'service_file_created',
      { service_file_id: data.id, number: data.number }
    )
  } catch (e) {
    console.warn('[createServiceSheet] Nu s-a putut loga crearea fișei:', e)
  }

  // Nu mai creăm automat o tăviță fără număr: utilizatorul creează tăvițe explicit (buton „Nouă”).
  // O tăviță goală făcea ca fișa să aibă mereu 2 tăvițe (una goală + una creată de user) și bloca mutarea la De Facturat (QC pe tăvița goală).

  // Creează conversație pentru lead dacă nu există deja (Faza 5: doar din parametru currentUserId – fără getSession())
  try {
    const supabase = supabaseBrowser()
    if (!currentUserId) {
      console.warn('⚠️ No currentUserId provided - cannot create conversation')
    } else {
      const userId = currentUserId
      // Verifică dacă conversația deja există pentru lead
      const { data: existingConv, error: searchError } = await supabase
        .from('conversations')
        .select('id')
        .eq('related_id', leadId)
        .eq('type', 'lead')
        .maybeSingle()

      if (searchError && searchError.code !== 'PGRST116') {
        console.warn('⚠️ Error searching for conversation:', searchError)
      } else if (!existingConv) {
        // Conversația nu există, crează-o
        console.log('➕ Creating conversation for lead when creating service file:', leadId)
        const { data: newConv, error: insertError } = await supabase
          .from('conversations')
          .insert({
            related_id: leadId,
            type: 'lead',
            created_by: userId,
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
  
  return data.id // Returnează fisa_id
}

export function useLeadDetailsServiceFiles({
  getLeadId,
  setServiceSheets,
  setSelectedFisaId,
  setLoadingSheets,
  loadServiceSheets,
}: UseLeadDetailsServiceFilesProps) {
  const { user } = useAuth()
  const [isCreating, setIsCreating] = useState(false)
  
  // Funcție pentru crearea unei fișe noi (Faza 5: trimitem user?.id – fără getSession() în createServiceSheet)
  const handleCreateServiceSheet = useCallback(async () => {
    // PROTECȚIE: Ignoră click-urile dacă crearea e deja în progres (prevenire double-click)
    if (isCreating) {
      console.warn('[handleCreateServiceSheet] Create already in progress, ignoring click')
      return
    }
    
    const leadId = getLeadId()
    if (!leadId) {
      console.warn('Cannot create service sheet: no lead ID')
      toast.error('Nu s-a putut obține ID-ul lead-ului')
      return
    }
    
    try {
      setIsCreating(true)  // ✅ Dezactivează butonul
      setLoadingSheets(true)
      
      const fisaId = await createServiceSheet(leadId, undefined, user?.id ?? null)
      
      // Reîncarcă fișele folosind funcția helper
      const sheets = await loadServiceSheets(leadId)
      
      setServiceSheets(sheets)
      setSelectedFisaId(fisaId)
      
      // Verifică dacă fișa a fost adăugată în listă
      const createdSheet = sheets.find(s => s.id === fisaId)
      if (!createdSheet) {
        console.warn('Created sheet not found in loaded sheets')
      }
      
      toast.success('Fișă de serviciu creată cu succes')
    } catch (error: any) {
      console.error('Error creating service sheet:', error)
      const errorMessage = error?.message || 'Te rog încearcă din nou'
      
      // Verifică dacă eroarea este legată de coloana lipsă
      if (errorMessage.includes('fisa_id') || errorMessage.includes('column')) {
        toast.error('Coloana fisa_id lipsește', {
          description: 'Te rog adaugă coloana fisa_id (UUID, nullable) în tabelul service_files din Supabase'
        })
      } else {
        toast.error('Eroare la crearea fișei', {
          description: errorMessage
        })
      }
    } finally {
      setIsCreating(false)  // ✅ Reactivează butonul
      setLoadingSheets(false)
    }
  }, [isCreating, getLeadId, loadServiceSheets, setServiceSheets, setSelectedFisaId, setLoadingSheets, user?.id])

  return {
    handleCreateServiceSheet,
    createServiceSheet,
  }
}

// Export funcție helper pentru utilizare în alte hook-uri
export { createServiceSheet }


