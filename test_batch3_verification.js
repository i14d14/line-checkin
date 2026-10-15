/**
 * Automated Verification Suite: Batch 3 (Fixed-Shift Schedule Materialization & ID Token Fast-Path Injection)
 * Corresponds to AUTONOMOUS_VERIFICATION_ROADMAP.md (Batch 3)
 * 
 * Verifies without Playwright:
 * 1. Tier 3: JSDOM Client-Side ID Token Fast-Path Decoding & DOM Injection (Item 8)
 *    - SWR Early Hydration: Instant initial paint from localStorage line_checkin_user_profile
 *    - Fast-Path In-Memory Decoding: liff.getDecodedIDToken() extracts sub, name, picture synchronously
 *    - Zero-Delay Bypass: Verifies liff.getProfile() is NOT called when fast-path succeeds (0ms)
 *    - Graceful Fallback: When getDecodedIDToken() fails/throws, falls back to await liff.getProfile()
 * 2. Tier 4: Workers API Live Contract & D1 Sandbox (Item 7 & Item 8)
 *    - 7.1 POST /api/v1/tenant/schedules/generate
 *      * PBAC Role Check: 401 for unauthenticated, 403 for READ_ONLY
 *      * Generation Logic: Auto-creates '常態班' for weekdays and '例假' (is_rest_day = 1) for weekends
 *      * Idempotency & Conflict Defense: Pre-existing custom schedules/leaves are NEVER overwritten (INSERT OR IGNORE)
 *      * Repeat call yields createdCount: 0
 *      * Direct D1 physical assertions for materialized rows
 *    - 7.2 Auto-Seed on Monthly Query (GET /api/v1/attendance/monthly)
 *      * Fixed employee with 0 schedules auto-seeds entire month into D1
 *      * API returns materialized schedule immediately (SCHEDULED / REST_DAY, never UNSCHEDULED)
 *      * Direct D1 physical assertion confirms rows physically exist in employee_schedules
 *      * Negative Isolation: Shift employee (schedule_mode = 'SHIFT') is NEVER auto-seeded (remains UNSCHEDULED, 0 D1 rows)
 *    - 8.2 Backend ID Token Anti-Spoofing & Validation Defense
 *      * Rejects/handles malformed ID tokens in approval & checkin workflows
 * 3. Mandatory Teardown: 100% Cleanup in finally hook
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Load environment variables
const envPath = path.resolve(__dirname, '.env');
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

const WORKER_URL = "https://line-checkin-worker.i14d142.workers.dev";
const TIMESTAMP = Date.now();

// Dedicated QA Sandbox Tax ID (supported in isValidTaiwanTaxId)
const TEST_TAX_ID = "99999999";
const TEST_COMPANY_ID = `${TEST_TAX_ID}-01`;
const FIXED_USER_ID = `U_B3_FIXED_${TIMESTAMP}`;
const SHIFT_USER_ID = `U_B3_SHIFT_${TIMESTAMP}`;
const TEST_GEN_MONTH = "2026-11"; // November: 30 days (1st is Sunday, 30th is Monday)
const TEST_AUTOSEED_MONTH = "2026-12"; // December: 31 days (1st is Tuesday, 31st is Thursday)

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
// Part 1: Tier 3 JSDOM Client-Side ID Token Fast-Path Decoding & DOM Injection
// -----------------------------------------------------------------------------
function setupLiffDOM(customLiffMock = {}, initialLocalStorage = {}) {
  const html = `
  <!DOCTYPE html>
  <html>
  <body>
    <div id="userName">未登入</div>
    <div id="userProfileTag">未登入</div>
    <div id="companyTag"></div>
    <div id="displayCompanyId"></div>
    <div id="displayDevice"></div>
    <img id="userAvatar" src="" />
    <div id="locationName"></div>
    <div id="checkinBtn"></div>
    <div id="checkinBtnText"></div>
    <div id="checkinDistanceHint"></div>
    <div id="statusBadge"></div>
    <div id="lastPunchInfo"></div>
    <div id="workHoursTag"></div>
    <div id="apprApplicantName"></div>
    <div id="nav-admin" class="hidden"></div>
    <div id="onboardingCard" class="hidden"></div>
    <div id="mainCheckinArea"></div>
  </body>
  </html>
  `;

  const dom = new JSDOM(html, {
    url: `https://liff.line.me/2011328810-vjUUBSYA?cid=${TEST_COMPANY_ID}`,
    runScripts: "dangerously"
  });

  const { window } = dom;

  // Initialize localStorage
  for (const [k, v] of Object.entries(initialLocalStorage)) {
    window.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  }

  // Mock fetch
  window.fetch = async (url, opts) => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      profile: {
        companyId: TEST_COMPANY_ID,
        companyName: "測試沙盒據點",
        permissions: ["punch", "apply"],
        isManager: false
      },
      permissions: ["punch", "apply"],
      days: []
    })
  });

  // Default LIFF mock
  window.liff = Object.assign({
    init: async () => {},
    isLoggedIn: () => true,
    getProfile: async () => ({ userId: "U_DEFAULT_PROFILE", displayName: "慢速同仁", pictureUrl: "" }),
    getIDToken: () => "mock_jwt_token",
    getDecodedIDToken: () => ({ sub: "U_FAST_DEFAULT", name: "快解碼同仁" }),
    getFriendship: async () => ({ friendFlag: true })
  }, customLiffMock);

  // Evaluate client bundle
  const clientJsPath = path.resolve(__dirname, "src/views/liff/liff.client.js");
  const clientJsCode = fs.readFileSync(clientJsPath, "utf8");
  window.eval(clientJsCode);

  return dom;
}

async function runPart1ClientTests() {
  console.log("\n================================================================================");
  console.log("🔹 PART 1: JSDOM Client-Side Fast-Path ID Token Decoding & DOM Injection (Item 8)");
  console.log("================================================================================");

  // Test 1.1: SWR Early Hydration from localStorage
  {
    console.log("\n[Test 1.1] SWR 本機快取即時注水 (0ms Early Hydration)...");
    const cachedProfile = {
      userId: "U_CACHED_USER_001",
      displayName: "快取先行同仁",
      companyId: TEST_COMPANY_ID,
      permissions: ["punch"],
      isEnrolled: true
    };
    const dom = setupLiffDOM({}, { "line_checkin_user_profile": cachedProfile });
    const { window } = dom;

    assert(
      "SWR 本機快取率先載入同仁姓名至 #userName",
      window.document.getElementById("userName").innerText === "快取先行同仁",
      `實際渲染: "${window.document.getElementById("userName").innerText}"`
    );
    assert(
      "SWR 本機快取率先載入身分標籤至 #userProfileTag",
      window.document.getElementById("userProfileTag").innerText === "快取先行同仁",
      `實際渲染: "${window.document.getElementById("userProfileTag").innerText}"`
    );
  }

  // Test 1.2: Fast-Path In-Memory Decoding (Zero-Delay & Zero Remote Profile Calls)
  {
    console.log("\n[Test 1.2] Fast-Path 零延遲記憶體解碼路徑 (Bypass liff.getProfile)...");
    let getProfileCalls = 0;
    const fastDecoded = {
      sub: "U_FAST_PATH_USER",
      name: "快解碼高效率同仁",
      picture: "https://example.com/fast_avatar.jpg"
    };

    const dom = setupLiffDOM({
      isLoggedIn: () => true,
      getIDToken: () => "valid_fast_jwt_header.body.signature",
      getDecodedIDToken: () => fastDecoded,
      getProfile: async () => {
        getProfileCalls++;
        return { userId: "U_SHOULD_NOT_CALL", displayName: "慢速網路同仁", pictureUrl: "" };
      }
    });

    const { window } = dom;
    await new Promise(r => setTimeout(r, 80));

    assert(
      "Fast-Path 成功從 getDecodedIDToken 即時注入姓名至 #userName",
      window.document.getElementById("userName").innerText === "快解碼高效率同仁",
      `實際渲染: "${window.document.getElementById("userName").innerText}"`
    );
    assert(
      "Fast-Path 成功從 getDecodedIDToken 即時注入身分標籤至 #userProfileTag",
      window.document.getElementById("userProfileTag").innerText === "快解碼高效率同仁",
      `實際渲染: "${window.document.getElementById("userProfileTag").innerText}"`
    );
    assert(
      "Fast-Path 成功從 getDecodedIDToken 即時注入頭像網址至 #userAvatar",
      window.document.getElementById("userAvatar").src === "https://example.com/fast_avatar.jpg",
      `實際網址: "${window.document.getElementById("userAvatar").src}"`
    );
    assert(
      "Fast-Path 成功執行且 100% 繞過跨網 getProfile 請求 (Calls = 0)",
      getProfileCalls === 0,
      `實際呼叫次數: ${getProfileCalls}`
    );
  }

  // Test 1.3: Graceful Fallback to getProfile when getDecodedIDToken unavailable or throws
  {
    console.log("\n[Test 1.3] 優雅降級回退機制 (Fallback to getProfile when decode unavailable)...");
    let fallbackCalls = 0;
    const dom = setupLiffDOM({
      isLoggedIn: () => true,
      getIDToken: () => "mock_token",
      getDecodedIDToken: () => {
        throw new Error("SDK does not support decoded token or token malformed");
      },
      getProfile: async () => {
        fallbackCalls++;
        return {
          userId: "U_FALLBACK_USER_888",
          displayName: "平穩降級同仁",
          pictureUrl: "https://example.com/fallback_avatar.jpg"
        };
      }
    });

    const { window } = dom;
    await new Promise(r => setTimeout(r, 80));

    assert(
      "getDecodedIDToken 拋出異常時自動回退呼叫 liff.getProfile (Calls = 1)",
      fallbackCalls === 1,
      `實際呼叫次數: ${fallbackCalls}`
    );
    assert(
      "降級流程依然成功注入同仁姓名至 #userName",
      window.document.getElementById("userName").innerText === "平穩降級同仁",
      `實際渲染: "${window.document.getElementById("userName").innerText}"`
    );
    assert(
      "降級流程依然成功注入同仁頭像至 #userAvatar",
      window.document.getElementById("userAvatar").src === "https://example.com/fallback_avatar.jpg",
      `實際網址: "${window.document.getElementById("userAvatar").src}"`
    );
  }
}

// -----------------------------------------------------------------------------
// Part 2 & Part 3: Live Workers API & D1 Sandbox Verification (Item 7 & Item 8)
// -----------------------------------------------------------------------------
async function runD1AndApiTests() {
  console.log("\n================================================================================");
  console.log("🔹 PART 2: D1 Sandbox - 固定班預設班表一鍵實體化 (Item 7.1)");
  console.log("================================================================================");
  console.log(`🏢 TEST TAX ID: ${TEST_TAX_ID} (QA Sandbox)`);
  console.log(`🏢 TEST COMPANY ID: ${TEST_COMPANY_ID}`);
  console.log(`👤 FIXED USER ID: ${FIXED_USER_ID}`);
  console.log(`👤 SHIFT USER ID: ${SHIFT_USER_ID}`);
  console.log(`📅 GEN MONTH: ${TEST_GEN_MONTH} (30 days)`);
  console.log(`📅 AUTOSEED MONTH: ${TEST_AUTOSEED_MONTH} (31 days)\n`);

  let adminApiKey = "";
  let readOnlyApiKey = "";

  try {
    // Step 0: Provision Tenant API Keys (Admin + ReadOnly)
    console.log("[Step 0] 簽發測試租戶專屬 M2M API Keys...");
    const adminKeyResp = await fetch(`${WORKER_URL}/api/v1/tenant/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tax_id: TEST_TAX_ID, name: "B3 測試管理員金鑰", role: "ADMIN" })
    });
    assert("簽發租戶 ADMIN 金鑰 HTTP 200", adminKeyResp.status === 200);
    const adminKeyData = await adminKeyResp.json();
    adminApiKey = adminKeyData.apiKey;
    assert("ADMIN 金鑰格式正確", !!adminApiKey && adminApiKey.startsWith(`pk_live_${TEST_TAX_ID}_`));

    const roKeyResp = await fetch(`${WORKER_URL}/api/v1/tenant/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tax_id: TEST_TAX_ID, name: "B3 唯讀審計金鑰", role: "READ_ONLY" })
    });
    assert("簽發租戶 READ_ONLY 金鑰 HTTP 200", roKeyResp.status === 200);
    const roKeyData = await roKeyResp.json();
    readOnlyApiKey = roKeyData.apiKey;
    assert("READ_ONLY 金鑰格式正確", !!readOnlyApiKey && readOnlyApiKey.startsWith(`pk_live_${TEST_TAX_ID}_`));

    // Step 1: Seed Employees in D1 (1 FIXED, 1 SHIFT)
    console.log("\n[Step 1] 在 D1 company_employees 建立測試同仁資料 (FIXED 與 SHIFT)...");
    await queryD1(`
      INSERT INTO company_employees (
        company_id, line_user_id, employee_name, schedule_mode, default_shift_start, default_shift_end, default_break_minutes
      ) VALUES 
        ('${TEST_COMPANY_ID}', '${FIXED_USER_ID}', '固定班測試員', 'FIXED', '09:30', '18:30', 60),
        ('${TEST_COMPANY_ID}', '${SHIFT_USER_ID}', '排班制測試員', 'SHIFT', '10:00', '19:00', 60);
    `);
    assert("D1 建立測試同仁成功", true);

    // Pre-seed 1 custom schedule for FIXED_USER on 2026-11-10 (Tuesday)
    console.log("[Step 1.1] 預先塞入 1 筆特定日自訂特休假 (2026-11-10)...");
    await queryD1(`
      INSERT INTO employee_schedules (
        company_id, line_user_id, work_date, shift_name, shift_start, shift_end, break_minutes, is_rest_day, is_cross_day, created_at, updated_at
      ) VALUES (
        '${TEST_COMPANY_ID}', '${FIXED_USER_ID}', '${TEST_GEN_MONTH}-10', '特休假', NULL, NULL, 0, 1, 0, datetime('now', '+8 hours'), datetime('now', '+8 hours')
      );
    `);
    assert("預先塞入自訂特休假成功", true);

    // -------------------------------------------------------------------------
    // Test 2: PBAC & One-Click Generation (POST /api/v1/tenant/schedules/generate)
    // -------------------------------------------------------------------------
    console.log("\n--- 2. 後台一鍵生成端點權限阻擋與功能驗證 ---");

    // 2.1 Unauthenticated Request
    const unauthResp = await fetch(`${WORKER_URL}/api/v1/tenant/schedules/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: TEST_GEN_MONTH })
    });
    assert("未認證請求被阻斷 (401 Unauthorized)", unauthResp.status === 401);

    // 2.2 Insufficient Role (READ_ONLY trying to generate)
    const roGenResp = await fetch(`${WORKER_URL}/api/v1/tenant/schedules/generate`, {
      method: "POST",
      headers: { "X-Tenant-Key": readOnlyApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ month: TEST_GEN_MONTH })
    });
    assert("非 ADMIN 角色被阻斷 (403 Forbidden)", roGenResp.status === 403);

    // 2.3 Invalid Month Parameter
    const badMonthResp = await fetch(`${WORKER_URL}/api/v1/tenant/schedules/generate`, {
      method: "POST",
      headers: { "X-Tenant-Key": adminApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ month: "2026-13" })
    });
    assert("非法月份 (2026-13) 被穩健拒絕 (500/400)", badMonthResp.status >= 400);

    // 2.4 Valid Generation Execution
    console.log(`\n[Test 2.4] 管理員執行 ${TEST_GEN_MONTH} 月份固定班排班生成...`);
    const genResp = await fetch(`${WORKER_URL}/api/v1/tenant/schedules/generate`, {
      method: "POST",
      headers: { "X-Tenant-Key": adminApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ month: TEST_GEN_MONTH })
    });
    assert("一鍵生成請求 HTTP 200 OK", genResp.status === 200);
    const genData = await genResp.json();
    assert("一鍵生成回傳 success: true", genData.success === true);
    assert(
      "一鍵生成新建立筆數為 29 筆 (30 天扣除已存在之 10 號特休假)",
      genData.createdCount === 29,
      `實際 createdCount: ${genData.createdCount}`
    );
    assert(
      "一鍵生成受影響員工數為 1 位固定班同仁",
      genData.employeeCount === 1,
      `實際 employeeCount: ${genData.employeeCount}`
    );

    // 2.5 Idempotency: Repeating Generation Causes 0 Overwrites
    console.log(`\n[Test 2.5] 重複執行相同月份生成，驗證防覆蓋與冪等性 (INSERT OR IGNORE)...`);
    const repeatGenResp = await fetch(`${WORKER_URL}/api/v1/tenant/schedules/generate`, {
      method: "POST",
      headers: { "X-Tenant-Key": adminApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ month: TEST_GEN_MONTH })
    });
    const repeatGenData = await repeatGenResp.json();
    assert("重複生成回傳 success: true", repeatGenData.success === true);
    assert(
      "重複生成新寫入筆數嚴格為 0 (冪等防重)",
      repeatGenData.createdCount === 0,
      `實際 createdCount: ${repeatGenData.createdCount}`
    );

    // 2.6 Physical D1 Data Verification for FIXED & SHIFT Employees
    console.log(`\n[Test 2.6] 查詢 D1 物理資料庫，檢驗班表細部欄位與邊界隔離...`);
    const fixedRows = await queryD1(`
      SELECT work_date, shift_name, shift_start, shift_end, break_minutes, is_rest_day
      FROM employee_schedules
      WHERE line_user_id = '${FIXED_USER_ID}' AND work_date LIKE '${TEST_GEN_MONTH}%'
      ORDER BY work_date ASC;
    `);

    assert(
      "D1 中固定班同仁當月實體排班完整存在 30 筆",
      fixedRows.length === 30,
      `實際筆數: ${fixedRows.length}`
    );

    // Verify day 10 custom schedule was NOT overwritten
    const day10 = fixedRows.find(r => r.work_date === `${TEST_GEN_MONTH}-10`);
    assert(
      "預先排定之 11/10 保持特休假且未被常態班覆蓋",
      day10 && day10.shift_name === "特休假" && day10.is_rest_day === 1,
      `實際排班: ${day10?.shift_name}, is_rest_day: ${day10?.is_rest_day}`
    );

    // Verify weekday (e.g. 2026-11-02 Monday)
    const day2 = fixedRows.find(r => r.work_date === `${TEST_GEN_MONTH}-02`);
    assert(
      "平日常態班 (11/02 週一) 時間為 09:30-18:30，非休假",
      day2 && day2.shift_name === "常態班" && day2.shift_start === "09:30" && day2.shift_end === "18:30" && day2.is_rest_day === 0,
      `實際: ${day2?.shift_name} ${day2?.shift_start}-${day2?.shift_end} is_rest_day:${day2?.is_rest_day}`
    );

    // Verify weekend (e.g. 2026-11-01 Sunday)
    const day1 = fixedRows.find(r => r.work_date === `${TEST_GEN_MONTH}-01`);
    assert(
      "週末例假 (11/01 週日) 為例假 (is_rest_day = 1)",
      day1 && day1.shift_name === "例假" && day1.shift_start === null && day1.is_rest_day === 1,
      `實際: ${day1?.shift_name} is_rest_day:${day1?.is_rest_day}`
    );

    // Verify SHIFT employee has 0 schedules in 2026-11 (Strictly isolated!)
    const shiftGenResult = await queryD1(`
      SELECT COUNT(*) as count FROM employee_schedules
      WHERE line_user_id = '${SHIFT_USER_ID}' AND work_date LIKE '${TEST_GEN_MONTH}%';
    `);
    const shiftCount = shiftGenResult?.[0]?.count ?? -1;
    assert(
      "排班制 (SHIFT) 同仁絕對不被固定班生成影響 (D1 維持 0 筆)",
      shiftCount === 0,
      `實際筆數: ${shiftCount}`
    );

    // -------------------------------------------------------------------------
    // Part 3: Auto-Seed on Monthly Attendance Query (Item 7.2)
    // -------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("🔹 PART 3: 同仁端查詢月曆時自動批次實體化 (Item 7.2 Auto-Seed on Query)");
    console.log("================================================================================");

    // 3.1 Pre-check: Verify 2026-12 currently has 0 rows for both FIXED and SHIFT
    console.log(`[Step 3.1] 確認 ${TEST_AUTOSEED_MONTH} 目前在 D1 尚無任何排班...`);
    const preCheckRes = await queryD1(`
      SELECT COUNT(*) as count FROM employee_schedules
      WHERE line_user_id IN ('${FIXED_USER_ID}', '${SHIFT_USER_ID}') AND work_date LIKE '${TEST_AUTOSEED_MONTH}%';
    `);
    const preCount = preCheckRes?.[0]?.count ?? -1;
    assert("初始狀態兩名同仁當月排班皆為 0 筆", preCount === 0, `當前排班數: ${preCount}`);

    // 3.2 Query Monthly Attendance for FIXED Employee -> Triggers Auto-Seed
    console.log(`\n[Test 3.2] 固定班同仁查詢 ${TEST_AUTOSEED_MONTH} 月曆，觸發 Auto-Seed...`);
    const fixedCalResp = await fetch(`${WORKER_URL}/api/v1/attendance/monthly?userId=${FIXED_USER_ID}&month=${TEST_AUTOSEED_MONTH}`);
    assert("月曆查詢請求 HTTP 200 OK", fixedCalResp.status === 200);
    const fixedCalData = await fixedCalResp.json();
    assert("月曆資料 success: true", fixedCalData.success === true);
    assert(
      "12 月份包含完整 31 天",
      fixedCalData.days && fixedCalData.days.length === 31,
      `回傳天數: ${fixedCalData.days?.length}`
    );

    // Assert days are materialized in response
    const dec01 = fixedCalData.days.find(d => d.date === `${TEST_AUTOSEED_MONTH}-01`); // Tuesday
    const dec06 = fixedCalData.days.find(d => d.date === `${TEST_AUTOSEED_MONTH}-06`); // Sunday
    assert(
      "平日 (12/01 週二) 自動實體化為常態班待出勤 (SCHEDULED)",
      dec01 && dec01.status === "SCHEDULED" && dec01.shiftName === "常態班" && dec01.shiftStart === "09:30" && dec01.shiftEnd === "18:30",
      `實際狀態: ${dec01?.status}, 班別: ${dec01?.shiftName}`
    );
    assert(
      "週末 (12/06 週日) 自動實體化為休假 (REST_DAY)",
      dec06 && dec06.status === "REST_DAY" && dec06.shiftName === "例假" && dec06.isRestDay === true,
      `實際狀態: ${dec06?.status}, 班別: ${dec06?.shiftName}`
    );

    const unscheduledCountForFixed = fixedCalData.days.filter(d => d.status === "UNSCHEDULED").length;
    assert(
      "固定班同仁當月無任何未排班 (UNSCHEDULED 天數 = 0)",
      unscheduledCountForFixed === 0,
      `實際 UNSCHEDULED 天數: ${unscheduledCountForFixed}`
    );

    // 3.3 Direct D1 Assertion: Auto-Seed was physically inserted into D1!
    console.log(`\n[Test 3.3] 直接查詢 D1 資料庫，斷言 Auto-Seed 已物理落庫...`);
    const autoSeedD1Res = await queryD1(`
      SELECT COUNT(*) as count FROM employee_schedules
      WHERE line_user_id = '${FIXED_USER_ID}' AND work_date LIKE '${TEST_AUTOSEED_MONTH}%';
    `);
    const autoSeedCount = autoSeedD1Res?.[0]?.count ?? -1;
    assert(
      "D1 中固定班同仁當月 31 筆排班確實物理落庫 (非暫態視圖)",
      autoSeedCount === 31,
      `實際 D1 筆數: ${autoSeedCount}`
    );

    // 3.4 Negative Test: SHIFT Employee Query MUST NOT Auto-Seed
    console.log(`\n[Test 3.4] 排班制 (SHIFT) 同仁查詢 ${TEST_AUTOSEED_MONTH} 月曆，驗證嚴格不觸發 Auto-Seed...`);
    const shiftCalResp = await fetch(`${WORKER_URL}/api/v1/attendance/monthly?userId=${SHIFT_USER_ID}&month=${TEST_AUTOSEED_MONTH}`);
    assert("排班制月曆查詢 HTTP 200 OK", shiftCalResp.status === 200);
    const shiftCalData = await shiftCalResp.json();
    const unscheduledCountForShift = shiftCalData.days.filter(d => d.status === "UNSCHEDULED").length;
    assert(
      "排班制同仁在無班表時，所有 31 天必須維持透明未排班 (UNSCHEDULED = 31)",
      unscheduledCountForShift === 31,
      `實際 UNSCHEDULED 天數: ${unscheduledCountForShift}`
    );

    // Direct D1 Assertion: SHIFT employee still has 0 rows in D1
    const shiftAutoSeedRes = await queryD1(`
      SELECT COUNT(*) as count FROM employee_schedules
      WHERE line_user_id = '${SHIFT_USER_ID}' AND work_date LIKE '${TEST_AUTOSEED_MONTH}%';
    `);
    const shiftD1Count = shiftAutoSeedRes?.[0]?.count ?? -1;
    assert(
      "D1 中排班制同仁依然嚴格維持 0 筆排班 (未被污染)",
      shiftD1Count === 0,
      `實際 D1 筆數: ${shiftD1Count}`
    );

    // -------------------------------------------------------------------------
    // Part 4: Backend ID Token Anti-Spoofing & Handling Defense (Item 8.2)
    // -------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("🔹 PART 4: 後端 ID Token 身分防呆與健全性防護 (Item 8.2)");
    console.log("================================================================================");

    // 4.1 Malformed / Forged ID Token in Approval Request
    console.log("\n[Test 4.1] 線上簽核傳入偽造或異常 ID Token 防呆驗證...");
    const badTokenApprResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: "MALFORMED_FAKE_FORGED_JWT_TOKEN",
        type: "LEAVE",
        targetDate: "2026-11-20",
        details: { leaveType: "事假", hours: 8, start: "09:30", end: "18:30" }
      })
    });
    assert(
      "偽造 ID Token 且無有效身分備援時被拒絕 (401 Unauthorized / Handled)",
      badTokenApprResp.status === 401 || badTokenApprResp.status === 400,
      `實際 HTTP Status: ${badTokenApprResp.status}`
    );

    // 4.2 Malformed ID Token in Checkin Punch
    console.log("\n[Test 4.2] 考勤打卡傳入偽造或異常 ID Token 防呆驗證...");
    const badTokenPunchResp = await fetch(`${WORKER_URL}/api/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: "MALFORMED_FAKE_PUNCH_TOKEN",
        deviceId: "test_dev_001",
        latitude: 24.157722,
        longitude: 120.683167,
        companyId: TEST_COMPANY_ID
      })
    });
    assert(
      "打卡傳入偽造 ID Token 被安全攔截 (401 Unauthorized)",
      badTokenPunchResp.status === 401,
      `實際 HTTP Status: ${badTokenPunchResp.status}`
    );

  } finally {
    // -------------------------------------------------------------------------
    // Part 5: Mandatory Teardown Hook
    // -------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("🧹 PART 5: 強制執行自動化資料庫清理 (Mandatory Teardown Hook)");
    console.log("================================================================================");
    try {
      await queryD1(`
        DELETE FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}';
        DELETE FROM employee_schedules WHERE line_user_id IN ('${FIXED_USER_ID}', '${SHIFT_USER_ID}');
        DELETE FROM company_employees WHERE line_user_id IN ('${FIXED_USER_ID}', '${SHIFT_USER_ID}');
        DELETE FROM checkin_records WHERE line_user_id IN ('${FIXED_USER_ID}', '${SHIFT_USER_ID}');
        DELETE FROM approvals WHERE line_user_id IN ('${FIXED_USER_ID}', '${SHIFT_USER_ID}');
      `);
      assert("清理 D1 測試同仁、排班、金鑰與所有測試資料成功", true);
      console.log("  🧼 Teardown Hook 執行完畢，Cloudflare D1 生產資料庫已 100% 復原。");
    } catch (cleanErr) {
      console.error("  ❌ Teardown 執行異常:", cleanErr);
    }
  }
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 STARTING AUTOMATED TEST SUITE: BATCH 3 VERIFICATION");
  console.log("   (Fixed Schedules Materialization & ID Token Fast-Path Injection)");
  console.log("================================================================================");

  // 1. Run Client-side JSDOM tests
  await runPart1ClientTests();

  // 2. Run D1 Sandbox & Live API tests
  await runD1AndApiTests();

  console.log("\n================================================================================");
  console.log(`📊 BATCH 3 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error(`\n❌ TEST SUITE FAILED: ${failed} assertions failed.`);
    process.exit(1);
  } else {
    console.log(`\n🎉 ALL ${passed} ASSERTIONS PASSED WITH ZERO FAILURES!`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});
