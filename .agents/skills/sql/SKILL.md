---
name: sql
description: Use when designing, reviewing, normalizing, or optimizing SQL database schemas, table segmentation, vertical partitioning, indexing, multi-tenant data isolation, and SQLite/Cloudflare D1 architectures.
---

# SQL & Database Architecture Skill

## Goal

Provide reference patterns, best practices, and decision frameworks for designing scalable, maintainable, and high-performance SQL relational schemas (with a focus on SQLite, Cloudflare D1, PostgreSQL, and MySQL).

## Core Principles of Table Segmentation

### 1. The 4 Segmentation Dimensions

When designing database tables, segment data along 4 architectural dimensions:

1. **Domain & Entity Boundaries (DDD Bounded Context)**:
   - Separate distinct business domains into dedicated tables.
   - *Example*: `locations` (Company Master), `company_employees` (Attribution), `user_devices` (Hardware Identity), `checkin_records` (Transactional Events), `device_audit_logs` (Security Audits).
2. **Lifecycle & Update Frequency (Hot vs. Cold / Static vs. Dynamic)**:
   - Separate frequently appended append-only logs from slowly changing master dimensions.
   - *Rule*: Never mix high-frequency time-series transaction rows with slow-changing configuration profiles in the same table.
3. **Cardinality & Null Avoidance (1:1, 1:N, M:N)**:
   - Eliminate sparse wide tables where 30%+ of columns are `NULL`.
   - Extract optional, polymorphic, or high-cardinality attributes into satellite tables.
4. **Access Pattern & Vertical Partitioning**:
   - Separate high-throughput lookup columns (indexable IDs, timestamps, status flags) from heavy payloads (`TEXT`, `BLOB`, JSON blobs, long notes).
   - This ensures database page cache holds more index rows per memory block.

---

## Normalization vs. Segmentation Decision Matrix

| Requirement | Strategy | Anti-Pattern to Avoid |
| :--- | :--- | :--- |
| **Maintain Single Source of Truth** | **3NF Normalization** (Extract shared lookup tables) | Duplicating address/company names in every punch row. |
| **High-Throughput Read Queries** | **Pragmatic Denormalization** (Store computed values like `distance_meters`, `work_hours`) | Re-computing complex historical geospatial offsets on every read. |
| **Audit & Compliance** | **Immutable Append-Only Audit Tables** (`audit_logs`) | Overwriting state in-place without maintaining historical changelogs. |
| **Multi-Tenant Isolation** | **Indexed Tenant Scoping** (`company_id` indexed on every query) | Global un-scoped scans or relying solely on application-level filtering. |

---

## Anti-Patterns & Gotchas

- **The "God Table" Anti-Pattern**: Putting everything (employee info, device binding, company location, check-in history, leave balance) into a single 40-column table. Causes locking contention, update anomalies, and schema migration paralysis.
- **Over-Normalization (Micro-Tables)**: Splitting logically cohesive 1:1 attributes (e.g. splitting `latitude` and `longitude` into a separate `geo_coords` table) requiring 8+ JOINs for trivial queries.
- **Un-indexed Foreign Keys**: Forgetting to add composite indexes on tenant/timestamp pairs (e.g. `CREATE INDEX idx_checkin_comp_time ON checkin_records (company_id, created_at)`).
- **Mutable Timestamps in D1/SQLite**: Using non-standard datetime formats. Always standardize on UTC+8 ISO strings or UNIX epoch integers: `datetime('now', '+8 hours')`.

---

## Additional References

- `references/table-segmentation.md`: Comprehensive guide to Normalization, Vertical Partitioning, DDD Bounded Contexts, and Cloudflare D1/SQLite optimization patterns.
