# 歷史架構決策紀錄存檔 (Historical Architecture Decision Records: ADR 1 - 25)

> **說明**：本文檔封存本專案 `v2.0.0` 至 `v2.7.1` 階段之歷史架構決策紀錄（ADR）。  
> 完整保留決策背景、替代方案權衡與系統架構演進歷程，以利長期架構審計與新成員溯源，同時解耦日常維護上下文以大幅降低 Token 消耗。

---

## 📌 架構定調紀錄 (2026-09-03 討論結論)

1. **對標標準**：全面以「人易科技 (NuEIP) LINE 考勤/打卡」為對標基準，核心打卡、防偽、電子簽核與雙軌選單已齊平（達成率 88%）。
2. **輕量 BPM 架構定調 (v2.0.0 / Schema v9)**：
   - 拒絕多層複雜簽核或 RBAC 表單冗贅，採用**「員工直屬主管綁定 ＋ 門市店長自動兜底」**雙軌路徑。
   - 員工送單直接推播至主管 LINE 聊天室，主管點擊【✅ 核准通過】或【❌ 駁回申請】立即完成決議。
   - **LINE 身分防偽確認**：LINE 平台保證 `event.source.userId` 由伺服器簽名保證不可偽造，舍棄多餘的自建 Token，改以嚴格比對 `event.source.userId === approval.approver_line_id` 杜絕轉傳冒審。
   - **不可變打卡流水原則**：補卡核准不修改歷史資料，而是在 `checkin_records` 新增一筆 `verify_mode = 'APPROVED_OVERRIDE'` 記錄，並註記補卡時間與單號，維持資料不可篡改性。
3. **資料庫架構確認**：維持現行**「3 張核心業務表（`employee_schedules` 預計排班 ＋ `checkin_records` 不可變打卡日誌 ＋ `approvals` 簽核流）＋ Worker 即時比對計算層」**。
4. **本機 Cloudflare 技能樹精簡瘦身 (v2.0.1)**：移除無關之 60+ 個模組（Pages, KV, R2, Vectorize, Hyperdrive, Queues, Email, Zero Trust, DNS, Python 腳本等），僅保留本案核心 4 大項（Workers, D1, Cron Triggers, Wrangler CLI）。
5. **`approvals` 表定位定調**：兼具「待辦狀態機（State Machine Queue）」與「法定稽核日誌（Audit Log）」雙重角色。相較於短期快取（Buffer/KV）或無狀態按鈕參數（Stateless Postback），獨立建表能確保過渡資料（審核中/已駁回）不污染出勤流水與班表，防止重複審核（Idempotency），並滿足法規稽核與員工查詢進度需求。

---

## 🏛️ 詳細架構演進紀錄 (ADR 6 - 25)

6. **細粒度原子權限體系 (PBAC Architecture v2.1.0 / Schema v10)**：
   - **摒棄僵化角色**：傳統 RBAC 角色模型（老闆/人事/主管/員工）過於僵化，無法適應「店長兼人資」、「資深員工代排班」、「特派幹部校正門市 GPS」等扁平組織彈性需求。
   - **10 大原子權限**：採用細粒度原子權限（`punch`, `apply`, `approve`, `view_store`, `view_all`, `set_location`, `set_wifi`, `device_audit`, `export_payroll`, `broadcast`），各同仁權限以 JSON 陣列儲存於 `company_employees.permissions`，後台可直接勾選任意組合。
   - **現場一鍵維運整合**：結合 LINE 平台原生能力（位置分享訊息釘選更新 GPS 座標、現場連網一鍵登記 Wi-Fi 對外 IP、聊天室指令「今日出勤」「今日班表」「我的權限」），徹底將店長日常營運與門市配置下放至 LINE 介面中。

7. **雙軌動態圖文選單與極簡純色高對比設計 (Dual Rich Menus & Minimalist CTA v2.2.3)**：
   - **UI 視圖投影 ＋ 後端 PBAC 鑑權**：選單僅為行動端入口（View Projection），後端 PBAC 是安全門禁。後台配置權限時，Worker 自動呼叫 LINE API 將具備任一管理權限者切換為主管選單；一般員工自動維持全域預設選單。
   - **極簡純色高對比排版規範**：全面去除副標題、次級說明文字與上方迷你小按鈕（Pill Badge），各板塊專屬主題色直接套用至背景與主文字 CTA。主文字嚴格限制為 2~4 個中文字，於 843px 畫布高度中垂直水平絕對居中（120px / 112px 微軟正黑粗體）。

8. **LIFF 頁籤深度鏈接與無縫路由系統 (Tab Deep Linking Architecture v2.2.4)**：
   - **LIFF URL 參數傳遞機制**：圖文選單 URI 動作直接附帶分頁識別碼（如 `https://liff.line.me/{LIFF_ID}?tab=calendar` 或 `?tab=approvals`）。
   - **三段式相容解析 (`getQueryParam`)**：針對 LINE 內部瀏覽器在 OAuth 驗證轉跳時常將參數壓入 `liff.state`（如 `?liff.state=%3Ftab%3Dcalendar`）或 Hash 路由的特性，實作智慧解析解碼，首屏立即渲染目標分頁，杜絕閃爍，並於身分就緒後精準觸發該分頁之資料載入。

9. **LIFF 管理工作台依 PBAC 權限動態隔離機制 (Role-Gated Admin Tab Architecture v2.2.5)**：
   - **初始防禦性隱藏 (Hidden by Default)**：HTML 導航列之「管理工作台」按鈕（`#nav-admin`）預設帶有 `hidden` class。一般員工開啟 LIFF 時，導航列僅呈現「一鍵打卡」、「出勤月曆」、「線上簽核」三項功能，以 `flex-1` 完美均分寬度。
   - **PBAC 動態提權渲染**：前端於 LIFF 認證後異步向 Worker 查詢權限上下文（`/api/v1/employee/profile`）。僅當 `isManager === true` 時，前端方動態移除 `hidden` 並添加 `flex`，展現管理工作台。
   - **客戶端路徑防竄改攔截**：`switchView` 內建第二道安全檢驗，任何非主管身分試圖透過 URL `?tab=admin` 存取管理分頁時，自動攔截並強制回退至一鍵打卡（`checkin`），兼顧極致的使用者體驗與資訊安全。

10. **出勤月曆時態感知與待出勤天空藍視覺體系 (Temporal Calendar & Sky-Blue Scheduled Status v2.2.6)**：
    - **時態分離（Temporal Separation）**：審計引擎全面引入時態比對。針對未來日期（`dateStr > todayStr`），摒棄因「無打卡紀錄」即直接落入曠職（ABSENT/紅字）之盲目邏輯。
    - **三態劃分與色彩語意**：
      - 未來工作日：狀態判定為 `SCHEDULED`（「待出勤」），視覺賦予專屬**天空藍色系 (`bg-sky-50 border-sky-200 text-sky-800`，圓點 `bg-sky-400`)**。天空藍象徵未來的排程任務，既具備色彩活力，又能與灰色的「例假/休假」以及紅色的「曠職/異常」形成明確對比。
      - 未來例假日：狀態判定為 `REST_DAY`（「休假」），視覺維持灰底 (`bg-gray-100`)。
      - 過去未出勤日：仍如實標記為 `ABSENT`（曠職/紅字）。
    - **指標真實性保證**：當月匯總統計之「異常缺卡」（`missing_punch_count`）自動排除未來的 `SCHEDULED` 日期，避免當月中旬員工看到虛胖的幾十次缺卡警示。

11. **確定性 UTC 曆法錨定與跨時區週休二日校準 (Deterministic UTC Calendar Anchor Architecture v2.2.7)**：
    - **V8 Isolate 宿主機時區特性**：Cloudflare Workers 邊緣節點之宿主系統時鐘全球統一鎖定為 UTC+0（GMT+0）。若在程式中直接使用 `new Date(dateStr + "T00:00:00+08:00").getDay()`，V8 會將台灣時間扣除 8 小時換算為英國時間前一天（週一 00:00 ➔ 週日 16:00），進而導致所有日期的星期幾全數倒退一天，使常態班週休二日被誤判為「休日、一」。
    - **純粹萬年曆錨定解法**：全面改採 `const [y, m, d] = dateStr.split("-").map(Number);` 與 `new Date(Date.UTC(y, m - 1, d)).getUTCDay()`，直接以年、月、日絕對數值錨定萬年曆星期幾，不進行任何加減 8 小時之宿主時差換算。
    - **零回歸保證**：無論 Worker 執行於任何國家之邊緣節點或本地測試環境，週六（`6`）與週日（`0`）之例假判定皆 100% 恆定，週一至週五正常上班排程絕不再發生時區位移。

12. **LIFF 行動端左右滑動手勢與待出勤極簡視覺 (LIFF Touch Swipe & Scheduled Visual ADR v2.2.8)**：
    - **去圓點語意分離**：出勤月曆中，未來排班「待出勤（`SCHEDULED`）」維持天空藍底框 (`bg-sky-50`)，但移除下方小圓點。小圓點（綠/黃/紅/紫）語意收斂為「已發生的實體打卡流水或異常狀態」，徹底消除員工以為「該天已過或已打卡」的視覺混淆。
    - **原生級觸控滑動體驗**：LIFF 容器內建觸控手勢偵測（`initSwipeGestures`），動態感應一般員工 3 頁與主管 4 頁的分頁邊界，左右滑動即可順暢切換「一鍵打卡 ⇄ 出勤月曆 ⇄ 線上簽核 ⇄ 管理工作台」，並配置 `touch-action: pan-y` 與輸入框/下拉選單避讓邏輯，杜絕表單輸入或縱向滾動時的誤觸。

13. **新人專屬入職卡片與明確綁定流程 (Explicit Onboarding Opt-in ADR v2.2.9)**：
    - **職責解耦 (Decoupling Onboarding & Check-in)**：將「員工入職綁定（`POST /api/v1/employee/join`）」與「日常出勤打卡（`POST /api/checkin`）」完全解耦。消除舊版以打卡作為初次入職隱式註冊的黑箱體驗。
    - **視圖嚴格二分隔離**：
      - 未歸屬公司之新人掃描門市 QR Code 時，系統自動隱藏常態分頁導航列，僅展示專屬【新進同仁入職邀請卡片】（門市資訊、地址、LINE 個人頭貼、功能預覽與【🤝 確認加入】按鈕）。
      - 已在職員工開啟 LIFF 時，系統識別已綁定，完全不渲染入職卡片，直接進入常態打卡與月曆介面。
    - **即時狀態轉場**：新人點擊【確認加入】完成綁定後，系統自動更新權限上下文，解鎖上方分頁列並平滑過渡至打卡主介面。

14. **非員工單排三鍵寬入職按鈕與動態導航解鎖 (Non-Employee Full-Width Tab ADR v2.2.10)**：
    - **新人單一滿版按鈕視覺（`#nav-onboarding`）**：未歸屬公司之非員工進入 LIFF 時，上方導航列僅呈現單一滿版橫排按鈕（`w-full` / 3 按鈕等寬）標明【🪪 入職登記】，其餘在職專屬頁籤（打卡、月曆、簽核、工作台）全數隱藏，杜絕任何混淆。
    - **動態解鎖過渡**：點擊【確認加入】後，前端即時將【入職登記】按鈕隱藏並展開在職員工專屬 3 格（或主管 4 格）導航列，平滑過渡至「一鍵打卡」主頁面。

15. **門市立牌全面改為 LINE 官方帳號加好友 QR Code (Official Account Stand QR ADR v2.3.0)**：
    - **痛點根治**：舊版門市立牌 QR Code 直連獨立 LIFF 網頁（`https://liff.line.me/...`），導致新進員工完成入職後，手機內未曾加入官方帳號好友或留下聊天室對話紀錄。隔日上班時失去打卡入口，亦無法使用常駐圖文選單、接收打卡收據與主管審核通知。
    - **官方帳號統一入口**：所有門市立牌 QR Code（包含地端管理後台 `/admin` 與公開端點 `/api/locations/:id/qrcode`）全面改為生成 **LINE 官方帳號加好友 / 聊天室連結（`https://line.me/R/ti/p/@375nvoga`）**。
    - **閉環工作流**：掃碼 ➔ 開啟 LINE 進入官方帳號加好友/聊天室 ➔ 點擊底部圖文選單【考勤打卡】➔ LIFF 進行入職綁定或每日出勤打卡 ➔ 系統推播打卡收據至聊天室 ➔ 隔日直接在已釘選之官方帳號一鍵出勤。
    - **Webhook Follow 事件**：Webhook 端點新增 `follow` 事件監聽，新同仁加入好友時即時回傳歡迎詞與入職/打卡操作指引。

16. **門市立牌 QR 回歸 LIFF 連結與獨立「加入打卡好友」按鈕 (LIFF QR with CID & Standalone Add-Friend Button ADR v2.4.0)**：
    - **架構衝突與權衡**：LINE 平台之官方加好友連結（`line.me/R/ti/p/@...`）屬於封閉式原生客戶端跳轉協定，任何附帶之 Query String 皆會被 LINE 伺服器強制剝除，無法穿透至 Webhook 或後續流程；導致若 QR Code 純為加好友連結，無法精準傳遞特定門市之 `cid` 代碼。
    - **雙軌互補解決方案**：
      1. **QR 碼本體帶 CID**：門市立牌 QR 碼全面改回編碼帶有門市代碼之 LIFF 網址（`https://liff.line.me/{LIFF_ID}?cid={STORE_ID}&bot_prompt=normal`），確保新人掃碼時 100% 精準載入該門市名稱與代碼，且首次登入時自動提示加入官方帳號。
      2. **門市立牌新增一鍵加好友實體按鈕**：立牌網頁在 QR Code 下方直接渲染全寬醒目的【💬 加入打卡帳號好友 (@375nvoga)】按鈕，點擊直達官方帳號名片與聊天室。
      3. **LIFF 前端雙向補強**：在新人入職卡片（`#view-onboarding`）與日常打卡介面（`#view-checkin`）皆配置高對比「加入打卡帳號好友」按鈕，兼顧「門市代碼零遺失」與「官方帳號好友高覆蓋率」。

17. **補請假智慧沖銷未到勤時段與正常工時保護 (Retroactive Leave Compensation & Anti-Conflict ADR v2.5.0)**：
    - **核心痛點**：舊版在主管核准請假時，一律將該日標記為全日例假（`is_rest_day = 1`）。當審計比對引擎（`evaluateDayAttendance`）看到該日為例假日、又看到同仁當天有出勤打卡流水時，會機械化認定為「假日加班（OVERTIME / 紫色）」，將原本已出勤的正常上班工時全數扭曲為加班，造成嚴重的計薪與出勤統計偏差。
    - **業務與勞基法正確認知**：同仁當日既然有打卡上班（例如 9/3 實際出勤 13:29 ~ 20:24，計 6.9h），該日即為「出勤工作日」而非「全日放假日」。補請假之核心定位在於**「沖銷未出勤時段的異常（免除遲到與曠職）」**，已上班的工時必須維持「正常出勤工時（NORMAL）」，絕不能列為加班。
    - **技術架構實作**：
      1. **審計引擎雙軌分流**：`evaluateDayAttendance` 識別 `shiftName` 包含 `請假` 時：
         - 若當日無打卡 ➔ 判定為全日請假（`REST_DAY`，灰底，工時 0h，加班 0h）。
         - 若當日有打卡流水 ➔ 判定為「出勤＋請假沖銷」：狀態為 `NORMAL`（綠底），工時為實際出勤時數（如 6.9h），加班工時歸零，豁免遲到與早退異常，狀態文字標示 `請假 (事假) + 出勤`。
      2. **簽核連動感知**：核准請假時自動檢查同仁當日是否已有打卡流水，若已有打卡則保持 `is_rest_day = 0`。
      3. **前端防呆與提示**：LIFF 申請補請假時，若選擇之歷史日期已有打卡流水，即時提示「該日已有出勤記錄，請假將自動沖銷未到勤時段，不影響已上班時數」，並自動推薦未出勤之時段（上半天/下半天）。

18. **入職官方帳號強好友雙重卡控 (Aggressive OAuth Prompt & Two-Stage Friendship Gate ADR v2.5.1)**：
    - **痛點根治**：同仁完成入職後，若手機未加入官方帳號好友或封鎖聊天室，隔日上班即失去打卡收據推播與圖文選單。舊版僅於立牌與卡片提供輔助型加好友按鈕，新人常因直接點擊【確認入職】而跳過加好友，進入正式打卡介面後再難補救。
    - **雙重保險技術架構**：
      1. **第一道防線（OAuth 強推廣）**：立牌 QR 碼全面採用 `bot_prompt=aggressive`。新人掃碼進入 LINE OAuth 登入時，LINE 原生強制彈出獨立全螢幕加好友對話框（綠色【加入】大按鈕），確保 95% 以上同仁在授權當下順手加好友。
      2. **第二道防線（LIFF 入職硬卡控）**：利用 `liff.getFriendship()` API 作為入職門檻。
         - 未加好友者：入職確認按鈕鎖定置灰（`disabled`），僅高亮提供【第 1 步：加入打卡帳號好友】。
         - 自動解鎖感知：監聽 `visibilitychange` 與 `focus` 事件，同仁在 LINE 點擊加好友返回 LIFF 時，前端自動無感重測並解鎖【第 2 步：確認加入公司考勤】。
         - 函式級防禦：`handleJoinCompany()` 內建第二道檢核，杜絕任何非好友同仁進入在職員工狀態。

19. **出勤明細請假時數專屬卡片與混合出勤工時保護 (Leave Hours Breakdown Card & Mixed Attendance ADR v2.5.2)**：
    - **痛點與需求**：同仁在同日「既有上班出勤、又有請假核准」之混合情境下（如 9/3 上班打卡 6.9 小時，標準班 8 小時，請假沖銷 1.1 小時），舊版出勤明細卡片（`#dayDetailCard`）僅列出預排班次、實際工時、上下班時間，同仁無法直接獲知當天被抵扣/核定的請假時數，亦無法核對是否符合法定一日 8 小時標準。
    - **後端審計引擎核心升級 (`auditDayAttendance`)**：
      - 精算標準班次總時數 `standardHours`（預設 8.0 小時，或依班表 `shiftStart`、`shiftEnd` 與 `break_minutes` 動態換算）。
      - 當日排定為請假班（`isLeaveShift`）且有打卡記錄（`validPunches.length > 0`）時，精準計算沖銷請假時數：`leaveHours = Math.max(0, parseFloat((standardHours - totalWorkHours).toFixed(1)))`。
      - 若當日為請假班且無打卡，則 `leaveHours = standardHours`（全日請假）。
      - API 端點 `/api/v1/attendance/monthly` 每日明細回傳 `leaveHours`，且於月度 `summary` 累加匯總 `total_leave_hours`。
    - **LIFF 前端視覺化設計**：
      - 在 `#dayDetailCard` 考勤四宮格下方新增全寬高對比琥珀色卡片（`#detailLeaveRow`）。
      - 當同仁點選之日期含有請假時數（`day.leaveHours > 0`）時，動態展示【🌴 請假時數：X.X 小時 (假別)】（例如：`1.1 小時 (請假 (事假))`）。
      - 針對已出勤時數顯示標籤：`${day.workHours} 小時 (已抵請假)`，完整閉環「實際上班 6.9h + 請假 1.1h = 標準 8.0h」之完整邏輯，零加班衝突、零理解歧義。

20. **入職成功即時落庫與彈出式加好友強引導閉環 (Instant Enrolled Persistence & Success Add-Friend Modal ADR v2.5.4)**：
    - **痛點根治**：同仁點擊加入好友外部連結（`line.me/R/ti/p/...`）時，LINE 客戶端常強制關閉或導航替換現有 LIFF 頁面。若要求「先加好友才給按入職」，同仁跳轉後入職頁面直接遺失，導致入職未完成，極易引發挫折感。
    - **架構升級原則（身分優先落庫）**：
      1. **入職無阻礙一鍵完成**：新人於入職卡片點選【確認加入 [門市名稱]】後，系統第一時間直接呼叫 `POST /api/v1/employee/join` 將在職資料寫入 D1 `company_employees`，確保身分「100% 優先落地儲存」。
      2. **入職成功彈窗強引導加好友 (`#onboardingSuccessModal`)**：落庫完成後，畫面上即時彈出全螢幕毛玻璃慶祝彈窗：
         - 展示門市綁定成功通知。
         - 提供醒目【💬 立即加入打卡帳號好友 (@375nvoga)】按鈕。
         - 因資料已提前落庫，即便同仁點擊後頁面跳轉至官方帳號，官方帳號聊天室也能立即感知其員工身分並展示對應圖文選單，形成完美無死角的入職體驗閉環。
         - 亦提供【直接進入打卡頁面 ➔】選項供同仁無縫直達一鍵打卡主介面。

21. **出勤月曆低互動換月導航與工時標籤精簡 (Calendar Low-Interaction Navigation & Clean Work Hours ADR v2.5.5)**：
    - **痛點與需求**：
      1. 行動端（LINE 內嵌瀏覽器）使用者若欲查看上個月或下個月出勤，原生 `<input type="month">` 需點擊喚起系統級日曆/滾輪對話框、滑動選擇月份再按確認，步驟繁瑣、操作阻力大。
      2. 在有請假抵免的情境下，工時卡片顯示 `6.9 小時 (已抵請假)`，括號註記略顯冗贅，且下方已明確提供琥珀色專屬請假時數卡片（`#detailLeaveRow`），重複標示造成版面視覺雜訊。
    - **架構實作**：
      1. **膠囊型快速換月導航組件**：以 `changeCalendarMonth(offset)` 封裝確定性 UTC 曆法滾動運算，兩側配置 `<` / `>` 微型按鈕，1-Click 快速切換前/後月份並立即非同步獲取月度考勤，保留原生 input 供大幅度年份跳轉。
      2. **工時字串純粹化**：將 `detailWorkHours` 簡化為 `\${day.workHours} 小時`，完全移除 `(已抵請假)` 字樣，與下方 `detailLeaveRow` 形成「實際出勤工時」與「請假核定時數」分道展示的乾淨結構。

22. **RBAC 與 PBAC 雙軌統一化與 2 排 4 格主管超集工作台選單 (Unified Role Views with PBAC & Superset Rich Menu ADR v2.6.0)**：
    - **核心痛點**：
      1. 系統底層已升級為 10 大原子權限之 PBAC，但 LINE 選單與 LIFF 前端仍殘留二元 Role（`isManager` / `isUserManager`）假象。
      2. 舊版主管選單為塞入「今日出勤」與「門市班表」文字指令，直接閹割了主管個人的【排班月曆】與【線上簽核】。
      3. 後端 `getUserPermissionContext` 曾存在「若為店長則自動回補 `perms.push(...)`」的反模式，破壞了資料庫 PBAC 的單一真實來源。
      4. LIFF 工作台以 `!isUserManager` 做硬卡控，導致獲授權 `set_wifi` 或 `set_location` 之同仁被阻擋在工作台外。
    - **架構升級原則與解法**：
      1. **底層 PBAC 唯一真理**：
         - 徹底移除後端隱式特權補權限邏輯。員工擁有哪些權限，100% 忠實於 D1 `company_employees.permissions`。
         - `locations.manager_line_id` 僅代表該門市業務負責人與簽核路由兜底人，不做系統權限越權覆寫。
      2. **LINE 主管端 2 排 4 格超集選單 (`richmenu-26e2f94f69a7e091962de3f22e6b6361`)**：
         - 畫布規格：標準 Large（2500 × 1686）。
         - **上排（個人基礎考勤，完全對齊員工選單）**：【考勤打卡】、【排班月曆】、【線上簽核】（3 格等寬）。主管亦為員工，完整保留個人出勤與簽核入口。
         - **下排（1*3 全寬巨幅工作台按鈕）**：【門市管理工作台】（直達 `?tab=admin`），主管沉穩曜石靛青藍底搭配紫晶飾條，白字大字級 CTA，低互動成本一鍵直達 LIFF 工作台。
         - **投影門檻**：以 `MANAGEMENT_PERMISSIONS` 為準，具備管理維運能力者自動投影此選單。
      3. **LIFF 前端權限驅動 UI (Permission-driven UI)**：
         - 淘汰 `isUserManager` 閘門，工作台頁籤、滑動邊界與 `switchView('admin')` 路由防禦全面改由 `canAccessAdminTab()` 控制。
         - 工作台內部卡片（Wi-Fi 登記、GPS 釘選更新指引、出勤看板等）個別檢核原子權限，各司其職。
         - 職能徽章細化為「門市店長 / 主管」（綠）、「門市維運幹部」（紫）、「一般員工」（藍）。

23. **出勤月曆當日 (TODAY) 專屬狀態與高亮標記 ＆ 請假 (LEAVE) 暖琥珀色卡校準 (Calendar Today Status & Leave Amber Calibration ADR v2.6.1)**：
    - **核心痛點**：
      1. 舊版審計引擎將曆法二元劃分為「未來未發生（`dateStr > todayStr`，天空藍 SCHEDULED）」與「過去已完成（`dateStr < todayStr`，綠/紅）」，「當天（`dateStr === todayStr`）」處於狀態夾縫，未打卡工作日易被誤判或回退為預設灰色。
      2. 舊版將全日請假粗暴判定為 `status: 'REST_DAY'`、`isRestDay: true` 與 `statusColor: 'gray'`，導致同仁請假在月曆上呈現為與週末例假相同的死灰色，喪失假勤識別度。
      3. 月曆網格缺乏「今日（Today）」醒目外觀，同仁在行動端瀏覽整月格子時無法第一眼辨識哪一格是今天。
    - **架構升級原則與解法**：
      1. **三態劃分（過去已完成 / 今日進行中 / 未來排程中）**：
         - 審計引擎 (`auditDayAttendance`) 注入權威 `isToday: dateStr === todayStr`。
         - 當日尚未打卡且在下班前之排班工作日，狀態明確賦予 `TODAY`（狀態文字：`今日待出勤`，狀態色：`emerald`），徹底與未來的 `SCHEDULED`（天空藍）及過去的 `ABSENT`（曠職紅）分離。
      2. **今日焦點高亮環 (Today Focus Ring Indicator)**：
         - LIFF 前端偵測 `isToday`，自動為當日按鈕注入雙重光環（`ring-2 ring-emerald-500 ring-offset-1 font-bold z-10 relative`），並在待出勤狀態下展示翠綠 `今日` 徽章。
      3. **請假專屬暖琥珀色狀態 (`LEAVE`)**：
         - 核准之請假班（`shift_name` 包含請假）且無打卡時，狀態精準判定為 `status = 'LEAVE'`（狀態色：`amber`，`isRestDay: false`）。
         - LIFF 前端配置專屬暖琥珀色卡 (`bg-amber-50 border-amber-200 text-amber-900`) 與琥珀色圓點，與上方請假出勤明細卡片（`#detailLeaveRow`）100% 呼應。

24. **LIFF 用戶資料秒級載入與 SWR 本地快取平行化加速架構 (LIFF Sub-second Data Loading & SWR Profile Hydration ADR v2.7.0)**：
    - **核心痛點**：
      1. 行動端打開 LIFF 打卡頁面時，因未入職狀態（`isEnrolled`）預設為 `false`，頁面在載入前 1.5s～2.5s 會先突兀閃爍「新進同仁入職邀請 (Onboarding)」卡片，隨後才跳回正式打卡介面，嚴重影響視覺流暢度。
      2. 序列瀑布流請求（Request Waterfall）：依序等待 `liff.init()` -> `liff.getProfile()`（對 `api.line.me` 之外部跨網 HTTP 請求，行動端延遲 300~800ms）-> `checkUserPermissions()` (`/api/v1/employee/profile`) -> 各分頁月曆 API，造成白屏或旋轉等待超過 2 秒。
      3. 出勤月曆後端 `/api/v1/attendance/monthly` 曾連續對 D1 發出兩次獨立查詢（班表與打卡流水），增加了 edge 到 D1 的等待來回時間。
    - **架構升級原則與解法**：
      1. **SWR Profile 本地瞬時注水 (Stale-While-Revalidate Profile Hydration, 0ms First Paint)**：
         - 前端 JS 載入時立即從 `localStorage` 讀取快取的用戶身分（`line_checkin_user_profile`），0ms 直接渲染同仁姓名、頭像、所屬門市、統編與職能標籤。
         - 若本地已有入職標記，預設維持在正式考勤介面，徹底消除入職邀請卡片閃爍（No UI Flash）。
      2. **零延遲權杖解碼快路 (Fast-Path Identity Decoding)**：
         - 捨棄阻斷型跨網請求 `liff.getProfile()`，改用記憶體內本機解析之 `liff.getDecodedIDToken()`，直接取得同仁 `sub` (userId)、`name`、`picture`，將身分獲取耗時降至 0ms。
      3. **平行化後端驗證 (Parallel Revalidation)**：
         - 當本地已有快取身分時，`checkUserPermissions()` 不必苦等 `liff.init()` 完成，兩者於背景非同步平行啟動，並於驗證完畢後靜默覆蓋本機最新資訊。
      4. **分頁級 SWR 與導航快取 (Tab SWR Caching)**：
         - 將個人出勤月曆與我的簽核清單寫入 `sessionStorage`，切換 Tab 時秒級展示上次快取資料，背景無感拉取最新數據增量刷新。
      5. **資源預先連線 (Resource Preconnect)**：
         - 於 `<head>` 新增 `<link rel="preconnect">` 與 `dns-prefetch` 指向 `static.line-scdn.net` 與 `api.line.me`，提前建立 TLS 握手。
      6. **D1 查詢批次化 (D1 Query Batching)**：
         - 後端 `/api/v1/attendance/monthly` 升級為 `env.DB.batch([scheduleStmt, punchStmt])`，將兩次資料庫來回壓縮為單次批次作業，後端資料回應速度提升逾 50%。

25. **出勤月曆頂部指標卡片校準與使用者實機驗證狀態持久化規範 (Calendar Overtime Card & Persistent Verification State ADR v2.7.1)**：
    - **核心痛點**：
      1. 舊版出勤月曆頂部 4 大指標卡片列出「實際出勤天數 (`statDays`)」，對於打卡人而言實用性偏低，且未直接呈現至關重要的「加班時長 (`statOvertimeHours`)」，造成同仁無法即時核對當月加班累計時數。
      2. 專案歷程記錄缺乏明確且可持久化的「使用者實機驗證狀態」追蹤標準，無法有效區分「單元測試通過 (自動化)」與「真機情境通過 (使用者實測)」，易導致後續開發時反覆詢問或遺忘真實狀態。
    - **架構升級原則與解法**：
      1. **指標卡片精準聚焦 (Focus on Overtime Duration)**：
         - 廢除 `#statDays`，全面改為紫晶色系之「加班時長（`#statOvertimeHours`）」。
         - 頂部 4 卡精準定調為：【本月累計工時】(Emerald)、【加班時長】(Purple)、【遲到 / 早退】(Amber)、【異常缺卡】(Red)，2x2 對稱網格維持大字級與高對比，行動端視野聚焦。
         - 前端 `renderAttendanceGrid` 串接 API `data.summary.overtime_hours` 即時注水。
      2. **使用者實機驗證狀態持久化協定 (Persistent Verification Protocol)**：
         - 制定明確之三態劃分：`[User Verified ✅]`（使用者實機驗證通過）、`[Pending User Verification ⏳]`（待實機驗證）、`[Fixed - Re-verifying 🔄]`（修復後待覆測）。
         - 建立跨版本永續繼承機制：所有標註為 `[User Verified ✅]` 的功能在未來的版本更迭中永久繼承，除非使用者主動回報問題或該模組之程式碼/核心架構被實質修改，杜絕狀態遺失與重複確認。
