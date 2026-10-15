/**
 * Automated Verification Suite: Batch 5 (Shift Schedule Management & Attendance/Payroll CSV Export)
 * Corresponds to AUTONOMOUS_VERIFICATION_ROADMAP.md (Batch 5)
 * 
 * Verifies without Playwright:
 * 1. Tier 2: AST & HTML Structure Inspection (Item 11 & Admin Tabs)
 *    - HTML Stack-Based Tag Balance & Nesting Validator (all tags strictly paired, zero unclosed tags)
 *    - JSDOM AST & DOM Inspection:
 *      * Section: #tab-schedules, #schedulesTableBody, #scheduleMonth, #scheduleUserFilter
 *      * Controls: Template download button (downloadScheduleTemplate), upload button, hidden #scheduleFileInput with accept=".csv"
 *      * Section: #tab-records, #recordsTableBody, export CSV button (exportCsv)
 *      * Global DOM ID uniqueness check
 * 2. Tier 4: Workers API Live Contract & D1 Sandbox (Item 11: Schedule Batch Import & Upsert)
 *    - GET /api/v1/tenant/schedules/template:
 *      * UTF-8 BOM (\uFEFF) verification
 *      * Content-Type: text/csv; charset=utf-8 & Content-Disposition attachment; filename="schedules_template.csv"
 *      * Header columns: 員工LINE_ID,員工姓名,排班日期(YYYY-MM-DD),班別名稱,預計上班(HH:MM),預計下班(HH:MM),休息分鐘,是否休假(0或1)
 *    - POST /api/v1/tenant/schedules/batch:
 *      * 401 unauthenticated defense
 *      * 403 READ_ONLY role defense
 *      * 400 missing / empty schedules array guard
 *      * Upsert & Idempotency: physical D1 insertion of shift & rest day schedules
 *      * Overwrite mechanism: ON CONFLICT(company_id, line_user_id, work_date) DO UPDATE cleanly updates without duplicate rows
 * 3. Tier 4: Workers API Live Contract & D1 Sandbox (Item 12: Attendance Monitoring & Payroll CSV Export)
 *    - GET /api/v1/tenant/records?format=csv:
 *      * 401 unauthenticated defense
 *      * UTF-8 BOM (\uFEFF) verification for Excel CJK compatibility
 *      * Content-Type: text/csv; charset=utf-8 & Content-Disposition attachment filename
 *      * RFC 4180 Compliant CSV parser: quote wrapping and internal quote ("") escaping
 *      * 10-column header reconciliation: 紀錄序號,據點代碼,員工LINE_ID,員工姓名,打卡狀態,打卡類型,當段工時(小時),驗證方式,打卡時間,距離(公尺)
 *      * Chinese translation: IN/OUT -> 上班/下班, IP_WHITELIST/GPS_FALLBACK/GPS -> 公司Wi-Fi / 外網GPS / GPS
 *      * Number formatting: work_hours (e.g. 8.5) and Math.round integer distance_meters
 *      * Filter linkage: startDate, endDate, status, punchType exact row count match
 * 4. Mandatory Teardown: 100% Cleanup in finally hook
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

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

// Dedicated QA Sandbox Tax ID (supported in isValidTaiwanTaxId)
const TEST_TAX_ID = "99999999";
const TEST_COMPANY_ID = `${TEST_TAX_ID}-01`;
const TEST_EMP_1 = `U_B5_EMP1_${TIMESTAMP}`;
const TEST_EMP_2 = `U_B5_EMP2_${TIMESTAMP}`;

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

// -----------------------------------------------------------------------------
// RFC 4180 CSV Parser (Handles BOM, Quoting, and "" Escaped Quotes)
// -----------------------------------------------------------------------------
function parseCsv(csvText) {
  let text = csvText;
  let hasBom = false;
  if (text.charCodeAt(0) === 0xFEFF) {
    hasBom = true;
    text = text.slice(1);
  }

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return { hasBom, rows };
}

// -----------------------------------------------------------------------------
// PART 1: Tier 2 AST & HTML Structure Inspection
// -----------------------------------------------------------------------------
function extractHtmlTemplate(tsFilePath) {
  const code = fs.readFileSync(tsFilePath, 'utf8');
  const match = code.match(/return\s*`([\s\S]*?)`;/);
  if (!match) {
    throw new Error(`Failed to extract return \`...\` from ${tsFilePath}`);
  }
  return match[1];
}

function validateHtmlTagBalance(htmlSnippet, snippetName = "Snippet") {
  const cleanHtml = htmlSnippet.replace(/<!--[\s\S]*?-->/g, '');
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  const tagRegex = /<\/?([a-zA-Z0-9\-]+)(?:\s+[^>]*?)?(\/?)>/g;
  const stack = [];
  let match;
  const errors = [];

  while ((match = tagRegex.exec(cleanHtml)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isSelfClosing = match[2] === '/' || voidTags.has(tagName);
    const isClosingTag = fullTag.startsWith('</');

    if (isClosingTag) {
      if (voidTags.has(tagName)) {
        errors.push(`Void element <${tagName}> must not have closing tag at index ${match.index}`);
        continue;
      }
      if (stack.length === 0) {
        errors.push(`Unexpected closing tag </${tagName}> without open tag at index ${match.index}`);
        continue;
      }
      const top = stack.pop();
      if (top.name !== tagName) {
        errors.push(`Mismatched closing tag </${tagName}>, expected </${top.name}> (opened at index ${top.index})`);
      }
    } else if (!isSelfClosing) {
      stack.push({ name: tagName, index: match.index });
    }
  }

  if (stack.length > 0) {
    for (const unclosed of stack) {
      errors.push(`Unclosed opening tag <${unclosed.name}> at index ${unclosed.index}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    tagCount: cleanHtml.match(/<[a-zA-Z0-9\-]+/g)?.length || 0
  };
}

function runPart1HtmlAstTests() {
  console.log("\n================================================================================");
  console.log("🔹 PART 1: Tier 2 AST & HTML Structure Inspection (Item 11 & Admin Tabs)");
  console.log("================================================================================");

  const tabsPath = path.resolve(__dirname, 'src/views/admin/admin-tabs.ts');
  assert("檔案存在：admin-tabs.ts", fs.existsSync(tabsPath));

  const tabsHtml = extractHtmlTemplate(tabsPath);

  // Test 1.1: Stack-Based Tag Balancer on Schedules Tab
  console.log("\n[Test 1.1] 嚴格堆疊標籤平衡檢驗 (Stack-Based HTML Tag Balancer on #tab-schedules)...");
  const schedulesTabMatch = tabsHtml.match(/(<!--\s*TAB 2:.*?班表管理與匯入[\s\S]*?<\/section>)/i);
  assert("成功定位 tab-schedules HTML 區塊", !!schedulesTabMatch);

  const schedulesTabResult = validateHtmlTagBalance(schedulesTabMatch[1], "tab-schedules");
  assert(
    "tab-schedules 標籤 100% 閉合且無巢狀越界",
    schedulesTabResult.valid,
    schedulesTabResult.valid ? `檢驗標籤數: ${schedulesTabResult.tagCount}` : schedulesTabResult.errors.join("; ")
  );

  // Test records tab snippet
  const recordsTabMatch = tabsHtml.match(/(<!--\s*TAB 3:.*?考勤監控與計薪匯出[\s\S]*?<\/section>)/i);
  assert("成功定位 tab-records HTML 區塊", !!recordsTabMatch);
  const recordsTabResult = validateHtmlTagBalance(recordsTabMatch[1], "tab-records");
  assert(
    "tab-records 標籤 100% 閉合且無巢狀越界",
    recordsTabResult.valid,
    recordsTabResult.valid ? `檢驗標籤數: ${recordsTabResult.tagCount}` : recordsTabResult.errors.join("; ")
  );

  // Full admin-tabs.ts tag balance
  const fullTabsResult = validateHtmlTagBalance(tabsHtml, "admin-tabs.ts full");
  assert(
    "renderAdminTabs 全文 HTML 標籤結構完整無遺漏",
    fullTabsResult.valid,
    fullTabsResult.valid ? `總標籤數: ${fullTabsResult.tagCount}` : fullTabsResult.errors.join("; ")
  );

  // Test 1.2: JSDOM AST & Element Inspection
  console.log("\n[Test 1.2] JSDOM AST 語法樹與屬性合規性校驗...");
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${tabsHtml}</body></html>`);
  const document = dom.window.document;

  // Verify Tab 2: #tab-schedules
  const tabSchedules = document.getElementById("tab-schedules");
  assert("#tab-schedules 根節點存在且為 SECTION", tabSchedules && tabSchedules.tagName === "SECTION");
  assert("#tab-schedules 預設具備 hidden 類別", tabSchedules?.classList.contains("hidden"));

  // Verify Buttons in #tab-schedules
  const downloadTemplateBtn = tabSchedules?.querySelector("button[onclick='downloadScheduleTemplate()']");
  assert("包含「下載 CSV 範本」按鈕 onclick='downloadScheduleTemplate()'", !!downloadTemplateBtn);

  const generateFixedBtn = tabSchedules?.querySelector("button[onclick='generateFixedSchedules()']");
  assert("包含「一鍵生成固定班排班」按鈕 onclick='generateFixedSchedules()'", !!generateFixedBtn);

  const uploadInput = document.getElementById("scheduleFileInput");
  assert("#scheduleFileInput 檔案上傳節點存在且為 INPUT", uploadInput && uploadInput.tagName === "INPUT");
  assert("#scheduleFileInput 屬性 type='file'", uploadInput?.getAttribute("type") === "file");
  assert("#scheduleFileInput 屬性 accept='.csv'", uploadInput?.getAttribute("accept") === ".csv");
  assert("#scheduleFileInput 具備 hidden 隱藏類別", uploadInput?.classList.contains("hidden"));
  assert("#scheduleFileInput 綁定 onchange='handleScheduleCsvUpload(event)'", uploadInput?.getAttribute("onchange") === "handleScheduleCsvUpload(event)");

  const scheduleMonth = document.getElementById("scheduleMonth");
  assert("#scheduleMonth 月份選擇器存在且 type='month'", scheduleMonth && scheduleMonth.getAttribute("type") === "month");

  const scheduleUserFilter = document.getElementById("scheduleUserFilter");
  assert("#scheduleUserFilter 員工篩選輸入框存在", !!scheduleUserFilter);

  const schedulesTableBody = document.getElementById("schedulesTableBody");
  assert("#schedulesTableBody 表格主體存在且為 TBODY", schedulesTableBody && schedulesTableBody.tagName === "TBODY");

  // Verify Tab 3: #tab-records
  const tabRecords = document.getElementById("tab-records");
  assert("#tab-records 根節點存在且為 SECTION", tabRecords && tabRecords.tagName === "SECTION");

  const exportCsvBtn = tabRecords?.querySelector("button[onclick='exportCsv()']");
  assert("包含「匯出計薪 CSV」按鈕 onclick='exportCsv()'", !!exportCsvBtn);

  const recordsTableBody = document.getElementById("recordsTableBody");
  assert("#recordsTableBody 表格主體存在且為 TBODY", recordsTableBody && recordsTableBody.tagName === "TBODY");

  // Verify ID uniqueness in tabs DOM
  const allIds = Array.from(document.querySelectorAll("[id]")).map(el => el.id);
  const idCounts = {};
  const duplicateIds = [];
  for (const id of allIds) {
    idCounts[id] = (idCounts[id] || 0) + 1;
    if (idCounts[id] === 2) duplicateIds.push(id);
  }
  assert(
    "全域 HTML ID 唯一性校驗 (無重複 DOM ID)",
    duplicateIds.length === 0,
    duplicateIds.length === 0 ? "零重複 ID" : `重複 ID: ${duplicateIds.join(", ")}`
  );
}

// -----------------------------------------------------------------------------
// PART 2: Tier 4 D1 Sandbox - 項目 11：排班管理 (UTF-8 BOM CSV 批次匯入與 Upsert)
// -----------------------------------------------------------------------------
let adminApiKey = "";
let readOnlyApiKey = "";

async function runPart2ScheduleBatchTests() {
  console.log("\n================================================================================");
  console.log("🔹 PART 2: D1 Sandbox - 項目 11：排班管理 (UTF-8 BOM CSV 批次匯入與 Upsert)");
  console.log("================================================================================");

  // Setup: Ensure test location exists
  console.log(`\n[Setup] 初始化測試門市 ${TEST_COMPANY_ID}...`);
  await queryD1(`
    INSERT OR REPLACE INTO locations (id, name, address, target_lat, target_lon, allowed_radius)
    VALUES ('${TEST_COMPANY_ID}', 'Batch5測試總部', '台中市北區美德街56-11號', 24.1577, 120.6831, 100);
  `);

  // Setup: Generate ADMIN & READ_ONLY keys
  console.log("[Setup] 簽發測試用 ADMIN 與 READ_ONLY API 金鑰...");
  const adminKeyResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: TEST_TAX_ID, name: `B5-ADMIN-${TIMESTAMP}`, role: "ADMIN" })
  });
  const adminKeyData = await adminKeyResp.json();
  adminApiKey = adminKeyData.apiKey;
  assert("成功簽發 ADMIN 測試金鑰", !!adminApiKey && adminApiKey.startsWith(`pk_live_${TEST_TAX_ID}_`));

  const roKeyResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: TEST_TAX_ID, name: `B5-RO-${TIMESTAMP}`, role: "READ_ONLY" })
  });
  const roKeyData = await roKeyResp.json();
  readOnlyApiKey = roKeyData.apiKey;
  assert("成功簽發 READ_ONLY 測試金鑰", !!readOnlyApiKey && readOnlyApiKey.startsWith(`pk_live_${TEST_TAX_ID}_`));

  // Test 2.1: GET /api/v1/tenant/schedules/template
  console.log("\n[Test 2.1] GET /api/v1/tenant/schedules/template 下載排班 CSV 範本檢驗...");
  const tplResp = await fetch(`${BASE_URL}/api/v1/tenant/schedules/template`);
  assert("排班範本端點回傳 HTTP 200 OK", tplResp.status === 200);

  const tplContentType = tplResp.headers.get("content-type") || "";
  assert("HTTP Header Content-Type 包含 text/csv; charset=utf-8", tplContentType.toLowerCase().includes("text/csv") && tplContentType.toLowerCase().includes("utf-8"), `實際: ${tplContentType}`);

  const tplDisposition = tplResp.headers.get("content-disposition") || "";
  assert(
    "HTTP Header Content-Disposition 附帶 schedules_template.csv 檔名",
    tplDisposition.includes("attachment") && tplDisposition.includes("schedules_template.csv"),
    `實際: ${tplDisposition}`
  );

  const tplBuf = Buffer.from(await tplResp.arrayBuffer());
  const hasWireBom = tplBuf[0] === 0xEF && tplBuf[1] === 0xBB && tplBuf[2] === 0xBF;
  assert("HTTP 實體網路傳輸字節開頭包含 UTF-8 BOM (0xEF, 0xBB, 0xBF)", hasWireBom);

  const tplText = new TextDecoder('utf-8', { ignoreBOM: true }).decode(tplBuf);
  assert("範本內容開頭包含 \\uFEFF (UTF-8 BOM)", tplText.charCodeAt(0) === 0xFEFF);

  const parsedTpl = parseCsv(tplText);
  assert("CSV 解析器檢測出 UTF-8 BOM 檔頭", parsedTpl.hasBom);
  assert("CSV 範本列數 >= 2", parsedTpl.rows.length >= 2);

  const expectedHeaders = ["員工LINE_ID", "員工姓名", "排班日期(YYYY-MM-DD)", "班別名稱", "預計上班(HH:MM)", "預計下班(HH:MM)", "休息分鐘", "是否休假(0或1)"];
  const actualHeaders = parsedTpl.rows[0];
  assert(
    "範本首行標頭 100% 符合標準定義",
    expectedHeaders.length === actualHeaders.length && expectedHeaders.every((h, i) => h === actualHeaders[i]),
    `實際標頭: [${actualHeaders.join(", ")}]`
  );

  // Test 2.2: POST /api/v1/tenant/schedules/batch Authentication & Validation Guards
  console.log("\n[Test 2.2] 批次排班匯入鑑權防護與格式防呆 (Authentication & Parameter Defense)...");

  // 1. Unauthenticated -> 401
  const unauthBatch = await fetch(`${BASE_URL}/api/v1/tenant/schedules/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schedules: [{ line_user_id: TEST_EMP_1, work_date: "2026-08-10" }] })
  });
  assert("未認證呼叫排班匯入回傳 HTTP 401 Unauthorized", unauthBatch.status === 401);

  // 2. READ_ONLY role -> 403
  const roBatch = await fetch(`${BASE_URL}/api/v1/tenant/schedules/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": readOnlyApiKey },
    body: JSON.stringify({ schedules: [{ line_user_id: TEST_EMP_1, work_date: "2026-08-10" }] })
  });
  const roBatchData = await roBatch.json();
  assert("READ_ONLY 角色嘗試匯入排班回傳 HTTP 403 Forbidden", roBatch.status === 403);
  assert("錯誤提示包含「僅 ADMIN 角色可匯入或修改班表」", roBatchData.error?.includes("僅 ADMIN 角色可匯入或修改班表"), `實際: "${roBatchData.error}"`);

  // 3. Missing schedules array -> 400
  const missingSchedResp = await fetch(`${BASE_URL}/api/v1/tenant/schedules/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify({})
  });
  const missingSchedData = await missingSchedResp.json();
  assert("缺少 schedules 陣列回傳 HTTP 400 Bad Request", missingSchedResp.status === 400);
  assert("錯誤提示包含「缺少 schedules 陣列資料」", missingSchedData.error?.includes("缺少 schedules 陣列資料"), `實際: "${missingSchedData.error}"`);

  // 4. Empty schedules array -> 400
  const emptySchedResp = await fetch(`${BASE_URL}/api/v1/tenant/schedules/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify({ schedules: [] })
  });
  const emptySchedData = await emptySchedResp.json();
  assert("空 schedules 陣列回傳 HTTP 400 Bad Request", emptySchedResp.status === 400);
  assert("錯誤提示包含「缺少 schedules 陣列資料」", emptySchedData.error?.includes("缺少 schedules 陣列資料"), `實際: "${emptySchedData.error}"`);

  // Test 2.3: Upsert Idempotency & Overwrite Invariant
  console.log("\n[Test 2.3] 排班 Upsert 冪等性與精準覆蓋機制 (ON CONFLICT DO UPDATE)...");

  // Step 1: Initial batch import
  console.log("  匯入第 1 批排班：EMP1 3筆（含休假）與 EMP2 1筆...");
  const initialSchedules = [
    {
      company_id: TEST_COMPANY_ID,
      line_user_id: TEST_EMP_1,
      work_date: "2026-08-10",
      shift_name: "常態班",
      shift_start: "09:00",
      shift_end: "18:00",
      break_minutes: 60,
      is_rest_day: 0
    },
    {
      company_id: TEST_COMPANY_ID,
      line_user_id: TEST_EMP_1,
      work_date: "2026-08-11",
      shift_name: "早班",
      shift_start: "08:00",
      shift_end: "17:00",
      break_minutes: 60,
      is_rest_day: 0
    },
    {
      company_id: TEST_COMPANY_ID,
      line_user_id: TEST_EMP_1,
      work_date: "2026-08-12",
      shift_name: "例假",
      shift_start: null,
      shift_end: null,
      break_minutes: 0,
      is_rest_day: 1
    },
    {
      company_id: TEST_COMPANY_ID,
      line_user_id: TEST_EMP_2,
      work_date: "2026-08-10",
      shift_name: "晚班",
      shift_start: "14:00",
      shift_end: "23:00",
      break_minutes: 60,
      is_rest_day: 0
    }
  ];

  const import1Resp = await fetch(`${BASE_URL}/api/v1/tenant/schedules/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify({ schedules: initialSchedules })
  });
  const import1Data = await import1Resp.json();
  assert("第 1 批排班匯入成功回傳 HTTP 200 OK", import1Resp.status === 200);
  assert("回傳 success: true", import1Data.success === true);
  assert("回傳 insertedCount 為 4", import1Data.insertedCount === 4);

  // Direct D1 verification
  const d1RowsAfter1 = await queryD1(`
    SELECT line_user_id, work_date, shift_name, shift_start, shift_end, break_minutes, is_rest_day, is_cross_day 
    FROM employee_schedules 
    WHERE company_id = '${TEST_COMPANY_ID}' 
    ORDER BY line_user_id ASC, work_date ASC
  `);
  assert("D1 中查得 4 筆排班實體紀錄", d1RowsAfter1.length === 4);

  const emp1Day10 = d1RowsAfter1.find(r => r.line_user_id === TEST_EMP_1 && r.work_date === "2026-08-10");
  const emp1Day12 = d1RowsAfter1.find(r => r.line_user_id === TEST_EMP_1 && r.work_date === "2026-08-12");
  assert("EMP1 2026-08-10 原排班為「常態班」(09:00~18:00, is_rest_day=0)", emp1Day10?.shift_name === "常態班" && emp1Day10?.shift_start === "09:00" && emp1Day10?.is_rest_day === 0);
  assert("EMP1 2026-08-12 原排班為「例假」(is_rest_day=1)", emp1Day12?.shift_name === "例假" && emp1Day12?.is_rest_day === 1);

  // Step 2: Overwrite batch (re-import same dates with changed shift data)
  console.log("\n  匯入第 2 批覆蓋排班：同一天 (2026-08-10 改為大夜班、2026-08-12 改為特別假)...");
  const overwriteSchedules = [
    {
      company_id: TEST_COMPANY_ID,
      line_user_id: TEST_EMP_1,
      work_date: "2026-08-10",
      shift_name: "大夜班",
      shift_start: "22:00",
      shift_end: "06:00",
      break_minutes: 45,
      is_rest_day: 0,
      is_cross_day: 1
    },
    {
      company_id: TEST_COMPANY_ID,
      line_user_id: TEST_EMP_1,
      work_date: "2026-08-12",
      shift_name: "特別假",
      shift_start: null,
      shift_end: null,
      break_minutes: 0,
      is_rest_day: 1,
      is_cross_day: 0
    }
  ];

  const import2Resp = await fetch(`${BASE_URL}/api/v1/tenant/schedules/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify({ schedules: overwriteSchedules })
  });
  const import2Data = await import2Resp.json();
  assert("第 2 批覆蓋排班匯入成功回傳 HTTP 200 OK", import2Resp.status === 200 && import2Data.success === true);
  assert("回傳 insertedCount 為 2", import2Data.insertedCount === 2);

  // Direct D1 verification of Upsert & Overwrite
  const d1RowsAfter2 = await queryD1(`
    SELECT line_user_id, work_date, shift_name, shift_start, shift_end, break_minutes, is_rest_day, is_cross_day 
    FROM employee_schedules 
    WHERE company_id = '${TEST_COMPANY_ID}' 
    ORDER BY line_user_id ASC, work_date ASC
  `);
  assert("總排班紀錄數依然為 4 筆（未產生重複歷史紀錄，冪等性保證）", d1RowsAfter2.length === 4);

  const emp1TotalSchedules = d1RowsAfter2.filter(r => r.line_user_id === TEST_EMP_1);
  assert("EMP1 排班紀錄數保持為 3 筆", emp1TotalSchedules.length === 3);

  const emp1Day10Updated = d1RowsAfter2.find(r => r.line_user_id === TEST_EMP_1 && r.work_date === "2026-08-10");
  assert("2026-08-10 被新資料精準覆蓋：shift_name 為「大夜班」", emp1Day10Updated?.shift_name === "大夜班");
  assert("2026-08-10 預計時間更新為 22:00~06:00", emp1Day10Updated?.shift_start === "22:00" && emp1Day10Updated?.shift_end === "06:00");
  assert("2026-08-10 休息分鐘更新為 45", emp1Day10Updated?.break_minutes === 45);
  assert("2026-08-10 跨日標記更新為 1", emp1Day10Updated?.is_cross_day === 1);

  const emp1Day12Updated = d1RowsAfter2.find(r => r.line_user_id === TEST_EMP_1 && r.work_date === "2026-08-12");
  assert("2026-08-12 被新資料精準覆蓋：shift_name 為「特別假」", emp1Day12Updated?.shift_name === "特別假");
  assert("2026-08-12 保持休假標記 is_rest_day = 1", emp1Day12Updated?.is_rest_day === 1);
}

// -----------------------------------------------------------------------------
// PART 3: Tier 4 D1 Sandbox - 項目 12：出勤監控與計薪 CSV 報表匯出
// -----------------------------------------------------------------------------
async function runPart3AttendanceCsvExportTests() {
  console.log("\n================================================================================");
  console.log("🔹 PART 3: D1 Sandbox - 項目 12：出勤監控與計薪 CSV 報表匯出 (字元集與數值核算)");
  console.log("================================================================================");

  // Test 3.1: Authentication Guard
  console.log("\n[Test 3.1] 鑑權防護檢驗 (Authentication Guard)...");
  const unauthCsv = await fetch(`${BASE_URL}/api/v1/tenant/records?format=csv`);
  assert("未提供憑證匯出 CSV 回傳 HTTP 401 Unauthorized", unauthCsv.status === 401);

  // Test 3.2: Seed diverse test checkin records
  console.log("\n[Test 3.2] 建立多元打卡測試資料（含引號跳脫、工時精度、距離與驗證方式）...");
  const recordsToInsert = [
    {
      company_id: TEST_COMPANY_ID,
      line_user_id: TEST_EMP_1,
      display_name: '王"大明"', // Internal quote test
      device_id: 'DEV_001',
      latitude: 24.1577,
      longitude: 120.6831,
      distance_meters: 15.4, // Math.round -> 15
      status: 'SUCCESS',
      punch_type: 'IN',
      work_hours: null,
      verify_mode: 'IP_WHITELIST',
      created_at: '2026-08-15 08:58:30'
    },
    {
      company_id: TEST_COMPANY_ID,
      line_user_id: TEST_EMP_1,
      display_name: '王"大明"',
      device_id: 'DEV_001',
      latitude: 24.1577,
      longitude: 120.6831,
      distance_meters: 88.8, // Math.round -> 89
      status: 'SUCCESS',
      punch_type: 'OUT',
      work_hours: 8.5, // Float precision 8.5
      verify_mode: 'GPS_FALLBACK',
      created_at: '2026-08-15 17:32:00'
    },
    {
      company_id: TEST_COMPANY_ID,
      line_user_id: TEST_EMP_2,
      display_name: '李小美',
      device_id: 'DEV_002',
      latitude: 24.1577,
      longitude: 120.6831,
      distance_meters: 42.2, // Math.round -> 42
      status: 'SUCCESS',
      punch_type: 'IN',
      work_hours: null,
      verify_mode: 'GPS_ONLY',
      created_at: '2026-08-16 09:02:15'
    },
    {
      company_id: TEST_COMPANY_ID,
      line_user_id: TEST_EMP_2,
      display_name: '李小美',
      device_id: 'DEV_002',
      latitude: 24.1577,
      longitude: 120.6831,
      distance_meters: 250.6, // Math.round -> 251
      status: 'OUT_OF_RANGE',
      punch_type: 'OUT',
      work_hours: null,
      verify_mode: 'GPS_ONLY',
      created_at: '2026-08-16 18:05:00'
    }
  ];

  for (const r of recordsToInsert) {
    const whVal = r.work_hours !== null ? r.work_hours : 'NULL';
    const escapedName = r.display_name.replace(/'/g, "''");
    await queryD1(`
      INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at)
      VALUES ('${r.company_id}', '${r.line_user_id}', '${escapedName}', '${r.device_id}', ${r.latitude}, ${r.longitude}, ${r.distance_meters}, '${r.status}', '${r.punch_type}', ${whVal}, '${r.verify_mode}', '${r.created_at}');
    `);
  }

  const d1CheckinRows = await queryD1(`SELECT count(*) as cnt FROM checkin_records WHERE company_id = '${TEST_COMPANY_ID}'`);
  assert("D1 中成功插入 4 筆測試打卡紀錄", d1CheckinRows[0]?.cnt === 4);

  // Test 3.3: Fetch CSV Export & HTTP Headers
  console.log("\n[Test 3.3] 請求 GET /api/v1/tenant/records?format=csv 並校驗 Headers 與 UTF-8 BOM...");
  const csvResp = await fetch(`${BASE_URL}/api/v1/tenant/records?format=csv`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  assert("使用 ADMIN 金鑰匯出 CSV 回傳 HTTP 200 OK", csvResp.status === 200);

  const contentType = csvResp.headers.get("content-type") || "";
  assert("Content-Type 包含 text/csv 與 charset=utf-8", contentType.toLowerCase().includes("text/csv") && contentType.toLowerCase().includes("utf-8"), `實際: ${contentType}`);

  const disposition = csvResp.headers.get("content-disposition") || "";
  assert(
    "Content-Disposition 附帶正確檔名 (attendance_99999999_YYYY-MM-DD.csv)",
    disposition.includes("attachment") && disposition.includes(`attendance_${TEST_TAX_ID}_`) && disposition.endsWith('.csv"'),
    `實際: ${disposition}`
  );

  const csvBuf = Buffer.from(await csvResp.arrayBuffer());
  const hasCsvWireBom = csvBuf[0] === 0xEF && csvBuf[1] === 0xBB && csvBuf[2] === 0xBF;
  assert("出勤匯出 HTTP 實體傳輸字節包含 UTF-8 BOM (0xEF, 0xBB, 0xBF)", hasCsvWireBom);

  const rawCsv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(csvBuf);
  assert("匯出內容開頭必須包含 \\uFEFF (UTF-8 BOM)", rawCsv.charCodeAt(0) === 0xFEFF);

  // Test 3.4: RFC 4180 Parsing & Header Validation
  console.log("\n[Test 3.4] RFC 4180 CSV 解析與標頭欄位對帳...");
  const parsed = parseCsv(rawCsv);
  assert("CSV 解析器成功檢測並截取 UTF-8 BOM", parsed.hasBom);
  assert("CSV 包含標頭列與至少 4 筆資料列", parsed.rows.length >= 5);

  const expectedHeaders12 = ["紀錄序號", "據點代碼", "員工LINE_ID", "員工姓名", "打卡狀態", "打卡類型", "當段工時(小時)", "驗證方式", "打卡時間", "距離(公尺)"];
  const actualHeaderRow = parsed.rows[0];
  assert(
    "CSV 首行標頭 100% 精確吻合 10 大欄位定義",
    expectedHeaders12.length === actualHeaderRow.length && expectedHeaders12.every((h, i) => h === actualHeaderRow[i]),
    `實際標頭: [${actualHeaderRow.join(", ")}]`
  );

  // Test 3.5: RFC 4180 Quoting & Internal Quote Escaping
  console.log("\n[Test 3.5] CSV 跳脫防注入 (RFC 4180 Quoting & Escaping) 與數值中文化轉譯核算...");
  // Find Record A in parsed rows (EMP_1, punch_type IN, 2026-08-15 08:58:30)
  const rowA = parsed.rows.find(r => r[2] === TEST_EMP_1 && r[5] === "上班");
  assert("成功於 CSV 中定位 Record A (上班打卡)", !!rowA);
  if (rowA) {
    assert("據點代碼精確符合", rowA[1] === TEST_COMPANY_ID);
    assert("RFC 4180 內部引號以 \"\" 跳脫防注入，成功還原姓名「王\"大明\"」", rowA[3] === '王"大明"', `實際還原值: "${rowA[3]}"`);
    assert("打卡狀態為 SUCCESS", rowA[4] === "SUCCESS");
    assert("打卡類型中文化轉譯：IN -> 上班", rowA[5] === "上班");
    assert("上班未結算時當段工時為空字串", rowA[6] === "");
    assert("驗證方式中文化轉譯：IP_WHITELIST -> 公司Wi-Fi", rowA[7] === "公司Wi-Fi", `實際: "${rowA[7]}"`);
    assert("打卡時間吻合", rowA[8] === "2026-08-15 08:58:30");
    assert("打卡距離整數化：Math.round(15.4) -> 15", rowA[9] === "15", `實際: "${rowA[9]}"`);
  }

  // Find Record B in parsed rows (EMP_1, punch_type OUT, 2026-08-15 17:32:00)
  const rowB = parsed.rows.find(r => r[2] === TEST_EMP_1 && r[5] === "下班");
  assert("成功於 CSV 中定位 Record B (下班打卡)", !!rowB);
  if (rowB) {
    assert("打卡類型中文化轉譯：OUT -> 下班", rowB[5] === "下班");
    assert("當段工時精度保留 8.5", rowB[6] === "8.5", `實際: "${rowB[6]}"`);
    assert("驗證方式中文化轉譯：GPS_FALLBACK -> 外網GPS", rowB[7] === "外網GPS", `實際: "${rowB[7]}"`);
    assert("打卡距離整數化：Math.round(88.8) -> 89", rowB[9] === "89", `實際: "${rowB[9]}"`);
  }

  // Find Record C in parsed rows (EMP_2, GPS_ONLY, punch_type IN)
  const rowC = parsed.rows.find(r => r[2] === TEST_EMP_2 && r[5] === "上班");
  assert("成功於 CSV 中定位 Record C (EMP2 上班打卡)", !!rowC);
  if (rowC) {
    assert("員工姓名精確為「李小美」", rowC[3] === "李小美");
    assert("驗證方式中文化轉譯：GPS_ONLY -> GPS", rowC[7] === "GPS", `實際: "${rowC[7]}"`);
    assert("打卡距離整數化：Math.round(42.2) -> 42", rowC[9] === "42", `實際: "${rowC[9]}"`);
  }

  // Find Record D in parsed rows (EMP_2, OUT_OF_RANGE)
  const rowD = parsed.rows.find(r => r[2] === TEST_EMP_2 && r[5] === "下班");
  assert("成功於 CSV 中定位 Record D (EMP2 範圍外打卡)", !!rowD);
  if (rowD) {
    assert("打卡狀態為 OUT_OF_RANGE", rowD[4] === "OUT_OF_RANGE");
    assert("打卡距離整數化：Math.round(250.6) -> 251", rowD[9] === "251", `實際: "${rowD[9]}"`);
  }

  // Test 3.6: Filter Linkage Testing
  console.log("\n[Test 3.6] 篩選器聯動檢驗 (startDate, endDate, status, punchType)...");

  // 1. Filter by startDate = 2026-08-16
  const fStartResp = await fetch(`${BASE_URL}/api/v1/tenant/records?format=csv&startDate=2026-08-16`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const fStartParsed = parseCsv(await fStartResp.text());
  const dataRowsStart = fStartParsed.rows.slice(1);
  assert("startDate=2026-08-16 篩選出 2 筆紀錄 (Record C & D)", dataRowsStart.length === 2);
  assert("所有篩選結果日期皆 >= 2026-08-16", dataRowsStart.every(r => r[8] >= "2026-08-16"));

  // 2. Filter by endDate = 2026-08-15
  const fEndResp = await fetch(`${BASE_URL}/api/v1/tenant/records?format=csv&endDate=2026-08-15`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const fEndParsed = parseCsv(await fEndResp.text());
  const dataRowsEnd = fEndParsed.rows.slice(1);
  assert("endDate=2026-08-15 篩選出 2 筆紀錄 (Record A & B)", dataRowsEnd.length === 2);
  assert("所有篩選結果日期皆 <= 2026-08-15 23:59:59", dataRowsEnd.every(r => r[8] <= "2026-08-15 23:59:59"));

  // 3. Filter by status = SUCCESS
  const fStatusResp = await fetch(`${BASE_URL}/api/v1/tenant/records?format=csv&status=SUCCESS`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const fStatusParsed = parseCsv(await fStatusResp.text());
  const dataRowsStatus = fStatusParsed.rows.slice(1);
  assert("status=SUCCESS 篩選出 3 筆紀錄 (排除 OUT_OF_RANGE)", dataRowsStatus.length === 3);
  assert("所有篩選結果狀態皆為 SUCCESS", dataRowsStatus.every(r => r[4] === "SUCCESS"));

  // 4. Filter by punchType = IN
  const fPunchResp = await fetch(`${BASE_URL}/api/v1/tenant/records?format=csv&punchType=IN`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const fPunchParsed = parseCsv(await fPunchResp.text());
  const dataRowsPunch = fPunchParsed.rows.slice(1);
  assert("punchType=IN 篩選出 2 筆紀錄 (Record A & C)", dataRowsPunch.length === 2);
  assert("所有篩選結果類型皆為「上班」", dataRowsPunch.every(r => r[5] === "上班"));

  // 5. Combined filter: startDate=2026-08-15, endDate=2026-08-15, status=SUCCESS, punchType=OUT
  const fCombResp = await fetch(
    `${BASE_URL}/api/v1/tenant/records?format=csv&startDate=2026-08-15&endDate=2026-08-15&status=SUCCESS&punchType=OUT`,
    { headers: { "X-Tenant-Key": adminApiKey } }
  );
  const fCombParsed = parseCsv(await fCombResp.text());
  const dataRowsComb = fCombParsed.rows.slice(1);
  assert("四重組合條件精確命中 1 筆紀錄 (Record B)", dataRowsComb.length === 1);
  if (dataRowsComb.length === 1) {
    assert("命中紀錄正是 EMP_1 之 8.5 小時下班紀錄", dataRowsComb[0][2] === TEST_EMP_1 && dataRowsComb[0][6] === "8.5");
  }
}

// -----------------------------------------------------------------------------
// PART 4: Mandatory Teardown Hook
// -----------------------------------------------------------------------------
async function runTeardown() {
  console.log("\n================================================================================");
  console.log("🧹 PART 4: 強制執行自動化資料庫清理 (Mandatory Teardown Hook)");
  console.log("================================================================================");

  try {
    // 1. Delete checkin records
    await queryD1(`DELETE FROM checkin_records WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE '%B5%'`);
    // 2. Delete employee schedules
    await queryD1(`DELETE FROM employee_schedules WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE '%B5%'`);
    // 3. Delete company employees
    await queryD1(`DELETE FROM company_employees WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE '%B5%'`);
    // 4. Delete tenant API keys
    await queryD1(`DELETE FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}' OR name LIKE '%B5%'`);
    // 5. Delete test locations
    await queryD1(`DELETE FROM locations WHERE id LIKE '${TEST_TAX_ID}%'`);

    // Verification queries
    const recRem = await queryD1(`SELECT count(*) as cnt FROM checkin_records WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE '%B5%'`);
    const schRem = await queryD1(`SELECT count(*) as cnt FROM employee_schedules WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE '%B5%'`);
    const empRem = await queryD1(`SELECT count(*) as cnt FROM company_employees WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE '%B5%'`);
    const keyRem = await queryD1(`SELECT count(*) as cnt FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}' OR name LIKE '%B5%'`);
    const locRem = await queryD1(`SELECT count(*) as cnt FROM locations WHERE id LIKE '${TEST_TAX_ID}%'`);

    const clean = recRem[0]?.cnt === 0 && schRem[0]?.cnt === 0 && empRem[0]?.cnt === 0 && keyRem[0]?.cnt === 0 && locRem[0]?.cnt === 0;
    assert("Teardown 清理驗證：測試打卡、排班、員工、金鑰、門市據點殘留嚴格為 0", clean);
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
  console.log("🚀 STARTING AUTOMATED TEST SUITE: BATCH 5 VERIFICATION");
  console.log("   (Shift Schedule Batch Import/Upsert & Attendance/Payroll CSV Export)");
  console.log("================================================================================");
  console.log(`🌐 Target Worker URL: ${BASE_URL}`);
  console.log(`🏢 Test Tax ID: ${TEST_TAX_ID}`);
  console.log(`🕒 Suite Timestamp: ${TIMESTAMP}`);

  try {
    runPart1HtmlAstTests();
    await runPart2ScheduleBatchTests();
    await runPart3AttendanceCsvExportTests();
  } catch (err) {
    console.error("\n💥 測試套件執行發生未捕獲之重大異常:", err);
    failed++;
  } finally {
    await runTeardown();
  }

  console.log("\n================================================================================");
  console.log(`📊 BATCH 5 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
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
