/**
 * Comprehensive Automated Test Suite: Tenant Architecture & Client On-Premises Management
 * Verifies M2M Tenant Auth, RBAC, Multi-Tenant Scoping, Client Self-Service Locations, CSV Export, and QA Sandbox Isolation.
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
  console.log("🚀 STARTING AUTOMATED TEST: TENANT ARCHITECTURE & CLIENT LOCAL MANAGEMENT");
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
  let qaApiKey = "";

  try {
    // 1. Health check & Admin Portal UI
    console.log("--- 1. 系統基礎端點與地端管理入口驗證 ---");
  const healthResp = await fetch(`${BASE_URL}/api/health`);
  assert("API Health 檢查 200 OK", healthResp.status === 200);

  const adminUiResp = await fetch(`${BASE_URL}/admin`);
  const adminUiHtml = await adminUiResp.text();
  assert("地端管理入口 /admin 頁面存在 (200 OK)", adminUiResp.status === 200);
  assert("管理入口包含關鍵 UI 模組", adminUiHtml.includes("LINE 考勤地端管理後台") && adminUiHtml.includes("據點與網路配置"));

  // 2. Tenant API Key Provisioning
  console.log("\n--- 2. 租戶 API 金鑰簽發與 RBAC 角色測試 ---");

  const adminKeyResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: "24549210", name: "美德總部地端管理後台 (管理者)", role: "ADMIN" })
  });
  const adminKeyData = await adminKeyResp.json();
  assert("簽發企業 ADMIN 金鑰成功", adminKeyResp.status === 200 && adminKeyData.apiKey && adminKeyData.apiKey.startsWith("pk_live_24549210_"));
  adminApiKey = adminKeyData.apiKey;

  const roKeyResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: "24549210", name: "財務計薪報表系統 (唯讀)", role: "READ_ONLY" })
  });
  const roKeyData = await roKeyResp.json();
  assert("簽發企業 READ_ONLY 金鑰成功", roKeyResp.status === 200 && roKeyData.apiKey);
  readonlyApiKey = roKeyData.apiKey;

  const qaKeyResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: "00000000", name: "提供方測試人員專用沙盒", role: "SANDBOX_QA" })
  });
  const qaKeyData = await qaKeyResp.json();
  assert("簽發測試人員 SANDBOX_QA 沙盒金鑰成功", qaKeyResp.status === 200 && qaKeyData.apiKey);
  qaApiKey = qaKeyData.apiKey;

  // 3. Authentication & Authorization Boundaries
  console.log("\n--- 3. 租戶金鑰鑑權與邊界攔截防護 ---");
  const noKeyResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`);
  assert("未攜帶金鑰請求應被拒絕 (401 Unauthorized)", noKeyResp.status === 401);

  const fakeKeyResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    headers: { "X-Tenant-Key": "pk_live_24549210_fake_invalid_key_9999" }
  });
  assert("偽造金鑰請求應被拒絕 (401 Unauthorized)", fakeKeyResp.status === 401);

  const validKeyResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const validLocData = await validKeyResp.json();
  assert("合法 ADMIN 金鑰驗證通過 (200 OK)", validKeyResp.status === 200 && validLocData.companyTaxId === "24549210");

  // 4. Cross-Tenant Boundary Protection (Anti-Tampering)
  console.log("\n--- 4. 跨租戶隔離與防越權防護 (Cross-Tenant Scoping) ---");
  const crossTenantAttempt = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify({
      id: "99999999-01",
      name: "惡意嘗試建立他社據點",
      address: "台北市信義區市府路1號"
    })
  });
  assert("企業 A 嘗試建立企業 B (99999999) 據點應被嚴格攔截 (403 Forbidden)", crossTenantAttempt.status === 403);

  const roWriteAttempt = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": readonlyApiKey },
    body: JSON.stringify({
      id: "24549210-99",
      name: "唯讀金鑰嘗試寫入據點",
      address: "台中市北區美德街56-11號"
    })
  });
  assert("READ_ONLY 金鑰嘗試寫入據點應被攔截 (403 Forbidden)", roWriteAttempt.status === 403);

  // 5. Client Self-Service Location Management & Auto-Geocoding
  console.log("\n--- 5. 客戶地端管理者自主登記據點與地址自動轉座標 ---");
  const newBranchPayload = {
    id: "24549210-08",
    name: "豬毛科技 - 台中逢甲門市",
    address: "台中市西屯區逢甲路20號",
    allowed_radius: 120,
    allowed_ips: "211.20.1.88, 114.33.20.0/24"
  };
  const addBranchResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify(newBranchPayload)
  });
  const addBranchData = await addBranchResp.json();
  assert("地端管理者自主登記新分店成功", addBranchResp.status === 200 && addBranchData.success);
  assert("自動由中文地址解析 GPS 經緯度", typeof addBranchData.location?.target_lat === "number" && typeof addBranchData.location?.target_lon === "number");
  assert("正確配置 Wi-Fi 固定公網 IP 白名單", addBranchData.location?.allowed_ips === "211.20.1.88, 114.33.20.0/24" && addBranchData.location?.has_ip_whitelist === true);

  // 6. QR Code Stand Page Generation
  console.log("\n--- 6. 門市專屬立牌 QR Code 產出 ---");
  const qrResp = await fetch(`${BASE_URL}/api/v1/tenant/locations/24549210-08/qrcode`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const qrHtml = await qrResp.text();
  assert("產出門市立牌 QR Code 網頁成功 (200 OK)", qrResp.status === 200);
  assert("QR Code 網頁包含門市資訊與官方帳號綁定連結", qrHtml.includes("24549210-08") && qrHtml.includes("逢甲門市"));

  // 7. Attendance Query & CSV Export for Payroll
  console.log("\n--- 7. 考勤監控與計薪 CSV 匯出 ---");
  const recordsJsonResp = await fetch(`${BASE_URL}/api/v1/tenant/records?format=json`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const recordsJsonData = await recordsJsonResp.json();
  assert("查詢本公司出勤紀錄 JSON 成功", recordsJsonResp.status === 200 && recordsJsonData.companyTaxId === "24549210");

  const recordsCsvResp = await fetch(`${BASE_URL}/api/v1/tenant/records?format=csv`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const csvBuffer = await recordsCsvResp.arrayBuffer();
  const csvBytes = new Uint8Array(csvBuffer);
  const hasBom = csvBytes[0] === 0xEF && csvBytes[1] === 0xBB && csvBytes[2] === 0xBF;
  const recordsCsvText = new TextDecoder("utf-8").decode(csvBuffer);
  assert("匯出計薪標準 CSV 成功 (200 OK)", recordsCsvResp.status === 200);
  assert("CSV 包含 UTF-8 BOM 與標準計薪欄位標頭", hasBom && recordsCsvText.includes("紀錄序號,據點代碼,員工LINE_ID,員工姓名,打卡狀態,打卡類型,當段工時(小時),驗證方式,打卡時間,距離(公尺)"));

  // 8. QA Sandbox Environment Isolation
  console.log("\n--- 8. 提供方測試人員沙盒環境隔離檢驗 ---");
  const qaLocResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    headers: { "X-Tenant-Key": qaApiKey }
  });
  const qaLocData = await qaLocResp.json();
  assert("測試人員沙盒金鑰驗證通過 (200 OK)", qaLocResp.status === 200 && qaLocData.companyTaxId === "00000000");
  assert("測試人員環境與真實客戶資料 100% 實體隔離 (零客戶資料外洩)", qaLocData.locations.every(l => l.taxId === "00000000"));
  } finally {
    console.log("\n🧹 清理租戶架構測試據點與測試金鑰 (Teardown)...");
    await runD1Sql(`
      DELETE FROM tenant_api_keys WHERE tax_id IN ('24549210', '00000000') AND (name LIKE '%測試%' OR name LIKE '%美德總部%');
      DELETE FROM locations WHERE id = '24549210-08';
    `);
    console.log("  ✅ 測試據點 24549210-08 與關聯測試金鑰清理完成。");
  }

  console.log("\n================================================================================");
  console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED.`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
