# Prompt pentru Claude Sonnet: Search bar inteligent (lead-uri, fișe, tăvițe, serial, telefon, email)

Copiază secțiunile de mai jos și dă-le ca context lui Claude Sonnet, apoi cererea ta (ex: „Implementează un search bar global care…”).

---

## 1. Context proiect

- **Stack:** Next.js (App Router), React, TypeScript, Supabase (PostgreSQL + Auth).
- **Aplicație:** CRM intern – pipeline-uri (Vânzări, Recepție, departamente tehnice), lead-uri, fișe de serviciu, tăvițe (quotes/trays), instrumente cu serial/brand.
- **Autentificare:** API-urile folosesc sesiunea Supabase; rutele de search sunt protejate (necesită user autentificat).

---

## 2. Ce trebuie să facă search bar-ul inteligent

Un **singur** câmp de căutare care să găsească:

- **Lead-uri** după: nume (`full_name`), companie (`company_name`), **telefon** (cu normalizare: 0721…, +40721…, 40721…), **email**.
- **Fișe de serviciu** după: număr fișă (`service_files.number`), sau prin lead (nume/telefon/email).
- **Tăvițe** după: număr tăviță (`trays.number`), sau prin lead asociat.
- **Fișe / tăvițe după serial:** instrumente și articole au seriale în `tray_item_brand_serials` (câmp `serial_number`); căutarea după serial trebuie să returneze fișa/tăvița/lead-ul corespunzător.

Comportament dorit: un input global (ex. în header sau sidebar) care, la 2+ caractere, afișează rezultate unificate (lead / fișă / tăviță) cu tip, titlu, subtitlu și la click deschide detaliul corespunzător în pipeline-ul corect.

---

## 3. Ce există deja în cod

### 3.1 API căutare unificată

- **Rută:** `GET /api/search/unified?q=...`
- **Fișier:** `app/api/search/unified/route.ts` – truncare query (max 200 caractere), minim 2 caractere, auth, apelează `searchUnifiedWithClient`.
- **Server:** `lib/supabase/unifiedSearchServer.ts`:
  - **Strategie 1:** RPC `search_unified(p_query, p_limit)` – un singur apel DB (dacă există funcția în DB).
  - **Strategie 2 (fallback):** query-uri directe:
    - **Leads:** `leads` cu `or(full_name.ilike, company_name.ilike, phone_number.ilike, email.ilike)`; plus căutare **telefon normalizat** prin `normalizePhoneNumber()` (din `lib/utils`) și variante 0 / +40 / 40.
    - **Fișe:** `service_files` după `number` ilike și după `lead_id` în leadIds găsiți la pasul leads.
    - **Tăvițe:** după `trays.number` și după fișe ale lead-urilor găsite.
  - **Nu face încă:** căutare explicită în **serial numbers** (`tray_item_brand_serials.serial_number`); tăvițele apar doar prin lead sau număr tăviță.

### 3.2 Căutare tăvițe (serial, număr, brand)

- **Server:** `lib/supabase/traySearchServer.ts` – `searchTraysGloballyWithClient(supabase, query)`.
- Caută: număr tăviță, **serial_number** în `tray_item_brand_serials`, brand.
- Returnează structură bogată (inclusiv `matchType: 'serial_number'`, lead name/phone/email).
- **API:** `GET /api/search/trays?q=...` – există rută separată.

### 3.3 Căutare după serial pe pagina de pipeline

- În **`app/(crm)/leads/[pipeline]/page.tsx`**:
  - State `serialSearchMatchIds: { leadIds, serviceFileIds, trayIds }`.
  - `useEffect` pe `filters.searchQuery`: apelează **`searchTraysGlobally`** (din `lib/supabase/traySearchOperations`) și setează `serialSearchMatchIds`.
  - Filtrarea `filteredLeads` ține cont de aceste ID-uri (lead / service_file / tray) plus căutare în câmpuri (nume, email, telefon normalizat, tag-uri, nr. fișă, nr. tăviță etc.).
- Deci pe **pagină** există deja: search bar local + căutare după serial prin `searchTraysGlobally`, dar **unified search API** nu integrează încă rezultatele după serial.

### 3.4 UI search existent

- **`components/search/TraySearch.tsx`:** input + dropdown rezultate; folosește doar **`/api/search/unified`**; afișează `UnifiedSearchResult[]` (type, id, title, subtitle, pipelineSlug, openId); la select poate apela `onSelectTray`.
- **Statistici apeluri:** `app/(crm)/dashboard/statistici-apeluri/page.tsx` – căutare lead cu `fetch(\`/api/search/unified?q=...\`)`, filtrează `type === 'lead'`.
- **SmartTraySearch:** `components/search/SmartTraySearch.tsx` – folosit pentru deschidere din URL (ex. `?openSearch=1&q=...`); folosește și el contextul de search unificat.

### 3.5 Structuri date relevante

- **leads:** `id`, `full_name`, `company_name`, `phone_number`, `email`, plus alte câmpuri (address, etc.).
- **service_files:** `id`, `number`, `lead_id`; legătură cu `leads`.
- **trays:** `id`, `number`, `service_file_id`; legătură cu `service_files` și `leads`.
- **tray_item_brand_serials:** seriale per item; legătură la `tray_items` → `trays` → `service_files` → `leads`.
- **UnifiedSearchResult** (în `lib/supabase/unifiedSearchServer.ts`): `type: 'lead' | 'service_file' | 'tray'`, `id`, `title`, `subtitle`, `pipelineSlug`, `openId`, opțional `pipelineName`, `stageName`.

### 3.6 Utilitare

- **`normalizePhoneNumber(s)`** – în `lib/utils.ts` – pentru potrivire telefon (digits only, variante 0/+40/40).
- **Pipeline slug:** din `pipeline_items` + `pipelines.name` (ex. vanzari, receptie, saloane); se folosește pentru redirecționare și deschidere în pipeline-ul corect.

---

## 4. Cerințe tehnice pentru „search bar inteligent”

1. **Un singur API** (sau unul „unificat” care intern poate folosi și search-ul după serial):
   - Fie extinde `searchUnifiedWithClient` (și dacă e cazul RPC `search_unified`) să includă și rezultate din **serial numbers** (`tray_item_brand_serials`), cu mapare la lead / fișă / tăviță.
   - Fie un nou endpoint care combină unified + tray/serial și returnează același format `UnifiedSearchResult[]`.

2. **Telefon:** păstrați normalizarea (0, +40, 40) și potrivire parțială unde e cazul (așa cum e în `unifiedSearchServer.ts`).

3. **Email / nume / companie:** păstrați căutarea existentă (ilike / or) pe `leads` și propagarea la fișe/tăvițe după `lead_id`.

4. **Seriale:** căutare în `tray_item_brand_serials.serial_number` (ilike sau trigram dacă există), apoi returnare lead + fișă + tăviță corespunzătoare, în același format unificat (type, id, title, subtitle, pipelineSlug, openId), astfel încât un singur search bar să poată afișa și „Fișă X – Serial: Y” / „Tăviță Z – Serial: Y”.

5. **UI:**
   - Un singur input (global, ex. în header sau sidebar) care apelează acest API unificat.
   - Debounce (ex. 250–350 ms) și minim 2 caractere.
   - Dropdown cu rezultate grupate sau etichetate după tip (Lead / Fișă / Tăviță / Serial); la click → navigare la lead/fișă/tăviță în pipeline-ul corect (folosind `pipelineSlug` și `openId` existente).
   - Comportament accesibil (keyboard: săgeți, Enter, Escape).

6. **Performanță:** păstrați limit (ex. 25 total, 15 per tip) și evitați N+1; dacă RPC `search_unified` există în DB, extindeți-o să includă și seriale, altfel folosiți fallback-ul din `unifiedSearchServer` + un apel suplimentar pentru seriale (sau îmbinați logic din `traySearchServer` / `traySearchOperations`).

---

## 5. Fișiere cheie de citit/modificat

- `app/api/search/unified/route.ts` – API-ul actual.
- `lib/supabase/unifiedSearchServer.ts` – logica unificată (RPC + fallback); aici se poate adăuga/integra căutarea după serial.
- `lib/supabase/traySearchServer.ts` și `lib/supabase/traySearchOperations.ts` – căutare tăvițe + serial; pot fi refolosite în unified.
- `lib/utils.ts` – `normalizePhoneNumber`.
- `components/search/TraySearch.tsx` – componentă search existentă; poate fi refolosită sau extinsă pentru „search bar global”.
- `app/(crm)/leads/[pipeline]/page.tsx` – unde e folosită căutarea locală și `serialSearchMatchIds`; poate rămâne pentru filtrare pe pagină sau poate folosi același API unificat.
- `lib/types/database.ts` – tipuri lead, service_file, tray dacă sunt necesare pentru tipuri noi.

---

## 6. Exemplu de cerere pentru Claude

După ce ai lipit contextul de mai sus, poți scrie:

„Implementează un search bar inteligent global care:
1. Folosește un singur input și un singur API (extinde sau unifică cu ce există la /api/search/unified).
2. Caută lead-uri după nume, companie, telefon (normalizat) și email; fișe după număr și prin lead; tăvițe după număr și prin lead; și fișe/tăvițe/lead-uri după serial number (tray_item_brand_serials).
3. Returnează rezultate în formatul unificat existent (type, id, title, subtitle, pipelineSlug, openId) și afișează un dropdown cu rezultate; la click să deschidă lead-ul/fișa/tăvița în pipeline-ul corect.
4. Plasează search bar-ul în [header-ul aplicației / sidebar / etc. – specifică] și păstrează debounce + minim 2 caractere + comportament keyboard.”

---

*Document generat pentru a oferi context complet lui Claude Sonnet în vederea implementării search bar-ului inteligent.*
