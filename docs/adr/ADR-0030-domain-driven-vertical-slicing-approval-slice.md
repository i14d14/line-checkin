# ADR-0030: 核心領域驅動模組垂直拆解與線上簽核 BPM 切片落地 (Domain-Driven Vertical Slicing & Approval Slice ADR v2.8.2)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.8.2`  
> **領域分類 (Category)**: `BPM` / `Architecture`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. `src/index.ts` 膨脹至 3,878 LOC，混雜路由、PBAC 鑑權、打卡狀態機、D1 SQL 查詢與 Flex 模板，單次上下文 Token 開銷高昂，修改任一路徑均存在大規模爆炸半徑（Blast Radius）。
      2. 模組間未建立物理邊界，難以對審批簽核等業務進行獨立單元測試與安全演化。
    - **架構升級原則與解法**：
      1. **Milestone 3.1（共用型別與底層工具抽離）**：
         - 抽離共用介面至 [`src/types/index.ts`](file:///d:/line-checkin/src/types/index.ts)（包含 `Env`, `CheckinPayload`, `ApprovalRecord` 等）。
         - 建立零依賴葉節點工具庫：[`src/utils/crypto.ts`](file:///d:/line-checkin/src/utils/crypto.ts)、[`src/utils/geo.ts`](file:///d:/line-checkin/src/utils/geo.ts)、[`src/utils/time.ts`](file:///d:/line-checkin/src/utils/time.ts)、[`src/utils/network.ts`](file:///d:/line-checkin/src/utils/network.ts)、[`src/utils/taiwan.ts`](file:///d:/line-checkin/src/utils/taiwan.ts)。
      2. **Milestone 3.2（首個垂直領域切片：線上簽核審批 BPM）**：
         - **Repository 層**：建立 [`src/repositories/approval.repo.ts`](file:///d:/line-checkin/src/repositories/approval.repo.ts)，封裝所有 `approvals` 資料表之 D1 存取與主管路由。
         - **View 層**：建立 [`src/views/flex/approval-flex.ts`](file:///d:/line-checkin/src/views/flex/approval-flex.ts)，封裝 LINE Flex 簽核互動卡片與結果推播模板。
         - **Service 層**：建立 [`src/services/approval.service.ts`](file:///d:/line-checkin/src/services/approval.service.ts)，封裝審核主管路由優先序、補卡不可變流水覆寫與請假銷假排班連動業務邏輯。
         - **Route 層**：建立 [`src/routes/approval.route.ts`](file:///d:/line-checkin/src/routes/approval.route.ts)，承接 `/api/v1/approval/request`、`/api/v1/approval/my`、`/api/v1/tenant/approvals` 與 `/approver` 請求。
         - **Auth 服務抽取**：建立 [`src/services/auth.service.ts`](file:///d:/line-checkin/src/services/auth.service.ts)，封裝租戶憑證檢驗與 LINE ID Token 驗證，杜絕循環引用。
      3. **成效指標**：
         - `src/index.ts` 代碼行數自原本的 **3,878 LOC 驟降至 2,821 LOC（淨減 1,057 LOC，降幅 27%）**。
         - `npm run check` 達成 **0 型別錯誤、0 架構違規、0 循環依賴**。
         - 簽核審批全流程（申請、路由、Webhook 一鍵核准/駁回、出勤自動補正）實現完全模組化解耦。
