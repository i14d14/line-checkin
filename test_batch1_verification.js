/**
 * Automated Verification Suite: Batch 1 (Online Approvals & Anti-Impersonation)
 * Corresponds to AUTONOMOUS_VERIFICATION_ROADMAP.md (Batch 1)
 * 
 * Verifies without Playwright:
 * 1. Client-Side Form DOM Lifecycle & Button Lock/Unlock (JSDOM - Tier 3)
 *    - Validates handleApprSubmit exposed on window (no ReferenceError)
 *    - Validates button disabled during submission flight (debounce)
 *    - Validates finally block guarantees button re-enabled on error
 *    - Validates form validation and alert display
 * 2. Anti-Impersonation Protection (Tier 3 & Tier 4)
 *    - Impostor Webhook postback blocked
 *    - Approval status strictly preserved as PENDING
 *    - Zero attendance or schedule side-effects
 * 3. Business Linking Automation (Tier 4 - D1)
 *    - Legitimate manager approve CORRECTION -> checkin_records APPROVED_OVERRIDE
 *    - Legitimate manager approve LEAVE -> employee_schedules is_rest_day = 1
 *    - Approval status APPROVED with decided_at timestamp
 *    - Idempotency prevents duplicate side-effects
 * 4. Mandatory Teardown: 100% Cleanup in finally hook
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

// Unique test entities
const TEST_COMPANY_ID = `24549210-B1TEST-${TIMESTAMP.toString().slice(-4)}`;
const TEST_EMP_LINE_ID = `U_B1_EMP_${TIMESTAMP}`;
const TEST_MGR_LINE_ID = `U_B1_MGR_${TIMESTAMP}`;
const TEST_IMPOSTOR_ID = `U_B1_IMPOSTOR_${TIMESTAMP}`;

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
  const tempFileName = `temp_b1_${Date.now()}_${Math.floor(Math.random() * 1000)}.sql`;
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

async function sendWebhookPostback(userId, approvalId, action) {
  const res = await fetch(`${WORKER_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "postback",
          replyToken: "b1_test_reply_token",
          source: { userId },
          postback: {
            data: `action=${action}&id=${approvalId}`
          }
        }
      ]
    })
  });
  return await res.json();
}

// -----------------------------------------------------------------------------
// Dimension 1: JSDOM Client Form & Button Lifecycle Verification
// -----------------------------------------------------------------------------
async function verifyClientFormDOM() {
  console.log("\n================================================================================");
  console.log("🧪 PART 1: LIFF 簽核入口按鈕鎖定與 DOM 生命週期 (Tier 3 - JSDOM)");
  console.log("================================================================================");

  const html = `
  <!DOCTYPE html>
  <html>
  <body>
    <div id="tabSwitcher"></div>
    <div id="userName"></div>
    <div id="userProfileTag"></div>
    <div id="companyTag"></div>
    <div id="displayCompanyId"></div>
    <div id="displayDevice"></div>
    <div id="userAvatar"></div>
    <div id="calendarMonthInput"></div>
    <div id="calendarDaysGrid"></div>
    <div id="myApprovalsList"></div>

    <section id="view-approvals">
      <button type="button" id="typeBtn-LEAVE"></button>
      <button type="button" id="typeBtn-CORRECTION"></button>
      <button type="button" id="typeBtn-OVERTIME"></button>

      <form id="apprForm">
        <input type="date" id="apprTargetDate" value="2026-09-15" />
        <div id="leavePunchNotice" class="hidden"><span id="leavePunchNoticeText"></span></div>
        <div id="fields-LEAVE">
          <select id="apprLeaveType"><option value="事假">事假</option></select>
          <select id="apprLeaveTime"><option value="全天">全天</option></select>
        </div>
        <div id="fields-CORRECTION" class="hidden">
          <select id="apprCorrectionPunchType"><option value="IN">上班卡</option></select>
          <input type="time" id="apprCorrectionTime" value="09:00" />
        </div>
        <div id="fields-OVERTIME" class="hidden">
          <input type="number" id="apprOtHours" value="1" />
          <input type="text" id="apprOtTime" value="下班後" />
        </div>
        <input type="text" id="apprReason" value="測試請假事由" />
        <div id="apprAlert" class="hidden"></div>
        <button type="submit" id="apprSubmitBtn">
          <span id="apprSubmitBtnText">送出申請</span>
        </button>
      </form>
    </section>
  </body>
  </html>
  `;

  const dom = new JSDOM(html, {
    url: "https://liff.line.me/2011328810-vjUUBSYA?cid=24549210-01",
    runScripts: "dangerously"
  });

  const { window } = dom;

  // Polyfill localStorage & window properties
  window.localStorage.setItem("line_checkin_user_profile", JSON.stringify({
    userId: "U_TEST_CLIENT_USER",
    displayName: "測試同仁",
    companyId: "24549210-01",
    permissions: ["punch", "apply"],
    isEnrolled: true
  }));

  window.liff = {
    init: async () => {},
    isLoggedIn: () => true,
    getProfile: async () => ({ userId: "U_TEST_CLIENT_USER", displayName: "測試同仁" }),
    getIDToken: () => "mock_id_token",
    getDecodedIDToken: () => ({ sub: "U_TEST_CLIENT_USER", name: "測試同仁" }),
    getFriendship: async () => ({ friendFlag: true })
  };

  // Load compiled client bundle
  const clientJsPath = path.resolve(__dirname, "src/views/liff/liff.client.js");
  const clientJsCode = fs.readFileSync(clientJsPath, "utf8");
  window.eval(clientJsCode);

  // 1.1 Expose Check
  assert("handleApprSubmit 已成功掛載於 window 物件", typeof window.handleApprSubmit === "function");
  assert("onApprDateChange 已成功掛載於 window 物件", typeof window.onApprDateChange === "function");

  const btn = window.document.getElementById("apprSubmitBtn");
  const btnText = window.document.getElementById("apprSubmitBtnText");
  const alertBox = window.document.getElementById("apprAlert");
  const reasonInput = window.document.getElementById("apprReason");
  const targetDateInput = window.document.getElementById("apprTargetDate");

  // 1.2 Happy Path Submission
  let fetchCallCount = 0;
  let fetchBodySent = null;
  window.fetch = async (url, opts) => {
    fetchCallCount++;
    if (opts && opts.body) {
      fetchBodySent = JSON.parse(opts.body);
    }
    // Simulate flight latency: verify button is disabled during submit
    assert("提交過程中送出按鈕處於鎖定狀態 (btn.disabled === true)", btn.disabled === true);
    assert("提交過程中按鈕文字切換為提示字串", btnText.innerText.includes("傳送申請中"));
    return {
      status: 200,
      json: async () => ({ success: true, message: "申請單據已即時送達主管" })
    };
  };

  await window.handleApprSubmit({ preventDefault: () => {} });

  assert("成功送出後按鈕自動解除鎖定 (btn.disabled === false)", btn.disabled === false);
  assert("成功送出後按鈕文字恢復【送出申請】", btnText.innerText === "送出申請");
  assert("成功送出後事由輸入框自動清空", reasonInput.value === "");
  assert("成功送出後顯示綠色成功提示框", alertBox.className.includes("bg-emerald-50") && alertBox.innerHTML.includes("申請成功"));
  assert("發送之請求體包含正確的申請日期與事由", fetchBodySent?.targetDate === "2026-09-15" && fetchBodySent?.type === "LEAVE");

  // 1.3 Failure / Network Exception Path (Verify finally block resilience)
  window.fetch = async () => {
    throw new Error("網路連線超時");
  };

  await window.handleApprSubmit({ preventDefault: () => {} });

  assert("發生網路異常時 finally 區塊保證解除按鈕鎖定 (btn.disabled === false)", btn.disabled === false);
  assert("發生網路異常時按鈕文字保證恢復【送出申請】", btnText.innerText === "送出申請");
  assert("發生異常時顯示紅色錯誤提示方塊", alertBox.className.includes("bg-red-50") && alertBox.innerHTML.includes("網路連線超時"));

  // 1.4 Form Validation Path (Empty target date)
  targetDateInput.value = "";
  await window.handleApprSubmit({ preventDefault: () => {} });
  assert("缺少日期時立即阻斷且按鈕保持可用", btn.disabled === false && btnText.innerText === "送出申請");
  assert("缺少日期時顯示請選擇申請涉及日期提示", alertBox.innerHTML.includes("請選擇申請涉及日期"));
  targetDateInput.value = "2026-09-15"; // restore

  // 1.5 Debounce / Multiple click protection
  let duplicateFetchCount = 0;
  window.fetch = async () => {
    duplicateFetchCount++;
    return { status: 200, json: async () => ({ success: true }) };
  };
  btn.disabled = true; // simulate already locked
  await window.handleApprSubmit({ preventDefault: () => {} });
  assert("當按鈕已鎖定時重複點擊被防呆阻斷 (Debounce 0 重複 Fetch)", duplicateFetchCount === 0);
  btn.disabled = false;
}

// -----------------------------------------------------------------------------
// Dimension 2 & 3: Anti-Impersonation & Backend Business Linking (Tier 4 - D1)
// -----------------------------------------------------------------------------
async function verifyBackendAndD1() {
  console.log("\n================================================================================");
  console.log("🛡️ PART 2: 嚴格身分防冒審 ＆ 核准業務自動連動 (Tier 3 & Tier 4 - D1)");
  console.log("================================================================================");

  // Admin login to obtain Session Token for audit/records query
  const loginResp = await fetch(`${WORKER_URL}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Admin@24549210" })
  });
  const loginData = await loginResp.json();
  assert("管理員登入獲取 Session 200 OK", loginResp.status === 200 && loginData.success === true);
  const authHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${loginData.token}` };

  // 2.1 Setup Fixtures in D1
  console.log("  [Setup] 注入測試據點與員工主管關聯...");
  const setupSql = `
    INSERT INTO locations (id, name, address, target_lat, target_lon, allowed_radius, manager_line_id)
    VALUES ('${TEST_COMPANY_ID}', 'Batch 1 簽核測試門市', '台中市北區美德街56-11號', 24.156, 120.683, 150, '${TEST_MGR_LINE_ID}');

    INSERT INTO company_employees (company_id, line_user_id, employee_name, approver_line_id, permissions)
    VALUES ('${TEST_COMPANY_ID}', '${TEST_EMP_LINE_ID}', '簽核測試員', '${TEST_MGR_LINE_ID}', '["punch","apply"]');
  `;
  const setupOk = await runD1Sql(setupSql);
  assert("測試據點與員工資料初始化完成", setupOk);

  // Helper to query approvals for test employee
  async function getEmployeeApprovals() {
    const res = await fetch(`${WORKER_URL}/api/v1/approval/my?userId=${TEST_EMP_LINE_ID}`);
    const data = await res.json();
    return data.approvals || [];
  }

  // 2.2 Submit a Correction Request (補卡)
  console.log("\n--- 2.2 提交補卡申請單據 ---");
  const corrResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fallbackUserId: TEST_EMP_LINE_ID,
      fallbackDisplayName: "簽核測試員",
      fallbackCompanyId: TEST_COMPANY_ID,
      type: "CORRECTION",
      targetDate: "2026-09-10",
      details: {
        punch_type: "IN",
        time: "08:45:00",
        reason: "門禁感應器異常"
      }
    })
  });
  const corrData = await corrResp.json();
  assert("補卡申請送出成功 200 OK", corrResp.status === 200 && corrData.success === true);
  assert("單據狀態為 PENDING", corrData.status === "PENDING");
  assert("指派主管精準比對為 TEST_MGR", corrData.approverLineId === TEST_MGR_LINE_ID);
  const corrApprId = corrData.id;

  // 2.3 Anti-Impersonation: Impostor attempts to approve
  console.log("\n--- 2.3 資安負向注入：非指定審核人冒審攔截 ---");
  const impostorReply = await sendWebhookPostback(TEST_IMPOSTOR_ID, corrApprId, "approve");
  assert("Webhook 接收冒審事件回傳 200 OK", impostorReply?.success === true);

  // Verify state via API: Approval status MUST remain PENDING
  const apprsAfterImpostor = await getEmployeeApprovals();
  const corrAfterImpostor = apprsAfterImpostor.find(a => a.id === corrApprId);
  assert("冒審後單據狀態嚴格維持 PENDING", corrAfterImpostor && corrAfterImpostor.status === "PENDING");
  assert("冒審後單據 decided_at 保持未決定 (null)", !corrAfterImpostor?.decided_at);

  // Verify zero attendance records injected
  const recResp1 = await fetch(
    `${WORKER_URL}/api/v1/tenant/records?startDate=2026-09-10&endDate=2026-09-10`,
    { headers: authHeaders }
  );
  const recData1 = await recResp1.json();
  const punches1 = recData1.records?.filter(r => r.line_user_id === TEST_EMP_LINE_ID) || [];
  assert("冒審操作絕無產生任何出勤打卡流水", punches1.length === 0);

  // 2.4 Legitimate Manager Approves Correction (補卡核准連動)
  console.log("\n--- 2.4 合法主管核准補卡：不可變流水 APPROVED_OVERRIDE 寫入驗證 ---");
  const legitCorrReply = await sendWebhookPostback(TEST_MGR_LINE_ID, corrApprId, "approve");
  assert("Webhook 接收主管核准事件回傳 200 OK", legitCorrReply?.success === true);

  const apprsAfterApprove = await getEmployeeApprovals();
  const corrApproved = apprsAfterApprove.find(a => a.id === corrApprId);
  assert("主管核准後單據狀態變更為 APPROVED", corrApproved && corrApproved.status === "APPROVED");
  assert("主管核准後記錄 decided_at 時間戳記", !!corrApproved?.decided_at);

  const recResp2 = await fetch(
    `${WORKER_URL}/api/v1/tenant/records?startDate=2026-09-10&endDate=2026-09-10`,
    { headers: authHeaders }
  );
  const recData2 = await recResp2.json();
  const punches2 = recData2.records?.filter(r => r.line_user_id === TEST_EMP_LINE_ID && r.verify_mode === "APPROVED_OVERRIDE") || [];
  assert("D1 打卡表成功寫入一筆 APPROVED_OVERRIDE 出勤紀錄", punches2.length === 1);
  assert("補卡類型正確紀錄為上班卡 (IN)", punches2[0]?.punch_type === "IN");
  assert("補卡時間戳記精準為指定之 2026-09-10 08:45:00", punches2[0]?.created_at === "2026-09-10 08:45:00");
  assert("補卡打卡狀態標記為 SUCCESS", punches2[0]?.status === "SUCCESS");

  // 2.5 Submit & Approve Leave Request (請假班表連動)
  console.log("\n--- 2.5 提交並核准請假：班表 is_rest_day = 1 自動連動驗證 ---");
  const leaveResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fallbackUserId: TEST_EMP_LINE_ID,
      fallbackDisplayName: "簽核測試員",
      fallbackCompanyId: TEST_COMPANY_ID,
      type: "LEAVE",
      targetDate: "2026-09-25",
      details: {
        leave_type: "特休",
        time_range: "全天",
        reason: "家庭旅遊"
      }
    })
  });
  const leaveData = await leaveResp.json();
  assert("請假申請送出成功 200 OK", leaveResp.status === 200 && leaveData.success === true);
  const leaveApprId = leaveData.id;

  await sendWebhookPostback(TEST_MGR_LINE_ID, leaveApprId, "approve");

  const apprsAfterLeave = await getEmployeeApprovals();
  const leaveApproved = apprsAfterLeave.find(a => a.id === leaveApprId);
  assert("請假單據狀態已更新為 APPROVED", leaveApproved && leaveApproved.status === "APPROVED");

  const schedResp = await fetch(
    `${WORKER_URL}/api/v1/tenant/schedules?month=2026-09&userId=${TEST_EMP_LINE_ID}`,
    { headers: authHeaders }
  );
  const schedData = await schedResp.json();
  const sched = schedData.schedules?.find(s => s.work_date === "2026-09-25");
  assert("D1 排班表自動寫入/更新為休假日 (is_rest_day = 1)", sched && sched.is_rest_day === 1);
  assert("排班表班別名稱標記為請假項目", sched && sched.shift_name.includes("請假 (特休)"));

  // 2.6 Idempotency Lock Check
  console.log("\n--- 2.6 防重複審批防呆 (Idempotency) ---");
  const beforeCount = punches2.length;
  await sendWebhookPostback(TEST_MGR_LINE_ID, corrApprId, "approve");

  const recResp3 = await fetch(
    `${WORKER_URL}/api/v1/tenant/records?startDate=2026-09-10&endDate=2026-09-10`,
    { headers: authHeaders }
  );
  const recData3 = await recResp3.json();
  const punches3 = recData3.records?.filter(r => r.line_user_id === TEST_EMP_LINE_ID && r.verify_mode === "APPROVED_OVERRIDE") || [];
  assert("重複發送核准不會產生重複之出勤流水", punches3.length === beforeCount);
}

// -----------------------------------------------------------------------------
// Dimension 4: Mandatory Teardown Hook
// -----------------------------------------------------------------------------
async function teardown() {
  console.log("\n================================================================================");
  console.log("🧹 PART 3: 環境自動清理 (Mandatory Teardown Hook)");
  console.log("================================================================================");

  const cleanupSql = `
    DELETE FROM approvals WHERE company_id = '${TEST_COMPANY_ID}' OR line_user_id = '${TEST_EMP_LINE_ID}';
    DELETE FROM checkin_records WHERE company_id = '${TEST_COMPANY_ID}' OR line_user_id = '${TEST_EMP_LINE_ID}';
    DELETE FROM employee_schedules WHERE company_id = '${TEST_COMPANY_ID}' OR line_user_id = '${TEST_EMP_LINE_ID}';
    DELETE FROM company_employees WHERE company_id = '${TEST_COMPANY_ID}' OR line_user_id = '${TEST_EMP_LINE_ID}';
    DELETE FROM locations WHERE id = '${TEST_COMPANY_ID}';
  `;
  const cleanOk = await runD1Sql(cleanupSql);
  assert("D1 測試門市、申請單、出勤流水與排班數據 100% 清理完成", cleanOk);
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 BATCH 1 自主驗證測試啟動 (Online Approvals & Anti-Impersonation)");
  console.log(`🌐 WORKER: ${WORKER_URL}`);
  console.log(`🏢 TEST COMPANY: ${TEST_COMPANY_ID}`);
  console.log("================================================================================");

  try {
    await verifyClientFormDOM();
    await verifyBackendAndD1();
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
