-- Migration v7: Employee Schedules & Shifts Framework
CREATE TABLE IF NOT EXISTS employee_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL,               -- 關聯 locations.id (例如 '24549210-01')
    line_user_id TEXT NOT NULL,             -- 員工 LINE User ID
    work_date TEXT NOT NULL,                -- 排班日期 (YYYY-MM-DD，例如 '2026-08-15')
    shift_name TEXT NOT NULL DEFAULT '常態班', -- 班別名稱 (例如 '常態班', '早班', '晚班', '大夜班', '例假')
    shift_start TEXT DEFAULT '09:00',       -- 預計上班時間 (HH:MM，NULL 表示休假)
    shift_end TEXT DEFAULT '18:00',         -- 預計下班時間 (HH:MM，支援跨日大夜如 '07:00')
    break_minutes INTEGER DEFAULT 60,       -- 預設休息時間 (分鐘)
    is_rest_day INTEGER NOT NULL DEFAULT 0, -- 1: 休假/例假日, 0: 工作日
    is_cross_day INTEGER NOT NULL DEFAULT 0,-- 1: 跨日班次 (大夜班)
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    UNIQUE(company_id, line_user_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_schedules_user_date ON employee_schedules (line_user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_schedules_company_date ON employee_schedules (company_id, work_date);
