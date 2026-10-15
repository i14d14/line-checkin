# ADR-0049: 簽核駁回卡片去紅色化與情緒友善視覺優化 (De-escalating Rejection Card Color Palette v2.15.5)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.15.5`  
> **領域分類 (Category)**: `UI/UX` / `BPM Flex`

---

## 決策內容與架構推演 (Decision Record)

- **背景與需求**：
      - 簽核申請未通過原採用鮮紅色大面積標題與紅色駁回框，易引發驚悚焦慮感（杏仁核反應）造成不必要的情緒矛盾。
    - **色調重塑落地**：
      - **卡片頂部色塊**：由紅色改為沉穩灰階（`#4A5568`），標題採用客觀無威脅之 `📋 簽核申請未通過 (駁回)`。
      - **審查結果文字**：｢主管已駁回｣依指定調整為黑色（`#111111`）。
      - **駁回原因區塊**：全面淘汰紅色調（`#FFF5F5`, `#FEB2B2`, `#C53030`, `#9B2C2C`），改採冷靜柔和的板岩灰階容器（底色 `#F1F5F9`、外框 `#CBD5E1`、標題 `#475569`、理由文字 `#1E293B`）。
      - **全系統一致性**：同步更新 LIFF 與 Admin 端之駁回膠囊標籤為中性灰階（`slate-100` / `text-slate-700`），達成全站無刺眼紅色。
    - **驗證與品質**：
      - 擴充 [`test_dual_stack_and_reject_flow.js`](file:///d:/line-checkin/test_dual_stack_and_reject_flow.js) 色盤斷言，8 / 8 項測試 100% 通過。
      - `npm run check`（`tsc --noEmit` + `depcruise src`）維持 **0 型別錯誤、0 架構違規**。
