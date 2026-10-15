# ADR-0033: 前端 UI 雙巨石模板同構組件化解耦架構 (UI Template Decoupling & Componentization ADR v2.9.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.9.0`  
> **領域分類 (Category)**: `Frontend` / `UI`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. [`src/local-admin-html.ts`](file:///d:/line-checkin/src/local-admin-html.ts)（1,554 LOC）與 [`src/liff-html.ts`](file:///d:/line-checkin/src/liff-html.ts)（1,517 LOC）為全專案最後殘留的兩大「Smart UI 巨石單檔」，合計超過 3,100 行。
      2. HTML 標籤結構、CSS、多個彈窗（Modal）與客戶端原生 JavaScript 全數混雜於單一 TypeScript 模板字串 literal 內，IDE 與 Linter 將其視為純文字，無法檢驗 HTML 標籤閉合完整性，多次引發隱性 DOM 巢狀隱蔽故障（如 PBAC 彈窗失效事件）。
      3. 前端 JS `${...}` 變數插值與後端 TS 模板語法衝突，需反覆手動使用 `\${...}` 逃逸，心理負擔沉重。
    - **架構升級原則與解法**：
      1. **純組裝與同構拆解原則（Pure Assembly & Isomorphic Partials）**：
         - 堅持不改寫任何既有前端業務邏輯、DOM ID、CSS 類名或 API 請求格式，將代碼結構同構拆解為無副作用的純函式（Pure Functions），保證輸出 HTML 結構與重構前 100% 同構。
      2. **Milestone 4.1：地端管理後台解耦（Admin Portal Slicing）**：
         - 建立 [`src/views/admin/`](file:///d:/line-checkin/src/views/admin/) 專屬目錄：
           - `admin-layout.ts`：封裝 HTML `<head>`、登入視窗 `#loginContainer`、Header 導覽標籤與基礎外層骨架。
           - `admin-tabs.ts`：封裝 6 大管理分頁主體結構（據點、班表、紀錄、設備、金鑰、審批）。
           - `admin-modals.ts`：封裝 5 大管理彈窗（`createKeyModal`、`showKeyModal`、`locModal`、`assignApproverModal`、`employeePermissionsModal`）。
           - `admin-scripts.ts`：封裝管理後台全套 JavaScript 客戶端狀態、CRUD、Session 與 PBAC 互動邏輯。
           - `admin-view.ts`：純組裝器函式 `renderLocalAdminHtml(): string`。
         - [`src/local-admin-html.ts`](file:///d:/line-checkin/src/local-admin-html.ts) 降至 **6 行** re-export 轉發層（淨減 1,548 行）。
      3. **Milestone 4.2：LIFF 行動端介面解耦（LIFF Mobile Slicing）**：
         - 建立 [`src/views/liff/`](file:///d:/line-checkin/src/views/liff/) 專屬目錄：
           - `liff-layout.ts`：封裝 HTML `<head>`、頂部員工標籤、底部導覽標籤與手勢樣式。
           - `liff-tabs.ts`：封裝 5 大行動分頁（入職登記、一鍵打卡、出勤月曆、線上簽核、店長工作台）。
           - `liff-modals.ts`：封裝 2 大核心防弊彈窗（`onboardingSuccessModal`、`deviceSwitchModal`）。
           - `liff-scripts.ts`：封裝 LIFF SDK 初始化、GPS 定位、出勤月曆渲染、左右滑動手勢與二次確認換機打卡腳本。
           - `liff-view.ts`：純組裝器函式 `renderLiffHtml(liffId, defaultLocationName): string`。
         - [`src/liff-html.ts`](file:///d:/line-checkin/src/liff-html.ts) 降至 **6 行** re-export 轉發層（淨減 1,511 行）。
      4. **架構拓撲守護升級**：
         - 更新 [`.dependency-cruiser.cjs`](file:///d:/line-checkin/.dependency-cruiser.cjs) 之 `ui-not-to-db` 規則，防禦範圍自 `(liff|local-admin)-html.ts` 全面擴大涵蓋 `src/(views|liff-html|local-admin-html)`，杜絕 UI 表現層直連 DB/Repo 越權隱患。
    - **成效指標**：
      - 前端進入點雙檔代碼量由原本的 **3,071 LOC 降至各 6 LOC（總計淨減 3,059 LOC，降幅達 99.6%）**。
      - 36 個 TypeScript 模組與 82 條依賴關係達成 `npm run check` **0 型別錯誤、0 架構違規、0 循環依賴**。
