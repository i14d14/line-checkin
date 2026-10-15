const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Resolve credentials
let token = "";
let liffId = "2011328810-vjUUBSYA";

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('LINE_CHANNEL_ACCESS_TOKEN=')) {
      token = line.trim().split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
    if (line.trim().startsWith('LIFF_ID=')) {
      liffId = line.trim().split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
  }
}

if (!token) {
  const wranglerPath = path.resolve(__dirname, '../wrangler.jsonc');
  if (fs.existsSync(wranglerPath)) {
    const content = fs.readFileSync(wranglerPath, 'utf8');
    const match = content.match(/"LINE_CHANNEL_ACCESS_TOKEN":\s*"([^"]+)"/);
    if (match) token = match[1];
    const liffMatch = content.match(/"LIFF_ID":\s*"([^"]+)"/);
    if (liffMatch) liffId = liffMatch[1];
  }
}

if (!token) {
  console.error("Error: LINE_CHANNEL_ACCESS_TOKEN not found.");
  process.exit(1);
}

// 2. Load previous IDs for cleanup
const idsPath = path.join(__dirname, 'rich_menu_ids.json');
let previousIds = {};
if (fs.existsSync(idsPath)) {
  try {
    previousIds = JSON.parse(fs.readFileSync(idsPath, 'utf8'));
  } catch (e) {}
}

async function createRichMenu(definition) {
  const resp = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(definition)
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Create rich menu failed: ${JSON.stringify(data)}`);
  return data.richMenuId;
}

async function uploadRichMenuImage(richMenuId, imagePath) {
  const buffer = fs.readFileSync(imagePath);
  const resp = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'image/png'
    },
    body: buffer
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Upload image failed for ${richMenuId}: ${text}`);
  }
  console.log(`  Uploaded image to ${richMenuId} (${buffer.length} bytes)`);
}

async function setDefaultRichMenu(richMenuId) {
  const resp = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Set default rich menu failed: ${text}`);
  }
  console.log(`  Set ${richMenuId} as DEFAULT rich menu for all users`);
}

async function deleteRichMenu(richMenuId) {
  if (!richMenuId) return;
  try {
    const resp = await fetch(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`  Cleaned up old rich menu ${richMenuId}: status ${resp.status}`);
  } catch (err) {
    console.error(`  Failed to delete ${richMenuId}:`, err.message);
  }
}

async function bulkLinkUsers(richMenuId, userIds) {
  if (!userIds || userIds.length === 0) return;
  for (let i = 0; i < userIds.length; i += 500) {
    const chunk = userIds.slice(i, i + 500);
    const resp = await fetch('https://api.line.me/v2/bot/richmenu/bulk/link', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        richMenuId,
        userIds: chunk
      })
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.warn(`  Bulk link warning (${chunk.length} users): ${err}`);
    } else {
      console.log(`  Successfully bulk-linked ${chunk.length} users to ${richMenuId}`);
    }
  }
}

async function queryD1Employees() {
  try {
    const sql = "SELECT ce.line_user_id, ce.employee_name, ce.permissions, l.manager_line_id FROM company_employees ce LEFT JOIN locations l ON ce.company_id = l.id;";
    const projectRoot = path.resolve(__dirname, '..');
    const tmpSql = path.join(projectRoot, 'temp_query_employees.sql');
    fs.writeFileSync(tmpSql, sql, 'utf8');

    const output = execSync(`node ${path.join(projectRoot, 'run-wrangler.js')} d1 execute line-checkin-db --remote --file=${tmpSql} --json`, {
      encoding: 'utf8',
      cwd: projectRoot
    });
    if (fs.existsSync(tmpSql)) fs.unlinkSync(tmpSql);

    const jsonStart = output.indexOf('[');
    const jsonEnd = output.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) return [];

    const data = JSON.parse(output.slice(jsonStart, jsonEnd + 1));
    return data[0]?.results || [];
  } catch (e) {
    console.warn("  Could not query D1 for employees:", e.message);
    return [];
  }
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 Setting up Modern Triple Rich Menus (Onboarding, Employee, Manager)");
  console.log("================================================================================\n");

  // 1. Onboarding Menu (Default for new users/unbound visitors)
  console.log("1. Creating Onboarding Menu (2500x843)...");
  const onboardingDef = {
    size: { width: 2500, height: 843 },
    selected: true,
    name: "豬毛有限公司 - 新人預設選單",
    chatBarText: "新進同仁服務",
    areas: [
      {
        bounds: { x: 0, y: 0, width: 2500, height: 843 },
        action: {
          type: "uri",
          label: "新進同仁入職登記",
          uri: `https://liff.line.me/${liffId}?tab=onboarding`
        }
      }
    ]
  };
  const onboardingId = await createRichMenu(onboardingDef);
  console.log(`  Created Onboarding Menu ID: ${onboardingId}`);
  await uploadRichMenuImage(onboardingId, path.join(__dirname, 'richmenu_onboarding.png'));
  await setDefaultRichMenu(onboardingId);

  // 2. Employee Menu (1 Row, 3 Columns)
  console.log("\n2. Creating Employee Menu (2500x843)...");
  const employeeDef = {
    size: { width: 2500, height: 843 },
    selected: true,
    name: "豬毛有限公司 - 員工選單",
    chatBarText: "打卡與服務選單",
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: {
          type: "uri",
          label: "考勤打卡",
          uri: `https://liff.line.me/${liffId}?tab=punch`
        }
      },
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: {
          type: "uri",
          label: "排班月曆",
          uri: `https://liff.line.me/${liffId}?tab=calendar`
        }
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: {
          type: "uri",
          label: "線上簽核",
          uri: `https://liff.line.me/${liffId}?tab=approvals`
        }
      }
    ]
  };
  const employeeId = await createRichMenu(employeeDef);
  console.log(`  Created Employee Menu ID: ${employeeId}`);
  await uploadRichMenuImage(employeeId, path.join(__dirname, 'richmenu_employee.png'));

  // 3. Manager Superset Menu (2 Rows: 3 personal items + 1 wide manager workbench)
  console.log("\n3. Creating Manager Superset Menu (2500x1686)...");
  const managerDef = {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "豬毛有限公司 - 主管超集選單",
    chatBarText: "門市管理與考勤",
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: {
          type: "uri",
          label: "考勤打卡",
          uri: `https://liff.line.me/${liffId}?tab=punch`
        }
      },
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: {
          type: "uri",
          label: "排班月曆",
          uri: `https://liff.line.me/${liffId}?tab=calendar`
        }
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: {
          type: "uri",
          label: "線上簽核",
          uri: `https://liff.line.me/${liffId}?tab=approvals`
        }
      },
      {
        bounds: { x: 0, y: 843, width: 2500, height: 843 },
        action: {
          type: "uri",
          label: "門市管理工作台",
          uri: `https://liff.line.me/${liffId}?tab=admin`
        }
      }
    ]
  };
  const managerId = await createRichMenu(managerDef);
  console.log(`  Created Manager Menu ID: ${managerId}`);
  await uploadRichMenuImage(managerId, path.join(__dirname, 'richmenu_manager.png'));

  // 4. [CRITICAL] Reassign existing active employees & managers BEFORE deleting old menus
  console.log("\n4. Performing Zero-Downtime User Reassignment...");
  const employees = await queryD1Employees();
  const employeeUserIds = [];
  const managerUserIds = [];

  for (const emp of employees) {
    if (!emp.line_user_id) continue;
    let perms = ["punch", "apply"];
    if (emp.permissions) {
      try {
        const parsed = JSON.parse(emp.permissions);
        if (Array.isArray(parsed)) perms = parsed;
      } catch (e) {}
    }
    const isMgr = emp.manager_line_id === emp.line_user_id;
    if (isMgr || perms.includes("view_store") || perms.includes("admin") || perms.includes("all")) {
      managerUserIds.push(emp.line_user_id);
    } else {
      employeeUserIds.push(emp.line_user_id);
    }
  }

  console.log(`  Found ${employeeUserIds.length} regular employees, ${managerUserIds.length} managers.`);
  if (employeeUserIds.length > 0) {
    await bulkLinkUsers(employeeId, employeeUserIds);
  }
  if (managerUserIds.length > 0) {
    await bulkLinkUsers(managerId, managerUserIds);
  }

  // 5. Clean up old menus if they differ
  console.log("\n5. Cleaning up previous rich menus...");
  if (previousIds.ONBOARDING_RICH_MENU_ID && previousIds.ONBOARDING_RICH_MENU_ID !== onboardingId) {
    await deleteRichMenu(previousIds.ONBOARDING_RICH_MENU_ID);
  }
  if (previousIds.EMPLOYEE_RICH_MENU_ID && previousIds.EMPLOYEE_RICH_MENU_ID !== employeeId) {
    await deleteRichMenu(previousIds.EMPLOYEE_RICH_MENU_ID);
  }
  if (previousIds.MANAGER_RICH_MENU_ID && previousIds.MANAGER_RICH_MENU_ID !== managerId) {
    await deleteRichMenu(previousIds.MANAGER_RICH_MENU_ID);
  }

  // 6. Persist new IDs
  const newConfig = {
    ONBOARDING_RICH_MENU_ID: onboardingId,
    EMPLOYEE_RICH_MENU_ID: employeeId,
    MANAGER_RICH_MENU_ID: managerId,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(idsPath, JSON.stringify(newConfig, null, 2), 'utf8');

  console.log("\n================================================================================");
  console.log("✅ All Three Rich Menus Published Successfully!");
  console.log(`ONBOARDING_RICH_MENU_ID: ${onboardingId} (DEFAULT)`);
  console.log(`EMPLOYEE_RICH_MENU_ID:   ${employeeId}`);
  console.log(`MANAGER_RICH_MENU_ID:    ${managerId}`);
  console.log("================================================================================");
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
