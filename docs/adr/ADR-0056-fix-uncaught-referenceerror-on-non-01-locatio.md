# ADR-0056: 修復前端控制台非 -01 分店據點點擊管理 ReferenceError 異常 (Fix Uncaught ReferenceError on Non-01 Location Click v2.18.1)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.18.1`  
> **領域分類 (Category)**: `Admin` / `UI Bugfix`

---

## 決策內容與架構推演 (Decision Record)

- **痛點根因**：
      - 前端腳本 [`src/views/admin/admin.client.js`](file:///d:/line-checkin/src/views/admin/admin.client.js) 之 `openEditLocationModal` 函式在判定「總部據點不可刪除按鈕」時，使用了未宣告變數 `currentUser`（`if (loc.id.endsWith('-01') || (currentUser && loc.id === currentUser.taxId))`）。
      - 總店 `24549210-01` 因以 `-01` 結尾觸發 JavaScript 邏輯或 `||` 之短路求值（Short-circuit evaluation），略過右側求值因此可正常彈窗；而分店 `24549210-02` 等非 `-01` 據點因左側為 `false`，強制求值未定義之 `currentUser`，拋出致命 `ReferenceError: currentUser is not defined`，導致彈窗呼叫中斷。
    - **修復方案**：
      - 於模組頂層宣告 `let currentUser = null;`，並於登入成功（`handleLogin`）、登出（`handleLogout`）、頁面初始化（`initAppView`）、Session 檢核（`checkAuthAndInit`）與本機快取還原（`getCurrentUser()`）時建立防禦性同步存取閉環。
      - 彈窗邏輯改用 `const user = getCurrentUser();` 安全取值，確保非 `-01` 分店據點點擊管理設定時不再報錯，且刪除按鈕依權限正確展開。
    - **實機驗收**：
      - 使用者於網頁管理後台實測點擊分店據點（`24549210-02`）確認彈窗開啟與管理功能運作正常（`[User Verified ✅]`）。
    - **成效指標**：
      - `npm run check`（`client:check` + `tsc --noEmit` + `depcruise src`）維持 **0 型別錯誤、0 架構違規**。
      - 擴充 [`test_admin_auth_and_keys.js`](file:///d:/line-checkin/test_admin_auth_and_keys.js) 新增 `-01` 與 `-02` 據點彈窗渲染與刪除按鈕顯示狀態之完整 DOM 虛擬執行驗證（30/30 通過）。
