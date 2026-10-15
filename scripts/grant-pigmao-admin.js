/**
 * Script: Grant All Manager & Admin Permissions to 豬毛
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
const cfToken = env.CLOUDFLARE_API_TOKEN;
const lineToken = env.LINE_CHANNEL_ACCESS_TOKEN;

if (!cfToken) {
  console.error("❌ 錯誤：找不到 CLOUDFLARE_API_TOKEN，請確認專案根目錄之 .env 已配置。");
  process.exit(1);
}

async function queryD1(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfToken}`,
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
  console.log("👑 GRANT ALL MANAGER & PBAC PERMISSIONS TO 豬毛");
  console.log("================================================================================");

  const TARGET_USER_ID = "Ubd107bb3ba1b85a8086fc3b2250458e8";
  const TARGET_COMPANY_ID = "24549210-01";
  const STORE_MANAGER_ID = "U4eb5f204f746d1ab2b360e687eb99105"; // 珈妤 (門市店長與審批主管)
  const MANAGER_RICH_MENU_ID = "richmenu-37e110fb3f8093db1984d6fb85ddae04";

  const ALL_MANAGER_PERMS = [
    "punch",
    "apply",
    "approve",
    "view_store",
    "view_all",
    "set_location",
    "set_wifi",
    "device_audit",
    "export_payroll",
    "broadcast",
    "admin"
  ];
  const permsJson = JSON.stringify(ALL_MANAGER_PERMS);

  // 1. Inspect current status
  console.log("\n1. 查詢 豬毛 目前在 company_employees 與 locations 之狀態...");
  const employees = await queryD1(`SELECT * FROM company_employees WHERE line_user_id = '${TARGET_USER_ID}'`);
  console.log("   當前員工記錄:", employees[0] || "查無記錄");

  // 2. Update or Insert company_employees
  console.log("\n2. 更新 company_employees 權限配置為所有主管與管理員權限...");
  if (employees.length > 0) {
    await queryD1(`
      UPDATE company_employees
      SET permissions = '${permsJson}',
          employee_name = '豬毛'
      WHERE line_user_id = '${TARGET_USER_ID}';
    `);
    console.log("   ✅ 已成功更新 豬毛 的 permissions 欄位為全套 10 項原子權限 + admin 特權");
  } else {
    await queryD1(`
      INSERT INTO company_employees (
        company_id, line_user_id, employee_name, permissions, schedule_mode,
        default_shift_start, default_shift_end, default_break_minutes, approver_line_id
      ) VALUES (
        '${TARGET_COMPANY_ID}', '${TARGET_USER_ID}', '豬毛', '${permsJson}',
        'FIXED', '09:00', '17:00', 60, '${STORE_MANAGER_ID}'
      );
    `);
    console.log("   ✅ 已成功建立 豬毛 之員工資料並配置所有主管權限");
  }

  // 3. Ensure headquarters location manager_line_id is set to 珈妤
  console.log("\n3. 確認總部據點 (24549210-01) 店長設定 (保留 珈妤 為店長兼簽核兜底主管)...");
  await queryD1(`
    UPDATE locations
    SET manager_line_id = '${STORE_MANAGER_ID}'
    WHERE id = '${TARGET_COMPANY_ID}';
  `);
  console.log(`   ✅ 總部門市 (24549210-01) 店長確認為 珈妤 (${STORE_MANAGER_ID})`);

  // 4. Verification from D1
  console.log("\n4. 再次驗證 D1 最新狀態...");
  const verifiedEmp = await queryD1(`SELECT line_user_id, employee_name, permissions, company_id FROM company_employees WHERE line_user_id = '${TARGET_USER_ID}'`);
  console.log("   驗證員工資料:", verifiedEmp[0]);

  const verifiedLoc = await queryD1(`SELECT id, name, manager_line_id FROM locations WHERE id = '${TARGET_COMPANY_ID}'`);
  console.log("   驗證據點資料:", verifiedLoc[0]);

  // 5. Link LINE Manager Rich Menu
  if (lineToken) {
    console.log("\n5. 同步綁定 LINE 主管圖文選單 (Manager Rich Menu)...");
    try {
      const linkUrl = `https://api.line.me/v2/bot/user/${TARGET_USER_ID}/richmenu/${MANAGER_RICH_MENU_ID}`;
      const linkRes = await fetch(linkUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${lineToken}` }
      });
      console.log(`   LINE API 綁定結果: HTTP ${linkRes.status} ${await linkRes.text()}`);

      const checkUrl = `https://api.line.me/v2/bot/user/${TARGET_USER_ID}/richmenu`;
      const checkRes = await fetch(checkUrl, {
        headers: { 'Authorization': `Bearer ${lineToken}` }
      });
      const checkData = await checkRes.json();
      console.log("   當前綁定圖文選單 ID:", checkData.richMenuId);
      if (checkData.richMenuId === MANAGER_RICH_MENU_ID) {
        console.log("   ✅ LINE 主管圖文選單綁定成功！");
      }
    } catch (err) {
      console.error("   ⚠️ LINE 圖文選單同步時發生錯誤:", err.message);
    }
  } else {
    console.log("   ⚠️ 缺少 LINE_CHANNEL_ACCESS_TOKEN，跳過 LINE 圖文選單連線");
  }

  console.log("\n🎉 豬毛 所有主管權限與主管選單配置已全數生效！");
}

main().catch(err => {
  console.error("❌ 執行失敗:", err);
  process.exit(1);
});
