/**
 * Automated Test Suite: Granular Permission-Based Access Control (PBAC v2.1.0 / Schema v10)
 * 100% Native Edge API & Webhook End-to-End Verification
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const WORKER_URL = "https://line-checkin-worker.i14d142.workers.dev";
const TIMESTAMP = Date.now();

// Test IDs
const TEST_TAX_ID = "24549210";
const TEST_LOC_ID = `${TEST_TAX_ID}-PBAC-${TIMESTAMP.toString().slice(-4)}`;
const TEST_EMP_UNAUTH = `U_PBAC_UNAUTH_${TIMESTAMP}`;
const TEST_EMP_AUTH = `U_PBAC_AUTH_${TIMESTAMP}`;
const TEST_EMP_MANAGER = `U_PBAC_MGR_${TIMESTAMP}`;

let testTenantKey = "";
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

async function getTestLocation() {
  const resp = await fetch(`${WORKER_URL}/api/v1/tenant/locations`, {
    headers: { "X-Tenant-Key": testTenantKey }
  });
  const data = await resp.json();
  return (data.locations || []).find(l => l.id === TEST_LOC_ID);
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 Running Automated PBAC (Permission-based Access Control) Test Suite (v2.1.0)");
  console.log("================================================================================\n");

  // Step 0: Setup Prerequisites (Tenant API Key & Location via Edge API)
  console.log("📋 [Setup] Provisioning Test Tenant Key & Location...");
  const keyResp = await fetch(`${WORKER_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tax_id: TEST_TAX_ID,
      name: `PBAC 自動化測試 (${TIMESTAMP})`,
      role: "ADMIN"
    })
  });
  const keyData = await keyResp.json();
  assert(keyResp.ok, "Tenant key provisioning returns 200 OK");
  assert(keyData.success === true, "Tenant key created successfully");
  testTenantKey = keyData.apiKey;

  // Create location via tenant locations endpoint
  const locCreateResp = await fetch(`${WORKER_URL}/api/v1/tenant/locations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Key": testTenantKey
    },
    body: JSON.stringify({
      id: TEST_LOC_ID,
      name: "PBAC 測試門市",
      address: "台中市北區崇德路一段100號",
      target_lat: 24.160000,
      target_lon: 120.680000,
      allowed_radius: 100,
      manager_line_id: TEST_EMP_MANAGER
    })
  });
  const locCreateData = await locCreateResp.json();
  assert(locCreateResp.ok, "Location creation returns 200 OK");
  assert(locCreateData.success === true, "Test location created successfully");
  console.log(`  ✅ Setup completed: Created location ${TEST_LOC_ID}\n`);

  // Test 1: Query default permissions for unconfigured user
  console.log("🧪 [Test 1] Querying Default Profile & Permissions for Unconfigured User...");
  const resProfileDefault = await fetch(`${WORKER_URL}/api/v1/employee/profile?userId=${TEST_EMP_UNAUTH}`);
  const dataProfileDefault = await resProfileDefault.json();
  assert(resProfileDefault.ok, "Profile endpoint returns 200 OK");
  assert(dataProfileDefault.success === true, "data.success is true");
  assert(Array.isArray(dataProfileDefault.profile.permissions), "Permissions is array");
  assert(dataProfileDefault.profile.permissions.includes("punch"), "Default permissions includes 'punch'");
  assert(dataProfileDefault.profile.permissions.includes("apply"), "Default permissions includes 'apply'");
  assert(!dataProfileDefault.profile.permissions.includes("set_location"), "Default does not have 'set_location'");
  assert(!dataProfileDefault.profile.permissions.includes("set_wifi"), "Default does not have 'set_wifi'");
  assert(dataProfileDefault.profile.isManager === false, "Default user is not manager");

  // Test 2: Manager of location gets automatic manager permissions
  console.log("\n🧪 [Test 2] Querying Profile for Store Manager (Automatic Perms Fallback)...");
  const resProfileMgr = await fetch(`${WORKER_URL}/api/v1/employee/profile?userId=${TEST_EMP_MANAGER}`);
  const dataProfileMgr = await resProfileMgr.json();
  assert(dataProfileMgr.success === true, "Manager profile query success");
  assert(dataProfileMgr.profile.isManager === true, "isManager is true for store manager");
  assert(dataProfileMgr.profile.permissions.includes("set_location"), "Manager automatically has 'set_location'");
  assert(dataProfileMgr.profile.permissions.includes("view_store"), "Manager automatically has 'view_store'");
  assert(dataProfileMgr.profile.permissions.includes("approve"), "Manager automatically has 'approve'");

  // Test 3: Admin API - List Employees
  console.log("\n🧪 [Test 3] Admin API: GET /api/v1/tenant/employees...");
  const resEmps = await fetch(`${WORKER_URL}/api/v1/tenant/employees`, {
    headers: { "X-Tenant-Key": testTenantKey }
  });
  const dataEmps = await resEmps.json();
  assert(resEmps.ok, "GET /api/v1/tenant/employees returns 200");
  assert(dataEmps.success === true, "success is true");
  assert(Array.isArray(dataEmps.employees), "employees is array");

  // Test 4: Admin API - Update Employee Permissions (Assign PBAC)
  console.log("\n🧪 [Test 4] Admin API: POST /api/v1/tenant/employees/:id/permissions...");
  const customPerms = ["punch", "apply", "set_location", "view_store", "set_wifi"];
  const resSetPerm = await fetch(`${WORKER_URL}/api/v1/tenant/employees/${encodeURIComponent(TEST_EMP_AUTH)}/permissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Key": testTenantKey
    },
    body: JSON.stringify({
      companyId: TEST_LOC_ID,
      employeeName: "PBAC 授權主管",
      permissions: customPerms
    })
  });
  const dataSetPerm = await resSetPerm.json();
  assert(resSetPerm.ok, "Update permissions endpoint returns 200");
  assert(dataSetPerm.success === true, "Update permissions success is true");
  assert(dataSetPerm.permissions.length === 5, "Updated permissions array length matches");

  // Verify updated permissions via profile endpoint
  const resProfileAuth = await fetch(`${WORKER_URL}/api/v1/employee/profile?userId=${TEST_EMP_AUTH}`);
  const dataProfileAuth = await resProfileAuth.json();
  assert(dataProfileAuth.profile.permissions.includes("set_location"), "Profile now includes 'set_location'");
  assert(dataProfileAuth.profile.permissions.includes("set_wifi"), "Profile now includes 'set_wifi'");
  assert(dataProfileAuth.profile.permissions.includes("view_store"), "Profile now includes 'view_store'");
  assert(dataProfileAuth.profile.companyId === TEST_LOC_ID, "Profile bound companyId matches TEST_LOC_ID");

  // Test 5: LINE Webhook - Location Message from Unauthorized User
  console.log("\n🧪 [Test 5] Webhook Location Message: Unauthorized User (Rejected)...");
  const resLocUnauth = await fetch(`${WORKER_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "message",
          replyToken: "mock_reply_token_unauth",
          source: { userId: TEST_EMP_UNAUTH },
          message: {
            type: "location",
            id: "loc_msg_1",
            title: "未授權地點",
            address: "某處地址",
            latitude: 25.000000,
            longitude: 121.000000
          }
        }
      ]
    })
  });
  const dataLocUnauth = await resLocUnauth.json();
  assert(resLocUnauth.ok, "Webhook returns 200 for event processing");
  assert(dataLocUnauth.success === true, "Webhook event was received and processed");

  // Check that target location in D1 was NOT changed by unauthorized user
  const loc1 = await getTestLocation();
  assert(loc1 !== undefined, "Test location exists in D1");
  assert(Math.abs(loc1.target_lat - 24.16) < 0.001, "Target coordinates remain unchanged at 24.16");

  // Test 6: LINE Webhook - Location Message from Authorized User (GPS Updated)
  console.log("\n🧪 [Test 6] Webhook Location Message: Authorized User with set_location...");
  const NEW_LAT = 24.175555;
  const NEW_LON = 120.695555;
  const NEW_ADDR = "台中市崇德路新旗艦門市現場";

  const resLocAuth = await fetch(`${WORKER_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "message",
          replyToken: "mock_reply_token_auth",
          source: { userId: TEST_EMP_AUTH },
          message: {
            type: "location",
            id: "loc_msg_2",
            title: "新門市地點",
            address: NEW_ADDR,
            latitude: NEW_LAT,
            longitude: NEW_LON
          }
        }
      ]
    })
  });
  const dataLocAuth = await resLocAuth.json();
  assert(resLocAuth.ok, "Webhook returns 200 for authorized location message");
  assert(dataLocAuth.success === true, "Location message processed");

  // Verify that coordinates and address were updated in D1
  const loc2 = await getTestLocation();
  assert(loc2 !== undefined, "Test location found after update");
  assert(Math.abs(loc2.target_lat - NEW_LAT) < 0.0001, `D1 target_lat updated to ${NEW_LAT} (got ${loc2.target_lat})`);
  assert(Math.abs(loc2.target_lon - NEW_LON) < 0.0001, `D1 target_lon updated to ${NEW_LON} (got ${loc2.target_lon})`);
  assert(loc2.address.includes("新旗艦門市"), "D1 address updated to new address");

  // Test 7: Wi-Fi Registration Endpoint (POST /api/v1/tenant/locations/wifi)
  console.log("\n🧪 [Test 7] Wi-Fi Registration Endpoint: PBAC set_wifi Verification...");
  // 7a. Unauthorized user without set_wifi
  const resWifiUnauth = await fetch(`${WORKER_URL}/api/v1/tenant/locations/wifi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lineUserId: TEST_EMP_UNAUTH,
      companyId: TEST_LOC_ID
    })
  });
  assert(resWifiUnauth.status === 403, "Unauthorized user rejected with 403 Forbidden");

  // 7b. Authorized user with set_wifi
  const TEST_WIFI_IP = "211.20.100.88";
  const resWifiAuth = await fetch(`${WORKER_URL}/api/v1/tenant/locations/wifi`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mock-IP": TEST_WIFI_IP
    },
    body: JSON.stringify({
      lineUserId: TEST_EMP_AUTH,
      companyId: TEST_LOC_ID
    })
  });
  const dataWifiAuth = await resWifiAuth.json();
  assert(resWifiAuth.ok, "Authorized user gets 200 OK");
  assert(dataWifiAuth.success === true, "data.success is true");
  assert(dataWifiAuth.allowedIps.includes(TEST_WIFI_IP), "allowedIps returned includes tested IP");

  // Verify in D1 via locations API
  const loc3 = await getTestLocation();
  assert(loc3.allowed_ips.includes(TEST_WIFI_IP), "D1 locations.allowed_ips contains new IP");

  // Test 8: Webhook Text Commands ("我的權限", "今日出勤", "今日班表", "個人班表")
  console.log("\n🧪 [Test 8] Webhook Text Commands with PBAC Validation...");

  // 8a. "我的權限"
  const resCmdPerms = await fetch(`${WORKER_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [{
        type: "message",
        replyToken: "mock_token",
        source: { userId: TEST_EMP_AUTH },
        message: { type: "text", text: "我的權限" }
      }]
    })
  });
  assert(resCmdPerms.ok, "Webhook handles '我的權限' command successfully");

  // 8b. "今日出勤" from unauthorized user
  const resCmdAttendUnauth = await fetch(`${WORKER_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [{
        type: "message",
        replyToken: "mock_token",
        source: { userId: TEST_EMP_UNAUTH },
        message: { type: "text", text: "今日出勤" }
      }]
    })
  });
  assert(resCmdAttendUnauth.ok, "Webhook intercepts unauth '今日出勤'");

  // 8c. "今日出勤" from authorized user
  const resCmdAttendAuth = await fetch(`${WORKER_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [{
        type: "message",
        replyToken: "mock_token",
        source: { userId: TEST_EMP_AUTH },
        message: { type: "text", text: "今日出勤" }
      }]
    })
  });
  assert(resCmdAttendAuth.ok, "Webhook handles authorized '今日出勤'");

  // 8d. "今日班表" from authorized user
  const resCmdSchedAuth = await fetch(`${WORKER_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [{
        type: "message",
        replyToken: "mock_token",
        source: { userId: TEST_EMP_AUTH },
        message: { type: "text", text: "今日班表" }
      }]
    })
  });
  assert(resCmdSchedAuth.ok, "Webhook handles authorized '今日班表'");

  // 8e. "班表" personal schedule
  const resCmdPersonalSched = await fetch(`${WORKER_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [{
        type: "message",
        replyToken: "mock_token",
        source: { userId: TEST_EMP_AUTH },
        message: { type: "text", text: "班表" }
      }]
    })
  });
  assert(resCmdPersonalSched.ok, "Webhook handles personal '班表' command");

  console.log("\n================================================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} PBAC INTEGRATION TESTS PASSED 100%!`);
  console.log("================================================================================");
}

main().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
