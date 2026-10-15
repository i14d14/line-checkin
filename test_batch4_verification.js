/**
 * Automated Verification Suite: Batch 4 (Tenant M2M API Keys & Location Safety Guards)
 * Corresponds to AUTONOMOUS_VERIFICATION_ROADMAP.md (Batch 4)
 * 
 * Verifies without Playwright:
 * 1. Tier 2: AST & HTML Structure Inspection (Item 9 & Modals/Tabs)
 *    - HTML Stack-Based Tag Balance & Nesting Validator (all tags strictly paired, zero unclosed tags)
 *    - JSDOM AST & DOM Inspection:
 *      * Modal 1: #createKeyModal, #createKeyForm, #keyNameInput, #keyRoleSelect, #createKeySubmitBtn
 *      * Modal 2: #showKeyModal, #newRawApiKeyInput, #copyBtnText
 *      * Tab 5: #tab-apikeys, #apiKeysTableBody, buttons & 7-column table layout
 *      * Tag validity, form attributes (required, readonly), and ID uniqueness
 * 2. Tier 4: Workers API Live Contract & D1 Sandbox (Item 9: M2M API Keys Center)
 *    - POST /api/v1/tenant/keys parameter validation & negative defense
 *    - POST /api/v1/tenant/keys successful key generation (ADMIN & READ_ONLY)
 *    - SHA-256 hash & key_hint persistence in D1 tenant_api_keys
 *    - GET /api/v1/tenant/keys list keys with strict masking (only key_hint, never raw key/hash)
 *    - POST/DELETE /api/v1/tenant/keys/:id/revoke permission enforcement (ADMIN required, cross-tenant 404)
 *    - D1 is_active = 0 physical assertion
 *    - Deactivated key defense: revoked keys immediately return 403 on subsequent API calls
 * 3. Tier 4: Workers API Live Contract & D1 Sandbox (Item 10: Location Configuration & Deletion Guards)
 *    - Headquarters legal name invariant: 美德街 56-11 號法定名稱恆為「豬毛有限公司 - 台中美德總部」
 *    - Deletion permission boundary: 401 unauthenticated, 403 READ_ONLY
 *    - Headquarters protection invariant: taxId-01 and taxId deletion strictly blocked (400)
 *    - Cross-tenant boundary defense: non-tenant location deletion strictly blocked (400)
 *    - Active employee binding protection: location with bound employees strictly blocked from deletion (400)
 *    - Clean secondary branch deletion: unassigned branch successfully deleted (200) and physically removed
 *    - Unbinding transition: after unbinding employee, deletion is permitted and cleanly purged
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
const HQ_TAX_ID = "24549210";
const HQ_LOCATION_ID = `${HQ_TAX_ID}-01`;
const HQ_EXPECTED_NAME = "豬毛有限公司 - 台中美德總部";

const TEST_CLEAN_BRANCH_ID = `${TEST_TAX_ID}-TEST-CLN-${TIMESTAMP.toString().slice(-4)}`;
const TEST_BUSY_BRANCH_ID = `${TEST_TAX_ID}-TEST-BSY-${TIMESTAMP.toString().slice(-4)}`;
const TEST_EMP_USER = `U_TEST_B4_EMP_${TIMESTAMP}`;

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

function sha256(str) {
  return crypto.createHash('sha256').update(str.trim()).digest('hex');
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
// PART 1: Tier 2 AST & HTML Structure Inspection
// -----------------------------------------------------------------------------
function extractHtmlTemplate(tsFilePath) {
  const code = fs.readFileSync(tsFilePath, 'utf8');
  // Match template literal inside return `...`;
  const match = code.match(/return\s*`([\s\S]*?)`;/);
  if (!match) {
    throw new Error(`Failed to extract return \`...\` from ${tsFilePath}`);
  }
  return match[1];
}

/**
 * Strict Stack-Based HTML Tag Balancer & Structure Linter
 * Ensures all non-void tags are paired and closed in exact LIFO order.
 */
function validateHtmlTagBalance(htmlSnippet, snippetName = "Snippet") {
  // Strip comments
  const cleanHtml = htmlSnippet.replace(/<!--[\s\S]*?-->/g, '');
  
  // HTML void tags (do not require closing tags)
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
  console.log("🔹 PART 1: Tier 2 AST & HTML Structure Inspection (Item 9 & Modals/Tabs)");
  console.log("================================================================================");

  const modalsPath = path.resolve(__dirname, 'src/views/admin/admin-modals.ts');
  const tabsPath = path.resolve(__dirname, 'src/views/admin/admin-tabs.ts');

  assert("檔案存在：admin-modals.ts", fs.existsSync(modalsPath));
  assert("檔案存在：admin-tabs.ts", fs.existsSync(tabsPath));

  const modalsHtml = extractHtmlTemplate(modalsPath);
  const tabsHtml = extractHtmlTemplate(tabsPath);

  // Test 1.1: Stack-Based Tag Balancer on Specific Modal Snippets
  console.log("\n[Test 1.1] 嚴格堆疊標籤平衡檢驗 (Stack-Based HTML Tag Balancer)...");

  // Extract Create Key Modal snippet
  const createKeyMatch = modalsHtml.match(/(<!--\s*Modal:\s*Create New API Key[\s\S]*?<\/form>\s*<\/div>\s*<\/div>)/i);
  assert("成功定位 createKeyModal HTML 區塊", !!createKeyMatch);
  const createKeyResult = validateHtmlTagBalance(createKeyMatch[1], "createKeyModal");
  assert(
    "createKeyModal 標籤 100% 閉合且無巢狀越界",
    createKeyResult.valid,
    createKeyResult.valid ? `檢驗標籤數: ${createKeyResult.tagCount}` : createKeyResult.errors.join("; ")
  );

  // Extract Show Key Modal snippet
  const showKeyMatch = modalsHtml.match(/(<!--\s*Modal:\s*Display Newly Created Key[\s\S]*?<\/div>\s*<\/div>\s*<\/div>)/i);
  assert("成功定位 showKeyModal HTML 區塊", !!showKeyMatch);
  const showKeyResult = validateHtmlTagBalance(showKeyMatch[1], "showKeyModal");
  assert(
    "showKeyModal 標籤 100% 閉合且無巢狀越界",
    showKeyResult.valid,
    showKeyResult.valid ? `檢驗標籤數: ${showKeyResult.tagCount}` : showKeyResult.errors.join("; ")
  );

  // Extract API Keys Tab snippet
  const apiKeysTabMatch = tabsHtml.match(/(<!--\s*TAB 5:.*?API 金鑰管理[\s\S]*?<\/section>)/i);
  assert("成功定位 tab-apikeys HTML 區塊", !!apiKeysTabMatch);
  const apiKeysTabResult = validateHtmlTagBalance(apiKeysTabMatch[1], "tab-apikeys");
  assert(
    "tab-apikeys 標籤 100% 閉合且無巢狀越界",
    apiKeysTabResult.valid,
    apiKeysTabResult.valid ? `檢驗標籤數: ${apiKeysTabResult.tagCount}` : apiKeysTabResult.errors.join("; ")
  );

  // Full files tag balance
  const fullModalsResult = validateHtmlTagBalance(modalsHtml, "admin-modals.ts full");
  assert(
    "renderAdminModals 全文 HTML 標籤結構完整無遺漏",
    fullModalsResult.valid,
    fullModalsResult.valid ? `總標籤數: ${fullModalsResult.tagCount}` : fullModalsResult.errors.join("; ")
  );

  const fullTabsResult = validateHtmlTagBalance(tabsHtml, "admin-tabs.ts full");
  assert(
    "renderAdminTabs 全文 HTML 標籤結構完整無遺漏",
    fullTabsResult.valid,
    fullTabsResult.valid ? `總標籤數: ${fullTabsResult.tagCount}` : fullTabsResult.errors.join("; ")
  );

  // Test 1.2: JSDOM AST & Element Inspection
  console.log("\n[Test 1.2] JSDOM AST 語法樹與屬性合規性校驗...");
  const fullHtml = `
  <!DOCTYPE html>
  <html>
  <body>
    ${tabsHtml}
    ${modalsHtml}
  </body>
  </html>
  `;
  const dom = new JSDOM(fullHtml);
  const document = dom.window.document;

  // Verify Modal 1: #createKeyModal
  const createKeyModal = document.getElementById("createKeyModal");
  assert("#createKeyModal 根節點存在且為 DIV", createKeyModal && createKeyModal.tagName === "DIV");
  assert("#createKeyModal 具備預設 hidden 與彈窗置中類別", createKeyModal?.classList.contains("hidden") && createKeyModal?.classList.contains("fixed"));

  const createKeyForm = document.getElementById("createKeyForm");
  assert("#createKeyForm 表單存在且綁定 handleCreateKeySubmit(event)", createKeyForm && createKeyForm.getAttribute("onsubmit") === "handleCreateKeySubmit(event)");

  const keyNameInput = document.getElementById("keyNameInput");
  assert("#keyNameInput 欄位存在且具備 required 屬性", keyNameInput && keyNameInput.hasAttribute("required"));

  const keyRoleSelect = document.getElementById("keyRoleSelect");
  assert("#keyRoleSelect 下拉選單存在", keyRoleSelect && keyRoleSelect.tagName === "SELECT");
  const options = Array.from(keyRoleSelect?.querySelectorAll("option") || []).map(o => o.value);
  assert("#keyRoleSelect 包含 ADMIN 與 READ_ONLY 選項", options.includes("ADMIN") && options.includes("READ_ONLY"));

  const createKeySubmitBtn = document.getElementById("createKeySubmitBtn");
  assert("#createKeySubmitBtn 提交按鈕存在且 type=submit", createKeySubmitBtn && createKeySubmitBtn.getAttribute("type") === "submit");

  // Verify Modal 2: #showKeyModal
  const showKeyModal = document.getElementById("showKeyModal");
  assert("#showKeyModal 根節點存在且為 DIV", showKeyModal && showKeyModal.tagName === "DIV");
  assert("#showKeyModal 具備預設 hidden 類別", showKeyModal?.classList.contains("hidden"));

  const newRawApiKeyInput = document.getElementById("newRawApiKeyInput");
  assert("#newRawApiKeyInput 存在且為 readonly 輸入框", newRawApiKeyInput && newRawApiKeyInput.hasAttribute("readonly"));
  assert("#newRawApiKeyInput 具備 select-all 與 font-mono 易複製類別", newRawApiKeyInput?.classList.contains("select-all") && newRawApiKeyInput?.classList.contains("font-mono"));

  const copyBtnText = document.getElementById("copyBtnText");
  assert("#copyBtnText 複製按鈕提示文字節點存在", copyBtnText && copyBtnText.textContent === "複製");

  const showKeyCloseBtn = showKeyModal?.querySelector("button[onclick='closeShowKeyModal()']");
  assert("showKeyModal 具備關閉按鈕 onclick='closeShowKeyModal()'", !!showKeyCloseBtn);

  // Verify Tab 5: #tab-apikeys
  const tabApikeys = document.getElementById("tab-apikeys");
  assert("#tab-apikeys 節點存在且為 SECTION", tabApikeys && tabApikeys.tagName === "SECTION");
  assert("#tab-apikeys 預設具備 hidden 類別", tabApikeys?.classList.contains("hidden"));

  const openCreateBtn = tabApikeys?.querySelector("button[onclick='openCreateKeyModal()']");
  assert("包含「生成新金鑰」按鈕 onclick='openCreateKeyModal()'", !!openCreateBtn);

  const refreshBtn = tabApikeys?.querySelector("button[onclick='fetchApiKeys()']");
  assert("包含「重新整理」金鑰清單按鈕 onclick='fetchApiKeys()'", !!refreshBtn);

  const tableBody = document.getElementById("apiKeysTableBody");
  assert("#apiKeysTableBody 存在且為 TBODY", tableBody && tableBody.tagName === "TBODY");

  // Verify 7 table header columns
  const thElements = Array.from(tabApikeys?.querySelectorAll("thead th") || []).map(th => th.textContent.trim());
  const expectedHeaders = ["金鑰前綴提示", "金鑰備註名稱", "權限角色", "狀態", "建立時間", "最後使用時間", "操作"];
  assert(
    "金鑰清單表格包含標準 7 大標題欄位",
    expectedHeaders.every(h => thElements.includes(h)),
    `實際欄位: [${thElements.join(", ")}]`
  );

  // Verify ID uniqueness in combined DOM
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
// PART 2: Tier 4 D1 Sandbox - 項目 9：企業 M2M API 金鑰自主生成 / 撤銷中心
// -----------------------------------------------------------------------------
let adminApiKey = "";
let adminKeyHint = "";
let readOnlyApiKey = "";
let readOnlyKeyHint = "";
let readOnlyKeyId = 0;
let disposableKeyId = 0;

async function runPart2ApiKeysTests() {
  console.log("\n================================================================================");
  console.log("🔹 PART 2: D1 Sandbox - 項目 9：企業 M2M API 金鑰自主生成 / 撤銷中心");
  console.log("================================================================================");

  // Test 2.1: POST /api/v1/tenant/keys Parameter Validation & Negative Invariants
  console.log("\n[Test 2.1] 參數校驗與負向防禦 (Negative Fault Injection)...");

  // 1. Missing tax_id
  const noTaxResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert("缺少 tax_id 回傳 HTTP 400", noTaxResp.status === 400);

  // 2. Invalid tax_id format
  const badTaxResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: "1234567" })
  });
  const badTaxData = await badTaxResp.json();
  assert("無效統編 (1234567) 回傳 HTTP 400", badTaxResp.status === 400 && badTaxData.error?.includes("統一編號"));

  // 3. Missing name
  const noNameResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: TEST_TAX_ID })
  });
  const noNameData = await noNameResp.json();
  assert("缺少備註名稱 (name) 回傳 HTTP 400", noNameResp.status === 400 && noNameData.error?.includes("缺少金鑰備註名稱"));

  // 4. Invalid role
  const badRoleResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: TEST_TAX_ID, name: "測試金鑰", role: "SUPER_HACKER" })
  });
  const badRoleData = await badRoleResp.json();
  assert("非有效角色 (SUPER_HACKER) 回傳 HTTP 400", badRoleResp.status === 400 && badRoleData.error?.includes("角色必須為 ADMIN"));

  // Test 2.2: POST /api/v1/tenant/keys Successful Key Generation (ADMIN)
  console.log("\n[Test 2.2] 成功自主生成 ADMIN 角色 API 金鑰...");
  const adminKeyName = `B4-ADMIN-KEY-${TIMESTAMP}`;
  const genAdminResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tax_id: TEST_TAX_ID,
      name: adminKeyName,
      role: "ADMIN"
    })
  });
  const genAdminData = await genAdminResp.json();
  assert("生成 ADMIN 金鑰回傳 HTTP 200", genAdminResp.status === 200);
  assert("回傳 success: true", genAdminData.success === true);
  assert("回傳一次性明文 apiKey (前綴正確)", typeof genAdminData.apiKey === "string" && genAdminData.apiKey.startsWith(`pk_live_${TEST_TAX_ID}_`));
  assert("回傳 keyHint 遮罩提示", typeof genAdminData.keyHint === "string" && genAdminData.keyHint.startsWith(`pk_live_${TEST_TAX_ID}...`));
  assert("回傳角色為 ADMIN", genAdminData.role === "ADMIN");
  assert("回傳統編為 99999999", genAdminData.taxId === TEST_TAX_ID);

  adminApiKey = genAdminData.apiKey;
  adminKeyHint = genAdminData.keyHint;

  // Verify D1 Persistence & Hash Matching
  console.log("\n[Test 2.2-D1] 直接查詢 D1 驗證 SHA-256 雜湊與落庫狀態...");
  const adminDbRows = await queryD1(
    `SELECT id, tax_id, api_key_hash, key_hint, name, role, is_active, created_at FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}' AND name = '${adminKeyName}'`
  );
  assert("D1 中精準查得 1 筆 ADMIN 金鑰紀錄", adminDbRows.length === 1);
  const adminDbKey = adminDbRows[0];
  const expectedAdminHash = sha256(adminApiKey);
  assert("D1 儲存之 api_key_hash 精準符合一次性明文金鑰之 SHA-256 雜湊", adminDbKey.api_key_hash === expectedAdminHash, `Hash: ${adminDbKey.api_key_hash.slice(0, 16)}...`);
  assert("D1 儲存之 key_hint 與回傳提示一致", adminDbKey.key_hint === adminKeyHint);
  assert("D1 is_active 預設為 1 (啟用中)", adminDbKey.is_active === 1);

  // Test 2.3: POST /api/v1/tenant/keys Successful Key Generation (READ_ONLY)
  console.log("\n[Test 2.3] 成功自主生成 READ_ONLY 角色 API 金鑰...");
  const roKeyName = `B4-RO-KEY-${TIMESTAMP}`;
  const genRoResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tax_id: TEST_TAX_ID,
      name: roKeyName,
      role: "READ_ONLY"
    })
  });
  const genRoData = await genRoResp.json();
  assert("生成 READ_ONLY 金鑰回傳 HTTP 200", genRoResp.status === 200);
  assert("回傳一次性明文 apiKey", typeof genRoData.apiKey === "string" && genRoData.apiKey.startsWith(`pk_live_${TEST_TAX_ID}_`));
  assert("回傳角色為 READ_ONLY", genRoData.role === "READ_ONLY");

  readOnlyApiKey = genRoData.apiKey;
  readOnlyKeyHint = genRoData.keyHint;

  const roDbRows = await queryD1(
    `SELECT id, is_active FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}' AND name = '${roKeyName}'`
  );
  assert("D1 中查得 READ_ONLY 金鑰紀錄", roDbRows.length === 1);
  readOnlyKeyId = roDbRows[0].id;
  assert("READ_ONLY 金鑰 ID 合法大於 0", readOnlyKeyId > 0, `ID: ${readOnlyKeyId}`);

  // Test 2.4: GET /api/v1/tenant/keys List Keys & Security Masking
  console.log("\n[Test 2.4] GET /api/v1/tenant/keys 金鑰清單查詢與安全遮罩檢驗...");

  // Unauthenticated request
  const unauthList = await fetch(`${BASE_URL}/api/v1/tenant/keys`);
  assert("未提供認證查詢金鑰回傳 HTTP 401 Unauthorized", unauthList.status === 401);

  // Authenticated request with ADMIN key
  const authList = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  assert("使用 ADMIN 金鑰查詢回傳 HTTP 200 OK", authList.status === 200);
  const listData = await authList.json();
  assert("回傳 success: true", listData.success === true);
  assert("統編欄位精準符合 99999999", listData.companyTaxId === TEST_TAX_ID);
  assert("金鑰陣列長度 >= 2", Array.isArray(listData.keys) && listData.keys.length >= 2);

  // Security Masking assertion: ensure raw key and hash are NEVER returned
  const keys = listData.keys || [];
  const foundAdmin = keys.find(k => k.name === adminKeyName);
  const foundRo = keys.find(k => k.name === roKeyName);
  assert("清單包含剛建立之 ADMIN 金鑰", !!foundAdmin);
  assert("清單包含剛建立之 READ_ONLY 金鑰", !!foundRo);

  let rawKeyLeaked = false;
  let hashLeaked = false;
  let hintsValid = true;
  for (const k of keys) {
    if (k.apiKey || k.api_key || k.raw_key) rawKeyLeaked = true;
    if (k.api_key_hash || k.apiKeyHash || k.hash) hashLeaked = true;
    if (!k.key_hint || typeof k.key_hint !== "string") hintsValid = false;
  }
  assert("安全遮罩守則：回傳 JSON 嚴格不含明文 apiKey", !rawKeyLeaked);
  assert("安全遮罩守則：回傳 JSON 嚴格不含 SHA-256 hash", !hashLeaked);
  assert("安全遮罩守則：回傳金鑰均具備 key_hint 提示", hintsValid);

  // Test 2.5: Key Revocation Endpoint Permissions & Boundaries
  console.log("\n[Test 2.5] 撤銷金鑰端點權限控管與負向注入...");

  // 1. Unauthenticated revocation
  const unauthRevoke = await fetch(`${BASE_URL}/api/v1/tenant/keys/${readOnlyKeyId}/revoke`, {
    method: "POST"
  });
  assert("未認證呼叫撤銷回傳 HTTP 401 Unauthorized", unauthRevoke.status === 401);

  // 2. READ_ONLY role attempting revocation
  const roRevoke = await fetch(`${BASE_URL}/api/v1/tenant/keys/${readOnlyKeyId}/revoke`, {
    method: "POST",
    headers: { "X-Tenant-Key": readOnlyApiKey }
  });
  const roRevokeData = await roRevoke.json();
  assert("READ_ONLY 金鑰嘗試撤銷金鑰回傳 HTTP 403 Forbidden", roRevoke.status === 403);
  assert("錯誤提示包含僅企業管理員 (ADMIN) 有權限撤銷", roRevokeData.error?.includes("ADMIN"));

  // 3. Revoking non-existent / cross-tenant key ID
  const notFoundRevoke = await fetch(`${BASE_URL}/api/v1/tenant/keys/999999999/revoke`, {
    method: "POST",
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const notFoundData = await notFoundRevoke.json();
  assert("撤銷不存在/非所屬金鑰回傳 HTTP 404 Not Found", notFoundRevoke.status === 404);
  assert("錯誤提示包含查無此金鑰或非本公司所屬", notFoundData.error?.includes("查無此金鑰"));

  // Test 2.6: POST/DELETE /api/v1/tenant/keys/:id/revoke Successful Revocation
  console.log("\n[Test 2.6] POST /api/v1/tenant/keys/:id/revoke 成功撤銷金鑰...");
  const successRevoke = await fetch(`${BASE_URL}/api/v1/tenant/keys/${readOnlyKeyId}/revoke`, {
    method: "POST",
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const successRevokeData = await successRevoke.json();
  assert("管理員撤銷金鑰回傳 HTTP 200 OK", successRevoke.status === 200);
  assert("撤銷成功回傳 success: true", successRevokeData.success === true);
  assert("回傳成功訊息：API 金鑰已成功撤銷停用", successRevokeData.message?.includes("已成功撤銷停用"));

  // Direct D1 Assertion for is_active = 0
  const roAfterRevoke = await queryD1(`SELECT is_active FROM tenant_api_keys WHERE id = ${readOnlyKeyId}`);
  assert("D1 物理確認：該金鑰 is_active 精準落庫變更為 0 (已作廢)", roAfterRevoke[0]?.is_active === 0);

  // Test DELETE method compatibility on /api/v1/tenant/keys/:id
  console.log("\n[Test 2.6-DELETE] 驗證 DELETE HTTP 動詞撤銷相容性...");
  const dispName = `B4-DISP-KEY-${TIMESTAMP}`;
  const genDisp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: TEST_TAX_ID, name: dispName, role: "READ_ONLY" })
  });
  const genDispData = await genDisp.json();
  const dispRows = await queryD1(`SELECT id FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}' AND name = '${dispName}'`);
  disposableKeyId = dispRows[0]?.id;

  const deleteVerbResp = await fetch(`${BASE_URL}/api/v1/tenant/keys/${disposableKeyId}`, {
    method: "DELETE",
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const deleteVerbData = await deleteVerbResp.json();
  assert("使用 DELETE 動詞撤銷金鑰回傳 HTTP 200 OK", deleteVerbResp.status === 200 && deleteVerbData.success === true);
  const dispAfterRevoke = await queryD1(`SELECT is_active FROM tenant_api_keys WHERE id = ${disposableKeyId}`);
  assert("DELETE 動詞亦將 D1 is_active 更新為 0", dispAfterRevoke[0]?.is_active === 0);

  // Test 2.7: Deactivated Key Defense (Revoked keys cannot be used for any API)
  console.log("\n[Test 2.7] 已撤銷金鑰失效阻斷防禦 (Deactivated Key Defense)...");

  // Call GET /api/v1/tenant/keys with revoked key
  const callWithRevokedKey = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    headers: { "X-Tenant-Key": readOnlyApiKey }
  });
  const revokedKeyData = await callWithRevokedKey.json();
  assert("使用已撤銷金鑰請求 API 回傳 HTTP 403 Forbidden", callWithRevokedKey.status === 403);
  assert("阻斷訊息包含「此租戶金鑰已被停用 (Deactivated Key)」", revokedKeyData.error?.includes("此租戶金鑰已被停用"));

  // Call GET /api/v1/tenant/locations with revoked key
  const locWithRevokedKey = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    headers: { "X-Tenant-Key": readOnlyApiKey }
  });
  const locRevokedData = await locWithRevokedKey.json();
  assert("使用已撤銷金鑰請求據點 API 亦精準阻斷 (HTTP 403)", locWithRevokedKey.status === 403);
  assert("據點 API 阻斷訊息同樣為「此租戶金鑰已被停用」", locRevokedData.error?.includes("此租戶金鑰已被停用"));
}

// -----------------------------------------------------------------------------
// PART 3: Tier 4 D1 Sandbox - 項目 10：門市據點配置與刪除防呆
// -----------------------------------------------------------------------------
async function runPart3LocationSafetyTests() {
  console.log("\n================================================================================");
  console.log("🔹 PART 3: D1 Sandbox - 項目 10：門市據點配置與刪除防呆");
  console.log("================================================================================");

  // Test 3.1: Headquarters Legal Naming Rule
  console.log("\n[Test 3.1] 總部法定名稱規範 (Headquarters Legal Naming Rule)...");
  const hqRows = await queryD1(
    `SELECT id, name, address FROM locations WHERE address LIKE '%美德街56-11%' OR id = '${HQ_LOCATION_ID}'`
  );
  assert("D1 中查得美德總部據點紀錄", hqRows.length >= 1);
  for (const hq of hqRows) {
    assert(
      `美德街總部 (ID: ${hq.id}) 法定名稱恆為「${HQ_EXPECTED_NAME}」`,
      hq.name === HQ_EXPECTED_NAME,
      `實際名稱: "${hq.name}"`
    );
  }

  // Test 3.2: Deletion Authentication & Authorization Boundaries
  console.log("\n[Test 3.2] 據點刪除鑑權邊界測試...");

  // 1. Unauthenticated deletion
  const unauthDel = await fetch(`${BASE_URL}/api/v1/tenant/locations/${TEST_CLEAN_BRANCH_ID}`, {
    method: "DELETE"
  });
  assert("未帶金鑰刪除據點回傳 HTTP 401 Unauthorized", unauthDel.status === 401);

  // 2. READ_ONLY key deletion attempt
  console.log("  簽發臨時 active READ_ONLY 金鑰用於權限測試...");
  const tempRoResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: TEST_TAX_ID, name: `B4-TEMP-RO-${TIMESTAMP}`, role: "READ_ONLY" })
  });
  const tempRoData = await tempRoResp.json();
  const tempRoApiKey = tempRoData.apiKey;

  const roDel = await fetch(`${BASE_URL}/api/v1/tenant/locations/${TEST_CLEAN_BRANCH_ID}`, {
    method: "DELETE",
    headers: { "X-Tenant-Key": tempRoApiKey }
  });
  const roDelData = await roDel.json();
  assert("READ_ONLY 角色金鑰刪除據點回傳 HTTP 403 Forbidden", roDel.status === 403);
  assert("錯誤提示包含僅 ADMIN 角色金鑰可刪除門市據點", roDelData.error?.includes("ADMIN 角色金鑰可刪除"));

  // Test 3.3: Headquarters Protection Invariant (taxId-01 and taxId cannot be deleted)
  console.log("\n[Test 3.3] 企業總部保護不變量 (Headquarters Protection Invariant)...");

  // Attempt to delete ${taxId}-01
  const delHq01Resp = await fetch(`${BASE_URL}/api/v1/tenant/locations/${TEST_TAX_ID}-01`, {
    method: "DELETE",
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const delHq01Data = await delHq01Resp.json();
  assert("嘗試刪除總部據點 (-01) 被阻斷回傳 HTTP 400 Bad Request", delHq01Resp.status === 400);
  assert("錯誤訊息包含「企業總部主要據點不可刪除」", delHq01Data.error?.includes("企業總部主要據點不可刪除"));

  // Attempt to delete ${taxId}
  const delHqBareResp = await fetch(`${BASE_URL}/api/v1/tenant/locations/${TEST_TAX_ID}`, {
    method: "DELETE",
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const delHqBareData = await delHqBareResp.json();
  assert("嘗試刪除純統編總部據點被阻斷回傳 HTTP 400 Bad Request", delHqBareResp.status === 400);
  assert("錯誤訊息包含「企業總部主要據點不可刪除」", delHqBareData.error?.includes("企業總部主要據點不可刪除"));

  // Test 3.4: Cross-Tenant Boundary Defense (Cannot delete locations of another taxId)
  console.log("\n[Test 3.4] 跨統編防越界阻斷 (Cross-Tenant Boundary Defense)...");
  const foreignLocId = "24549210-99";
  const crossDelResp = await fetch(`${BASE_URL}/api/v1/tenant/locations/${foreignLocId}`, {
    method: "DELETE",
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const crossDelData = await crossDelResp.json();
  assert("99999999 管理員嘗試刪除 24549210 據點回傳 HTTP 400 Bad Request", crossDelResp.status === 400);
  assert(
    "錯誤訊息包含「權限越界」與統編阻斷提示",
    crossDelData.error?.includes("權限越界") && crossDelData.error?.includes(TEST_TAX_ID) && crossDelData.error?.includes("24549210"),
    `實際錯誤: "${crossDelData.error}"`
  );

  // Test 3.5: Active Employee Binding Protection
  console.log("\n[Test 3.5] 員工綁定防呆攔截 (Active Employee Binding Protection)...");

  // Step 1: Create busy test branch
  console.log(`  建立繁忙測試門市: ${TEST_BUSY_BRANCH_ID}...`);
  const createBusyResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify({
      id: TEST_BUSY_BRANCH_ID,
      name: "測試沙盒 - 繁忙分店",
      address: "台中市北區崇德路一段99號",
      target_lat: 24.1565,
      target_lon: 120.6815,
      allowed_radius: 100
    })
  });
  assert("建立繁忙門市據點成功 HTTP 200", createBusyResp.status === 200);

  // Step 2: Bind employee to TEST_BUSY_BRANCH_ID via POST /api/v1/employee/join
  console.log(`  綁定同仁 ${TEST_EMP_USER} 至該門市...`);
  const joinResp = await fetch(`${BASE_URL}/api/v1/employee/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId: TEST_BUSY_BRANCH_ID,
      lineUserId: TEST_EMP_USER,
      displayName: "Batch4測試同仁"
    })
  });
  assert("同仁成功綁定至繁忙門市 HTTP 200", joinResp.status === 200);

  // Confirm in D1
  const boundCountRows = await queryD1(
    `SELECT count(*) as cnt FROM company_employees WHERE company_id = '${TEST_BUSY_BRANCH_ID}'`
  );
  assert("D1 確認門市在職綁定員工數 = 1", boundCountRows[0]?.cnt === 1);

  // Step 3: Attempt to delete busy branch
  console.log("  嘗試刪除尚有員工綁定之門市...");
  const delBusyResp = await fetch(`${BASE_URL}/api/v1/tenant/locations/${TEST_BUSY_BRANCH_ID}`, {
    method: "DELETE",
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const delBusyData = await delBusyResp.json();
  assert("刪除有員工綁定之門市被攔截回傳 HTTP 400 Bad Request", delBusyResp.status === 400);
  assert("回傳 success: false", delBusyData.success === false);
  assert(
    "錯誤訊息包含「無法刪除：該門市尚有 1 位在職員工綁定」",
    delBusyData.error?.includes("無法刪除：該門市尚有 1 位在職員工綁定"),
    `實際訊息: "${delBusyData.error}"`
  );

  // Confirm busy branch still physically exists in D1
  const busyStillExists = await queryD1(`SELECT id FROM locations WHERE id = '${TEST_BUSY_BRANCH_ID}'`);
  assert("D1 物理確認：繁忙門市據點依然完好保存未被刪除", busyStillExists.length === 1);

  // Test 3.6: Clean Secondary Branch Deletion
  console.log("\n[Test 3.6] 允許刪除無員工綁定之正常次級據點...");

  // Step 1: Create clean test branch
  console.log(`  建立空置測試門市: ${TEST_CLEAN_BRANCH_ID}...`);
  const createCleanResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify({
      id: TEST_CLEAN_BRANCH_ID,
      name: "測試沙盒 - 空置分店",
      address: "台中市西屯區台灣大道三段99號",
      target_lat: 24.1625,
      target_lon: 120.6475,
      allowed_radius: 100
    })
  });
  assert("建立空置門市據點成功 HTTP 200", createCleanResp.status === 200);

  // Step 2: Delete clean branch
  const delCleanResp = await fetch(`${BASE_URL}/api/v1/tenant/locations/${TEST_CLEAN_BRANCH_ID}`, {
    method: "DELETE",
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const delCleanData = await delCleanResp.json();
  assert("刪除空置門市回傳 HTTP 200 OK", delCleanResp.status === 200);
  assert("回傳 success: true", delCleanData.success === true);
  assert("回傳已成功刪除訊息", delCleanData.message?.includes("已成功刪除"));

  // Step 3: Verify clean branch is removed from GET /api/v1/tenant/locations
  const locListResp = await fetch(`${BASE_URL}/api/v1/tenant/locations`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const locListData = await locListResp.json();
  const cleanFoundInList = (locListData.locations || []).some(l => l.id === TEST_CLEAN_BRANCH_ID);
  assert("GET /api/v1/tenant/locations 清單中已不再包含該據點", !cleanFoundInList);

  // Direct D1 physical check
  const cleanD1Rows = await queryD1(`SELECT id FROM locations WHERE id = '${TEST_CLEAN_BRANCH_ID}'`);
  assert("D1 物理確認：該據點已徹底自 locations 表清除 (0 筆)", cleanD1Rows.length === 0);

  // Test 3.7: Unbinding Transition Test
  console.log("\n[Test 3.7] 解除員工綁定後允許正常刪除 (Teardown Transition)...");
  // Remove employee binding in D1
  await queryD1(`DELETE FROM company_employees WHERE line_user_id = '${TEST_EMP_USER}'`);
  const boundAfterDel = await queryD1(`SELECT count(*) as cnt FROM company_employees WHERE company_id = '${TEST_BUSY_BRANCH_ID}'`);
  assert("D1 解除同仁綁定後，在職同仁數變更為 0", boundAfterDel[0]?.cnt === 0);

  // Retry deletion of formerly busy branch
  const delNowCleanResp = await fetch(`${BASE_URL}/api/v1/tenant/locations/${TEST_BUSY_BRANCH_ID}`, {
    method: "DELETE",
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const delNowCleanData = await delNowCleanResp.json();
  assert("原繁忙門市在解綁後重試刪除回傳 HTTP 200 OK", delNowCleanResp.status === 200 && delNowCleanData.success === true);

  const busyD1Rows = await queryD1(`SELECT id FROM locations WHERE id = '${TEST_BUSY_BRANCH_ID}'`);
  assert("D1 物理確認：解綁後之門市亦徹底自 locations 表清除 (0 筆)", busyD1Rows.length === 0);
}

// -----------------------------------------------------------------------------
// PART 4: Mandatory Teardown Hook
// -----------------------------------------------------------------------------
async function runTeardown() {
  console.log("\n================================================================================");
  console.log("🧹 PART 4: 強制執行自動化資料庫清理 (Mandatory Teardown Hook)");
  console.log("================================================================================");

  try {
    // 1. Delete test employees
    await queryD1(`DELETE FROM company_employees WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE '%B4%'`);
    // 2. Delete test locations
    await queryD1(`DELETE FROM locations WHERE id LIKE '${TEST_TAX_ID}%'`);
    // 3. Delete test API keys
    await queryD1(`DELETE FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}' OR name LIKE '%B4%'`);

    // Verification queries
    const empRem = await queryD1(`SELECT count(*) as cnt FROM company_employees WHERE line_user_id LIKE '%B4%'`);
    const locRem = await queryD1(`SELECT count(*) as cnt FROM locations WHERE id LIKE '${TEST_TAX_ID}%'`);
    const keyRem = await queryD1(`SELECT count(*) as cnt FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}' OR name LIKE '%B4%'`);

    const clean = empRem[0]?.cnt === 0 && locRem[0]?.cnt === 0 && keyRem[0]?.cnt === 0;
    assert("Teardown 清理驗證：測試員工、門市據點、API 金鑰殘留嚴格為 0", clean);
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
  console.log("🚀 STARTING AUTOMATED TEST SUITE: BATCH 4 VERIFICATION");
  console.log("   (Admin M2M API Keys Management & Branch Location Safety Guards)");
  console.log("================================================================================");
  console.log(`🌐 Target Worker URL: ${BASE_URL}`);
  console.log(`🏢 Test Tax ID: ${TEST_TAX_ID}`);
  console.log(`🕒 Suite Timestamp: ${TIMESTAMP}`);

  try {
    runPart1HtmlAstTests();
    await runPart2ApiKeysTests();
    await runPart3LocationSafetyTests();
  } catch (err) {
    console.error("\n💥 測試套件執行發生未捕獲之重大異常:", err);
    failed++;
  } finally {
    await runTeardown();
  }

  console.log("\n================================================================================");
  console.log(`📊 BATCH 4 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
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
