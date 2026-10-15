# ADR-0044: Cloudflare Dual-Stack IPv6 網路不變量確立與白名單測試套件全面升級 (Dual-Stack IPv6 Invariants & Verification Suite v2.14.6)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.14.6`  
> **領域分類 (Category)**: `Frontend` / `LIFF`

---

## 決策內容與架構推演 (Decision Record)

- **工項背景與技術成因**：
      - 當門市同仁連上店內 Wi-Fi 時，若門市網路或行動電信具備雙棧（Dual-Stack，如中華電信、寬頻業者），Cloudflare Edge 節點（依循 Happy Eyeballs / RFC 8305）會優先以 IPv6 進行路由與連線，`cf-connecting-ip` 帶有 IPv6 位址。
      - 若 D1 資料庫據點僅登記 IPv4 出口 IP，系統無法命中白名單，自動退回 `GPS_FALLBACK` 模式；若此時室內 GPS 飄移超出 100m，即會報錯「連線至公司指定 Wi-Fi，或確認 GPS 定位在門市範圍內」，使使用者誤以為「連上 Wi-Fi 卻被判定外網降級攔截」。
    - **架構規範與程式碼健全**：
      1. **`.agents/AGENTS.md` 規範收錄**：增列 `Cloudflare Dual-Stack Network & IPv6 Verification Invariants`（100% 英文規範），明定未來所有據點設定、打卡除錯與自動化測試皆必須同時涵蓋 IPv4 與 IPv6。
      2. **API 錯誤碼精準化**：更新 [`src/routes/checkin.route.ts`](file:///d:/line-checkin/src/routes/checkin.route.ts)，據點參數防呆檢驗失敗時回傳標準 HTTP 400 Bad Request。
      3. **自動化測試套件擴充**：升級 [`test_ip_whitelist.js`](file:///d:/line-checkin/test_ip_whitelist.js)，新增 4 大 IPv6 測試項目（29/29 測試 100% 通過）：
         - **IPv6 固定 IP 白名單直通** (`2001:4860:7:810::db`)：GPS 飄移 500m 依然打卡成功 (`IP_WHITELIST`)。
         - **IPv6 CIDR 網段比對** (`2404:6800:4008::cafe` 命中 `2404:6800:4008::/48`)：GPS 飄移 300m 打卡成功 (`IP_WHITELIST`)。
         - **未註冊之電信 IPv6 降級 GPS 成功** (`2001:b030:9999:ffff::1`)：GPS 在 100m 內順利通過 (`GPS_FALLBACK`)。
         - **未註冊之電信 IPv6 雙重攔截** (`2001:b030:9999:ffff::1`)：GPS 超出 500m 時精準以 HTTP 400 攔截 (`GPS_FALLBACK`)。
    - **架構與品質檢核**：
      - `npm run check` 零型別錯誤、零架構違規（49 modules, 119 dependencies cruised）。
      - 遵循美德總部官方命名不變量：`豬毛有限公司 - 台中美德總部`。
