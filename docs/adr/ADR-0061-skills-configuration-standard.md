# ADR-0061: 註冊 `.agents/skills.json` 整合外部技能庫 (Skills Configuration Standard v2.20.6)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.20.6`  
> **領域分類 (Category)**: `Agent` / `Skills Integration`

---

## 決策內容與架構推演 (Decision Record)

- **技能註冊架構落實**：
      - 依據 Antigravity 客製化說明書（`agy-customizations`）規範，建立 [`.agents/skills.json`](file:///d:/line-checkin/.agents/skills.json)。
      - 透過 `include_only` 白名單精準引入外部 `C:/Users/pigmao/optional_skills` 中的 6 大專案技能（`cloudflare`, `dependency-cruiser`, `javascript-typescript`, `line-cloud-manager`, `software-architecture`, `sql`），自動排除無關技能。
      - 清理原先無法被 Antigravity 後端掃描識別的 Windows Junction 連接點，確保技能系統健康與目錄結構整潔。
    - **成效指標**：
      - `npm run check` 維持 **0 型別錯誤、0 架構違規**。
