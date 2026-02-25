-- Șterge doar tăvițele care sunt complet goale: fără număr ȘI fără tray_items ȘI fără imagini.
-- (Tăvițe cu number NULL/gol dar care au conținut NU sunt șterse.)
-- Rulează în Supabase: SQL Editor → New query → lipisești acest script → Run.
-- ATENȚIE: Operația este ireversibilă. Recomandat: rulează mai întâi SELECT-ul de mai jos.

-- ========== OPTIONAL: Listează tăvițele goale (fără număr) care au 0 itemi și 0 imagini ==========
-- SELECT t.id, t.number, t.service_file_id, t.status, t.created_at,
--   (SELECT count(*) FROM tray_items ti WHERE ti.tray_id = t.id) AS items_count,
--   (SELECT count(*) FROM tray_images tim WHERE tim.tray_id = t.id) AS images_count
-- FROM trays t
-- WHERE (t.number IS NULL OR trim(t.number) = '')
--   AND NOT EXISTS (SELECT 1 FROM tray_items ti WHERE ti.tray_id = t.id)
--   AND NOT EXISTS (SELECT 1 FROM tray_images tim WHERE tim.tray_id = t.id);

-- ========== Ștergere doar tăvițe cu number gol ȘI fără itemi, fără imagini ==========
WITH empty_trays AS (
  SELECT t.id
  FROM trays t
  WHERE (t.number IS NULL OR trim(t.number) = '')
    AND NOT EXISTS (SELECT 1 FROM tray_items ti WHERE ti.tray_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tray_images tim WHERE tim.tray_id = t.id)
)
-- 1. pipeline_items
DELETE FROM pipeline_items
WHERE type = 'tray' AND item_id IN (SELECT id FROM empty_trays);

WITH empty_trays AS (
  SELECT t.id FROM trays t
  WHERE (t.number IS NULL OR trim(t.number) = '')
    AND NOT EXISTS (SELECT 1 FROM tray_items ti WHERE ti.tray_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tray_images tim WHERE tim.tray_id = t.id)
)
-- 2. work_sessions
DELETE FROM work_sessions
WHERE tray_id IN (SELECT id FROM empty_trays);

WITH empty_trays AS (
  SELECT t.id FROM trays t
  WHERE (t.number IS NULL OR trim(t.number) = '')
    AND NOT EXISTS (SELECT 1 FROM tray_items ti WHERE ti.tray_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tray_images tim WHERE tim.tray_id = t.id)
)
-- 3. stage_history
DELETE FROM stage_history
WHERE tray_id IN (SELECT id FROM empty_trays);

WITH empty_trays AS (
  SELECT t.id FROM trays t
  WHERE (t.number IS NULL OR trim(t.number) = '')
    AND NOT EXISTS (SELECT 1 FROM tray_items ti WHERE ti.tray_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tray_images tim WHERE tim.tray_id = t.id)
)
-- 4. tray_item_brand_serials (prin tray_items)
DELETE FROM tray_item_brand_serials
WHERE tray_item_id IN (SELECT id FROM tray_items WHERE tray_id IN (SELECT id FROM empty_trays));

WITH empty_trays AS (
  SELECT t.id FROM trays t
  WHERE (t.number IS NULL OR trim(t.number) = '')
    AND NOT EXISTS (SELECT 1 FROM tray_items ti WHERE ti.tray_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tray_images tim WHERE tim.tray_id = t.id)
)
-- 5. tray_item_brands
DELETE FROM tray_item_brands
WHERE tray_item_id IN (SELECT id FROM tray_items WHERE tray_id IN (SELECT id FROM empty_trays));

WITH empty_trays AS (
  SELECT t.id FROM trays t
  WHERE (t.number IS NULL OR trim(t.number) = '')
    AND NOT EXISTS (SELECT 1 FROM tray_items ti WHERE ti.tray_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tray_images tim WHERE tim.tray_id = t.id)
)
-- 6. tray_items
DELETE FROM tray_items
WHERE tray_id IN (SELECT id FROM empty_trays);

WITH empty_trays AS (
  SELECT t.id FROM trays t
  WHERE (t.number IS NULL OR trim(t.number) = '')
    AND NOT EXISTS (SELECT 1 FROM tray_items ti WHERE ti.tray_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tray_images tim WHERE tim.tray_id = t.id)
)
-- 7. tray_images
DELETE FROM tray_images
WHERE tray_id IN (SELECT id FROM empty_trays);

WITH empty_trays AS (
  SELECT t.id FROM trays t
  WHERE (t.number IS NULL OR trim(t.number) = '')
    AND NOT EXISTS (SELECT 1 FROM tray_items ti WHERE ti.tray_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tray_images tim WHERE tim.tray_id = t.id)
)
-- 8. arhiva_tavite_unite (dacă există)
DELETE FROM arhiva_tavite_unite
WHERE parent_tray_id IN (SELECT id FROM empty_trays);

WITH empty_trays AS (
  SELECT t.id FROM trays t
  WHERE (t.number IS NULL OR trim(t.number) = '')
    AND NOT EXISTS (SELECT 1 FROM tray_items ti WHERE ti.tray_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tray_images tim WHERE tim.tray_id = t.id)
)
-- 9. trays
DELETE FROM trays
WHERE id IN (SELECT id FROM empty_trays);
