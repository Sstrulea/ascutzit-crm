'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ImagePlus, Image as ImageIcon, Loader2, Download, ChevronDown, ChevronUp, X as XIcon, Camera, Star, StarOff } from 'lucide-react'
import type { TrayImage } from '@/lib/supabase/imageOperations'

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

  if (!canViewTrayImages || !selectedQuoteId) {
    return null
  }

  const imagesArray = Array.isArray(trayImages) ? trayImages : []
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
    <div className="mx-2 sm:mx-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 
        bg-white dark:bg-slate-900 
        shadow-sm overflow-hidden">

        {/* Header — CRM: neutru + accent */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-slate-600 flex items-center justify-center shadow-sm">
                <ImageIcon className="h-4.5 w-4.5 text-white" />
              </div>

              <div>
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  Imagini Tăviță ({imagesArray.length})
                </h3>
                <p className="text-[11px] text-slate-700/80 dark:text-slate-300/70">
                  Galerie imagini pentru tăviță • {imagesArray.length === 0
                    ? 'Nu există imagini'
                    : `${imagesArray.length} imagine${imagesArray.length === 1 ? '' : 'i'}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {imagesArray.length > 0 && isImagesExpanded && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDownloadAll}
                  className="h-7 text-xs border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300">
                  <Download className="h-3 w-3 mr-1" />
                  Descarcă toate
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleExpanded}
                className="h-7 w-7 p-0"
                title={isImagesExpanded ? 'Minimizează' : 'Maximizează'}>
                {isImagesExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
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

            {/* Images grid */}
            {imagesArray.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {imagesArray.map((image, idx) => {
                  const isAssigned = assignedImageId === image.id
                  const isAssigning = assigningImageId === image.id || (assigningImageId === 'clear' && isAssigned)
                  return (
                    <div
                      key={image.id}
                      className={`relative group aspect-square rounded-lg overflow-hidden border bg-muted ${isAssigned ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-900' : ''}`}
                    >
                      <img
                        src={image.url}
                        alt={image.filename || `Imagine ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {isAssigned && (
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-medium flex items-center gap-1">
                          <Star className="h-3 w-3 fill-current" />
                          Reprezentativă
                        </div>
                      )}
                      {canAddTrayImages && (
                        <button
                          onClick={() => onImageDelete(image.id, image.file_path)}
                          className="absolute top-1 right-1 p-1.5 bg-destructive/90 hover:bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation"
                          title="Șterge imagine"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1.5 py-1 flex flex-col gap-0.5">
                        {canAssignImage && onAssignImage && (
                          isAssigned ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 min-h-0 text-[10px] text-white hover:bg-white/20 touch-manipulation py-0"
                              onClick={() => handleAssignClick(null)}
                              disabled={isAssigning}
                            >
                              {isAssigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <><StarOff className="h-3 w-3 mr-1 inline" /> Anulează</>}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 min-h-0 text-[10px] text-white hover:bg-white/20 touch-manipulation py-0"
                              onClick={() => handleAssignClick(image.id)}
                              disabled={isAssigning}
                            >
                              {isAssigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Star className="h-3 w-3 mr-1 inline" /> Setează reprezentativă</>}
                            </Button>
                          )
                        )}
                        <span className="truncate block">{image.filename}</span>
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
      </div>
    </div>
  )
}
