#!/usr/bin/env node
/**
 * LINE Check-in System - Check-in Record Revocation CLI Tool
 * 
 * Usage:
 *   node scripts/revoke-checkin.js [target] [options]
 * 
 * Options:
 *   --date <YYYY-MM-DD>  Target date (default: today in Taiwan UTC+8)
 *   --all                Apply to all dates for this user
 *   --delete             Hard delete rows (default: soft-cancel status='CANCELLED')
 *   --list               Preview matching records without making changes
 *   -h, --help           Show this help message
 * 
 * Examples:
 *   node scripts/revoke-checkin.js 豬毛
 *   node scripts/revoke-checkin.js 豬毛 --date 2026-09-05
 *   node scripts/revoke-checkin.js Ubd107bb3ba1b85a8086fc3b2250458e8
 *   node scripts/revoke-checkin.js 豬毛 --delete
 *   node scripts/revoke-checkin.js --list
 */

const fs = require('fs');
const path = require('path');

// 1. Locate and parse .env
function loadEnv() {
  const possiblePaths = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(process.cwd(), '.env')
  ];

  const env = {};
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          env[key] = val;
        }
      }
      break;
    }
  }
  return env;
}

const env = loadEnv();
const accountId = env.CLOUDFLARE_ACCOUNT_ID || '855d7f93966abed2712c15f619ea6721';
const dbId = env.CLOUDFLARE_D1_DATABASE_ID || 'd331ccb9-3aa5-48bd-8803-5e074e38b1c2';
const token = env.CLOUDFLARE_API_TOKEN;

if (!token) {
  console.error("❌ 錯誤：找不到 CLOUDFLARE_API_TOKEN，請確認專案根目錄之 .env 已配置。");
  process.exit(1);
}

// 2. Direct Cloudflare D1 Query Helper
async function queryD1(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql })
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(`D1 Query Error: ${JSON.stringify(data.errors || data)}`);
  }
  return data.result[0]?.results || [];
}

// 3. Helper: Taiwan Date (UTC+8)
function getTodayTaiwan() {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 3600 * 1000);
  return tw.toISOString().slice(0, 10);
}

// 4. Name fuzzy matching (handles 豬 <-> 🐖, case-insensitive)
function normalizeName(str) {
  if (!str) return '';
  return str.replace(/🐖/g, '豬').replace(/猪/g, '豬').toLowerCase();
}

// 5. Main CLI handler
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(`
📋 【考勤紀錄撤銷工具 (Revoke Check-in CLI)】
────────────────────────────────────────────────────
指令用法：
  node scripts/revoke-checkin.js <姓名或LINE_ID> [選項]

選項說明：
  --date <YYYY-MM-DD>  指定目標日期（預設為今日台灣時間: ${getTodayTaiwan()}）
  --all                撤銷該用戶所有日期的紀錄
  --delete             完全物理刪除紀錄（預設為安全標記 CANCELLED）
  --list               僅查詢列出目標打卡紀錄，不執行變更
  -h, --help           顯示此說明

常見範例：
  node scripts/revoke-checkin.js 豬毛
  node scripts/revoke-checkin.js 豬毛 --date ${getTodayTaiwan()}
  node scripts/revoke-checkin.js Ubd107bb3ba1b85a8086fc3b2250458e8
  node scripts/revoke-checkin.js 豬毛 --delete
  node scripts/revoke-checkin.js --list
────────────────────────────────────────────────────`);
    return;
  }

  let targetArg = null;
  let targetDate = getTodayTaiwan();
  let isAllDates = false;
  let isHardDelete = false;
  let isListOnly = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--all') {
      isAllDates = true;
    } else if (a === '--delete') {
      isHardDelete = true;
    } else if (a === '--list') {
      isListOnly = true;
    } else if (a === '--date') {
      targetDate = args[++i];
    } else if (!a.startsWith('-')) {
      targetArg = a;
    }
  }

  // If no target provided and --list flag is present, list today's records
  if (!targetArg && isListOnly) {
    console.log(`🔍 查詢今日 (${targetDate}) 全員打卡紀錄...`);
    const allToday = await queryD1(`SELECT id, line_user_id, display_name, status, punch_type, created_at, verify_mode FROM checkin_records WHERE date(created_at) = '${targetDate}' ORDER BY id DESC;`);
    if (allToday.length === 0) {
      console.log(`ℹ️ 今日 (${targetDate}) 目前無任何打卡紀錄。`);
      return;
    }
    console.table(allToday);
    return;
  }

  if (!targetArg) {
    console.error("❌ 請指定要撤銷的員工姓名或 LINE User ID（例如：node scripts/revoke-checkin.js 豬毛）");
    process.exit(1);
  }

  console.log(`🔍 正在檢索用戶「${targetArg}」...`);

  let targetUserId = null;
  let targetDisplayName = targetArg;

  if (targetArg.startsWith('U') && targetArg.length >= 25) {
    targetUserId = targetArg;
  } else {
    // Find matching users across database
    const users = await queryD1(`
      SELECT DISTINCT line_user_id, display_name FROM checkin_records WHERE line_user_id IS NOT NULL
      UNION
      SELECT line_user_id, employee_name AS display_name FROM company_employees WHERE line_user_id IS NOT NULL
    `);

    const normalizedTarget = normalizeName(targetArg);
    const matches = users.filter(u => {
      const n = normalizeName(u.display_name);
      return n.includes(normalizedTarget) || normalizedTarget.includes(n);
    });

    if (matches.length === 0) {
      console.error(`❌ 找不到符合「${targetArg}」的使用者紀錄。`);
      process.exit(1);
    } else if (matches.length === 1) {
      targetUserId = matches[0].line_user_id;
      targetDisplayName = matches[0].display_name;
    } else {
      // If multiple match, check which one has records on targetDate
      let activeMatches = [];
      for (const m of matches) {
        const cnt = await queryD1(`SELECT COUNT(*) as c FROM checkin_records WHERE line_user_id = '${m.line_user_id}' ${isAllDates ? '' : `AND date(created_at) = '${targetDate}'`};`);
        if (cnt[0]?.c > 0) activeMatches.push({ ...m, count: cnt[0].c });
      }

      if (activeMatches.length === 1) {
        targetUserId = activeMatches[0].line_user_id;
        targetDisplayName = activeMatches[0].display_name;
      } else if (activeMatches.length > 1) {
        console.log(`⚠️ 找到多位符合的使用者，自動定位至最近活躍帳號：`);
        activeMatches.forEach(m => console.log(`  • [${m.display_name}] (LINE ID: ${m.line_user_id}) - ${m.count} 筆紀錄`));
        targetUserId = activeMatches[0].line_user_id;
        targetDisplayName = activeMatches[0].display_name;
      } else {
        // Default to first match
        targetUserId = matches[0].line_user_id;
        targetDisplayName = matches[0].display_name;
      }
    }
  }

  console.log(`👤 目標員工：【${targetDisplayName}】(LINE ID: ${targetUserId})`);
  console.log(`📅 目標範圍：${isAllDates ? '全部歷史紀錄' : `日期 ${targetDate}`}`);

  // Query records
  const dateClause = isAllDates ? '' : `AND date(created_at) = '${targetDate}'`;
  const records = await queryD1(`
    SELECT id, punch_type, status, created_at, distance_meters, verify_mode
    FROM checkin_records
    WHERE line_user_id = '${targetUserId}' ${dateClause}
    ORDER BY id ASC;
  `);

  if (records.length === 0) {
    console.log(`ℹ️ 查無符合條件的打卡紀錄，無須處理。`);
    return;
  }

  console.log(`\n📋 找到 ${records.length} 筆打卡紀錄：`);
  console.table(records.map(r => ({
    'ID': r.id,
    '類型': r.punch_type === 'IN' ? '🟢 上班' : '🔴 下班',
    '狀態': r.status,
    '驗證模式': r.verify_mode,
    '時間': r.created_at
  })));

  if (isListOnly) {
    console.log(`ℹ️ [--list] 預覽模式完成，未修改任何資料。`);
    return;
  }

  // Execute Revoke / Delete
  if (isHardDelete) {
    console.log(`\n⚠️ 正在執行【物理刪除 (DELETE)】...`);
    await queryD1(`
      DELETE FROM checkin_records
      WHERE line_user_id = '${targetUserId}' ${dateClause};
    `);
    console.log(`✅ 已成功刪除 ${records.length} 筆打卡紀錄。`);
  } else {
    console.log(`\n🔄 正在執行【安全撤銷 (SET status = 'CANCELLED')】...`);
    await queryD1(`
      UPDATE checkin_records
      SET status = 'CANCELLED'
      WHERE line_user_id = '${targetUserId}' ${dateClause};
    `);
    console.log(`✅ 已成功將 ${records.length} 筆打卡紀錄標記為 CANCELLED（已撤銷）。`);
  }

  // Write audit log
  try {
    const actionName = isHardDelete ? 'CLI_DELETE_CHECKIN' : 'CLI_REVOKE_CHECKIN';
    const auditSql = `
      INSERT INTO device_audit_logs (
        line_user_id, display_name, action, old_device_id, new_device_id,
        ip_address, user_agent, warning_level, created_at
      ) VALUES (
        '${targetUserId}',
        '${targetDisplayName.replace(/'/g, "''")}',
        '${actionName}',
        NULL, NULL, '127.0.0.1', 'scripts/revoke-checkin.js', 'INFO',
        datetime('now', '+8 hours')
      );
    `;
    await queryD1(auditSql);
    console.log(`📝 已寫入操作稽核日誌 (device_audit_logs)。`);
  } catch (err) {
    console.warn(`⚠️ 稽核寫入略過：${err.message}`);
  }

  // State machine status inspection
  const nextPunchCheck = await queryD1(`
    SELECT id, punch_type, created_at,
           (julianday('now', '+8 hours') - julianday(created_at)) * 24 AS delta_hours
    FROM checkin_records
    WHERE line_user_id = '${targetUserId}' AND status = 'SUCCESS'
    ORDER BY id DESC LIMIT 1;
  `);

  console.log(`\n🔄 【狀態機推論重置檢驗】`);
  if (nextPunchCheck.length === 0) {
    console.log(`  • 目前有效紀錄：無歷史有效打卡`);
    console.log(`  • 下次打卡推論：🟢 【上班 (IN)】（全新狀態，無 30 分鐘防呆鎖定）`);
  } else {
    const last = nextPunchCheck[0];
    const deltaHours = last.delta_hours != null ? Math.max(0, last.delta_hours) : 999;
    const nextType = (deltaHours > 18 || last.punch_type === 'OUT') ? '🟢 上班 (IN)' : '🔴 下班 (OUT)';
    console.log(`  • 前次有效打卡：ID ${last.id}（${last.punch_type}，時間：${last.created_at}，相隔 ${deltaHours.toFixed(1)} 小時）`);
    console.log(`  • 下次打卡推論：${nextType}（30 分鐘限制：${deltaHours * 60 < 30 ? '⚠️ 鎖定中' : '✅ 已解除'}）`);
  }

  console.log(`\n✨ 全部處理完畢！`);
}

main().catch(err => {
  console.error("❌ 執行失敗：", err);
  process.exit(1);
});
