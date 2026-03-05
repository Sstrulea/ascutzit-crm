-- Aliniază arhiva_tray_items cu tray_items: adaugă toate coloanele lipsă
-- Rulează o singură dată pe baza de date (ex. din Supabase SQL Editor).

ALTER TABLE public.arhiva_tray_items
  ADD COLUMN IF NOT EXISTS guaranty boolean,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS technician2_id uuid,
  ADD COLUMN IF NOT EXISTS technician3_id uuid,
  ADD COLUMN IF NOT EXISTS discount real,
  ADD COLUMN IF NOT EXISTS non_repairable_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS serials text,
  ADD COLUMN IF NOT EXISTS qtyi smallint,
  ADD COLUMN IF NOT EXISTS unrepaired_qty integer NOT NULL DEFAULT 0;

-- Opțional: comentarii pentru documentație
COMMENT ON COLUMN public.arhiva_tray_items.unrepaired_qty IS 'Cantitate nereparată (ca în tray_items)';
COMMENT ON COLUMN public.arhiva_tray_items.non_repairable_qty IS 'Cantitate nereparabilă (ca în tray_items)';
