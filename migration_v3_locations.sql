-- Table: locations (4-Column Minimalist Model)
CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,            -- 統編 (例如 '24549210') 或 統編-分店號 (例如 '24549210-01')
    name TEXT NOT NULL,             -- 據點顯示名稱 (例如 '豬毛餐飲 - 台中美德店')
    address TEXT NOT NULL,          -- 門市中文地址 (例如 '台中市北區美德街56-11號')
    target_lat REAL NOT NULL,       -- 打卡目標緯度
    target_lon REAL NOT NULL,       -- 打卡目標經度
    allowed_radius REAL DEFAULT 100,-- 允許打卡半徑 (公尺)
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- Seed default locations
INSERT OR REPLACE INTO locations (id, name, address, target_lat, target_lon, allowed_radius)
VALUES ('24549210-01', '豬毛科技 - 台中美德總部', '台中市北區美德街56-11號', 24.157722, 120.683167, 100);

INSERT OR REPLACE INTO locations (id, name, address, target_lat, target_lon, allowed_radius)
VALUES ('24549210-02', '豬毛科技 - 台北101門市', '台北市信義區信義路五段7號', 25.033976, 121.564538, 150);

INSERT OR REPLACE INTO locations (id, name, address, target_lat, target_lon, allowed_radius)
VALUES ('10458575-01', '統一超商 - 高雄旗艦店', '高雄市新興區中山一路100號', 22.627278, 120.301435, 100);
