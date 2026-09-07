/**
 * Automated Test Suite: Self-Service Device Switching & Security Warning Alerts
 * 
 * Verifies:
 * 1. Initial device binding during checkin (INITIAL_BIND, INFO)
 * 2. Self-service device switching during checkin (SWITCH_DEVICE, WARNING) -> checkin succeeds smoothly!
 * 3. Audit log API returns the warning alert with old and new device IDs
 * 4. Removal of POST /api/v1/tenant/devices/unbind route (returns 404)
 * 5. Admin portal (/admin) displays updated security & audit monitoring UI
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
const TEST_TAX_ID = "24549210";
const TEST_LOC_ID = `${TEST_TAX_ID}-TEST-SWITCH`;
const TEST_USER_ID = "U_test_device_switch_" + Date.now();
const TEST_USER_NAME = "換機測試員工";

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
  console.log("🚀 STARTING AUTOMATED TEST: SELF-SERVICE DEVICE SWITCHING & SECURITY ALERTS");
  console.log(`🌐 TARGET WORKER: ${BASE_URL}`);
  console.log(`👤 TEST USER: ${TEST_USER_ID}`);
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

  try {
    // Step 1: Issue Admin API Key for audit verification
    console.log("--- 1. 取得企業租戶金鑰 ---");
  const keyResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: TEST_TAX_ID, name: "換機測試租戶金鑰", role: "ADMIN" })
  });
  const keyData = await keyResp.json();
  assert("簽發測試租戶 API Key 成功", keyResp.status === 200 && keyData.apiKey);
  const tenantApiKey = keyData.apiKey;

  // Step 2: Ensure test location exists (dedicated test location to avoid polluting production HQ)
  console.log("\n--- 2. 確認測試據點存在 ---");
  const locResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
    body: JSON.stringify({
      id: TEST_LOC_ID,
      name: "換機測試專屬據點",
      address: "台中市北區美德街56-11號",
      target_lat: 24.1565,
      target_lon: 120.6835,
      allowed_radius: 500
    })
  });
  assert("配置測試據點成功", locResp.status === 200);

  // Step 3: Verify POST /api/v1/tenant/devices/unbind is removed (404)
  console.log("\n--- 3. 驗證管理者手動解綁 API 已移除 ---");
  const unbindResp = await fetch(`${BASE_URL}/api/v1/tenant/devices/unbind`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
    body: JSON.stringify({ lineUserId: TEST_USER_ID })
  });
  assert("呼叫已移除的解綁端點回傳 404 Not Found", unbindResp.status === 404);

  // Step 4: First check-in with Device A (INITIAL_BIND)
  console.log("\n--- 4. 員工使用裝置 A 首次打卡 (首次綁定) ---");
  const deviceA = "DEVICE_IPHONE_14_PRO_A111";
  const punch1Resp = await fetch(`${BASE_URL}/api/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: TEST_USER_ID,
      fallbackDisplayName: TEST_USER_NAME,
      deviceId: deviceA,
      companyId: TEST_LOC_ID,
      latitude: 24.1565,
      longitude: 120.6835
    })
  });
  const punch1Data = await punch1Resp.json();
  assert("裝置 A 首次打卡成功", punch1Resp.status === 200 && punch1Data.success);
  assert("首次打卡 deviceSwitched 應為 false", punch1Data.deviceSwitched === false);

  // Step 5: Second check-in with same Device A
  console.log("\n--- 5. 員工再次使用原裝置 A 打卡 ---");
  const punch2Resp = await fetch(`${BASE_URL}/api/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: TEST_USER_ID,
      fallbackDisplayName: TEST_USER_NAME,
      deviceId: deviceA,
      companyId: TEST_LOC_ID,
      latitude: 24.1565,
      longitude: 120.6835
    })
  });
  const punch2Data = await punch2Resp.json();
  assert("原裝置 A 第二次打卡成功", punch2Resp.status === 200 && punch2Data.success);
  assert("同裝置打卡 deviceSwitched 應為 false", punch2Data.deviceSwitched === false);

  // Step 6A: Employee switches to Device B without confirmation -> BLOCKED!
  console.log("\n--- 6A. 員工更換新手機 (裝置 B) 首次打卡 (未確認換機) ---");
  const deviceB = "DEVICE_PIXEL_9_PRO_B222";
  const punch3BlockResp = await fetch(`${BASE_URL}/api/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: TEST_USER_ID,
      fallbackDisplayName: TEST_USER_NAME,
      deviceId: deviceB,
      companyId: TEST_LOC_ID,
      latitude: 24.1565,
      longitude: 120.6835,
      confirmDeviceSwitch: false
    })
  });
  const punch3BlockData = await punch3BlockResp.json();
  assert("未確認換機被 409 Conflict 攔截", punch3BlockResp.status === 409);
  assert("回應 success 為 false", punch3BlockData.success === false);
  assert("回應包含 requireDeviceSwitchConfirm 標記", punch3BlockData.requireDeviceSwitchConfirm === true);
  assert("警訊內容提及防範代打卡與解綁通報", punch3BlockData.message && punch3BlockData.message.includes("防範代打卡") && punch3BlockData.message.includes("通報人事部"));

  // Step 6B: Employee confirms device switch -> SUCCEEDS!
  console.log("\n--- 6B. 員工彈窗確認換機並打卡 (confirmDeviceSwitch = true) ---");
  const punch3Resp = await fetch(`${BASE_URL}/api/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: TEST_USER_ID,
      fallbackDisplayName: TEST_USER_NAME,
      deviceId: deviceB,
      companyId: TEST_LOC_ID,
      latitude: 24.1565,
      longitude: 120.6835,
      confirmDeviceSwitch: true
    })
  });
  const punch3Data = await punch3Resp.json();
  assert("確認換機後打卡順利成功", punch3Resp.status === 200 && punch3Data.success);
  assert("換機打卡回應包含 deviceSwitched = true", punch3Data.deviceSwitched === true);

  // Step 6C: Verify LIFF contains device switch modal
  console.log("\n--- 6C. 驗證 LIFF 前端包含換機防弊確認彈窗 ---");
  const liffResp = await fetch(`${BASE_URL}/liff`);
  const liffHtml = await liffResp.text();
  assert("LIFF 頁面包含 deviceSwitchModal 彈窗元素", liffHtml.includes("deviceSwitchModal"));
  assert("LIFF 頁面包含防作弊與通報人事部警訊文案", liffHtml.includes("防範代打卡") && liffHtml.includes("通報人事部"));
  assert("LIFF 頁面包含確認換機並打卡按鈕", liffHtml.includes("確認換機並打卡"));

  // Step 7: Verify Audit Log has WARNING entry
  console.log("\n--- 7. 驗證後端產生 SWITCH_DEVICE 警告日誌 ---");
  const auditResp = await fetch(`${BASE_URL}/api/v1/tenant/audit`, {
    headers: { "X-Tenant-Key": tenantApiKey }
  });
  const auditData = await auditResp.json();
  assert("查詢企業安全稽核日誌成功", auditResp.status === 200 && Array.isArray(auditData.logs));

  const switchLog = auditData.logs.find(l => l.line_user_id === TEST_USER_ID && l.action === "SWITCH_DEVICE");
  assert("稽核日誌包含 SWITCH_DEVICE 記錄", !!switchLog);
  if (switchLog) {
    assert("換機日誌等級為 WARNING", switchLog.warning_level === "WARNING");
    assert("記錄正確舊裝置 ID", switchLog.old_device_id === deviceA);
    assert("記錄正確新裝置 ID", switchLog.new_device_id === deviceB);
  }

  // Step 8: Verify Admin Portal UI
  console.log("\n--- 8. 驗證地端管理後台 UI 整合 ---");
  const adminUiResp = await fetch(`${BASE_URL}/admin`);
  const adminUiHtml = await adminUiResp.text();
  assert("後台頁面包含「安全稽核與換機監控」模組", adminUiHtml.includes("安全稽核與換機監控") && adminUiHtml.includes("SWITCH_DEVICE"));
  assert("後台已移除手動解綁輸入框 (unbindUserId)", !adminUiHtml.includes("unbindUserId"));
  assert("後台已移除手動解綁函數 (unbindDevice)", !adminUiHtml.includes("unbindDevice()"));
  } finally {
    console.log("\n🧹 清理換機測試據點與測試實體 (Teardown)...");
    await runD1Sql(`
      DELETE FROM device_audit_logs WHERE line_user_id = '${TEST_USER_ID}';
      DELETE FROM user_devices WHERE line_user_id = '${TEST_USER_ID}';
      DELETE FROM checkin_records WHERE line_user_id = '${TEST_USER_ID}';
      DELETE FROM company_employees WHERE line_user_id = '${TEST_USER_ID}';
      DELETE FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}' AND name = '換機測試租戶金鑰';
      DELETE FROM locations WHERE id = '${TEST_LOC_ID}';
    `);
    console.log(`  ✅ 換機測試據點 ${TEST_LOC_ID} 與關聯測試資料清理完成。`);
  }

  console.log("\n================================================================================");
  console.log(`🎉 TEST COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTest().catch(e => {
  console.error("Test execution fatal error:", e);
  process.exit(1);
});
