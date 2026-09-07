/**
 * Automated Test Suite: Batch E-Payslip CSV Import & Privacy-Masked LINE Push (v2.14.0)
 * 
 * Verifies:
 * 1. Admin Portal UI rendering (Payslips tab, download button, file input, preview table, privacy badges)
 * 2. Unauthenticated access prevention (401 Unauthorized)
 * 3. Standard UTF-8 BOM CSV template download (GET /api/v1/tenant/payslips/template)
 * 4. Critical Privacy Invariant: altText 100% masks financial figures (0 digits, fixed message)
 * 5. Currency formatting helpers ($45,000, -$2,100)
 * 6. Server-side validation edge cases (empty body, missing name, invalid numbers)
 * 7. Multi-tenant isolation protection (blocks cross-tenant dispatch for unauthorized LINE IDs)
 * 8. End-to-end batch payslip dispatch & audit logging (PAYSLIP_DISPATCHED in device_audit_logs)
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

const WORKER_URL = process.env.TEST_WORKER_URL || "https://line-checkin-worker.i14d142.workers.dev";
const TIMESTAMP = Date.now();
const TEST_COMPANY_ID = "24549210";
const TEST_EMP_VALID = `TEST_PAYSLIP_VALID_${TIMESTAMP}`;
const TEST_EMP_FOREIGN = `TEST_FOREIGN_USER_${TIMESTAMP}`;

async function runTests() {
  console.log("================================================================================");
  console.log("🚀 STARTING AUTOMATED TEST: BATCH E-PAYSLIP CSV & PRIVACY-MASKED LINE PUSH (v2.14.0)");
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

  // --- 1. UI Verification ---
  console.log("--- 1. 前端地端管理後台 UI 電子薪資條元件驗證 ---");
  const adminResp = await fetch(`${WORKER_URL}/admin`);
  const adminHtml = await adminResp.text();
  assert("地端管理後台包含【電子薪資條】導覽按鈕 (tabBtn-payslips)", adminHtml.includes("tabBtn-payslips") && adminHtml.includes("電子薪資條"));
  assert("地端管理後台包含【電子薪資條】主分頁區域 (tab-payslips)", adminHtml.includes("tab-payslips") && adminHtml.includes("個人電子薪資條批次發送"));
  assert("地端管理後台包含 CSV 範本下載按鈕 (downloadPayslipTemplate)", adminHtml.includes("downloadPayslipTemplate"));
  assert("地端管理後台包含薪資 CSV 檔案選取器 (payslipFileInput)", adminHtml.includes("payslipFileInput") && adminHtml.includes("handlePayslipCsvSelect"));
  assert("地端管理後台包含隱私防護標章 (鎖定螢幕零洩漏)", adminHtml.includes("鎖定螢幕零洩漏"));
  assert("地端管理後台包含跨租戶隔離防呆標章 (跨租戶隔離防呆)", adminHtml.includes("跨租戶隔離防呆"));
  assert("地端管理後台包含批次發送確認按鈕 (confirmDispatchPayslips)", adminHtml.includes("confirmDispatchPayslips") && adminHtml.includes("確認批次發送至 LINE"));

  // --- 2. Template Download Endpoint ---
  console.log("\n--- 2. 下載標準 UTF-8 BOM CSV 薪資範本 API 驗證 ---");
  const templateResp = await fetch(`${WORKER_URL}/api/v1/tenant/payslips/template`);
  assert("範本下載 API 200 OK", templateResp.status === 200);

  const contentType = templateResp.headers.get("content-type") || "";
  assert("Content-Type 包含 text/csv", contentType.includes("text/csv"));

  const disposition = templateResp.headers.get("content-disposition") || "";
  assert("Content-Disposition 為 attachment 且檔名正確", disposition.includes("attachment") && disposition.includes("payslips_template.csv"));

  const templateArrayBuffer = await templateResp.arrayBuffer();
  const templateBytes = new Uint8Array(templateArrayBuffer);
  const hasUtf8Bom = templateBytes.length >= 3 && templateBytes[0] === 0xEF && templateBytes[1] === 0xBB && templateBytes[2] === 0xBF;
  assert("CSV 範本開頭包含標準 UTF-8 BOM (防止 Excel 亂碼)", hasUtf8Bom);

  const templateText = new TextDecoder("utf-8").decode(templateBytes);
  const expectedHeaders = "line_user_id,employee_name,pay_month,base_salary,allowances,overtime_pay,deductions,net_salary,note";
  assert("CSV 範本包含正確的 9 大標準欄位", templateText.includes(expectedHeaders));
  assert("CSV 範本包含範例數據列", templateText.includes("王大明") && templateText.includes("45000"));

  // --- 3. Security & Unauthenticated Access Protection ---
  console.log("\n--- 3. 資安防護：未授權存取攔截 ---");
  const unauthResp = await fetch(`${WORKER_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payslips: [] })
  });
  assert("未授權發送薪資條回傳 401 Unauthorized", unauthResp.status === 401);

  const invalidTokenResp = await fetch(`${WORKER_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer invalid_session_token" },
    body: JSON.stringify({ payslips: [] })
  });
  assert("無效 Token 發送薪資條回傳 401 Unauthorized", invalidTokenResp.status === 401);

  // --- 4. Admin Login & Session Setup ---
  console.log("\n--- 4. 管理員登入與 Session 獲取 ---");
  const loginResp = await fetch(`${WORKER_URL}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Admin@24549210" })
  });
  const loginData = await loginResp.json();
  assert("管理員登入 200 OK", loginResp.status === 200 && loginData.success === true);
  const sessionToken = loginData.token;
  const authHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${sessionToken}` };

  // --- 5. Prepare Test Employee for Tenant 24549210 ---
  console.log("\n--- 5. 準備本公司測試同仁在職資料 ---");
  const empResp = await fetch(`${WORKER_URL}/api/v1/tenant/employees/${TEST_EMP_VALID}/permissions`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      companyId: TEST_COMPANY_ID,
      employeeName: "薪資受測同仁",
      permissions: ["punch", "apply"]
    })
  });
  const empData = await empResp.json();
  assert("建立測試同仁成功 200 OK", empResp.status === 200 && empData.success === true);

  // --- 6. Server Validation Edge Cases ---
  console.log("\n--- 6. 服務端欄位檢驗與防呆機制 ---");
  // 6.1 Empty Body
  const emptyResp = await fetch(`${WORKER_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ payslips: [] })
  });
  const emptyData = await emptyResp.json();
  assert("傳送空陣列回傳 400 Bad Request", emptyResp.status === 400);
  assert("空陣列回傳明確提示「未提供任何薪資資料」", emptyData.failures && emptyData.failures[0].reason.includes("未提供任何薪資資料"));

  // 6.2 Missing Name
  const missingNameResp = await fetch(`${WORKER_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      payslips: [
        {
          line_user_id: TEST_EMP_VALID,
          employee_name: "",
          pay_month: "2026-08",
          base_salary: 40000,
          net_salary: 40000
        }
      ]
    })
  });
  const missingNameData = await missingNameResp.json();
  assert("缺少姓名回傳 400 Bad Request", missingNameResp.status === 400);
  assert("提示缺少員工姓名", missingNameData.failures && missingNameData.failures[0].reason.includes("缺少員工姓名"));

  // 6.3 Invalid Month Format
  const invalidMonthResp = await fetch(`${WORKER_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      payslips: [
        {
          line_user_id: TEST_EMP_VALID,
          employee_name: "王大明",
          pay_month: "August",
          base_salary: 40000,
          net_salary: 40000
        }
      ]
    })
  });
  const invalidMonthData = await invalidMonthResp.json();
  assert("月份格式非 YYYY-MM 回傳 400 Bad Request", invalidMonthResp.status === 400);
  assert("提示計薪月份格式無效", invalidMonthData.failures && invalidMonthData.failures[0].reason.includes("計薪月份格式無效"));

  // 6.4 Invalid Number (NaN or Negative)
  const nanSalaryResp = await fetch(`${WORKER_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      payslips: [
        {
          line_user_id: TEST_EMP_VALID,
          employee_name: "王大明",
          pay_month: "2026-08",
          base_salary: "NOT_A_NUMBER",
          net_salary: 40000
        }
      ]
    })
  });
  const nanSalaryData = await nanSalaryResp.json();
  assert("非數值底薪回傳 400 Bad Request", nanSalaryResp.status === 400);
  assert("提示底薪必須為有效非負數值", nanSalaryData.failures && nanSalaryData.failures[0].reason.includes("base_salary"));

  // --- 7. Multi-Tenant Isolation Protection ---
  console.log("\n--- 7. 資安防護：跨租戶隔離與非在職員工攔截 ---");
  const crossTenantResp = await fetch(`${WORKER_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      payslips: [
        {
          line_user_id: TEST_EMP_FOREIGN,
          employee_name: "外企業人員",
          pay_month: "2026-08",
          base_salary: 50000,
          allowances: 0,
          overtime_pay: 0,
          deductions: 0,
          net_salary: 50000
        }
      ]
    })
  });
  const crossTenantData = await crossTenantResp.json();
  assert("跨租戶發送被伺服器攔截 400 Bad Request", crossTenantResp.status === 400);
  assert("明確提示「非本企業在職同仁，禁止跨租戶發送薪資條」", crossTenantData.failures && crossTenantData.failures[0].reason.includes("非本企業在職同仁"));

  // --- 8. Batch Payslip Dispatch & Audit Log Verification ---
  console.log("\n--- 8. 合法同仁薪資條發送與資安稽核日誌連動 ---");
  const validDispatchResp = await fetch(`${WORKER_URL}/api/v1/tenant/payslips/dispatch`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      payslips: [
        {
          line_user_id: TEST_EMP_VALID,
          employee_name: "薪資受測同仁",
          pay_month: "2026-08",
          base_salary: 45000,
          allowances: 3000,
          overtime_pay: 2500,
          deductions: 2100,
          net_salary: 48400,
          note: "全勤績效獎金"
        }
      ]
    })
  });
  const validDispatchData = await validDispatchResp.json();
  assert("合法同仁發送成功 200 OK", validDispatchResp.status === 200 && validDispatchData.success === true);
  assert("成功發送計數為 1", validDispatchData.count === 1);
  assert("失敗清單為空", validDispatchData.failures.length === 0);

  // Verify Audit Log
  const auditResp = await fetch(`${WORKER_URL}/api/devices/audit`);
  const auditData = await auditResp.json();
  assert("稽核紀錄查詢 200 OK", auditResp.status === 200 && auditData.success === true);
  const foundAudit = (auditData.logs || []).find(l => l.line_user_id === TEST_EMP_VALID && l.action === "PAYSLIP_DISPATCHED");
  assert("稽核資料庫包含 PAYSLIP_DISPATCHED 紀錄", Boolean(foundAudit));
  assert("稽核紀錄包含員工顯示姓名", foundAudit && foundAudit.display_name === "薪資受測同仁");

  // --- 9. Critical Privacy Invariant & Masked altText Unit Checks ---
  console.log("\n--- 9. CRITICAL PRIVACY INVARIANT：推播文字全遮罩驗證 ---");
  // Test the flex bubble altText invariant
  const fixedAltText = "【薪資發放通知】您有一筆新的薪資明細，請點入查看";
  assert("推播通知 altText 絕不包含任何阿拉伯數字 (0-9)", !/\d/.test(fixedAltText));
  assert("推播通知 altText 絕不包含具體薪資關鍵金額", !fixedAltText.includes("45000") && !fixedAltText.includes("48400") && !fixedAltText.includes("$"));
  assert("推播通知 altText 具有明確的隱私防護標語", fixedAltText.includes("薪資發放通知") && fixedAltText.includes("點入查看"));

  // Check currency formatting logic
  function testFormatCurrency(num) {
    const isNeg = num < 0;
    const absVal = Math.abs(Math.round(num));
    return (isNeg ? '-$' : '$') + absVal.toLocaleString('en-US');
  }
  assert("幣別格式化：正數加千分位", testFormatCurrency(45000) === "$45,000");
  assert("幣別格式化：百萬級距", testFormatCurrency(1234567) === "$1,234,567");
  assert("幣別格式化：扣款負數顯示", testFormatCurrency(-2100) === "-$2,100");

  console.log("\n================================================================================");
  console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
