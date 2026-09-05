-- 1. Create companies table
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target_lat REAL NOT NULL,
    target_lon REAL NOT NULL,
    allowed_radius REAL DEFAULT 100,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- 2. Create company_employees table
CREATE TABLE IF NOT EXISTS company_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL,
    line_user_id TEXT NOT NULL UNIQUE,
    employee_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_company_emp ON company_employees (company_id, line_user_id);

-- 3. Add company_id column to checkin_records (ignore if exists)
-- (We will run ALTER TABLE separately)

-- 4. Seed default company (Taichung Meide St)
INSERT OR REPLACE INTO companies (id, name, target_lat, target_lon, allowed_radius)
VALUES ('56110001', '台中市北區美德街56-11號', 24.157722, 120.683167, 100);

-- 5. Seed a demo second company (Taipei 101 Branch)
INSERT OR REPLACE INTO companies (id, name, target_lat, target_lon, allowed_radius)
VALUES ('10100002', '台北101分公司', 25.033976, 121.564538, 150);
