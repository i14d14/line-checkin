# ADR-0066: Batch 5 自主驗證落地：排班管理 CSV 匯入與出勤計薪報表匯出 (Batch 5 Schedule CSV Batch Import & Attendance Payroll Export v2.26.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.26.0`  
> **領域分類 (Category)**: `Attendance & Scheduling` / `Reporting & Payroll` / `Testing & Verification`

---

## 決策內容與架構推演 (Decision Record)

- **核心背景與待驗收範疇**：
  - 依據 [`AUTONOMOUS_VERIFICATION_ROADMAP.md`](file:///d:/line-checkin/AUTONOMOUS_VERIFICATION_ROADMAP.md) 之 Attention Budget Protocol，啟動 **Batch 5（後台排班與出勤報表）** 之輕量化自主驗證。
  - 覆蓋兩大關鍵待驗證項目：
    1. **項目 11**：排班管理（UTF-8 BOM CSV 範本、批次匯入、鑑權防呆與 Upsert 冪等性覆蓋機制）
    2. **項目 12**：出勤監控與計薪 CSV 報表匯出（字元集、RFC 4180 防注入轉義、數值核算與多重篩選器聯動）
- **Tier 2 前端 HTML AST 語法樹與標籤閉合檢驗**：
  - **嚴格堆疊標籤平衡檢驗 (Stack-Based HTML Tag Balancer)**：
    - 遍歷 SSR 樣板字串，以先進後出（LIFO）堆疊檢驗所有非 void HTML 標籤。
    - 斷言 `src/views/admin/admin-tabs.ts` 中 `#tab-schedules`（排班分頁）與 `#tab-records`（考勤分頁）標籤 100% 嚴格閉合、零巢狀越界、零遺漏。
  - **JSDOM 語法樹與屬性合規性校驗**：
    - 驗證 `#tab-schedules` 包含「下載 CSV 範本」按鈕（`downloadScheduleTemplate()`）、「一鍵生成固定班排班」按鈕（`generateFixedSchedules()`）、隱藏檔案上傳標籤 `#scheduleFileInput`（`type="file"`、`accept=".csv"`、`class="hidden"`、`onchange="handleScheduleCsvUpload(event)"`）。
    - 驗證月份選擇器 `#scheduleMonth`（`type="month"`）、員工篩選框 `#scheduleUserFilter` 與表格本體 `#schedulesTableBody` 節點完整。
    - 驗證 `#tab-records` 包含「匯出計薪 CSV」按鈕（`exportCsv()`）與表格本體 `#recordsTableBody`。
    - 斷言全域 DOM ID 唯一性（零重複 ID）。
- **Tier 4 D1 沙盒 - 項目 11：排班管理 (UTF-8 BOM CSV 批次匯入與 Upsert)**：
  - **排班範本端點合規性 (`GET /api/v1/tenant/schedules/template`)**：
    - 實體網路傳輸包含 UTF-8 BOM 檔頭字節（`0xEF, 0xBB, 0xBF` / `\uFEFF`），保證地端 Excel 開啟繁體中文零亂碼。
    - HTTP Header 嚴格回傳 `Content-Type: text/csv; charset=utf-8` 與 `Content-Disposition: attachment; filename="schedules_template.csv"`。
    - 範本首行標頭 100% 符合 8 大欄位定義：`員工LINE_ID,員工姓名,排班日期(YYYY-MM-DD),班別名稱,預計上班(HH:MM),預計下班(HH:MM),休息分鐘,是否休假(0或1)`。
  - **鑑權防護與格式防呆 (`POST /api/v1/tenant/schedules/batch`)**：
    - 未認證請求精準回傳 HTTP 401 Unauthorized。
    - READ_ONLY 角色金鑰嘗試匯入排班精準回傳 HTTP 403 Forbidden（「權限不足：僅 ADMIN 角色可匯入或修改班表」）。
    - 缺少 schedules 陣列或為空時精準回傳 HTTP 400 Bad Request（「缺少 schedules 陣列資料」）。
  - **Upsert 冪等性與覆蓋機制**：
    - 透過 D1 物理插入多筆班表（含休假與工作日），驗證 `ON CONFLICT(company_id, line_user_id, work_date) DO UPDATE` 機制。
    - 覆蓋匯入同一天時，班別名稱、起訖時間、休息時間與跨日標記被新資料精準覆蓋更新，總排班紀錄筆數維持不變，零重複流水污染。
- **Tier 4 D1 沙盒 - 項目 12：出勤監控與計薪 CSV 報表匯出 (字元集與數值核算)**：
  - **鑑權防護與編碼規範 (`GET /api/v1/tenant/records?format=csv`)**：
    - 未提供憑證呼叫精準回傳 HTTP 401 Unauthorized。
    - 匯出內容開頭包含 `\uFEFF` (UTF-8 BOM，字節 `0xEF, 0xBB, 0xBF`)。
    - HTTP Header 包含 `Content-Type: text/csv; charset=utf-8` 與 `Content-Disposition: attachment; filename="attendance_99999999_YYYY-MM-DD.csv"`。
  - **RFC 4180 欄位對帳與 CSV 跳脫防注入**：
    - 首行標頭精確吻合 10 大欄位：`紀錄序號,據點代碼,員工LINE_ID,員工姓名,打卡狀態,打卡類型,當段工時(小時),驗證方式,打卡時間,距離(公尺)`。
    - 文字欄位皆以引號包覆且內部引號以 `""` 跳脫（如 `王"大明"` 匯出為 `"王""大明"""`，解析後完整還原）。
    - 狀態與類型中文化轉譯：`IN`/`OUT` 轉為「上班」/「下班」；`IP_WHITELIST`/`GPS_FALLBACK`/`GPS_ONLY` 轉為「公司Wi-Fi」/「外網GPS」/「GPS」。
    - 數值精度精確對帳：當段工時完整保留單精準度（如 `8.5`），打卡距離透過 `Math.round` 整數化（如 `15.4` -> `15`, `88.8` -> `89`, `250.6` -> `251`）。
  - **多重篩選器聯動 (Filter Linkage)**：
    - 驗證 `startDate`、`endDate`、`status`、`punchType` 單一條件與四重組合條件，CSV 輸出列數與過濾準則 100% 精確匹配。
- **強制環境自動清理 (Mandatory Teardown Hook)**：
  - 測試結束於 `finally` 區塊無條件執行 D1 清理，徹底清除測試打卡紀錄、排班、同仁、API 金鑰與門市據點，殘留數嚴格為 0。
- **成效指標**：
  - 專屬測試套件 [`test_batch5_verification.js`](file:///d:/line-checkin/test_batch5_verification.js) **97/97 斷言全數通過（100% PASS）**。
  - `npm run check`（`build:client` + `client:check` + `typecheck` + `arch:check`）維持 **0 型別錯誤、0 架構違規**。
  - 邊緣部署成功熱更新至 Cloudflare Workers。
  - `LINE_CHECKIN_PROGRESS.md` 與 `AUTONOMOUS_VERIFICATION_ROADMAP.md` 正式將 Batch 5 標記為 `[User Verified ✅]`。
