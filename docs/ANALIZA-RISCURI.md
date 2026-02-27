# Analiza riscurilor – Tăvițe, fișe de serviciu și fluxuri asociate

**Data:** Februarie 2026  
**Scop:** Identificarea riscurilor tehnice și operaționale legate de tăvițe, salvare V4, QC, ștergeri și cache, plus mitigări existente și recomandări.

---

## 1. LEGENDA

| Nivel risc | Semnificație |
|------------|---------------|
| **Înalt**  | Pierdere de date, comportament incorect grav, ireversibil fără backup |
| **Mediu**  | Inconsistențe vizibile, confuzie utilizator, necesită intervenție manuală |
| **Scăzut** | Edge-case, impact limitat sau ușor de corectat |

---

## 2. RISCURI LEGATE DE TĂVIȚE

### R2.1 Crearea de tăvițe duplicate (același număr sau două goale)

| ID   | Descriere | Cauză | Nivel | Mitigare existentă |
|------|-----------|--------|-------|---------------------|
| T-DUP-1 | Două tăvițe goale per fișă | Race: două apeluri `createTray('', fisaId)` concurente; ambele trec de SELECT, ambele inserează | Mediu | Reutilizare în `createTray`; la 23505 return tăvița existentă; `cleanupRedundantEmptyTraysForServiceFile` la listare |
| T-DUP-2 | Două tăvițe cu același număr (ex. 28S) | Verificare doar exact match; „28S” vs „28s” sau „28S ” creau două rânduri | Mediu | Verificare cu număr normalizat (trim + toLowerCase) în `createTray`; return tăvița existentă dacă găsit |
| T-DUP-3 | Duplicate rămase din date istorice | Date create înainte de mitigări | Scăzut | Cleanup la listare (goale); validare QC pentru toate tăvițele cu același număr; script SQL opțional |

**Recomandare:** Constraint DB pentru o singură tăviță goală per fișă (vezi `docs/sql-unique-one-empty-tray-per-fisa.sql`) reduce T-DUP-1 la zero la nivel de bază de date.

---

### R2.2 Ștergerea accidentală sau prematură a tăvițelor

| ID   | Descriere | Cauză | Nivel | Mitigare existentă |
|------|-----------|--------|-------|---------------------|
| T-DEL-1 | Ștergere din UI (context menu „Șterge tăvița”) | Utilizator apasă pe cardul tăviței pe board; confirmare poate fi insuficientă | Mediu | Alert/confirmare în UI; operația este ireversibilă – documentat |
| T-DEL-2 | Ștergere tăviță goală după mutare instrumente | În `usePreturiTrayOperations`: după mutarea tuturor instrumentelor pe tăvițe cu număr, tăvița goală se șterge automat | Scăzut | Ștergerea se face doar dacă tăvița nu are nici itemi, nici imagini |
| T-DEL-3 | Cron/API `delete-empty-trays` șterge tăvițe folosite | Tăviță cu număr gol dar cu itemi/imagine – dacă criteriul de „gol” s-ar schimba sau bug | Înalt | `deleteEmptyTrays` verifică explicit: fără itemi ȘI fără imagini; doar atunci apelează `deleteTray` |
| T-DEL-4 | Salvare V4 șterge tăvița sau conținutul | Payload incomplet (ex. după repartizare); lista „existing” nu conține tăvița; comparare numere eșuează | Mediu | Nu se golește tăvița dacă payload nu are itemi dar DB are; nu se șterge tăvița dacă are `tray_items`; comparare cu toLowerCase |

**Recomandare:** Nu rula cron `delete-empty-trays` pe fișe active fără a confirma criteriul (număr gol + zero itemi + zero imagini). Restricționare API la admin/service role (deja folosește service role).

---

### R2.3 Tăvița „dispare” din listă sau își pierde conținutul

| ID   | Descriere | Cauză | Nivel | Mitigare existentă |
|------|-----------|--------|-------|---------------------|
| T-DIS-1 | Conținut golit la salvare V4 | State incomplet la salvare (tab schimbat, repartizare recentă); payload fără itemi pentru tăvița X | Mediu | Verificare `payloadHasItemsForTray`; dacă tăvița din DB are itemi dar payload nu, nu se șterg itemii |
| T-DIS-2 | Tăvița ștearsă ca „veche” în V4 | Numărul tăviței nu e în payload și e considerat candidat la ștergere | Mediu | Nu se șterge niciun tray care are `tray_items`; comparare numere normalizată |
| T-DIS-3 | Tăvița există în DB dar nu apare în UI | Cache Kanban vechi; filtru pe pipeline/stage; listare pe alt `service_file_id` | Scăzut | Refresh board; invalidare cache la acțiuni relevante |

Detalii: `docs/TAVITA-DISPARITIE-PUNCTE-CRITICE.md`.

---

## 3. RISCURI LEGATE DE DATE ȘI CONCURENȚĂ

### R3.1 Cache și date învechite

| ID   | Descriere | Cauză | Nivel | Mitigare existentă |
|------|-----------|--------|-------|---------------------|
| C-1  | Board Kanban afișează status QC vechi | După validare QC din Recepție, cache-ul board-ului nu e invalidat | Scăzut | Utilizatorul vede actualizarea la refresh pagină sau la reîncărcarea pipeline-ului |
| C-2  | Lista de tăvițe (quotes) în panel învechită | După creare/ștergere tăviță pe alt tab sau din alt context | Scăzut | `setItemsRefreshKey` la acțiuni din Preturi; la deschidere fișă se reîncarcă `listTraysForServiceFile` |
| C-3  | Două utilizatori editează aceeași fișă | Salvare simultană; ultima scriere câștigă; un utilizator poate suprascrie modificări | Mediu | Nu există optimistic locking; recomandare: evitare editare concurentă pe aceeași fișă sau notificare „fișa a fost actualizată” |

---

### R3.2 Integritate date

| ID   | Descriere | Cauză | Nivel | Mitigare existentă |
|------|-----------|--------|-------|---------------------|
| I-1  | `pipeline_items` orfane (tray șters dar item rămas) | Eroare parțială la ștergere; ordine operații | Scăzut | `deleteTray` șterge explicit `pipeline_items` pentru tray înainte de ștergerea tray |
| I-2  | Tăviță cu `service_file_id` inexistent | Ștergere fișă fără ștergere tăvițe (nu ar trebui) | Scăzut | `deleteServiceFile` șterge tăvițele fișei; FK în DB dacă există |
| I-3  | `items_events` pentru tray șters | Evenimente QC / istoric rămân după ștergerea tăviței | Scăzut | Acceptabil pentru audit; dacă e nevoie, se poate adăuga ON DELETE CASCADE sau cleanup la ștergere tray |

---

## 4. RISCURI OPERAȚIONALE ȘI PERMISIUNI

### R4.1 API și cron

| ID   | Descriere | Cauză | Nivel | Mitigare existentă |
|------|-----------|--------|-------|---------------------|
| O-1  | POST `/api/admin/delete-empty-trays` apelat de neautorizat | Expunere endpoint fără autentificare/autorizare pe rol | Înalt | Verificare: route-ul folosește service role; trebuie restricționat la cron sau admin (middleware/auth) ca să nu fie apelat din client de oricine |
| O-2  | Cron rulează prea des și șterge tăviți goale legitime | Tăviță goală tocmai creată, încă fără itemi; cron rulează între creare și adăugare itemi | Mediu | `deleteEmptyTrays` șterge doar fără itemi și fără imagini; fără constraint de timp – tăvița goală nouă poate fi ștearsă dacă cron rulează imediat după creare fișă |

**Recomandare:** Protejare explicită a rutei `delete-empty-trays` (ex. secret în header, sau doar din cron intern). Pentru O-2: fie nu rula cron foarte des, fie exclude fișe create în ultimele X minute.

---

### R4.2 Validare QC și permisiuni

| ID   | Descriere | Cauză | Nivel | Mitigare existentă |
|------|-----------|--------|-------|---------------------|
| O-3  | Validare QC din Recepție disponibilă pentru non-admin | Butonul „Validare QC” ar putea fi vizibil/folosibil de oricine | Mediu | `onValidateTrayQc` este pasat doar când `pipeline.isReceptiePipeline && isAdmin` (PreturiMain) |
| O-4  | Eveniment QC înregistrat pentru tăviță greșită | Bug la identificarea „toate tăvițele cu același număr” (ex. altă fișă) | Scăzut | Filtrare strictă: `state.quotes` pentru fișa curentă (`fisaId`) și același număr normalizat |

---

## 5. RISCURI DE UX ȘI FLUX

### R5.1 Confuzie utilizator

| ID   | Descriere | Cauză | Nivel | Mitigare existentă |
|------|-----------|--------|-------|---------------------|
| U-1  | „Am validat QC dar tot mov apare” | Cache board; sau două tăvițe 28S, doar una validată (istoric) | Scăzut | Validare pentru toate tăvițele cu același număr; refresh pentru a vedea verde |
| U-2  | „De ce am două 28S?” | Duplicate din trecut sau din race | Scăzut | Cleanup la listare (goale); normalizare număr la creare; documentare în studiu de caz |
| U-3  | Ștergere tăviță din board fără confirmare suficientă | Un singur click sau confirmare slabă | Mediu | Verificare în UI: există AlertDialog/confirmare înainte de `deleteTray` în lead-card |

---

## 6. MATRICE REZUMAT RISC

| Categorie     | Risc major (Înalt) | Risc moderat (Mediu) | Risc minor (Scăzut) |
|---------------|--------------------|-----------------------|----------------------|
| **Tăvițe**    | T-DEL-3 (cron șterge greșit) | T-DUP-1, T-DUP-2, T-DEL-1, T-DEL-4, T-DIS-1, T-DIS-2 | T-DUP-3, T-DEL-2, T-DIS-3 |
| **Date/Cache**| – | C-3 (editare concurentă) | C-1, C-2, I-1, I-2, I-3 |
| **Operațional** | O-1 (API delete-empty-trays neprotejat) | O-2 (cron prea agresiv), O-3 | O-4 |
| **UX**        | – | U-3 (confirmare ștergere) | U-1, U-2 |

---

## 7. ACȚIUNI RECOMANDATE

1. **Securitate:** ~~Verifică că~~ `/api/admin/delete-empty-trays` este apelat doar din cron sau din context admin autentificat (**Etapa 1 – implementat**):
   - **Cron:** Header `Authorization: Bearer <CRON_SECRET>` sau `Bearer <CRON_SECRET_KEY>`.
   - **Dashboard:** Utilizator autentificat cu rol **admin** sau **owner** (helper `requireAdminOrOwner` în `lib/supabase/api-helpers.ts`).
2. **DB (Etapa 2 – documentat):** Rulează în Supabase SQL Editor scriptul `docs/sql-unique-one-empty-tray-per-fisa.sql`: pas 1 = DELETE duplicate goale; pas 2 = opțional decomentează și rulează `CREATE UNIQUE INDEX` pentru garantie la nivel DB.
3. **Cron (Etapa 3 – implementat):** La apelul **cron** al `/api/admin/delete-empty-trays` se folosește `minAgeMinutes: 10` – nu se șterg tăvițe create în ultimele 10 minute. La apel din dashboard (admin/owner) se șterg toate tăvițele goale eligibile (`minAgeMinutes: 0`). Nu rula cron-ul la interval foarte mic (ex. la fiecare minut).
4. **Board refresh (Etapa 4 – implementat):** După validare QC din Recepție, în `PreturiMain.tsx` se apelează `invalidateKanbanCacheForPipeline(receptie.id)` – la următoarea încărcare a board-ului Recepție, statusul verde apare fără refresh manual al paginii.
5. **Documentație (Etapa 5):** Păstrează actualizate `TAVITA-DISPARITIE-PUNCTE-CRITICE.md`, `STUDIU-DE-CAZ-TAVITE-SOLUTII.md` și acest document la orice modificare în fluxurile de tăvițe sau ștergere.

---

## 8. FIȘIERE RELEVANTE PENTRU RISCURI

| Fișier | Rol în analiza riscurilor |
|--------|----------------------------|
| `lib/supabase/serviceFileOperations.ts` | createTray, deleteTray, deleteEmptyTrays, cleanupRedundantEmptyTraysForServiceFile, listTraysForServiceFile |
| `lib/history/vanzariViewV4Save.ts` | Salvare V4 – golire/ștergere condiționată tăvițe |
| `hooks/preturi/usePreturiTrayOperations.ts` | Ștergere tăviță goală după mutare instrumente; deleteTray din UI |
| `components/kanban/lead-card.tsx` | Ștergere tăviță din board (context menu) |
| `app/api/admin/delete-empty-trays/route.ts` | API cron ștergere tăvițe goale |
| `components/preturi/core/PreturiMain.tsx` | Validare QC pentru toate tăvițele cu același număr |
| `hooks/useKanbanData.ts` | Cache Kanban, refresh, invalidare |
| `docs/TAVITA-DISPARITIE-PUNCTE-CRITICE.md` | Puncte critice dispariție tăviță |
| `docs/STUDIU-DE-CAZ-TAVITE-SOLUTII.md` | Cauze și soluții consolidate |
