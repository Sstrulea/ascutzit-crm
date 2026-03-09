# Analiză: funcțiile care mută cardurile fișelor de serviciu în pipeline-ul Recepție

## 1. Prezentare generală

Mutarea fișelor de serviciu (`service_file`) în pipeline-ul **Recepție** se face din două surse principale:

- **Automat (la încărcare)** – strategia `ReceptiePipelineStrategy` calculează stage-ul „corect” pentru fiecare fișă și aplică update-uri în batch pe `pipeline_items`.
- **Manual** – utilizatorul mută cardul (drag-and-drop), apasă butonul „Mută în De facturat”, sau alte acțiuni (Nu răspunde, Colet ajuns, etc.) care apelează `moveItemToStage('service_file', ...)` sau `addServiceFileToPipeline`.

Nivelul comun pentru persistență este **`pipeline_items`** (coloane: `type='service_file'`, `item_id`, `pipeline_id`, `stage_id`), iar mutarea efectivă se face fie prin RPC **`move_item_to_stage`**, fie prin UPDATE/INSERT direct pe `pipeline_items` în strategie.

---

## 2. Intrări în pipeline-ul Recepție (adăugare fișă)

Fișa apare în Recepție când se creează un rând în `pipeline_items` cu `pipeline_id` = ID-ul pipeline-ului Recepție și `type = 'service_file'`.

| Locație | Funcție / acțiune | Scop |
|--------|---------------------|------|
| `lib/supabase/pipelineOperations.ts` | `addServiceFileToPipeline(serviceFileId, pipelineId, stageId)` | Wrapper peste `addItemToPipeline('service_file', ...)`: INSERT sau UPDATE `pipeline_items`. |
| `lib/supabase/kanban/strategies/receptie.ts` | În `loadItems`, blocul de mutări automate | Fișe „virtuale” (ex. `office_direct` / `curier_trimis`) care nu au încă rând în Recepție: se adaugă prin **INSERT** în `pipeline_items` (vezi `movesWithoutRow` → `toInsert`). |
| `hooks/preturi/usePreturiSaveOperations.ts` | După salvare / schimbare status (ex. Comandă, Curier trimis) | Găsește pipeline-ul Recepție și stage-ul potrivit, apelează `addServiceFileToPipeline(fisaId, receptiePipeline.id, stage.id)`. |
| `hooks/preturi/usePreturiDeliveryOperations.ts` | La „Office direct” / livrare | `addServiceFileToPipeline(fisaId, receptiePipeline.id, officeStage.id)`. |
| `components/leads/NuRaspundeOverlay.tsx` | La „Retrimite în departament” (Colet ajuns) | Mută fișa în stage-ul Colet ajuns: `moveItemToStage('service_file', fisaId, receptie.id, coletAjunsStage.id)`. |

---

## 3. Mutare automată (strategia Recepție)

**Fișier:** `lib/supabase/kanban/strategies/receptie.ts`  
**Moment:** La fiecare `loadItems()` pentru pipeline-ul Recepție (la deschidere pagină / refresh).

### 3.1 Flux

1. Se încarcă `pipeline_items` (Recepție + tăvițe în departamente), `service_files` (inclusiv cu `office_direct` / `curier_trimis`), tăvițe, evenimente din `items_events`, taguri, etc.
2. Se calculează pentru fiecare fișă **stage-ul țintă** după o **prioritate fixă** (de la cea mai mare la cea mai mică). Prima condiție îndeplinită „câștigă” și fișa este programată pentru acel stage.
3. Se construiește lista `moves: MoveEntry[]` (per fișă: `serviceFileId`, `targetStage`, `pipelineItem`).
4. Mutările se **aplică**:
   - dacă există rânduri în `pipeline_items` pentru fișe: **UPDATE** `stage_id` (și opțional `updated_at`) în batch pe `pipeline_items`;
   - pentru fișe fără rând (ex. doar virtuale): **INSERT** în `pipeline_items` cu `addServiceFileToPipeline` ca fallback la eroare.
5. După mutări, pentru fișe în „Colet ajuns” se curăță flag-ul `colet_neridicat` pe `service_files`.
6. Item-urile sunt transformate în `KanbanItem[]` (inclusiv cu stage-ul deja actualizat în memorie).

### 3.2 Prioritatea stage-urilor (ordine de verificare)

Ordinea din cod (prima condiție care se potrivește oprește verificarea și determină mutarea):

| Prioritate | Stage țintă | Condiție |
|------------|-------------|----------|
| **VIII** (max) | **Arhivat** | Fișa are cel puțin o tăviță cu număr „-copy” (arhivată). |
| **VIIb** | **Colet ajuns** | `service_files.colet_ajuns === true` (marcat „Trimis”). *(Detalii în secțiunea 3.2.1.)* |
| **VII** | **De trimis** | Există eveniment în `items_events` pentru fișă: `de_trimis` sau `stage_change` → „de trimis”. |
| **VII** | **Ridic personal** | Există eveniment `ridic_personal` sau `stage_change` → „ridic personal”. |
| **VI** | **Nu răspunde** | Tag „Nu răspunde” pe lead sau `service_files.nu_raspunde_callback_at` setat. |
| **V** | **De facturat** | (a) Există eveniment `de_facturat` / `stage_change` → „facturat”, **sau** (b) toate tăvițele fișei sunt validate QC (`allTraysQcValidated`) sau (toate finalizate + toate validate QC). |
| **IV** | **In așteptare** | Cel puțin o tăviță în stage „In așteptare” în pipeline-uri de departament. |
| **III** | **In lucru** | Cel puțin o tăviță „In lucru”; sau toate finalizate dar nu toate validate QC; sau cel puțin una finalizată dar nu toate. |
| **II** | **Colet neridicat** | Eveniment `colet_neridicat` sau `service_files.colet_neridicat === true`. |
| **II** | **Colet ajuns** | Eveniment `colet_ajuns` / stage „colet ajuns”; sau fallback: are tăvițe în departamente dar nu toate finalizate+validate QC. |
| **I** (min) | **Curier trimis** | `service_files.curier_trimis === true` și nu `colet_neridicat`. **Nu** se aplică dacă fișa e deja în De facturat / De trimis / Ridic personal / Arhivat (nu se mută înapoi). |
| **I** | **Office direct** | `service_files.office_direct === true`. |

#### 3.2.1 Detalii: VIIb – Colet ajuns (flag `colet_ajuns`)

**Ce înseamnă:** Fișa este considerată „Trimis” / „Colet ajuns” (coletul a ajuns la client sau a fost ridicat). Prioritatea VIIb este **mai mare** decât De trimis (VII), astfel că dacă cineva a marcat explicit fișa ca „Trimis” (colet ajuns), cardul merge în coloana **Colet ajuns**, nu în De trimis.

**Unde se setează `colet_ajuns = true`:**

- **API:** `app/api/service-files/set-colet-ajuns/route.ts` – POST cu `serviceFileIds`. Actualizează `service_files.colet_ajuns = true` pentru fișele date și opțional inserează în `items_events` evenimente `event_type: 'colet_ajuns'` (pentru consistență cu celelalte reguli).
- **UI – De facturat:** `components/leads/DeFacturatOverlay.tsx` – la anumite acțiuni (ex. marcare pentru facturare) se apelează `updateServiceFile(fisaId, { colet_ajuns: true })`.
- **UI – Nu răspunde:** `components/leads/NuRaspundeOverlay.tsx` – la „Retrimite în departament” se apelează `updateServiceFile(fisaId, { ..., colet_ajuns: true })`.

**În strategia Recepție** (`receptie.ts`):

- La încărcare se citesc fișele cu `service_files.colet_ajuns` (inclus în select-ul din fetchers).
- În bucla de prioritate, pentru fiecare fișă: `const hasColetAjunsFlag = (serviceFile as any).colet_ajuns === true`. Dacă e true și există stage-ul „Colet ajuns” (`coletAjunsStage`), fișa este adăugată în `moves` cu `targetStage = coletAjunsStage` și în setul `serviceFileIdsInColetAjuns`.
- După aplicarea mutărilor, pentru toate fișele din `serviceFileIdsInColetAjuns` se face UPDATE pe `service_files` setând `colet_neridicat = false` (coletul a ajuns, deci nu mai e „neridicat”).

**De ce VIIb e separat de VII (evenimente):** Evenimentul `colet_ajuns` din `items_events` (prioritate II) poate apărea și din alte fluxuri; flag-ul `colet_ajuns` pe fișă este o marcă explicită „Trimis” și are prioritate mare ca să nu fie suprascris de alte reguli (ex. De trimis).

---

### 3.2.2 Unde se află informația despre stage-ul în care trebuie să fie cardul fișei

Informația este în două straturi:

**1. Lista de stage-uri (nume + id) – definiția coloanelor**

- **Sursa:** Baza de date – tabelul **`stages`** (legat de pipeline prin `pipeline_id`). Fiecare stage are cel puțin: `id`, `name`, `pipeline_id`.
- **În aplicație:** Se încarcă prin **`getCachedPipelinesAndStages()`** (din modulul kanban). Rezultatul conține `pipelines` și **`stages`** – o listă flat a tuturor stage-urilor cu `id`, `name`, `pipeline_id`.
- **Contextul strategiei:** La `getKanbanItems(pipelineId, ...)` se construiește `context` cu **`allStages`** = această listă de stage-uri. Pentru pipeline-ul Recepție se filtrează stage-urile acestui pipeline: **`receptieStages = getStagesForPipeline(context.allStages, context.pipelineId)`** (în `lib/supabase/kanban/cache.ts` – filtrare după `pipeline_id`). De aici vine lista de coloane (In lucru, Colet ajuns, De facturat, etc.) și id-urile lor.

**2. Care stage anume pentru fiecare fișă – decizia de mutare**

- **Nu** există un câmp unic „stage recomandat” stocat pe fișă. Stage-ul țintă se **calculează** la fiecare încărcare în **strategia Recepție**, după regulile de prioritate (VIII → I).
- **Maparea nume stage → obiect stage (id + name):** Din `receptieStages` se obțin variabilele folosite în cod, de exemplu:
  - **Colet ajuns:** `coletAjunsStage = findColetAjunsStage(receptieStages)` – în `lib/supabase/kanban/constants.ts`. Caută un stage al cărui nume conține „colet” și „ajuns” (sau, fallback, se potrivește cu pattern-ul `COLET_AJUNS`: „colet ajuns”, „tavite raft”, etc.).
  - **Alte coloane:** `findStageByPattern(receptieStages, 'DE_FACTURAT')`, `findStageByPattern(receptieStages, 'IN_LUCRU')`, etc. Fiecare folosește **`STAGE_PATTERNS`** din `constants.ts` (liste de variante de nume: ex. DE_FACTURAT → „facturat”, „de facturat”, „to invoice”).
- **Rezultat:** Pentru fiecare fișă, strategia obține un **`targetStage`** (obiect `{ id, name }`) din acești `receptieStages`. Acel `targetStage.id` este cel scris în **`pipeline_items.stage_id`** la UPDATE/INSERT. Deci „în ce coloană stă cardul” este stocat în **`pipeline_items.stage_id`**, iar **ce coloană ar trebui să fie** (conform regulilor) se decide în strategie folosind `receptieStages` și regulile de prioritate.

**Rezumat:** Lista de stage-uri (definiția coloanelor) vine din **DB → `stages` → getCachedPipelinesAndStages() → context.allStages → receptieStages**. Stage-ul țintă per fișă se obține din **receptieStages** prin **findColetAjunsStage()** / **findStageByPattern()** (nume → id), iar persistența poziției cardului este în **`pipeline_items.stage_id`**.

---

### 3.3 Surse de date pentru decizie

- **Tabele:** `service_files`, `pipeline_items`, `trays`, `items_events`, `stage_history`, taguri pe lead.
- **Maps construite în strategie:**  
  `coletAjunsMap`, `coletNeridicatMap`, `deFacturatMap`, `deTrimisMap`, `ridicPersonalMap` (per `service_file_id`) din `items_events`;  
  `traysInfo` (per fișă: tăvițe, status în dept, `allFinalizare`, `allQcValidated`, etc.) din `getAllTraysInfoForServiceFiles()`.
- **QC per tăviță:** din `items_events` cu `type='tray'`, `event_type IN ('quality_validated','quality_not_validated')`; ultimul eveniment per tăviță dă `qcValidated`.

### 3.4 Aplicarea mutărilor (batch vs fallback)

- Se face **SELECT** pe `pipeline_items` pentru toate `serviceFileId` din `moves`.
- **UPDATE** în batch: grupare pe `targetStage.id`, apoi `supabase.from('pipeline_items').update({ stage_id, updated_at }).in('id', pipelineItemIds)`.
- Dacă UPDATE eșuează pentru un grup: fallback cu `moveItemToStage('service_file', serviceFileId, context.pipelineId, targetStage.id)` per fișă.
- Fișe care **nu au** rând în DB (din `movesWithoutRow`): **INSERT** în `pipeline_items`; la eroare, fallback cu `addServiceFileToPipeline(..., targetStage.id)`.

---

## 4. Mutare manuală (UI)

### 4.1 Drag-and-drop (mutare între coloane)

**Fișier:** `hooks/useKanbanData.ts` – `handleLeadMove(leadId, newStageName)`.

- **Identificare tip:** `getItemType(lead)` / `getItemId(lead)`; pentru fișă: `leadAny.isFisa`, `type === 'service_file'`.
- **Recepție, fișă:**  
  - Dacă `leadAny.isFisa && isInReceptie && currentPipelineId`: update optimist în UI, apoi `moveItemToStage(itemType, itemId, currentPipelineId, newStage.id)`.  
  - Stage-uri **blocate** pentru mutare manuală în Recepție: conțin „facturat”, „in asteptare”, „in lucru” (lista `restrictedStages`) – în aceste coloane mutarea nu e permisă din drag.
- **Fallback-uri:** dacă RPC returnează „not found in the specified pipeline”, se reîncearcă cu `currentPipelineId` sau cu pipeline-ul real din DB (`getPipelineIdForItem`).
- **După mutare reușită:** la stage „Arhivat” se apelează API-ul `/api/service-files/archive-and-release` și se pot face log-uri (ex. de_trimis, ridic_personal, curier_trimis).

### 4.2 Buton „Mută în De facturat” (forțat)

**Fișier:** `app/(crm)/leads/[pipeline]/page.tsx` – `forceMoveToDeFacturat(serviceFileId)`.

- Caută pipeline-ul Recepție și stage-ul „De facturat” din cache (`getCachedPipelinesWithStages`, `matchesStagePattern(..., 'DE_FACTURAT')`).
- Apelează `moveItemToStage('service_file', serviceFileId, receptiePipe.id, deFacturatStage.id)`.
- Afișează toast și face `refresh()`.

Butonul este expus doar pe carduri de tip `service_file` în pipeline-ul Recepție (`lead-card.tsx`, `LazyLeadCard.tsx`, `kanban-board.tsx`), în ambele layout-uri (Vânzări vs Recepție).

### 4.3 Alte acțiuni care mută fișa în Recepție

- **Nu răspunde:** `NuRaspundeOverlay.tsx` – mută fișa în stage-uri Recepție (ex. De trimis, Ridic personal, Colet ajuns) prin `moveItemToStage('service_file', fisaId, receptie.id, targetStage.id)`.
- **Vânzări → Curier trimis / Office direct:** `lib/vanzari/leadOperations.ts` – `moveItemToStage(serviceFile.id, curierTrimisStageId, 'service_file')` (semantica e pentru pipeline-ul Recepție când se trimite comanda).

---

## 5. Funcții de nivel scăzut

### 5.1 moveItemToStage

**Fișier:** `lib/supabase/pipelineOperations.ts`

```ts
moveItemToStage(type: 'lead' | 'service_file' | 'tray', itemId, pipelineId, newStageId, _fromStageId?, technicianId?)
```

- Apelează **Supabase RPC** `move_item_to_stage` cu parametrii corespunzători.
- Pentru `type === 'service_file'`: doar actualizează (sau inserează, în funcție de implementarea RPC) rândul din `pipeline_items` pentru acel `item_id` și `pipeline_id`, cu `stage_id = newStageId`.
- Returnează `{ data, error }`. Nu scrie direct în `items_events`; logarea (dacă există) e în RPC sau în apelant.

### 5.2 addServiceFileToPipeline

**Fișier:** `lib/supabase/pipelineOperations.ts`

- Apelează `addItemToPipeline('service_file', serviceFileId, pipelineId, stageId)`.
- Comportament: dacă există deja un rând în `pipeline_items` pentru acel `service_file` și pipeline → UPDATE `stage_id`; altfel INSERT.

Ambele asigură că fișa apare în pipeline-ul Recepție în stage-ul dorit și sunt folosite atât de mutări automate (fallback), cât de mutări manuale și de fluxuri din Preturi / Nu răspunde.

---

## 6. Rezumat fluxuri

| Cine / Când | Unde | Cum se mută |
|-------------|------|-------------|
| La încărcare Recepție | `receptie.ts` → `loadItems` | Prioritate stage (VIII→I); batch UPDATE/INSERT pe `pipeline_items`; fallback `moveItemToStage` / `addServiceFileToPipeline`. |
| Utilizatorul trage cardul | `useKanbanData.handleLeadMove` | `moveItemToStage('service_file', id, receptiePipelineId, newStageId)` (cu restricții pe anumite stage-uri). |
| Click „Mută în De facturat” | `page.tsx` → `forceMoveToDeFacturat` | `moveItemToStage('service_file', id, receptieId, deFacturatStageId)` + refresh. |
| Salvare / livrare (Preturi) | `usePreturiSaveOperations`, `usePreturiDeliveryOperations` | `addServiceFileToPipeline(fisaId, receptiePipeline.id, stage.id)`. |
| Nu răspunde / Retrimite | `NuRaspundeOverlay` | `moveItemToStage('service_file', fisaId, receptie.id, stage.id)`. |
| Vânzări Curier/Office | `lib/vanzari/leadOperations.ts` | `moveItemToStage(serviceFile.id, stageId, 'service_file')` (în pipeline-ul Recepție). |

---

## 7. Observații și puncte de atenție

1. **Sincronizare DB ↔ UI**  
   Mutările automate se aplică doar la `loadItems()`. Dacă în alt tab sau din alt flux (ex. API) se mută o fișă, utilizatorul vede schimbarea după refresh sau la reîncărcarea datelor.

2. **„Nu muta înapoi”**  
   În strategie există explicit verificarea `isAlreadyInLaterStage`: dacă fișa e deja în De facturat / De trimis / Ridic personal / Arhivat, nu se mai aplică mutarea în Curier trimis sau Office direct, chiar dacă `curier_trimis` / `office_direct` sunt true.

3. **De facturat automat**  
   Mutarea în De facturat se face fie la eveniment explicit `de_facturat`, fie când toate tăvițele au `qcValidated === true` (sau toate finalizate + toate validate QC). Validarea QC vine din `items_events` cu `type='tray'` și `event_type = 'quality_validated'`.

4. **Stage-uri restricționate**  
   În Recepție, drag-and-drop-ul nu permite mutarea în coloane care conțin în nume „facturat”, „in asteptare”, „in lucru” – pentru a evita mutări greșite; mutarea în De facturat se face fie automat, fie prin butonul forțat.

5. **Performanță**  
   Strategia face mai multe query-uri (service_files, pipeline_items, trays, items_events, stage_history, taguri). Preload-urile și batch UPDATE/INSERT reduc numărul de round-trip-uri, dar la multe fișe încărcarea poate fi grea.

6. **Consistență**  
   Fallback-urile la eroare (UPDATE eșuat → `moveItemToStage` per fișă; INSERT eșuat → `addServiceFileToPipeline`) păstrează comportamentul dorit chiar dacă batch-ul eșuează parțial.

---

*Document generat pentru analiza codului care mută cardurile fișelor de serviciu în pipeline-ul Recepție.*
