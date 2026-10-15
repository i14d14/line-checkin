# ADR-0067: Batch 6 自主驗證落地：企業公告發布與 LINE 簽收冪等性 (Batch 6 Company Announcements & Read Receipts Idempotency v2.27.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.27.0`  
> **領域分類 (Category)**: `Announcements & Notifications` / `LINE Webhook & BPM` / `Testing & Verification`

---

## 決策內容與架構推演 (Decision Record)

- **核心背景與待驗收範疇**：
  - 依據 [`AUTONOMOUS_VERIFICATION_ROADMAP.md`](file:///d:/line-checkin/AUTONOMOUS_VERIFICATION_ROADMAP.md) 之 Attention Budget Protocol，啟動 **Batch 6（企業公告與簽收冪等）** 之輕量化自主驗證。
  - 覆蓋兩大關鍵待驗證項目：
    1. **項目 13**：地端管理後台公告發布與即時簽收名單追蹤（已簽收/未簽收同仁明細）
    2. **項目 14**：員工 LINE 簽收互動（Postback Idempotency 首簽與二簽）
  - 嚴格遵守排除不變量：嚴禁對真實 LINE 用戶發送多播廣播，測試僅使用專屬測試統編 `99999999`、門市 `99999999-01` 與合成測試同仁（`U_B6_EMP1_...`、`U_B6_EMP2_...`）。
- **Tier 2 前端 HTML AST 語法樹與標籤閉合檢驗**：
  - **嚴格堆疊標籤平衡檢驗 (Stack-Based HTML Tag Balancer)**：
    - 遍歷 SSR 樣板字串，以先進後出（LIFO）堆疊檢驗所有非 void HTML 標籤。
    - 斷言 `src/views/admin/admin-tabs.ts` 中 `#tab-announcements`（企業公告分頁）標籤 100% 嚴格閉合、零巢狀越界。
    - 斷言 `src/views/admin/admin-modals.ts` 中 `#announcementModal`（公告發布彈窗）與 `#announcementReadsModal`（簽收進度彈窗）標籤 100% 嚴格閉合。
    - 斷言 `renderAdminModals()` 全文 HTML 標籤結構完整無遺漏（總標籤數 301）。
  - **JSDOM 語法樹與屬性合規性校驗**：
    - 驗證 `#tab-announcements` 包含「發布新公告」按鈕（`openAnnouncementModal()`）與表格主體 `#announcementsTableBody`（`TBODY`）。
    - 驗證 `#announcementModal` 包含表單 `#announcementForm`（`onsubmit="handleCreateAnnouncement(event)"`）、`#announcementTitle`（`required`）、`#announcementAuthor`（預設「公司人事行政部」）、`#announcementContent`（`required`）與提交按鈕 `#announcementSubmitBtn`（`type="submit"`）。
    - 驗證 `#announcementReadsModal` 包含 4 大 KPI 卡片節點（`#statTotal`, `#statRead`, `#statUnread`, `#statRate`）、已簽收與未簽收清單及徽章（`#signedBadge`, `#signedList`, `#unsignedBadge`, `#unsignedList`）、一鍵催簽按鈕 `#modalRemindBtn`（`remindUnreadFromModal()`）與關閉按鈕。
    - 斷言全域 DOM ID 唯一性（零重複 ID）。
- **Tier 4 D1 沙盒 - 項目 13：公告發布與即時簽收名單追蹤**：
  - **鑑權防護 (`POST /api/v1/tenant/announcements`, `GET /api/v1/tenant/announcements`, `GET /api/v1/tenant/announcements/:id`)**：
    - 未帶金鑰或空憑證存取精準回傳 HTTP 401 Unauthorized。
  - **欄位防呆與空白修剪 (Trim Validation)**：
    - 空 Payload、空白標題或空白內文請求均精確攔截並回傳 HTTP 400 Bad Request（「公告標題與內容皆為必填項目」），杜絕空白字串繞過驗證引發 500 異常。
  - **發布與 D1 實體落庫**：
    - 成功發布回傳 HTTP 201 Created，回傳有效 `ann_` 前綴 ID，D1 物理寫入 `announcements` 表（驗證 `company_id`, `title`, `content`, `author_name`, `created_at` 100% 一致）。
  - **列表查詢與即時簽收統計 (`GET /api/v1/tenant/announcements`)**：
    - 列表精確包含剛發布公告，`total_recipients >= 2`，初始 `read_count === 0`，初始 `read_rate === 0%`。
  - **簽收名單穿透檢視 (`GET /api/v1/tenant/announcements/:id`)**：
    - 回傳完整 `stats`（`total >= 2`, `read = 0`, `unread = total`, `readRate = 0%`）。
    - 初始 `reads` 為空陣列，`unreads` 精確包含受測同仁甲與乙。
  - **跨租戶邊界強隔離 (Cross-Tenant Boundary Protection)**：
    - 非本企業外來租戶（統編 `00000000` 金鑰）存取公告明細精準拋出 HTTP 404（「查無此公告或無存取權限」）。
    - 外來租戶查詢公告列表絕不包含本統編公告，杜絕跨企業資訊洩漏。
- **Tier 4 D1 沙盒 - 項目 14：員工 LINE 簽收互動 (Postback Idempotency 首簽與二簽)**：
  - **首簽物理落庫與狀態機流轉 (`action=ack_announcement&id=<announcementId>`)**：
    - 同仁甲首度點擊簽收，D1 `announcement_reads` 成功物理寫入 1 筆紀錄，記錄精確 `read_at` 時間戳。
    - 後台明細查詢即時反映：`stats.read` 增為 1，`reads` 列出同仁甲與簽收時間，`unreads` 成功排除同仁甲且同仁乙依然保留。
  - **二簽嚴格冪等性防呆 (Strict Idempotency Invariant)**：
    - 同仁甲重複點擊簽收按鈕，觸發 `INSERT OR IGNORE INTO announcement_reads`。
    - D1 物理驗證：同仁甲之簽收紀錄依然嚴格只有 1 筆（零重複列），原始 `read_at` 時間戳完好保留不被二次簽收覆蓋。
    - 後台明細驗證：`stats.read` 嚴格維持 1（絕不重複累計），`reads` 清單僅有 1 筆紀錄。
  - **邊界異常防呆與優雅降級**：
    - Postback 傳入無效/不存在之公告 ID 或空 ID 時，Webhook 處理邏輯優雅捕捉並回覆提示，系統 100% 穩定不崩潰。
  - **100% 簽收完備性**：
    - 同仁乙簽收後，D1 累計 2 筆紀錄，後台 `stats.read === 2`、`stats.unread === 0`、`stats.readRate === 100%`，`unreads` 降為空陣列。
- **強制環境自動清理 (Mandatory Teardown Hook)**：
  - 測試結束於 `finally` 區塊無條件執行 D1 清理，徹底清除測試簽收紀錄、公告、受測同仁、API 金鑰與測試門市據點，D1 殘留數嚴格為 0。
- **成效指標**：
  - 專屬測試套件 [`test_batch6_verification.js`](file:///d:/line-checkin/test_batch6_verification.js) **93/93 斷言全數通過（100% PASS）**。
  - `npm run check`（`build:client` + `client:check` + `typecheck` + `arch:check`）維持 **0 型別錯誤、0 架構違規**。
  - 邊緣部署成功熱更新至 Cloudflare Workers。
  - `LINE_CHECKIN_PROGRESS.md` 與 `AUTONOMOUS_VERIFICATION_ROADMAP.md` 正式將 Batch 6 項目 13、14 標記為 `[User Verified ✅]`。
