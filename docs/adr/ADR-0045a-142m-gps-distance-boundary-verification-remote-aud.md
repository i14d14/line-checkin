# ADR-0045a: 142m GPS 距離邊界驗證與遠端審計完備 (142m GPS Distance Boundary Verification & Remote Audit v2.14.7)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.14.7`  
> **領域分類 (Category)**: `Frontend` / `LIFF`

---

## 決策內容與架構推演 (Decision Record)

- **工項背景與審計目標**：
      - 使用者目前於家中遠端辦公，無法親赴門市（台中市北區美德街56-11號）實地測試。
      - 先前因測試腳本篡改總部 `allowed_radius` 為 500m，導致 141.66m ~ 142m 偏差之打卡被錯誤放行；v2.14.4 校準回 100m 後，需針對生產環境 Worker 與 D1 進行嚴謹之遠端自動化邊界審計，確保：
        1. 142m 處若未連上門市 Wi-Fi，外網連線必須被 100% 嚴格阻斷（HTTP 400 Bad Request）。
        2. 142m 處若連上門市 Wi-Fi（固定 IP `59.126.167.108`），必須享有室內 GPS 飄移豁免順利打卡（HTTP 200 OK, `IP_WHITELIST`）。
    - **審計執行與驗證套件 (`test_distance_142m_verification.js`)**：
      1. **生產據點設定驗證 (Objective 1)**：
         - 調用 `GET /api/locations/24549210-01` 與 D1 遠端查詢驗證美德總部據點：
           - 法定名稱：`豬毛有限公司 - 台中美德總部`（100% 嚴格遵循命名不變量）
           - 座標：`24.157722, 120.683167`
           - 允許半徑：`100` 公尺
           - 白名單 IP：包含 `59.126.167.108`
           - 標記：`has_ip_whitelist === true`
      2. **5 大關鍵情境遠端審計 (Objective 2)**：
         - **Scenario 1（回報案例座標覆核）**：座標 `(24.1565, 120.6835)`，Haversine 距離 140.02m（~142m），使用外網電信 IP (`223.140.1.10`)：
           - 100% 回傳 **HTTP 400 Bad Request**、`verifyMode === 'GPS_FALLBACK'`、`success === false`。
           - 錯誤訊息精確指明距離約 140m~142m 超出允許半徑 100m，且明確提示未連線至公司指定 Wi-Fi。
         - **Scenario 1b（精確 142.0m 座標攔截）**：座標 `(24.158999, 120.683167)`，Haversine 距離 142.00m，外網電信 IP：
           - 100% 回傳 **HTTP 400 Bad Request**，`distanceMeters: 142`，錯誤訊息精確載明「約 142 公尺，允許半徑：100 公尺」。
         - **Scenario 2（142m Wi-Fi 豁免打卡）**：相同座標 `(24.1565, 120.6835)`，帶有美德總部白名單固定 IP `59.126.167.108`：
           - 100% 回傳 **HTTP 200 OK**、`verifyMode === 'IP_WHITELIST'`、`success === true`。
         - **Scenario 3（合法 GPS 範圍內打卡）**：合法座標距中心 30m，外網電信 IP：
           - 100% 回傳 **HTTP 200 OK**、`verifyMode === 'GPS_FALLBACK'`、`success === true`。
         - **Scenario 4（邊界閥值 95m vs 105m）**：
           - 95m 處（距中心 94.96m）外網電信 IP：100% 通過（HTTP 200 OK, `GPS_FALLBACK`）。
           - 105m 處（距中心 104.97m）外網電信 IP：100% 阻斷（HTTP 400 Bad Request, `GPS_FALLBACK`，`distanceMeters: 105`）。
       3. **測試軌跡自持清理 (Objective 3)**：
          - 審計完成後自動執行 D1 清理語法，清除 `U_TEST_AUDIT_142M_%` 測試用戶之 `checkin_records`, `company_employees`, `user_devices`, `device_audit_logs` 紀錄，生產資料庫維持 100% 純淨。
     - **成效指標**：
       - 自動化審計套件 **39 / 39 斷言 100% PASS**。
       - `npm run check`（`tsc --noEmit` + `depcruise src`）維持 **0 型別錯誤、0 架構違規**（49 模組、119 條相依關係）。
