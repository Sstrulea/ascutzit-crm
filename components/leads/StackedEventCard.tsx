import { useState, useMemo } from "react"
import { ChevronDown, ChevronRight, Layers, Calendar, Clock, User } from "lucide-react"
import { format, isToday, isYesterday, differenceInDays } from "date-fns"
import { ro } from "date-fns/locale"
import type { StackedEvent } from "@/lib/tracking/eventStacker"
import { EventIcon, EventBadge } from "./lead-history"

interface StackedEventCardProps {
  stackedEvent: StackedEvent
}

function formatEventTime(dateString: string): string {
  const date = new Date(dateString)
  if (isToday(date)) {
    return `Astăzi, ${format(date, "HH:mm", { locale: ro })}`
  } else if (isYesterday(date)) {
    return `Ieri, ${format(date, "HH:mm", { locale: ro })}`
  } else {
    return format(date, "d MMM yyyy, HH:mm", { locale: ro })
  }
}

function formatDateOnly(dateString: string): string {
  const date = new Date(dateString)
  if (isToday(date)) {
    return "Astăzi"
  } else if (isYesterday(date)) {
    return "Ieri"
  } else {
    return format(date, "d MMM yyyy", { locale: ro })
  }
}

export function StackedEventCard({ stackedEvent }: StackedEventCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { event, count, events } = stackedEvent

  // Calculate time range for the stack
  const timeRange = useMemo(() => {
    if (events.length < 2) return null
    
    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    
    const firstEvent = sortedEvents[0]
    const lastEvent = sortedEvents[sortedEvents.length - 1]
    const firstDate = new Date(firstEvent.created_at)
    const lastDate = new Date(lastEvent.created_at)
    
    const daysDiff = differenceInDays(lastDate, firstDate)
    
    if (daysDiff === 0) {
      // Same day
      return `În aceeași zi (${format(firstDate, "d MMM", { locale: ro })})`
    } else if (daysDiff === 1) {
      return `În 2 zile (${format(firstDate, "d MMM")} - ${format(lastDate, "d MMM", { locale: ro })})`
    } else {
      return `În ${daysDiff + 1} zile (${format(firstDate, "d MMM")} - ${format(lastDate, "d MMM", { locale: ro })})`
    }
  }, [events])

  // If only one event, show as normal event
  if (count === 1) {
    return (
      <div className="group relative rounded-lg border bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200 p-4">
        <div className="flex items-start gap-3">
          {/* Icon și linie verticală */}
          <div className="flex flex-col items-center pt-0.5">
            <div className="rounded-full bg-muted p-2 group-hover:bg-primary/10 transition-colors">
              <EventIcon eventType={event.event_type} />
            </div>
          </div>
          
          {/* Conținut */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatEventTime(event.created_at)}
                  </span>
                  <EventBadge eventType={event.event_type} />
                </div>
                {event.actor_name && (
                  <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span className="text-xs">{event.actor_name}</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Mesaj */}
            <div className="text-sm leading-relaxed text-foreground font-medium">
              {event.message}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show stacked events with maximized visibility
  return (
    <div className="group relative rounded-lg border-2 border-primary/20 bg-card hover:border-primary/40 hover:shadow-lg transition-all duration-200 overflow-hidden">
      {/* Stacked Event Header - Enhanced for better visibility */}
      <div 
        className="p-4 cursor-pointer hover:bg-primary/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-3">
          {/* Stack Icon with count badge */}
          <div className="flex flex-col items-center pt-0.5 relative">
            <div className="rounded-full bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors relative">
              <Layers className="w-5 h-5 text-primary" />
              <div className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {count}
              </div>
            </div>
          </div>
          
          {/* Conținut */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header with time range */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatEventTime(event.created_at)}
                  </span>
                  <EventBadge eventType={event.event_type} />
                  <span className="inline-flex items-center rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/30">
                    {count} evenimente
                  </span>
                </div>
                
                {/* Time range information */}
                {timeRange && (
                  <div className="flex items-center gap-1.5 mt-1 text-muted-foreground text-xs">
                    <Calendar className="w-3 h-3" />
                    <span>{timeRange}</span>
                  </div>
                )}
                
                {event.actor_name && (
                  <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span className="text-xs">{event.actor_name}</span>
                  </div>
                )}
              </div>
              
              {/* Expand/Collapse Button - More prominent */}
              <button
                className="p-1.5 rounded-md hover:bg-primary/10 transition-colors border border-border"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsExpanded(!isExpanded)
                }}
                aria-label={isExpanded ? "Collapse stack" : "Expand stack"}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-primary" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-primary" />
                )}
              </button>
            </div>
            
            {/* Mesaj cu indicare de repetiție */}
            <div className="text-sm leading-relaxed text-foreground font-medium">
              {event.message}
              <div className="mt-1 text-xs text-muted-foreground">
                {isExpanded ? 
                  `Click pentru a ascunde ${count} evenimente similare` : 
                  `Click pentru a vedea toate ${count} evenimente similare`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Events - Enhanced for better visibility */}
      {isExpanded && (
        <div className="border-t-2 border-primary/10 bg-gradient-to-b from-primary/5 to-transparent p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-primary font-semibold flex items-center gap-2">
              <Layers className="w-3 h-3" />
              Toate evenimentele din acest grup ({count})
            </div>
            <div className="text-xs text-muted-foreground">
              Ordine cronologică (cele mai recente primele)
            </div>
          </div>
          
          <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
            {events
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((ev, idx) => (
              <div 
                key={ev.id}
                className="rounded-lg bg-background border border-border/70 p-3 hover:border-primary/30 hover:shadow-sm transition-all duration-150"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="rounded-full bg-muted/50 p-1.5">
                      <EventIcon eventType={ev.event_type} />
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {formatEventTime(ev.created_at)}
                        </span>
                        {idx === 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 font-medium">
                            Cel mai recent
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        #{idx + 1} din {count}
                      </div>
                    </div>
                    
                    {ev.actor_name && (
                      <div className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>{ev.actor_name}</span>
                      </div>
                    )}
                    
                    <div className="text-sm text-foreground">
                      {ev.message}
                    </div>
                    
                    {/* Show date for events not on the same day as the most recent */}
                    {idx > 0 && formatDateOnly(ev.created_at) !== formatDateOnly(events[0].created_at) && (
                      <div className="mt-1.5 pt-1.5 border-t border-border/30">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDateOnly(ev.created_at)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Stack summary */}
          <div className="pt-3 border-t border-border/30">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Rezumat:</span> {count} evenimente similare grupate pentru o vizualizare mai clară.
              {timeRange && ` Evenimentele s-au întâmplat ${timeRange.toLowerCase()}.`}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}