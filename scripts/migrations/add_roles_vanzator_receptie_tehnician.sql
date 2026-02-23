-- Adaugă noile roluri în app_members (vanzator, receptie, tehnician).
-- Dacă ai un constraint pe coloana role (ex. CHECK (role IN ('owner','admin','member'))),
-- șterge-l și adaugă unul nou sau schimbă coloana la text fără constraint.
-- Exemplu pentru PostgreSQL:
-- ALTER TABLE app_members DROP CONSTRAINT IF EXISTS app_members_role_check;
-- ALTER TABLE app_members ADD CONSTRAINT app_members_role_check 
--   CHECK (role IN ('owner','admin','member','vanzator','receptie','tehnician'));

-- Variantă simplă (dacă role e de tip text fără constraint, nu e nevoie să rulezi nimic):
-- Noile valori vor funcționa direct.
