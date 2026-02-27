-- Tabel pentru snapshot-uri „Salvează în Istoric” – o înregistrare per apăsare, fără a modifica fișa curentă.
-- Rulează în Supabase SQL Editor (sau migrații) pentru a crea tabelul.

CREATE TABLE IF NOT EXISTS service_file_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_file_id UUID NOT NULL REFERENCES service_files(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  saved_by_name TEXT,
  summary TEXT,
  total_amount NUMERIC(12,2),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_file_snapshots_service_file_id
  ON service_file_snapshots(service_file_id);
CREATE INDEX IF NOT EXISTS idx_service_file_snapshots_saved_at
  ON service_file_snapshots(saved_at DESC);

COMMENT ON TABLE service_file_snapshots IS 'Snapshot-uri ale fișei de serviciu la „Salvează în Istoric” – doar citire, nu modifică fișa curentă.';

-- RLS: utilizatori autentificați pot insera și citi
ALTER TABLE service_file_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own snapshots" ON service_file_snapshots;
CREATE POLICY "Users can insert own snapshots" ON service_file_snapshots
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can read snapshots" ON service_file_snapshots;
CREATE POLICY "Users can read snapshots" ON service_file_snapshots
  FOR SELECT TO authenticated USING (true);
