-- Recreate company_employees table without legacy FK to allow location IDs
CREATE TABLE IF NOT EXISTS company_employees_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL,       -- 儲存 location_id (例如 '24549210-01' 或 '24549210')
    line_user_id TEXT NOT NULL UNIQUE,
    employee_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

INSERT OR IGNORE INTO company_employees_new (id, company_id, line_user_id, employee_name, created_at)
SELECT id, company_id, line_user_id, employee_name, created_at FROM company_employees;

DROP TABLE IF EXISTS company_employees;

ALTER TABLE company_employees_new RENAME TO company_employees;

CREATE INDEX IF NOT EXISTS idx_company_emp ON company_employees (company_id, line_user_id);
