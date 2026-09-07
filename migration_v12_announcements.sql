-- Migration v12: Company Announcements & Read Receipts (Schema v12 / v2.13.0)

CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_announcements_company ON announcements (company_id);

CREATE TABLE IF NOT EXISTS announcement_reads (
    announcement_id TEXT NOT NULL,
    line_user_id TEXT NOT NULL,
    read_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    PRIMARY KEY (announcement_id, line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_id ON announcement_reads (announcement_id);
