/**
 * Script: Configure Fixed Weekday 09:00-17:00 Schedule for 豬毛
 * Target User: Ubd107bb3ba1b85a8086fc3b2250458e8 (豬毛)
 * Target Company: 24549210-01 (豬毛有限公司 - 台中美德總部)
 */

const path = require('path');
const fs = require('fs');

function loadEnv() {
  const possiblePaths = [
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

async function main() {
  console.log("================================================================================");
  console.log("⚙️  CONFIGURING FIXED WEEKDAY SCHEDULE (09:00 - 17:00) FOR 豬毛");
  console.log("================================================================================");

  const TARGET_USER_ID = "Ubd107bb3ba1b85a8086fc3b2250458e8";
  const TARGET_COMPANY_ID = "24549210-01";

  // 1. Inspect current employee record
  console.log("\n1. 查詢 豬毛 目前在 company_employees 之母檔設定...");
  const currentEmp = await queryD1(`SELECT * FROM company_employees WHERE line_user_id = '${TARGET_USER_ID}'`);
  console.log("   當前設定:", currentEmp[0] || "尚未建立");

  // 2. Update company_employees to FIXED, 09:00 - 17:00, break 60 mins
  console.log("\n2. 更新 company_employees 為固定常態班 (FIXED) 朝九晚五 (09:00 - 17:00)...");
  if (currentEmp.length > 0) {
    await queryD1(`
      UPDATE company_employees
      SET schedule_mode = 'FIXED',
          default_shift_start = '09:00',
          default_shift_end = '17:00',
          default_break_minutes = 60
      WHERE line_user_id = '${TARGET_USER_ID}';
    `);
  } else {
    await queryD1(`
      INSERT INTO company_employees (
        company_id, line_user_id, employee_name, permissions, schedule_mode,
        default_shift_start, default_shift_end, default_break_minutes
      ) VALUES (
        '${TARGET_COMPANY_ID}', '${TARGET_USER_ID}', '豬毛', '["punch","apply","admin"]',
        'FIXED', '09:00', '17:00', 60
      );
    `);
  }

  const updatedEmp = await queryD1(`SELECT line_user_id, employee_name, schedule_mode, default_shift_start, default_shift_end, default_break_minutes FROM company_employees WHERE line_user_id = '${TARGET_USER_ID}'`);
  console.log("   ✅ 已成功更新母檔:", updatedEmp[0]);

  // 3. Upsert 2026-09 whole month schedule into employee_schedules
  console.log("\n3. 寫入/更新 2026-09 月度班表 (平日 09:00~17:00 常態班，週末例假)...");
  const year = 2026;
  const month = 9; // September
  const daysInMonth = new Date(year, month, 0).getDate(); // 30 days

  const sqlStatements = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

    const shiftName = isWeekend ? "例假" : "常態班";
    const shiftStart = isWeekend ? "NULL" : "'09:00'";
    const shiftEnd = isWeekend ? "NULL" : "'17:00'";
    const breakMins = isWeekend ? 0 : 60;
    const isRest = isWeekend ? 1 : 0;

    sqlStatements.push(`
      INSERT INTO employee_schedules (
        company_id, line_user_id, work_date, shift_name, shift_start, shift_end,
        break_minutes, is_rest_day, is_cross_day, updated_at
      ) VALUES (
        '${TARGET_COMPANY_ID}', '${TARGET_USER_ID}', '${dStr}', '${shiftName}', ${shiftStart}, ${shiftEnd},
        ${breakMins}, ${isRest}, 0, datetime('now', '+8 hours')
      )
      ON CONFLICT(company_id, line_user_id, work_date) DO UPDATE SET
        shift_name = excluded.shift_name,
        shift_start = excluded.shift_start,
        shift_end = excluded.shift_end,
        break_minutes = excluded.break_minutes,
        is_rest_day = excluded.is_rest_day,
        is_cross_day = excluded.is_cross_day,
        updated_at = datetime('now', '+8 hours');
    `);
  }

  for (let i = 0; i < sqlStatements.length; i += 10) {
    const batchSql = sqlStatements.slice(i, i + 10).join('\n');
    await queryD1(batchSql);
  }

  console.log(`   ✅ 2026-09 月度排班共 ${daysInMonth} 天已全數寫入/校準完成。`);

  console.log("\n4. 抽樣檢驗排班表記錄...");
  const sampleWeekdays = await queryD1(`
    SELECT work_date, shift_name, shift_start, shift_end, is_rest_day 
    FROM employee_schedules 
    WHERE line_user_id = '${TARGET_USER_ID}' AND work_date IN ('2026-09-01', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07')
    ORDER BY work_date;
  `);
  console.log("   抽樣排班結果:", sampleWeekdays);

  console.log("\n================================================================================");
  console.log("🎉 豬毛 固定平日朝九晚五設定完成！");
  console.log("================================================================================");
}

main().catch(err => {
  console.error("執行失敗:", err);
  process.exit(1);
});
