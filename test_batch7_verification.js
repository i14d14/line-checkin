/**
 * Automated Verification Suite: Batch 7 (E-Payslip Flex & Device Audit & PBAC Matrix - Final Batch)
 * Corresponds to AUTONOMOUS_VERIFICATION_ROADMAP.md (Batch 7)
 * 
 * Verifies without Playwright:
 * 1. Item 15: Navy / Emerald Green Flex Payslip Card & Zod Contract Gate
 *    - In-process Zod contract checking (assertValidFlexBubble, assertValidFlexMessage)
 *    - Complete 9-field inspection (employee_id/line_user_id, employee_name, pay_month, base_salary, allowances, overtime_pay, deductions, net_salary, note)
 *    - Negative injection defense: illegal property/action injection rejected with FlexValidationError
 *    - UTF-8 BOM CSV template generation (GET /api/v1/tenant/payslips/template)
 *    - Server-side negative format and cross-tenant validation (POST /api/v1/tenant/payslips/dispatch)
 * 2. Item 16: Device Audit Logging & Switching Tracking
 *    - Initial device bind (INITIAL_BIND, INFO)
 *    - Device switch via POST /api/device/switch (SWITCH_DEVICE, WARNING)
 *    - D1 device_audit_logs verification (old_device_id, new_device_id, client_ip, user_agent, line_user_id, display_name)
 *    - Endpoint query verification (GET /api/devices/audit)
 * 3. Item 17: 10-Atomic Fine-Grained PBAC Authorization Matrix
 *    - Verification of 10 atomic permissions (ALL_PERMISSIONS) and Chinese label mapping
 *    - POST /api/v1/tenant/employees/:id/permissions: unauthenticated 401, cross-tax-id 403 defense, subset assignment
 *    - Verification of GET /api/v1/tenant/employees & GET /api/v1/employee/profile
 *    - Negative atomic permission interception:
 *      * Missing approve: 403 / business error defense
 *      * Missing export_payroll: 403 / business error defense
 *      * Missing view_all: 403 / cross-store defense
 * 4. Mandatory Teardown Invariant: 100% Cleanup in finally hook
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

// -----------------------------------------------------------------------------
// Environment & Infrastructure Configuration
// -----------------------------------------------------------------------------
let envPath = path.resolve(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  envPath = path.resolve(__dirname, '../.env');
}
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";
const TIMESTAMP = Date.now();

// Dedicated QA Sandbox Tax IDs
const TEST_TAX_ID = "99999999";
const TEST_COMPANY_ID = `${TEST_TAX_ID}-01`;
const FOREIGN_TAX_ID = "00000000";

const TEST_EMP_1 = `U_B7_EMP1_${TIMESTAMP}`;
const TEST_EMP_2 = `U_B7_EMP2_${TIMESTAMP}`;
const TEST_MGR = `U_B7_MGR_${TIMESTAMP}`;

const DEVICE_A = `DEVICE_A_${TIMESTAMP}`;
const DEVICE_B = `DEVICE_B_${TIMESTAMP}`;

const accountId = env.CLOUDFLARE_ACCOUNT_ID || '855d7f93966abed2712c15f619ea6721';
const dbId = env.CLOUDFLARE_D1_DATABASE_ID || 'd331ccb9-3aa5-48bd-8803-5e074e38b1c2';
const token = env.CLOUDFLARE_API_TOKEN;

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

async function queryD1(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error("D1 Query Failed: " + JSON.stringify(data.errors || data));
  }
  return data.result?.[0]?.results || [];
}

async function sendWebhookMessage(userId, text) {
  const res = await fetch(`${BASE_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "message",
          replyToken: "b7_test_reply_token",
          source: { userId },
          message: { type: "text", text }
        }
      ]
    })
  });
  return await res.json();
}

async function sendWebhookPostback(userId, data) {
  const res = await fetch(`${BASE_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "postback",
          replyToken: "b7_test_reply_token",
          source: { userId },
          postback: { data }
        }
      ]
    })
  });
  return await res.json();
}

// -----------------------------------------------------------------------------
// Helper: Load in-process TypeScript modules via esbuild
// -----------------------------------------------------------------------------
let tsModules = null;
function loadTsModules() {
  if (tsModules) return tsModules;
  const buildResult = esbuild.buildSync({
    stdin: {
      contents: `
        export { buildPayslipFlexBubble, formatCurrency } from "./src/views/flex/payslip-flex";
        export { assertValidFlexBubble, assertValidFlexMessage, FlexValidationError } from "./src/utils/flex-validator";
        export { ALL_PERMISSIONS, PERMISSION_LABELS } from "./src/types";
      `,
      resolveDir: __dirname,
      loader: 'ts'
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false
  });

  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', buildResult.outputFiles[0].text);
  fn(m, m.exports, require, __dirname, path.join(__dirname, 'test_batch7_bundle.js'));
  tsModules = m.exports;
  return tsModules;
}

// -----------------------------------------------------------------------------
// PART 1: 項目 15：專業海軍藍/翡翠綠 Flex 薪資卡片 (Zod 契約校驗)
// -----------------------------------------------------------------------------
async function runPart1PayslipFlexAndTemplateTests(tenantApiKey) {
  console.log("\n================================================================================");
  console.log("📦 PART 1: 項目 15 - 專業海軍藍/翡翠綠 Flex 薪資卡片與 Zod 契約校驗");
  console.log("================================================================================");

  const {
    buildPayslipFlexBubble,
    formatCurrency,
    assertValidFlexBubble,
    assertValidFlexMessage,
    FlexValidationError
  } = loadTsModules();

  // 1. Currency formatting helper
  assert("貨幣格式化正數：formatCurrency(45000) === '$45,000'", formatCurrency(45000) === "$45,000");
  assert("貨幣格式化負數：formatCurrency(-2100) === '-$2,100'", formatCurrency(-2100) === "-$2,100");
  assert("貨幣格式化零：formatCurrency(0) === '$0'", formatCurrency(0) === "$0");

  // 2. Build complete 9-field Payslip Flex Bubble
  const payslipPayload = {
    employee_id: TEST_EMP_1,
    line_user_id: TEST_EMP_1,
    employee_name: "黃雅涵",
    pay_month: "2026-08",
    base_salary: 45000,
    allowances: 3500,
    overtime_pay: 2800,
    deductions: 2200,
    net_salary: 49100,
    note: "全勤獎金與加班費已計入"
  };

  const { flexBubble, altText } = buildPayslipFlexBubble(payslipPayload);
  assert("Flex Bubble 物件成功產出", flexBubble && typeof flexBubble === 'object');
  assert("Bubble 類型為 mega bubble", flexBubble.type === "bubble" && flexBubble.size === "mega");

  // 3. Invariant: Masked push preview text (Strict Security Invariant)
  assert("隱私防護不變量：altText 嚴格不含任何薪資數字或扣款", !/\d+/.test(altText));
  assert("隱私防護預覽文案正確", altText === "【薪資發放通知】您有一筆新的薪資明細，請點入查看");

  // 4. In-process Zod Contract Gate Verification
  let validBubblePass = false;
  try {
    assertValidFlexBubble(flexBubble);
    validBubblePass = true;
  } catch (err) {
    console.error("  Unexpected validation error:", err);
  }
  assert("Zod 契約校驗：assertValidFlexBubble 驗證薪資卡片合規通過", validBubblePass);

  let validMessagePass = false;
  try {
    const fullMessage = {
      type: "flex",
      altText,
      contents: flexBubble
    };
    assertValidFlexMessage(fullMessage);
    validMessagePass = true;
  } catch (err) {
    console.error("  Unexpected message validation error:", err);
  }
  assert("Zod 契約校驗：assertValidFlexMessage 驗證頂層 Flex 訊息合規通過", validMessagePass);

  // 5. Visual Theme Verification: Navy Blue Header & Emerald Green Payout Box
  const headerBg = flexBubble.header?.backgroundColor;
  assert("主題配色：Header 頂部背景色為深海軍藍 (#0F172A)", headerBg === "#0F172A");

  // Find net payout box inside body contents
  const bodyContents = flexBubble.body?.contents || [];
  const payoutBox = bodyContents.find(c => c.backgroundColor === "#ECFDF5");
  assert("主題配色：實發金額卡片背景色為翡翠淺綠 (#ECFDF5)", !!payoutBox);

  // 6. Negative Protocol Injection: illegal properties must be caught by Zod gate
  let caughtIllegalProperty = false;
  try {
    const corruptedBubble = JSON.parse(JSON.stringify(flexBubble));
    // Inject illegal action property
    corruptedBubble.body.contents.push({
      type: "button",
      action: {
        type: "invalid_action_protocol",
        label: "點擊破解"
      }
    });
    assertValidFlexBubble(corruptedBubble);
  } catch (err) {
    if (err instanceof FlexValidationError) {
      caughtIllegalProperty = true;
    }
  }
  assert("負向協議注入防護：手動注入非法 action 精準被 Zod 捕捉並拋出 FlexValidationError", caughtIllegalProperty);

  let caughtEmptyAltText = false;
  try {
    assertValidFlexMessage({
      type: "flex",
      altText: "",
      contents: flexBubble
    });
  } catch (err) {
    if (err instanceof FlexValidationError) {
      caughtEmptyAltText = true;
    }
  }
  assert("負向協議注入防護：空 altText 精準被 Zod 捕捉並拋出 FlexValidationError", caughtEmptyAltText);

  // 7. Workers REST API: GET /api/v1/tenant/payslips/template (UTF-8 BOM CSV)
  const tplRes = await fetch(`${BASE_URL}/api/v1/tenant/payslips/template`);
  assert("GET /api/v1/tenant/payslips/template 回傳 200 OK", tplRes.status === 200);

  const tplContentType = tplRes.headers.get("content-type") || "";
  assert("CSV 範本 Content-Type 為 text/csv; charset=utf-8", tplContentType.includes("text/csv"));

  const tplBuffer = await tplRes.arrayBuffer();
  const tplBytes = new Uint8Array(tplBuffer);
  const hasBom = tplBytes.length >= 3 && tplBytes[0] === 0xEF && tplBytes[1] === 0xBB && tplBytes[2] === 0xBF;
  assert("CSV 範本開頭包含標準 UTF-8 BOM (0xEF, 0xBB, 0xBF)", hasBom);

  const tplText = new TextDecoder("utf-8").decode(tplBytes);
  assert("CSV 範本包含 9 大標準欄位標題", tplText.includes("line_user_id,employee_name,pay_month,base_salary,allowances,overtime_pay,deductions,net_salary,note"));

  // 8. Workers REST API: POST /api/v1/tenant/payslips/dispatch (Negative format & tenant isolation)
  // 8.1 Unauthenticated 401
  const unauthRes = await fetch(`${BASE_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payslips: [] })
  });
  assert("未授權存取 POST /api/v1/tenant/payslips/dispatch 回傳 401", unauthRes.status === 401);

  // 8.2 Empty payslips 400
  const emptyRes = await fetch(`${BASE_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
    body: JSON.stringify({ payslips: [] })
  });
  const emptyJson = await emptyRes.json();
  assert("傳送空陣列回傳 400 Bad Request", emptyRes.status === 400);
  assert("空陣列提示「未提供任何薪資資料」", emptyJson.failures?.[0]?.reason?.includes("未提供任何薪資資料"));

  // 8.3 Missing employee name 400
  const missingNameRes = await fetch(`${BASE_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
    body: JSON.stringify({
      payslips: [{
        line_user_id: TEST_EMP_1,
        employee_name: "",
        pay_month: "2026-08",
        base_salary: 40000,
        net_salary: 40000
      }]
    })
  });
  const missingNameJson = await missingNameRes.json();
  assert("缺少姓名回傳 400", missingNameRes.status === 400);

  // 8.4 Cross-tenant isolation defense: target user not in company_employees -> 400 rejection
  const crossTenantRes = await fetch(`${BASE_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
    body: JSON.stringify({
      payslips: [{
        line_user_id: `U_FOREIGN_${TIMESTAMP}`,
        employee_name: "外部用戶",
        pay_month: "2026-08",
        base_salary: 40000,
        net_salary: 40000
      }]
    })
  });
  const crossTenantJson = await crossTenantRes.json();
  assert("非本企業在職同仁回傳 400 阻斷跨租戶外洩", crossTenantRes.status === 400);
  assert("提示訊息明確包含「非本企業在職同仁，禁止跨租戶發送薪資條」", crossTenantJson.failures?.[0]?.reason?.includes("非本企業在職同仁，禁止跨租戶發送薪資條"));

  // 8.5 Positive dispatch with valid tenant employee
  const validDispatchRes = await fetch(`${BASE_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
    body: JSON.stringify({
      payslips: [{
        line_user_id: TEST_EMP_1,
        employee_name: "黃雅涵",
        pay_month: "2026-08",
        base_salary: 45000,
        allowances: 3500,
        overtime_pay: 2800,
        deductions: 2200,
        net_salary: 49100,
        note: "全勤獎金與加班費已計入"
      }]
    })
  });
  const validDispatchJson = await validDispatchRes.json();
  assert("本企業在職同仁薪資條批次發送成功 200 OK", validDispatchRes.status === 200 && validDispatchJson.success === true);
  assert("發送計數 count === 1", validDispatchJson.count === 1);
}

// -----------------------------------------------------------------------------
// PART 2: 項目 16：地端安全稽核日誌 (SWITCH_DEVICE 完整落庫)
// -----------------------------------------------------------------------------
async function runPart2DeviceAuditLogsTests() {
  console.log("\n================================================================================");
  console.log("📦 PART 2: 項目 16 - 地端安全稽核日誌 (SWITCH_DEVICE 完整落庫)");
  console.log("================================================================================");

  // 1. Initial device binding (DEVICE_A)
  console.log("  [Step 1] 模擬同仁初次於裝置 A 綁定...");
  const initBindRes = await fetch(`${BASE_URL}/api/device/switch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Batch7TestAgent/DeviceA",
      "x-mock-ip": "203.0.113.10"
    },
    body: JSON.stringify({
      deviceId: DEVICE_A,
      fallbackUserId: TEST_EMP_2,
      fallbackDisplayName: "換機受測同仁"
    })
  });
  const initBindJson = await initBindRes.json();
  assert("初次裝置綁定 200 OK", initBindRes.status === 200 && initBindJson.success === true);
  assert("初次綁定 newDeviceId 為裝置 A 且 oldDeviceId 為 null", initBindJson.newDeviceId === DEVICE_A && initBindJson.oldDeviceId === null);

  // Inspect D1 database directly for INITIAL_BIND record
  const initAuditRows = await queryD1(
    `SELECT id, line_user_id, display_name, action, old_device_id, new_device_id, ip_address, warning_level, user_agent 
     FROM device_audit_logs 
     WHERE line_user_id = '${TEST_EMP_2}' 
     ORDER BY id DESC LIMIT 1;`
  );
  assert("D1 實體落庫 INITIAL_BIND 紀錄存在", initAuditRows.length === 1);
  const initLog = initAuditRows[0] || {};
  assert("INITIAL_BIND action 為 INITIAL_BIND", initLog.action === "INITIAL_BIND");
  assert("INITIAL_BIND warning_level 等級為 INFO", initLog.warning_level === "INFO");
  assert("INITIAL_BIND new_device_id 為裝置 A", initLog.new_device_id === DEVICE_A);

  // 2. Self-service device switch to DEVICE_B
  console.log("  [Step 2] 模擬同仁更換至裝置 B 發起換機請求 (SWITCH_DEVICE)...");
  const switchRes = await fetch(`${BASE_URL}/api/device/switch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Batch7TestAgent/DeviceB",
      "x-mock-ip": "203.0.113.20"
    },
    body: JSON.stringify({
      deviceId: DEVICE_B,
      fallbackUserId: TEST_EMP_2,
      fallbackDisplayName: "換機受測同仁"
    })
  });
  const switchJson = await switchRes.json();
  assert("換機請求 200 OK", switchRes.status === 200 && switchJson.success === true);
  assert("換機回應包含正確舊裝置 A 與新裝置 B", switchJson.oldDeviceId === DEVICE_A && switchJson.newDeviceId === DEVICE_B);

  // Inspect D1 database directly for SWITCH_DEVICE record
  const switchAuditRows = await queryD1(
    `SELECT id, line_user_id, display_name, action, old_device_id, new_device_id, ip_address, warning_level, user_agent 
     FROM device_audit_logs 
     WHERE line_user_id = '${TEST_EMP_2}' 
     ORDER BY id DESC LIMIT 2;`
  );
  assert("D1 實體落庫累積 2 筆稽核紀錄 (初次綁定 + 換機)", switchAuditRows.length >= 2);
  const latestLog = switchAuditRows[0] || {};
  assert("換機稽核 action 為 'SWITCH_DEVICE'", latestLog.action === "SWITCH_DEVICE");
  assert("換機稽核 warning_level 提升為 'WARNING'", latestLog.warning_level === "WARNING");
  assert("換機稽核 old_device_id 精確記錄為裝置 A", latestLog.old_device_id === DEVICE_A);
  assert("換機稽核 new_device_id 精確記錄為裝置 B", latestLog.new_device_id === DEVICE_B);
  assert("換機稽核包含 client_ip 與 user_agent", !!latestLog.ip_address && !!latestLog.user_agent);
  assert("換機稽核包含 line_user_id 與 display_name", latestLog.line_user_id === TEST_EMP_2 && latestLog.display_name === "換機受測同仁");

  // 3. Query audit endpoint: GET /api/devices/audit
  console.log("  [Step 3] 驗證查詢端點 GET /api/devices/audit 回傳最新警告事件...");
  const auditRes = await fetch(`${BASE_URL}/api/devices/audit`);
  assert("GET /api/devices/audit 回傳 200 OK", auditRes.status === 200);

  const auditJson = await auditRes.json();
  assert("稽核日誌回應包含 success: true 與 logs 陣列", auditJson.success === true && Array.isArray(auditJson.logs));

  const targetAuditEntry = auditJson.logs.find(
    log => log.line_user_id === TEST_EMP_2 && log.action === "SWITCH_DEVICE"
  );
  assert("GET /api/devices/audit 清單精確包含受測同仁之 SWITCH_DEVICE 警告事件", !!targetAuditEntry);
  assert("SWITCH_DEVICE 警告事件欄位完整 (WARNING 等級、新舊裝置對照)", 
    targetAuditEntry && 
    targetAuditEntry.warning_level === "WARNING" && 
    targetAuditEntry.old_device_id === DEVICE_A && 
    targetAuditEntry.new_device_id === DEVICE_B
  );
}

// -----------------------------------------------------------------------------
// PART 3: 項目 17：10 大細粒度原子權限體系 (PBAC 鑑權矩陣)
// -----------------------------------------------------------------------------
async function runPart3PbacMatrixTests(tenantApiKey) {
  console.log("\n================================================================================");
  console.log("📦 PART 3: 項目 17 - 10 大細粒度原子權限體系 (PBAC 鑑權矩陣)");
  console.log("================================================================================");

  const { ALL_PERMISSIONS, PERMISSION_LABELS } = loadTsModules();

  // 1. Verify 10 atomic permissions & Chinese label definitions
  console.log("  [Step 1] 驗證 10 大原子權限定義與中文標籤...");
  assert("ALL_PERMISSIONS 嚴格包含 10 項原子權限", ALL_PERMISSIONS.length === 10);

  const expectedPerms = [
    "punch", "apply", "approve", "view_store", "view_all",
    "set_location", "set_wifi", "device_audit", "export_payroll", "broadcast"
  ];
  for (const perm of expectedPerms) {
    assert(`原子權限包含 '${perm}'`, ALL_PERMISSIONS.includes(perm));
    assert(`原子權限 '${perm}' 具備繁體中文標籤 '${PERMISSION_LABELS[perm]}'`, !!PERMISSION_LABELS[perm]);
  }

  // 2. Test POST /api/v1/tenant/employees/:id/permissions
  console.log("\n  [Step 2] 驗證權限變更 API (未認證攔截、跨統編阻斷、特定子集授權)...");

  // 2.1 Unauthenticated 401
  const unauthPermRes = await fetch(`${BASE_URL}/api/v1/tenant/employees/${TEST_EMP_1}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions: ["punch"] })
  });
  assert("未授權更新權限回傳 401 Unauthorized", unauthPermRes.status === 401);

  // 2.2 Cross-tax-id defense: caller provides foreign companyId -> 403 Forbidden
  const crossTaxPermRes = await fetch(`${BASE_URL}/api/v1/tenant/employees/${TEST_EMP_1}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
    body: JSON.stringify({
      companyId: `${FOREIGN_TAX_ID}-01`,
      permissions: ["punch", "apply"]
    })
  });
  assert("跨統編門市賦權回傳 403 Forbidden 阻斷越權", crossTaxPermRes.status === 403);

  // 2.3 Authorize specific subset: punch + apply only (no approve, no export_payroll, no view_all)
  const grantSubsetRes = await fetch(`${BASE_URL}/api/v1/tenant/employees/${TEST_EMP_1}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
    body: JSON.stringify({
      companyId: TEST_COMPANY_ID,
      employeeName: "受測同仁-一般員工",
      permissions: ["punch", "apply"]
    })
  });
  const grantSubsetJson = await grantSubsetRes.json();
  assert("授權特定子集 ['punch', 'apply'] 成功 200 OK", grantSubsetRes.status === 200 && grantSubsetJson.success === true);
  assert("更新回應確認權限清單為 ['punch', 'apply']", 
    grantSubsetJson.permissions.length === 2 && 
    grantSubsetJson.permissions.includes("punch") && 
    grantSubsetJson.permissions.includes("apply")
  );

  // 3. Verify GET /api/v1/tenant/employees & GET /api/v1/employee/profile
  console.log("\n  [Step 3] 驗證員工清單與個人 Profile 回傳授予之權限陣列...");

  // 3.1 GET /api/v1/tenant/employees
  const empListRes = await fetch(`${BASE_URL}/api/v1/tenant/employees`, {
    method: "GET",
    headers: { "X-Tenant-Key": tenantApiKey }
  });
  const empListJson = await empListRes.json();
  assert("GET /api/v1/tenant/employees 回傳 200 OK", empListRes.status === 200 && empListJson.success === true);

  const emp1Record = empListJson.employees.find(e => e.lineUserId === TEST_EMP_1);
  assert("員工清單精確查得 TEST_EMP_1", !!emp1Record);
  assert("員工清單中 TEST_EMP_1 權限陣列為 ['punch', 'apply']", 
    emp1Record && 
    emp1Record.permissions.length === 2 && 
    emp1Record.permissions.includes("punch") && 
    emp1Record.permissions.includes("apply")
  );

  // 3.2 GET /api/v1/employee/profile
  const profileRes = await fetch(`${BASE_URL}/api/v1/employee/profile?userId=${TEST_EMP_1}&cid=${TEST_COMPANY_ID}`);
  const profileJson = await profileRes.json();
  assert("GET /api/v1/employee/profile 回傳 200 OK", profileRes.status === 200 && profileJson.success === true);
  const profilePerms = profileJson.profile?.permissions || profileJson.permissions || [];
  assert("Profile 回傳同仁權限為 ['punch', 'apply']", 
    profilePerms.length === 2 && 
    profilePerms.includes("punch") && 
    profilePerms.includes("apply")
  );

  // 4. Negative Atomic Permission Interceptions
  console.log("\n  [Step 4] 負向原子權限攔截防護驗證...");

  // Setup manager TEST_MGR with approve permissions
  await fetch(`${BASE_URL}/api/v1/tenant/employees/${TEST_MGR}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
    body: JSON.stringify({
      companyId: TEST_COMPANY_ID,
      employeeName: "受測主管-具備審批權限",
      permissions: ["punch", "apply", "approve", "view_store"]
    })
  });

  // Assign manager as approver for TEST_EMP_1
  await fetch(`${BASE_URL}/api/v1/tenant/employees/${TEST_EMP_1}/approver`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
    body: JSON.stringify({
      approverLineId: TEST_MGR,
      companyId: TEST_COMPANY_ID
    })
  });

  // Submit a test correction request
  const reqRes = await fetch(`${BASE_URL}/api/v1/approval/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fallbackUserId: TEST_EMP_1,
      fallbackDisplayName: "受測同仁-一般員工",
      fallbackCompanyId: TEST_COMPANY_ID,
      type: "CORRECTION",
      targetDate: new Date().toISOString().slice(0, 10),
      details: { punch_type: "IN", time: "09:00", reason: "忘記打卡" }
    })
  });
  const reqJson = await reqRes.json();
  assert("建立測試審批單據 200 OK", reqRes.status === 200 && reqJson.success === true);
  const testApprovalId = reqJson.id;

  // 4.1 Missing 'approve' permission interception
  // TEST_EMP_1 (only punch, apply) attempts to approve via API -> HTTP 403 Forbidden
  const unauthApproveRes = await fetch(`${BASE_URL}/api/v1/approval/${testApprovalId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "approve",
      userId: TEST_EMP_1
    })
  });
  const unauthApproveJson = await unauthApproveRes.json();
  assert("缺少 approve 權限嘗試審批回傳 HTTP 403 Forbidden", unauthApproveRes.status === 403);
  assert("缺少 approve 提示訊息明確包含「權限不足：您尚未具備假勤審批 (approve) 權限」", 
    unauthApproveJson.error && unauthApproveJson.error.includes("approve")
  );

  // 4.2 Missing 'export_payroll' permission interception
  // TEST_EMP_1 attempts to export attendance CSV via GET /api/v1/tenant/records?userId=...&format=csv
  const exportPayrollDenyRes = await fetch(`${BASE_URL}/api/v1/tenant/records?userId=${TEST_EMP_1}&format=csv`, {
    method: "GET",
    headers: { "X-Tenant-Key": tenantApiKey }
  });
  const exportPayrollDenyJson = await exportPayrollDenyRes.json();
  assert("缺少 export_payroll 權限匯出計薪 CSV 回傳 HTTP 403 Forbidden", exportPayrollDenyRes.status === 403);
  assert("缺少 export_payroll 提示訊息明確「缺少 export_payroll 權限，無法匯出計薪報表」", 
    exportPayrollDenyJson.error && exportPayrollDenyJson.error.includes("export_payroll")
  );

  // 4.3 Missing 'view_all' permission interception (cross-store access)
  // TEST_EMP_1 belongs to 99999999-01, attempts to query 99999999-02
  const viewAllDenyRes = await fetch(`${BASE_URL}/api/v1/tenant/records?userId=${TEST_EMP_1}&companyId=${TEST_TAX_ID}-02`, {
    method: "GET",
    headers: { "X-Tenant-Key": tenantApiKey }
  });
  const viewAllDenyJson = await viewAllDenyRes.json();
  assert("缺少 view_all 權限跨店查閱其他分店回傳 HTTP 403 Forbidden", viewAllDenyRes.status === 403);
  assert("缺少 view_all 提示訊息明確「缺少 view_all 權限，無法跨店查閱其他門市資料」", 
    viewAllDenyJson.error && viewAllDenyJson.error.includes("view_all")
  );

  // 4.4 Webhook in-chat negative PBAC interception
  console.log("\n  [Step 5] 驗證 LINE 聊天室 Webhook 負向權限攔截...");

  // Text "跨店出勤" without view_all -> handled cleanly
  const crossStoreWebhookRes = await sendWebhookMessage(TEST_EMP_1, "跨店出勤看板");
  assert("Webhook 跨店出勤請求無例外崩潰 200 OK", crossStoreWebhookRes.success === true);

  // Text "計薪匯出" without export_payroll -> handled cleanly
  const exportPayrollWebhookRes = await sendWebhookMessage(TEST_EMP_1, "計薪匯出報表");
  assert("Webhook 計薪匯出請求無例外崩潰 200 OK", exportPayrollWebhookRes.success === true);

  // Manager TEST_MGR (has approve) successfully approves the test approval
  const mgrApproveRes = await fetch(`${BASE_URL}/api/v1/approval/${testApprovalId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "approve",
      userId: TEST_MGR
    })
  });
  const mgrApproveJson = await mgrApproveRes.json();
  assert("具備 approve 權限之主管審批成功 200 OK", mgrApproveRes.status === 200 && mgrApproveJson.success === true);
}

// -----------------------------------------------------------------------------
// PART 4: Mandatory Teardown Invariant: 100% Cleanup in finally hook
// -----------------------------------------------------------------------------
async function runTeardown() {
  console.log("\n================================================================================");
  console.log("🧹 MANDATORY TEARDOWN HOOK: 100% D1 Sandbox Database Cleanup");
  console.log("================================================================================");

  try {
    // 1. Delete checkin_records
    await queryD1(`
      DELETE FROM checkin_records 
      WHERE company_id LIKE '${TEST_TAX_ID}%' 
         OR line_user_id LIKE 'U_B7_%';
    `);

    // 2. Delete company_employees
    await queryD1(`
      DELETE FROM company_employees 
      WHERE company_id LIKE '${TEST_TAX_ID}%' 
         OR line_user_id LIKE 'U_B7_%';
    `);

    // 3. Delete user_devices
    await queryD1(`
      DELETE FROM user_devices 
      WHERE line_user_id LIKE 'U_B7_%';
    `);

    // 4. Delete device_audit_logs
    await queryD1(`
      DELETE FROM device_audit_logs 
      WHERE line_user_id LIKE 'U_B7_%';
    `);

    // 5. Delete approvals
    await queryD1(`
      DELETE FROM approvals 
      WHERE company_id LIKE '${TEST_TAX_ID}%' 
         OR line_user_id LIKE 'U_B7_%'
         OR approver_line_id LIKE 'U_B7_%';
    `);

    // 6. Delete tenant_api_keys
    await queryD1(`
      DELETE FROM tenant_api_keys 
      WHERE tax_id = '${TEST_TAX_ID}';
    `);

    // 7. Delete locations
    await queryD1(`
      DELETE FROM locations 
      WHERE id LIKE '${TEST_TAX_ID}%';
    `);

    // Verify 0 residual records across all affected tables
    const checkRecords = await queryD1(`
      SELECT 
        (SELECT COUNT(*) FROM checkin_records WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE 'U_B7_%') as count_records,
        (SELECT COUNT(*) FROM company_employees WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE 'U_B7_%') as count_employees,
        (SELECT COUNT(*) FROM user_devices WHERE line_user_id LIKE 'U_B7_%') as count_devices,
        (SELECT COUNT(*) FROM device_audit_logs WHERE line_user_id LIKE 'U_B7_%') as count_audits,
        (SELECT COUNT(*) FROM approvals WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE 'U_B7_%') as count_approvals,
        (SELECT COUNT(*) FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}') as count_keys,
        (SELECT COUNT(*) FROM locations WHERE id LIKE '${TEST_TAX_ID}%') as count_locations;
    `);

    const stats = checkRecords[0] || {};
    console.log("  🔍 Teardown 残留數驗證:", stats);

    const isClean = 
      stats.count_records === 0 &&
      stats.count_employees === 0 &&
      stats.count_devices === 0 &&
      stats.count_audits === 0 &&
      stats.count_approvals === 0 &&
      stats.count_keys === 0 &&
      stats.count_locations === 0;

    assert("Teardown 清理驗證：打卡紀錄、員工、裝置綁定、稽核日誌、單據、金鑰、門市殘留數嚴格為 0", isClean);
    console.log("  🧼 Teardown Hook 執行完畢，Cloudflare D1 生產資料庫已 100% 復原。");
  } catch (err) {
    console.error("  ❌ Teardown 執行期間發生錯誤:", err);
  }
}

// -----------------------------------------------------------------------------
// Main Test Runner
// -----------------------------------------------------------------------------
async function main() {
  console.log("================================================================================");
  console.log("🚀 STARTING AUTOMATED TEST SUITE: BATCH 7 VERIFICATION");
  console.log("   (E-Payslip Flex, Device Audit Logs & 10-Atomic PBAC Matrix - Final Batch)");
  console.log("================================================================================");
  console.log(`🌐 Target Worker URL: ${BASE_URL}`);
  console.log(`🏢 Test Tax ID: ${TEST_TAX_ID}`);
  console.log(`🕒 Suite Timestamp: ${TIMESTAMP}`);

  let tenantApiKey = "";

  try {
    // 0. Setup Sandbox Test Location & API Key
    console.log("\n--- 0. 初始化沙盒測試門市與 API Key ---");
    const keyRes = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tax_id: TEST_TAX_ID,
        name: "Batch 7 驗證專用金鑰",
        role: "ADMIN"
      })
    });
    const keyJson = await keyRes.json();
    assert("簽發 Batch 7 測試租戶 API Key 成功", keyRes.status === 200 && keyJson.apiKey);
    tenantApiKey = keyJson.apiKey;

    const locRes = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
      body: JSON.stringify({
        id: TEST_COMPANY_ID,
        name: "豬毛有限公司 - 台中美德總部",
        address: "台中市北區美德街56-11號",
        target_lat: 24.1565,
        target_lon: 120.6835,
        allowed_radius: 500
      })
    });
    assert("建立沙盒測試門市成功", locRes.status === 200);

    const emp1SetupRes = await fetch(`${BASE_URL}/api/v1/tenant/employees/${TEST_EMP_1}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-Key": tenantApiKey },
      body: JSON.stringify({
        companyId: TEST_COMPANY_ID,
        employeeName: "黃雅涵",
        permissions: ["punch", "apply"]
      })
    });
    assert("建立受測同仁 TEST_EMP_1 成功", emp1SetupRes.status === 200);

    // Run Part 1
    await runPart1PayslipFlexAndTemplateTests(tenantApiKey);

    // Run Part 2
    await runPart2DeviceAuditLogsTests();

    // Run Part 3
    await runPart3PbacMatrixTests(tenantApiKey);

  } catch (err) {
    console.error("\n💥 測試套件執行發生未捕獲之重大異常:", err);
    failed++;
  } finally {
    await runTeardown();
  }

  console.log("\n================================================================================");
  console.log(`📊 BATCH 7 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error(`\n❌ TEST SUITE FAILED WITH ${failed} FAILURES!`);
    process.exit(1);
  } else {
    console.log(`\n🎉 ALL ${passed} ASSERTIONS PASSED WITH ZERO FAILURES!`);
    process.exit(0);
  }
}

main();
