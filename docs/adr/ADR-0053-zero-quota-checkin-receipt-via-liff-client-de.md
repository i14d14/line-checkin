# ADR-0053: 以 LIFF 前端代發 (liff.sendMessages) 達成打卡 0 額度消耗 (Zero-Quota Checkin Receipt via LIFF Client Delegation v2.16.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.16.0`  
> **領域分類 (Category)**: `LINE` / `LIFF Quota`

---

## 決策內容與架構推演 (Decision Record)

- **痛點根因**：
      - LINE 官方帳號免費方案每月僅 200 則訊息額度，且「後端主動 Push API」每人每則皆計入額度。員工每日上下班各打卡一次即消耗 2 則推播，導致 200 則額度迅速告罄。
    - **架構方案**：
      - 將打卡 Flex 卡片組裝與發送機制解耦，由前端客戶端調用 `liff.sendMessages` 送出卡片。
    - **實機發現**：
      - LINE 官方規範禁止在 `liff.sendMessages` 中使用 `postback` 動作（僅純文字/無按鈕之重複打卡卡片可送出，帶有翻轉/撤回按鈕之卡片被 LINE 攔截）。此改造牽涉廣泛互動重構。
