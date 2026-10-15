# ADR-0050: 結尾強制全自動邊緣部署協議寫入專案規範 (Mandatory Automated Cloudflare Deployment Protocol ADR v2.15.6)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.15.6`  
> **領域分類 (Category)**: `Frontend` / `LIFF`

---

## 決策內容與架構推演 (Decision Record)

- **背景與防呆根因**：
      - 本系統核心打卡與 BPM 簽核直接依賴 LINE Webhook 與 Cloudflare Workers 邊緣運算，本地修改若未部署，手機端實機永遠無法驗收最新結果。
    - **規範永久定錨**：
      - 於 [`.agents/AGENTS.md`](file:///d:/line-checkin/.agents/AGENTS.md) 確立「結尾強制自動部署協議」：每次對程式碼或設定進行任何更動，在通過 `npm run check` 與單元測試後，**必須無條件執行 `node run-wrangler.js deploy` 即時熱更新發布至邊緣**，並驗證成功輸出，徹底杜絕因本地環境與雲端運算環境脫節造成的「改了卻沒生效」驗收落差。
    - **成效指標**：
      - `npm run check` 0 錯誤、0 違規。
      - 單次部署耗時穩定於 8~10 秒內，全球邊緣 0 秒熱更新生效。
