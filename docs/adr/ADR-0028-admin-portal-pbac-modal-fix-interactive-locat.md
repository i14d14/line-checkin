# ADR-0028: 地端管理後台 PBAC 彈窗渲染結構修復與門市據點卡片互動式全參數管理架構 (Admin Portal PBAC Modal Fix & Interactive Location Management ADR v2.7.4)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.7.4`  
> **領域分類 (Category)**: `Admin` / `PBAC`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. 地端後台「電子簽核審批」分頁中的【員工細粒度權限 (PBAC)】按鈕點擊後毫無反應。排查發現 SSR HTML 生成時，前一個對話框 `#assignApproverModal` 缺少最外層閉合標籤 `</div>`，導致 `#employeePermissionsModal` 被錯誤巢狀包覆在該隱藏對話框內部。即使用戶點擊按鈕移除 PBAC Modal 的 `.hidden` 類別，其父層元素仍為 `display: none`，造成彈窗完全無法顯現。
      2. 「據點與網路配置」分頁中的門市卡片為靜態唯讀呈現，管理人員無法點入檢視與變更該據點之精準 GPS 經緯度座標、中文地址、允許打卡半徑、Wi-Fi 固定公網 IP / CIDR 白名單與門市店長 LINE ID。
    - **架構升級原則與解法**：
      1. **HTML 結構與彈窗渲染修復 (Modal DOM Hierarchy Repair)**：
         - 補齊 `#assignApproverModal` 之閉合標籤，將 `#employeePermissionsModal` 還原為獨立之一級 DOM 節點，解決按鈕無反應之渲染隱疾。
         - **新增同仁快速下拉選單 (`#permEmployeeSelect`)**：點開 PBAC 彈窗時自動向 `GET /api/v1/tenant/employees` 抓取企業同仁清單，下拉選擇任一同仁即可自動帶入 LINE ID、姓名並即時預選其現有 10 項原子權限，提升管理效率。
      2. **據點卡片全卡片可點擊與互動式全參數配置 (Interactive Location Card Management)**：
         - 將據點卡片升級為全卡片可點擊（Hover 陰影加深、浮現「點擊管理 ➔」與專屬指針），並保留右上齒輪與卡片底部【管理設定】專屬 CTA 按鈕。
         - 點擊後喚起 `#locModal`，完整支援以下配置與快速動作：
           - **據點代碼**：編輯現有據點時自動唯讀保護，避免主鍵變更引發外鍵連帶錯誤；新增據點時開放輸入。
           - **門市名稱與地址**：支援即時編輯門市中文名稱與實體地址。
           - **高精度 GPS 座標**：提供經緯度輸入欄位，並內建【取當前定位】（透過瀏覽器 HTML5 Geolocation 秒級抓取現場精準座標）與【依地址重設】（清空經緯度讓後端儲存時自動依地址觸發 Nominatim 地理編碼）兩大快捷鍵。
           - **允許打卡半徑**：自訂 10 ~ 5000 公尺之電子圍欄範圍。
           - **Wi-Fi 固定公網 IP / CIDR 白名單**：支援多筆逗號分隔之固定公網 IP 或網段。
           - **門市店長 LINE ID**：設定門市預設審批主管，提供同仁未指派直屬主管時之自動兜底路由。
           - **門市立牌 QR Code 快速列印**：卡片與彈窗內部均附帶直達該門市立牌 QR Code 頁面之超連結。
         - 表單送出直接對接現有 `POST /api/v1/tenant/locations`，無縫完成 SQLite UPSERT。
