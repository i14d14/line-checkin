# ADR-0027: 員工自主換機打卡防弊二階段阻擋與確認彈窗架構 (Self-Service Device Switch Anti-Fraud Modal & Two-Phase Confirmation ADR v2.7.3)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.7.3`  
> **領域分類 (Category)**: `Security` / `Anti-Fraud`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. 舊版雖然支援員工更換手機時自動覆蓋綁定（免管理員介入），但在首次使用新裝置打卡時會無聲無息地直接覆蓋舊機並打卡，無法有效遏阻「同事持他人手機代打卡」或「惡意代打」之作弊風險。
      2. 員工在非本人常用手機操作時，缺乏即時防弊警示告知「此動作將使舊機解綁」且「人事部將收到異常通報」，欠缺二度確認與心理震懾機制。
    - **架構升級原則與解法**：
      1. **後端換機防弊門禁 (`POST /api/checkin`)**：
         - 檢驗當前打卡裝置 `body.deviceId` 與 D1 `user_devices` 記錄。
         - 若為不同裝置且未帶 `confirmDeviceSwitch: true`：
           - **即刻攔截打卡**，不更新 `user_devices`、不寫入 `checkin_records`。
           - 回傳 HTTP `409 Conflict` 與 `{ success: false, requireDeviceSwitchConfirm: true, message: "為防範代打卡，使用新手機打卡將解除舊設備綁定並通報人事部。是否確認換機打卡？" }`。
      2. **前端高對比警示彈窗 (`#deviceSwitchModal`)**：
         - 採用琥珀警告色系與 `bg-black/60 backdrop-blur-sm` 毛玻璃浮層。
         - 精煉警訊：【⚠️ 偵測到更換打卡設備】—「為防範代打卡，使用新手機打卡將解除舊設備綁定並通報人事部。是否確認換機打卡？」。
         - 點擊【確認換機並打卡】：攜帶 `confirmDeviceSwitch: true` 重發打卡請求，後端順暢解綁舊機、覆蓋綁定新機、記錄 `SWITCH_DEVICE` WARNING 警告日誌並完成打卡。
         - 點擊【取消打卡】：關閉彈窗，終止當次打卡，舊手機綁定原封不動。
      3. **全自動測試覆蓋**：
         - 升級 `test_device_switch_alert.js`，包含 6A（未確認 409 攔截）、6B（二次確認打卡成功）、6C（LIFF 彈窗驗證）與後台整合驗證（24 項全過）。
