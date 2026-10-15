# ADR-0031: 租戶管理與企業鑑權領域切片垂直解耦架構 (Tenant Management & Admin Auth Slicing ADR v2.8.3)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.8.3`  
> **領域分類 (Category)**: `Tenant` / `Auth`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. 管理後台帳號密碼登入、Session 簽發與停用、租戶 M2M API 金鑰管理、PBAC 細粒度原子權限配置與員工入職綁定全數堆疊於 `src/index.ts` 中，造成高昂的維護與理解負擔。
      2. 權限判定常數與輔助函式（如 `syncUserRichMenu`、`getUserPermissionContext`、`hasPermission`）內嵌於進入點，無法單獨進行模組化測試。
    - **架構升級原則與解法**：
      1. **Repository 層**：建立 [`src/repositories/tenant.repo.ts`](file:///d:/line-checkin/src/repositories/tenant.repo.ts)，封裝 `tenant_users`、`tenant_sessions`、`tenant_api_keys`、`company_employees` 與 `device_audit_logs` 之 D1 資料庫操作。
      2. **Service 層**：建立 [`src/services/tenant.service.ts`](file:///d:/line-checkin/src/services/tenant.service.ts)，封裝 PBKDF2 密碼比對、7 天 Session 管理、M2M API 金鑰生成與 SHA-256 雜湊、PBAC 權限配置、圖文選單批次同步、個人檔案查詢與新人入職綁定等純業務規則。
      3. **Route 層**：建立 [`src/routes/tenant.route.ts`](file:///d:/line-checkin/src/routes/tenant.route.ts)，承接 `/api/v1/admin/*` 與 `/api/v1/tenant/*` 以及 `/api/v1/employee/*` 鑑權路由，並由進入點委派分發。
      4. **成效指標**：
         - `src/index.ts` 代碼行數由 2,821 LOC 進一步降至 **2,279 LOC（單次淨減 542 行，累計相較原始 3,878 LOC 淨減 1,599 LOC，降幅達 41%）**。
         - 本地看門狗 `npm run check` 與 17 個模組依賴拓撲維持 **0 型別錯誤、0 架構違規、0 循環依賴**。
         - 全自動測試覆蓋：`test_admin_auth_and_keys.js` (27/27 PASS)、`test_permission_pbac.js` (47/47 PASS)、`test_onboarding_flow.js` (100% PASS) 全數通過。
