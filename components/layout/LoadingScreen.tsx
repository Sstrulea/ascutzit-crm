'use client'

import Image from 'next/image'

interface LoadingScreenProps {
  /** Text sub logo */
  message?: string
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <div className="flex flex-1 min-h-0 min-w-0 items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <Image
            src="/logo.png"
            alt="CRM"
            width={56}
            height={56}
            className="animate-spin rounded-lg object-contain"
          />
        </div>
        {message ? (
          <p className="text-sm font-medium text-muted-foreground">{message}</p>
        ) : null}
      </div>
    </div>
  )
}
