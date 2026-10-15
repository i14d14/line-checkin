# ADR-0052: LINE 官方帳號回應模式維運規範建立與實機驗收通過 (LINE OA Response Settings Ops SOP & User Verification v2.15.8)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.15.8`  
> **領域分類 (Category)**: `Frontend` / `LIFF`

---

## 決策內容與架構推演 (Decision Record)

- **背景問題**：
      - 官方帳號若開啟預設「自動回應訊息」，當同仁或主管發送未命中 LINE 官方內建關鍵字之文字訊息時，LINE 伺服器會自動插話推播「很抱歉，本帳號無法個別回復用戶的訊息」，造成使用者體驗干擾與混淆。
    - **程式碼與架構核實**：
      - 經全面盤點 [`src/services/webhook.service.ts`](file:///d:/line-checkin/src/services/webhook.service.ts)，系統內主管駁回（`【駁回 #id】原因：...`）、出勤看板查詢（`今日出勤`）、門市 GPS 圖釘校準等文字指令，100% 透過 Webhook 由 Cloudflare Worker 獨立解析並回傳，不依賴任何 LINE 官方內建自動回應。
    - **維運配置落實**：
      - 於 LINE Official Account Manager（`manager.line.biz`）後台配置：
        1. **回應模式**：`Bot（聊天機器人）`
        2. **Webhook**：`開啟 (Enabled)`
        3. **自動回應訊息**：`停用 (Disabled)`
    - **實機驗收與持久化繼承**：
      - 使用者於真實 LINE 聊天室實機測試完成驗證（`[User Verified ✅]`），確認文字互動流暢且無任何官方罐頭訊息干擾。
      - 維運防呆規範已正式同步至 [`.agents/AGENTS.md`](file:///d:/line-checkin/.agents/AGENTS.md) 與 Section 1 基礎設施表作為環境重建防退化之 SSOT。
    - **成效指標**：
      - `npm run check`（`tsc --noEmit` + `depcruise src`）維持 **0 型別錯誤、0 架構違規**。
