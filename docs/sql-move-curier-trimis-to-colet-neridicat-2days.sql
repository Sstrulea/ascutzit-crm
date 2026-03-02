-- Mută fișele de serviciu din stage "Curier Trimis" în "Colet Neridicat"
-- unde fișa e mai veche de 2 zile după created_at (data creării fișei).
-- Stage IDs: Curier Trimis = 081a56b9-..., Colet Neridicat = 8761501c-...
-- Rulează în Supabase SQL Editor (rulează tot blocul odată).

-- ========== OPȚIONAL: PREVIEW – rulează doar acest bloc pentru a vedea ce fișe ar fi mutate ==========
/*
SELECT pi.item_id AS service_file_id, sf.number, sf.created_at
FROM public.pipeline_items pi
INNER JOIN public.service_files sf ON sf.id = pi.item_id
WHERE pi.type = 'service_file'
  AND pi.stage_id = '081a56b9-d2f1-4afb-9fd0-56cacd7d147d'::uuid
  AND sf.created_at < (now() - interval '2 days');
*/

-- ========== MUTARE (UPDATE + INSERT events) ==========
WITH fise_expirate AS (
  SELECT pi.item_id AS service_file_id
  FROM public.pipeline_items pi
  INNER JOIN public.service_files sf ON sf.id = pi.item_id
  WHERE pi.type = 'service_file'
    AND pi.stage_id = '081a56b9-d2f1-4afb-9fd0-56cacd7d147d'::uuid
    AND sf.created_at < (now() - interval '2 days')
),

moved_pi AS (
  UPDATE public.pipeline_items pi
  SET stage_id = '8761501c-073b-45f1-9d95-27b398e1dcd7'::uuid,
      updated_at = now()
  WHERE pi.stage_id = '081a56b9-d2f1-4afb-9fd0-56cacd7d147d'::uuid
    AND pi.type = 'service_file'
    AND pi.item_id IN (SELECT service_file_id FROM fise_expirate)
  RETURNING pi.item_id
),

updated_sf AS (
  UPDATE public.service_files sf
  SET colet_neridicat = true,
      updated_at = now()
  WHERE sf.id IN (SELECT item_id FROM moved_pi)
  RETURNING sf.id
)

INSERT INTO public.items_events (type, item_id, event_type, message, payload)
SELECT
  'service_file'::text,
  id,
  'colet_neridicat'::text,
  'Mutare în Colet neridicat (fișă creată acum 2+ zile)'::text,
  jsonb_build_object('to', 'Colet neridicat', 'automated', true)
FROM updated_sf;
