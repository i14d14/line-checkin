# ADR-0062: 前端獨立 TypeScript 建置管線 ＆ LINE Flex 協議 Zod 契約校驗閘門 (Frontend TypeScript Pipeline & LINE Flex Protocol Gate v2.21.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.21.0`  
> **領域分類 (Category)**: `Frontend` / `TS & Flex Protocol`

---

## 決策內容與架構推演 (Decision Record)

- **前端型別安全與獨立建置管線（解決問題 1）**：
      - 將原先嵌於後端範本字串 [`src/views/liff/liff-scripts.ts`](file:///d:/line-checkin/src/views/liff/liff-scripts.ts) 內之 1,516 行客戶端 JavaScript 完整抽出至獨立模組 [`src/client/liff/index.ts`](file:///d:/line-checkin/src/client/liff/index.ts)。
      - 建立客戶端專屬編譯配置 [`tsconfig.client.json`](file:///d:/line-checkin/tsconfig.client.json)，納入 DOM 與 ES2022 型別定義，客戶端腳本全面納入 TypeScript 靜態分析與型別防護。
      - 藉由 TypeScript 靜態分析，即時捕捉並修復了原先隱藏於範本字串中的未定義幽靈函式 `updateOnboardingFriendshipUI` 及 `removeApprProof` 引數型別瑕疵。
      - 引入極速建置工具 `esbuild`，於建置期將客戶端 TypeScript 編譯並打包為單一 IIFE 檔案 [`src/views/liff/liff.client.js`](file:///d:/line-checkin/src/views/liff/liff.client.js)（55.8KB，建置耗時 6ms），後端視圖模組透過 Wrangler 靜態文本規則直接引用。
      - `package.json` 串接 `build:client`、`client:typecheck`、`predev`、`predeploy`，保證開發與部署前自動執行前端建置與雙重型別檢核。
    - **LINE Flex Message 協議規格 Zod 契約閘門（解決問題 4）**：
      - 依據 LINE Messaging API v3 官方規格，建立嚴格的 Zod Schema 驗證模組 [`src/schemas/line-flex.schema.ts`](file:///d:/line-checkin/src/schemas/line-flex.schema.ts) 與校驗閘門 [`src/utils/flex-validator.ts`](file:///d:/line-checkin/src/utils/flex-validator.ts)。
      - 全面收緊 Postback Action 之 `inputOption` 屬性（僅允許 `"openKeyboard" | "openVoice" | "openRichMenu"`），徹底杜絕過去歷史版本曾出現之 `inputOption: "openKeyboardWithMessage"` 導致的 LINE 400 Bad Request 拒收漏洞。
      - 全面加固 5 大 Flex 訊息產出函式（[`checkin-flex.ts`](file:///d:/line-checkin/src/views/flex/checkin-flex.ts)、[`approval-flex.ts`](file:///d:/line-checkin/src/views/flex/approval-flex.ts)、[`announcement-flex.ts`](file:///d:/line-checkin/src/views/flex/announcement-flex.ts)、[`payslip-flex.ts`](file:///d:/line-checkin/src/views/flex/payslip-flex.ts)、[`reminder-flex.ts`](file:///d:/line-checkin/src/views/flex/reminder-flex.ts)），於訊息產出階段實施即時結構斷言。
      - 建立專屬自動化測試套件 [`test_flex_schemas.ts`](file:///d:/line-checkin/test_flex_schemas.ts)，涵蓋 10/10 項正向結構與負向注入（非法 `inputOption`、空 `altText`、未知元件）測試，100% 通過。
    - **成效指標**：
      - `npm run check`（`build:client` + `client:check` + `typecheck` + `arch:check`）維持 **0 型別錯誤、0 架構違規**。
      - 全量測試套件（`npm test`：Flex 規格 10/10、BPM 簽核、公告 46/46、薪資條 39/39、排班 SSOT 33/33）**100% PASS**。
      - Cloudflare Workers 邊緣部署成功（Version ID: `836cc429-f088-436e-800a-41cd2213d480`）。
