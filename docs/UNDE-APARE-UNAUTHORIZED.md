# Unde poate apărea eroarea "Unauthorized" (401)

Eroarea apare când API-ul răspunde cu `401` și mesajul `error: 'Unauthorized'` (sau similar). Frontend-ul o afișează de obicei în toast.

**Investigatie detaliată (cauze + recomandări):** vezi [INVESTIGATIE-UNAUTHORIZED-BACKFILL.md](./INVESTIGATIE-UNAUTHORIZED-BACKFILL.md).

## 1. Backfill comenzi (cazul tău)

- **Acțiune:** Butonul **"Backfill comenzi"** pe pagina **Statistici apeluri** (`/dashboard/statistici-apeluri`).
- **Rută:** `POST /api/owner/backfill-vanzari-apeluri`
- **Când apare:** Când nu există utilizator autentificat (session expirată, delogat sau cookie netrimis). După autentificare reîmprospătată, încercarea ar trebui să meargă.

---

## 2. Alte acțiuni care pot da "Unauthorized"

| Acțiune / context | Rută API | Fișier |
|-------------------|----------|--------|
| **Atribuie apel manual** (Statistici apeluri) | `POST /api/owner/atribuie-apel-manual` | `app/api/owner/atribuie-apel-manual/route.ts` |
| **Correct curier trimis dates** (owner) | `POST /api/owner/correct-curier-trimis-dates` | `app/api/owner/correct-curier-trimis-dates/route.ts` |
| **Expirare callbacks** (la încărcarea pipeline Vânzări) | `POST /api/leads/expire-callbacks` | `app/api/leads/expire-callbacks/route.ts` |
| **Mutare în Colet neridicat** | `POST /api/leads/move-to-colet-neridicat` | `app/api/leads/move-to-colet-neridicat/route.ts` |
| **Arhivare + eliberare tăvițe** (kanban Receptie) | `POST /api/service-files/archive-and-release` | `app/api/service-files/archive-and-release/route.ts` |
| **Ștergere tăviți goale** (admin) | `POST /api/admin/delete-empty-trays` | `app/api/admin/delete-empty-trays/route.ts` |
| **Facturare** (vânzări) | Rută facturare vânzări | `app/api/vanzari/factureaza/route.ts` |
| **Anulare factură** | Rută anulare factură | `app/api/vanzari/anuleaza-factura/route.ts` |
| **Statistici vânzări** | Rută statistici | `app/api/vanzari/statistics/route.ts` |
| **Push subscribe / test** | `POST /api/push/subscribe`, `/api/push/test` | `app/api/push/subscribe/route.ts`, `app/api/push/test/route.ts` |
| **Cron-uri** (apelate cu cheie sau fără user) | backup, midnight-ro, curier-to-avem-comanda, vanzari-colet-neridicat, vanzari-archive-no-deal, vanzari-followup-reminder | Diverse în `app/api/cron/` |

Helpers partajate (folosite de mai multe rute):

- **`lib/supabase/api-helpers.ts`** – `createAdminClient` sau helper care verifică user: poate arunca/returna `401` cu mesaj `Unauthorized` dacă nu ești autentificat.

---

## 3. Ce poți face

- **Backfill:** Asigură-te că ești logat și că sesiunea nu e expirată; reîmprospătează pagina sau reconectează-te, apoi apasă din nou **Backfill comenzi**.
- **În general:** Orice acțiune care apelează una dintre rutele de mai sus fără sesiune validă poate produce toast **Unauthorized**. Verifică mereu că utilizatorul este autentificat înainte de acțiuni owner/admin sau sensibile.
