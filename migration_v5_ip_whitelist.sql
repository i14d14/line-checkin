-- Migration v5: Add allowed_ips to locations and verify_mode to checkin_records
ALTER TABLE locations ADD COLUMN allowed_ips TEXT DEFAULT NULL;
ALTER TABLE checkin_records ADD COLUMN verify_mode TEXT DEFAULT 'GPS_ONLY';
