# Corectare statistici Curier trimis / Office direct

**Context:** Pe lead, `curier_trimis_at` trebuie să fie **momentul când vânzătorul a apăsat „Curier trimis”** (pentru statistici), nu data programată a curierului. În trecut uneori se salva data programată, deci statisticile apăreau pe ziua greșită.

**Ce s-a făcut în cod:** De acum, peste tot se setează `curier_trimis_at` = `now()` la acțiune; data programată rămâne doar pe `service_files.curier_scheduled_at`.

**Pentru datele vechi:** Poți corecta timestamp-urile pe leads folosind momentul real al mutării din `vanzari_apeluri` (câmpul `apel_at`).

---

## Pași pentru corectarea statisticilor

1. **Autentificare ca owner** în aplicație (session activă în browser).

2. **Apel corectare date (un singur request):**
   - Metodă: **POST**
   - URL: **`/api/owner/correct-curier-trimis-dates`**
   - Fără body, fără query params.

   Exemplu din browser (consolă) sau Postman:
   ```text
   POST https://<domeniul-tau>/api/owner/correct-curier-trimis-dates
   ```
   (cu cookie-urile de autentificare ale owner-ului)

   Sau din terminal (cu token / cookie de sesiune):
   ```bash
   curl -X POST "https://<domeniul-tau>/api/owner/correct-curier-trimis-dates" -H "Cookie: sb-access-token=..."
   ```

3. **Ce face apelul:**
   - Ia din `vanzari_apeluri` toate mutările în stage-urile „Curier Trimis” și „Office Direct”.
   - Pentru fiecare lead, folosește **prima** mutare (cel mai vechiu `apel_at`) ca moment al acțiunii.
   - Actualizează pe `leads`: `curier_trimis_at` / `office_direct_at` cu acel `apel_at`.

4. **După rulare:** Statisticile (inclusiv pe zi) se bazează deja pe `curier_trimis_at` și `office_direct_at`; odată corectate, numerele vor reflecta ziua în care s-a făcut apelul/livrarea.

**Notă:** Lead-urile care **nu** au nicio înregistrare în `vanzari_apeluri` pentru Curier trimis/Office direct nu sunt modificate (nu există sursă pentru „momentul real”). Pentru ele poți rula în prealabil backfill-ul de apeluri dacă e cazul: `POST /api/owner/backfill-vanzari-apeluri`.
