const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../../.env');
const lines = fs.readFileSync(envPath, 'utf8').split('\n');
let token = "";
let liffId = "2011328810-vjUUBSYA";
for (const line of lines) {
  if (line.trim().startsWith('LINE_CHANNEL_ACCESS_TOKEN=')) {
    token = line.trim().split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
  if (line.trim().startsWith('LIFF_ID=')) {
    liffId = line.trim().split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
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
  console.log(`Uploaded image to ${richMenuId}`);
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
  console.log(`Set ${richMenuId} as DEFAULT rich menu`);
}

async function deleteRichMenu(richMenuId) {
  try {
    const resp = await fetch(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`Deleted rich menu ${richMenuId}: status ${resp.status}`);
  } catch (err) {
    console.error(`Failed to delete ${richMenuId}:`, err.message);
  }
}

async function main() {
  console.log("=== Setting up Dual Rich Menus (Employee & Manager) with New Typography ===");

  // 1. Employee Menu Definition (2-4 Chinese characters per CTA)
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

  // 2. Manager Menu Definition (2 rows: Row 1 = 3 personal items, Row 2 = 1*3 wide workbench)
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

  // Check existing Employee Menu
  let empMenuId = "richmenu-120970060b421fd2a35634007795916f";
  try {
    const checkResp = await fetch(`https://api.line.me/v2/bot/richmenu/${empMenuId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (checkResp.ok) {
      console.log(`Reusing existing Employee Menu: ${empMenuId}`);
    } else {
      console.log("\n1. Creating Employee Rich Menu...");
      empMenuId = await createRichMenu(employeeDef);
      console.log(`Created Employee Menu ID: ${empMenuId}`);
      await uploadRichMenuImage(empMenuId, path.join(__dirname, "richmenu_employee.png"));
      await setDefaultRichMenu(empMenuId);
    }
  } catch (e) {
    console.log("Creating new Employee Menu due to check error:", e.message);
    empMenuId = await createRichMenu(employeeDef);
    await uploadRichMenuImage(empMenuId, path.join(__dirname, "richmenu_employee.png"));
    await setDefaultRichMenu(empMenuId);
  }

  // Create & Upload Manager Menu (2500x1686)
  console.log("\n2. Creating New 2-Row Manager Superset Rich Menu...");
  const mgrMenuId = await createRichMenu(managerDef);
  console.log(`Created Manager Superset Menu ID: ${mgrMenuId}`);
  await uploadRichMenuImage(mgrMenuId, path.join(__dirname, "richmenu_manager.png"));

  // Delete previous manager menu to avoid orphans
  const oldMgrMenuId = "richmenu-9a8451b67473b2b0eb9f7e8c1b613e92";
  await deleteRichMenu(oldMgrMenuId);

  console.log("\n=== Dual Menus Setup Complete! ===");
  console.log(`EMPLOYEE_RICH_MENU_ID=${empMenuId}`);
  console.log(`MANAGER_RICH_MENU_ID=${mgrMenuId}`);

  // Write IDs to config json
  const config = {
    EMPLOYEE_RICH_MENU_ID: empMenuId,
    MANAGER_RICH_MENU_ID: mgrMenuId,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(__dirname, "rich_menu_ids.json"), JSON.stringify(config, null, 2), 'utf8');
}

main().catch(console.error);
