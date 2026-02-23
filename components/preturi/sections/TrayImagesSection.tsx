'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { ImagePlus, Image as ImageIcon, Loader2, Download, ChevronDown, ChevronUp, X as XIcon, Camera, Star, StarOff, ChevronLeft, ChevronRight, Expand } from 'lucide-react'
import type { TrayImage } from '@/lib/supabase/imageOperations'

const COLLAPSED_THUMB_COUNT = 4

interface TrayImagesSectionProps {
  trayImages: TrayImage[]
  uploadingImage: boolean
  isImagesExpanded: boolean
  canAddTrayImages: boolean
  canViewTrayImages: boolean
  selectedQuoteId: string | null
  onToggleExpanded: () => void
  onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onDownloadAll: () => void
  onImageDelete: (imageId: string, filePath: string) => void
  /** ID-ul imaginii reprezentative (atribuite) pentru tăviță – Recepție / departamente */
  assignedImageId?: string | null
  /** Callback când utilizatorul setează sau scoate imaginea reprezentativă */
  onAssignImage?: (imageId: string | null) => void
  /** Afișează butoanele de atribuire imagine reprezentativă (Recepție + departamente) */
  canAssignImage?: boolean
}

export function TrayImagesSection({
  trayImages = [],
  uploadingImage,
  isImagesExpanded,
  canAddTrayImages,
  canViewTrayImages,
  selectedQuoteId,
  onToggleExpanded,
  onImageUpload,
  onDownloadAll,
  onImageDelete,
  assignedImageId = null,
  onAssignImage,
  canAssignImage = false,
}: TrayImagesSectionProps) {
  const [assigningImageId, setAssigningImageId] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const imagesArray = Array.isArray(trayImages) ? trayImages : []
  const collapsedThumbs = imagesArray.slice(0, COLLAPSED_THUMB_COUNT)
  const remainingCount = Math.max(0, imagesArray.length - COLLAPSED_THUMB_COUNT)
  const lightboxImage = lightboxIndex != null ? imagesArray[lightboxIndex] : null

  if (!canViewTrayImages || !selectedQuoteId) {
    return null
  }

  const handleAssignClick = async (imageId: string | null) => {
    if (!onAssignImage) return
    setAssigningImageId(imageId ?? 'clear')
    try {
      await onAssignImage(imageId)
    } finally {
      setAssigningImageId(null)
    }
  }

  return (
    <div className="w-full mb-5">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 
        bg-white dark:bg-slate-900 
        shadow-sm overflow-hidden">

        {/* Header — CRM: neutru + accent; click pe titlu/icon/thumbnails deschide secțiunea */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onToggleExpanded}
              className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-lg -m-1 p-1 hover:bg-slate-100/80 dark:hover:bg-slate-700/50 transition-colors"
            >
              <div className={`h-9 w-9 flex-shrink-0 rounded-xl flex items-center justify-center shadow-sm ${imagesArray.length === 0 ? 'bg-slate-400/80 dark:bg-slate-600' : 'bg-slate-600'}`}>
                <ImageIcon className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  Imagini Tăviță ({imagesArray.length})
                </h3>
                <p className="text-[11px] text-slate-600/90 dark:text-slate-400/90">
                  {imagesArray.length === 0
                    ? 'Adaugă poze din galerie sau cu camera'
                    : `Galerie • ${imagesArray.length} imagine${imagesArray.length === 1 ? '' : 'i'}`}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-2 flex-shrink-0">
              {imagesArray.length > 0 && isImagesExpanded && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDownloadAll}
                  className="h-7 text-xs border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Descarcă toate
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleExpanded}
                className="h-7 w-7 p-0"
                title={isImagesExpanded ? 'Minimizează' : 'Maximizează'}
              >
                {isImagesExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Previzualizare când secțiunea e închisă — grid cu lățimi egale */}
          {!isImagesExpanded && imagesArray.length > 0 && (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="mt-3 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 p-2 hover:border-slate-300 dark:hover:border-slate-500 transition-colors"
            >
              <div className="grid grid-cols-4 gap-2">
                {collapsedThumbs.map((img) => (
                  <div
                    key={img.id}
                    className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200/80 dark:ring-slate-600"
                  >
                    <img
                      src={img.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
                {remainingCount > 0 && (
                  <div className="aspect-square rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center ring-1 ring-slate-200/80 dark:ring-slate-600">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">+{remainingCount}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-center mt-2">
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </div>
            </button>
          )}
        </div>

        {/* Content */}
        {isImagesExpanded && (
          <div className="p-4 space-y-3">
            {/* Upload buttons - Galerie + Cameră */}
            {canAddTrayImages && (
              <div className="flex gap-2">
                {/* Input pentru galerie (fără capture) */}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onImageUpload}
                  disabled={uploadingImage}
                  className="hidden"
                  id="tray-image-upload-gallery"
                />
                {/* Input pentru cameră (cu capture) */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onImageUpload}
                  disabled={uploadingImage}
                  className="hidden"
                  id="tray-image-upload-camera"
                />
                
                {/* Buton Galerie */}
                <label
                  htmlFor="tray-image-upload-gallery"
                  className="flex-1 flex items-center justify-center h-20 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-lg cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 transition-colors group bg-slate-50/50 dark:bg-slate-800/50"
                >
                  {uploadingImage ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                      <span className="text-xs text-slate-600 dark:text-slate-400">Se încarcă...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <ImagePlus className="h-5 w-5 text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
                      <span className="text-xs text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200">
                        Galerie
                      </span>
                    </div>
                  )}
                </label>

                {/* Buton Cameră */}
                <label
                  htmlFor="tray-image-upload-camera"
                  className="flex-1 flex items-center justify-center h-20 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-lg cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 transition-colors group bg-slate-50/50 dark:bg-slate-800/50"
                >
                  {uploadingImage ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                      <span className="text-xs text-slate-600 dark:text-slate-400">Se încarcă...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <Camera className="h-5 w-5 text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
                      <span className="text-xs text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200">
                        Cameră
                      </span>
                    </div>
                  )}
                </label>
              </div>
            )}

            {/* Galerie imagini — aceeași lățime per celulă, grid armonios */}
            {imagesArray.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                {imagesArray.map((image, idx) => {
                  const isAssigned = assignedImageId === image.id
                  const isAssigning = assigningImageId === image.id || (assigningImageId === 'clear' && isAssigned)
                  return (
                    <div
                      key={image.id}
                      className={`relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 shadow-sm transition-all hover:shadow-md hover:border-slate-300 dark:hover:border-slate-500 ${isAssigned ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-900' : ''}`}
                    >
                      <AspectRatio ratio={1}>
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(idx)}
                          className="absolute inset-0 w-full h-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl overflow-hidden"
                        >
                          <img
                            src={image.url}
                            alt={image.filename || `Imagine ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                          <span className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <Expand className="h-4 w-4" />
                          </span>
                        </button>
                      </AspectRatio>
                      {isAssigned && (
                        <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-medium flex items-center gap-1 shadow">
                          <Star className="h-3 w-3 fill-current" />
                          Reprezentativă
                        </div>
                      )}
                      {canAddTrayImages && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onImageDelete(image.id, image.file_path)
                          }}
                          className="absolute top-2 right-2 p-2 bg-destructive/90 hover:bg-destructive text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation shadow"
                          title="Șterge imagine"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] px-2 py-2.5 flex flex-col gap-1">
                        {canAssignImage && onAssignImage && (
                          isAssigned ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 min-h-0 text-[10px] text-white hover:bg-white/20 touch-manipulation py-0 w-fit"
                              onClick={(e) => { e.stopPropagation(); handleAssignClick(null) }}
                              disabled={isAssigning}
                            >
                              {isAssigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <><StarOff className="h-3 w-3 mr-1 inline" /> Anulează</>}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 min-h-0 text-[10px] text-white hover:bg-white/20 touch-manipulation py-0 w-fit"
                              onClick={(e) => { e.stopPropagation(); handleAssignClick(image.id) }}
                              disabled={isAssigning}
                            >
                              {isAssigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Star className="h-3 w-3 mr-1 inline" /> Setează reprezentativă</>}
                            </Button>
                          )
                        )}
                        <span className="truncate block font-medium">{image.filename}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ImageIcon className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Nu există imagini încărcate
                </p>
                {canAddTrayImages && (
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                    Folosește Galerie sau Cameră pentru a încărca imagini
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Lightbox — imagine mare cu prev/next */}
        <Dialog open={lightboxIndex !== null} onOpenChange={(open) => !open && setLightboxIndex(null)}>
          <DialogContent
            className="max-w-[95vw] w-full max-h-[95vh] p-2 sm:p-4 border-0 bg-black/95 focus:outline-none"
            showCloseButton={true}
          >
            <DialogTitle className="sr-only">
              {lightboxImage ? (lightboxImage.filename || 'Imagine tăviță') : 'Imagine'}
            </DialogTitle>
            {lightboxImage && (
              <div className="relative flex items-center justify-center gap-2 min-h-[50vh]">
                {imagesArray.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white"
                    onClick={() => setLightboxIndex(lightboxIndex! > 0 ? lightboxIndex! - 1 : imagesArray.length - 1)}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                )}
                <img
                  src={lightboxImage.url}
                  alt={lightboxImage.filename || 'Imagine'}
                  className="max-h-[85vh] w-auto object-contain rounded-lg"
                />
                {imagesArray.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white"
                    onClick={() => setLightboxIndex(lightboxIndex! < imagesArray.length - 1 ? lightboxIndex! + 1 : 0)}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                )}
              </div>
            )}
            {lightboxImage && (
              <p className="text-center text-sm text-white/80 mt-2 truncate px-4">
                {lightboxImage.filename} {imagesArray.length > 1 && `(${lightboxIndex! + 1} / ${imagesArray.length})`}
              </p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
