-- Migration v9: In-Chat BPM Approvals & Line Manager Routing
-- Adds approver_line_id to company_employees, manager_line_id to locations, and creates approvals table

ALTER TABLE company_employees ADD COLUMN approver_line_id TEXT DEFAULT NULL;
ALTER TABLE locations ADD COLUMN manager_line_id TEXT DEFAULT NULL;

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
