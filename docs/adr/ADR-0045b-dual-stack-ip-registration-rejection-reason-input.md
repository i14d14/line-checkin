# ADR-0045b: 主管 LIFF 雙棧 IPv6 白名單登錄與 LINE 簽核駁回原因喚起 (Dual-Stack IPv6 Registration & Rejection Reason Input v2.14.7)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.14.7`  
> **領域分類 (Category)**: `LINE` / `Flex Protocol`

---

## 決策內容與架構推演 (Decision Record)

- **問題成因**：
      1. **主管 LIFF 管理工作檯一鍵登記未收錄 IPv6**：
         - 原先 `/api/v1/tenant/locations/wifi` 僅依賴伺服器端單次連線之 `cf-connecting-ip`。若主管裝置以 IPv4 連線，則完全遺漏門市寬頻之 IPv6 位址。
         - 行動裝置於 Wi-Fi 連線下使用 SLAAC 臨時位址（RFC 4941）每日輪替，若僅登記個別裝置之 `/128` 位址，店內其餘同仁與隔日打卡將全部失效。
         - `src/utils/network.ts` 內原以字串 `startsWith` 比對 IPv6 CIDR，在碰到非零壓縮之完整 IPv6 位址時發生比對失效。
      2. **主管駁回請假申請缺少原因輸入欄位**：
         - 後端本已具備駁回原因接收解析器（`webhook.service.ts` 支援 `【駁回 #id】原因：xxx`），且能寫入 D1 `approvals.details.reject_reason` 並推播同仁。
         - 然在 v2.14.3 中，因 Flex 按鈕屬性誤寫為非官方之 `openKeyboardWithMessage` 遭 LINE API 回傳 HTTP 400，當時誤將鍵盤喚起與前綴預填屬性移除，降級為無理由之直接駁回。
    - **修復與防護措施**：
      1. **基礎網路核心升級 (`src/utils/network.ts`)**：
         - 實作 128 位元 `BigInt` IPv6 解構器 (`ip6ToBigInt`)，支援零壓縮 (`::`) 與全位元遮罩運算。
         - 新增 `normalizeToIpv6Subnet64(ip)`：自動將門市現場偵測之 IPv6 臨時位址收斂為標準 `/64` 門市網段（例如 `2001:b030:2313:1100::/64`）。
         - 全面重構 `isIpInAllowedList`：IPv4 維持 32 位元位元運算，IPv6 採用 128 位元 `BigInt` 遮罩比對，徹底解決字串比對死角。
      2. **服務與路由擴充 (`checkin.service.ts` & `checkin.route.ts`)**：
         - `POST /api/v1/tenant/locations/wifi` 支援接收 `ips`, `ipv4`, `ipv6` 候選位址陣列，自動合併與去重現有白名單。
         - 新增 `GET /api/v1/tenant/locations/wifi`：即時回傳門市最新 `allowed_ips` 與伺服器探測 IP，供 LIFF 工作檯即時渲染。
      3. **前端 LIFF 雙棧探測與登錄 (`liff-tabs.ts` & `liff-scripts.ts`)**：
         - `cardWifiReg` 增設雙棧連線即時探測面板，平行探測 IPv4 (`api4.ipify.org` / `icanhazip`) 與 IPv6 (`api6.ipify.org` / `icanhazip`)。
         - 點擊「一鍵登記當前 Wi-Fi IP (雙棧 IPv4 + IPv6)」即可同時登錄 IPv4 與 IPv6 `/64` 門市網段。
      4. **LINE Flex 卡片合規鍵盤喚起 (`approval-flex.ts`)**：
         - 依據 LINE Messaging API 規範，將「❌ 駁回申請」按鈕正確設定為 `inputOption: "openKeyboard"`、`fillInText: "【駁回 #${approvalId}】原因："`、`data: "action=reject_prompt&id=${approvalId}"`。
         - 主管於 LINE 聊天室點擊駁回時，即刻跳出手機鍵盤並預填駁回前綴，輸入送出後自動由 Webhook 擷取原因、更新審核單據並推播通知申請同仁。
    - **成效指標**：
      - 新增專屬單元與整合驗證套件 [`test_dual_stack_and_reject_flow.js`](file:///d:/line-checkin/test_dual_stack_and_reject_flow.js) **7/7 斷言 100% PASS**。
      - 全量白名單測試套件 [`test_ip_whitelist.js`](file:///d:/line-checkin/test_ip_whitelist.js) **29/29 斷言 100% PASS**。
      - 全量業務整合測試套件（BPM、公告、薪資條）累計 **131 項自動化整合測試 100% PASS**。
