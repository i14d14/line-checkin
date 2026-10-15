# ADR-0035: LINE 聊天室主管審核駁回自訂意見留言流全面落地 (In-Chat BPM Rejection Reason Flow ADR v2.11.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.11.0`  
> **領域分類 (Category)**: `BPM` / `LINE Messaging`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. 主管於 LINE 聊天室駁回請假、補卡或加班申請時，過往僅能一鍵駁回，無法填寫具體原因，導致同仁收到駁回通知時資訊不透明，需另行私訊溝通。
      2. 傳統 Web 表單填寫駁回理由流程過長，大幅降低主管於行動端的審批效率。
    - **架構升級原則與解法**：
      1. **LINE 原生互動鍵盤調起 (`openKeyboardWithMessage`)**：
         - 更新主管審核推播 Flex 卡片（[`src/views/flex/approval-flex.ts`](file:///d:/line-checkin/src/views/flex/approval-flex.ts)）之【❌ 駁回申請】按鈕，配置 `inputOption: "openKeyboardWithMessage"` 與 `fillInText: "【駁回 #${approvalId}】原因："`。
         - 主管點擊駁回後，LINE 客戶端自動打開文字輸入框並預填單號指令，兼顧極速審批與零學習成本。
         - 保留舊版 `action=reject` 容錯向下相容，確保現存未決卡片不中斷。
      2. **Webhook 結構化文字指令解析與非空防呆 (`src/services/webhook.service.ts`)**：
         - 正則表達式精準匹配 `/^【駁回\s*#([a-zA-Z0-9_-]+)】原因[：:]\s*([\s\S]*)$/`，相容中英冒號與多行文字輸入。
         - 空理由防呆攔截：若理由為空，即刻回覆引導「⚠️ 駁回原因不能為空，請於「原因：」後方輸入具體理由後再次送出。」，單據維持 `PENDING`。
      3. **零 Migration 結構化落庫與防冒審鑑權 (`approval.service.ts`, `approval.repo.ts`)**：
         - 擴充 `ApprovalService.processDecision` 與 `ApprovalRepository.updateApprovalStatus`，將駁回理由直接存入 `approvals.details` JSON 內之 `reject_reason` 欄位，無需更改資料庫 Schema。
         - 嚴格比對 `event.source.userId === approval.approver_line_id`，杜絕群組其他成員冒審。
         - 狀態防呆：已審批單據不重複執行，防範網路抖動造成重複推播。
         - 審核駁回稽核落庫至 `device_audit_logs`（`APPROVAL_REJECTED`）。
      4. **申請人專屬駁回警示卡片與雙端 UI 呈現**：
         - 結果推播卡片（`buildApprovalResultFlex`）新增淺紅底/紅框高對比 callout 容器，鮮明揭示「📌 駁回原因 / 主管意見：」。
         - LIFF 申請清單（`liff-scripts.ts`）與後台總覽表格（`admin-scripts.ts`）同步呈現駁回理由。
      5. **成效指標**：
         - 自動化整合測試全面升級：`test_bpm_approvals.js` **46 項測試 100% PASS**（包含空理由防呆、非法冒審攔截、合法理由審核落庫、重複駁回防呆）。
         - TypeScript 編譯與架構檢查 `npm run check` 零錯誤、零違規（39 模組、90 條相依）。
         - 線上 Worker 部署成功（Version ID: `4be56b6a-3ee2-4746-af11-63411619ff6c`）。
