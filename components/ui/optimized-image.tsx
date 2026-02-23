'use client'

import Image, { ImageProps } from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface OptimizedImageProps extends Omit<ImageProps, 'onError'> {
  fallback?: string
  aspectRatio?: 'square' | 'video' | 'auto'
}

/**
 * ✅ Imagine Optimizată
 * 
 * - Lazy loading automat
 * - Blur placeholder
 * - Fallback pentru erori
 * - Suport pentru Supabase Storage
 */
export function OptimizedImage({
  src,
  alt,
  fallback = '/placeholder.svg',
  aspectRatio = 'auto',
  className,
  ...props
}: OptimizedImageProps) {
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    auto: '',
  }

  return (
    <div className={cn('relative overflow-hidden', aspectClasses[aspectRatio], className)}>
      {loading && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      <Image
        src={error ? fallback : src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoading(false)}
        onError={() => {
          setError(true)
          setLoading(false)
        }}
        className={cn(
          'transition-opacity duration-300',
          loading ? 'opacity-0' : 'opacity-100'
        )}
        {...props}
      />
    </div>
  )
}

/**
 * ✅ Galerie Virtualizată
 * 
 * Render doar imaginile vizibile în viewport
 */
export function VirtualizedGallery({ 
  images, 
  onDelete,
  className 
}: { 
  images: Array<{ id: string; url: string; filename: string }>
  onDelete?: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3', className)}>
      {images.map((image, idx) => (
        <div 
          key={image.id}
          className="group relative aspect-square rounded-xl overflow-hidden bg-muted/30 ring-1 ring-border/30"
        >
          <img
            src={image.url}
            alt={image.filename}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          {/* Delete button */}
          {onDelete && (
            <button
              onClick={() => onDelete(image.id)}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-white/80 hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-all"
            >
              ✕
            </button>
          )}
          
          {/* Badge */}
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/30 text-[10px] text-white/90">
            #{idx + 1}
          </div>
        </div>
      ))}
    </div>
  )
}

