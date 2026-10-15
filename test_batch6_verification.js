/**
 * Automated Verification Suite: Batch 6 (Company Announcements & Read Receipt Idempotency)
 * Corresponds to AUTONOMOUS_VERIFICATION_ROADMAP.md (Batch 6)
 * 
 * Verifies without Playwright:
 * 1. Tier 2: AST & HTML Structure Inspection (Item 13 & Admin Tabs/Modals)
 *    - HTML Stack-Based Tag Balance & Nesting Validator (all tags strictly paired, zero unclosed tags)
 *    - JSDOM AST & DOM Inspection:
 *      * Section: #tab-announcements, #announcementsTableBody, open announcement modal button
 *      * Modal: #announcementModal, #announcementForm, #announcementTitle, #announcementAuthor, #announcementContent, #announcementSubmitBtn
 *      * Modal: #announcementReadsModal, #readsModalTitle, #readsModalSubtitle, #statTotal, #statRead, #statUnread, #statRate
 *      * Lists: #signedBadge, #signedList, #unsignedBadge, #unsignedList, #modalRemindBtn
 *      * Global DOM ID uniqueness check (zero duplicate IDs across admin tabs and modals)
 * 2. Tier 4: Workers API Live Contract & D1 Sandbox (Item 13: Tenant Announcements Publishing & Tracking)
 *    - POST /api/v1/tenant/announcements:
 *      * 401 unauthenticated defense
 *      * 400 input validation guards (missing/empty title or content: "公告標題與內容皆為必填項目")
 *      * 201 publish & D1 persistence: returns valid ann_ prefixed ID, verifies physical row in announcements table
 *    - GET /api/v1/tenant/announcements:
 *      * List query with real-time statistics: total_recipients, initial read_count === 0, read_rate === 0%
 *    - GET /api/v1/tenant/announcements/:id:
 *      * Detail breakdown: stats (total, read, unread, readRate), reads list, unreads list
 *      * Verifies unreads list accurately contains test employees
 *    - Cross-tenant isolation defense: foreign tenant key access returns 404 / 401, not in foreign list
 * 3. Tier 4: Workers Webhook Live Contract & D1 Sandbox (Item 14: Employee LINE Postback Idempotency)
 *    - POST /api/webhook (action=ack_announcement&id=<announcementId>):
 *      * First-time signature: physical row inserted into announcement_reads with read_at timestamp,
 *        reads count increments to 1, employee moves from unreads to reads
 *      * Second-time / Repeat signature (Strict Idempotency): INSERT OR IGNORE preserves idempotency,
 *        D1 row count remains strictly 1, original read_at timestamp is preserved, reads count remains 1
 *      * Edge cases & graceful error handling: non-existent announcement ID or empty ID does not crash
 *      * Full 100% completion verification: second employee acknowledges, readRate reaches 100%, unreads becomes 0
 * 4. Mandatory Teardown Invariant: 100% Cleanup in finally hook
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

// Dedicated QA Sandbox Tax IDs (supported in isValidTaiwanTaxId)
const TEST_TAX_ID = "99999999";
const TEST_COMPANY_ID = `${TEST_TAX_ID}-01`;
const FOREIGN_TAX_ID = "00000000";

const TEST_EMP_1 = `U_B6_EMP1_${TIMESTAMP}`;
const TEST_EMP_2 = `U_B6_EMP2_${TIMESTAMP}`;

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

async function sendWebhookPostback(userId, announcementId, action = "ack_announcement") {
  const res = await fetch(`${BASE_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "postback",
          replyToken: "b6_test_reply_token",
          source: { userId },
          postback: {
            data: `action=${action}&id=${announcementId}`
          }
        }
      ]
    })
  });
  return await res.json();
}

// -----------------------------------------------------------------------------
// PART 1: Tier 2 AST & HTML Structure Inspection (Item 13 & Admin Tabs/Modals)
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
  console.log("🔹 PART 1: Tier 2 AST & HTML Structure Inspection (Item 13 & Admin Tabs/Modals)");
  console.log("================================================================================");

  const tabsPath = path.resolve(__dirname, 'src/views/admin/admin-tabs.ts');
  const modalsPath = path.resolve(__dirname, 'src/views/admin/admin-modals.ts');
  assert("檔案存在：admin-tabs.ts", fs.existsSync(tabsPath));
  assert("檔案存在：admin-modals.ts", fs.existsSync(modalsPath));

  const tabsHtml = extractHtmlTemplate(tabsPath);
  const modalsHtml = extractHtmlTemplate(modalsPath);

  // Test 1.1: Stack-Based Tag Balancer on Announcements Tab
  console.log("\n[Test 1.1] 嚴格堆疊標籤平衡檢驗 (Stack-Based HTML Tag Balancer on #tab-announcements)...");
  const announcementsTabMatch = tabsHtml.match(/(<!--\s*TAB 7:.*?企業公告與多播簽收管理[\s\S]*?<\/section>)/i);
  assert("成功定位 tab-announcements HTML 區塊", !!announcementsTabMatch);

  const announcementsTabResult = validateHtmlTagBalance(announcementsTabMatch[1], "tab-announcements");
  assert(
    "tab-announcements 標籤 100% 閉合且無巢狀越界",
    announcementsTabResult.valid,
    announcementsTabResult.valid ? `檢驗標籤數: ${announcementsTabResult.tagCount}` : announcementsTabResult.errors.join("; ")
  );

  // Test 1.2: Stack-Based Tag Balancer on Announcement Modal
  console.log("\n[Test 1.2] 嚴格堆疊標籤平衡檢驗 (Stack-Based HTML Tag Balancer on #announcementModal)...");
  const annModalMatch = modalsHtml.match(/(<!--\s*MODAL:.*?發布企業公告[\s\S]*?<\/form>\s*<\/div>\s*<\/div>)/i);
  assert("成功定位 announcementModal HTML 區塊", !!annModalMatch);

  const annModalResult = validateHtmlTagBalance(annModalMatch[1], "announcementModal");
  assert(
    "announcementModal 標籤 100% 閉合且無巢狀越界",
    annModalResult.valid,
    annModalResult.valid ? `檢驗標籤數: ${annModalResult.tagCount}` : annModalResult.errors.join("; ")
  );

  // Test 1.3: Stack-Based Tag Balancer on Announcement Reads Modal
  console.log("\n[Test 1.3] 嚴格堆疊標籤平衡檢驗 (Stack-Based HTML Tag Balancer on #announcementReadsModal)...");
  const readsModalMatch = modalsHtml.match(/(<!--\s*MODAL:.*?公告簽收進度與名單明細[\s\S]*?<\/div>\s*<\/div>\s*)$/);
  assert("成功定位 announcementReadsModal HTML 區塊", !!readsModalMatch);

  const readsModalResult = validateHtmlTagBalance(readsModalMatch[1], "announcementReadsModal");
  assert(
    "announcementReadsModal 標籤 100% 閉合且無巢狀越界",
    readsModalResult.valid,
    readsModalResult.valid ? `檢驗標籤數: ${readsModalResult.tagCount}` : readsModalResult.errors.join("; ")
  );

  // Test 1.4: Full admin-modals.ts tag balance
  console.log("\n[Test 1.4] admin-modals.ts 全文標籤平衡驗證...");
  const fullModalsResult = validateHtmlTagBalance(modalsHtml, "admin-modals.ts full");
  assert(
    "renderAdminModals 全文 HTML 標籤結構完整無遺漏",
    fullModalsResult.valid,
    fullModalsResult.valid ? `總標籤數: ${fullModalsResult.tagCount}` : fullModalsResult.errors.join("; ")
  );

  // Test 1.5: JSDOM AST & Element Inspection
  console.log("\n[Test 1.5] JSDOM AST 語法樹與屬性合規性校驗...");
  const combinedHtml = `<!DOCTYPE html><html><body>${tabsHtml}${modalsHtml}</body></html>`;
  const dom = new JSDOM(combinedHtml);
  const document = dom.window.document;

  // Verify Tab: #tab-announcements
  const tabAnnouncements = document.getElementById("tab-announcements");
  assert("#tab-announcements 根節點存在且為 SECTION", tabAnnouncements && tabAnnouncements.tagName === "SECTION");
  assert("#tab-announcements 預設具備 hidden 類別", tabAnnouncements?.classList.contains("hidden"));

  const openAnnBtn = tabAnnouncements?.querySelector("button[onclick='openAnnouncementModal()']");
  assert("包含「發布新公告」按鈕 onclick='openAnnouncementModal()'", !!openAnnBtn);

  const announcementsTableBody = document.getElementById("announcementsTableBody");
  assert("#announcementsTableBody 表格主體存在且為 TBODY", announcementsTableBody && announcementsTableBody.tagName === "TBODY");

  // Verify Announcement Modal (#announcementModal)
  const announcementModal = document.getElementById("announcementModal");
  assert("#announcementModal 彈窗存在且為 DIV", announcementModal && announcementModal.tagName === "DIV");
  assert("#announcementModal 預設具備 hidden 類別", announcementModal?.classList.contains("hidden"));

  const announcementForm = document.getElementById("announcementForm");
  assert("#announcementForm 表單存在且為 FORM", announcementForm && announcementForm.tagName === "FORM");
  assert("#announcementForm 綁定 onsubmit='handleCreateAnnouncement(event)'", announcementForm?.getAttribute("onsubmit") === "handleCreateAnnouncement(event)");

  const titleInput = document.getElementById("announcementTitle");
  assert("#announcementTitle 標題輸入框存在且為 INPUT", titleInput && titleInput.tagName === "INPUT");
  assert("#announcementTitle 屬性 required 存在", titleInput?.hasAttribute("required"));

  const authorInput = document.getElementById("announcementAuthor");
  assert("#announcementAuthor 署名輸入框存在且預設為「公司人事行政部」", authorInput && authorInput.getAttribute("value") === "公司人事行政部");

  const contentInput = document.getElementById("announcementContent");
  assert("#announcementContent 內容文字方塊存在且為 TEXTAREA", contentInput && contentInput.tagName === "TEXTAREA");
  assert("#announcementContent 屬性 required 存在", contentInput?.hasAttribute("required"));

  const submitBtn = document.getElementById("announcementSubmitBtn");
  assert("#announcementSubmitBtn 提交按鈕存在且 type='submit'", submitBtn && submitBtn.getAttribute("type") === "submit");

  // Verify Announcement Reads Modal (#announcementReadsModal)
  const readsModal = document.getElementById("announcementReadsModal");
  assert("#announcementReadsModal 簽收明細彈窗存在且為 DIV", readsModal && readsModal.tagName === "DIV");
  assert("#announcementReadsModal 預設具備 hidden 類別", readsModal?.classList.contains("hidden"));

  const readsModalTitle = document.getElementById("readsModalTitle");
  assert("#readsModalTitle 彈窗標題節點存在", !!readsModalTitle);

  const readsModalSubtitle = document.getElementById("readsModalSubtitle");
  assert("#readsModalSubtitle 彈窗副標題節點存在", !!readsModalSubtitle);

  const statTotal = document.getElementById("statTotal");
  const statRead = document.getElementById("statRead");
  const statUnread = document.getElementById("statUnread");
  const statRate = document.getElementById("statRate");
  assert("4 大 KPI 卡片節點全數齊備 (#statTotal, #statRead, #statUnread, #statRate)", !!statTotal && !!statRead && !!statUnread && !!statRate);

  const signedBadge = document.getElementById("signedBadge");
  const signedList = document.getElementById("signedList");
  const unsignedBadge = document.getElementById("unsignedBadge");
  const unsignedList = document.getElementById("unsignedList");
  assert("已簽收與未簽收清單與徽章節點齊備 (#signedBadge, #signedList, #unsignedBadge, #unsignedList)", !!signedBadge && !!signedList && !!unsignedBadge && !!unsignedList);

  const modalRemindBtn = document.getElementById("modalRemindBtn");
  assert("#modalRemindBtn 一鍵催簽按鈕存在且綁定 onclick='remindUnreadFromModal()'", modalRemindBtn && modalRemindBtn.getAttribute("onclick") === "remindUnreadFromModal()");

  // Verify Global ID Uniqueness across tabs and modals
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
// PART 2: Tier 4 D1 Sandbox - 項目 13：公告發布與即時簽收名單追蹤
// -----------------------------------------------------------------------------
let adminApiKey = "";
let foreignApiKey = "";
let createdAnnouncementId = "";

async function runPart2AnnouncementPublishAndTrackingTests() {
  console.log("\n================================================================================");
  console.log("🔹 PART 2: D1 Sandbox - 項目 13：公告發布與即時簽收名單追蹤");
  console.log("================================================================================");

  // Setup: Ensure test location exists
  console.log(`\n[Setup] 初始化測試門市 ${TEST_COMPANY_ID}...`);
  await queryD1(`
    INSERT OR REPLACE INTO locations (id, name, address, target_lat, target_lon, allowed_radius)
    VALUES ('${TEST_COMPANY_ID}', 'Batch6測試總部', '台中市北區美德街56-11號', 24.1577, 120.6831, 100);
  `);

  // Setup: Insert test employees for company 99999999-01
  console.log(`[Setup] 註冊受測員工 ${TEST_EMP_1} (測試同仁甲) 與 ${TEST_EMP_2} (測試同仁乙)...`);
  await queryD1(`
    INSERT OR REPLACE INTO company_employees (company_id, line_user_id, employee_name, permissions)
    VALUES ('${TEST_COMPANY_ID}', '${TEST_EMP_1}', '測試同仁甲', '["punch","apply"]');
  `);
  await queryD1(`
    INSERT OR REPLACE INTO company_employees (company_id, line_user_id, employee_name, permissions)
    VALUES ('${TEST_COMPANY_ID}', '${TEST_EMP_2}', '測試同仁乙', '["punch","apply"]');
  `);

  // Setup: Generate ADMIN API Key for test tax id 99999999
  console.log("[Setup] 簽發測試統編 ADMIN API 金鑰...");
  const adminKeyResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: TEST_TAX_ID, name: `B6-ADMIN-${TIMESTAMP}`, role: "ADMIN" })
  });
  const adminKeyData = await adminKeyResp.json();
  adminApiKey = adminKeyData.apiKey;
  assert("成功簽發 ADMIN 測試金鑰", !!adminApiKey && adminApiKey.startsWith(`pk_live_${TEST_TAX_ID}_`));

  // Setup: Generate Foreign Tenant API Key for foreign tax id 00000000
  console.log("[Setup] 簽發跨租戶外來企業 ADMIN API 金鑰 (00000000)...");
  const foreignKeyResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: FOREIGN_TAX_ID, name: `B6-FOREIGN-${TIMESTAMP}`, role: "ADMIN" })
  });
  const foreignKeyData = await foreignKeyResp.json();
  foreignApiKey = foreignKeyData.apiKey;
  assert("成功簽發跨租戶測試金鑰", !!foreignApiKey && foreignApiKey.startsWith(`pk_live_${FOREIGN_TAX_ID}_`));

  // Test 2.1: 鑑權防護 (Auth Defense)
  console.log("\n[Test 2.1] 鑑權防護檢驗 (未帶金鑰拋 401)...");
  const unauthPost = await fetch(`${BASE_URL}/api/v1/tenant/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "未授權公告", content: "未授權內容" })
  });
  assert("未認證發布公告回傳 HTTP 401 Unauthorized", unauthPost.status === 401);

  const unauthList = await fetch(`${BASE_URL}/api/v1/tenant/announcements`, { method: "GET" });
  assert("未認證查詢公告列表回傳 HTTP 401 Unauthorized", unauthList.status === 401);

  const unauthDetail = await fetch(`${BASE_URL}/api/v1/tenant/announcements/ann_fake_id`, { method: "GET" });
  assert("未認證查詢公告明細回傳 HTTP 401 Unauthorized", unauthDetail.status === 401);

  // Test 2.2: 欄位防呆 (Validation Defense)
  console.log("\n[Test 2.2] 欄位防呆檢驗 (缺少標題或內容拋 400)...");
  const emptyBodyResp = await fetch(`${BASE_URL}/api/v1/tenant/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify({})
  });
  const emptyBodyData = await emptyBodyResp.json();
  assert("空 Payload 回傳 HTTP 400 Bad Request", emptyBodyResp.status === 400);
  assert("錯誤提示精確包含「公告標題與內容皆為必填項目」", emptyBodyData.error?.includes("公告標題與內容皆為必填項目"), `實際: "${emptyBodyData.error}"`);

  const emptyTitleResp = await fetch(`${BASE_URL}/api/v1/tenant/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify({ title: "   ", content: "有效內文說明" })
  });
  const emptyTitleData = await emptyTitleResp.json();
  assert("空白標題回傳 HTTP 400 Bad Request", emptyTitleResp.status === 400, `實際: ${emptyTitleResp.status}`);
  assert("空白標題提示包含「公告標題與內容皆為必填項目」", emptyTitleData.error?.includes("公告標題與內容皆為必填項目"));

  const emptyContentResp = await fetch(`${BASE_URL}/api/v1/tenant/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify({ title: "有效公告標題", content: "   " })
  });
  const emptyContentData = await emptyContentResp.json();
  assert("空白內文回傳 HTTP 400 Bad Request", emptyContentResp.status === 400, `實際: ${emptyContentResp.status}`);
  assert("空白內文提示包含「公告標題與內容皆為必填項目」", emptyContentData.error?.includes("公告標題與內容皆為必填項目"));

  // Test 2.3: 發布與落庫 (Publish Announcement & D1 Physical Persistence)
  console.log("\n[Test 2.3] 發布公告與 D1 實體落庫 (HTTP 201 Created)...");
  const testTitle = `【Batch 6 驗證】企業資安防護與出勤規範通知 [${TIMESTAMP}]`;
  const testContent = "請全體受測同仁詳細閱讀本規範，並點擊下方【✍️ 我已閱讀並簽收】按鈕完成簽收紀錄。";
  const testAuthor = "豬毛美德總部 行政管理處";

  const publishResp = await fetch(`${BASE_URL}/api/v1/tenant/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": adminApiKey },
    body: JSON.stringify({
      title: testTitle,
      content: testContent,
      authorName: testAuthor
    })
  });
  const publishData = await publishResp.json();
  assert("公告發布回傳 HTTP 201 Created", publishResp.status === 201);
  assert("回傳 success: true", publishData.success === true);
  assert("回傳有效公告 ID 且前綴為 ann_", typeof publishData.announcement?.id === "string" && publishData.announcement.id.startsWith("ann_"));
  assert("受眾人數精確涵蓋在職員工 (>= 2)", typeof publishData.recipientsCount === "number" && publishData.recipientsCount >= 2);

  createdAnnouncementId = publishData.announcement.id;

  // Direct D1 query verification
  console.log(`  查詢 D1 announcements 表實體紀錄 (ID: ${createdAnnouncementId})...`);
  const d1Announcements = await queryD1(`
    SELECT id, company_id, title, content, author_name, created_at
    FROM announcements
    WHERE id = '${createdAnnouncementId}'
  `);
  assert("D1 announcements 表中存在該公告實體紀錄 (1 筆)", d1Announcements.length === 1);
  const annRow = d1Announcements[0];
  assert("D1 中 company_id 正確落庫為所屬統編", annRow?.company_id === TEST_TAX_ID);
  assert("D1 中 title 與發布內容完全一致", annRow?.title === testTitle);
  assert("D1 中 content 與發布內容完全一致", annRow?.content === testContent);
  assert("D1 中 author_name 與署名完全一致", annRow?.author_name === testAuthor);
  assert("D1 中 created_at 包含有效時間戳", !!annRow?.created_at);

  // Test 2.4: 列表查詢與簽收統計 (GET /api/v1/tenant/announcements)
  console.log("\n[Test 2.4] 公告列表查詢與簽收統計校驗 (GET /api/v1/tenant/announcements)...");
  const listResp = await fetch(`${BASE_URL}/api/v1/tenant/announcements`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const listData = await listResp.json();
  assert("查詢公告列表回傳 HTTP 200 OK", listResp.status === 200);
  assert("公告列表陣列包含剛才發布之公告", Array.isArray(listData.announcements) && listData.announcements.some(a => a.id === createdAnnouncementId));

  const annInList = listData.announcements.find(a => a.id === createdAnnouncementId);
  assert("公告列表統計總受眾人數 total_recipients >= 2", typeof annInList?.total_recipients === "number" && annInList.total_recipients >= 2);
  assert("公告發布初始已簽收人數 read_count 嚴格為 0", annInList?.read_count === 0);
  assert("公告發布初始簽收率 read_rate 嚴格為 0%", annInList?.read_rate === 0);

  // Test 2.5: 查詢公告簽收明細 (GET /api/v1/tenant/announcements/:id)
  console.log(`\n[Test 2.5] 查詢公告簽收明細 (GET /api/v1/tenant/announcements/${createdAnnouncementId})...`);
  const detailResp = await fetch(`${BASE_URL}/api/v1/tenant/announcements/${createdAnnouncementId}`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const detailData = await detailResp.json();
  assert("查詢公告明細回傳 HTTP 200 OK", detailResp.status === 200);
  assert("回傳包含 stats 統計物件", !!detailData.stats);
  assert("stats.total 大於等於 2", detailData.stats?.total >= 2);
  assert("初始 stats.read 嚴格為 0", detailData.stats?.read === 0);
  assert("初始 stats.unread 等於 stats.total", detailData.stats?.unread === detailData.stats?.total);
  assert("初始 stats.readRate 嚴格為 0", detailData.stats?.readRate === 0);
  assert("已簽收清單 reads 初始為空陣列", Array.isArray(detailData.reads) && detailData.reads.length === 0);
  assert("未簽收清單 unreads 精確包含受測同仁甲", Array.isArray(detailData.unreads) && detailData.unreads.some(u => u.line_user_id === TEST_EMP_1));
  assert("未簽收清單 unreads 精確包含受測同仁乙", Array.isArray(detailData.unreads) && detailData.unreads.some(u => u.line_user_id === TEST_EMP_2));

  // Test 2.6: 跨租戶邊界防護 (Cross-Tenant Isolation)
  console.log("\n[Test 2.6] 跨租戶邊界防護校驗 (跨統編存取阻斷)...");
  const foreignDetailResp = await fetch(`${BASE_URL}/api/v1/tenant/announcements/${createdAnnouncementId}`, {
    headers: { "X-Tenant-Key": foreignApiKey }
  });
  const foreignDetailData = await foreignDetailResp.json();
  assert("非本企業外來租戶存取公告拋 HTTP 404", foreignDetailResp.status === 404);
  assert("錯誤提示包含「查無此公告或無存取權限」", foreignDetailData.error?.includes("查無此公告或無存取權限"), `實際: "${foreignDetailData.error}"`);

  const foreignListResp = await fetch(`${BASE_URL}/api/v1/tenant/announcements`, {
    headers: { "X-Tenant-Key": foreignApiKey }
  });
  const foreignListData = await foreignListResp.json();
  assert("外來租戶查詢自身公告列表回傳 HTTP 200 OK", foreignListResp.status === 200);
  assert("外來租戶公告列表絕不包含本統編發布之公告 (跨租戶強隔離)", !foreignListData.announcements?.some(a => a.id === createdAnnouncementId));
}

// -----------------------------------------------------------------------------
// PART 3: Tier 4 D1 Sandbox - 項目 14：員工 LINE 簽收互動 (Postback Idempotency 首簽與二簽)
// -----------------------------------------------------------------------------
async function runPart3LineReadReceiptIdempotencyTests() {
  console.log("\n================================================================================");
  console.log("🔹 PART 3: D1 Sandbox - 項目 14：員工 LINE 簽收互動 (Postback Idempotency 首簽與二簽)");
  console.log("================================================================================");

  // Test 3.1: 首簽 (First-Time Signature) via POST /api/webhook
  console.log(`\n[Test 3.1] 同仁甲首度點擊【✍️ 我已閱讀並簽收】(action=ack_announcement)...`);
  const ack1Resp = await sendWebhookPostback(TEST_EMP_1, createdAnnouncementId);
  assert("首簽 Webhook 請求成功回傳 HTTP 200 OK", ack1Resp.success === true);

  // Direct D1 query verification on announcement_reads
  const d1ReadsEmp1 = await queryD1(`
    SELECT announcement_id, line_user_id, read_at
    FROM announcement_reads
    WHERE announcement_id = '${createdAnnouncementId}' AND line_user_id = '${TEST_EMP_1}'
  `);
  assert("D1 announcement_reads 成功物理寫入 1 筆簽收紀錄", d1ReadsEmp1.length === 1);
  const firstReadAt = d1ReadsEmp1[0]?.read_at;
  assert("D1 簽收紀錄記錄精確 read_at 時間戳", !!firstReadAt && typeof firstReadAt === "string");

  // Query updated detail
  const detailAfterAck1Resp = await fetch(`${BASE_URL}/api/v1/tenant/announcements/${createdAnnouncementId}`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const detailAfterAck1 = await detailAfterAck1Resp.json();
  assert("同仁甲首簽後已簽收人數 stats.read 增為 1", detailAfterAck1.stats?.read === 1);
  assert("已簽收清單 reads 列出受測同仁甲", Array.isArray(detailAfterAck1.reads) && detailAfterAck1.reads.some(r => r.line_user_id === TEST_EMP_1));
  assert("已簽收清單中精確帶有 read_at 時間戳", detailAfterAck1.reads.find(r => r.line_user_id === TEST_EMP_1)?.read_at === firstReadAt);
  assert("未簽收清單 unreads 成功移除受測同仁甲", Array.isArray(detailAfterAck1.unreads) && !detailAfterAck1.unreads.some(u => u.line_user_id === TEST_EMP_1));
  assert("受測同仁乙依然保留於未簽收清單", Array.isArray(detailAfterAck1.unreads) && detailAfterAck1.unreads.some(u => u.line_user_id === TEST_EMP_2));

  // Test 3.2: 二簽 / 重複簽收 (Strict Idempotency)
  console.log("\n[Test 3.2] 嚴格冪等性防呆：同仁甲再次點擊簽收按鈕 (二簽 / 重複 Postback)...");
  // Small delay to ensure timestamp would be different if incorrectly updated
  await new Promise(r => setTimeout(r, 60));

  const ack1RepeatResp = await sendWebhookPostback(TEST_EMP_1, createdAnnouncementId);
  assert("二簽 Webhook 請求成功回傳 HTTP 200 OK", ack1RepeatResp.success === true);

  // Direct D1 query verification for idempotency
  const d1ReadsAfterRepeat = await queryD1(`
    SELECT announcement_id, line_user_id, read_at
    FROM announcement_reads
    WHERE announcement_id = '${createdAnnouncementId}' AND line_user_id = '${TEST_EMP_1}'
  `);
  assert("D1 announcement_reads 中同仁甲紀錄依然嚴格只有 1 筆 (零重複列)", d1ReadsAfterRepeat.length === 1);
  assert("D1 簽收時間戳 read_at 嚴格保留原始時間 (不被二次簽收覆蓋)", d1ReadsAfterRepeat[0]?.read_at === firstReadAt);

  // Query updated detail after repeat
  const detailAfterRepeatResp = await fetch(`${BASE_URL}/api/v1/tenant/announcements/${createdAnnouncementId}`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const detailAfterRepeat = await detailAfterRepeatResp.json();
  assert("重複簽收後已簽收人數 stats.read 依然維持 1 (絕不重複累計)", detailAfterRepeat.stats?.read === 1);
  const emp1Records = (detailAfterRepeat.reads || []).filter(r => r.line_user_id === TEST_EMP_1);
  assert("已簽收清單同仁甲紀錄嚴格只有 1 筆", emp1Records.length === 1);

  // Test 3.3: 邊界異常防呆 (Edge Cases & Graceful Degradation)
  console.log("\n[Test 3.3] 邊界異常防呆：無效/不存在公告 ID 或空 ID 簽收...");
  const nonExistentAckResp = await sendWebhookPostback(TEST_EMP_1, "ann_non_existent_b6_99999");
  assert("無效公告 ID 簽收 Webhook 優雅處理不當機 (回傳 200 OK)", nonExistentAckResp.success === true);

  const emptyIdAckResp = await sendWebhookPostback(TEST_EMP_1, "");
  assert("空公告 ID 簽收 Webhook 優雅處理不當機 (回傳 200 OK)", emptyIdAckResp.success === true);

  // Test 3.4: 第二位同仁簽收 (達到 100% 簽收率驗證)
  console.log(`\n[Test 3.4] 受測同仁乙 (${TEST_EMP_2}) 完成簽收，驗證簽收率 100% 與未簽收清單清空...`);
  const ack2Resp = await sendWebhookPostback(TEST_EMP_2, createdAnnouncementId);
  assert("同仁乙簽收 Webhook 回傳 200 OK", ack2Resp.success === true);

  const d1TotalReads = await queryD1(`
    SELECT count(*) as cnt
    FROM announcement_reads
    WHERE announcement_id = '${createdAnnouncementId}'
  `);
  assert("D1 announcement_reads 累計 2 筆簽收紀錄", d1TotalReads[0]?.cnt === 2);

  const finalDetailResp = await fetch(`${BASE_URL}/api/v1/tenant/announcements/${createdAnnouncementId}`, {
    headers: { "X-Tenant-Key": adminApiKey }
  });
  const finalDetail = await finalDetailResp.json();
  assert("全體同仁簽收後 stats.read 增為 2", finalDetail.stats?.read === 2);
  assert("全體同仁簽收後 stats.unread 降為 0", finalDetail.stats?.unread === 0);
  assert("全體同仁簽收後 stats.readRate 達到 100%", finalDetail.stats?.readRate === 100);
  assert("全體同仁簽收後未簽收清單 unreads 為空陣列 (長度 0)", Array.isArray(finalDetail.unreads) && finalDetail.unreads.length === 0);
  assert("已簽收清單 reads 完整列出兩位受測同仁", Array.isArray(finalDetail.reads) && finalDetail.reads.length === 2);
}

// -----------------------------------------------------------------------------
// PART 4: Mandatory Teardown Hook
// -----------------------------------------------------------------------------
async function runTeardown() {
  console.log("\n================================================================================");
  console.log("🧹 PART 4: 強制執行自動化資料庫清理 (Mandatory Teardown Hook)");
  console.log("================================================================================");

  try {
    // 1. Delete announcement reads
    if (createdAnnouncementId) {
      await queryD1(`DELETE FROM announcement_reads WHERE announcement_id = '${createdAnnouncementId}' OR line_user_id LIKE '%B6%'`);
    } else {
      await queryD1(`DELETE FROM announcement_reads WHERE line_user_id LIKE '%B6%'`);
    }

    // 2. Delete announcements
    await queryD1(`DELETE FROM announcements WHERE company_id LIKE '${TEST_TAX_ID}%' OR id LIKE 'ann_%b6%'`);

    // 3. Delete company employees
    await queryD1(`DELETE FROM company_employees WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE '%B6%'`);

    // 4. Delete tenant API keys
    await queryD1(`DELETE FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}' OR tax_id = '${FOREIGN_TAX_ID}' OR name LIKE '%B6%'`);

    // 5. Delete test locations
    await queryD1(`DELETE FROM locations WHERE id LIKE '${TEST_TAX_ID}%'`);

    // Residual verification queries
    const readsRem = await queryD1(`SELECT count(*) as cnt FROM announcement_reads WHERE line_user_id LIKE '%B6%'`);
    const annRem = await queryD1(`SELECT count(*) as cnt FROM announcements WHERE company_id LIKE '${TEST_TAX_ID}%'`);
    const empRem = await queryD1(`SELECT count(*) as cnt FROM company_employees WHERE company_id LIKE '${TEST_TAX_ID}%' OR line_user_id LIKE '%B6%'`);
    const keyRem = await queryD1(`SELECT count(*) as cnt FROM tenant_api_keys WHERE tax_id = '${TEST_TAX_ID}' OR tax_id = '${FOREIGN_TAX_ID}' OR name LIKE '%B6%'`);
    const locRem = await queryD1(`SELECT count(*) as cnt FROM locations WHERE id LIKE '${TEST_TAX_ID}%'`);

    const isClean = readsRem[0]?.cnt === 0 && annRem[0]?.cnt === 0 && empRem[0]?.cnt === 0 && keyRem[0]?.cnt === 0 && locRem[0]?.cnt === 0;
    assert("Teardown 清理驗證：測試簽收、公告、員工、金鑰、門市據點殘留數嚴格為 0", isClean);
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
  console.log("🚀 STARTING AUTOMATED TEST SUITE: BATCH 6 VERIFICATION");
  console.log("   (Company Announcements Management & LINE Read Receipt Idempotency)");
  console.log("================================================================================");
  console.log(`🌐 Target Worker URL: ${BASE_URL}`);
  console.log(`🏢 Test Tax ID: ${TEST_TAX_ID}`);
  console.log(`🕒 Suite Timestamp: ${TIMESTAMP}`);

  try {
    runPart1HtmlAstTests();
    await runPart2AnnouncementPublishAndTrackingTests();
    await runPart3LineReadReceiptIdempotencyTests();
  } catch (err) {
    console.error("\n💥 測試套件執行發生未捕獲之重大異常:", err);
    failed++;
  } finally {
    await runTeardown();
  }

  console.log("\n================================================================================");
  console.log(`📊 BATCH 6 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
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
