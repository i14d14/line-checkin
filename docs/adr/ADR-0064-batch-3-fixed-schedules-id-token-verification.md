# ADR-0064: Batch 3 自主驗證落地：固定班預設班表一鍵實體化與 ID Token 本機快速解碼 (Batch 3 Fixed Schedules Materialization & ID Token Fast-Path Injection v2.24.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.24.0`  
> **領域分類 (Category)**: `Roster SSOT` / `Identity & Security` / `Testing & Verification`

---

## 決策內容與架構推演 (Decision Record)

- **核心背景與待驗收範疇**：
  - 依據 [`AUTONOMOUS_VERIFICATION_ROADMAP.md`](file:///d:/line-checkin/AUTONOMOUS_VERIFICATION_ROADMAP.md) 之 Attention Budget Protocol，啟動 **Batch 3（固定班與身分注入）** 之端到端自動化驗證。
  - 覆蓋兩大關鍵待驗證項目：
    1. **項目 7**：固定班預設班表一鍵實體化（Auto-Seed & D1 落庫）
    2. **項目 8**：ID Token 本機快速解碼（零延遲身分注入與防呆）
- **Tier 3 JSDOM 虛擬 DOM 前端身分注水驗證**：
  - **SWR 本機快取率先注水 (0ms Early Hydration)**：在 LIFF SDK 初始化完成前，優先從 `localStorage` 之 `line_checkin_user_profile` 讀取並注水 `#userName` 與 `#userProfileTag`，徹底消除入職邀請卡片閃爍。
  - **Fast-Path 記憶體即時解碼**：`liff.getDecodedIDToken()` 在本機記憶體中同步解析 JWT payload，即時填入 `#userName`、`#userProfileTag` 與 `#userAvatar.src`，且 100% 繞過阻斷型跨網 `liff.getProfile()` 請求（Calls = 0）。
  - **優雅降級回退 (Graceful Fallback)**：模擬舊版 SDK 或解碼失敗拋出異常時，程式碼平滑回退至 `await liff.getProfile()`，DOM 依然能正確獲得身分注水且不崩潰。
- **Tier 4 D1 沙盒實體排班 SSOT 與權限防護**：
  - **後台一鍵生成端點 (`POST /api/v1/tenant/schedules/generate`)**：
    - PBAC 權限攔截：未授權請求回傳 `401`；非 ADMIN 角色（如 READ_ONLY 租戶金鑰）回傳 `403 Forbidden`；非法月份（如 `2026-13`）穩健攔截。
    - 生成排班精準性：自動為 `FIXED` 固定班同仁生成整月平日「常態班」（帶預設班表時間）與週末「例假」（`is_rest_day = 1`）。
    - 衝突保護與嚴格冪等：`INSERT OR IGNORE` 保證預先排定之特休假不被常態班覆蓋；重複生成時新寫入筆數嚴格為 0。
    - 租戶與排班制隔離：排班制同仁（`SHIFT`）嚴格不受影響，D1 內維持 0 筆排班。
  - **同仁查詢月曆觸發 Auto-Seed 實體化**：
    - 固定班同仁於無班表月份呼叫 `GET /api/v1/attendance/monthly` 時，後端自動批次落庫整月（31 筆）實體排班至 D1 `employee_schedules`，返回之月曆資料即刻呈現 `SCHEDULED` 與 `REST_DAY`，無任何 `UNSCHEDULED`。
    - 排班制同仁查詢同月月曆時，嚴格不觸發 Auto-Seed，回傳全 31 天 `UNSCHEDULED` 且 D1 中維持 0 筆。
- **後端 ID Token 零信任防呆**：
  - 打卡端點（`POST /api/checkin`）與線上簽核端點（`POST /api/v1/approval/request`）面對偽造/異常 `idToken` 時，精準執行 `verifyLineIdToken` 並以 `401 Unauthorized` 安全攔截。
- **強制環境自動清理 (Mandatory Teardown Hook)**：
  - 使用專屬 QA 沙盒租戶統編（`99999999`），測試結束於 `finally` 區塊全數清除測試同仁、排班、金鑰與打卡資料，保證生產資料庫 100% 潔淨。
- **成效指標**：
  - 專屬測試套件 [`test_batch3_verification.js`](file:///d:/line-checkin/test_batch3_verification.js) **43/43 斷言全數通過（100% PASS）**。
  - `npm run check`（`client:check` + `tsc --noEmit` + `depcruise src`）維持 **0 型別錯誤、0 架構違規**。
  - Cloudflare Workers 邊緣部署成功（Version ID: `4d78206b-ebcd-4549-bef9-c9ea157f1b81`）。
  - `LINE_CHECKIN_PROGRESS.md` 正式將這 2 項更新為 `[User Verified ✅]`。
