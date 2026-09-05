/**
 * Automated Test Suite: Dual Rich Menus & PBAC Dynamic Linking (v2.2.0)
 * 100% Native Edge API & LINE Messaging API Verification
 */

const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
const lines = fs.readFileSync(envPath, 'utf8').split('\n');
let lineToken = "";
for (const line of lines) {
  if (line.trim().startsWith('LINE_CHANNEL_ACCESS_TOKEN=')) {
    lineToken = line.trim().split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
}

const crypto = require('crypto');
const WORKER_URL = "https://line-checkin-worker.i14d142.workers.dev";
const TIMESTAMP = Date.now();
const TEST_TAX_ID = "24549210";
// Use real LINE User ID that has befriended the bot
const TEST_USER = "Ubd107bb3ba1b85a8086fc3b2250458e8";

const EMPLOYEE_MENU_ID = "richmenu-120970060b421fd2a35634007795916f";
const MANAGER_MENU_ID = "richmenu-26e2f94f69a7e091962de3f22e6b6361";

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function getUserLineMenu(userId) {
  const resp = await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(userId)}/richmenu`, {
    headers: { 'Authorization': `Bearer ${lineToken}` }
  });
  const text = await resp.text();
  if (resp.status === 404) return null; // Falls back to default menu
  try {
    const data = JSON.parse(text);
    return data.richMenuId;
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 Running Automated Test: Dual Rich Menus & PBAC Dynamic Linking (v2.2.0)");
  console.log("================================================================================\n");

  // Step 0: Ensure User is Unlinked (Reset to Default Menu)
  console.log("📋 [Setup] Resetting Test User Rich Menu in LINE...");
  await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(TEST_USER)}/richmenu`, {
    method: "DELETE",
    headers: { 'Authorization': `Bearer ${lineToken}` }
  });

  // Step 0: Provision Tenant API Key
  console.log("📋 [Setup] Provisioning Tenant API Key...");
  const keyResp = await fetch(`${WORKER_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tax_id: TEST_TAX_ID,
      name: `RichMenu 測試金鑰 (${TIMESTAMP})`,
      role: "ADMIN"
    })
  });
  const keyData = await keyResp.json();
  assert(keyData.success === true, "Tenant key created successfully");
  const tenantKey = keyData.apiKey;

  // Test 1: Verify LINE Default Rich Menu
  console.log("\n🧪 [Test 1] Verifying Default Rich Menu in LINE Messaging API...");
  const defResp = await fetch('https://api.line.me/v2/bot/user/all/richmenu', {
    headers: { 'Authorization': `Bearer ${lineToken}` }
  });
  assert(defResp.ok, "Default rich menu API returns 200");
  const defData = await defResp.json();
  assert(defData.richMenuId === EMPLOYEE_MENU_ID, `Default menu is Employee Menu (${EMPLOYEE_MENU_ID})`);

  // Test 2: Unconfigured User has no custom link (inherits Default Employee Menu)
  console.log("\n🧪 [Test 2] Verifying Unconfigured User inherits Default Menu...");
  const menu1 = await getUserLineMenu(TEST_USER);
  assert(menu1 === null, "User has no custom link (404 -> automatically receives default Employee Menu)");

  // Test 3: Update User to Manager Permissions -> Automatically Links to Manager Menu
  console.log("\n🧪 [Test 3] Granting Manager Permission (view_store) via Tenant API...");
  const setMgrResp = await fetch(`${WORKER_URL}/api/v1/tenant/employees/${encodeURIComponent(TEST_USER)}/permissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Key": tenantKey
    },
    body: JSON.stringify({
      companyId: `${TEST_TAX_ID}-01`,
      employeeName: "選單測試主管",
      permissions: ["punch", "apply", "view_store"]
    })
  });
  const setMgrData = await setMgrResp.json();
  assert(setMgrResp.ok, "Permissions update returns 200");
  assert(setMgrData.success === true, "Permissions update success is true");

  // Verify in LINE API
  const menu2 = await getUserLineMenu(TEST_USER);
  assert(menu2 === MANAGER_MENU_ID, `User is now actively linked to Manager Menu (${MANAGER_MENU_ID}) in LINE!`);

  // Test 4: Revoke Manager Permission -> Automatically Unlinks (Falls back to Default Employee Menu)
  console.log("\n🧪 [Test 4] Revoking Manager Permission (reverting to punch/apply only)...");
  const setEmpResp = await fetch(`${WORKER_URL}/api/v1/tenant/employees/${encodeURIComponent(TEST_USER)}/permissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Key": tenantKey
    },
    body: JSON.stringify({
      companyId: `${TEST_TAX_ID}-01`,
      employeeName: "選單測試員工",
      permissions: ["punch", "apply"]
    })
  });
  assert(setEmpResp.ok, "Permissions revert returns 200");

  // Verify in LINE API
  const menu3 = await getUserLineMenu(TEST_USER);
  assert(menu3 === null, "User custom link is deleted (falls back to default Employee Menu)");

  // Test 5: Batch Sync API (/api/v1/tenant/richmenu/sync)
  console.log("\n🧪 [Test 5] Testing Batch Sync API (POST /api/v1/tenant/richmenu/sync)...");
  const syncResp = await fetch(`${WORKER_URL}/api/v1/tenant/richmenu/sync`, {
    method: "POST",
    headers: { "X-Tenant-Key": tenantKey }
  });
  const syncData = await syncResp.json();
  assert(syncResp.ok, "Batch sync returns 200");
  assert(syncData.success === true, "Batch sync reports success");
  assert(typeof syncData.syncedCount === "number", `Synced count is a number (${syncData.syncedCount})`);

  console.log("\n================================================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} DUAL RICH MENU & PBAC TESTS PASSED 100%!`);
  console.log("================================================================================");
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
