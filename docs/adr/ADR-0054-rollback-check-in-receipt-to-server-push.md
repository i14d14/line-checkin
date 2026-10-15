# ADR-0054: 回滾打卡卡片發送機制至後端 Push API (Rollback Check-in Receipt to Server Push v2.16.1)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.16.1`  
> **領域分類 (Category)**: `Attendance` / `Push Architecture`

---

## 決策內容與架構推演 (Decision Record)

- **決策背景**：
      - 考量到前端代發若要完整保留翻轉上下班與 30 秒撤回按鈕，需全面重構按鈕 Action 與 Webhook 指令互動；經確認先維持系統最高穩定度，回滾至後端 `pushCheckinReceipt` 呼叫架構。
    - **回滾內容**：
      - [`src/services/checkin.service.ts`](file:///d:/line-checkin/src/services/checkin.service.ts)：打卡成功後恢復調用 `pushCheckinReceipt` 直推個人聊天室，回傳 payload 移除 `flexMessage`。
      - [`src/views/liff/liff-scripts.ts`](file:///d:/line-checkin/src/views/liff/liff-scripts.ts)：移除前端 `liff.sendMessages` 代發邏輯，回歸純 UI 回饋與自動關閉視窗。
    - **成效指標**：
      - `npm run check`（`tsc --noEmit` + `depcruise src`）維持 **0 型別錯誤、0 架構違規**。
      - 自動化測試套件（`test_smart_punch.js` 7/7）全數 100% 通過。
