# Tăviță expediată: ștergere din detaliile fișei + legătura între două procese

## Problema

Din detaliile fișei (tab Fișe / Recepție), când utilizatorul șterge o tăviță care **deja a fost expediată** (trimisă în departament), tăvița **nu dispare** sau acțiunea pare să nu aibă efect. Este vorba de **legătura între două „procese”** (două locuri în aplicație) care reprezintă același proces: **tăvița fizică**.

---

## Cele două „procese” / locații

| Locație | Ce se afișează | Sursa datelor |
|--------|-----------------|----------------|
| **1. Detaliile fișei** (panel – tab Fișe / Recepție) | Lista de tăvițe (TrayTabs) pentru fișa selectată | `listTraysForServiceFile(fisaId)` → rânduri din `trays` |
| **2. Board Kanban** (Receptie sau Departament) | Carduri: fișă sau tăviță în stage | `pipeline_items` (type = `tray`, item_id = tray_id) + strategii (receptie/department) |

**Aceeași tăviță fizică** = un rând în `trays` + **unul sau mai multe** rânduri în `pipeline_items`:

- Receptie: un `pipeline_item` (tray) poate apărea pe fișa „virtuală” în Receptie.
- După expediere: același `tray_id` poate avea și un `pipeline_item` în pipeline-ul departamentului (ex. Saloane).

Deci: **un singur rând `trays`**, dar **mai multe poziții în Kanban** (Receptie + eventual departament). Procesul este unul (tăvița), dar apare în două „locații” în UI.

---

## Cauze posibile pentru „nu se șterge”

### 1. Ștergerea din DB eșuează (ex. RLS)

`deleteTray(trayId)` din `serviceFileOperations.ts` face, în ordine:

1. `pipeline_items` (toate rândurile cu `type = 'tray'` și `item_id = trayId`)
2. `work_sessions`, `stage_history`, `tray_item_brands`, `tray_items`, `tray_images`, `arhiva_tavite_unite`
3. `trays`

Dacă **orice pas eșuează** (ex. RLS pe `pipeline_items` sau `trays` nu permite ștergerea pentru un pipeline anume), întreaga operațiune dă eroare și tăvița rămâne în DB. Utilizatorul vede că „nu s-a șters”.

- **Recomandare:** Verifică politicile RLS pe `pipeline_items` și `trays`: utilizatorul trebuie să poată șterge toate rândurile legate de tăvița respectivă (inclusiv în pipeline-ul departamentului), nu doar în Receptie.

### 2. Board-ul nu se actualizează (lipsă refresh după ștergere)

Ștergerea din **detaliile fișei** se face din **TrayTabs** (X pe tăviță) → `usePreturiTrayOperations.handleDeleteTray` → `deleteTray(trayId)`. După succes:

- Se actualizează doar state-ul local din panel (`setQuotes`, `setSelectedQuoteId`).
- **Nu** se apelează `onRefresh` (refresh Kanban) și **nu** se emit evenimente (`tray:deleted`, `refresh`).

Rezultat: în DB tăvița dispare, dar **board-ul (Receptie / Departament) rămâne cu cache-ul vechi** și poate încă afișa cardul până la reîncărcare manuală sau până vine un eveniment Realtime.

**Legătura între cele două procese:** același `tray_id` este afișat și în listă (din `trays`) și pe board (din `pipeline_items`). Fără refresh/invalidare cache Kanban după ștergere, al doilea „proces” (board-ul) nu știe că tăvița a fost ștearsă.

---

## Măsuri implementate / recomandate

1. **După ștergere reușită din detaliile fișei** (în `usePreturiTrayOperations.handleDeleteTray`):
   - Apel **callback** `onAfterDeleteTray` (ex. `onRefresh` din panel), ca board-ul să fie reîmprospătat.
   - Emit evenimente: `tray:deleted` și `refresh`, pentru orice listener global (ex. invalidare cache Kanban).

2. **Afișare eroare la ștergere:** Dacă `deleteTray` returnează eroare, afișează mesajul în UI (toast) ca să poți diferenția RLS / constraint / rețea.

3. **RLS:** Asigură-te că utilizatorul poate șterge din `pipeline_items` și `trays` pentru toate pipeline-urile la care are acces (inclusiv după expediere în departament).

4. **Realtime:** La ștergerea din `pipeline_items`, Realtime poate notifica DELETE; `useKanbanData` invalidează cache și filtrează cardul. Dacă Realtime întârzie sau nu e disponibil, **refresh-ul explicit** după ștergere (callback + evenimente) asigură sincronizarea celor două „procese”.

---

## Rezumat

- **Procesul** = o singură tăviță (un `trays.id`), vizibilă în **două locuri**: listă în detaliile fișei și card(uri) pe board.
- **„Nu se șterge”** poate însemna: (A) ștergerea din DB eșuează (RLS / permisiuni), sau (B) ștergerea reușește dar board-ul nu se refreshează.
- **Legătura** se face prin: **refresh/invalidare cache Kanban** și eventual **evenimente** după ștergere, astfel încât ambele „locații” (listă + board) rămân în sync.
