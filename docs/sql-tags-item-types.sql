-- Taguri: restricționare pe tip de item (lead, fișă, tăviță).
-- item_types = NULL sau array gol => tag disponibil pentru toate.
-- item_types = ['lead'] => doar pe lead-uri; ['service_file'] => doar pe fișe; ['tray'] => doar pe tăvițe; etc.

ALTER TABLE public.tags
ADD COLUMN IF NOT EXISTS item_types text[] DEFAULT NULL;

COMMENT ON COLUMN public.tags.item_types IS 'Tipuri de item pentru care tag-ul poate fi atribuit: lead, service_file, tray. NULL sau [] = toate.';
