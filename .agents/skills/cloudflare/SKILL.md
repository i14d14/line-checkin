---
name: cloudflare
description: Focused Cloudflare platform skill for the LINE Check-in project. Covers Cloudflare Workers, D1 database, Cron Triggers, and Wrangler CLI operations. Load before interacting with Cloudflare Workers, running migrations, or executing wrangler commands.
references:
  - workers
  - d1
  - cron-triggers
  - wrangler
---

# Cloudflare Skill (LINE Check-in Project)

Focused, lightweight reference for Cloudflare Workers, D1 Serverless SQLite, Cron Triggers, and Wrangler CLI management tailored specifically for the LINE Check-in and BPM approval platform.

---

## 1. Workspace Identity & Infrastructure

- **Cloudflare Account ID**: `855d7f93966abed2712c15f619ea6721`
- **Worker Name**: `line-checkin-worker` (`https://line-checkin-worker.i14d142.workers.dev`)
- **D1 Database ID**: `d331ccb9-3aa5-48bd-8803-5e074e38b1c2` (`line-checkin-db`, APAC/Singapore)

### Environment Configuration (`.env`)
```ini
CLOUDFLARE_ACCOUNT_ID="855d7f93966abed2712c15f619ea6721"
CLOUDFLARE_API_TOKEN="your_scoped_api_token"
```

---

## 2. Cloudflare Workers Architecture

The project runs on Cloudflare Workers with TypeScript, using the standard ES module `ExportedHandler<Env>` pattern:

```typescript
export interface Env {
  DB: D1Database;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_CHANNEL_SECRET: string;
  LINE_LOGIN_CHANNEL_SECRET: string;
  ENVIRONMENT?: string;
}

export default {
  // HTTP APIs, Webhooks, LIFF & Admin Portal
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // Route handling...
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  },

  // Cron Triggers (Scheduled Push & Attendance Reminders)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Cron triggered at ${new Date(event.scheduledTime).toISOString()}`);
    // Attendance reminder & digest logic...
  },
} satisfies ExportedHandler<Env>;
```

---

## 3. Cloudflare D1 Database (Serverless SQLite)

### Query API & Best Practices
Always use parameter binding (`.bind(...)`) to prevent SQL injection:

```typescript
// 1. Single row query
const user = await env.DB.prepare(
  "SELECT * FROM tenant_users WHERE username = ? AND is_active = 1"
).bind(username).first<TenantUser>();

// 2. Multi-row query
const records = await env.DB.prepare(
  "SELECT * FROM checkin_records WHERE company_id = ? ORDER BY created_at DESC LIMIT 50"
).bind(companyId).all<CheckinRecord>();

// 3. Insert / Update / Delete
const res = await env.DB.prepare(
  "INSERT INTO checkin_records (company_id, line_user_id, status, punch_type, latitude, longitude, distance_meters) VALUES (?, ?, ?, ?, ?, ?, ?)"
).bind(companyId, userId, "SUCCESS", punchType, lat, lon, dist).run();

// 4. Batch Transaction (Atomicity)
const batchResults = await env.DB.batch([
  env.DB.prepare("UPDATE employee_schedules SET is_rest_day = 1 WHERE line_user_id = ? AND work_date = ?").bind(userId, targetDate),
  env.DB.prepare("UPDATE approvals SET status = 'APPROVED', decided_at = datetime('now', '+8 hours') WHERE id = ?").bind(approvalId),
]);
```

### Remote D1 Schema Migrations
Always run D1 commands via `run-wrangler.js` or `npx wrangler`:
```bash
# Execute SQL query remotely
node run-wrangler.js d1 execute line-checkin-db --remote --command "SELECT count(*) FROM checkin_records;"

# Apply migration file remotely
node run-wrangler.js d1 execute line-checkin-db --remote --file=./schema.sql
```

---

## 4. Cron Triggers (Scheduled Tasks)

Used for automated punch-in reminders (e.g. 15 minutes before shift start) and daily attendance summaries.

### Configuration (`wrangler.jsonc`)
```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "line-checkin-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "line-checkin-db",
      "database_id": "d331ccb9-3aa5-48bd-8803-5e074e38b1c2"
    }
  ],
  "triggers": {
    "crons": ["*/15 * * * *"]
  }
}
```

### Local Cron Testing
```bash
# Start local dev server with cron trigger testing enabled
npx wrangler dev --test-scheduled

# Trigger scheduled event manually in a separate shell:
# curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

---

## 5. Wrangler CLI Quick Reference

The project includes `run-wrangler.js` which automatically loads root `.env` before invoking Wrangler.

| Task | Command |
| :--- | :--- |
| **Deploy Worker** | `node run-wrangler.js deploy` |
| **Local Dev** | `node run-wrangler.js dev` |
| **Remote D1 Query** | `node run-wrangler.js d1 execute line-checkin-db --remote --command "<SQL>"` |
| **Remote D1 File Migration** | `node run-wrangler.js d1 execute line-checkin-db --remote --file=./<FILE>.sql` |
| **Live Logs (Tail)** | `node run-wrangler.js tail` |
| **Put Secret** | `node run-wrangler.js secret put <KEY_NAME>` |
| **Generate Env Types** | `node run-wrangler.js types` |
| **Revoke / Cancel Punches** | `node scripts/revoke-checkin.js <名稱/LINE_ID> [--date YYYY-MM-DD]` |

---

## 6. Windows Anti-Traps & Best Practices

1. **Relative Paths for SQL Files**: When executing `d1 execute --file`, always pass relative paths (e.g. `--file=./schema.sql`) rather than absolute paths with backslashes or spaces.
2. **Environment Variable Injection**: Never execute Wrangler bare without credentials; use `node run-wrangler.js` or verify `$env:CLOUDFLARE_API_TOKEN` is present in PowerShell.
3. **Never Log Secrets**: Keep LINE Channel Secret and Cloudflare API Token strictly masked.
4. **UTF-8 Formatting**: When manipulating D1 files or CSV exports, ensure UTF-8 BOM (`\uFEFF`) is used for Windows Excel compatibility.
