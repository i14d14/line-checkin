# ADR-0026: 考勤打卡紀錄批次撤銷與狀態機重置專用 CLI 腳本架構 (Check-in Revocation CLI & State Machine Reset ADR v2.7.2)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.7.2`  
> **領域分類 (Category)**: `DevOps` / `CLI`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. 測試或維運需要重置/撤銷特定同仁打卡紀錄時，手動登入 D1 終端執行 SQL 步驟繁瑣且耗時。
      2. Windows PowerShell 下使用 Wrangler 執行帶引號之 SQL 指令時易受參數解析與跳脫干擾。
      3. 撤銷後缺乏即時的考勤狀態機推論驗證，不易確認 30 分鐘防重複機制是否已順利解除。
    - **架構升級原則與解法**：
      1. **永久性專用 CLI 腳本 (`scripts/revoke-checkin.js`)**：
         - 內建於 `line-checkin-worker/scripts/revoke-checkin.js` 並於 `package.json` 註冊 `npm run revoke` 指令。
         - 同步備份於 `.agents/skills/cloudflare/scripts/revoke-checkin.js` 符合技能樹共用規範。
      2. **智慧模糊名稱比對 (Smart Name Matching)**：
         - 支援直接輸入員工姓名、暱稱或 LINE User ID（如 `豬毛`、`🐖毛`、`Ubd107bb...`），自動處理 Emoji 與繁簡差異，秒級精準定位目標帳號。
      3. **雙重處理模式與預覽機制**：
         - 預設安全撤回（`SET status = 'CANCELLED'`），完整保留歷史稽核軌跡並重置狀態機。
         - 支援 `--delete` 進行物理抹除，以及 `--list` 純預覽模式。
         - 支援 `--date <YYYY-MM-DD>` 指定日期（預設為今日台灣時間 UTC+8）與 `--all` 全量撤銷。
      4. **即時狀態機檢驗與自動稽核日誌**：
         - 執行後自動寫入 `device_audit_logs`（`CLI_REVOKE_CHECKIN` / `CLI_DELETE_CHECKIN`）。
         - 自動計算並印出該同仁的「前次有效打卡」與「下次打卡推論（上班/下班及 30 分鐘防呆解鎖狀態）」，秒級確認測試環境就緒。
