# ADR-0038: 個人電子薪資條批次發送與全隱私遮罩推播系統 (Batch E-Payslips CSV Import & Privacy-Masked LINE Push ADR v2.14.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.14.0`  
> **領域分類 (Category)**: `LINE` / `Flex Protocol`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. 企業每月結算薪資均於地端封閉系統（Excel/HRIS）進行，敏感個人薪資與扣繳數字若存於雲端有高度外洩顧慮。
      2. 傳統通訊軟體或 Email 發送薪資條常於手機鎖定螢幕與橫幅推播中直接暴露出實發金額或明細，導致同仁被身邊同事窺見。
      3. 跨租戶與手動傳送極易產生誤發至他家公司同仁或非在職員工之重大資安事故。
    - **架構升級原則與解法**：
      1. **標準 UTF-8 BOM CSV 範本匯出與客戶地端無縫銜接**：
         - 實作 `GET /api/v1/tenant/payslips/template`，標準支援帶 BOM 檔頭（`\uFEFF`）防止 Excel 亂碼。
         - 制定 9 大標準欄位：`line_user_id,employee_name,pay_month,base_salary,allowances,overtime_pay,deductions,net_salary,note`。
      2. **CRITICAL PRIVACY INVARIANT：手機鎖定螢幕與通知預覽 100% 遮罩金額**：
         - 在 [`src/views/flex/payslip-flex.ts`](file:///d:/line-checkin/src/views/flex/payslip-flex.ts) 嚴格鎖定推播預覽文字（`altText`）為：
           `【薪資發放通知】您有一筆新的薪資明細，請點入查看`
         - 絕不包含任何阿拉伯數字（0-9）、扣款或具體薪資字串，確保在手機鎖定螢幕、通知中心與聊天室列表 100% 遮罩所有財務數字。
      3. **跨租戶隔離與在職員工防呆校驗 (Tenant Isolation Guard)**：
         - 批次發送時，後端 [`src/services/payroll.service.ts`](file:///d:/line-checkin/src/services/payroll.service.ts) 即時關聯 `company_employees`，嚴格校驗受領人 LINE ID 必須屬於當前登入企業統編之在職同仁。
         - 任何非在職員工或跨租戶 LINE ID 立即被強制攔截並記錄於失敗明細，杜絕跨企業誤發。
      4. **專業企業級 Flex 薪資卡片與資安稽核日誌連動**：
         - 採用深海軍藍（`#0F172A`）頂部、翡翠綠（`#10B981`）金額高光方塊，清晰呈現底薪、津貼、加班費、扣款（紅字）與備註。
         - 每一筆發送成功紀錄即時落庫至 `device_audit_logs`（`action = 'PAYSLIP_DISPATCHED'`），完整紀錄發送時間、IP 與受領同仁姓名。
      5. **地端管理後台 (`/admin`) 電子薪資條專屬工作台**：
         - 導覽列擴充【💰 電子薪資條】分頁（`tabBtn-payslips` / `tab-payslips`）。
         - 支援即時 CSV 解析、欄位數字格式檢查、即時試算總發放人數與實發總金額、動態表格預覽，以及一鍵直推 LINE。
      6. **成效指標**：
         - 全新端到端整合測試套件 `test_payslip_distribution.js` **39 項測試 100% PASS**。
         - 現有 BPM 與公告測試全數通過（`npm test` 累計 **131 項測試 100% PASS**）。
         - 依賴檢查與型別編譯 `npm run check` 達成 **0 型別錯誤、0 架構違規**（49 模組、119 條相依關係）。
         - `src/index.ts` 保持極簡高內聚，代碼量控制於 118 LOC（嚴格低於 120 LOC 限制）。
