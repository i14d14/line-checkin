# ADR-0071: 三款圖文選單懸浮圓角卡片視覺重構與 Chromium 原生 Emoji 渲染管線 (Modern Floating Card Rich Menus & Chromium Native Emoji Pipeline v2.31.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.31.0`  
> **領域分類 (Category)**: `LINE Rich Menu` / `Visual Design` / `Font Fallback & Emoji` / `Edge Headless Pipeline`

---

## 決策內容與架構推演 (Decision Record)

- **核心背景與舊架構痛點**：
  - **滿版直角純色塊缺乏質感**：原 Rich Menu 按鈕採 Python Pillow 繪製全滿版矩形色塊（無留白邊距、無圓角、無陰影、無輔助說明副標），在行動端顯得呆板生硬。
  - **Emoji 渲染豆腐塊 (`\uFFFD`)**：舊渲染腳本使用微軟正黑體粗體（`msjhbd.ttc`），因該字型檔缺少 Emoji 符號表，且 Pillow 不具備作業系統級字型自動回退機制（Font Fallback），導致所有 Emoji 均退化為亂碼方塊。
- **架構決策 (Architectural Decisions)**：
  1. **Microsoft Edge Headless 原生截圖渲染管線**：
     - 放棄 Pillow 文字繪製，改用 HTML/CSS 模板搭配 Windows 內建之 Chromium 引擎（`msedge.exe --headless=new`）。
     - Chromium 具備原生雙字型回退機制，中文字體完美對齊微軟正黑體，Emoji 自動加載全彩 `Segoe UI Emoji`，徹底杜絕亂碼。
     - 免除任何額外 npm/pip 套件依賴，效能極高。
  2. **現代 App 懸浮圓角卡片 UI (Floating Rounded Cards)**：
     - **底板統一**：採用乾淨優雅的淺灰底（`#F8FAFC`），四周留白 32~40px。
     - **卡片細節**：40px 圓角、雙層柔和立體陰影、極細淺色邊框。
     - **精簡視覺與完全剔除副標 (Zero Subtitles)**：大尺寸鮮豔圖標（155~170px）+ 主功能標題（96~108px）。**嚴格不放副標/說明文字**（決策原因：手持設備按鈕尺寸過小，副標小字在手機上不可能看得見，只會徒增版面雜亂與視覺負擔）。
  3. **三款選單視覺與動態權限對齊**：
     - **新進同仁預設選單 (`richmenu-cc757a8c6901a7b4b897b35420fa4b62`)**：全寬翡翠綠卡片，🎉 【新進同仁入職登記】 / 【門市現場掃碼・快速綁定開啟考勤】。設為 LINE 官方帳號 DEFAULT。
     - **在職員工選單 (`richmenu-b47dd19067e5d2b30293e8a426a3214a`)**：3 欄獨立懸浮卡片，第一格翡翠綠 Hero 打卡卡片，第二三格純白底排班與簽核卡片。
     - **門市主管超集選單 (`richmenu-1519602b550d24c207be2a5425ab0624`)**：上排 3 格個人卡片與員工選單一致；下排全寬曜石靛青卡片直達 🏢 【門市管理工作台】。
  4. **點擊熱區（Hitbox）容錯保證**：
     - 視覺上雖縮小為圓角卡片，但 LINE Rich Menu 定義之 Areas 點擊邊界仍維持整格滿版，保證手持裝置盲按或邊緣點擊 100% 觸發。

---

## 影響與防護效益 (Consequences)

1. **零豆腐塊保證**：系統原生支援最新全彩 Unicode Emoji，介面生動直觀。
2. **極致視覺體驗**：從早期磁貼拼圖躍升為現代頂級 SaaS App 視覺水準。
3. **維護與擴展性**：HTML/CSS 模板調整視覺比 Python 像素手算更加靈活快速。
