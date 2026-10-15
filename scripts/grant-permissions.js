/**
 * Script: Grant / Update Employee PBAC Permissions & Sync LINE Rich Menu
 *
 * Usage:
 *   node scripts/grant-permissions.js "豬毛" --all
 *   node scripts/grant-permissions.js Ubd107bb3ba1b85a8086fc3b2250458e8 --preset=boss
 *   node scripts/grant-permissions.js <lineUserId> --preset=manager
 *   node scripts/grant-permissions.js <lineUserId> --preset=hr
 *   node scripts/grant-permissions.js <lineUserId> --preset=employee
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

// Load current rich menu IDs
const richMenuIdsPath = path.resolve(__dirname, 'rich_menu_ids.json');
const loadedIds = fs.existsSync(richMenuIdsPath) ? JSON.parse(fs.readFileSync(richMenuIdsPath, 'utf8')) : {};
const EMPLOYEE_RICH_MENU_ID = loadedIds.EMPLOYEE_RICH_MENU_ID || "richmenu-0310e7f4244e16f2588e213ca46fed5e";
const MANAGER_RICH_MENU_ID = loadedIds.MANAGER_RICH_MENU_ID || "richmenu-37e110fb3f8093db1984d6fb85ddae04";

const MANAGEMENT_PERMISSIONS = [
  "view_store", "view_all", "approve", "set_location", "set_wifi", "device_audit", "export_payroll", "broadcast", "all", "admin"
];

const PRESETS = {
  employee: ["punch", "apply"],
  manager: ["punch", "apply", "approve", "view_store", "set_location", "set_wifi"],
  hr: ["punch", "apply", "view_all", "device_audit", "export_payroll"],
  boss: [
    "punch", "apply", "approve", "view_store", "view_all",
    "set_location", "set_wifi", "device_audit", "export_payroll", "broadcast", "admin"
  ]
};

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
  const args = process.argv.slice(2);
  let targetArg = args.find(a => !a.startsWith('--'));
  const isAll = args.includes('--all');
  const presetArg = args.find(a => a.startsWith('--preset='));
  let chosenPreset = presetArg ? presetArg.split('=')[1].toLowerCase() : (isAll ? 'boss' : 'boss');

  if (!targetArg || targetArg === "豬毛" || targetArg === "pigmao") {
    targetArg = "Ubd107bb3ba1b85a8086fc3b2250458e8";
  }

  console.log("================================================================================");
  console.log(`👑 PBAC PERMISSION DISPATCHER: Target [${targetArg}] Preset [${chosenPreset}]`);
  console.log("================================================================================");

  // 1. Locate employee record
  let employee = null;
  if (targetArg.startsWith('U') && targetArg.length > 20) {
    const res = await queryD1(`SELECT * FROM company_employees WHERE line_user_id = '${targetArg}' LIMIT 1`);
    employee = res[0];
  } else {
    const res = await queryD1(`SELECT * FROM company_employees WHERE employee_name LIKE '%${targetArg}%' LIMIT 1`);
    employee = res[0];
  }

  if (!employee) {
    console.error(`❌ 找不到符合條件之員工記錄: [${targetArg}]`);
    process.exit(1);
  }

  const userId = employee.line_user_id;
  const userName = employee.employee_name || targetArg;
  console.log(`\n1. 找到員工: ${userName} (LINE ID: ${userId}, 所屬據點: ${employee.company_id})`);

  // 2. Determine target permissions
  const targetPermissions = PRESETS[chosenPreset] || PRESETS.boss;
  const permsJson = JSON.stringify(targetPermissions);

  // 3. Update D1
  console.log(`\n2. 套用權限範本 [${chosenPreset}]:`, targetPermissions);
  await queryD1(`
    UPDATE company_employees
    SET permissions = '${permsJson}'
    WHERE line_user_id = '${userId}';
  `);
  console.log("   ✅ D1 permissions 欄位更新成功！");

  // 4. Verify D1 state
  const updated = await queryD1(`SELECT line_user_id, employee_name, permissions, company_id FROM company_employees WHERE line_user_id = '${userId}'`);
  console.log("   最新資料庫記錄:", updated[0]);

  // 5. Synchronize LINE Rich Menu
  const isManager = targetPermissions.some(p => MANAGEMENT_PERMISSIONS.includes(p));
  const targetMenuId = isManager ? MANAGER_RICH_MENU_ID : EMPLOYEE_RICH_MENU_ID;
  const menuLabel = isManager ? "主管圖文選單" : "一般員工打卡選單";

  if (lineToken) {
    console.log(`\n3. 同步綁定 LINE ${menuLabel} (${targetMenuId})...`);
    try {
      const linkUrl = `https://api.line.me/v2/bot/user/${userId}/richmenu/${targetMenuId}`;
      const linkRes = await fetch(linkUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${lineToken}` }
      });
      console.log(`   LINE API 狀態碼: HTTP ${linkRes.status}`);

      const checkUrl = `https://api.line.me/v2/bot/user/${userId}/richmenu`;
      const checkRes = await fetch(checkUrl, {
        headers: { 'Authorization': `Bearer ${lineToken}` }
      });
      const checkData = await checkRes.json();
      console.log(`   目前啟用選單 ID: ${checkData.richMenuId}`);
      if (checkData.richMenuId === targetMenuId) {
        console.log(`   ✅ ${menuLabel} 綁定成功！`);
      }
    } catch (err) {
      console.error("   ⚠️ LINE 圖文選單更新異常:", err.message);
    }
  } else {
    console.log("   ℹ️ 略過 LINE API 呼叫 (未設定 LINE_CHANNEL_ACCESS_TOKEN)");
  }

  console.log(`\n🎉 [${userName}] 權限與圖文選單已全數就緒！`);
}

main().catch(err => {
  console.error("❌ 執行失敗:", err);
  process.exit(1);
});
