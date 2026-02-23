import { useMemo } from 'react'

/**
 * Hook pentru verificări și restricții bazate pe pipeline
 */
export function usePreturiPipeline(pipelineSlug?: string, isDepartmentPipeline?: boolean) {
  // Verifică dacă suntem în pipeline-ul Vânzări
  const isVanzariPipeline = useMemo(() => {
    if (!pipelineSlug) return false
    return pipelineSlug.toLowerCase().includes('vanzari') || pipelineSlug.toLowerCase().includes('sales')
  }, [pipelineSlug])

  // Verifică dacă suntem în pipeline-ul Reparații
  const isReparatiiPipeline = useMemo(() => {
    if (!pipelineSlug) return false
    return pipelineSlug.toLowerCase().includes('reparatii') || pipelineSlug.toLowerCase().includes('repair')
  }, [pipelineSlug])

  // Verifică dacă suntem în pipeline-ul Recepție
  const isReceptiePipeline = useMemo(() => {
    if (!pipelineSlug) return false
    return pipelineSlug.toLowerCase().includes('receptie') || pipelineSlug.toLowerCase().includes('reception')
  }, [pipelineSlug])

  // Pipeline-ul Curier a fost eliminat - folosim doar Receptie
  const isCurierPipeline = false

  // Verifică dacă pipeline-ul permite adăugarea de imagini (Vanzari, Saloane, Frizerii, Horeca, Reparatii, Receptie)
  const canAddTrayImages = useMemo(() => {
    if (!pipelineSlug) return false
    const slug = pipelineSlug.toLowerCase()
    return slug.includes('vanzari') ||
           slug.includes('sales') ||
           slug.includes('saloane') || 
           slug.includes('frizerii') || 
           slug.includes('horeca') || 
           slug.includes('reparatii') ||
           slug.includes('receptie') ||
           slug.includes('reception')
  }, [pipelineSlug])
  
  // Verifică dacă pipeline-ul permite VIZUALIZAREA imaginilor
  const canViewTrayImages = useMemo(() => {
    if (!pipelineSlug) return false
    const slug = pipelineSlug.toLowerCase()
    return canAddTrayImages || slug.includes('vanzari') || slug.includes('sales') || slug.includes('receptie') || slug.includes('reception')
  }, [pipelineSlug, canAddTrayImages])

  // Pipeline-uri comerciale unde vrem să afișăm detalii de tăviță în Fișa de serviciu
  const isCommercialPipeline = useMemo(() => {
    return isVanzariPipeline || isReceptiePipeline
  }, [isVanzariPipeline, isReceptiePipeline])

  // Restricții pentru tehnicieni în pipeline-urile departament
  // Urgent și Abonament sunt disponibile PENTRU TOȚI, indiferent de rol
  // Aceasta garantează că membrii obișnuiți văd EXACT același view ca adminii
  const canEditUrgentAndSubscription = useMemo(() => {
    // NTOVĂ: Forțez MEREU true pentru a asigura că toți utilizatorii văd același view
    // Fără restricții pe bază de rol - membrii obișnuiți au acces identic cu adminii
    return true
  }, [])

  // Tehnicianul poate adăuga piese doar în Reparații
  const canAddParts = useMemo(() => {
    if (isDepartmentPipeline) {
      return isReparatiiPipeline
    }
    return true // În alte pipeline-uri se pot adăuga piese
  }, [isDepartmentPipeline, isReparatiiPipeline])

  return {
    isVanzariPipeline,
    isReparatiiPipeline,
    isReceptiePipeline,
    canAddTrayImages,
    canViewTrayImages,
    isCommercialPipeline,
    canEditUrgentAndSubscription,
    canAddParts,
  }
}



