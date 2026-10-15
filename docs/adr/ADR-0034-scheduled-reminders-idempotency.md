# ADR-0034: Cloudflare Cron Triggers 上下班防漏打卡定時提醒與冪等性架構 (Scheduled Reminders & Idempotency ADR v2.10.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.10.0`  
> **領域分類 (Category)**: `Scheduler` / `Cron`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. 專案原先缺少主動推播提醒機制，同仁忘記打卡需事後走補卡簽核流程，增加管理審批成本。
      2. 在無狀態 Serverless 環境下執行定時排程，若無嚴格狀態追蹤，極易發生重複推播騷擾同仁之風險。
    - **架構升級原則與解法**：
      1. **Cloudflare Workers 原生 Cron Triggers 整合**：
         - 在 `wrangler.jsonc` 配置 `"triggers": { "crons": ["*/5 * * * *"] }`，由 Cloudflare 全球邊緣排程每 5 分鐘自動調用 Worker 之 `scheduled` 生命週期事件。
      2. **嚴格推播冪等性防線 (Idempotency Guard)**：
         - 建立 D1 資料表 `cron_notifications`（`UNIQUE(line_user_id, work_date, type)`）。
         - 每次推播前先檢驗該同仁當日是否已接收過該類型提醒；推播後立即落庫記錄，保證同仁當日至多收到 1 次。
      3. **即時打卡狀態比對與自動抑制 (Auto-Suppression)**：
         - 巡檢時同步讀取今日有效打卡流水（`checkin_records`）。
         - 上班提醒：若同仁已有 `IN` 打卡，自動抑制推播。
         - 下班提醒：若同仁已有 `OUT` 打卡，自動抑制推播。
      4. **1-Click 直達打卡專屬 Flex 模板**：
         - 建立 [`src/views/flex/reminder-flex.ts`](file:///d:/line-checkin/src/views/flex/reminder-flex.ts)，設計翡翠綠（上班）與海洋藍（下班）卡片，內嵌 1-Click 跳轉 LIFF 打卡按鈕。
      5. **成效指標**：
         - 全自動測試 `test_cron_reminders.js`（5/5 PASS），上班觸發、冪等防重複、已打上班卡抑制、下班觸發、已打下班卡抑制 100% 通過。
         - 回歸測試矩陣累計達 244+ 項，維持 100% 綠燈通過。
         - 線上 Worker 部署成功（Version ID: `aa90e17b-eb30-4c93-a6c9-99b2db599879`）。
