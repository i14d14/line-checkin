/**
 * Automated Test Suite: In-Chat BPM Approval Workflow (v2.0.0 / Schema v9)
 * 100% Native Edge API & Webhook End-to-End Integration Tests
 * 
 * Verifies:
 * 1. UI rendering (LIFF & Admin Portal approvals tabs)
 * 2. Admin API direct approver assignment (POST /api/v1/tenant/employees/:id/approver)
 * 3. Employee request submission & routing priority (Direct Approver > Location Fallback Manager > Error)
 * 4. Employee query own requests (GET /api/v1/approval/my)
 * 5. Webhook security check (unauthorized clicks blocked)
 * 6. Webhook approve for CORRECTION -> checkin_records inserted with APPROVED_OVERRIDE
 * 7. Webhook approve for LEAVE -> employee_schedules marked with is_rest_day = 1
 * 8. Idempotency check (cannot re-process already decided requests)
 * 9. Webhook reject -> status REJECTED with zero attendance side-effects
 * 10. Tenant admin query approvals (GET /api/v1/tenant/approvals)
 */

const fs = require('fs');
const path = require('path');

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

// Test Entities
const TEST_EMP_1 = `U_BPM_EMP_DIRECT_${TIMESTAMP}`;
const TEST_EMP_2 = `U_BPM_EMP_FALLBACK_${TIMESTAMP}`;
const TEST_EMP_3 = `U_BPM_EMP_NO_MGR_${TIMESTAMP}`;
const TEST_MGR_DIRECT = `U_BPM_MGR_DIR_${TIMESTAMP}`;
const TEST_MGR_FALLBACK = `U_BPM_MGR_FB_${TIMESTAMP}`;
const TEST_STRANGER = `U_BPM_STRANGER_${TIMESTAMP}`;
const TEST_LOC_ID = `24549210-BPM-${TIMESTAMP.toString().slice(-4)}`;

async function sendWebhookPostback(userId, approvalId, action) {
  const res = await fetch(`${WORKER_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "postback",
          replyToken: "bpm_test_reply_token",
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

async function runTests() {
  console.log("================================================================================");
  console.log("🚀 STARTING AUTOMATED TEST: IN-CHAT BPM APPROVAL WORKFLOW (v2.0.0 / Schema v9)");
  console.log(`🌐 TARGET WORKER: ${WORKER_URL}`);
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

  // 1. UI Verification
  console.log("--- 1. 前端 UI 簽核入口與後台分頁驗證 ---");
  const liffResp = await fetch(`${WORKER_URL}/checkin`);
  const liffHtml = await liffResp.text();
  assert("LIFF 頁面 200 OK", liffResp.status === 200);
  assert("LIFF 導覽列包含【線上簽核】分頁 (nav-approvals)", liffHtml.includes("nav-approvals") && liffHtml.includes("線上簽核"));
  assert("LIFF 包含簽核申請表單 (view-approvals)", liffHtml.includes("view-approvals") && liffHtml.includes("apprForm"));

  const adminResp = await fetch(`${WORKER_URL}/admin`);
  const adminHtml = await adminResp.text();
  assert("地端管理後台包含【電子簽核審批】分頁 (tabBtn-approvals)", adminHtml.includes("tabBtn-approvals") && adminHtml.includes("電子簽核審批"));
  assert("地端管理後台包含主管指派視窗 (assignApproverModal)", adminHtml.includes("assignApproverModal") && adminHtml.includes("指派員工直屬審核主管"));

  // 2. Admin Login
  console.log("\n--- 2. 管理員登入與 Session 獲取 ---");
  const loginResp = await fetch(`${WORKER_URL}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Admin@24549210" })
  });
  const loginData = await loginResp.json();
  assert("管理員登入 200 OK", loginResp.status === 200 && loginData.success === true);
  const sessionToken = loginData.token;
  const authHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${sessionToken}` };

  // 3. Location Setup with Fallback Manager
  console.log("\n--- 3. 建立含有預設店長 LINE ID 之門市據點 ---");
  const locResp = await fetch(`${WORKER_URL}/api/v1/tenant/locations`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      id: TEST_LOC_ID,
      name: "豬毛科技 - 簽核測試旗艦店",
      address: "台中市北區三民路三段129號",
      allowed_radius: 200,
      manager_line_id: TEST_MGR_FALLBACK
    })
  });
  const locData = await locResp.json();
  assert("門市據點設定成功 (含 manager_line_id)", locResp.status === 200 && locData.success === true);
  assert("回傳資料包含 manager_line_id", locData.location.manager_line_id === TEST_MGR_FALLBACK);

  // 4. Direct Approver Binding via Admin API
  console.log("\n--- 4. 管理者後台為員工指派直屬審查主管 ---");
  const unauthBind = await fetch(`${WORKER_URL}/api/v1/tenant/employees/${TEST_EMP_1}/approver`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approverLineId: TEST_MGR_DIRECT })
  });
  assert("未授權指派主管回傳 401 Unauthorized", unauthBind.status === 401);

  const authBind = await fetch(`${WORKER_URL}/api/v1/tenant/employees/${TEST_EMP_1}/approver`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      employeeName: "直屬測試員工",
      companyId: TEST_LOC_ID,
      approverLineId: TEST_MGR_DIRECT
    })
  });
  const bindData = await authBind.json();
  assert("授權指派直屬主管 200 OK", authBind.status === 200 && bindData.success === true);

  // Bind Emp 2 to the location via checkin or fallbackCompanyId
  // 5. Submit Leave Request -> Route to Direct Approver
  console.log("\n--- 5. 員工提交請假申請（直屬主管優先判定） ---");
  const leaveResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fallbackUserId: TEST_EMP_1,
      fallbackDisplayName: "王小明",
      fallbackCompanyId: TEST_LOC_ID,
      type: "LEAVE",
      targetDate: "2026-09-15",
      details: {
        leave_type: "特休",
        time_range: "全天 (09:00 - 18:00)",
        reason: "出國旅遊"
      }
    })
  });
  const leaveData = await leaveResp.json();
  assert("請假申請送出成功 200 OK", leaveResp.status === 200 && leaveData.success === true);
  assert("審批單據狀態為 PENDING", leaveData.status === "PENDING");
  assert("精準路由至員工直屬主管", leaveData.approverLineId === TEST_MGR_DIRECT);
  const leaveApprId = leaveData.id;

  // 6. Submit Correction Request -> Fallback to Location Manager
  console.log("\n--- 6. 員工提交補卡申請（無直屬主管時自動兜底至店長） ---");
  const correctionResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fallbackUserId: TEST_EMP_2,
      fallbackDisplayName: "李小華",
      fallbackCompanyId: TEST_LOC_ID,
      type: "CORRECTION",
      targetDate: "2026-09-10",
      details: {
        punch_type: "IN",
        time: "08:58:00",
        reason: "門口打卡機維護"
      }
    })
  });
  const corrData = await correctionResp.json();
  assert("補卡申請送出成功 200 OK", correctionResp.status === 200 && corrData.success === true);
  assert("審批單據自動兜底至門市店長", corrData.approverLineId === TEST_MGR_FALLBACK);
  const corrApprId = corrData.id;

  // 7. Submit Request with No Approver and No Location Manager
  console.log("\n--- 7. 無法識別任何主管時之防呆防護 ---");
  const noMgrResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fallbackUserId: TEST_EMP_3,
      fallbackDisplayName: "孤兒同仁",
      type: "LEAVE",
      targetDate: "2026-09-20",
      details: { reason: "生病" }
    })
  });
  const noMgrData = await noMgrResp.json();
  assert("無任何主管時回傳 400 Bad Request", noMgrResp.status === 400 && noMgrData.success === false);
  assert("回傳明確導引提示訊息", noMgrData.error && noMgrData.error.includes("尚未設定您的直屬審查主管"));

  // 8. Query My Approvals
  console.log("\n--- 8. 員工查詢個人申請進度與紀錄 ---");
  const myApprResp = await fetch(`${WORKER_URL}/api/v1/approval/my?userId=${TEST_EMP_1}`);
  const myApprData = await myApprResp.json();
  assert("個人紀錄查詢 200 OK", myApprResp.status === 200 && myApprData.success === true);
  assert("清單包含剛才提交之請假申請", myApprData.approvals.some(a => a.id === leaveApprId));

  // 9. Webhook Security: Stranger tries to approve
  console.log("\n--- 9. 資安防護：非指定主管點擊核准被強制攔截 ---");
  await sendWebhookPostback(TEST_STRANGER, corrApprId, "approve");
  const checkStrangerResp = await fetch(`${WORKER_URL}/api/v1/approval/my?userId=${TEST_EMP_2}`);
  const checkStrangerData = await checkStrangerResp.json();
  const strangerAppr = checkStrangerData.approvals.find(a => a.id === corrApprId);
  assert("非指定主管操作後，單據狀態仍保持 PENDING", strangerAppr && strangerAppr.status === "PENDING");

  // 10. Legitimate Approver Approves Correction (補卡)
  console.log("\n--- 10. 合法主管核准補卡申請與出勤流水連動驗證 ---");
  await sendWebhookPostback(TEST_MGR_FALLBACK, corrApprId, "approve");
  const checkCorrResp = await fetch(`${WORKER_URL}/api/v1/approval/my?userId=${TEST_EMP_2}`);
  const checkCorrData = await checkCorrResp.json();
  const approvedCorr = checkCorrData.approvals.find(a => a.id === corrApprId);
  assert("主管核准後單據狀態變更為 APPROVED", approvedCorr && approvedCorr.status === "APPROVED");
  assert("記錄審核時間 decided_at", !!approvedCorr?.decided_at);

  const recResp = await fetch(`${WORKER_URL}/api/v1/tenant/records?startDate=2026-09-10&endDate=2026-09-10`, { headers: authHeaders });
  const recData = await recResp.json();
  const punch = recData.records?.find(r => r.line_user_id === TEST_EMP_2 && r.verify_mode === "APPROVED_OVERRIDE");
  assert("出勤表自動補入一筆 APPROVED_OVERRIDE 流水", !!punch);
  assert("補卡方向為上班卡 (IN)", punch?.punch_type === "IN");
  assert("補卡時間為 2026-09-10 08:58:00", punch?.created_at === "2026-09-10 08:58:00");

  // 11. Legitimate Approver Approves Leave (請假)
  console.log("\n--- 11. 合法主管核准請假申請與排班班表連動驗證 ---");
  await sendWebhookPostback(TEST_MGR_DIRECT, leaveApprId, "approve");
  const checkLeaveResp = await fetch(`${WORKER_URL}/api/v1/approval/my?userId=${TEST_EMP_1}`);
  const checkLeaveData = await checkLeaveResp.json();
  const approvedLeave = checkLeaveData.approvals.find(a => a.id === leaveApprId);
  assert("主管核准後請假單據變更為 APPROVED", approvedLeave && approvedLeave.status === "APPROVED");

  const schedResp = await fetch(`${WORKER_URL}/api/v1/tenant/schedules?month=2026-09&userId=${TEST_EMP_1}`, { headers: authHeaders });
  const schedData = await schedResp.json();
  const sched = schedData.schedules?.find(s => s.work_date === "2026-09-15");
  assert("班表自動標記為休假日 (is_rest_day = 1)", sched && sched.is_rest_day === 1);
  assert("班別名稱標明請假類別", sched && sched.shift_name.includes("請假 (特休)"));

  // 12. Idempotency Check
  console.log("\n--- 12. 防重複審批防呆 (Idempotency) ---");
  const countBeforeResp = await fetch(`${WORKER_URL}/api/v1/tenant/records?startDate=2026-09-10&endDate=2026-09-10`, { headers: authHeaders });
  const countBeforeData = await countBeforeResp.json();
  const beforeCount = countBeforeData.records?.filter(r => r.line_user_id === TEST_EMP_2).length || 0;

  await sendWebhookPostback(TEST_MGR_FALLBACK, corrApprId, "approve");

  const countAfterResp = await fetch(`${WORKER_URL}/api/v1/tenant/records?startDate=2026-09-10&endDate=2026-09-10`, { headers: authHeaders });
  const countAfterData = await countAfterResp.json();
  const afterCount = countAfterData.records?.filter(r => r.line_user_id === TEST_EMP_2).length || 0;
  assert("重複點擊核准不會產生重複出勤流水", beforeCount === afterCount);

  // 13. Rejection Workflow
  console.log("\n--- 13. 主管駁回申請流程驗證 ---");
  const otResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fallbackUserId: TEST_EMP_1,
      fallbackDisplayName: "王小明",
      fallbackCompanyId: TEST_LOC_ID,
      type: "OVERTIME",
      targetDate: "2026-09-18",
      details: { hours: 3, time_range: "18:00 - 21:00", reason: "大促盤點" }
    })
  });
  const otData = await otResp.json();
  const otApprId = otData.id;

  await sendWebhookPostback(TEST_MGR_DIRECT, otApprId, "reject");

  const checkOtResp = await fetch(`${WORKER_URL}/api/v1/approval/my?userId=${TEST_EMP_1}`);
  const checkOtData = await checkOtResp.json();
  const rejectedOt = checkOtData.approvals.find(a => a.id === otApprId);
  assert("主管駁回後單據狀態變更為 REJECTED", rejectedOt && rejectedOt.status === "REJECTED");
  assert("駁回時記錄審核時間 decided_at", !!rejectedOt?.decided_at);

  const otRecordsResp = await fetch(`${WORKER_URL}/api/v1/tenant/records?startDate=2026-09-18&endDate=2026-09-18`, { headers: authHeaders });
  const otRecordsData = await otRecordsResp.json();
  const otPunch = otRecordsData.records?.filter(r => r.line_user_id === TEST_EMP_1) || [];
  assert("駁回後絕不產生任何額外出勤流水", otPunch.length === 0);

  // 14. Tenant Approvals Query API
  console.log("\n--- 14. 企業後台簽核總覽與篩選 API 驗證 ---");
  const tenantApprResp = await fetch(`${WORKER_URL}/api/v1/tenant/approvals?month=2026-09`, {
    headers: authHeaders
  });
  const tenantApprData = await tenantApprResp.json();
  assert("後台查詢本公司簽核總覽 200 OK", tenantApprResp.status === 200 && tenantApprData.success === true);
  assert("總數大於等於 3 筆", tenantApprData.count >= 3);

  const approvedFilterResp = await fetch(`${WORKER_URL}/api/v1/tenant/approvals?month=2026-09&status=APPROVED`, {
    headers: authHeaders
  });
  const approvedFilterData = await approvedFilterResp.json();
  assert("狀態篩選 (APPROVED) 正確運作", approvedFilterData.approvals.every(a => a.status === "APPROVED"));

  // Summary
  console.log("\n================================================================================");
  console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
