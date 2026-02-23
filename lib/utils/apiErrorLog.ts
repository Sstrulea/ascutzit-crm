/**
 * Logare erori pentru rute API – format consistent pentru debugging și eventual integrare
 * cu un serviciu de monitoring (ex. Sentry). Folosește console.error cu prefix și detalii.
 */
export function logApiError(route: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  console.error(`[API ${route}]`, message, stack ?? '')
}
