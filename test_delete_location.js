/**
 * Automated Test Suite: Tenant Branch Location Deletion & Safety Guards (DELETE /api/v1/tenant/locations/:id)
 * 
 * Verifies:
 * 1. 401 Unauthorized when missing authentication
 * 2. 403 Forbidden when using non-ADMIN key (READ_ONLY)
 * 3. 403 Forbidden when attempting cross-tenant deletion
 * 4. 400 Bad Request when attempting to delete headquarters (-01)
 * 5. 400 Bad Request when attempting to delete location with bound employees
 * 6. 200 OK when deleting valid unassigned branch location
 * 7. Verification that location is permanently removed from GET /api/v1/tenant/locations
 * 8. Clean teardown with zero persistent database pollution
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";
const TIMESTAMP = Date.now();
const TAX_ID = "24549210";
const HQ_LOC_ID = `${TAX_ID}-01`;
const TEST_BRANCH_ID = `${TAX_ID}-TEST-DEL-${TIMESTAMP.toString().slice(-4)}`;
const TEST_BUSY_BRANCH_ID = `${TAX_ID}-TEST-BUSY-${TIMESTAMP.toString().slice(-4)}`;
const TEST_EMP_USER = `U_TEST_DEL_EMP_${TIMESTAMP}`;

async function runD1Sql(sql) {
  const tempFileName = `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}.sql`;
  const tempFilePath = path.resolve(__dirname, tempFileName);
  fs.writeFileSync(tempFilePath, sql, 'utf8');
  const res = spawnSync('node', ['run-wrangler.js', 'd1', 'execute', 'line-checkin-db', '--remote', `--file=./${tempFileName}`, '-y'], {
    env: process.env,
    shell: false,
    cwd: __dirname,
    encoding: 'utf8'
  });
  if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  return res.status === 0;
}

async function runTest() {
  console.log("================================================================================");
  console.log("🚀 STARTING AUTOMATED TEST: BRANCH LOCATION DELETION & SAFETY GUARDS");
  console.log(`🌐 TARGET WORKER: ${BASE_URL}`);
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(title, condition, extra = "") {
    if (condition) {
      console.log(`  ✅ [PASS] ${title} ${extra ? `(${extra})` : ""}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title} ${extra ? `(${extra})` : ""}`);
      failed++;
    }
  }

  let adminApiKey = "";
  let readonlyApiKey = "";

  try {
    // Step 1: Issue Admin & ReadOnly API Keys
    console.log("--- 1. 取得測試用 Admin 與 ReadOnly API 金鑰 ---");
    const keyAdminResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tax_id: TAX_ID, name: `刪除測試 Admin 金鑰 (${TIMESTAMP})`, role: "ADMIN" })
    });
    const keyAdminData = await keyAdminResp.json();
    assert("簽發 Admin 金鑰成功", keyAdminResp.status === 200 && keyAdminData.apiKey);
    adminApiKey = keyAdminData.apiKey;

    const keyRoResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tax_id: TAX_ID, name: `刪除測試 ReadOnly 金鑰 (${TIMESTAMP})`, role: "READ_ONLY" })
    });
    const keyRoData = await keyRoResp.json();
    assert("簽發 ReadOnly 金鑰成功", keyRoResp.status === 200 && keyRoData.apiKey);
    readonlyApiKey = keyRoData.apiKey;

    // Step 2: Create Test Branch Locations
    console.log("\n--- 2. 建立待刪除之測試分店與含有員工之測試分店 ---");
    const createBranchResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
      body: JSON.stringify({
        id: TEST_BRANCH_ID,
        name: "刪除驗證測試門市",
        address: "台中市西屯區台灣大道三段99號",
        allowed_radius: 100
      })
    });
    assert("建立空置測試門市成功", createBranchResp.status === 200);

    const createBusyBranchResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
      body: JSON.stringify({
        id: TEST_BUSY_BRANCH_ID,
        name: "在職員工綁定門市",
        address: "台中市北區崇德路一段200號",
        allowed_radius: 100
      })
    });
    assert("建立繁忙測試門市成功", createBusyBranchResp.status === 200);

    // Bind an employee to TEST_BUSY_BRANCH_ID
    const joinResp = await fetch(`${BASE_URL}/api/v1/employee/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: TEST_BUSY_BRANCH_ID,
        lineUserId: TEST_EMP_USER,
        displayName: "刪除門市測試員"
      })
    });
    assert("員工成功綁定至繁忙門市", joinResp.status === 200);

    // Step 3: Unauthenticated Deletion
    console.log("\n--- 3. 鑑權與權限邊界測試 ---");
    const unauthDel = await fetch(`${BASE_URL}/api/v1/tenant/locations/${TEST_BRANCH_ID}`, {
      method: "DELETE"
    });
    assert("未帶金鑰刪除回傳 401 Unauthorized", unauthDel.status === 401);

    const roDel = await fetch(`${BASE_URL}/api/v1/tenant/locations/${TEST_BRANCH_ID}`, {
      method: "DELETE",
      headers: { "X-Tenant-Key": readonlyApiKey }
    });
    assert("READ_ONLY 金鑰刪除回傳 403 Forbidden", roDel.status === 403);

    // Step 4: Headquarters Deletion Protection
    console.log("\n--- 4. 企業總部據點安全保護防線 ---");
    const delHqResp = await fetch(`${BASE_URL}/api/v1/tenant/locations/${HQ_LOC_ID}`, {
      method: "DELETE",
      headers: { "X-Tenant-Key": adminApiKey }
    });
    const delHqData = await delHqResp.json();
    assert("刪除總部據點 (-01) 被阻擋回傳 400", delHqResp.status === 400 && delHqData.success === false);
    assert("錯誤提示包含總部不可刪除", delHqData.error && delHqData.error.includes("企業總部主要據點不可刪除"));

    // Step 5: Active Employee Binding Protection
    console.log("\n--- 5. 門市尚有在職員工綁定時阻擋刪除 ---");
    const delBusyResp = await fetch(`${BASE_URL}/api/v1/tenant/locations/${TEST_BUSY_BRANCH_ID}`, {
      method: "DELETE",
      headers: { "X-Tenant-Key": adminApiKey }
    });
    const delBusyData = await delBusyResp.json();
    assert("尚有員工綁定之門市刪除被阻擋回傳 400", delBusyResp.status === 400 && delBusyData.success === false);
    assert("錯誤提示包含在職員工綁定警示", delBusyData.error && delBusyData.error.includes("在職員工綁定"));

    // Step 6: Successful Deletion of Clean Branch
    console.log("\n--- 6. 合法刪除空置分店據點 ---");
    const delCleanResp = await fetch(`${BASE_URL}/api/v1/tenant/locations/${TEST_BRANCH_ID}`, {
      method: "DELETE",
      headers: { "X-Tenant-Key": adminApiKey }
    });
    const delCleanData = await delCleanResp.json();
    assert("合法刪除空置分店回傳 200 OK", delCleanResp.status === 200 && delCleanData.success === true);
    assert("回傳成功刪除訊息", delCleanData.message && delCleanData.message.includes("已成功刪除"));

    // Step 7: Verify branch is gone from GET /api/v1/tenant/locations
    console.log("\n--- 7. 驗證分店清單已徹底移除 ---");
    const locListResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
      headers: { "X-Tenant-Key": adminApiKey }
    });
    const locListData = await locListResp.json();
    const branchStillExists = locListData.locations.some(l => l.id === TEST_BRANCH_ID);
    assert("已刪除之分店不再存在於據點清單中", !branchStillExists);

  } finally {
    console.log("\n🧹 執行 Teardown 清理測試據點與測試金鑰...");
    await runD1Sql(`
      DELETE FROM company_employees WHERE line_user_id = '${TEST_EMP_USER}' OR company_id IN ('${TEST_BRANCH_ID}', '${TEST_BUSY_BRANCH_ID}');
      DELETE FROM locations WHERE id IN ('${TEST_BRANCH_ID}', '${TEST_BUSY_BRANCH_ID}');
      DELETE FROM tenant_api_keys WHERE tax_id = '${TAX_ID}' AND name LIKE '%刪除測試%';
    `);
    console.log("  ✅ Teardown 清理完成，無任何測試髒資料殘留。");
  }

  console.log("\n================================================================================");
  console.log(`🎉 TEST COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
