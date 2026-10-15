# ADR-0042: 生產環境美德總部據點校準與測試腳本沙盒隔離 (HQ Location Calibration & Test Script Sandboxing v2.14.4)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.14.4`  
> **領域分類 (Category)**: `Frontend` / `LIFF`

---

## 決策內容與架構推演 (Decision Record)

- **問題成因（使用者回報 Item 2 & Item 3）**：
      1. 使用者於 10:37:42 連接辦公室 Wi-Fi 打卡，系統卻以 `GPS_ONLY` 模式進行驗證，且偏差 141.66 公尺仍判定通過。
      2. 經根本原因排查，先前測試腳本 `test_device_switch_alert.js` 直接調用 `POST /api/v1/tenant/locations` 覆寫正式總部據點 `24549210-01`，導致：
         - `allowed_ips` 被清為 `NULL`（導致 `checkin.service.ts` 判定 `hasIpWhitelist = false`，回退至 `GPS_ONLY` 模式）。
         - `allowed_radius` 被設為 `500` 公尺。
         - 目標座標被篡改為 `24.1565, 120.6835`（與美德街 56-11 號真實座標相距約 142 公尺），使打卡座標判定於 500 公尺寬鬆半徑內通過。
    - **修復與防護措施**：
      1. **測試腳本沙盒隔離**：
         - 將 [`test_device_switch_alert.js`](file:///d:/line-checkin/test_device_switch_alert.js) 據點 ID 調整為專屬沙盒 ID `24549210-TEST-SWITCH`，所有測試打卡嚴格綁定此 ID，絕不汙染正式據點。
         - 同步將 [`test_ip_whitelist.js`](file:///d:/line-checkin/test_ip_whitelist.js) 據點調整為 `24549210-TEST-IP` 與 `24549210-TEST-NOIP` 專屬沙盒據點，徹底杜絕日常自動化測試對正式資料之副作用。
      2. **生產 D1 資料庫總部據點校準**：
         - 執行 SQL UPDATE 校準生產環境 D1 `locations` 表中 `id = '24549210-01'` 之紀錄：
           - `target_lat`: `24.157722`
           - `target_lon`: `120.683167`
           - `allowed_radius`: `100`（標準 100 公尺圍欄）
           - `allowed_ips`: `'59.126.167.108'`（美德總部對外固定 IP）
           - 法定名稱維持不變量：`豬毛有限公司 - 台中美德總部`
           - 保留原有門市店長 LINE ID：`U4eb5f204f746d1ab2b360e687eb99105`
    - **實機與全套驗證**：
      - 模擬連線 `59.126.167.108` 進行打卡驗證測試，確認驗證模式為 `IP_WHITELIST` 且 GPS 飄移下依然打卡成功。
      - 模擬 4G 非白名單 IP 在 100m 之外打卡，確認精確被 `GPS_FALLBACK` 攔截（HTTP 400）。
      - 模擬 4G 非白名單 IP 在 100m 之內打卡，確認以 `GPS_FALLBACK` 模式順利通過。
