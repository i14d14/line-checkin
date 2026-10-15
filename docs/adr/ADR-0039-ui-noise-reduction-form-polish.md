# ADR-0039: LIFF 前端介面體驗優化與雜訊精簡 (UI Noise Reduction & Form Polish v2.14.1)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.14.1`  
> **領域分類 (Category)**: `Frontend` / `UI`

---

## 決策內容與架構推演 (Decision Record)

- **Item 1（已登入同仁視圖雜訊精簡）**：
      - 針對 `src/views/liff/liff-tabs.ts` 中 `#view-checkin` 一鍵打卡主卡片，移除已登入人員不需要看到之「加入打卡帳號好友」按鈕容器（Lines 82-87）。
      - 嚴格保留新人入職流程中之加好友 QR 彈窗（`onboardingSuccessModal`）以及公開立牌頁面（`/api/locations/:id/qrcode`）之加好友指引，確保新人導流路徑不受影響。
    - **Item 2（線上簽核送出按鈕精簡）**：
      - 將 `src/views/liff/liff-tabs.ts` 與 `src/views/liff/liff-scripts.ts` 中線上簽核送出按鈕文字「送出申請並推播主管」統一精簡為「送出申請」。
      - 嚴格維持 DOM ID `apprSubmitBtnText` 不變，並同步校準 `liff-scripts.ts` 在上傳失敗、網路錯誤及 `finally` 狀態重置邏輯，確保狀態機一致性。
    - **成效指標**：
      - `npm run check`（`tsc --noEmit` + `depcruise src`）維持 **0 型別錯誤、0 架構違規**（49 模組、119 條相依關係）。
      - `npm test` 累計 **131 項自動化測試 100% PASS**。
