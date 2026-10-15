# ADR-0040: 打卡安全防護網修補：重複打卡翻轉與撤回漏洞防堵 (Duplicate Check-in Safety Net Hardening v2.14.2)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.14.2`  
> **領域分類 (Category)**: `Attendance` / `State Machine`

---

## 決策內容與架構推演 (Decision Record)

- **問題成因**：
      1. 視圖層（[`src/views/flex/checkin-flex.ts`](file:///d:/line-checkin/src/views/flex/checkin-flex.ts)）：原先在 `buildCheckinReceiptBubble` 僅以 `if (recordId)` 判定是否生成「翻轉上下班」與「🗑️ 撤回打卡」按鈕，當 `isDuplicate === true` 時依然生成按鈕並綁定該筆 `status = 'DUPLICATE'` 紀錄之 ID。
      2. 業務/安全層（[`src/services/webhook.service.ts`](file:///d:/line-checkin/src/services/webhook.service.ts)）：收到 `flip` 或 `undo` Postback 時，原邏輯僅檢查 `status === 'CANCELLED'`，因重複打卡剛生成數秒，其 `delta_seconds < 35` 永遠成立，導致使用者在打卡 20 分鐘後重複打卡即可透過新卡片繞過 30 秒安全限制執行翻轉或撤回。
    - **修復與防護措施**：
      1. **視圖層邊界鎖定**：
         - 嚴格修正按鈕生成條件為 `if (recordId && !isDuplicate)`，重複打卡收據卡片全面隱藏「翻轉上下班」與「撤回打卡」按鈕。
         - 優化頁尾提示為：`💡 提示：重複打卡不影響出勤，系統維持首次有效打卡紀錄。`，與正常打卡提示精確分離。
      2. **業務/安全層深度防禦**：
         - Postback 處理加入狀態嚴格前置檢核：
           - 若 `record.status === "DUPLICATE"`，立即拒絕處理並回覆：`⚠️ 重複打卡紀錄不支援翻轉或撤回。如需補正請洽後台主管。`
           - 若 `record.status !== "SUCCESS"`，立即拒絕處理：`⚠️ 僅有成功的打卡紀錄支援翻轉或撤回。如需補正請洽後台主管。`
           - 嚴格確保唯有原始成功的打卡紀錄（`status === 'SUCCESS'`）且在 30 秒（安全緩衝 35 秒）時限內，才允許執行翻轉與撤回。
    - **成效指標**：
      - 新增專屬單元與安全性驗證套件，覆蓋重複打卡卡片按鈕抑制、Postback 攔截、30 秒內正常翻轉/撤回與 35 秒超時攔截，全數 100% 通過。
