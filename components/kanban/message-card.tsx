import { MessageSquare, User, Clock, ExternalLink, FileText } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { ro } from 'date-fns/locale/ro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import type { TechnicianMessage } from '@/hooks/useMessagesFromTechnicians'

interface MessageCardProps {
  message: TechnicianMessage
  onMessageClick?: (messageId: string) => void
  onOpenServiceFile?: (serviceFileId: string, conversationId: string) => void
}

export function MessageCard({ message, onMessageClick, onOpenServiceFile }: MessageCardProps) {
  const createdDate = new Date(message.created_at)
  const timeAgo = formatDistanceToNow(createdDate, { addSuffix: true, locale: ro })
  const formattedTime = format(createdDate, 'd MMM HH:mm', { locale: ro })

  // Limităm lungimea mesajului afișat
  const displayContent = message.content.length > 150 
    ? message.content.substring(0, 150) + '...' 
    : message.content

  // Link pentru deschiderea detaliilor
  const conversationLink = message.service_file_id 
    ? `/leads/receptie?openServiceFileId=${message.service_file_id}&openConversationId=${message.conversation_id}`
    : message.tray_id 
    ? `/leads/receptie?openTrayId=${message.tray_id}&openConversationId=${message.conversation_id}`
    : message.lead_id 
    ? `/leads/receptie?openLeadId=${message.lead_id}&openConversationId=${message.conversation_id}`
    : null

  return (
    <Card 
      className="p-4 mb-3 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
      onClick={() => onMessageClick?.(message.id)}
    >
      <div className="flex gap-3">
        {/* Icon cu user */}
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white">
            <User className="w-5 h-5" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header - sender name + time */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground">
                {message.sender_name || 'Tehnician'}
              </span>
              <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 border-blue-300">
                <MessageSquare className="w-3 h-3 mr-1" />
                Mesaj
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
          </div>

          {/* Mesaj */}
          <p className="text-sm text-foreground mb-2 line-clamp-3 break-words">
            {displayContent}
          </p>

          {/* Info despre fișa de serviciu / lead / tăviță */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs text-muted-foreground space-y-1">
              {/* Fișă de serviciu - prioritate 1 */}
              {message.service_file_id && message.service_file_number && (
                <div className="flex items-center gap-1 font-medium text-blue-700">
                  <FileText className="w-3 h-3" />
                  Fișă: <span className="text-foreground">{message.service_file_number}</span>
                </div>
              )}
              
              {/* Lead */}
              {message.lead_name && !message.service_file_id && (
                <div className="font-medium">Lead: <span className="text-foreground">{message.lead_name}</span></div>
              )}
              
              {/* Tăviță */}
              {message.tray_number && !message.service_file_id && (
                <div className="font-medium">Tăviță: <span className="text-foreground">{message.tray_number}</span></div>
              )}
              
              <div className="text-xs text-muted-foreground">
                {formattedTime}
              </div>
            </div>

            {/* Link pentru deschidere */}
            {conversationLink && (
              <Link href={conversationLink} className="flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                  title="Deschide detaliile fisei cu conversația"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
