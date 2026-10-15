# ADR-0063: Batch 1 自主驗證落地：線上簽核、防冒審與 JSDOM 前端生命週期 (Batch 1 Autonomous Verification of Online Approvals & Anti-Impersonation v2.22.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.22.0`  
> **領域分類 (Category)**: `BPM` / `Testing & Verification`

---

## 決策內容與架構推演 (Decision Record)

- **輕量化虛擬 DOM 測試環境建構（擺脫肥重瀏覽器）**：
  - 依據 [`software-testing`](file:///C:/Users/pigmao/optional_skills/software-testing/SKILL.md) 之 Law 1（執行保真度高於文字比對），在不啟動肥重 Playwright Chromium 瀏覽器的前提下，引進 `jsdom` 與 `@types/jsdom` 測試環境。
  - 在 Node.js 記憶體中模擬真實 DOM 與 Window 物件，載入並執行經 `esbuild` 打包之客戶端代碼 [`src/views/liff/liff.client.js`](file:///d:/line-checkin/src/views/liff/liff.client.js)。
- **關鍵缺陷捕獲與前端健全修復**：
  - **函式未掛載暴露盲區**：在真實執行測試下捕獲 `handleApprSubmit`、`onApprDateChange`、`handleApprProofSelected`、`loadMonthlyAttendance` 未暴露於 `window` 物件之缺陷，若未修復將導致手機端使用者點擊表單觸發 `ReferenceError` 崩潰；已全數補齊型別宣告與 `Object.assign(window, ...)`。
  - **DOM Null 指標防呆加固**：修復 `showOnboardingView` 中對 `onboardingCompanyName` 等 DOM 元素直接存取 innerText 之潛在 TypeError 隱患，全面加上防禦性 null checks。
- **Batch 1 三大核心功能 100% 確定性自主驗收**：
  - **LIFF 簽核入口按鈕鎖定與解鎖 (Tier 3 - JSDOM)**：
    - 驗證表單提交中按鈕即刻進入 `disabled` 且切換提示字串「傳送申請中...」（防重複點擊防呆）。
    - 驗證網路異常或伺服器報錯時，`finally` 區塊 100% 保證解除按鈕鎖定恢復「送出申請」。
    - 驗證表單空日期驗證攔截與事由清空。
  - **嚴格身分防冒審阻斷 (Tier 3 & Tier 4)**：
    - 陌生人（`U_B1_IMPOSTOR_xxxx`）偽造 Webhook Postback 嘗試審批他人單據，伺服器精準攔截。
    - D1 資料庫中單據狀態嚴格保持 `PENDING`，`decided_at` 維持 null，絕無任何非法資料注入。
  - **核准業務自動連動 (Tier 4 - D1)**：
    - 主管核准補卡（`CORRECTION`）後，D1 `checkin_records` 即刻寫入不可變之 `verify_mode: 'APPROVED_OVERRIDE'` 出勤流水，精準記錄補卡方向與時間戳記。
    - 主管核准請假（`LEAVE`）後，D1 `employee_schedules` 即刻更新/寫入排班為休假日（`is_rest_day = 1`）並標註請假類別。
    - 驗證防重複審批（Idempotency），多次點擊核准不產生重複流水。
  - **強制環境自動清理 (Mandatory Teardown Hook)**：
    - 於 `finally` 區塊全數清除測試門市、員工關聯、審批單據、打卡流水與排班數據，實現零髒資料殘留。
- **成效指標**：
  - 專屬測試套件 [`test_batch1_verification.js`](file:///d:/line-checkin/test_batch1_verification.js) 41/41 項斷言全數通過（100% PASS）。
  - 全量回歸測試套件（`npm test`）維持 100% PASS。
  - `LINE_CHECKIN_PROGRESS.md` 正式將這 3 項標記為 `[User Verified ✅]`。
