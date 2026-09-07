# SQL Table Segmentation & Database Architecture Best Practices

## 1. Executive Summary: Why Table Segmentation Matters

In database engineering, table segmentation is the discipline of dividing data across focused, cohesive physical tables to optimize **maintainability, data integrity, and I/O performance**.

A poorly segmented "God Table" (one giant table with 30-50 columns) introduces three fatal long-term problems:
1. **Update Anomalies & Inconsistency**: Changing a customer's address or company name requires updating thousands or millions of historical transaction rows.
2. **Buffer Pool & Cache Inefficiency**: Wide tables with long strings/text load unnecessary bytes into the database memory page cache, dramatically reducing query throughput.
3. **Migration Paralysis**: Modifying column types, adding constraints, or renaming fields in a massive shared table risks locking down active production workloads.

---

## 2. The 3 Architectural Pillars of Table Segmentation

### Pillar A: Logical Normalization (1NF, 2NF, 3NF)
- **Goal**: Maintain a **Single Source of Truth** and prevent redundant data.
- **Rule of Thumb**:
  - Every non-key column must depend on the primary key, the whole primary key, and nothing but the primary key.
  - Separate lookup reference dimensions (`locations`, `departments`) from transactional event streams (`checkin_records`).

### Pillar B: Domain-Driven Segmentation (DDD Bounded Context)
- **Goal**: Align physical database tables with distinct business capabilities.
- **Classification of Tables**:
  1. **Master Dimension Tables**: Slowly changing business entities (e.g. `locations`, `companies`).
  2. **Attribution / Relationship Tables**: Mapping many-to-many or 1-to-many business relationships (e.g. `company_employees`).
  3. **State / Hardware Binding Tables**: Current operational snapshot (e.g. `user_devices` storing current 1-to-1 active hardware token).
  4. **Transactional Event Streams**: Immutable or state-machine time-series logs (e.g. `checkin_records`).
  5. **Security & Audit Logs**: Append-only compliance changelogs (e.g. `device_audit_logs`).

### Pillar C: Vertical Partitioning (Physical I/O Optimization)
- **Goal**: Maximize memory cache efficiency by separating "Hot" columns from "Cold" / heavy payload columns.
- **Implementation**:
  - **Hot Table**: Contains indexable foreign keys, timestamps, status enums, and numerical counters.
  - **Cold / Satellite Table**: Contains large text blobs, serialized JSON configurations, raw debug payloads, or rarely queried profile fields.

---

## 3. Practical Example: Before vs. After Segmentation

### ❌ Anti-Pattern: The Unsegmented "God Table"
```sql
-- BAD: 20+ columns mixing master data, device state, checkin event, and audit log
CREATE TABLE all_checkin_data (
    id INTEGER PRIMARY KEY,
    user_id TEXT,
    user_name TEXT,
    company_id TEXT,
    company_name TEXT,           -- Redundant: changes desync history
    company_address TEXT,        -- Redundant: wastes 100+ bytes per row
    company_lat REAL,
    company_lon REAL,
    allowed_radius REAL,
    current_device_id TEXT,      -- State collision: overwrites hardware history
    punch_lat REAL,
    punch_lon REAL,
    punch_type TEXT,
    distance_meters REAL,
    status TEXT,
    work_hours REAL,
    audit_action TEXT,           -- Null in 95% of normal checkins
    old_device_id TEXT,          -- Null in 99% of rows
    ip_address TEXT,
    user_agent TEXT,             -- Huge string (150 bytes) bloats index cache
    created_at TEXT
);
```

### ✅ Best Practice: Clean 5-Table Segmented Architecture
```sql
-- 1. Master Location Dimension (Updated rarely, read often)
CREATE TABLE locations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    target_lat REAL NOT NULL,
    target_lon REAL NOT NULL,
    allowed_radius REAL DEFAULT 100,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- 2. Employee Location Attribution (1:N mapping)
CREATE TABLE company_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL,
    line_user_id TEXT NOT NULL UNIQUE,
    employee_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- 3. Hardware Device Binding (1:1 active state snapshot)
CREATE TABLE user_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_user_id TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL,
    device_name TEXT,
    bound_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- 4. Checkin Records (High-throughput transactional time-series)
CREATE TABLE checkin_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT,
    line_user_id TEXT NOT NULL,
    display_name TEXT,
    device_id TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    distance_meters REAL NOT NULL,
    status TEXT NOT NULL, -- 'SUCCESS', 'CANCELLED', 'DUPLICATE', 'OUT_OF_RANGE'
    punch_type TEXT NOT NULL DEFAULT 'IN',
    work_hours REAL DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- 5. Audit Trail (Append-only security log)
CREATE TABLE device_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_user_id TEXT NOT NULL,
    display_name TEXT,
    action TEXT NOT NULL,
    old_device_id TEXT,
    new_device_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    warning_level TEXT NOT NULL DEFAULT 'INFO',
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);
```

---

## 4. SQLite & Cloudflare D1 Optimization Checklist

1. **Composite Indexes for Time-Series Queries**:
   ```sql
   CREATE INDEX idx_checkin_comp_time ON checkin_records (company_id, created_at);
   CREATE INDEX idx_checkin_user_time ON checkin_records (line_user_id, created_at);
   ```
2. **Keep Rows Under 4KB**:
   - SQLite reads and caches data in 4KB pages. Keeping transactional rows compact ensures dozens of rows fit into a single page read from disk.
3. **Store Precomputed Aggregates where Realtime Speed Matters**:
   - Store `distance_meters` and `work_hours` calculated on write, avoiding costly mathematical GIS projection recalculations on dashboard read queries.
