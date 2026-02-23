/**
 * Global event tracking – click-uri pe butoane și modificări în câmpuri de input.
 * Funcționează prin event delegation la nivel de document, fără listeneri manuali pe fiecare element.
 */

export type TrackingContext = {
  /** Calea paginii (ex: /crm/vanzari) */
  pathname: string
  /** Numele formularului activ, dacă există */
  formName?: string
  /** ID-ul formularului activ, dacă există */
  formId?: string
}

export type ClickTrackingEvent = {
  type: 'click'
  action: 'click'
  /** ID / name / aria-label / text / selector al elementului */
  identifier: string
  /** Tipul elementului (button, submit, a, toggle, etc.) */
  elementType: string
  timestamp: string
  context: TrackingContext
}

export type InputChangeTrackingEvent = {
  type: 'input_change'
  action: 'input_change'
  /** Numele câmpului */
  fieldName: string
  /** Valoare veche → nouă */
  oldValue: string
  newValue: string
  /** Tipul câmpului (text, number, select, checkbox, etc.) */
  inputType: string
  timestamp: string
  context: TrackingContext
}

export type TrackingEvent = ClickTrackingEvent | InputChangeTrackingEvent

export type TrackingEventHandler = (event: TrackingEvent) => void

let globalHandler: TrackingEventHandler | null = null

/**
 * Configurează handler-ul care primește toate evenimentele de tracking.
 * Ex: trimitere la API, Supabase, console.log, etc.
 */
export function setTrackingHandler(handler: TrackingEventHandler | null): void {
  globalHandler = handler
}

function getContext(el: Element | null): TrackingContext {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  const form = el?.closest('form')
  return {
    pathname,
    formName: form?.getAttribute('name') ?? undefined,
    formId: form?.id || undefined,
  }
}

function getElementIdentifier(el: Element): string {
  const htmlEl = el as HTMLElement
  if (el.id) return el.id
  const name = (el as HTMLInputElement | HTMLButtonElement).name
  if (name) return name
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return ariaLabel
  const dataTrackId = el.getAttribute('data-track-id')
  if (dataTrackId) return dataTrackId
  const text = (htmlEl.textContent || '').trim().slice(0, 60)
  if (text) return text
  const tag = el.tagName.toLowerCase()
  const cls = el.className && typeof el.className === 'string' ? el.className.split(/\s+/)[0] : ''
  if (cls) return `${tag}.${cls}`
  return tag
}

function getInputValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  if (el.type === 'checkbox' || el.type === 'radio') {
    return (el as HTMLInputElement).checked ? 'true' : 'false'
  }
  return el.value ?? ''
}

/** Verifică dacă elementul este un câmp de input pentru modificări */
function isTrackableInput(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  const type = (el as HTMLInputElement).type
  if (tag === 'input' && ['text', 'number', 'email', 'tel', 'password', 'search', 'url', 'date', 'datetime-local', 'time', 'checkbox', 'radio'].includes(type)) return true
  if (tag === 'textarea' || tag === 'select') return true
  return false
}

function emit(event: TrackingEvent): void {
  globalHandler?.(event)
}

// Store previous input values (WeakMap = auto-cleanup when element is GC'd)
const inputPreviousValues = new WeakMap<Element, { value: string; context: TrackingContext }>()

function handleClick(e: MouseEvent): void {
  const target = e.target as Element
  if (!target?.closest) return
  const interactive = target.closest('button, [role="button"], a[href], input[type="submit"], input[type="button"], [data-track-click], [role="menuitem"], [role="tab"], [role="switch"]')
  if (!interactive) return
  const identifier = getElementIdentifier(interactive)
  const tag = interactive.tagName.toLowerCase()
  const type = (interactive as HTMLInputElement).type
  const role = interactive.getAttribute('role') || ''
  let elementType = tag
  if (tag === 'input') elementType = type || 'input'
  else if (role) elementType = role
  emit({
    type: 'click',
    action: 'click',
    identifier,
    elementType,
    timestamp: new Date().toISOString(),
    context: getContext(interactive),
  })
}

function handleFocusIn(e: FocusEvent): void {
  const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  if (!target || !isTrackableInput(target)) return
  const value = getInputValue(target)
  const name = (target as HTMLInputElement).name || target.id || getElementIdentifier(target)
  inputPreviousValues.set(target, { value, context: getContext(target) })
}

function handleChange(e: Event): void {
  const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  if (!target || !isTrackableInput(target)) return
  const stored = inputPreviousValues.get(target)
  const newValue = getInputValue(target)
  const name = (target as HTMLInputElement).name || target.id || getElementIdentifier(target)
  const inputType = target.tagName.toLowerCase() === 'select' ? 'select' : (target as HTMLInputElement).type || 'text'
  if (stored && stored.value !== newValue) {
    emit({
      type: 'input_change',
      action: 'input_change',
      fieldName: name,
      oldValue: stored.value,
      newValue,
      inputType,
      timestamp: new Date().toISOString(),
      context: stored.context,
    })
  }
  inputPreviousValues.set(target, { value: newValue, context: getContext(target) })
}

let isInitialized = false

/**
 * Inițializează tracking-ul global. Se apelează o singură dată pe client.
 * Returnează funcția de cleanup (removeEventListener).
 */
export function initEventTracking(handler?: TrackingEventHandler): (() => void) | void {
  if (typeof document === 'undefined') return
  if (isInitialized) return
  isInitialized = true
  if (handler) globalHandler = handler
  document.addEventListener('click', handleClick, true)
  document.addEventListener('focusin', handleFocusIn, true)
  document.addEventListener('change', handleChange, true)
  return () => {
    document.removeEventListener('click', handleClick, true)
    document.removeEventListener('focusin', handleFocusIn, true)
    document.removeEventListener('change', handleChange, true)
    isInitialized = false
  }
}
