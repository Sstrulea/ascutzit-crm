# Analiză Search Bar - Probleme și Soluții

## 1. Prezentare Generală

Search bar-ul unificat este implementat în:
- **Frontend**: [`components/search/GlobalSearchBar.tsx`](components/search/GlobalSearchBar.tsx)
- **API**: [`app/api/search/unified/route.ts`](app/api/search/unified/route.ts)
- **Backend**: [`lib/supabase/unifiedSearchServer.ts`](lib/supabase/unifiedSearchServer.ts)
- **Tray Search**: [`lib/supabase/traySearchServer.ts`](lib/supabase/traySearchServer.ts)

### Cerințe Utilizator
1. ✅ Căutare lead-uri (nume, email, telefon)
2. ✅ Căutare fișe de serviciu
3. ❌ Căutare fișă după tăvițe
4. ❌ Căutare fișă după serial number din instrumente
5. ⚠️ Căutare după nr telefon indiferent de format

---

## 2. Probleme Identificate

### 2.1 CRITIC: Căutarea după Serial Number nu funcționează

**Locație**: [`lib/supabase/traySearchServer.ts`](lib/supabase/traySearchServer.ts)

```typescript
// Codul actual caută DOAR după tray.number
const { data: traysByNumber } = await supabase
  .from('trays')
  .select(`...`)
  .or(numberOr)  // ← Doar number, NICI un serial!

// MatchType este întotdeauna 'tray_number'
matchType: 'tray_number',  // ← Niciodată 'serial_number'
```

**Problema**: Deși [`unifiedSearchServer.ts`](lib/supabase/unifiedSearchServer.ts:426) verifică `matchType === 'serial_number'`, funcția [`searchTraysGloballyWithClient`](lib/supabase/traySearchServer.ts:23) nu returnează niciodată acest tip.

**Impact**: Căutarea după serial number din instrumentele din tăvițe nu returnează rezultate.

---

### 2.2 CRITIC: Normalizare Numere de Telefon Incompletă

**Locație**: [`lib/utils.ts:108-120`](lib/utils.ts:108)

```typescript
export function getPhoneVariants(input: string | null | undefined): string[] {
  const digits = normalizePhoneNumber(input)
  // ...
  if (digits.startsWith('40') && digits.length > 2) {
    variants.push('0' + digits.slice(2), '+' + digits, digits)
  } else if (digits.startsWith('0')) {
    variants.push(digits, '40' + digits.slice(1), '+40' + digits.slice(1))
  } else {
    variants.push('0' + digits, '40' + digits, '+40' + digits)
  }
}
```

**Probleme**:
1. Nu gestionează formate cu spații: `0721 123 456`
2. Nu gestionează formate cu cratimă: `0721-123-456`
3. Nu gestionează paranteze: `(0721) 123 456`
4. Nu returnează variante parțiale pentru căutare incrementală

**Exemple care nu funcționează**:
- `0721 123` → nu găsește `0721123456`
- `+40 721` → nu găsește `+40721123456`

---

### 2.3 Performanță: Prea Multe Query-uri Secvențiale

**Locație**: [`lib/supabase/unifiedSearchServer.ts:211-430`](lib/supabase/unifiedSearchServer.ts:211)

Funcția `searchViaDirectQueries` execută **12+ query-uri secvențiale**:

```typescript
// 1. Leads by name
let leadsByName = await supabase.from('leads')...
// 2. Leads by company
const { data: leadsByCompany } = await supabase.from('leads')...
// 3. Leads by email
const { data: leadsByEmail } = await supabase.from('leads')...
// 4-6. Leads by phone (pentru fiecare variantă)
for (const p of phoneVariants) {
  const { data: chunk } = await supabase.from('leads')...
}
// 7. Tags
const { data: tagsByName } = await supabase.from('tags')...
// 8. Lead tags
const { data: leadTagsRows } = await supabase.from('lead_tags')...
// 9. Members (tehnicieni)
const { data: members } = await supabase.from('app_members')...
// 10. Trays by technician
const { data: traysByTech } = await supabase.from('trays')...
// 11. Service files
const { data: serviceFiles } = await supabase.from('service_files')...
// 12. Service files by lead
const { data: sfsByLead } = await supabase.from('service_files')...
// 13. Trays by lead
const { data: traysByLead } = await supabase.from('trays')...
// 14. Trays global search
const { data: trayResults } = await searchTraysGloballyWithClient...
// 15. Pipeline info
const pipelineInfo = await resolvePipelineInfo...
```

**Impact**: Latență mare, timeout-uri pe conexiuni lente.

---

### 2.4 Bug: Nu Caută în `tray_items.serials`

**Locație**: Tabelul `tray_items` are coloana `serials` (text)

Serial numbers sunt stocate în:
- `tray_items.serials` - sumă text a serial number-elor
- `tray_items.notes` - poate conține JSON cu `serial_number`

**Dar căutarea nu interoghează acest tabel**.

---

### 2.5 Bug: Căutare Fișă după Tăvițe

Când cauți după numele unui client care are doar tăvițe (fără lead direct), nu găsești fișa.

**Flux lipsă**:
```
tray_items → trays → service_files → leads
```

---

### 2.6 UI/UX: Probleme în GlobalSearchBar

**Locație**: [`components/search/GlobalSearchBar.tsx`](components/search/GlobalSearchBar.tsx)

1. **Debounce prea lung**: 400ms pentru search + 400ms pentru URL = 800ms total
2. **Nu afișează erori clar**: Doar text roșu simplu
3. **Istoric căutări**: Salvat în localStorage, dar nu este curățat niciodată
4. **Focus management**: La deschidere cu ⌘K, focus-ul nu merge întotdeauna

---

## 3. Arhitectura Actuală

```mermaid
flowchart TD
    subgraph Frontend
        A[GlobalSearchBar.tsx]
        B[SmartTraySearch.tsx]
        C[TraySearch.tsx]
    end
    
    subgraph API
        D[/api/search/unified]
    end
    
    subgraph Backend
        E[unifiedSearchServer.ts]
        F[traySearchServer.ts]
        G[RPC: search_unified]
    end
    
    subgraph Database
        H[leads]
        I[service_files]
        J[trays]
        K[tray_items]
        L[tags]
        M[lead_tags]
        N[app_members]
        O[pipeline_items]
    end
    
    A --> D
    B --> C
    C --> D
    D --> E
    E -->|RPC disponibil| G
    E -->|fallback| F
    E --> H
    E --> I
    E --> J
    E --> L
    E --> M
    E --> N
    F --> J
    F -.->|NICI un query| K
    E --> O
```

---

## 4. Soluții Propuse

### 4.1 Implementare Căutare Serial Number

**Modificare**: [`lib/supabase/traySearchServer.ts`](lib/supabase/traySearchServer.ts)

```typescript
export async function searchTraysGloballyWithClient(
  supabase: SupabaseClient,
  query: string
): Promise<{ data: TraySearchResultServer[]; error: any }> {
  // ... cod existent pentru tray.number ...

  // NOU: Căutare în tray_items.serials
  const serialVariants = getDiacriticVariants(termNorm).map(v => `serials.ilike.%${v}%`)
  const serialOr = serialVariants.length > 0 ? serialVariants.join(',') : `serials.ilike.%${searchTerm}%`
  
  const { data: traysBySerial } = await supabase
    .from('tray_items')
    .select(`
      id,
      serials,
      tray_id,
      tray:trays!inner(
        id,
        number,
        service_file_id,
        service_file:service_files!inner(
          id,
          number,
          lead_id,
          lead:leads!inner(id, full_name, email, phone_number)
        )
      )
    `)
    .not('serials', 'is', null)
    .or(serialOr)
    .limit(LIMIT_TRAYS)

  // Procesare rezultate
  for (const item of traysBySerial || []) {
    const tray = item.tray
    if (!tray?.service_file?.lead) continue
    
    results.push({
      trayId: tray.id,
      trayNumber: tray.number,
      leadId: tray.service_file.lead.id,
      leadName: tray.service_file.lead.full_name || 'Unknown',
      leadPhone: tray.service_file.lead.phone_number,
      leadEmail: tray.service_file.lead.email,
      serviceFileNumber: tray.service_file.number,
      serviceFileId: tray.service_file.id,
      matchType: 'serial_number',  // ← Corect!
      matchDetails: `Serial: ${item.serials}`,
    })
  }

  return { data: results, error: null }
}
```

---

### 4.2 Îmbunătățire Normalizare Telefon

**Modificare**: [`lib/utils.ts`](lib/utils.ts)

```typescript
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ''
  // Elimină TOATE non-digit characters, nu doar +, space, -
  return phone.replace(/\D/g, '')
}

export function getPhoneVariants(input: string | null | undefined): string[] {
  const digits = normalizePhoneNumber(input)
  if (!digits.length) return []
  
  const variants: Set<string> = new Set()
  
  // Adaugă variante de bază
  variants.add(digits)
  
  // Generează variante de prefix
  if (digits.startsWith('40') && digits.length > 2) {
    variants.add('0' + digits.slice(2))
    variants.add('+' + digits)
  } else if (digits.startsWith('0') && digits.length > 1) {
    variants.add('40' + digits.slice(1))
    variants.add('+40' + digits.slice(1))
  } else if (digits.length >= 3) {
    // Presupunem că e număr românesc fără prefix
    variants.add('0' + digits)
    variants.add('40' + digits)
    variants.add('+40' + digits)
  }
  
  // NOU: Adaugă variante parțiale pentru căutare incrementală
  // Ex: "0721" → ["0721", "40721", "+40721", "721"]
  if (digits.length >= 3 && digits.length <= 6) {
    // Dacă începe cu 0, adaugă și fără 0
    if (digits.startsWith('0')) {
      variants.add(digits.slice(1))  // "0721" → "721"
    }
    // Dacă nu începe cu 0, adaugă și cu 0
    if (!digits.startsWith('0')) {
      variants.add('0' + digits)  // "721" → "0721"
    }
  }
  
  return [...variants]
}
```

---

### 4.3 Optimizare Query-uri (Paralelizare)

**Modificare**: [`lib/supabase/unifiedSearchServer.ts`](lib/supabase/unifiedSearchServer.ts)

```typescript
async function searchViaDirectQueries(
  supabase: SupabaseClient,
  query: string
): Promise<{ data: UnifiedSearchResult[]; error: any }> {
  // ...
  
  // NOU: Execută toate query-urile independente în paralel
  const [
    leadsByNameResult,
    leadsByCompanyResult,
    leadsByEmailResult,
    tagsByNameResult,
    membersResult,
    serviceFilesResult,
    trayResults
  ] = await Promise.all([
    // 1. Leads by name
    supabase.from('leads').select('...').limit(LIMIT_PER_TYPE),
    
    // 2. Leads by company
    supabase.from('leads').select('...').limit(LIMIT_PER_TYPE),
    
    // 3. Leads by email
    supabase.from('leads').select('...').limit(LIMIT_PER_TYPE),
    
    // 4. Tags
    supabase.from('tags').select('...').limit(20),
    
    // 5. Members
    supabase.from('app_members').select('...').limit(30),
    
    // 6. Service files
    supabase.from('service_files').select('...').limit(LIMIT_PER_TYPE),
    
    // 7. Trays (include serial search)
    searchTraysGloballyWithClient(supabase, term)
  ])
  
  // Procesare rezultate...
}
```

---

### 4.4 Adăugare Căutare Fișă după Tăvițe

```typescript
// NOU: Căutare fișe prin tăvițe (indirect prin tray_items)
// Dacă avem rezultate din traySearch, extragem service_file_ids și lead_ids
const trayServiceFileIds = new Set<string>()
const trayLeadIds = new Set<string>()
for (const t of trayResults || []) {
  if (t.serviceFileId) trayServiceFileIds.add(t.serviceFileId)
  if (t.leadId) trayLeadIds.add(t.leadId)
}

// Adaugă fișe găsite prin tăvițe
if (trayServiceFileIds.size > 0) {
  const { data: sfsByTray } = await supabase
    .from('service_files')
    .select('id, number, lead_id, lead:leads(id, full_name, company_name)')
    .in('id', [...trayServiceFileIds])
  
  for (const sf of sfsByTray || []) {
    // Adaugă la rezultate...
  }
}
```

---

## 5. Plan de Implementare

### Faza 1: Bug-uri Critice
- [ ] Repară căutare serial number în `traySearchServer.ts`
- [ ] Îmbunătățire normalizare telefon în `utils.ts`
- [ ] Testare manuală cu diverse formate telefon

### Faza 2: Performanță
- [ ] Paralelizare query-uri în `unifiedSearchServer.ts`
- [ ] Adăugare caching pentru rezultate frecvente
- [ ] Optimizare debounce în frontend

### Faza 3: Funcționalități Noi
- [ ] Căutare fișă după tăvițe
- [ ] Căutare în `tray_items.notes` (JSON cu serial_number)
- [ ] Highlight rezultate în UI

### Faza 4: UI/UX
- [ ] Reducere debounce la 300ms
- [ ] Afișare erori mai clara
- [ ] Curățare istoric vechi

---

## 6. Testare

### Cazuri de Test pentru Telefon

| Input | DB Value | Rezultat Așteptat |
|-------|----------|-------------------|
| `0721` | `0721234567` | ✅ Match |
| `+40721` | `0721234567` | ✅ Match |
| `40721` | `0721234567` | ✅ Match |
| `721 234` | `0721234567` | ✅ Match |
| `(0721) 234 567` | `0721234567` | ✅ Match |
| `+40 721 234 567` | `0721234567` | ✅ Match |

### Cazuri de Test pentru Serial

| Input | Locație DB | Rezultat Așteptat |
|-------|------------|-------------------|
| `SN12345` | `tray_items.serials` | ✅ Găsește tăvița → fișa |
| `ABC-123` | `tray_items.serials` | ✅ Găsește tăvița → fișa |
| `serial123` | `tray_items.notes` JSON | ✅ Găsește tăvița → fișa |

---

## 7. Estimare Efort

| Fază | Complexitate |
|------|--------------|
| Faza 1 (Bug-uri critice) | Medie |
| Faza 2 (Performanță) | Medie |
| Faza 3 (Funcționalități) | Medie |
| Faza 4 (UI/UX) | Mică |

---

*Analiză generată la 2026-03-09*
