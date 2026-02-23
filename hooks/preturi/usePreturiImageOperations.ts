/**
 * Hook pentru operațiile cu imagini (upload, delete, download)
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { uploadTrayImage, deleteTrayImage, saveTrayImageReference, deleteTrayImageReference, type TrayImage } from '@/lib/supabase/imageOperations'

interface UsePreturiImageOperationsProps {
  selectedQuoteId: string | null
  trayImages: TrayImage[]
  setTrayImages: React.Dispatch<React.SetStateAction<TrayImage[]>>
  setUploadingImage: React.Dispatch<React.SetStateAction<boolean>>
  /** Pentru receptie: permitem orice dimensiune; altfel max 5MB. */
  allowUnlimitedImageSize?: boolean
}

export function usePreturiImageOperations({
  selectedQuoteId,
  trayImages,
  setTrayImages,
  setUploadingImage,
  allowUnlimitedImageSize = false,
}: UsePreturiImageOperationsProps) {

  // Funcție pentru încărcarea unei imagini
  const handleTrayImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedQuoteId) return

    // Validare tip fișier - verifică atât file.type cât și extensia
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif']
    
    // Extrage extensia fișierului
    const fileName = file.name || ''
    const extensionMatch = fileName.match(/\.([a-zA-Z0-9]+)$/)
    const fileExtension = extensionMatch ? extensionMatch[1].toLowerCase() : ''
    
    // Verifică tipul MIME (acceptă orice image/*)
    const hasValidMimeType = file.type?.startsWith('image/')
    
    // Verifică extensia fișierului
    const hasValidExtension = validExtensions.includes(fileExtension)
    
    // Acceptă fișierul dacă are fie MIME type valid, fie extensie validă
    if (!hasValidMimeType && !hasValidExtension) {
      toast.error('Tip de fișier invalid', {
        description: 'Te rog selectează o imagine validă (JPG, PNG, GIF, WEBP, etc.)'
      })
      return
    }

    // Validare dimensiune: receptie = orice mărime; altfel max 5MB
    if (!allowUnlimitedImageSize && file.size > 5 * 1024 * 1024) {
      toast.error('Fișier prea mare', {
        description: 'Dimensiunea maximă este 5MB'
      })
      return
    }

    setUploadingImage(true)
    const toastId = toast.loading('Se încarcă imaginea...')
    
    try {
      const { url, path } = await uploadTrayImage(selectedQuoteId, file)
      const savedImage = await saveTrayImageReference(selectedQuoteId, url, path, file.name)
      setTrayImages(prev => [savedImage, ...prev])
      toast.success('Imagine încărcată cu succes', { id: toastId })
    } catch (error: any) {
      console.error('Error uploading tray image:', error)
      
      // Mesaje de eroare mai descriptive
      let errorMessage = 'Te rog încearcă din nou'
      if (error?.message) {
        errorMessage = error.message
        // Verifică dacă eroarea este legată de bucket
        if (error.message.includes('Bucket not found') || error.message.includes('tray-images')) {
          errorMessage = 'Bucket-ul "tray-images" nu există. Te rog verifică configurația Storage în Supabase.'
        } else if (error.message.includes('permission denied') || error.message.includes('policy')) {
          errorMessage = 'Nu ai permisiuni pentru a încărca imagini. Te rog verifică Storage Policies.'
        } else if (error.message.includes('relation') && error.message.includes('tray_images')) {
          errorMessage = 'Tabelul "tray_images" nu există. Te rog rulează scriptul SQL de setup.'
        }
      }
      
      toast.error('Eroare la încărcarea imaginii', {
        id: toastId,
        description: errorMessage
      })
    } finally {
      setUploadingImage(false)
      event.target.value = ''
    }
  }, [selectedQuoteId, setTrayImages, setUploadingImage, allowUnlimitedImageSize])

  // Funcție pentru descărcarea tuturor imaginilor
  const handleDownloadAllImages = useCallback(async () => {
    if (trayImages.length === 0) {
      toast.error('Nu există imagini de descărcat')
      return
    }

    try {
      // Descarcă fiecare imagine individual
      for (const image of trayImages) {
        const link = document.createElement('a')
        link.href = image.url
        link.download = image.filename
        link.target = '_blank'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        // Mic delay între descărcări pentru a evita blocarea browserului
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      toast.success(`S-au descărcat ${trayImages.length} imagini`)
    } catch (error: any) {
      console.error('Error downloading images:', error)
      toast.error('Eroare la descărcarea imaginilor', {
        description: error?.message || 'Te rog încearcă din nou'
      })
    }
  }, [trayImages])

  // Funcție pentru ștergerea unei imagini
  const handleTrayImageDelete = useCallback(async (imageId: string, filePath: string) => {
    if (!confirm('Ești sigur că vrei să ștergi această imagine?')) return

    try {
      // Șterge referința din baza de date
      await deleteTrayImageReference(imageId)
      
      // Șterge fișierul din storage
      await deleteTrayImage(filePath)
      
      // Actualizează lista de imagini
      setTrayImages(prev => prev.filter(img => img.id !== imageId))
      
      toast.success('Imagine ștearsă cu succes')
    } catch (error: any) {
      console.error('Error deleting tray image:', error)
      toast.error('Eroare la ștergerea imaginii', {
        description: error?.message || 'Te rog încearcă din nou'
      })
    }
  }, [setTrayImages])

  return {
    handleTrayImageUpload,
    handleDownloadAllImages,
    handleTrayImageDelete,
  }
}



