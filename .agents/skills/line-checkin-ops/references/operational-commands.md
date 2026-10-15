# Operational Commands & Scripts Reference

This document provides a consolidated cheat sheet for running operations in the LINE Check-in project.

---

## 1. Rich Menu Management

### Render Images
Generates 2500px high-resolution PNGs from HTML/CSS templates in `scripts/templates/`:
```powershell
npm run render:menus
```

### Full Provisioning & Migration
Runs automated creation, upload, default setup, employee reassignment, and old menu deletion:
```powershell
npm run setup:menus
```

### Inspect Specific User Menu in LINE
```powershell
node -e "
const fs = require('fs');
const token = fs.readFileSync('.env', 'utf8').match(/LINE_CHANNEL_ACCESS_TOKEN=([^\r\n]+)/)[1].trim();
fetch('https://api.line.me/v2/bot/user/U4eb5f204f746d1ab2b360e687eb99105/richmenu', {
  headers: { Authorization: 'Bearer ' + token }
}).then(r => r.json()).then(console.log);
"
```

---

## 2. Check-in Revocation CLI (`scripts/revoke-checkin.js`)

Used to cancel accidental punches or reset test states:

| Command | Action |
|---|---|
| `node scripts/revoke-checkin.js --list` | Preview all check-in records for today. |
| `node scripts/revoke-checkin.js "豬毛" --list` | Preview today's records for employee 豬毛. |
| `node scripts/revoke-checkin.js "豬毛" --latest` | Soft-cancel latest session (`status = 'CANCELLED'`). |
| `node scripts/revoke-checkin.js "豬毛" --date 2026-09-08` | Soft-cancel records for a specific past date. |
| `node scripts/revoke-checkin.js --id 682` | Soft-cancel record ID 682. |
| `node scripts/revoke-checkin.js "豬毛" --latest --delete` | Hard delete latest record from D1. |

---

## 3. Database Operations (Cloudflare D1)

### Safe Query Execution via File
Avoid PowerShell double-quote expansion errors by writing SQL to a temporary `.sql` file:
```powershell
Set-Content -Path "scratch_query.sql" -Value "SELECT * FROM company_employees;" -Encoding utf8
node run-wrangler.js d1 execute line-checkin-db --remote --file=scratch_query.sql --json
Remove-Item -LiteralPath "scratch_query.sql"
```

### Database Backup / Export
```powershell
node run-wrangler.js d1 export line-checkin-db --remote --output=backup.sql
```

---

## 4. Verification & Deployment Pipeline

Before closing any operational issue:
```powershell
# 1. Typecheck and dependency cruiser architectural check
npm run check

# 2. Automated test suite
npm run test:flex
node test_rich_menu_sync.js

# 3. Publish edge worker
npm run deploy
```
