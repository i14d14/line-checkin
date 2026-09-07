/**
 * LIFF Mobile Portal Layout (Head, Styles, Header, Tab Navigation & Shell)
 */
export function renderLiffLayoutOpen(): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>LINE 考勤打卡與出勤月曆</title>
  <link rel="preconnect" href="https://static.line-scdn.net" crossorigin>
  <link rel="preconnect" href="https://api.line.me" crossorigin>
  <link rel="dns-prefetch" href="https://static.line-scdn.net">
  <link rel="dns-prefetch" href="https://api.line.me">
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
      background: #F4F6F9;
      color: #333;
      padding-bottom: 30px;
      overflow-x: hidden;
      touch-action: pan-y;
    }
    .view-active { display: block; }
    .nav-btn.active { color: #06C755; border-bottom: 2px solid #06C755; font-weight: bold; }
    .tab-section {
      animation: tabFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes tabFadeIn {
      from { opacity: 0.65; transform: translateY(2px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body class="min-h-screen flex flex-col items-center">
  <!-- Top Bar -->
  <header class="w-full bg-white border-b border-gray-200 sticky top-0 z-30">
    <div class="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <div class="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white text-xs font-bold">
          <i class="fa-solid fa-location-dot"></i>
        </div>
        <span class="font-bold text-sm text-gray-900">LINE 智慧考勤系統</span>
      </div>
      <div id="userProfileTag" class="text-xs text-gray-500 font-medium truncate max-w-[150px]">載入中...</div>
    </div>
    
    <!-- Tab Switcher -->
    <div id="tabSwitcher" class="max-w-md mx-auto px-4 flex text-xs">
      <!-- Non-employee single tab (3 buttons wide / full width) -->
      <button onclick="switchView('onboarding')" id="nav-onboarding" class="nav-btn active flex-1 py-2.5 text-center text-emerald-600 font-bold hidden items-center justify-center space-x-1.5 w-full">
        <i class="fa-solid fa-id-card"></i>
        <span>入職登記</span>
      </button>

      <!-- Enrolled employee tabs -->
      <button onclick="switchView('checkin')" id="nav-checkin" class="nav-btn active flex-1 py-2.5 text-center text-gray-500 flex items-center justify-center space-x-1.5">
        <i class="fa-solid fa-fingerprint"></i>
        <span>一鍵打卡</span>
      </button>
      <button onclick="switchView('calendar')" id="nav-calendar" class="nav-btn flex-1 py-2.5 text-center text-gray-500 flex items-center justify-center space-x-1.5">
        <i class="fa-solid fa-calendar-days"></i>
        <span>出勤月曆</span>
      </button>
      <button onclick="switchView('approvals')" id="nav-approvals" class="nav-btn flex-1 py-2.5 text-center text-gray-500 flex items-center justify-center space-x-1.5">
        <i class="fa-solid fa-file-signature"></i>
        <span>線上簽核</span>
      </button>
      <button onclick="switchView('admin')" id="nav-admin" class="nav-btn flex-1 py-2.5 text-center text-gray-500 hidden items-center justify-center space-x-1.5">
        <i class="fa-solid fa-screwdriver-wrench"></i>
        <span>管理工作台</span>
      </button>
    </div>
  </header>

  <!-- Container -->
  <main class="w-full max-w-md px-4 py-5 space-y-4">
`;
}

export function renderLiffMainClose(): string {
  return `
  </main>
`;
}

export function renderLiffLayoutClose(): string {
  return `</body>
</html>`;
}
