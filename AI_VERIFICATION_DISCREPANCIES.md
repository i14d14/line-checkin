# AI 檢測成功但用戶端檢測失敗清單 (AI Verification Discrepancy Register)

> **建立目的**：追蹤並記錄所有「AI 自動化測試與檢測全數通過（PASS），但使用者實機或現場操作卻回報 BUG」的案例。  
> **維護規範**：每次使用者回報新問題時即刻登錄，深入剖析「為什麼 AI 測試沒抓到」，並於修復後標記對應版本與防禦機制，杜絕同類型盲點二次發生。

---

## 📊 歷次檢測脫節案例登錄表

| 時間 | 檢測方法 (AI Verification) | 用戶回報問題 (User Reported Issue) | 沒抓到的原因 (Root Cause of AI Blindspot) | 是否已經修復 (Status) |
| :--- | :--- | :--- | :--- | :---: |
| **2026-09-02** | Node.js API 測試腳本發送 HTTP POST (`test_ip_whitelist.js`) | 員工在門市已連線 Wi-Fi，打卡卻顯示「外網降級（`GPS_FALLBACK`）」且因室內 GPS 飄移超過 100m 被系統阻斷。 | **真實雙棧網路環境落差（IPv6 Happy Eyeballs）**：<br>Node.js 測試僅發送 IPv4（`59.126.167.108`），但現代手機在中華電信雙棧 Wi-Fi 下自動優先走 IPv6 連線至 Cloudflare Edge，門市 D1 資料庫僅配置 IPv4 導致白名單比對失配。 | ✅ **已修復**<br>(`v2.18.0` 支援 IPv6 CIDR 白名單與現場一鍵登記 Wi-Fi) |
| **2026-09-03** | Webhook Postback 測試腳本發送模擬 JSON 數據 (`test_bpm_approvals.js`) | 主管在 LINE 聊天室點選「❌ 駁回申請」後，系統未送出駁回卡片，主管回報點了按鈕完全沒反應。 | **第三方平台非公開約束盲區（LINE Flex API 400）**：<br>單元測試只驗證 Webhook 後端業務邏輯，未將產出的 Flex JSON 與 LINE 官方規格進行契約校驗；按鈕包含非規格屬性 `inputOption: "openKeyboardWithMessage"` 遭 LINE Messaging API 400 Bad Request 拒收。 | ✅ **已修復**<br>(`v2.15.2` 修復屬性，`v2.21.0` 實裝 Zod Schema 嚴格校驗閘門) |
| **2026-09-04** | HTTP GET 抓取 HTML 並以正則字串比對 (`test_liff_swipe_and_dot.js`) | 員工手機點開線上簽核（請假/補卡/加班）分頁，點擊「送出申請」按鈕完全無反應、畫面卡死。 | **字串比對偽成功 ＆ 範本字串 TS 盲區**：<br>前端 JS 寫在後端 TS 範本字串中，`tsc` 完全無法檢查。變數 `currentApprType` 存在暫時死區（TDZ `ReferenceError`），在手機 V8 執行時整段崩潰，但 HTTP 200 與字串比對全數綠燈。 | ✅ **已修復**<br>(`v2.15.1` 搬移變數，`v2.21.0` 抽成獨立 TypeScript 與 esbuild 打包管線) |
| **2026-09-04** | 本機語法分析與後台頁面 HTTP GET 200 測試 (`client:check`) | 管理員點擊「權限配置」按鈕無法彈出浮層，或彈出後版面錯亂無法選取員工。 | **DOM 巢狀結構未在真實排版引擎渲染**：<br>純後端字串拼接 HTML 時，Modal `<div>` 標籤閉合順序顛倒，導致瀏覽器自動容錯解析將其渲染至螢幕外；純 HTTP 測試與語法檢查無法發現 DOM 樹渲染異常。 | ✅ **已修復**<br>(`v2.7.4` 校正 DOM 閉合結構) |
| **2026-09-05** | API 出勤計算與工時統計整合測試 (`test_calendar_attendance.js`) | 排班制員工反應未排班的休假日，出勤月曆頂部卻累計了「缺卡 1 次」或被標記「遲到」。 | **業務領域模型過度假設（幽靈常態班 Fallback）**：<br>測試腳本僅測試「有排班的正常員工」，未測試「排班制且整月未排班」的邊界狀況；系統預設 fallback 至常態班（09:00-18:00），將無班之日誤判為曠職。 | ✅ **已修復**<br>(`v2.20.0` 拔除幽靈常態班，建立實體排班 SSOT 與透明 UNSCHEDULED 狀態) |
| **2026-09-05** | API 登入與快取狀態測試 | 員工手機每次開啟 LIFF 打卡，畫面會先閃爍半秒的「新進同仁入職登記」大按鈕，隨後才跳回打卡按鈕。 | **非同步網路延遲與視覺競爭條件（Visual Race Condition）**：<br>API 測試只斷言請求返回後的終態，未捕捉客戶端等待網路回傳時的空白/初始 DOM 渲染狀態（未做 SWR 本地快取立即 Hydration）。 | ✅ **已修復**<br>(`v2.16.0` 引入 LocalStorage SWR 0ms 立即注水) |
| **2026-09-06** | LINE Webhook 模擬事件測試 (`test_safety_net.js`) | 主管在 LINE 聊天室輸入文字指令時，LINE 官方機器人同時噴出「很抱歉，本帳號無法個別回覆...」罐頭訊息搶答。 | **平台維運配置盲區（Platform Settings Disconnect）**：<br>代碼端 Webhook 解析與回應完全正確，但 LINE Official Account Manager 後台預設開啟「Auto-reply messages」，AI 代碼測試無法涵蓋 LINE 雲端後台的 GUI 設置。 | ✅ **已修復**<br>(`v2.19.0` 明文列入架構維運不變量，關閉 LINE 內建自動回應) |
| **2026-09-08** | 範本字串語法檢查與一般正向整合測試 | 檢查好友狀態流程可能在特定分支靜默失敗；補佐證照片後重設申請單引數報錯。 | **範本字串隱藏死代碼與型別疏漏**：<br>前端腳本中呼叫了未定義的 `updateOnboardingFriendshipUI()`，以及 `removeApprProof()` 缺少可選引數定義，在純字串比對下無法抓出。 | ✅ **已修復**<br>(`v2.21.0` 透過 `tsc -p tsconfig.client.json` 靜態分析自動捕獲並修復) |
| **2026-09-08** | API 入職與沙盒流程測試 (`test_onboarding_flow.js`) | ① 官方帳號未加好友非硬性限制（先出入職按鈕，成功彈窗可直接退出）；② 據點代碼折行（`24549210-` / `01` 斷裂）、確認按鈕勾勾偏左邊界、文字帶 `-` 且未水平置中。 | **未設前置強制閘門 ＆ 缺乏真機視窗幾何渲染斷言**：<br>① 業務邏輯採入職後彈窗引導（軟性），未將 `liff.getFriendship()` 作為入職 API 的前置硬性聯鎖；② 測試未模擬手機窄視窗（360px），門市代碼缺少 `whitespace-nowrap` 導致換行，按鈕文字過長擠壓 icon。 | ✅ **已修復並通過實測**<br>(`v2.30.0` 雙重好友硬閘門 + 新人全寬圖文選單 + 使用者實機驗收通過) |
| **2026-09-08** | Python Pillow 腳本繪製 Rich Menu 圖片 (`generate_rich_menu_images.py`) | Rich Menu 按鈕為直角純色色塊缺乏質感，且無法渲染 Emoji，在圖片上退化為 Unicode 未知豆腐方塊 (`\uFFFD`)。 | **字型庫無 Emoji 字元表且 Pillow 無系統級 Font Fallback**：<br>使用微軟正黑體 (`msjhbd.ttc`) 單一字型，該字型不包含 Emoji 符號表；Pillow 不具備作業系統級字型回退機制，直接拋棄無法解碼之 Unicode 符號變形為方塊。 | ✅ **已修復並通過實測**<br>(`v2.31.0` 升級為 Edge Headless 原生排版與截圖管線，懸浮圓角卡片與 Segoe UI Emoji 全彩渲染) |
| **2026-09-08** | 動態切換選單整合測試 (`test_rich_menu_sync.js`) | 豬毛在資料庫中為普通員工，但在 LINE 聊天室看到的卻是 2 排 4 格主管管理選單。 | **測試 Teardown 主觀假設覆蓋 ＆ 缺乏日常自愈同步**：<br>測試腳本借用真實開發者帳號測試，並在 `finally` 區塊硬性將其還原為主管選單；加上系統在用戶登入/開啟 LIFF 時缺乏與 D1 真實權限對齊的自愈循環。 | ✅ **已修復**<br>(`v2.31.0` 實裝快照對稱還原 Teardown、LIFF 開啟自愈對齊循環，並已即時校正 LINE 伺服器選單為員工選單) |

---

## 🛠️ 長期防禦機制落實（與專案工程規範連動）

1. **前端靜態型別與打包管線（對應 TDZ、未定義函式、DOM 語法錯誤）**：
   * 所有客戶端腳本集中於 `src/client/`，由 `tsc -p tsconfig.client.json` 進行強型別檢核，並由 `esbuild` 在建置期打包為 `*.client.js`。
2. **LINE Flex Message 協議 Zod 契約閘門（對應 API 400 拒收）**：
   * 所有訊息發送前強制經過 `assertValidFlexMessage` / `assertValidFlexBubble` 驗證，並在 `test_flex_schemas.ts` 實施負向注入測試。
3. **雙棧網路與連線診斷（對應 Wi-Fi 降級誤判）**：
   * 自動化打卡測試必須同時包含 IPv4 與 IPv6 案例；門市 Wi-Fi 登記同時紀錄 IPv4 與 IPv6 `/64` 前綴。
4. **本表持續更新機制**：
   * 未來任何使用者實機覆測反饋之 BUG，必須第一時間在此表新增紀錄，分析「測試為何漏抓」，並補充自動化防禦測試後才允許標記為已修復。
