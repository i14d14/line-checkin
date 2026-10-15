# ADR-0046: 四項核心功能使用者實機驗收持久化 (Persistent User Verification of 4 Core Features v2.15.2)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.15.2`  
> **領域分類 (Category)**: `LINE` / `Flex Protocol`

---

## 決策內容與架構推演 (Decision Record)

- **驗收通過項目與機制確認**：
      1. **主管駁回自訂原因輸入留言流 (Item 1 - OK)**：
         - 機制已完整上線運作：主管點選 Flex 卡片「❌ 駁回申請」時，觸發 LINE Messaging API 標準 `inputOption: "openKeyboard"` 並預填 `fillInText: "【駁回 #${approvalId}】原因："`。主管輸入理由送出後，Webhook 正則擷取 `approvalId` 與 `rejectReason`，更新 D1 `approvals.details.reject_reason` 並推播結果卡片通知同仁。實機驗收通過，狀態轉為 `[User Verified ✅]`。
      2. **非上班日禁止請假防呆 (Item 2 - OK)**：
         - `ApprovalService.submitRequest` 阻斷休假日（排班 `is_rest_day = 1` 或常態週末）請假申請，以 HTTP 400 提示「選擇日期為休息日/非工作日，無需請假」。實機驗收通過，狀態轉為 `[User Verified ✅]`。
      3. **線上簽核全種類選填附件 (Item 3 - OK)**：
         - 請假、補卡、加班三大種類全數支援選填上傳佐證圖片，Cloudflare R2 串流代理儲存與主管 Flex 卡片一鍵查看運作正常。實機驗收通過，狀態轉為 `[User Verified ✅]`。
      4. **管理後台帳密登入跳轉正常 (Item 4 - OK)**：
         - 修復內聯引號跳脫語法錯誤後，後台帳密驗證、LocalStorage 權杖持久化與 7 天 Web Session 登入跳轉運作正常。實機驗收通過，狀態轉為 `[User Verified ✅]`。
    - **成效指標**：
      - 全功能持久化矩陣新增 4 項使用者實機認證通過，跨版本永久繼承。
