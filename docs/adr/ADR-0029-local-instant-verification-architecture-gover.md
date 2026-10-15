# ADR-0029: 本地即時看門狗與架構依賴拓撲守護建立 (Local Instant Verification & Architecture Governance ADR v2.8.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.8.0`  
> **領域分類 (Category)**: `Architecture` / `Governance`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. 專案長期依賴「編輯代碼 $\rightarrow$ 部署至 Cloudflare Edge (20~30s) $\rightarrow$ 遠端執行 E2E 測試 (30~60s)」的長反饋迴圈，任何變數名拼錯或少寫引號皆需付出 1~2 分鐘高昂雲端等待代價。
      2. 專案缺乏靜態型別與架構依賴檢查看門狗，經本地執行 `tsc --noEmit` 診斷出 `src/index.ts` 存在 9 項潛在型別錯誤（含 `null` 運算相減、`profile.sub` 屬性不符、`Env` 缺少 `LINE_LIFF_APP_ID` 宣告、未定義 token 傳入等隱疾），長期被 Wrangler esbuild 忽略。
      3. 系統為 ~4,000 LOC 單檔 Monolith，後續拆解模組若無架構看門狗，極易引發循環依賴 ($A \leftrightarrow B$) 或 UI 表現層越權直接呼叫底層 DB 之架構退化。
    - **架構升級原則與解法**：
      1. **本地極速雙重看門狗整合**：
         - 引入 `dependency-cruiser` 至開發依賴，並建立專屬架構防禦設定檔 `.dependency-cruiser.cjs`。
         - 配置嚴格架構防禦規則：`no-circular`（零容忍循環依賴）、`not-to-unresolvable`（禁止無法解析路徑）、`ui-not-to-db`（UI 表現層禁止直接存取底層 DB/Repo）與 `no-orphans`（孤島死代碼警告）。
         - 整合 `package.json` 快捷指令：`npm run typecheck` (`tsc --noEmit`)、`npm run arch:check` (`depcruise src`)、`npm run arch:metrics`（輸出 $C_a, C_e, I$ 指標矩陣）、`npm run arch:graph`（產出 Mermaid 依賴圖）與複合看門狗 `npm run check`。
      2. **9 項潛在型別錯誤徹底歸零 (0-Error Baseline)**：
         - `Env` 介面補齊 `LINE_LIFF_APP_ID?: string`，杜絕動態屬性存取錯誤。
         - `auditDayAttendance` 針對 `parseTimeToMinutes` 回傳值實施嚴格 `sMins !== null && eMins !== null` 與 `schedOutMins ?? 1080` 空值安全防護，杜絕 `NaN` 運算破壞。
         - 校準 `verifyLineIdToken` 回傳取值為 `profile.userId`。
         - 為 `syncUserRichMenu` 注入 `env.LINE_CHANNEL_ACCESS_TOKEN || ""` 安全回退字串。
      3. **成效指標**：
         - 本地靜態代碼與拓撲防禦掃描時間自原本的 **120 秒（雲端部署測試圈）驟降至 < 2 秒（本地記憶體掃描）**。
         - `npm run check` 達成 **0 型別錯誤、0 架構違規、0 循環依賴** 之權威基準線，既有狀態機與換機測試 100% 通過。
