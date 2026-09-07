/**
 * Comprehensive Automated Test Suite: Web Admin Auth & M2M Key Management
 * Verifies Account/Password Login, Session Lifecycle, RBAC, M2M Key Generation, M2M Verification, Revocation, and Logout.
 */

const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";

async function runTest() {
  console.log("================================================================================");
  console.log("🚀 STARTING AUTOMATED TEST: WEB ADMIN AUTH & M2M KEY MANAGEMENT (v1.9.0)");
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

  // 1. Health & Unauthenticated Admin Page
  console.log("--- 1. 健康檢查與管理入口載入驗證 ---");
  const healthResp = await fetch(`${BASE_URL}/api/health`);
  assert("API Health 檢查 200 OK", healthResp.status === 200);

  const adminUiResp = await fetch(`${BASE_URL}/admin`);
  const adminUiHtml = await adminUiResp.text();
  assert("地端管理入口 /admin 頁面 200 OK", adminUiResp.status === 200);
  assert("管理入口包含帳號密碼登入視窗", adminUiHtml.includes("LINE 考勤管理系統") && adminUiHtml.includes("inputUsername") && adminUiHtml.includes("inputPassword"));
  assert("管理入口包含 API 金鑰管理分頁", adminUiHtml.includes("API 金鑰管理") && adminUiHtml.includes("生成新金鑰"));

  // Check that all client-side JavaScript in /admin parses cleanly without SyntaxError
  const scripts = adminUiHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
  let scriptSyntaxValid = scripts.length > 0;
  for (const s of scripts) {
    const code = s.replace(/<\/?script[^>]*>/gi, '');
    try {
      new Function(code);
    } catch (e) {
      scriptSyntaxValid = false;
      console.error("  ❌ Admin UI Script Syntax Error:", e);
    }
  }
  assert("地端管理入口所有前端 JavaScript 語法檢驗 100% 通過無解析錯誤", scriptSyntaxValid);

  // 2. Login Failure Scenarios
  console.log("\n--- 2. 帳號密碼登入防護與錯誤處理測試 ---");
  const emptyLoginResp = await fetch(`${BASE_URL}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert("空帳密登入回傳 400 Bad Request", emptyLoginResp.status === 400);

  const wrongUserLoginResp = await fetch(`${BASE_URL}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "non_existent_user", password: "SomePassword123" })
  });
  assert("不存在帳號登入回傳 401 Unauthorized", wrongUserLoginResp.status === 401);

  const wrongPwdLoginResp = await fetch(`${BASE_URL}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "WrongPassword999" })
  });
  assert("密碼錯誤登入回傳 401 Unauthorized", wrongPwdLoginResp.status === 401);

  // 3. Successful Admin Login
  console.log("\n--- 3. 初始管理員帳號登入與 Session 簽發測試 ---");
  let sessionToken = "";
  let userInfo = null;

  const loginResp = await fetch(`${BASE_URL}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Admin@24549210" })
  });
  const loginData = await loginResp.json();
  assert("管理員登入成功 (200 OK)", loginResp.status === 200 && loginData.success === true);
  assert("回傳 Session Token (sess_ 前綴)", loginData.token && loginData.token.startsWith("sess_"));
  assert("回傳正確企業統編 (24549210)", loginData.user && loginData.user.taxId === "24549210");
  assert("回傳正確使用者角色 (ADMIN)", loginData.user && loginData.user.role === "ADMIN");
  sessionToken = loginData.token;
  userInfo = loginData.user;

  // 4. Session Authenticated API Access
  console.log("\n--- 4. 使用 Web Session 存取地端業務端點 ---");
  const meResp = await fetch(`${BASE_URL}/api/v1/admin/me`, {
    headers: { "Authorization": `Bearer ${sessionToken}` }
  });
  const meData = await meResp.json();
  assert("GET /api/v1/admin/me 驗證成功", meResp.status === 200 && meData.user.taxId === "24549210" && meData.user.authType === "SESSION");

  const locResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    headers: { "Authorization": `Bearer ${sessionToken}` }
  });
  const locData = await locResp.json();
  assert("Session 存取據點清單成功", locResp.status === 200 && locData.companyTaxId === "24549210");

  const schedResp = await fetch(`${BASE_URL}/api/v1/tenant/schedules?month=2026-08`, {
    headers: { "Authorization": `Bearer ${sessionToken}` }
  });
  assert("Session 存取班表資料成功", schedResp.status === 200);

  const recResp = await fetch(`${BASE_URL}/api/v1/tenant/records`, {
    headers: { "Authorization": `Bearer ${sessionToken}` }
  });
  assert("Session 存取出勤紀錄成功", recResp.status === 200);

  const auditResp = await fetch(`${BASE_URL}/api/v1/tenant/audit`, {
    headers: { "Authorization": `Bearer ${sessionToken}` }
  });
  assert("Session 存取安全稽核日誌成功", auditResp.status === 200);

  // 5. M2M API Key Generation via Web Session
  console.log("\n--- 5. 後台生成全新 M2M API 金鑰與複製流程 ---");
  let generatedApiKey = "";
  let generatedKeyId = 0;

  const createKeyResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      name: "地端自動化測試專用金鑰 (M2M)",
      role: "ADMIN"
    })
  });
  const createKeyData = await createKeyResp.json();
  assert("後台生成 M2M API Key 成功 (200 OK)", createKeyResp.status === 200 && createKeyData.success === true);
  assert("生成之金鑰帶有統編前綴 (pk_live_24549210_)", createKeyData.apiKey && createKeyData.apiKey.startsWith("pk_live_24549210_"));
  assert("金鑰統編由 Session 自動綁定，無需手動填寫", createKeyData.taxId === "24549210");
  generatedApiKey = createKeyData.apiKey;

  // 6. Verify M2M API Key Usage
  console.log("\n--- 6. 獨立使用全新 M2M API Key 進行 API 呼叫 ---");
  const m2mLocResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    headers: { "X-Tenant-Key": generatedApiKey }
  });
  const m2mLocData = await m2mLocResp.json();
  assert("M2M API Key 獨立驗證據點 API 成功 (200 OK)", m2mLocResp.status === 200 && m2mLocData.companyTaxId === "24549210");

  // 7. List Keys & Find the newly created key ID
  console.log("\n--- 7. 查詢金鑰清單與狀態檢驗 ---");
  const listKeysResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    headers: { "Authorization": `Bearer ${sessionToken}` }
  });
  const listKeysData = await listKeysResp.json();
  assert("查詢企業金鑰清單成功", listKeysResp.status === 200 && Array.isArray(listKeysData.keys) && listKeysData.keys.length > 0);
  
  const foundKey = listKeysData.keys.find(k => k.key_hint === createKeyData.keyHint);
  assert("清單中找到剛建立之金鑰", !!foundKey);
  if (foundKey) {
    generatedKeyId = foundKey.id;
    assert("金鑰初始狀態為啟用中 (is_active = 1)", foundKey.is_active === 1);
  }

  // 8. Revoke Key
  console.log("\n--- 8. 撤銷 M2M API Key 與即時停用防護測試 ---");
  if (generatedKeyId > 0) {
    const revokeResp = await fetch(`${BASE_URL}/api/v1/tenant/keys/${generatedKeyId}/revoke`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${sessionToken}` }
    });
    const revokeData = await revokeResp.json();
    assert("後台撤銷金鑰成功 (200 OK)", revokeResp.status === 200 && revokeData.success === true);

    const revokedM2mResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
      headers: { "X-Tenant-Key": generatedApiKey }
    });
    assert("被撤銷之金鑰立即失效 (403 Forbidden)", revokedM2mResp.status === 403);
  }

  // 9. Logout Session
  console.log("\n--- 9. Session 登出與廢止測試 ---");
  const logoutResp = await fetch(`${BASE_URL}/api/v1/admin/logout`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${sessionToken}` }
  });
  assert("登出成功 (200 OK)", logoutResp.status === 200);

  const postLogoutMeResp = await fetch(`${BASE_URL}/api/v1/admin/me`, {
    headers: { "Authorization": `Bearer ${sessionToken}` }
  });
  assert("已登出之 Session 存取被拒絕 (401 Unauthorized)", postLogoutMeResp.status === 401);

  console.log("\n================================================================================");
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
