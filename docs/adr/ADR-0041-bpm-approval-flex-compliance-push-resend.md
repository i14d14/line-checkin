# ADR-0041: BPM 線上簽核 Flex 卡片合規修復與未送達單據補推 (BPM Approval Flex Compliance & Push Resend v2.14.3)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.14.3`  
> **領域分類 (Category)**: `BPM` / `Flex Message`

---

## 決策內容與架構推演 (Decision Record)

- **問題成因**：
      1. 在 [`src/views/flex/approval-flex.ts`](file:///d:/line-checkin/src/views/flex/approval-flex.ts) 的 `buildApprovalRequestFlex` 中，駁回按鈕包含非法的屬性 `inputOption: "openKeyboardWithMessage"` 與 `fillInText: ...`。
      2. LINE Messaging API 在接收 Flex Message 時，因 Flex 按鈕 action 物件不支援上述屬性，直接回傳 `HTTP 400 Bad Request: invalid property: .../action/inputOption` 拒絕接收訊息。
      3. `pushApprovalRequestFlex` 內未檢查 `resp.ok`，導致 400 錯誤被靜默吞噬，造成 10:43~10:51 間請假單推播失敗。
    - **修復與防護措施**：
      1. **視圖層修復**：
         - 移除駁回按鈕之 `inputOption` 與 `fillInText` 非法屬性。
         - 統一採用合規且 webhook 原生支援之 postback action：`action=reject&id=${approvalId}`，附帶顯示文字 `駁回【${applicantName}】的${currentConfig.label}`。
         - 在 `pushApprovalRequestFlex` 與 `pushApprovalResultFlex` 的 fetch 呼叫後加入 `if (!resp.ok)` 錯誤狀態檢查與詳細日誌記錄。
      2. **API 驗證與未達單據補推**：
         - 透過 LINE Messaging API 驗證端點 `https://api.line.me/v2/bot/message/validate/push` 實測 Flex Bubble，確認回傳 HTTP 200 OK。
         - 調用 LINE Push API 將 10:43~10:51 間 4 筆未送達請假單（`appr_6f32c5eef0bf4cae`、`appr_bb7158b28e2949ee`、`appr_b4c3cd50cc954203`、`appr_7391410470fa4675`）精準補推至主管珈妤之 LINE（`U4eb5f204f746d1ab2b360e687eb99105`），4 筆皆獲 HTTP 200 OK 確認。
    - **成效指標**：
      - `npm run check`（`tsc --noEmit` + `depcruise src`）維持 **0 型別錯誤、0 架構違規**（49 模組、119 條相依關係）。
      - `npm test` 累計 **131 項自動化整合測試 100% PASS**（BPM 46 項、公告 46 項、薪資條 39 項）。
