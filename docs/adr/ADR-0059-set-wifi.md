# ADR-0059: 門市現場一鍵登記 Wi-Fi (set_wifi) 使用者實機驗收通過 (Persistent User Verification of Store Wi-Fi Registration v2.20.2)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.20.2`  
> **領域分類 (Category)**: `Frontend` / `LIFF`

---

## 決策內容與架構推演 (Decision Record)

- **驗收結果與持久化繼承**：
      - 使用者於門市現場完成實機一鍵登記 Wi-Fi（`POST /api/v1/tenant/locations/wifi`）操作驗收無誤。
      - 系統自動探測並更新門市白名單 IP，出勤打卡與白名單管理互動流程流暢。
      - 狀態持久化繼承：Section 2.1 全功能使用者實機驗證狀態矩陣已永久更新為 `[User Verified ✅]`，跨版本永久繼承。
    - **成效指標**：
      - `npm run check`（`client:check` + `tsc --noEmit` + `depcruise src`）維持 **0 型別錯誤、0 架構違規**。
