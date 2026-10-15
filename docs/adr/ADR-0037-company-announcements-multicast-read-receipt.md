# ADR-0037: 企業公告與 LINE Multicast 多播簽收確認系統 (Company Announcements & Multicast Read Receipt Acknowledgement ADR v2.13.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.13.0`  
> **領域分類 (Category)**: `Broadcast` / `Messaging`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. 企業發布營運異動、連假排班、重大天災或勞動合規通知時，需確保所有在職同仁於 LINE 內確實收到並知悉。
      2. 傳統 LINE Broadcast（全域廣播）會洩漏予機器人所有官方好友（跨租戶外洩），違反多租戶資料隔離核心準則。
      3. 管理後台缺乏即時閱讀率統計、無法穿透檢視個別員工簽收時間戳記，且缺乏「一鍵催簽」機制。
    - **架構升級原則與解法**：
      1. **嚴格多租戶多播隔絕 (Multicast over Broadcast)**：
         - 捨棄全域 `broadcast`，使用 LINE Messaging API Multicast (`POST /v2/bot/message/multicast`)。
         - 推播目標嚴格限定於所屬企業 `company_employees` 在職同仁之 `line_user_id` 陣列，達成 100% 租戶資料強隔離。
      2. **500 人切片演算法 (500-User Chunking Engine)**：
         - LINE Multicast API 單次請求限制上限為 500 位受眾。
         - 在 [`src/services/announcement.service.ts`](file:///d:/line-checkin/src/services/announcement.service.ts) 內建 `dispatchMulticast` 自動切片器，乾淨將受眾陣列切分為 500 人批次依序派送。
      3. **D1 資料庫 Schema v12 擴充與索引最佳化**：
         - 新增 `announcements`（公告主表：`id`, `company_id`, `title`, `content`, `author_name`, `created_at`，並建立 `idx_announcements_company`）。
         - 新增 `announcement_reads`（簽收紀錄表：`announcement_id`, `line_user_id`, `read_at` 複合主鍵，並建立 `idx_announcement_reads_id`）。
         - 建立專屬遷移指令檔 `migration_v12_announcements.sql` 並同步應用至正式環境 D1 資料庫。
      4. **Postback 互動簽收與嚴格冪等防呆回執 (Idempotent Webhook Receipt)**：
         - 深藍（`#0F172A`）與翡翠綠（`#10B981`）搭配琥珀金色（`#F59E0B`）優先級標籤之專業企業 Flex 卡片。
         - 卡片內嵌顯著 CTA 按鈕：`【✍️ 我已閱讀並簽收】`（`postback: action=ack_announcement&id=${announcementId}`）。
         - 員工點擊時，Webhook 以 `INSERT OR IGNORE` 確保不可重複寫入：
           - 首次簽收：`✅ 【簽收完成】您已成功簽收公告「${title}」，紀錄已回傳管理後台。`
           - 重複點擊：`ℹ️ 【提醒】您先前已於 ${readAt} 完成簽收此公告。`（絕不重複累計人數或更新既有時間戳記）。
      5. **地端管理後台 (`/admin`) 企業公告工作台與名單穿透檢視**：
         - 導覽列擴充【📢 企業公告】分頁（`tabBtn-announcements` / `tab-announcements`）。
         - 歷史公告列表：即時動態計算簽收進度條與簽收率（如 `簽收率 18/20 (90%)`）。
         - 【👥 名單】彈窗（`announcementReadsModal`）：4 大 KPI 統計卡片（總應收、已簽收、尚未簽收、簽收完成率 %）+ 雙欄位穿透檢視已簽收同仁（含精準時間）與尚未簽收同仁。
         - 【🔔 一鍵催簽】（`remindUnread`）：點擊後自動篩選 `announcement_reads` 尚未簽收之員工，重新向其發送催簽專屬 Flex 通知卡片；若全體同仁皆已簽收則自動抑制。
      6. **成效指標**：
         - 全新端到端整合測試套件 `test_company_announcements.js` **46 項測試 100% PASS**。
         - 既有 BPM 審核整合測試 `test_bpm_approvals.js` **46 項測試維持 100% PASS**（累計持久化驗證矩陣達到 92+ 項全過）。
         - 依賴檢查與型別編譯 `npm run check` 達成 **0 型別錯誤、0 架構違規**（45 模組、107 條相依關係）。
         - `src/index.ts` 保持精簡，代碼量控制於 112 LOC（嚴格低於 120 LOC 限制）。
