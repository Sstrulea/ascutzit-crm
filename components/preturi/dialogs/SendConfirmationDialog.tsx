'use client'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Send, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface SendConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  traysCount: number
  sending: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function SendConfirmationDialog({
  open,
  onOpenChange,
  traysCount,
  sending,
  onConfirm,
  onCancel,
}: SendConfirmationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md p-0 overflow-hidden border-0 shadow-2xl">
        {/* Titlu ascuns pentru accesibilitate */}
        <AlertDialogTitle className="sr-only">
          Trimite tăvițele în departamente
        </AlertDialogTitle>
        <AlertDialogDescription className="sr-only">
          Confirmă trimiterea a {traysCount} tăvițe în departamente
        </AlertDialogDescription>
        
        {/* Header cu gradient */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Send className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Trimite în Departamente</h2>
              <p className="text-emerald-100 text-sm">Confirmă trimiterea tăvițelor</p>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Info box */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-100">Atenție!</p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Această acțiune va trimite tăvițele în departamentele corespunzătoare pentru procesare.
                </p>
              </div>
            </div>
          </div>
          
          {/* Stats */}
          <div className="flex items-center justify-center p-6 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <div className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto shadow-lg">
                <span className="text-3xl font-bold text-white">{traysCount}</span>
              </div>
              <p className="mt-3 text-lg font-medium text-emerald-900 dark:text-emerald-100">
                {traysCount === 1 ? 'Tăviță' : 'Tăvițe'} de trimis
              </p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                Vor fi procesate în departamente
              </p>
            </div>
          </div>
          
          {/* What happens */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Ce se va întâmpla:</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Instrumentele vor fi mutate în pipeline-urile departamentelor</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Tehnicienii vor primi notificări pentru procesare</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Poți urmări progresul în fiecare departament</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="border-t px-6 py-4 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={sending}
            className="text-gray-600 hover:text-gray-900 dark:text-gray-400"
          >
            Anulează
          </Button>
          <Button
            onClick={onConfirm}
            disabled={sending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6 shadow-lg"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Se trimit...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Trimite Tăvițele
              </>
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
