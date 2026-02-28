# Cazuri în care se pot pierde detaliile din tăviță (itemi, imagini)

**Context:** Utilizatorul raportează că „lipsesc detaliile din tăviță” – tăvița #128 (sau alta) apare goală: fără instrumente/servicii în listă, fără imagini (Imagini Tăviță 0).

---

## 1. CAUZA PRINCIPALĂ IDENTIFICATĂ ȘI REMEDIATĂ: Salvare din view departament (ex. Saloane)

### Ce se întâmpla

- La deschiderea fișei din **pipeline-ul unui departament** (ex. **Saloane**), datele sunt încărcate **filtrate**: se afișează doar `tray_items` cu `department_id` = acel departament (și doar instrumentele din acel departament).
- La **„Salvează în Istoric”** / **„Trimite tăvița”** se trimitea la server **doar** conținutul vizibil (doar itemii din Saloane).
- În `saveVanzariViewV4ToDb` (Pas 2) se **ștergeau toate** `tray_items` pentru fiecare tăviță din payload, apoi se rescriau doar din payload.
- **Rezultat:** Itemii din **alte departamente** (Frizerii, Horeca, Reparatii etc.) erau șterși definitiv → tăvița părea goală sau cu „detaliile lipsă” când se deschidea fără filtru sau din alt departament.

### Remediere (feb 2026)

- `saveVanzariViewV4ToDb` primește opțional **`filterDepartmentId`** în context (când salvarea e făcută din view-ul unui singur departament).
- Când **`filterDepartmentId`** e setat:
  - În Pas 2 se șterg **doar** `tray_items` cu `department_id = filterDepartmentId` pentru fiecare tăviță (și doar pentru acele itemi se șterg `tray_item_brands`).
  - Itemii din alte departamente **nu mai sunt șterși**.
- `filterDepartmentId` este calculat în PreturiMain (din pipeline-ul curent, ex. Saloane) și propagat prin usePreturiBusiness → usePreturiSaveOperations → saveVanzariViewV4ToDb.

**Fișiere modificate:** `lib/history/vanzariViewV4Save.ts`, `hooks/preturi/usePreturiSaveOperations.ts`, `hooks/usePreturiBusiness.ts`, `components/preturi/core/PreturiMain.tsx`.

---

## 2. ALTE CAZURI POSIBILE DE PIERDERE A DETALIILOR

### 2.1 Salvare V4 cu payload incomplet (fără filterDepartmentId)

- **Când:** Salvare (Trimitere tăvițe, Urgent, Salvează) când state-ul UI nu conține toate tăvițele sau toate itemii (ex. tab schimbat, fișă schimbată, reîncărcare parțială).
- **Protecție existentă:** Dacă pentru un număr de tăviță din payload **nu** există niciun serviciu/piesă în payload, dar tăvița din DB **are** itemi, **nu** se mai șterg itemii (se sare peste și se loghează warning `[saveVanzariViewV4ToDb] NU golesc tăvița ...`).
- **Risc rămas:** Dacă payload-ul conține tăvița dar cu **zero** itemi (ex. utilizator a șters tot din UI sau view filtrat fără filterDepartmentId), itemii din DB pot fi goliți. După fix, în view departament se trimite `filterDepartmentId`, deci nu se mai golesc itemii altor departamente.

### 2.2 Ștergere explicită tăviță

- **deleteTray(trayId)** – șterge toate `tray_items`, `tray_images` și tăvița. Apelată la „Șterge tăvița” din board (cu confirmare) sau după mutare instrumente când rămâne o tăviță goală.
- **deleteServiceFile** – șterge fișa și toate tăvițele fișei (inclusiv conținut).

### 2.3 Cron / API delete-empty-trays

- Șterge doar tăvițe **fără număr** și **fără itemi** și **fără imagini**. Tăvița #128 are număr, deci **nu** este ștearsă de acest job. Detaliile nu se pierd aici pentru tăvițe cu număr.

### 2.4 Încărcare greșită (afișare goală fără pierdere în DB)

- Dacă **fișa selectată** sau **tăvița selectată** nu corespunde cu ce e în DB (ex. cache vechi, ID greșit), UI-ul poate afișa listă goală chiar dacă în DB există itemi.
- **Verificare:** În DB: `SELECT * FROM tray_items WHERE tray_id = '<tray_id_tavita_128>'`. Dacă există rânduri, datele sunt în DB; problema e de încărcare/filtru (ex. view departament cu alt department_id).

### 2.5 Imagini tăviță (0)

- **Imagini Tăviță (0)** – imaginile se stochează în `tray_images` și sunt șterse odată cu tăvița la `deleteTray`, sau individual la ștergere imagine. Nu sunt afectate de salvare V4 (V4 nu scrie `tray_images`). Dacă apar 0 imagini, fie nu au fost încărcate, fie au fost șterse (buton ștergere imagine sau deleteTray).

---

## 3. VERIFICĂRI RECOMANDATE CÂND „LIPSESC DETALIILE”

1. **Consolă browser:** Căutare după `[saveVanzariViewV4ToDb]` – dacă apare „NU golesc tăvița” sau „NU ștergem tăvița”, protecțiile au intervenit.
2. **Context salvare:** Salvarea s-a făcut din **Recepție/Vânzări** (fără filtru departament) sau din **Saloane/Frizerii/etc.**? După fix, din Saloane nu se mai șterg itemii din alte departamente.
3. **DB – tray_items:**  
   `SELECT id, tray_id, instrument_id, service_id, part_id, department_id FROM tray_items WHERE tray_id = (SELECT id FROM trays WHERE number = '128' AND service_file_id = '<fisa_id>');`  
   Dacă sunt rânduri, detaliile există; problema poate fi filtru (department) la afișare.
4. **DB – tray_images:**  
   `SELECT id, tray_id FROM tray_images WHERE tray_id = '<tray_id>';`  
   Confirmă dacă imaginile există în DB.

---

## 4. REZUMAT

| Cauză | Remediere / Notă |
|-------|-------------------|
| Salvare din view **departament** (Saloane etc.) ștergea itemii altor departamente | **Remediat:** se trimite `filterDepartmentId`, se șterg doar itemii acelui departament. |
| Payload incomplet (fără itemi pentru tăviță) | Protecție: nu se golește tăvița dacă în DB are itemi. |
| Ștergere explicită tăviță / fișă | Comportament intenționat; confirmare în UI pentru ștergere tăviță. |
| Cron delete-empty-trays | Nu șterge tăvițe cu număr sau cu itemi/imagine. |
| Afișare goală (cache / filtru) | Verificare în DB; refresh; deschidere fără pipeline departament. |
