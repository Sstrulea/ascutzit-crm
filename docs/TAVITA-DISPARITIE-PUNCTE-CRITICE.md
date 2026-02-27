# Tăviță dispare din fișă – puncte critice și protecții

**Context:** Tăvița 28S (sau alte tăvițe) a dispărut din fișa de serviciu. Istoricul arată „Tăvița 28S a fost repartizată în pipeline-ul Saloane” – deci acțiunea de repartizare coincide cu momentul problemei.

---

## 1. Unde se poate șterge sau suprascrie o tăviță / conținutul ei

| Locație | Ce face | Când se întâmplă |
|--------|---------|-------------------|
| **lib/history/vanzariViewV4Save.ts** | Șterge **tray_items** pentru tăvițele din payload, apoi rescrie din payload. Poate șterge **tăvițe întregi** (pas 3) dacă numărul nu e în „wantedKeys”. | La orice **salvare** din view-ul Vânzări (Trimitere tăvițe, Urgent, Salvează, etc.). |
| **lib/supabase/serviceFileOperations.ts** – `deleteTray()` | Șterge complet tăvița (tray_items, tray_images, trays). | Apel explicit: buton „Șterge tăvița”, sau ștergere automată tăviță „undefined” după mutare instrument. |
| **lib/supabase/serviceFileOperations.ts** – `deleteServiceFile()` | Șterge fișa și **toate** tăvițele fișei. | Buton „Șterge fișa”. |
| **lib/supabase/serviceFileOperations.ts** – `deleteEmptyTrays()` | Șterge tăvițe cu `number` null sau gol. | API `/api/admin/delete-empty-trays` (cron/admin). |
| **hooks/preturi/usePreturiTrayOperations.ts** – după `handleMoveInstrument` | Șterge tăvița **fără număr** dacă nu are nici itemi, nici imagini. | După mutarea instrumentelor când rămâne o tăviță goală. |
| **components/kanban/lead-card.tsx** | Context menu „Șterge tăvița” → `deleteTray(lead.id)`. | Utilizator șterge din board (Recepție/departament). |

---

## 2. Cauza cea mai probabilă pentru „tăvița a dispărut”

- **Salvare V4 (vanzariViewV4Save):**
  - **Pas 2:** Se **golesc** toate `tray_items` pentru fiecare tăviță care apare în payload, apoi se rescriu din payload. Dacă la salvare state-ul din front-end **nu conține** tăvița 28S (ex. a fost repartizată și a fost scoasă din listă în UI) sau conține 28S dar **fără instrumente/servicii** alocate în state, după „golire” tăvița rămâne fără itemi sau este tratată greșit.
  - **Pas 3:** Se șterg tăvițe „vechi” al căror număr nu e nici în payload, nici în lista existentă. Dacă din greșeală lista `existing` nu conține 28S (ex. race, alt `service_file_id`) sau compararea numerelor eșuează (ex. diferențe de format), tăvița poate fi ștearsă.

---

## 3. Protecții adăugate în cod (feb 2026)

### 3.1 În `lib/history/vanzariViewV4Save.ts`

**Pas 2 – nu mai goli tăvița dacă payload-ul nu are itemi pentru ea:**

- Înainte de a șterge `tray_items` pentru o tăviță din payload, se verifică dacă în payload există **cel puțin un serviciu sau o piesă** alocat acelei tăvițe (după număr).
- Dacă **nu** există niciun item pentru acel număr de tăviță, dar tăvița din DB **are** itemi, **nu** se mai șterg itemii (se sare peste și se loghează un warning).
- Scop: evitat pierderea instrumentelor când la salvare state-ul e incomplet (ex. după repartizare, tab diferit, refresh).

**Pas 3 – nu șterge tăvița dacă are conținut:**

- Înainte de a șterge o tăviță „veche” (candidat la ștergere), se verifică dacă are cel puțin un rând în `tray_items`.
- Dacă **are** itemi, tăvița **nu** este ștearsă (se sare peste și se loghează un warning).
- Compararea numerelor se face cu `.toLowerCase()` ca să nu existe diferențe 28S vs 28s.

---

## 4. Ce poți verifica când „dispare” o tăviță

1. **Consolă browser:** Căutare după `[saveVanzariViewV4ToDb]` – dacă apar warning-urile noi, înseamnă că protecțiile au intervenit (nu s-a golit / șters tăvița).
2. **Istoric:** Evenimente „tray_moved_to_pipeline” / „repartizată” – dacă imediat după repartizare se face o salvare (ex. Trimitere tăvițe, Urgent), atunci salvare V4 rulează cu state-ul curent; dacă 28S nu era încă în state sau era fără itemi, înainte de fix putea fi golită/ștearsă.
3. **DB:**  
   - `trays` – dacă tăvița mai există și ce `service_file_id` are.  
   - `tray_items` – dacă mai are itemi pentru `tray_id` respectiv.

---

## 5. Recomandări

- **Nu** rula manual ștergerea de tăvițe goale pe fișe active (ex. cron `delete-empty-trays`) fără a filtra strict tăvițele cu număr gol și fără itemi.
- După **„Trimitere tăvițe”** (repartizare), asigură-te că se face refresh la lista de tăvițe pentru fișă (sau că salvare V4 nu rulează imediat cu un state incomplet).
- Dacă dispariția persistă, adaugă logging suplimentar în `saveVanzariViewV4ToDb` (payload trays, existing trays, wantedKeys) și verifică în DB/istoric dacă tăvița a fost ștearsă sau doar „ascunsă” din UI (ex. filtru pe pipeline/stage).
