---
name: line-checkin-ops
description: Operational runbooks, checklists, and safe maintenance routines for the LINE Check-in system, including zero-downtime Rich Menu migration with mandatory user reassignment, attendance record revocation, edge deployments, and Cloudflare D1 database operations. Use whenever updating Rich Menus, performing administrative resets, deploying edge releases, or running store attendance operations.
---

# LINE Check-in Operational Routines & Maintenance Guide

This skill provides step-by-step operational runbooks, checklists, and reference scripts for recurring administrative tasks in the LINE Check-in project.

## Operational Table of Contents

1. [Routine 1: Zero-Downtime Rich Menu Overhaul & Reassignment Pipeline](#routine-1-zero-downtime-rich-menu-overhaul--reassignment-pipeline)
2. [Routine 2: Attendance Revocation & State Machine Reset](#routine-2-attendance-revocation--state-machine-reset)
3. [Routine 3: Dual-Stack IP & Wi-Fi Whitelist Maintenance](#routine-3-dual-stack-ip--wi-fi-whitelist-maintenance)
4. [Routine 4: Edge Deployment & Full Verification Pipeline](#routine-4-edge-deployment--full-verification-pipeline)
5. [Routine 5: D1 Remote Query & Data Inspection Protocol](#routine-5-d1-remote-query--data-inspection-protocol)
6. [Routine 6: Employee PBAC Permissions & Dynamic Menu Reassignment](#routine-6-employee-pbac-permissions--dynamic-menu-reassignment)
7. [Operational Script Inventory](#operational-script-inventory)

---

## Routine 1: Zero-Downtime Rich Menu Overhaul & Reassignment Pipeline

### The LINE Rich Menu Invariant: Immutability & Reassignment
- **Server-Side Immutability**: LINE Rich Menus are immutable resources once uploaded. IDs (e.g., `richmenu-xxxx`) are randomly allocated by LINE servers and cannot be customized or reused.
- **The 404 Fallback Trap**: If an existing Rich Menu ID is deleted via `DELETE /v2/bot/richmenu/{id}` before users are migrated, all individual user bindings in LINE immediately invalidate into HTTP 404 (`the user has no richmenu`), causing all registered employees and managers to unexpectedly fall back to the default Onboarding menu.
- **Zero-Downtime Reassignment Invariant**: New menu IDs must be created, default menus updated, and **all registered users reassigned to the new IDs in bulk** *before* the previous menu IDs are deleted.

### Standard Execution Workflow

#### Phase 1: Template Modification & Rendering
1. Edit HTML templates under [`scripts/templates/`](file:///d:/line-checkin/scripts/templates/):
   - [`richmenu_employee.html`](file:///d:/line-checkin/scripts/templates/richmenu_employee.html) (2500x843, 3 columns: Punch, Calendar, Approvals)
   - [`richmenu_manager.html`](file:///d:/line-checkin/scripts/templates/richmenu_manager.html) (2500x1686, 2 rows: 3 personal items + wide management console)
   - [`richmenu_onboarding.html`](file:///d:/line-checkin/scripts/templates/richmenu_onboarding.html) (2500x843, 1 card: Newcomer Registration)
2. Render high-resolution PNGs via headless Microsoft Edge:
   ```powershell
   npm run render:menus
   ```
   *Artifacts outputted to `scripts/richmenu_*.png`.*

#### Phase 2: Safe Creation, Reassignment & Cutover
3. Execute the synchronized provisioning script:
   ```powershell
   npm run setup:menus
   ```
   *Ensures the sequence:*
   - Creates new Rich Menus in LINE (`POST /v2/bot/richmenu`).
   - Uploads PNG image content (`POST /v2/bot/richmenu/{id}/content`).
   - Sets the new Onboarding menu as default (`POST /v2/bot/user/all/richmenu/{id}`).
   - Queries registered employees and managers from D1 database.
   - **Reassigns active employees to `EMPLOYEE_RICH_MENU_ID` and managers to `MANAGER_RICH_MENU_ID`** (`POST /v2/bot/richmenu/bulk/link` or individual links).
   - Only after successful reassignment, calls `DELETE /v2/bot/richmenu/{oldId}` to purge legacy menus.
   - Updates [`scripts/rich_menu_ids.json`](file:///d:/line-checkin/scripts/rich_menu_ids.json).

#### Phase 3: Codebase Synchronization & Deployment
4. Update backend constants in [`src/types/index.ts`](file:///d:/line-checkin/src/types/index.ts):
   ```typescript
   export const ONBOARDING_RICH_MENU_ID = "richmenu-...";
   export const EMPLOYEE_RICH_MENU_ID = "richmenu-...";
   export const MANAGER_RICH_MENU_ID = "richmenu-...";
   ```
5. Update test references in [`test_rich_menu_sync.js`](file:///d:/line-checkin/test_rich_menu_sync.js).
6. Run integrity checks, regression tests, and edge deploy:
   ```powershell
   npm run check
   node test_rich_menu_sync.js
   npm run deploy
   ```

---

## Routine 2: Attendance Revocation & State Machine Reset

When an employee accidentally punches in/out or tests punch logic, use the revocation CLI tool.

### CLI Usage (`scripts/revoke-checkin.js`)

```powershell
# Preview matching records without modifying data
node scripts/revoke-checkin.js "豬毛" --list

# Soft-cancel the latest check-in session for today (sets status='CANCELLED')
node scripts/revoke-checkin.js "豬毛" --latest

# Hard-delete the latest record
node scripts/revoke-checkin.js "豬毛" --latest --delete

# Revoke by specific record ID
node scripts/revoke-checkin.js --id 682

# Target by LINE User ID directly
node scripts/revoke-checkin.js Ubd107bb3ba1b85a8086fc3b2250458e8 --latest
```

### Safety Rules:
- Default action is **soft-cancellation** (`status = 'CANCELLED'`), preserving audit trail.
- Use `--delete` only for synthetic test teardowns.
- Soft-cancelled records immediately free the user's state machine to allow a fresh check-in.

---

## Routine 3: Dual-Stack IP & Wi-Fi Whitelist Maintenance

### Invariant: Happy Eyeballs & IPv6 Registration
- Cloudflare Edge proxies resolve dual-stack client connections preferentially over IPv6.
- If a store Wi-Fi provides dual-stack IPv6 and only the IPv4 address is whitelisted in D1, client check-in requests fail IP whitelist matching and fall back to GPS mode (`GPS_FALLBACK`).

### Maintenance Steps:
1. Register both IPv4 and IPv6 public addresses for store locations:
   ```sql
   UPDATE locations 
   SET allowed_ips = '59.126.167.108, 2001:b030:.../64'
   WHERE id = '24549210-01';
   ```
2. Or use the store-level automated registration endpoint:
   `POST /api/v1/tenant/locations/wifi` (auto-detects caller `cf-connecting-ip`).

---

## Routine 4: Edge Deployment & Full Verification Pipeline

Execute before finalizing any feature or configuration change:

```powershell
# 1. Typecheck & Architecture Validation
npm run check

# 2. Key Regression Test Suites
npm run test:flex
node test_bpm_approvals.js
node test_rich_menu_sync.js

# 3. Cloudflare Workers Edge Deploy
npm run deploy
```

Verify deployment output displays:
```text
Uploaded line-checkin-worker
Deployed line-checkin-worker triggers
Current Version ID: <uuid>
```

---

## Routine 5: D1 Remote Query & Data Inspection Protocol

Windows PowerShell safe query construction (avoids quote expansion traps):

### Recommended Pattern: SQL File Injection
```powershell
# 1. Write query to a scratch SQL file
Set-Content -Path "scratch_query.sql" -Value "SELECT id, employee_name, permissions FROM company_employees LIMIT 10;" -Encoding utf8

# 2. Execute via run-wrangler.js with --file
node run-wrangler.js d1 execute line-checkin-db --remote --file=scratch_query.sql --json

# 3. Clean up scratch file
Remove-Item -LiteralPath "scratch_query.sql"
```

---

## Routine 6: Employee PBAC Permissions & Dynamic Menu Reassignment

When elevating an employee to a managerial role, assigning specific PBAC permissions, or revoking privileges:

### Standard CLI Tool (`scripts/grant-permissions.js`)

```powershell
# Grant all 10 manager permissions + admin privilege to 豬毛 and bind Manager Rich Menu
node scripts/grant-permissions.js "豬毛" --all

# Assign role presets (boss, manager, hr, employee)
node scripts/grant-permissions.js Ubd107bb3ba1b85a8086fc3b2250458e8 --preset=boss
node scripts/grant-permissions.js <lineUserIdOrName> --preset=manager
node scripts/grant-permissions.js <lineUserIdOrName> --preset=hr
node scripts/grant-permissions.js <lineUserIdOrName> --preset=employee
```

### Invariants & Operational Safety Protocols:
1. **Dual Persistence & Real-time Menu Sync Invariant**:
   Modifying `company_employees.permissions` in D1 must immediately be synchronized with the user's LINE Rich Menu:
   - Any manager permissions (`MANAGEMENT_PERMISSIONS`) -> Links `MANAGER_RICH_MENU_ID` (`richmenu-37e110fb3f8093db1984d6fb85ddae04`).
   - Regular employee permissions only -> Links `EMPLOYEE_RICH_MENU_ID` (`richmenu-0310e7f4244e16f2588e213ca46fed5e`).
2. **Store Approver Routing Decoupling Invariant**:
   Elevating an employee's permissions must NOT modify the store location's `locations.manager_line_id` (e.g. Headquarters `24549210-01` retains 珈妤 `U4eb5f204f746d1ab2b360e687eb99105` as store manager and fallback approver), ensuring employee leave approval routes remain independent.
3. **Automated Test Teardown Symmetry Invariant**:
   Test suites mutating employee records (such as `test_rich_menu_sync.js`) MUST capture pre-test employee permissions and restore both D1 records and LINE menu links in a `finally` block to prevent privilege drift.

---

## Operational Script Inventory

| Script | Purpose | Reference |
|---|---|---|
| [`scripts/render_rich_menus.js`](file:///d:/line-checkin/scripts/render_rich_menus.js) | Renders HTML/CSS templates into 2500px PNGs using headless Edge. | [Reference](file:///d:/line-checkin/.agents/skills/line-checkin-ops/references/rich-menu-lifecycle.md) |
| [`scripts/setup_all_rich_menus.js`](file:///d:/line-checkin/scripts/setup_all_rich_menus.js) | Full lifecycle provisioning of 3 Rich Menus + Safe Reassignment. | [Reference](file:///d:/line-checkin/.agents/skills/line-checkin-ops/scripts/safe_update_rich_menus.js) |
| [`scripts/grant-permissions.js`](file:///d:/line-checkin/scripts/grant-permissions.js) | Fast CLI to grant PBAC permissions and dynamically sync LINE Rich Menu. | [Routine 6](#routine-6-employee-pbac-permissions--dynamic-menu-reassignment) |
| [`scripts/revoke-checkin.js`](file:///d:/line-checkin/scripts/revoke-checkin.js) | CLI utility to soft-cancel or delete attendance records. | [Reference](file:///d:/line-checkin/.agents/skills/line-checkin-ops/scripts/revoke-checkin.js) |
| [`scripts/manage_rich_menus.js`](file:///d:/line-checkin/scripts/manage_rich_menus.js) | Inspects active LINE menus and validates per-user linking. | [Reference](file:///d:/line-checkin/.agents/skills/line-checkin-ops/references/operational-commands.md) |
| [`scripts/configure-pigmao-schedule.js`](file:///d:/line-checkin/scripts/configure-pigmao-schedule.js) | Configures baseline 09:00-17:00 weekday schedule for user 豬毛. | [Reference](file:///d:/line-checkin/.agents/skills/line-checkin-ops/references/operational-commands.md) |

