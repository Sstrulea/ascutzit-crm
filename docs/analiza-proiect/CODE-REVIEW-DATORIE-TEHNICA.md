# Code Review – Datorie Tehnică și Oportunități de Refactorizare

---

## 1. Complexitate și Performanță

### 1.1 Fișiere Excesiv de Mari (God Files)

| Fișier | Linii (aprox.) | Impact | Problemă |
| :--- | :--- | :--- | :--- |
| `lib/supabase/kanban/strategies/receptie.ts` | ~2050 | **CRITIC** | Cea mai mare strategie de pipeline; o singură clasă cu **~25 apeluri secvențiale DB**, 59 bucle, 12 console.logs. Funcția `loadItems()` are o complexitate ciclomatică extrem de ridicată (cascadă if/else pe 10+ condiții de etapă). |
| `lib/supabase/tehnicianDashboard.ts` | ~2100 | **RIDICAT** | Monolit cu cache, fetch, calcule, transformări – totul într-un singur fișier. 69 cast-uri `as any`. |
| `components/kanban/lead-card.tsx` | ~2300+ | **RIDICAT** | O singură componentă React cu 135 cast-uri `as any`, 12+ handlere inline, logică de business amestecată cu UI. |
| `app/(crm)/leads/[pipeline]/page.tsx` | ~2200+ | **RIDICAT** | Pagină monolitică: 62 `as any`, 13+ `useEffect`-uri, logică pentru toate pipeline-urile (Vânzări, Recepție, Dept, QC) într-o singură componentă. |
| `components/kanban/kanban-board.tsx` | ~2000+ | **RIDICAT** | Board Kanban cu 28 `as any`, logică Drag & Drop, operații în masă, filtrare – totul într-un singur fișier. |
| `components/mobile/lead-details-sheet.tsx` | ~3000+ | **RIDICAT** | 111 cast-uri `as any`. Cea mai mare componentă din proiect, duplică logica din `lead-details-panel.tsx`. |
| `lib/supabase/serviceFileOperations.ts` | ~1900+ | **RIDICAT** | CRUD + split/merge + brand/seriale – 15 `as any`, funcții foarte lungi. |
| `lib/supabase/workSessionOperations.ts` | ~520 | **MEDIU** | 21 `as any`. |
| `hooks/preturi/usePreturiItemOperations.ts` | ~1200+ | **RIDICAT** | Hook complex cu 31 apeluri toast, 7 `as any`, logică CRUD completă. |

**Soluție propusă:** Fiecare fișier >500 linii ar trebui împărțit. Exemplu:
- `receptie.ts` → `receptie-loader.ts` + `receptie-stage-resolver.ts` + `receptie-tray-info.ts`
- `lead-card.tsx` → `LeadCardVanzari.tsx` + `LeadCardReceptie.tsx` + `LeadCardDepartment.tsx` (compuse prin wrapper)

### 1.2 Problema N+1 în Cron Jobs

| Fișier | Linie | Problemă | Impact |
| :--- | :--- | :--- | :--- |
| `app/api/cron/midnight-ro/route.ts` | ~141 | `for (const item of items) { await supabase.rpc('move_item_to_stage') }` | **N apeluri secvențiale DB**. 100 leaduri = 100 apeluri RPC + 100 INSERT items_events + 100 SELECT + UPDATE leads |
| `app/api/cron/curier-to-avem-comanda/route.ts` | ~147 | Identic: buclă `for...of` cu `await rpc()` per element | La fel: N+1 |
| `app/api/cron/vanzari-archive-no-deal/route.ts` | ~96 | `for (const item of pipelineItems)` cu multiple apeluri DB per element | La fel: N+1 |

**Soluție propusă:** Operații batch. Creează o funcție RPC `move_items_to_stage_batch(items[], target_stage_id)` care procesează toate mutările într-o singură tranzacție PostgreSQL.

### 1.3 Query-uri Redundante în Strategia Recepție

| Zonă | Problemă | Impact |
| :--- | :--- | :--- |
| `receptie.ts` liniile 100-320 | 5 query-uri separate la pornire: `service_files` (2 variante fallback), `trays`, `pipeline_items`, `items_events` | **Mediu** – adaugă ~200ms la încărcare. Ar trebui consolidate cu JOIN-uri sau un singur RPC. |
| `receptie.ts` funcția `getAllTraysInfoForServiceFiles` | Apelează `pipeline_items` + `trays` + `stages` + `items_events` (QC) într-o iterație complexă | **Ridicat** – mai multe round-trip-uri pentru fiecare fișă de serviciu |
| `receptie.ts` liniile 1006-1014 | Încărcare conversații + mesaje per lead (N+1) | **Mediu** – un SELECT conversații + N SELECT mesaje |

**Soluție propusă:** Consolidare într-un singur RPC `get_receptie_dashboard(pipeline_id)` care returnează toate datele necesare cu JOIN-uri server-side.

---

## 2. Cod Duplicat

### 2.1 Patternul "WE USE FOR LOOP INSTEAD OF .some() - SAFER"

| Instanțe | Fișiere Afectate | Impact |
| :--- | :--- | :--- |
| **~40 instanțe** | 20+ fișiere | **RIDICAT** (mentenabilitate) |

Exemplu tipic (repetat în 40 de locuri):
```typescript
// WE USE FOR LOOP INSTEAD OF .some() - SAFER
let found = false
for (let i = 0; i < array.length; i++) {
  if (array[i] && condition) {
    found = true
    break
  }
}
```

**Problemă:** `.some()` / `.find()` au fost înlocuite manual cu bucle for peste tot, probabil din cauza unui bug anterior. Aceasta:
- Adaugă ~5-8 linii per apariție (vs 1 linie cu `.some()`).
- Face codul mai greu de citit și de întreținut.
- Patternul este inutil – `.some()` funcționează corect pe array-uri non-null.

**Soluție propusă:** Creează un utilitar `safeFind(arr, predicate)` / `safeIncludes(arr, predicate)` care verifică null/undefined înainte de `.some()`, apoi înlocuiește toate instanțele.

### 2.2 Logică duplicată: `lead-details-panel.tsx` vs `lead-details-sheet.tsx` (mobil)

| Fișier Desktop | Fișier Mobil | Duplicare |
| :--- | :--- | :--- |
| `components/leads/lead-details-panel.tsx` (~1500 linii) | `components/mobile/lead-details-sheet.tsx` (~3000 linii) | ~70% logică identică |

**Problemă:** Panoul de detalii lead are două implementări separate: una pentru desktop și una pentru mobil, cu logică de business duplicată (handlere, stare, apeluri API).

**Soluție propusă:** Extrage logica într-un hook partajat `useLeadDetails()` și componente UI separate (layout desktop vs layout mobil) care consumă același hook.

### 2.3 Creare Client Supabase – 3 Patternuri Diferite

| Pattern | Fișiere | Utilizare |
| :--- | :--- | :--- |
| `createRouteHandlerClient({ cookies })` | ~27 rute API | Bazat pe cookie, stil depreciat |
| `createApiSupabaseClient()` | ~5 rute API | Wrapper modern (api-helpers.ts) |
| `createClient(URL, SERVICE_KEY)` direct | ~6 fișiere (`facturare.ts`, `advancedStatistics.ts`, webhooks) | Client fără auth, inline |

**Problemă:** Trei moduri diferite de a crea clientul Supabase pe server-side. `createRouteHandlerClient` este patternul vechi (`@supabase/auth-helpers-nextjs`), iar `createApiSupabaseClient` este cel nou (`@supabase/ssr`).

**Soluție propusă:** Migrare la un singur helper: `createApiSupabaseClient()` pentru cereri cu scop de utilizator și `createAdminClient()` pentru service-role. Elimină `createRouteHandlerClient` din toate rutele.

### 2.4 Căutare Etapă după Nume – Repetată Inline

Constructul `stages.find(s => s.name.toLowerCase().includes('...'))` apare în **~60+ locuri**, în loc să folosească `findStageByPattern()` din `constants.ts`.

| Exemplu | Fișiere |
| :--- | :--- |
| `stages.find(s => s.name.toLowerCase().includes('arhiv'))` | `standard.ts`, `receptie.ts`, `page.tsx`, `lead-card.tsx` |
| `stages.find(s => s.name.toLowerCase().includes('no') && s.name.toLowerCase().includes('deal'))` | `midnight-ro`, `standard.ts`, `page.tsx` |

**Soluție propusă:** Utilizarea consistentă a `findStageByPattern(stages, 'ARHIVAT')` din `constants.ts` – funcția există deja dar nu este folosită peste tot.

---

## 3. Consistență

### 3.1 Cast-uri `as any` – 1300+ Instanțe

| Fișiere de Top | Număr |
| :--- | :--- |
| `lead-card.tsx` | 135 |
| `lead-details-sheet.tsx` (mobil) | 111 |
| `vanzariApeluri.ts` | 104 |
| `tehnicianDashboard.ts` | 69 |
| `page.tsx` (pipeline) | 62 |
| `lead-contact-info.tsx` | 55 |
| **Total Proiect** | **~1300+** |

**Impact:** Siguranța tipurilor complet eliminată în zonele critice de business. Bug-urile de tip sunt mascate.

**Soluție propusă:** Generează tipurile Supabase cu `supabase gen types typescript` → `lib/types/supabase.ts`, apoi înlocuiește progresiv `as any` cu tipuri concrete. Prioritate: fișierele cu >50 cast-uri.

### 3.2 Denumire Inconsistentă

| Inconsistență | Exemple | Impact |
| :--- | :--- | :--- |
| Diacritice vs fără | `RECEPCIE_PIPELINE_NAME = 'Recepție'` dar helper-ul verifică `['Recepție', 'Receptie']` | **Mediu** – necesită fallback-uri |
| camelCase vs snake_case | `serviceFileId` (JS) vs `service_file_id` (DB) – ok, dar `curier_scheduled_at` (câmp lead) nu are mapare consistentă | **Scăzut** |
| Fișiere: kebab-case vs camelCase | `lead-card.tsx`, `lead-details-panel.tsx` vs `VanzariPanel.tsx`, `DeFacturatOverlay.tsx` | **Scăzut** – inconsistent |
| Handlere: `handle*` vs inline | Unele componente au `handleSave`, altele au `onClick={async () => { ... 20 linii ... }}` | **Mediu** – codul inline este greu de testat |

### 3.3 Cod Mort și Fișiere Backup

| Fișier | Tip | Impact |
| :--- | :--- | :--- |
| `components/kanban/lead-card.backup.tsx` | Fișier backup | **Scăzut** – nu este importat nicăieri, ar trebui șters |
| `components\leads\lead-details-panel.tsx` (copie git untracked) | Duplicat cu cale backslash | **Scăzut** – confuzie în git status |
| `hooks\preturi\usePreturiTrayOperations.ts` (copie git untracked) | Duplicat untracked | **Scăzut** |
| `hooks\usePreturiBusiness.ts` (copie git untracked) | Duplicat untracked | **Scăzut** |
| `lib\types\preturi.ts` (copie git untracked) | Duplicat untracked | **Scăzut** |
| `DASHBOARD_MAIN_ACTIVE = false` | Flag de funcționalitate hardcodat | **Scăzut** – dashboard dezactivat permanent |

### 3.4 Instrucțiuni Console.log Excesive

| Zonă | Număr | Impact |
| :--- | :--- | :--- |
| `receptie.ts` | 12+ `console.log` cu prefix `[Receptie DB]` | **Mediu** – zgomot în consola de producție |
| `api-helpers.ts` | `console.log('[requireAuth]')`, `console.log('[requireOwner]')` la fiecare apel | **Mediu** – expune informații de autentificare în loguri |
| Strategii Kanban | Multiple `console.warn('[Strategy]')` | **Scăzut** – util doar în timpul depanării |

**Soluție propusă:** Implementează un logger cu niveluri (debug/info/warn/error) care se dezactivează automat în producție, similar cu `process.env.NODE_ENV === 'development'` (deja folosit în unele locuri).

---

## 4. Sugestii de Refactorizare (Top 5)

### Prioritatea 1: Spargerea Fișierelor Monolit (Impact: RIDICAT, Efort: MEDIU)

**Acțiune:** Împarte cele 6 fișiere >1500 linii în module focalizate:

| Fișier Curent | Împărțire Propusă |
| :--- | :--- |
| `receptie.ts` (2050 linii) | `receptie-loader.ts` (fetch date), `receptie-stage-resolver.ts` (determinare etapă), `receptie-tray-info.ts` (agregare tăvițe) |
| `lead-card.tsx` (2300 linii) | `LeadCardBase.tsx` (layout), `useLeadCardHandlers.ts` (handlere), `LeadCardVanzari.tsx` / `LeadCardReceptie.tsx` (specifice pipeline-ului) |
| `page.tsx` [pipeline] (2200 linii) | `useKanbanPage.ts` (stare + logică), `KanbanPageVanzari.tsx`, `KanbanPageReceptie.tsx` (render per pipeline) |
| `lead-details-sheet.tsx` (3000 linii) | Unificare cu `lead-details-panel.tsx` printr-un hook partajat `useLeadDetailsLogic` + componente layout separate |

**Beneficii:** Review-uri de cod mai ușoare, izolarea bug-urilor, posibilitate de testare unitară.

---

### Prioritatea 2: Eliminarea Patternului "for loop instead of .some()" (Impact: MEDIU, Efort: SCĂZUT)

**Acțiune:**
1. Creează utilitar în `lib/utils.ts`:
```typescript
export function safeFind<T>(arr: T[] | null | undefined, predicate: (item: T) => boolean): T | undefined {
  if (!arr || !Array.isArray(arr)) return undefined
  return arr.find(predicate)
}

export function safeSome<T>(arr: T[] | null | undefined, predicate: (item: T) => boolean): boolean {
  if (!arr || !Array.isArray(arr)) return false
  return arr.some(predicate)
}
```
2. Înlocuiește toate cele ~40 de instanțe cu `safeSome()` / `safeFind()`.
3. Elimină comentariile "WE USE FOR LOOP".

**Beneficii:** ~200 de linii de cod eliminate, lizibilitate crescută, un singur loc de corectat dacă apare vreun bug cu array-urile.

---

### Prioritatea 3: Operații DB Batch în Cron Jobs (Impact: RIDICAT, Efort: MEDIU)

**Acțiune:** Creează o funcție RPC PostgreSQL:
```sql
CREATE OR REPLACE FUNCTION move_items_to_stage_batch(
  p_type text,
  p_item_ids uuid[],
  p_pipeline_id uuid,
  p_new_stage_id uuid
) RETURNS integer AS $$
  -- UPDATE toate pipeline_items într-o singură instrucțiune
  -- INSERT toate items_events într-o singură instrucțiune
  -- RETURN numărul de elemente mutate
$$ LANGUAGE plpgsql;
```

Apoi înlocuiește buclele `for...of` din cron jobs cu un singur apel:
```typescript
const { data } = await supabase.rpc('move_items_to_stage_batch', {
  p_type: 'lead',
  p_item_ids: items.map(i => i.item_id),
  p_pipeline_id: vanzari.id,
  p_new_stage_id: arhivat.id
})
```

**Beneficii:** Reduce N apeluri DB → 1, durata cron-ului de la ~30s la ~1s pentru 100 elemente, reduce riscul de timeout pe Vercel (limită de 10s).

---

### Prioritatea 4: Generare și Utilizare Tipuri Supabase (Impact: RIDICAT, Efort: RIDICAT)

**Acțiune:**
1. Generează tipurile: `npx supabase gen types typescript --project-id YOUR_PROJECT > lib/types/supabase.ts`
2. Actualizează `supabaseBrowser()` și `createAdminClient()` cu tipurile generate:
```typescript
import type { Database } from '@/lib/types/supabase'
const supabase = createBrowserClient<Database>(url, key)
```
3. Înlocuiește progresiv `as any` cu tipuri concrete (prioritate: fișierele cu >50 cast-uri).

**Beneficii:** TypeScript detectează bug-urile la compile-time, autocompletare pe query-uri, eliminarea treptată a celor ~1300 `as any`.

---

### Prioritatea 5: Unificarea Creării Clientului Supabase pe Server-Side (Impact: MEDIU, Efort: SCĂZUT)

**Acțiune:**
1. Migrează toate rutele API de la `createRouteHandlerClient({ cookies })` (vechi) la `createApiSupabaseClient()` (nou).
2. Elimină importul `@supabase/auth-helpers-nextjs` din `package.json` (păstrează doar `@supabase/ssr`).
3. Adaugă `createServiceClient()` în `api-helpers.ts` pentru cazurile care necesită service role fără auth.

**Beneficii:** Un singur pattern de creare a clientului, eliminarea dependenței depreciate, confuzie redusă la integrarea noilor dezvoltatori.

---

## 5. Sumar Metrici

| Metrică | Valoare | Țintă Recomandată |
| :--- | :--- | :--- |
| Fișiere > 1000 linii | ~10 | 0 |
| Fișiere > 500 linii | ~25 | < 5 |
| Cast-uri `as any` | ~1300 | < 50 |
| Pattern "for loop SAFER" | ~40 instanțe | 0 |
| Console.log în strategii | ~30+ | 0 (logger cu niveluri) |
| Cod mort / fișiere backup | 5+ | 0 |
| Patternuri de creare client Supabase | 3 | 1 |
| Cron jobs cu N+1 | 3 | 0 |

---

*Raport generat prin analiza codului sursă, patternurilor și structurii proiectului Ascutzit CRM.*
