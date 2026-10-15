# ADR-0068: Batch 7 自主驗證落地：薪資明細卡片 Zod 契約、換機資安日誌與 10 大 PBAC 權限體系 (Batch 7 E-Payslips Flex, Device Audit & PBAC Matrix v2.28.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.28.0`  
> **領域分類 (Category)**: `Payroll & Privacy` / `Security & Device Audit` / `PBAC & Permissions` / `Testing & Verification`

---

## 決策內容與架構推演 (Decision Record)

- **核心背景與待驗收範疇**：
  - 依據 [`AUTONOMOUS_VERIFICATION_ROADMAP.md`](file:///d:/line-checkin/AUTONOMOUS_VERIFICATION_ROADMAP.md) 規劃，啟動 **Batch 7（薪資明細與安全日誌 - 收官批次）** 之輕量化自主驗證。
  - 涵蓋自主驗證清單最終 3 項核心業務功能：
    1. **項目 15**：專業海軍藍/翡翠綠 Flex 薪資卡片 (Zod 契約校驗與 UTF-8 BOM 範本匯出/批次推播)
    2. **項目 16**：地端安全稽核日誌 (`SWITCH_DEVICE` 換機審計實體落庫與查詢)
    3. **項目 17**：10 大細粒度原子權限體系 (PBAC 鑑權矩陣、多維度負向阻斷防護)
  - 測試使用專屬沙盒測試統編 `99999999`、門市據點 `99999999-01` 與受測同仁前綴 `U_B7_`。
- **Tier 1 & Tier 4 - 項目 15：Flex 薪資卡片與 Zod 契約校驗**：
  - **Zod 契約驗證閘門 (In-Process Zod Contract Gate)**：
    - 驗證 `src/views/flex/payslip-flex.ts` 之 `buildPayslipFlexBubble()` 產出符合 `src/utils/flex-validator.ts` 規格。
    - `assertValidFlexBubble()` 與 `assertValidFlexMessage()` 雙層閘門校驗 100% 通過。
  - **9 大標準完整欄位校驗**：
    - 覆蓋 `employee_id` / `line_user_id`、`employee_name`、`pay_month`、`base_salary`、`allowances`、`overtime_pay`、`deductions`、`net_salary`、`note`。
    - 金額格式化 helper `formatCurrency()` 正數、負數與零精確排版。
  - **螢幕隱私零洩漏不變量 (Screen Lock Privacy Invariant)**：
    - 斷言 `altText` 固定為 `【薪資發放通知】您有一筆新的薪資明細，請點入查看`，嚴格零包含任何薪資或扣款數字。
  - **主題視覺配色規範**：
    - 卡片 Header 背景嚴格採用深海軍藍 `#0F172A`，實發金額卡片採用翡翠淺綠 `#ECFDF5`，兼具企業專業感與隱密感。
  - **負向協議注入防禦 (Negative Protocol Injection)**：
    - 注入非法 action 協議或損毀屬性時，精確觸發 Zod 攔截並拋出 `FlexValidationError`。
    - 注入空 `altText` 時，精確觸發 `FlexValidationError`。
  - **服務端 CSV 範本與批次推播 API**：
    - `GET /api/v1/tenant/payslips/template`：回傳 HTTP 200，包含標準 UTF-8 BOM（`0xEF, 0xBB, 0xBF`），防範 Excel 匯入亂碼。
    - `POST /api/v1/tenant/payslips/dispatch`：未認證 401 攔截、空陣列 400 阻斷、缺姓名 400 阻斷、非本租戶同仁 400 阻斷跨租戶外洩。
- **Tier 4 D1 沙盒 - 項目 16：地端安全稽核日誌 (SWITCH_DEVICE 完整落庫)**：
  - **初始同仁裝置綁定 (`INITIAL_BIND`)**：
    - 同仁初次於裝置 A 綁定，D1 實體落庫 `device_audit_logs`：
      - `action = 'INITIAL_BIND'`
      - `warning_level = 'INFO'`
      - `new_device_id = 裝置 A`、`old_device_id = null`
  - **自發性安全換機審計 (`SWITCH_DEVICE`)**：
    - 當同仁改以裝置 B 發起 `POST /api/device/switch`，D1 實體落庫換機審計紀錄：
      - `action = 'SWITCH_DEVICE'`
      - `warning_level = 'WARNING'`
      - `old_device_id = 裝置 A`、`new_device_id = 裝置 B`
      - 完整寫入 `ip_address`、`user_agent`、`line_user_id`、`display_name`。
  - **稽核日誌查詢端點 (`GET /api/devices/audit`)**：
    - 驗證端點回傳 HTTP 200，列表最新紀錄精確包含該筆 `SWITCH_DEVICE` 警告事件與新舊裝置對照。
- **Tier 4 D1 沙盒 - 項目 17：10 大細粒度原子權限體系 (PBAC 鑑權矩陣)**：
  - **10 大原子權限定義與中文標籤 SSOT**：
    - `ALL_PERMISSIONS` 嚴格定義 10 項原子權限：
      `punch`（基礎打卡）、`apply`（線上申請）、`approve`（假勤審批）、`view_store`（門市看板）、`view_all`（全局看板）、`set_location`（座標設定）、`set_wifi`（Wi-Fi綁定）、`device_audit`（換機解綁）、`export_payroll`（計薪匯出）、`broadcast`（公告推播）。
  - **租戶授權管理 API 鑑權防護 (`POST /api/v1/tenant/employees/:id/permissions`)**：
    - 未認證存取回傳 HTTP 401。
    - 跨統編門市賦權（越界操作）精準回傳 HTTP 403 阻斷。
    - 為同仁成功授權特定子集 `['punch', 'apply']`。
  - **權限陣列資料流貫穿驗證**：
    - `GET /api/v1/tenant/employees` 員工清單精確回傳該同仁權限為 `['punch', 'apply']`。
    - `GET /api/v1/employee/profile` 個人 Profile 正確反映 `['punch', 'apply']`。
  - **多維度負向原子權限攔截防護 (Negative PBAC Guardrails)**：
    - **審核單據攔截**：缺少 `approve` 權限之同仁嘗試審批時，被 `POST /api/v1/approval/:id/decision` 回傳 HTTP 403 阻斷（`權限不足：您尚未具備假勤審批 (approve) 權限`）；具備主管權限者則順暢核准。
    - **計薪匯出攔截**：缺少 `export_payroll` 權限之同仁嘗試匯出計薪 CSV 時，被 `GET /api/v1/tenant/records?format=csv` 回傳 HTTP 403 阻斷。
    - **跨店看板攔截**：缺少 `view_all` 權限之同仁嘗試查閱非本店資料時，被回傳 HTTP 403 阻斷。
    - **LINE Webhook 聊天室語意攔截**：同仁發送「跨店出勤看板」與「計薪匯出報表」時，服務端 PBAC 語意偵測優雅攔截並回覆權限提示，無崩潰異常。
- **強制環境自動清理 (Mandatory Teardown Hook)**：
  - 測試結束於 `finally` 區塊無條件執行 D1 深度清理，清除所有受測打卡紀錄、員工資料、裝置綁定、稽核日誌、單據、API 金鑰與測試門市，驗證殘留數嚴格為 0。
- **成效指標**：
  - 專屬測試套件 [`test_batch7_verification.js`](file:///d:/line-checkin/test_batch7_verification.js) **88/88 斷言全數通過（100% PASS）**。
  - `npm run check`（`build:client` + `client:check` + `typecheck` + `arch:check`）維持 **0 型別錯誤、0 架構違規**。
  - Cloudflare Workers 邊緣部署成功更新至版本 `v2.28.0`。
  - 至此，自主驗證路線圖全部 7 個 Batch（共 17 項功能）全數完成驗收收官。
