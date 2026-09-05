-- Migration v6: Tenant API Keys Table for M2M Client On-Premises Management & RBAC
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
