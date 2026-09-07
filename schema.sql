-- Table: locations (5-Column Minimalist Model)
CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,            -- 統編 (例如 '24549210') 或 統編-分店號 (例如 '24549210-01')
    name TEXT NOT NULL,             -- 據點顯示名稱 (例如 '豬毛有限公司 - 台中美德總部')
    address TEXT NOT NULL,          -- 門市中文地址 (例如 '台中市北區美德街56-11號')
    target_lat REAL NOT NULL,       -- 打卡目標緯度
    target_lon REAL NOT NULL,       -- 打卡目標經度
    allowed_radius REAL DEFAULT 100,-- 允許打卡半徑 (公尺)
    allowed_ips TEXT DEFAULT NULL,  -- 允許打卡之固定公網 IP 或 CIDR 網段 (以逗號分隔，例如 '211.20.1.5, 114.33.20.0/24'，NULL 表示不限)
    manager_line_id TEXT DEFAULT NULL, -- 據點預設主管 LINE User ID (兜底審批)
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- Table: company_employees (Employee Location Attribution)
CREATE TABLE IF NOT EXISTS company_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL,       -- 儲存 location_id (例如 '24549210-01')
    line_user_id TEXT NOT NULL UNIQUE, -- 1 位員工綁定 1 個主要打卡據點
    employee_name TEXT,
    approver_line_id TEXT DEFAULT NULL, -- 直屬主管 LINE User ID
    permissions TEXT DEFAULT '["punch","apply"]', -- 細粒度原子權限 JSON 陣列 (PBAC)
    schedule_mode TEXT NOT NULL DEFAULT 'FIXED', -- 工時排班制度: 'FIXED' (常態固定班), 'SHIFT' (門市排班制)
    default_shift_start TEXT DEFAULT '09:00', -- 常態上班時間
    default_shift_end TEXT DEFAULT '18:00',   -- 常態下班時間
    default_break_minutes INTEGER DEFAULT 60, -- 常態休息時間 (分鐘)
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_company_emp ON company_employees (company_id, line_user_id);

-- Table: user_devices (1 Account = 1 Active Device)
CREATE TABLE IF NOT EXISTS user_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_user_id TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL,
    device_name TEXT,
    bound_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices (line_user_id);

-- Table: device_audit_logs (Device binding, unbinding, switching and unauthorized attempts)
CREATE TABLE IF NOT EXISTS device_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_user_id TEXT NOT NULL,
    display_name TEXT,
    action TEXT NOT NULL,           -- 'INITIAL_BIND', 'SWITCH_DEVICE', 'UNAUTHORIZED_ATTEMPT', 'UNBIND_BY_TENANT_ADMIN'
    old_device_id TEXT,
    new_device_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    warning_level TEXT NOT NULL DEFAULT 'INFO', -- 'INFO', 'WARNING'
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_audit_user_time ON device_audit_logs (line_user_id, created_at);

-- Table: checkin_records (Attendance Logs with Smart Punch Type, Work Hours & Verification Mode)
CREATE TABLE IF NOT EXISTS checkin_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT,                -- 關聯 locations.id (支援 LIKE '統編%' 跨分店匯總)
    line_user_id TEXT NOT NULL,
    display_name TEXT,
    device_id TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    distance_meters REAL NOT NULL,
    status TEXT NOT NULL,           -- 'SUCCESS', 'OUT_OF_RANGE', 'DEVICE_MISMATCH', 'CANCELLED', 'DUPLICATE'
    punch_type TEXT NOT NULL DEFAULT 'IN', -- 'IN' (上班), 'OUT' (下班)
    work_hours REAL DEFAULT NULL,   -- 當次工時 (小時，下班時自動計算)
    verify_mode TEXT DEFAULT 'GPS_ONLY', -- 'IP_WHITELIST', 'GPS_FALLBACK', 'GPS_ONLY'
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_checkin_company_time ON checkin_records (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_checkin_user_time ON checkin_records (line_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_checkin_state_machine ON checkin_records (line_user_id, status, id DESC);

-- Table: tenant_api_keys (Tenant M2M API Keys with SHA-256 Hashing & RBAC)
CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_id TEXT NOT NULL,                   -- 企業統編 (例如 '24549210' 或測試統編 '00000000')
    api_key_hash TEXT NOT NULL UNIQUE,      -- SHA-256 雜湊儲存之 API Key
    key_hint TEXT NOT NULL,                 -- 前綴提示 (例如 'pk_live_2454...a8b9')
    name TEXT NOT NULL,                     -- 金鑰說明 (例如 '美德總部地端管理後台')
    role TEXT NOT NULL DEFAULT 'ADMIN',     -- 'ADMIN' (完整管理), 'READ_ONLY' (僅查詢匯出), 'SANDBOX_QA' (僅沙盒測試)
    is_active INTEGER NOT NULL DEFAULT 1,   -- 1: 啟用, 0: 停用
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    last_used_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_keys_hash ON tenant_api_keys (api_key_hash, is_active);
CREATE INDEX IF NOT EXISTS idx_tenant_keys_tax ON tenant_api_keys (tax_id);

-- Table: employee_schedules (Employee Shift & Work Schedules)
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

-- Table: tenant_users (Tenant Web Admin Portal User Accounts)
CREATE TABLE IF NOT EXISTS tenant_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_id TEXT NOT NULL,                     -- 企業統編 (例如 '24549210')
    username TEXT NOT NULL UNIQUE,            -- 登入帳號 (例如 'admin')
    password_hash TEXT NOT NULL,              -- PBKDF2 SHA-256 Hash
    salt TEXT NOT NULL,                       -- 密碼鹽
    display_name TEXT NOT NULL,               -- 顯示名稱
    role TEXT NOT NULL DEFAULT 'ADMIN',       -- 'ADMIN', 'MANAGER', 'VIEWER'
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    last_login_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tax_id ON tenant_users(tax_id);

-- Table: tenant_sessions (Web Admin Portal Authenticated Sessions)
CREATE TABLE IF NOT EXISTS tenant_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,          -- Session Token SHA-256 Hash
    user_id INTEGER NOT NULL,
    tax_id TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at TEXT NOT NULL,                 -- 過期時間 (YYYY-MM-DD HH:MM:SS)
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (user_id) REFERENCES tenant_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_sessions_token ON tenant_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_tenant_sessions_user ON tenant_sessions(user_id);

-- Table: approvals (In-Chat BPM Approvals: Leave, Correction, Overtime)
CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,                       -- 單號 (UUID，例如 'appr_7f3b8e21...')
    company_id TEXT NOT NULL,                  -- 所屬據點 (關聯 locations.id)
    line_user_id TEXT NOT NULL,                -- 申請人 LINE User ID
    applicant_name TEXT NOT NULL,              -- 申請人姓名
    approver_line_id TEXT NOT NULL,            -- 指定審核主管 LINE User ID
    type TEXT NOT NULL,                        -- 'LEAVE' (請假), 'CORRECTION' (補卡), 'OVERTIME' (加班)
    target_date TEXT NOT NULL,                 -- 涉及日期 (YYYY-MM-DD)
    details TEXT NOT NULL,                     -- JSON 格式細節 (請假類別、時段、補卡類型、原因等)
    status TEXT NOT NULL DEFAULT 'PENDING',    -- 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'
    review_note TEXT DEFAULT NULL,             -- 主管審核備註
    decided_at TEXT DEFAULT NULL,              -- 審核時間 (YYYY-MM-DD HH:MM:SS)
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_approvals_approver_status ON approvals (approver_line_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_user ON approvals (line_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approvals_company ON approvals (company_id, created_at);

-- Table: cron_notifications (Idempotent Scheduled Push Notifications - Schema v11)
CREATE TABLE IF NOT EXISTS cron_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_user_id TEXT NOT NULL,
    work_date TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'REMIND_IN', 'REMIND_OUT'
    shift_time TEXT,
    sent_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    UNIQUE(line_user_id, work_date, type)
);

CREATE INDEX IF NOT EXISTS idx_cron_notif ON cron_notifications (line_user_id, work_date, type);

-- Table: announcements (Company Announcements & Multicast Notices - Schema v12)
CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_announcements_company ON announcements (company_id);

-- Table: announcement_reads (Read Receipt Acknowledgement Logs - Schema v12)
CREATE TABLE IF NOT EXISTS announcement_reads (
    announcement_id TEXT NOT NULL,
    line_user_id TEXT NOT NULL,
    read_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    PRIMARY KEY (announcement_id, line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_id ON announcement_reads (announcement_id);

