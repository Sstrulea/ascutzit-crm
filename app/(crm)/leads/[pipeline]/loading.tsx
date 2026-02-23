'use client'

import { Loader2 } from 'lucide-react'

/**
 * Afișat imediat la navigare către /leads/[pipeline], înainte ca page.tsx să fie rezolvat.
 * Reduce sansa ca request-ul de document să rămână (pending) sau (canceled) – Next.js poate trimite acest shell rapid.
 */
export default function LeadsPipelineLoading() {
  return (
    <div className="flex flex-1 min-h-0 min-w-0 items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Se încarcă pipeline-ul...</p>
      </div>
    </div>
  )
}
