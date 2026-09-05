---
name: line-cloud-manager
description: Use when building, integrating, debugging, or maintaining LINE Messaging API (v3), LIFF (v2) apps, Webhook handlers, Flex Messages, LINE Login token verification, or Rich Menus in cloud backends and web frontends. Do not use for non-LINE platforms (e.g. Slack, Discord, Telegram, Meta/WhatsApp).
---

# LINE Cloud Manager Skill

## Goal

Provide reference architectures, code patterns, API endpoints, and SDK guides for building cloud backends, webhooks, and LIFF (LINE Front-end Framework) frontends on the LINE Platform.

## When to use

Use this skill when:
- Creating or handling LINE Messaging API Webhooks (`X-Line-Signature`, Message/Postback/Follow events).
- Building LIFF frontend apps for mobile or desktop (`liff.init`, `liff.getProfile`, `liff.getIDToken`, `liff.closeWindow`).
- Verifying LINE Login / LIFF ID Tokens on backend servers (`https://api.line.me/oauth2/v2.1/verify`).
- Creating and sending LINE Flex Messages, Reply Messages, or Push Messages.
- Programmatically creating, uploading, or linking LINE Rich Menus.

Do not use this skill when:
- Interacting with Meta/WhatsApp, Telegram, Discord, or Slack APIs.
- Managing general non-LINE OAuth providers (e.g. Google OAuth, GitHub OAuth).

## Known Workspace Identities

- **Admin / Primary Test User ID**: `Ubd107bb3ba1b85a8086fc3b2250458e8` (🐖毛)

## Required Inputs & Environment Variables

```ini
# Messaging API Channel (Bot)
LINE_CHANNEL_ID=2001234567
LINE_CHANNEL_SECRET=your_messaging_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_long_lived_access_token

# LINE Login Channel (LIFF & OAuth)
LIFF_ID=2001234567-AbCdEfGh
LINE_LOGIN_CHANNEL_ID=2001234568
LINE_LOGIN_CHANNEL_SECRET=your_login_channel_secret
```

## Procedures

### 1. Webhook Setup & Signature Verification
1. Inspect the incoming request headers for `X-Line-Signature`.
2. Extract the raw string/bytes body before any JSON deserialization.
3. Validate signature using HMAC-SHA256 with `LINE_CHANNEL_SECRET`.
4. Dispatch events asynchronously to prevent webhook timeout (LINE expects HTTP 200 within a few seconds).
- Read `references/messaging-api-v3.md` for Python (`line-bot-sdk` v3) and Node.js (`@line/bot-sdk`) webhook implementations.

### 2. LIFF Frontend Integration
1. Include LIFF SDK v2 via CDN or npm package (`@line/liff`).
2. Call `await liff.init({ liffId })` on page load.
3. If `!liff.isLoggedIn()`, trigger `liff.login()`.
4. Extract user identity using `await liff.getProfile()` and `liff.getIDToken()`.
5. Interact with LINE client: `liff.sendMessages()`, `liff.closeWindow()`, `liff.openWindow()`.
- Read `references/liff-sdk-v2.md` for full SDK method specifications and GPS clock-in frontend patterns.

### 3. Backend ID Token Authentication
1. Receive the `idToken` from LIFF client via HTTPS POST.
2. Verify token authenticity via `POST https://api.line.me/oauth2/v2.1/verify` passing `id_token` and `client_id` (`LINE_LOGIN_CHANNEL_ID`).
3. Confirm `sub` (User ID), `aud` (Matches Channel ID), `exp` (Token not expired), and `iss` (`https://access.line.me`).
- Read `references/token-verification.md` for backend verification functions and JWT claims.

### 4. Sending Messages & Flex Layouts
1. Prefer `reply_message` using `reply_token` whenever reacting to user events (free tier, zero message quota consumed).
2. Use `push_message` or `multicast` only for proactive alerts, approvals, or background tasks.
3. Build structured interactive cards with Flex Message bubbles.
- Read `references/flex-message-templates.md` for attendance receipt and approval alert JSON templates.

### 5. Rich Menu Management
1. **Dimensions & Grid Sizes** (standard 2500px width canvas, max 1MB, JPG/PNG):
   - **Full Size**: `2500 x 1686` px. 6-grid: `~833 x 843` px; 4-grid: `1250 x 843` px.
   - **Compact / Half Size**: `2500 x 843` px. 3-grid: `~833 x 843` px; 2-grid: `1250 x 843` px.
2. **Typography & Minimalist Layout Practices (極簡純淨高對比規範)**:
   - **Main CTA Text (2500px canvas)**: `80px – 120px` (粗體無襯線黑體/微軟正黑粗體，垂直與水平絕對置中 `anchor="mm"`).
   - **Zero Subtitles & Zero Mini Badges (無副標、無迷你標籤)**: **全面去除所有副標題、說明字樣與上方迷你藥丸標籤（Pill Badge）**。
   - **Theme Color Mapping (色彩直接套用於 CTA 與背景)**: 將各板塊之主題色彩直接套用於按鈕背景（淺色粉彩底或品牌純色底）與主文字 CTA 上，確保最高對比度與俐落感。
   - **Button Copy Length**: 嚴格維持 **2 至 4 個中文字**（例如「考勤打卡」、「排班月曆」、「線上簽核」、「今日出勤」），嚴禁 >6 字。
   - **Technical Action Label**: Max 20 characters (accessibility / fallback).
3. Create rich menu configuration object defining touch areas and actions (e.g. URI action pointing to `https://liff.line.me/{LIFF_ID}`).
4. Upload image via multipart/image endpoint and set as default or link per user.
- Read `references/rich-menu-api.md` for Rich Menu JSON payload, button coordinate templates, and API calls.

- **Rich Menu 嚴禁使用 Emoji**：Rich Menu 的圖稿設計、文字渲染、`chatBarText` 及 action label 請勿使用 Emoji 表情符號。在多數繪圖工具或 LINE 客戶端渲染時，Emoji 會破圖變成 Unicode 缺字方塊（豆腐塊 `□`）。建議全面使用純文字或向量 Icon 圖示。
- **LIFF Channel Type**: LIFF apps can only be created under **LINE Login** or **LINE MINI App** channels (since LIFF v2). They cannot be created under Messaging API channels.
- **Raw Webhook Body**: Always verify signature on the exact raw string or binary buffer. Modifying whitespace, re-serializing JSON, or reading parsed form bodies will cause signature validation failure (`InvalidSignatureError`).
- **Reply Token Expiry**: `reply_token` expires within ~30-60 seconds and is single-use. If long processing is needed, immediately reply or switch to Push API.
- **Provider User ID Consistency**: User IDs (`U[0-9a-f]{32}`) are identical across channels only if both channels belong to the same **Provider** in LINE Developers Console.
- **HTTPS Requirement**: LIFF apps and GPS APIs (`navigator.geolocation`) require HTTPS. For local testing, use a secure tunnel (e.g. ngrok, Cloudflare Tunnel).

## Additional Resources

- `references/messaging-api-v3.md`: Python & Node.js Messaging API v3 setup and Webhook handlers.
- `references/liff-sdk-v2.md`: Complete LIFF v2 methods, properties, and frontend UI templates.
- `references/token-verification.md`: Server-side ID Token verification endpoints and security checks.
- `references/flex-message-templates.md`: Ready-to-use Flex Message templates for attendance and alerts.
- `references/rich-menu-api.md`: Rich Menu schema, area definitions, and image upload flow.
