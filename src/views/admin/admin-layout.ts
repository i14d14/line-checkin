/**
 * Admin Portal Layout (Head, Header, Shell & Navigation)
 */
export function renderAdminLayoutOpen(): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LINE 考勤 - 客戶地端管理後台</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif; }
    .tab-active { border-bottom: 2px solid #06C755; color: #06C755; font-weight: 600; }
  </style>
</head>
<body class="bg-gray-50 text-gray-800 min-h-screen">

  <!-- LOGIN CONTAINER (Shown when unauthenticated) -->
  <div id="loginContainer" class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950">
    <div class="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6 border border-gray-100">
      <div class="text-center space-y-2">
        <div class="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-emerald-500/30">
          <i class="fa-solid fa-building-user text-2xl"></i>
        </div>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight">LINE 考勤管理系統</h1>
        <p class="text-xs text-gray-500">企業地端專屬管理後台登入</p>
      </div>

      <form id="loginForm" onsubmit="handleLogin(event)" class="space-y-4">
        <div id="loginError" class="hidden p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium flex items-center space-x-2">
          <i class="fa-solid fa-circle-exclamation text-sm flex-shrink-0"></i>
          <span id="loginErrorText">帳號或密碼錯誤</span>
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1.5">管理員帳號 (Username)</label>
          <div class="relative">
            <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400"><i class="fa-solid fa-user"></i></span>
            <input type="text" id="inputUsername" required placeholder="請輸入管理員帳號" class="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-none transition">
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1.5">密碼 (Password)</label>
          <div class="relative">
            <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400"><i class="fa-solid fa-lock"></i></span>
            <input type="password" id="inputPassword" required placeholder="請輸入密碼" class="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-none transition">
          </div>
        </div>

        <button type="submit" id="loginBtn" class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition duration-200 flex items-center justify-center space-x-2">
          <span>登入系統</span>
          <i class="fa-solid fa-arrow-right text-xs"></i>
        </button>
      </form>

      <div class="text-center pt-2 border-t border-gray-100">
        <p class="text-[11px] text-gray-400">💡 企業帳號由系統管理員手動預置。初次開通請洽管理部門。</p>
      </div>
    </div>
  </div>

  <!-- MAIN APP CONTAINER (Shown when authenticated) -->
  <div id="appContainer" class="hidden min-h-screen flex flex-col">
    <!-- Top Navigation -->
    <header class="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow">
            <i class="fa-solid fa-building-user text-lg"></i>
          </div>
          <div>
            <h1 class="font-bold text-lg leading-tight text-gray-900">LINE 考勤地端管理後台</h1>
            <p class="text-xs text-gray-500">Client On-Premises Management Portal</p>
          </div>
        </div>
        
        <!-- Auth Status & User Badge -->
        <div class="flex items-center space-x-3">
          <div id="userInfoBadge" class="flex items-center space-x-2 text-xs px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span id="userInfoText">載入中...</span>
          </div>
          <button onclick="handleLogout()" class="text-xs bg-gray-100 hover:bg-red-50 hover:text-red-700 text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 transition flex items-center space-x-1">
            <i class="fa-solid fa-arrow-right-from-bracket"></i>
            <span>登出</span>
          </button>
        </div>
      </div>
      
      <!-- Tab Navigation -->
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-8 text-sm overflow-x-auto">
        <button onclick="switchTab('locations')" id="tabBtn-locations" class="py-3 px-1 tab-active flex items-center space-x-2 whitespace-nowrap">
          <i class="fa-solid fa-map-location-dot"></i>
          <span>據點與網路配置</span>
        </button>
        <button onclick="switchTab('schedules')" id="tabBtn-schedules" class="py-3 px-1 text-gray-500 hover:text-gray-700 flex items-center space-x-2 whitespace-nowrap">
          <i class="fa-solid fa-calendar-days"></i>
          <span>班表管理與匯入</span>
        </button>
        <button onclick="switchTab('records')" id="tabBtn-records" class="py-3 px-1 text-gray-500 hover:text-gray-700 flex items-center space-x-2 whitespace-nowrap">
          <i class="fa-solid fa-clipboard-user"></i>
          <span>考勤監控與計薪匯出</span>
        </button>
        <button onclick="switchTab('devices')" id="tabBtn-devices" class="py-3 px-1 text-gray-500 hover:text-gray-700 flex items-center space-x-2 whitespace-nowrap">
          <i class="fa-solid fa-shield-halved"></i>
          <span>安全稽核與換機監控</span>
        </button>
        <button onclick="switchTab('apikeys')" id="tabBtn-apikeys" class="py-3 px-1 text-gray-500 hover:text-gray-700 flex items-center space-x-2 whitespace-nowrap">
          <i class="fa-solid fa-key"></i>
          <span>🔑 API 金鑰管理</span>
        </button>
        <button onclick="switchTab('approvals')" id="tabBtn-approvals" class="py-3 px-1 text-gray-500 hover:text-gray-700 flex items-center space-x-2 whitespace-nowrap">
          <i class="fa-solid fa-file-signature"></i>
          <span>📋 電子簽核審批</span>
        </button>
        <button onclick="switchTab('announcements')" id="tabBtn-announcements" class="py-3 px-1 text-gray-500 hover:text-gray-700 flex items-center space-x-2 whitespace-nowrap">
          <i class="fa-solid fa-bullhorn"></i>
          <span>📢 企業公告</span>
        </button>
        <button onclick="switchTab('payslips')" id="tabBtn-payslips" class="py-3 px-1 text-gray-500 hover:text-gray-700 flex items-center space-x-2 whitespace-nowrap">
          <i class="fa-solid fa-file-invoice-dollar"></i>
          <span>💰 電子薪資條</span>
        </button>
      </div>
    </header>

    <!-- Main Container -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
`;
}

export function renderAdminMainClose(): string {
  return `
    </main>
  </div>
`;
}

export function renderAdminLayoutClose(): string {
  return `</body>
</html>`;
}
