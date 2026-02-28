# Istoric fișă – Snapshot la „Salvează în Istoric”

## Comportament

Când utilizatorul apasă **„Salvează în Istoric”** în fișa de serviciu:

1. **Salvarea normală** rămâne neschimbată: datele sunt persistate în `service_files`, `trays`, `tray_items` etc., iar fișa curentă **nu este ștearsă sau modificată** de acest flux.
2. **Snapshot-ul** este o „fotografie” a stării la acel moment: se creează **o înregistrare nouă** în tabelul `service_file_snapshots`, fără a altera fișa deschisă.

## Backend (Supabase / PostgreSQL)

- **Tabel:** `service_file_snapshots`
- **Script de creare:** rulează în Supabase SQL Editor conținutul din `docs/sql-service-file-snapshots.sql` (creează tabelul și politicile RLS).

Structura tabelului:

| Coloană             | Tip         | Descriere                                      |
|---------------------|------------|-------------------------------------------------|
| id                  | UUID       | PK                                             |
| service_file_id     | UUID       | FK → service_files(id)                         |
| lead_id             | UUID       | FK → leads(id), opțional                       |
| saved_at            | TIMESTAMPTZ| Data și ora la care s-a apăsat butonul         |
| saved_by_user_id    | UUID       | Utilizatorul care a salvat (auth.users)        |
| saved_by_name       | TEXT       | Nume/email utilizator pentru afișare           |
| summary             | TEXT       | Rezumat scurt (ex: „3 forfecuțe – 87 lei”)    |
| total_amount        | NUMERIC    | Total general comandă (lei)                    |
| snapshot            | JSONB      | Payload-ul complet (vezi mai jos)              |
| created_at          | TIMESTAMPTZ| Creare înregistrare                            |

## Conținutul snapshot-ului (JSONB)

Câmpurile salvate în `snapshot` acoperă cerințele tale:

- **clientType:** array cu tipuri (urgent, abonament, fara_abonament, office_direct, curier_trimis, retur)
- **receptieComanda:** boolean (status fișă = comanda)
- **trays:** lista de tăvițe (număr + count)
- **instruments:** pentru fiecare instrument: nr tăviță, nume, S/N, cantitate, articol, discount %, NER, garanție, preț unitar, total linie
- **serialNumbers:** toate S/N-urile introduse
- **services:** serviciile bifate + prețuri (nume, preț, cantitate, discount, total linie)
- **promos:** promoții/vânzări bifate
- **totalGeneral:** total comandă (lei)
- **images:** imaginile din „Imagini Tăviță” (tray_id, url, filename, etc.)
- **savedAt:** data/ora exactă a salvării
- **serviceFileId,** **leadId,** **leadName,** **savedByUserName:** opțional, pentru context

## Frontend (React / Next.js)

- **Salvare:** în `hooks/preturi/usePreturiSaveOperations.ts`, după salvare reușită (cale V4), se construiește payload-ul cu `buildSnapshotFromV4Data()` și se apelează `saveServiceFileSnapshot()` din `lib/history/serviceFileSnapshot.ts`.
- **Listare:** pentru tab-ul „Istoric” poți folosi direct din client:
  - `listServiceFileSnapshots(serviceFileId)` – returnează `{ data: ServiceFileSnapshotRow[], error }`, ordonat după `saved_at` descrescător.
- **Vizualizare completă:** deschizi o intrare din listă și afișezi `row.snapshot` (payload-ul complet).

## Flux rezumat

1. Utilizatorul completează fișa și apasă **„Salvează în Istoric”**.
2. Se execută salvare normală (DB actualizat, fișa rămâne deschisă).
3. Se reîncarcă tăvițele (refreshedQuotes).
4. Se încarcă imaginile pentru toate tăvițele fișei.
5. Se construiește payload-ul de snapshot (tip client, tăvițe, instrumente, servicii, total, imagini, data/oră, etc.).
6. Se inserează o nouă linie în `service_file_snapshots`.
7. Toast „Salvat în istoric”.

Erorile la pasul 4–6 sunt logate (console.warn), dar nu blochează fluxul și utilizatorul vede tot „Salvat în istoric”.

## Pași necesari în proiect

1. **Rulează migrarea SQL** din `docs/sql-service-file-snapshots.sql` în Supabase (SQL Editor) ca să existe tabelul și RLS.
2. Tab-ul **„Istoric”** poate folosi `listServiceFileSnapshots(fisaId)` pentru listă (data, total, summary) și la click pe o intrare poți afișa detaliile din `snapshot`.
