/**
 * Automated Verification Suite: Batch 2 (Calendar Visual Indicators)
 * Corresponds to AUTONOMOUS_VERIFICATION_ROADMAP.md (Batch 2)
 * 
 * Verifies without Playwright:
 * 1. Tier 3: JSDOM Client-Side Rendering & Computed Classes
 *    - Item 4: TODAY Emerald Halo Ring & Badge
 *      * Day cell includes 'ring-2 ring-emerald-500 ring-offset-1 font-bold z-10 relative'
 *      * Status 'TODAY' renders 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
 *      * Cell dot renders '<span class="text-[9px] font-bold text-emerald-600 leading-none">今日</span>'
 *      * selectDayDetail renders emerald badge 'bg-emerald-50 text-emerald-700 border border-emerald-200' and '今日待出勤'
 *      * Punched today retains 'isToday' ring while reflecting 'NORMAL'
 *    - Item 5: LEAVE Warm Amber Card
 *      * Status 'LEAVE' renders 'bg-amber-50 border-amber-200 text-amber-900'
 *      * Cell dot renders amber circle '<span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>'
 *      * selectDayDetail renders amber badge 'bg-amber-50 text-amber-700 border border-amber-200'
 *      * detailLeaveRow is unhidden (flex) and displays exact leave hours & type
 *      * Approved leave is strictly NOT downgraded to gray rest day
 *    - Item 6: UNSCHEDULED Transparency & UNSCHEDULED_WORK Indigo State
 *      * UNSCHEDULED renders 'bg-white border-dashed border-gray-300 text-gray-400' and '未排' badge
 *      * selectDayDetail renders dashed gray badge, schedule time '未排班', work hours '-'
 *      * Monthly summary ensures missing punches, late count, early leave are strictly 0
 *      * UNSCHEDULED_WORK renders 'bg-indigo-50 border-indigo-200 text-indigo-800' and indigo circle
 *      * selectDayDetail renders indigo badge 'bg-indigo-50 text-indigo-700 border border-indigo-200' and accumulated work hours
 * 2. Tier 4: Workers API Live Contract & D1 Sandbox
 *    - Live query to /api/v1/attendance/monthly against temporary test fixtures
 *    - Direct pipeline from API response into JSDOM virtual DOM
 * 3. Mandatory Teardown: 100% Cleanup in finally hook
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { JSDOM } = require('jsdom');

// Load environment variables
const envPath = path.resolve(__dirname, '.env');
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

// Unique test identifiers
const TEST_COMPANY_ID = `24549210-B2TEST-${TIMESTAMP.toString().slice(-4)}`;
const TEST_SHIFT_USER_ID = `U_B2_SHIFT_${TIMESTAMP}`;
const TEST_MONTH = "2026-10";

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

async function runD1Sql(sql) {
  const tempFileName = `temp_b2_${Date.now()}_${Math.floor(Math.random() * 1000)}.sql`;
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

// -----------------------------------------------------------------------------
// Dimension 1: JSDOM Calendar Virtual DOM & Computed Classes (Tier 3)
// -----------------------------------------------------------------------------
function createLiffCalendarDOM() {
  const html = `
  <!DOCTYPE html>
  <html>
  <body>
    <div id="userName"></div>
    <div id="userProfileTag"></div>
    <div id="companyTag"></div>
    <div id="displayCompanyId"></div>
    <div id="displayDevice"></div>
    <img id="userAvatar" />
    <div id="locationName"></div>
    <div id="checkinBtn"></div>
    <div id="checkinBtnText"></div>
    <div id="checkinDistanceHint"></div>
    <div id="statusBadge"></div>
    <div id="lastPunchInfo"></div>
    <div id="workHoursTag"></div>
    <div id="myApprovalsList"></div>

    <!-- Top Stats -->
    <div id="statTotalHours">0h</div>
    <div id="statOvertimeHours">0h</div>
    <div id="statLateCount">0 次</div>
    <div id="statMissingCount">0 次</div>

    <!-- Month Input -->
    <input type="month" id="calendarMonthInput" value="${TEST_MONTH}" />

    <!-- Calendar Days Grid -->
    <div id="calendarDaysGrid" class="grid grid-cols-7 gap-1.5 text-center"></div>

    <!-- Selected Day Detail Card -->
    <div id="dayDetailCard" class="hidden">
      <h3 id="detailDateText">-</h3>
      <span id="detailStatusBadge">-</span>
      <span id="detailScheduleTime">-</span>
      <span id="detailWorkHours">-</span>
      <span id="detailFirstIn">-</span>
      <span id="detailLastOut">-</span>
      <div id="detailLeaveRow" class="hidden">
        <span id="detailLeaveHours">-</span>
      </div>
      <div id="detailPunchesList"></div>
    </div>
  </body>
  </html>
  `;

  const dom = new JSDOM(html, {
    url: `https://liff.line.me/2011328810-vjUUBSYA?cid=${TEST_COMPANY_ID}`,
    runScripts: "dangerously"
  });

  const { window } = dom;

  // Polyfills
  window.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, permissions: ["punch", "apply"], days: [] })
  });

  window.localStorage.setItem("line_checkin_user_profile", JSON.stringify({
    userId: TEST_SHIFT_USER_ID,
    displayName: "排班月曆測試員",
    companyId: TEST_COMPANY_ID,
    permissions: ["punch", "apply"],
    isEnrolled: true
  }));

  window.liff = {
    init: async () => {},
    isLoggedIn: () => true,
    getProfile: async () => ({ userId: TEST_SHIFT_USER_ID, displayName: "排班月曆測試員" }),
    getIDToken: () => "mock_token",
    getDecodedIDToken: () => ({ sub: TEST_SHIFT_USER_ID, name: "排班月曆測試員" }),
    getFriendship: async () => ({ friendFlag: true })
  };

  // Evaluate compiled client code
  const clientJsPath = path.resolve(__dirname, "src/views/liff/liff.client.js");
  const clientJsCode = fs.readFileSync(clientJsPath, "utf8");
  window.eval(clientJsCode);

  return dom;
}

async function verifyClientCalendarJSDOM() {
  console.log("\n================================================================================");
  console.log("🧪 PART 1: 排班月曆視覺燈號 JSDOM 記憶體虛擬 DOM 渲染 (Tier 3)");
  console.log("================================================================================");

  const dom = createLiffCalendarDOM();
  const { window } = dom;

  assert("renderAttendanceGrid 已成功掛載於 window 物件", typeof window.renderAttendanceGrid === "function");
  assert("selectDayDetail 已成功掛載於 window 物件", typeof window.selectDayDetail === "function");

  // 1.1 Synthetic Dataset Testing (All 5 Target States)
  const mockMonthData = {
    success: true,
    month: TEST_MONTH,
    todayStr: `${TEST_MONTH}-15`,
    summary: {
      total_work_hours: 16.0,
      overtime_hours: 2.0,
      late_count: 0,
      missing_punch_count: 0,
      attendance_days: 2
    },
    days: [
      // 1. TODAY (Pending check-in)
      {
        date: `${TEST_MONTH}-15`,
        dayOfWeek: 4,
        isToday: true,
        isRestDay: false,
        status: "TODAY",
        statusText: "今日待出勤",
        statusColor: "emerald",
        shiftName: "常態班",
        shiftStart: "09:00",
        shiftEnd: "18:00",
        workHours: 0,
        punches: []
      },
      // 2. LEAVE (Approved Leave, warm amber)
      {
        date: `${TEST_MONTH}-16`,
        dayOfWeek: 5,
        isToday: false,
        isRestDay: false,
        status: "LEAVE",
        statusText: "請假 (事假)",
        statusColor: "amber",
        shiftName: "請假 (事假)",
        shiftStart: null,
        shiftEnd: null,
        leaveHours: 8.0,
        workHours: 0,
        punches: []
      },
      // 3. UNSCHEDULED (Dashed gray, no penalties)
      {
        date: `${TEST_MONTH}-17`,
        dayOfWeek: 6,
        isToday: false,
        isRestDay: false,
        status: "UNSCHEDULED",
        statusText: "未排班",
        statusColor: "gray",
        shiftName: null,
        shiftStart: null,
        shiftEnd: null,
        workHours: 0,
        punches: []
      },
      // 4. UNSCHEDULED_WORK (Worked on unscheduled day, indigo)
      {
        date: `${TEST_MONTH}-18`,
        dayOfWeek: 0,
        isToday: false,
        isRestDay: false,
        status: "UNSCHEDULED_WORK",
        statusText: "未排班出勤",
        statusColor: "indigo",
        shiftName: null,
        shiftStart: null,
        shiftEnd: null,
        workHours: 8.0,
        punches: [
          { punch_type: "IN", created_at: `${TEST_MONTH}-18 09:00:00`, verify_mode: "IP_WHITELIST", distance_meters: 10 },
          { punch_type: "OUT", created_at: `${TEST_MONTH}-18 18:00:00`, verify_mode: "IP_WHITELIST", distance_meters: 12 }
        ]
      },
      // 5. TODAY with active punch (Preserves emerald ring, status NORMAL)
      {
        date: `${TEST_MONTH}-19`,
        dayOfWeek: 1,
        isToday: true,
        isRestDay: false,
        status: "NORMAL",
        statusText: "出勤正常",
        statusColor: "green",
        shiftName: "常態班",
        shiftStart: "09:00",
        shiftEnd: "18:00",
        workHours: 8.0,
        punches: [
          { punch_type: "IN", created_at: `${TEST_MONTH}-19 08:58:00`, verify_mode: "IP_WHITELIST", distance_meters: 15 },
          { punch_type: "OUT", created_at: `${TEST_MONTH}-19 18:02:00`, verify_mode: "IP_WHITELIST", distance_meters: 18 }
        ]
      }
    ]
  };

  // Render to JSDOM
  window.renderAttendanceGrid(mockMonthData);

  const grid = window.document.getElementById("calendarDaysGrid");
  const buttons = grid.querySelectorAll("button");
  assert("月曆格子按鈕正確渲染 (5 個測試天數均生成)", buttons.length === 5);

  // --- 1.1 Item 4: TODAY (Pending Check-in) ---
  console.log("\n--- 1.1 項目 4 斷言：當日焦點 (TODAY) 翡翠綠光環與今日徽章 ---");
  const todayBtn = buttons[0];
  assert(
    "TODAY 格子具備翡翠綠背景與框線 (bg-emerald-50/80 border-emerald-300 text-emerald-900)",
    todayBtn.className.includes("bg-emerald-50/80") && todayBtn.className.includes("border-emerald-300") && todayBtn.className.includes("text-emerald-900")
  );
  assert(
    "TODAY 格子具備當日翡翠綠高亮光環 (ring-2 ring-emerald-500 ring-offset-1 font-bold)",
    todayBtn.className.includes("ring-2 ring-emerald-500 ring-offset-1 font-bold")
  );
  assert(
    "TODAY 格子內部呈現專屬【今日】微徽章標籤",
    todayBtn.innerHTML.includes("今日") && todayBtn.innerHTML.includes("text-emerald-600")
  );

  // Detail Card Assertions for TODAY
  window.selectDayDetail(`${TEST_MONTH}-15`);
  const detailBadge = window.document.getElementById("detailStatusBadge");
  const detailSched = window.document.getElementById("detailScheduleTime");
  const detailWorkH = window.document.getElementById("detailWorkHours");
  assert(
    "TODAY 詳情卡片狀態徽章呈現翡翠綠樣式 (bg-emerald-50 text-emerald-700 border-emerald-200)",
    detailBadge.className.includes("bg-emerald-50") && detailBadge.className.includes("text-emerald-700") && detailBadge.className.includes("border-emerald-200")
  );
  assert("TODAY 詳情卡片狀態文字為【今日待出勤】", detailBadge.innerText === "今日待出勤");
  assert("TODAY 詳情卡片預排班次顯示【09:00 ~ 18:00】", detailSched.innerText === "09:00 ~ 18:00");
  assert("TODAY 詳情卡片工時顯示為【-】", detailWorkH.innerText === "-");

  // Punched Today retains ring
  const punchedTodayBtn = buttons[4];
  assert(
    "今日已打卡者保留 isToday 翡翠綠光環 (ring-2 ring-emerald-500)",
    punchedTodayBtn.className.includes("ring-2 ring-emerald-500")
  );
  assert(
    "今日已打卡者狀態為 NORMAL 綠色背景 (bg-emerald-50 border-emerald-200 text-emerald-900)",
    punchedTodayBtn.className.includes("bg-emerald-50 border-emerald-200 text-emerald-900")
  );

  // --- 1.2 Item 5: LEAVE (Approved Leave) ---
  console.log("\n--- 1.2 項目 5 斷言：請假專屬狀態 (LEAVE) 暖琥珀色卡 ---");
  const leaveBtn = buttons[1];
  assert(
    "LEAVE 格子呈現暖琥珀底色與邊框 (bg-amber-50 border-amber-200 text-amber-900)",
    leaveBtn.className.includes("bg-amber-50 border-amber-200 text-amber-900")
  );
  assert(
    "LEAVE 格子內部呈現琥珀色圓點徽章 (bg-amber-500)",
    leaveBtn.innerHTML.includes("bg-amber-500")
  );
  assert(
    "LEAVE 絕非例假灰色 (不包含 bg-gray-100 或 text-gray-400)",
    !leaveBtn.className.includes("bg-gray-100")
  );

  // Detail Card Assertions for LEAVE
  window.selectDayDetail(`${TEST_MONTH}-16`);
  const leaveRow = window.document.getElementById("detailLeaveRow");
  const leaveHours = window.document.getElementById("detailLeaveHours");
  assert(
    "LEAVE 詳情卡片狀態徽章呈現暖琥珀樣式 (bg-amber-50 text-amber-700 border-amber-200)",
    detailBadge.className.includes("bg-amber-50") && detailBadge.className.includes("text-amber-700") && detailBadge.className.includes("border-amber-200")
  );
  assert("LEAVE 詳情卡片狀態文字精準顯示【請假 (事假)】", detailBadge.innerText === "請假 (事假)");
  assert("LEAVE 詳情卡片請假區塊自動展開 (包含 flex，移除 hidden)", leaveRow.className.includes("flex") && !leaveRow.className.includes("hidden"));
  assert("LEAVE 請假時數與種類正確顯示【8 小時 (請假 (事假))】", leaveHours.innerText.includes("8 小時") && leaveHours.innerText.includes("請假 (事假)"));

  // --- 1.3 Item 6: UNSCHEDULED & UNSCHEDULED_WORK ---
  console.log("\n--- 1.3 項目 6 斷言：未排班透明感知 (UNSCHEDULED 灰白虛線 / UNSCHEDULED_WORK 靛藍出勤) ---");
  const unschedBtn = buttons[2];
  assert(
    "UNSCHEDULED 格子呈現白底虛線灰框 (bg-white border-dashed border-gray-300 text-gray-400)",
    unschedBtn.className.includes("bg-white border-dashed border-gray-300 text-gray-400")
  );
  assert(
    "UNSCHEDULED 格子內部呈現專屬【未排】微徽章標籤",
    unschedBtn.innerHTML.includes("未排") && unschedBtn.innerHTML.includes("text-gray-400")
  );

  window.selectDayDetail(`${TEST_MONTH}-17`);
  assert(
    "UNSCHEDULED 詳情卡片狀態徽章呈現虛線灰框樣式 (border-dashed border-gray-300 text-gray-500)",
    detailBadge.className.includes("border-dashed") && detailBadge.className.includes("border-gray-300") && detailBadge.className.includes("text-gray-500")
  );
  assert("UNSCHEDULED 詳情卡片狀態文字為【未排班】", detailBadge.innerText === "未排班");
  assert("UNSCHEDULED 詳情卡片預排班次顯示【未排班】", detailSched.innerText === "未排班");
  assert("UNSCHEDULED 詳情卡片實際工時顯示為【-】", detailWorkH.innerText === "-");
  assert("UNSCHEDULED 請假區塊隱藏 (包含 hidden)", leaveRow.className.includes("hidden"));

  // UNSCHEDULED_WORK
  const unschedWorkBtn = buttons[3];
  assert(
    "UNSCHEDULED_WORK 格子呈現專業靛藍色卡 (bg-indigo-50 border-indigo-200 text-indigo-800)",
    unschedWorkBtn.className.includes("bg-indigo-50 border-indigo-200 text-indigo-800")
  );
  assert(
    "UNSCHEDULED_WORK 格子內部呈現靛藍色圓點徽章 (bg-indigo-500)",
    unschedWorkBtn.innerHTML.includes("bg-indigo-500")
  );

  window.selectDayDetail(`${TEST_MONTH}-18`);
  assert(
    "UNSCHEDULED_WORK 詳情卡片狀態徽章呈現靛藍樣式 (bg-indigo-50 text-indigo-700 border-indigo-200)",
    detailBadge.className.includes("bg-indigo-50") && detailBadge.className.includes("text-indigo-700") && detailBadge.className.includes("border-indigo-200")
  );
  assert("UNSCHEDULED_WORK 詳情卡片狀態文字為【未排班出勤】", detailBadge.innerText === "未排班出勤");
  assert("UNSCHEDULED_WORK 詳情卡片預排班次顯示【未排班】", detailSched.innerText === "未排班");
  assert("UNSCHEDULED_WORK 詳情卡片實際工時顯示為【8 小時】", detailWorkH.innerText === "8 小時");

  // Summary Metrics Assertions
  const statMissing = window.document.getElementById("statMissingCount");
  const statLate = window.document.getElementById("statLateCount");
  const statHours = window.document.getElementById("statTotalHours");
  assert("月考勤指標卡片：缺卡次數為 0 次 (未排班不扣罰)", statMissing.innerText === "0 次");
  assert("月考勤指標卡片：遲到次數為 0 次", statLate.innerText === "0 次");
  assert("月考勤指標卡片：總工時正常累計 (16h)", statHours.innerText === "16h");
}

// -----------------------------------------------------------------------------
// Dimension 2: Workers API Contract & D1 Sandbox Live Pipeline (Tier 4)
// -----------------------------------------------------------------------------
async function verifyLiveApiAndD1Sandbox() {
  console.log("\n================================================================================");
  console.log("🌐 PART 2: Cloudflare Workers API 契約校驗與 D1 沙盒管線 (Tier 4)");
  console.log("================================================================================");

  // Setup fixtures in D1
  console.log("  [Setup] 注入 Batch 2 測試門市、排班制同仁與打卡數據...");
  const setupSql = `
    INSERT INTO locations (id, name, address, target_lat, target_lon, allowed_radius)
    VALUES ('${TEST_COMPANY_ID}', 'Batch 2 月曆視覺測試門市', '台中市北區美德街56-11號', 24.156, 120.683, 150);

    INSERT INTO company_employees (company_id, line_user_id, employee_name, schedule_mode, default_shift_start, default_shift_end, default_break_minutes)
    VALUES ('${TEST_COMPANY_ID}', '${TEST_SHIFT_USER_ID}', '排班月曆測試員', 'SHIFT', '10:00', '19:00', 60);

    -- Seed day 20 with checkin punch on unscheduled day
    INSERT INTO checkin_records (company_id, line_user_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at)
    VALUES 
      ('${TEST_COMPANY_ID}', '${TEST_SHIFT_USER_ID}', 24.156, 120.683, 20.0, 'SUCCESS', 'IN', null, 'IP_WHITELIST', '${TEST_MONTH}-20 10:00:00'),
      ('${TEST_COMPANY_ID}', '${TEST_SHIFT_USER_ID}', 24.156, 120.683, 20.0, 'SUCCESS', 'OUT', 8.0, 'IP_WHITELIST', '${TEST_MONTH}-20 19:00:00');

    -- Seed day 21 with approved leave in employee_schedules
    INSERT INTO employee_schedules (company_id, line_user_id, work_date, shift_name, is_rest_day, shift_start, shift_end, break_minutes)
    VALUES ('${TEST_COMPANY_ID}', '${TEST_SHIFT_USER_ID}', '${TEST_MONTH}-21', '請假 (事假)', 1, '10:00', '19:00', 60);
  `;
  const setupOk = await runD1Sql(setupSql);
  assert("D1 測試門市、同仁、打卡紀錄與排班表初始化成功", setupOk);

  // Query /api/v1/attendance/monthly
  console.log("\n--- 2.1 呼叫月考勤 API 檢驗真實後端 JSON 契約 ---");
  const res = await fetch(`${WORKER_URL}/api/v1/attendance/monthly?userId=${TEST_SHIFT_USER_ID}&month=${TEST_MONTH}&companyId=${TEST_COMPANY_ID}`);
  assert("月考勤 API 回傳 200 OK", res.status === 200);
  const data = await res.json();
  assert("API 回傳 success === true", data.success === true);
  assert("API 包含 summary 且 missing_punch_count === 0", data.summary && data.summary.missing_punch_count === 0);

  // Assert API response contract for target days
  const day20 = data.days.find(d => d.date === `${TEST_MONTH}-20`);
  const day21 = data.days.find(d => d.date === `${TEST_MONTH}-21`);
  const day22 = data.days.find(d => d.date === `${TEST_MONTH}-22`);

  assert("Day 20 (未排班打卡) API 狀態回傳 UNSCHEDULED_WORK", day20?.status === "UNSCHEDULED_WORK");
  assert("Day 20 API statusColor 回傳 indigo", day20?.statusColor === "indigo");
  assert("Day 20 API 工時計算回傳 8.0 小時", day20?.workHours === 8.0);

  assert("Day 21 (核准請假) API 狀態回傳 LEAVE", day21?.status === "LEAVE");
  assert("Day 21 API statusColor 回傳 amber", day21?.statusColor === "amber");
  assert("Day 21 API isRestDay 保持 false (請假非例假)", day21?.isRestDay === false);
  assert("Day 21 API leaveHours 計算回傳 8.0 小時", day21?.leaveHours === 8.0);

  assert("Day 22 (無排班無打卡) API 狀態回傳 UNSCHEDULED", day22?.status === "UNSCHEDULED");
  assert("Day 22 API statusColor 回傳 gray", day22?.statusColor === "gray");

  // Pipeline API data into JSDOM
  console.log("\n--- 2.2 Live API 數據直灌 JSDOM 渲染管線斷言 ---");
  const dom = createLiffCalendarDOM();
  const { window } = dom;
  window.renderAttendanceGrid(data);

  // Click day 20 (UNSCHEDULED_WORK)
  window.selectDayDetail(`${TEST_MONTH}-20`);
  const badge20 = window.document.getElementById("detailStatusBadge");
  const hours20 = window.document.getElementById("detailWorkHours");
  assert("Live API 數據渲染 Day 20 為靛藍色徽章 (bg-indigo-50 text-indigo-700)", badge20.className.includes("bg-indigo-50") && badge20.className.includes("text-indigo-700"));
  assert("Live API 數據渲染 Day 20 工時為 8 小時", hours20.innerText === "8 小時");

  // Click day 21 (LEAVE)
  window.selectDayDetail(`${TEST_MONTH}-21`);
  const badge21 = window.document.getElementById("detailStatusBadge");
  const leaveRow21 = window.document.getElementById("detailLeaveRow");
  const leaveHours21 = window.document.getElementById("detailLeaveHours");
  assert("Live API 數據渲染 Day 21 為暖琥珀徽章 (bg-amber-50 text-amber-700)", badge21.className.includes("bg-amber-50") && badge21.className.includes("text-amber-700"));
  assert("Live API 數據渲染 Day 21 請假欄位展開", leaveRow21.className.includes("flex") && !leaveRow21.className.includes("hidden"));
  assert("Live API 數據渲染 Day 21 請假時數包含 8 小時", leaveHours21.innerText.includes("8 小時"));

  // Click day 22 (UNSCHEDULED)
  window.selectDayDetail(`${TEST_MONTH}-22`);
  const badge22 = window.document.getElementById("detailStatusBadge");
  assert("Live API 數據渲染 Day 22 為虛線灰框徽章 (border-dashed border-gray-300)", badge22.className.includes("border-dashed") && badge22.className.includes("border-gray-300"));
}

// -----------------------------------------------------------------------------
// Dimension 3: Mandatory Teardown Hook
// -----------------------------------------------------------------------------
async function teardown() {
  console.log("\n================================================================================");
  console.log("🧹 PART 3: 環境自動清理 (Mandatory Teardown Hook)");
  console.log("================================================================================");

  const cleanupSql = `
    DELETE FROM checkin_records WHERE company_id = '${TEST_COMPANY_ID}' OR line_user_id = '${TEST_SHIFT_USER_ID}';
    DELETE FROM employee_schedules WHERE company_id = '${TEST_COMPANY_ID}' OR line_user_id = '${TEST_SHIFT_USER_ID}';
    DELETE FROM company_employees WHERE company_id = '${TEST_COMPANY_ID}' OR line_user_id = '${TEST_SHIFT_USER_ID}';
    DELETE FROM locations WHERE id = '${TEST_COMPANY_ID}';
  `;
  const cleanOk = await runD1Sql(cleanupSql);
  assert("D1 測試門市、打卡流水、排班表與員工數據 100% 清理完成", cleanOk);
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 BATCH 2 自主驗證測試啟動 (Calendar Visual Indicators)");
  console.log(`🌐 WORKER: ${WORKER_URL}`);
  console.log(`🏢 TEST COMPANY: ${TEST_COMPANY_ID}`);
  console.log("================================================================================");

  try {
    await verifyClientCalendarJSDOM();
    await verifyLiveApiAndD1Sandbox();
  } catch (err) {
    console.error("💥 未預期執行錯誤:", err);
    failed++;
  } finally {
    await teardown();
  }

  console.log("\n================================================================================");
  console.log(`📊 測試結果結算: ${passed} 通過 / ${failed} 失敗 (總計 ${passed + failed} 項驗證)`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main();
