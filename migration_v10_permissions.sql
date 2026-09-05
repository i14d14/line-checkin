-- Migration v10: Granular Permission-based Access Control (PBAC)
ALTER TABLE company_employees ADD COLUMN permissions TEXT DEFAULT '["punch","apply"]';
