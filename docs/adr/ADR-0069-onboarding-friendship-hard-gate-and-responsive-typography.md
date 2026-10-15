# ADR-0069: 新人入職官方帳號雙重硬閘門與行動端排版優化 (Onboarding Friendship Hard-Gate & Mobile Responsive Typography v2.29.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.29.0`  
> **領域分類 (Category)**: `Onboarding & LIFF` / `Security & Access Control` / `UI/UX & Mobile Layout` / `Verification`

---

## 決策內容與架構推演 (Decision Record)

- **核心背景與實機回報缺陷**：
  - 於實機驗收新人入職流程時，發現以下兩大偏離預期之問題：
    1. **入職未強制加好友 (軟性引導 vs 硬性閘門)**：原流程在未加官方帳號好友前便允許點擊「確認入職」，入職成功後之加好友彈窗可被直接關閉跳過，導致部分同仁入職後未成為好友，無法接收每日打卡收據推播或使用圖文選單。
    2. **行動端卡片與按鈕排版破版 (視覺幾何缺陷)**：在 360px 手機窄螢幕下，受邀據點代碼 `24549210-01` 發生單字折行（`24549210-` / `01` 斷裂）；確認按鈕文字單行過長擠壓勾勾圖示至極左側，且文字帶 `-` 未優雅換行。
- **雙重好友硬閘門架構 (Dual Hard-Gate Architecture)**：
  - **前端聯鎖狀態機 (LIFF Client-Side Gate)**：
    - 呼叫 `liff.getFriendship()` 獲取真實好友關係狀態。
    - 若 `isFriendWithBot === false`：
      - 介面強制呈現 **【第一步：加入打卡帳號好友】**（LINE 原生品牌綠色），導向官方 Deep Link `https://line.me/R/ti/p/@375nvoga`。
      - **【第二步：確認加入考勤系統】** 按鈕嚴格反灰鎖定 (`disabled=true`)，標示未解鎖與鎖頭圖示，禁止發起任何入職請求。
      - 監聽 `visibilitychange` 與 `window.focus`，同仁於 LINE 內加完好友切回 LIFF 時自動重新探測；通過後解鎖第二步按鈕。
  - **後端 API 伺服器端硬防線 (Server-Side Friendship Validation)**：
    - `POST /api/v1/employee/join` 接收請求時，透過 `env.LINE_CHANNEL_ACCESS_TOKEN` 向 LINE Messaging API（`GET https://api.line.me/v2/bot/profile/{lineUserId}`）校驗好友關係。
    - 若 LINE API 回傳 404（未加好友或已封鎖），後端強制以 HTTP 403 阻斷（`"未偵測到打卡官方帳號好友關係，請先加入打卡機器人為好友方可完成入職！"`），徹底杜絕繞過前端發送請求之漏洞。
- **行動端排版優化 (Mobile Responsive Typography)**：
  - **受邀據點雙行獨立結構**：
    - 第 1 行：🏢 企業名稱 `#onboardingCompanyName` + 統一編號標籤 `#onboardingCompanyTaxId`（配置 `whitespace-nowrap flex-shrink-0` 杜絕折行）。
    - 第 2 行：🏪 門市名稱 `#onboardingBranchName` + 門市代碼標籤 `#onboardingBranchBadge`（`據點 #01`，獨立醒目）。
    - 第 3 行：📍 門市中文地址 `#onboardingCompanyAddress`。
  - **確認按鈕上下居中雙行排版**：
    - 移除非語意符號 `-`，改採垂直雙行佈局：
      - 上行：主標題 `確認加入考勤系統`（`text-sm font-bold tracking-wide`）。
      - 下行：副標題 `${compName} · ${branchName}`（`text-[11px] font-medium opacity-90`）。
    - 加大內距至 `px-4 py-3.5`，圖示與文字水平完全置中，不再貼壁擠壓。
- **自主驗證閉環 (Playwright Visual & Unit Verification)**：
  - 運用 Playwright 模擬真實行動裝置（360×800 Viewport）產出高保真截圖，確認未加好友（Step 1）與已加好友（Step 2）兩大狀態之佈局無折行、對齊完美。
  - 撰寫 `test_onboarding_friendship_gate.js` 驗證伺服器端 403 阻斷、好友 200 放行與自動化測試隔離。

---

## 影響與防護效益 (Consequences)

1. **入職即好友 100% 閉環**：杜絕「入職成功卻未加機器人」之幽靈使用者，確保所有新進同仁必能接收打卡收據與圖文選單。
2. **零折行視覺品質保證**：透過嚴格的 `whitespace-nowrap` 與雙行分解架構，在任何尺寸的行動裝置上皆維持統一美觀之品牌視覺。
