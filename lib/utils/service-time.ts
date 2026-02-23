/**
 * Parsează durata unui serviciu din string în minute.
 *
 * În DB, `services.time` este un string introdus liber (ex: "30", "30 min", "1h", "1h30", "00:30:00", "0:05").
 * Avem nevoie de o conversie robustă, folosită atât în Kanban (estimatedTime în minute),
 * cât și în dashboard (unde derivăm secunde).
 */
export function parseServiceTimeToMinutes(raw: unknown): number {
  const sRaw = String(raw ?? '').trim()
  if (!sRaw) return 0

  const s = sRaw
    .toLowerCase()
    .replace(',', '.') // 1,5h -> 1.5h
    .replace(/\s+/g, ' ')
    .trim()

  // 1) Formate cu unități (ro/en): "1h 30min", "30 min", "2 ore", "45m", "90s"
  let hours = 0
  let minutes = 0
  let seconds = 0

  const hasUnit = /(h\b|ora\b|ore\b|hour\b|hours\b|min\b|minute\b|m\b|sec\b|secunde\b|s\b|seconds\b)/i.test(s)

  if (hasUnit) {
    // special: "1h30" / "1 h 30" (fără "min")
    const hmCompact = s.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d+)\s*$/i) || s.match(/^(\d+(?:\.\d+)?)h(\d+)\s*$/i)
    if (hmCompact) {
      const h = Number(hmCompact[1])
      const m = Number(hmCompact[2])
      if (Number.isFinite(h) && h > 0) hours += h
      if (Number.isFinite(m) && m > 0) minutes += m
    }

    const hourRe = /(\d+(?:\.\d+)?)\s*(h|ora|ore|hour|hours)\b/g
    const minRe = /(\d+(?:\.\d+)?)\s*(min|minute|m)\b/g
    const secRe = /(\d+(?:\.\d+)?)\s*(sec|secunde|seconds|s)\b/g

    for (const m of s.matchAll(hourRe)) {
      const v = Number(m[1])
      if (Number.isFinite(v) && v > 0) hours += v
    }
    for (const m of s.matchAll(minRe)) {
      const v = Number(m[1])
      if (Number.isFinite(v) && v > 0) minutes += v
    }
    for (const m of s.matchAll(secRe)) {
      const v = Number(m[1])
      if (Number.isFinite(v) && v > 0) seconds += v
    }

    const total = hours * 60 + minutes + seconds / 60
    return total > 0 ? total : 0
  }

  // 2) Format cu ":" (HH:MM:SS sau HH:MM / MM:SS – heuristica)
  if (s.includes(':')) {
    const parts = s.split(':').map((x) => x.trim()).filter(Boolean)
    const nums = parts.map((p) => Number(p))
    if (nums.some((n) => !Number.isFinite(n))) return 0

    if (nums.length === 3) {
      const [hh, mm, ss] = nums
      const total = Math.max(0, hh) * 60 + Math.max(0, mm) + Math.max(0, ss) / 60
      return total > 0 ? total : 0
    }

    if (nums.length === 2) {
      const [a, b] = nums
      // Heuristică:
      // - "0:05" e aproape sigur 5 minute (HH:MM).
      // - Dacă prima componentă e mare (> 12), e mai probabil "MM:SS" (ex: 30:00 -> 30 min).
      if (a === 0) {
        const total = Math.max(0, b)
        return total > 0 ? total : 0
      }
      if (a > 12) {
        const total = Math.max(0, a) + Math.max(0, b) / 60
        return total > 0 ? total : 0
      }
      const total = Math.max(0, a) * 60 + Math.max(0, b)
      return total > 0 ? total : 0
    }
  }

  // 3) Doar număr: interpretăm ca minute ("30" -> 30 min)
  const n = Number(s)
  if (Number.isFinite(n) && n > 0) return n

  // 4) Fallback: încercăm parseInt (ex: "30 min" ar fi prins sus, dar ca safety net)
  const pi = parseInt(s, 10)
  if (Number.isFinite(pi) && pi > 0) return pi

  return 0
}

export function parseServiceTimeToSeconds(raw: unknown): number {
  const minutes = parseServiceTimeToMinutes(raw)
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.round(minutes * 60)
}

/**
 * Formatează diferența de timp între două date în format exact "Xh Ymin" (fără aproximări).
 * Folosit pentru afișarea timpului "În lucru" sau "În așteptare" în loc de "circa 1 oră".
 */
export function formatExactDuration(startDate: Date, endDate: Date = new Date()): string {
  const diffMs = endDate.getTime() - startDate.getTime()
  if (diffMs <= 0) return '0min'
  
  const totalMinutes = Math.floor(diffMs / (1000 * 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}min`
  } else if (hours > 0) {
    return `${hours}h`
  } else {
    return `${minutes}min`
  }
}

