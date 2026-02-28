-- Constraint opțional: maxim o tăviță „goală” (fără număr) per fișă de serviciu.
-- Previne crearea a 2 tăvițe goale pentru aceeași fișă (ex. la dublu-click sau race).
-- Rulează în Supabase: SQL Editor → New query → lipisești → Run.
--
-- RECOMANDARE (Analiza riscurilor – Etapa 2):
--   Pas 1: Rulează mai întâi blocul DELETE de mai jos (curăță duplicatele).
--   Pas 2: Opțional – decomentează și rulează CREATE UNIQUE INDEX pentru garantie la nivel DB.

-- ========== Pas 1: Șterge tăvițele goale duplicate (păstrează una per service_file_id – cea mai veche) ==========
DELETE FROM trays t1
USING trays t2
WHERE t1.service_file_id = t2.service_file_id
  AND t1.id > t2.id
  AND (t1.number IS NULL OR trim(t1.number) = '')
  AND (t2.number IS NULL OR trim(t2.number) = '')
  AND t1.status NOT IN ('2','3')
  AND t2.status NOT IN ('2','3');

-- 2. Index unic: per fișă, o singură tăviță cu „număr gol” (null sau '')
-- Comentat: activează doar dacă vrei garantie la nivel de DB (inserarea a doua dă eroare 23505, aplicația o tratează).
-- CREATE UNIQUE INDEX IF NOT EXISTS trays_one_empty_per_service_file
-- ON trays (service_file_id)
-- WHERE (number IS NULL OR trim(number) = '');
