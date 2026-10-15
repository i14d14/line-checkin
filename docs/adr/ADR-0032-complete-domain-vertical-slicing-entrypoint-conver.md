# ADR-0032: 領域驅動模組全面垂直解耦與進入點收斂架構 (Complete Domain Vertical Slicing & Entrypoint Convergence ADR v2.8.4)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.8.4`  
> **領域分類 (Category)**: `LINE` / `Flex Protocol`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. 在完成 Milestone 3.1 ~ 3.3 後，`src/index.ts` 仍有 2,279 LOC，高度耦合了排班出勤月曆比對、打卡狀態機、換機防弊、LINE Webhook 簽核 Postback 與聊天室指令處理。
      2. 任何對打卡狀態機或月曆稽核邏輯的調整，都有可能意外波及 Webhook 事件分發或地端後台據點查詢，爆炸半徑（Blast Radius）仍舊過大。
    - **架構升級原則與解法**：
      1. **Milestone 3.4（排班管理與出勤月曆稽核領域切片）**：
         - **Repository 層**：建立 [`src/repositories/schedule.repo.ts`](file:///d:/line-checkin/src/repositories/schedule.repo.ts)，封裝 `employee_schedules` 與打卡流水跨表查詢及 D1 批次操作。
         - **Service 層**：建立 [`src/services/schedule.service.ts`](file:///d:/line-checkin/src/services/schedule.service.ts)，封裝純出勤稽核比對引擎（31 天出勤日誌、工時與加班沖銷、遲到早退缺卡判定）與 UTF-8 BOM CSV 排班範本生成。
         - **Route 層**：建立 [`src/routes/schedule.route.ts`](file:///d:/line-checkin/src/routes/schedule.route.ts)，承接 `/api/v1/attendance/monthly` 與 `/api/v1/tenant/schedules/*` 路由。
      2. **Milestone 3.5（考勤打卡、狀態機與裝置稽核領域切片）**：
         - **View 層**：建立 [`src/views/flex/checkin-flex.ts`](file:///d:/line-checkin/src/views/flex/checkin-flex.ts)，封裝打卡收據 Flex Bubble 渲染與即時 Push 推播。
         - **Repository 層**：建立 [`src/repositories/checkin.repo.ts`](file:///d:/line-checkin/src/repositories/checkin.repo.ts)，封裝 `locations`、`checkin_records`、`user_devices`、`device_audit_logs` 之 D1 資料庫操作。
         - **Service 層**：建立 [`src/services/checkin.service.ts`](file:///d:/line-checkin/src/services/checkin.service.ts)，封裝 GPS/IP 雙軌鑑權、打卡狀態機（首打卡/重複/早晚班/大夜班/長間隔歸位）、換機防弊二階段阻擋 (409 Conflict) 與計薪 CSV 匯出邏輯。
         - **Route 層**：建立 [`src/routes/checkin.route.ts`](file:///d:/line-checkin/src/routes/checkin.route.ts)，承接 `/api/checkin`、`/api/device/switch`、`/api/v1/tenant/locations*`、`/api/v1/tenant/records*`、`/api/v1/tenant/audit*`。
      3. **Milestone 3.6（LINE Webhook 事件網關與進入點收斂）**：
         - **Service 層**：建立 [`src/services/webhook.service.ts`](file:///d:/line-checkin/src/services/webhook.service.ts)，封裝 LINE 訊息回覆、Follow 事件、Postback 審批一鍵決策、30s 翻轉/撤回、Location 座標釘選與文字指令。
         - **Route 層**：建立 [`src/routes/webhook.route.ts`](file:///d:/line-checkin/src/routes/webhook.route.ts)，承接 `/api/webhook` 數位簽章驗證與事件分發。
         - **進入點裝配器 (Assembler)**：重構 [`src/index.ts`](file:///d:/line-checkin/src/index.ts) 為純粹的路由裝配器，代碼規模由原本的 **3,878 LOC 驟降至 102 LOC（總計淨減 3,776 行，降幅達 97.4%）**。
    - **成效指標**：
      - 26 個 TypeScript 模組與 72 條依賴關係達成 `npm run check` **0 型別錯誤、0 架構違規、0 循環依賴**。
      - 線上 Worker 部署成功（Version ID: `3b031ebe-cc82-419c-aa44-056f486a8710`）。
