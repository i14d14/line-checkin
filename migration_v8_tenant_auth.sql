-- Migration v8: Tenant Users and Sessions for Web Admin Portal Authentication
CREATE TABLE IF NOT EXISTS tenant_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_id TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'ADMIN',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    last_login_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tax_id ON tenant_users(tax_id);

CREATE TABLE IF NOT EXISTS tenant_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    tax_id TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (user_id) REFERENCES tenant_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_sessions_token ON tenant_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_tenant_sessions_user ON tenant_sessions(user_id);

INSERT OR IGNORE INTO tenant_users (tax_id, username, password_hash, salt, display_name, role, is_active)
VALUES (
    '24549210',
    'admin',
    'c42e6b483a3382999fdd1b56fcb3dec6ccba0908542e873f932853d49798eee8',
    'salt_24549210_init',
    '豬毛有限公司 系統管理員',
    'ADMIN',
    1
);
