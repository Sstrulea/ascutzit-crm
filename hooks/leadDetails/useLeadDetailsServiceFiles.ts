/**
 * Hook pentru gestionarea service files-urilor în componenta LeadDetailsPanel
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { 
  createServiceFile,
  createTray,
  getNextGlobalServiceFileNumber,
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
  // PROTECȚIE: Retry logic pentru a evita duplicate-uri cauzate de numere deja folosite.
  // IMPORTANT: Pentru numele auto-generate („Fisa X”) dacă există deja, trecem la următorul număr.
  let retries = 5
  let lastError: any = null
  let data: ServiceFile | null = null
  let currentNumber: number | null = null

  while (retries > 0) {
    try {
      // 1) Determină numărul de fișă
      if (!name) {
        // Auto-numbering: obține punctul de plecare o singură dată, apoi incrementează local
        if (currentNumber == null) {
          const { data: nextGlobalNumber, error: numberError } = await getNextGlobalServiceFileNumber()
          if (numberError || nextGlobalNumber === null) {
            throw numberError || new Error('Failed to get next global service file number')
          }
          currentNumber = nextGlobalNumber
        } else {
          currentNumber++
        }
      }
      
      const autoNumber = !name ? `Fisa ${currentNumber}` : name

      const serviceFileData = {
        lead_id: leadId,
        number: autoNumber,
        date: new Date().toISOString().split('T')[0],
        status: 'noua' as const,
        notes: null,
      }
      
      const result = await createServiceFile(serviceFileData)
      
      if (result.error) {
        // Pentru numere auto-generate: dacă există deja, încercăm următorul număr.
        const msg = String(result.error.message || '')
        const isDuplicate =
          msg.includes('există deja') ||
          msg.includes('creată deja') ||
          msg.includes('race condition')

        if (!name && isDuplicate) {
          lastError = result.error
          retries--
          // Așteaptă puțin înainte de retry pentru a evita race condition-uri
          await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100))
          continue
        }

        // Pentru numere custom (name) sau alte erori, propagăm imediat
        throw result.error
      }
      
      if (!result.data) {
        throw new Error('Failed to create service file')
      }
      
      // Succes - salvează data și ieșim din loop
      data = result.data
      break
    } catch (error: any) {
      const msg = String(error?.message || '')
      if (!name && retries > 0 && msg.includes('există deja')) {
        retries--
        lastError = error
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100))
        continue
      }
      throw error
    }
  }
  
  // Dacă am epuizat retry-urile fără succes
  if (!data) {
    throw lastError || new Error('Failed to create service file after retries')
  }

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
  
  // Creează automat o tăviță "undefined" (fără număr) pentru fișa de serviciu nou creată
  try {
    const { data: undefinedTray, error: trayError } = await createTray({
      number: '', // Tăviță "undefined" - fără număr
      service_file_id: data.id,
      status: 'in_receptie',
    })
    
    if (trayError) {
      console.error('Error creating undefined tray:', trayError)
      // Nu aruncăm eroarea, doar logăm - fișa de serviciu a fost creată cu succes
    }
  } catch (trayErr) {
    console.error('Error creating undefined tray:', trayErr)
    // Nu aruncăm eroarea, doar logăm
  }
  
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


