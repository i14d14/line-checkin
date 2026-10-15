# ADR-0055: 前端腳本實體檔案隔離與零轉義載入架構 (Client Script Physical Separation & Zero-Escaping Raw Loader v2.18.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.18.0`  
> **領域分類 (Category)**: `Frontend` / `LIFF`

---

## 決策內容與架構推演 (Decision Record)

- **背景問題**：
      - 過去將 1,400+ 行管理後台客戶端 JavaScript 包覆於後端 TypeScript 模板字串（`` `...` ``）中，在涉及跳行符號（如 `\n\n`）或特殊正規表達式時，後端編譯器會提早解碼轉義字符，造成瀏覽器端 JavaScript 出現非預期換行或語法崩潰（`SyntaxError: Invalid or unexpected token`）。
    - **核心架構重構**：
      - **實體檔案分離**：將前端 JavaScript 邏輯抽離至獨立實體檔案 [`src/views/admin/admin.client.js`](file:///d:/line-checkin/src/views/admin/admin.client.js)，重拾 IDE 原生語法高亮、格式化與靜態檢查能力。
      - **Wrangler Text Loader 零轉義機制**：在 [`wrangler.jsonc`](file:///d:/line-checkin/wrangler.jsonc) 設定 `rules: [{ type: "Text", globs: ["**/*.client.js"] }]`，讓 esbuild 將其直接編譯為外部原始文字模組，完全不經過 TS 模板字串求值，達成 Zero-Escaping 原樣注入。
      - **TypeScript 型別與依賴邊界防護**：於 [`src/types/client-assets.d.ts`](file:///d:/line-checkin/src/types/client-assets.d.ts) 提供環境宣告，[`src/views/admin/admin-scripts.ts`](file:///d:/line-checkin/src/views/admin/admin-scripts.ts) 作為轉接層單純封裝 `<script>` 標籤，完美符合 Dependency Cruiser 之 `views` 架構邊界規範。
      - **原生 AST 語法檢查**：於 `package.json` 整合 `client:check` (`node --check src/views/admin/admin.client.js`)，將前端語法錯誤攔截提前至編譯期。
    - **成效指標**：
      - `npm run check`（`client:check` + `tsc --noEmit` + `depcruise src`）維持 **0 型別錯誤、0 架構違規**。
      - 全自動化測試套件（BPM、公告、薪資條、據點刪除、後台鑑權等 170+ 測試項）100% 通過。
