-- Adaugă coloana is_active la app_members (dacă nu există).
-- Rulează în Supabase SQL Editor dacă primești eroare la toggle status.
ALTER TABLE app_members
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

COMMENT ON COLUMN app_members.is_active IS 'false = membru dezactivat (nu poate loga)';
