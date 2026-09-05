-- Migration v4: Add punch_type and work_hours to checkin_records
ALTER TABLE checkin_records ADD COLUMN punch_type TEXT NOT NULL DEFAULT 'IN';
ALTER TABLE checkin_records ADD COLUMN work_hours REAL DEFAULT NULL;
