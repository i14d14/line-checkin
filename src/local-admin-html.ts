/**
 * Client Local Management Portal HTML Renderer
 * Single-Page Responsive Admin UI for Client HR & Branch Managers
 */
export function renderLocalAdminHtml(): string {
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
      </div>
    </header>

    <!-- Main Container -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
      
      <!-- TAB 1: 據點與網路管理 -->
      <section id="tab-locations" class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h2 class="text-base font-bold text-gray-900">據點清單與 Wi-Fi 白名單管理</h2>
            <p class="text-xs text-gray-500 mt-0.5">新增或維護門市、設定公司固定公網 IP / CIDR，以支援室內 GPS 飄移豁免打卡。</p>
          </div>
          <button onclick="openLocationModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow transition flex items-center justify-center space-x-2">
            <i class="fa-solid fa-plus"></i>
            <span>新增門市據點</span>
          </button>
        </div>

        <!-- Locations Table / Cards -->
        <div id="locationsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div class="col-span-full py-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-200">
            <i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i>
            <p class="text-sm">載入據點資料中...</p>
          </div>
        </div>
      </section>

      <!-- TAB 2: 班表管理與匯入 -->
      <section id="tab-schedules" class="space-y-6 hidden">
        <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 class="text-base font-bold text-gray-900">員工班表排班與 CSV 匯入</h2>
              <p class="text-xs text-gray-500 mt-0.5">支援匯入整月員工班表，作為系統精準計算遲到、早退、缺卡、加班與實際工時之依據。</p>
            </div>
            <div class="flex items-center space-x-2">
              <button onclick="downloadScheduleTemplate()" class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center space-x-1.5">
                <i class="fa-solid fa-download"></i>
                <span>下載 CSV 範本</span>
              </button>
              <label class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition flex items-center space-x-1.5 cursor-pointer">
                <i class="fa-solid fa-file-import"></i>
                <span>上傳排班 CSV</span>
                <input type="file" id="scheduleFileInput" accept=".csv" class="hidden" onchange="handleScheduleCsvUpload(event)">
              </label>
            </div>
          </div>

          <!-- Filter / Month Picker -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-gray-100">
            <div>
              <label class="block text-gray-500 font-medium mb-1">排班月份</label>
              <input type="month" id="scheduleMonth" value="2026-08" onchange="fetchSchedules()" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500">
            </div>
            <div>
              <label class="block text-gray-500 font-medium mb-1">員工 LINE ID 篩選 (可選)</label>
              <input type="text" id="scheduleUserFilter" placeholder="留空查詢全體員工" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500">
            </div>
            <div class="flex items-end">
              <button onclick="fetchSchedules()" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2 rounded-lg transition">
                <i class="fa-solid fa-magnifying-glass mr-1"></i>查詢班表
              </button>
            </div>
          </div>
        </div>

        <!-- Schedule Table -->
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-xs">
              <thead class="bg-gray-50 text-gray-500 text-left font-semibold">
                <tr>
                  <th class="px-4 py-3">排班日期</th>
                  <th class="px-4 py-3">據點</th>
                  <th class="px-4 py-3">員工姓名 / LINE ID</th>
                  <th class="px-4 py-3">班別名稱</th>
                  <th class="px-4 py-3">預計上班</th>
                  <th class="px-4 py-3">預計下班</th>
                  <th class="px-4 py-3">休息(分)</th>
                  <th class="px-4 py-3">屬性</th>
                </tr>
              </thead>
              <tbody id="schedulesTableBody" class="divide-y divide-gray-100 font-normal">
                <tr>
                  <td colspan="8" class="text-center py-10 text-gray-400">請點擊查詢以載入班表資料。</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 3: 考勤監控與計薪匯出 -->
      <section id="tab-records" class="space-y-6 hidden">
        <!-- Filter Bar -->
        <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <h2 class="text-base font-bold text-gray-900">出勤紀錄與計薪報表</h2>
            <div class="flex items-center space-x-2">
              <button onclick="fetchRecords()" class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center space-x-1.5">
                <i class="fa-solid fa-arrows-rotate"></i>
                <span>重新整理</span>
              </button>
              <button onclick="exportCsv()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow transition flex items-center space-x-1.5">
                <i class="fa-solid fa-file-excel"></i>
                <span>匯出計薪 CSV</span>
              </button>
            </div>
          </div>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label class="block text-gray-500 font-medium mb-1">開始日期</label>
              <input type="date" id="filterStartDate" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500">
            </div>
            <div>
              <label class="block text-gray-500 font-medium mb-1">結束日期</label>
              <input type="date" id="filterEndDate" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500">
            </div>
            <div>
              <label class="block text-gray-500 font-medium mb-1">打卡狀態</label>
              <select id="filterStatus" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500">
                <option value="">全部狀態</option>
                <option value="SUCCESS">打卡成功 (SUCCESS)</option>
                <option value="DUPLICATE">防誤觸重複 (DUPLICATE)</option>
                <option value="OUT_OF_RANGE">超出範圍 (OUT_OF_RANGE)</option>
                <option value="CANCELLED">已撤回 (CANCELLED)</option>
              </select>
            </div>
            <div>
              <label class="block text-gray-500 font-medium mb-1">上下班篩選</label>
              <select id="filterPunchType" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500">
                <option value="">全部 (上班 / 下班)</option>
                <option value="IN">🟢 上班 (IN)</option>
                <option value="OUT">🔴 下班 (OUT)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Records Table -->
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-xs">
              <thead class="bg-gray-50 text-gray-500 text-left font-semibold">
                <tr>
                  <th class="px-4 py-3">打卡時間</th>
                  <th class="px-4 py-3">據點</th>
                  <th class="px-4 py-3">員工姓名</th>
                  <th class="px-4 py-3">狀態</th>
                  <th class="px-4 py-3">類型</th>
                  <th class="px-4 py-3">工時</th>
                  <th class="px-4 py-3">驗證方式</th>
                  <th class="px-4 py-3">距離</th>
                </tr>
              </thead>
              <tbody id="recordsTableBody" class="divide-y divide-gray-100 font-normal">
                <tr>
                  <td colspan="8" class="text-center py-10 text-gray-400">載入中...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 4: 安全稽核與換機監控 -->
      <section id="tab-devices" class="space-y-6 hidden">
        <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-2">
          <div class="flex items-center space-x-2">
            <div class="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <i class="fa-solid fa-shield-heart"></i>
            </div>
            <h2 class="text-base font-bold text-gray-900">員工換機自動化與安全稽核日誌</h2>
          </div>
          <p class="text-xs text-gray-600 leading-relaxed">
            系統採<strong>員工自主換機機制</strong>：當員工更換新手機或在不同裝置上打卡時，系統將<strong>先暫停打卡並跳出防作弊警訊彈窗</strong>，經員工確認解綁並通報後始覆蓋綁定完成打卡。每次換機將自動觸發 <span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold font-mono text-[10px]">SWITCH_DEVICE</span> 警告日誌，管理者可在此隨時追蹤稽核。
          </p>
        </div>

        <!-- Audit Logs Table -->
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wider">最近稽核日誌 (Audit Logs)</h3>
            <button onclick="fetchAuditLogs()" class="text-xs text-gray-500 hover:text-gray-800">
              <i class="fa-solid fa-arrows-rotate mr-1"></i>重新整理
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-xs">
              <thead class="bg-gray-50 text-gray-500 text-left font-semibold">
                <tr>
                  <th class="px-4 py-3">時間</th>
                  <th class="px-4 py-3">員工 / LINE ID</th>
                  <th class="px-4 py-3">行為動作</th>
                  <th class="px-4 py-3">IP 位址</th>
                  <th class="px-4 py-3">等級</th>
                </tr>
              </thead>
              <tbody id="auditTableBody" class="divide-y divide-gray-100">
                <tr>
                  <td colspan="5" class="text-center py-8 text-gray-400">載入中...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 5: 🔑 API 金鑰管理 (M2M API Keys) -->
      <section id="tab-apikeys" class="space-y-6 hidden">
        <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-center space-x-2">
              <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <i class="fa-solid fa-key"></i>
              </div>
              <div>
                <h2 class="text-base font-bold text-gray-900">企業專用 M2M API 金鑰管理</h2>
                <p class="text-xs text-gray-500 mt-0.5">提供地端系統、內部人資計薪系統 (HRIS) 或自建自動化腳本呼叫 API 時之驗證金鑰。</p>
              </div>
            </div>
            <button onclick="openCreateKeyModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow transition flex items-center justify-center space-x-2">
              <i class="fa-solid fa-plus"></i>
              <span>生成新金鑰</span>
            </button>
          </div>
          <div class="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-blue-800 text-xs flex items-start space-x-2">
            <i class="fa-solid fa-circle-info text-blue-500 mt-0.5"></i>
            <span><strong>說明提醒</strong>：網頁後台請直接使用<strong>帳號密碼</strong>登入。此處金鑰僅供在伺服器端或本地腳本發送 HTTP 請求時帶入 <code class="bg-blue-100/80 px-1 py-0.5 rounded font-mono text-[11px]">X-Tenant-Key: pk_live_...</code> 標頭使用。</span>
          </div>
        </div>

        <!-- API Keys Table -->
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wider">企業已發行金鑰清單</h3>
            <button onclick="fetchApiKeys()" class="text-xs text-gray-500 hover:text-gray-800">
              <i class="fa-solid fa-arrows-rotate mr-1"></i>重新整理
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-xs">
              <thead class="bg-gray-50 text-gray-500 text-left font-semibold">
                <tr>
                  <th class="px-4 py-3">金鑰前綴提示</th>
                  <th class="px-4 py-3">金鑰備註名稱</th>
                  <th class="px-4 py-3">權限角色</th>
                  <th class="px-4 py-3">狀態</th>
                  <th class="px-4 py-3">建立時間</th>
                  <th class="px-4 py-3">最後使用時間</th>
                  <th class="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody id="apiKeysTableBody" class="divide-y divide-gray-100 font-mono">
                <tr>
                  <td colspan="7" class="text-center py-8 text-gray-400 font-sans">載入中...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 6: 電子簽核審批管理 -->
      <section id="tab-approvals" class="space-y-6 hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h2 class="text-base font-bold text-gray-900">電子簽核審批與主管綁定</h2>
            <p class="text-xs text-gray-500 mt-0.5">監控全體同仁請假、補卡、加班申請進度，並可自主指派員工的直屬審核主管。</p>
          </div>
          <div class="flex items-center space-x-2">
            <button onclick="openEmployeePermissionsModal()" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow transition flex items-center justify-center space-x-2">
              <i class="fa-solid fa-user-gear"></i>
              <span>員工細粒度權限 (PBAC)</span>
            </button>
            <button onclick="openAssignApproverModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow transition flex items-center justify-center space-x-2">
              <i class="fa-solid fa-user-check"></i>
              <span>指派直屬審核主管</span>
            </button>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center gap-3 text-xs">
          <div class="flex items-center space-x-1.5">
            <span class="text-gray-500 font-medium">月份:</span>
            <input type="month" id="approvalMonth" value="2026-09" onchange="fetchApprovals()" class="border border-gray-300 rounded-xl px-2.5 py-1.5 focus:ring-1 focus:ring-emerald-500">
          </div>
          <div class="flex items-center space-x-1.5">
            <span class="text-gray-500 font-medium">狀態:</span>
            <select id="approvalStatusFilter" onchange="fetchApprovals()" class="border border-gray-300 rounded-xl px-2.5 py-1.5 focus:ring-1 focus:ring-emerald-500">
              <option value="">全部狀態</option>
              <option value="PENDING">🟡 審核中 (PENDING)</option>
              <option value="APPROVED">🟢 已核准 (APPROVED)</option>
              <option value="REJECTED">🔴 已駁回 (REJECTED)</option>
            </select>
          </div>
          <div class="flex items-center space-x-1.5">
            <span class="text-gray-500 font-medium">類別:</span>
            <select id="approvalTypeFilter" onchange="fetchApprovals()" class="border border-gray-300 rounded-xl px-2.5 py-1.5 focus:ring-1 focus:ring-emerald-500">
              <option value="">全部類別</option>
              <option value="LEAVE">🌴 請假</option>
              <option value="CORRECTION">⏰ 補卡</option>
              <option value="OVERTIME">🔥 加班</option>
            </select>
          </div>
          <button onclick="fetchApprovals()" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-xl transition flex items-center space-x-1 ml-auto">
            <i class="fa-solid fa-arrows-rotate text-[11px]"></i>
            <span>重新整理</span>
          </button>
        </div>

        <!-- Approvals Table -->
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left">
              <thead class="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                <tr>
                  <th class="px-4 py-3">申請單號</th>
                  <th class="px-4 py-3">申請同仁</th>
                  <th class="px-4 py-3">所屬據點</th>
                  <th class="px-4 py-3">類別</th>
                  <th class="px-4 py-3">申請日期</th>
                  <th class="px-4 py-3">申請細節與事由</th>
                  <th class="px-4 py-3">審核主管 LINE ID</th>
                  <th class="px-4 py-3">狀態</th>
                  <th class="px-4 py-3">審核時間</th>
                </tr>
              </thead>
              <tbody id="approvalsTableBody" class="divide-y divide-gray-100 font-mono">
                <tr>
                  <td colspan="9" class="text-center py-8 text-gray-400 font-sans">載入中...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </main>
  </div>

  <!-- Modal: Create New API Key -->
  <div id="createKeyModal" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-gray-900 text-base">生成全新 API 金鑰</h3>
        <button onclick="closeCreateKeyModal()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>
      <form id="createKeyForm" onsubmit="handleCreateKeySubmit(event)" class="space-y-3 text-xs">
        <div>
          <label class="block font-medium text-gray-700 mb-1">金鑰用途與備註名稱 *</label>
          <input type="text" id="keyNameInput" required placeholder="例如：地端 HR 計薪排程專用金鑰" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
        </div>
        <div>
          <label class="block font-medium text-gray-700 mb-1">權限角色 *</label>
          <select id="keyRoleSelect" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
            <option value="ADMIN">ADMIN (完整讀寫管理權限)</option>
            <option value="READ_ONLY">READ_ONLY (僅允許查詢據點、班表、出勤日誌)</option>
          </select>
        </div>
        <div class="flex justify-end space-x-2 pt-2">
          <button type="button" onclick="closeCreateKeyModal()" class="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-xl transition">取消</button>
          <button type="submit" id="createKeySubmitBtn" class="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow transition">生成金鑰</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Display Newly Created Key -->
  <div id="showKeyModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
      <div class="flex items-center space-x-2 text-emerald-600">
        <i class="fa-solid fa-circle-check text-xl"></i>
        <h3 class="font-bold text-gray-900 text-base">API 金鑰建立成功！</h3>
      </div>
      <div class="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs space-y-1">
        <div class="font-bold flex items-center space-x-1.5">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>重要安全提醒</span>
        </div>
        <p>基於最高資安防護原則，完整金鑰僅在此顯示一次。關閉後系統將無法再次還原，請立即複製並妥善保存在安全的設定檔中。</p>
      </div>

      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1.5">您的專屬 API Key</label>
        <div class="flex items-center space-x-2">
          <input type="text" id="newRawApiKeyInput" readonly class="flex-1 bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-xs font-mono select-all text-gray-900 font-semibold focus:outline-none">
          <button onclick="copyRawApiKey()" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow transition flex items-center space-x-1">
            <i class="fa-solid fa-copy"></i>
            <span id="copyBtnText">複製</span>
          </button>
        </div>
      </div>

      <div class="flex justify-end pt-2">
        <button onclick="closeShowKeyModal()" class="px-5 py-2 text-xs bg-gray-800 hover:bg-gray-900 text-white font-semibold rounded-xl shadow transition">我已妥善複製並保存</button>
      </div>
    </div>
  </div>

  <!-- Modal: Add / Edit Location -->
  <div id="locModal" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-gray-900 text-base" id="locModalTitle">新增門市據點</h3>
        <button onclick="closeLocationModal()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>
      <form id="locForm" onsubmit="handleLocationSubmit(event)" class="space-y-3 text-xs">
        <div>
          <label class="block font-medium text-gray-700 mb-1">據點代碼 (統編 或 統編-分店號) *</label>
          <input type="text" id="locId" required placeholder="例如：24549210-02" class="w-full border border-gray-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono">
        </div>
        <div>
          <label class="block font-medium text-gray-700 mb-1">據點名稱 (公司名 - 分店名) *</label>
          <input type="text" id="locName" required placeholder="例如：豬毛科技 - 逢甲分店" class="w-full border border-gray-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
        </div>
        <div>
          <label class="block font-medium text-gray-700 mb-1">門市中文地址 *</label>
          <div class="flex space-x-2">
            <input type="text" id="locAddress" required placeholder="例如：台中市西屯區逢甲路..." class="flex-1 border border-gray-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
          </div>
        </div>

        <!-- GPS Coordinates Field -->
        <div class="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2">
          <div class="flex items-center justify-between">
            <label class="block font-medium text-gray-800">據點 GPS 目標座標 (緯度, 經度)</label>
            <div class="flex items-center space-x-2 text-[10px]">
              <button type="button" onclick="getCurrentLocationForModal()" class="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center space-x-1 transition">
                <i class="fa-solid fa-crosshairs"></i>
                <span>取當前定位</span>
              </button>
              <span class="text-gray-300">|</span>
              <button type="button" onclick="clearCoordsForAutoGeocode()" class="text-blue-600 hover:text-blue-700 font-semibold flex items-center space-x-1 transition">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span>依地址重設</span>
              </button>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <input type="number" step="0.000001" id="locLat" placeholder="目標緯度 (如 24.157722)" class="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none">
            </div>
            <div>
              <input type="number" step="0.000001" id="locLon" placeholder="目標經度 (如 120.683167)" class="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none">
            </div>
          </div>
          <p class="text-[10px] text-gray-500">💡 建議直接提供或點選「取當前定位」；若留空，儲存時系統將自動依地址解析座標。</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-medium text-gray-700 mb-1">允許打卡半徑 (公尺)</label>
            <input type="number" id="locRadius" value="100" min="10" max="5000" class="w-full border border-gray-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
          </div>
          <div>
            <label class="block font-medium text-gray-700 mb-1">公司 Wi-Fi 固定公網 IP / CIDR</label>
            <input type="text" id="locAllowedIps" placeholder="例如：211.20.1.5, 114.33.20.0/24" class="w-full border border-gray-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono">
          </div>
        </div>
        <div>
          <label class="block font-medium text-gray-700 mb-1">門市店長 LINE ID (兜底審核主管，選填)</label>
          <input type="text" id="locManagerLineId" placeholder="例如：U1234567890abcdef..." class="w-full border border-gray-300 rounded-xl px-3 py-2 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none">
          <p class="text-[10px] text-gray-400 mt-1">💡 當門市同仁未指派特定直屬主管時，請假與補卡審批將自動推播至此 LINE 帳號。</p>
        </div>

        <div class="flex items-center justify-between pt-3 border-t border-gray-100">
          <div id="locModalQrLinkContainer" class="hidden">
            <a id="locModalQrLink" href="#" target="_blank" class="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center space-x-1">
              <i class="fa-solid fa-qrcode"></i>
              <span>列印立牌 QR Code</span>
            </a>
          </div>
          <div class="flex space-x-2 ml-auto">
            <button type="button" onclick="closeLocationModal()" class="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-xl transition">取消</button>
            <button type="submit" id="locSubmitBtn" class="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow transition">儲存據點</button>
          </div>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Assign Employee Approver -->
  <div id="assignApproverModal" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-gray-900 text-base">指派員工直屬審核主管</h3>
        <button onclick="closeAssignApproverModal()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>
      <form id="assignApproverForm" onsubmit="handleAssignApproverSubmit(event)" class="space-y-3 text-xs">
        <div>
          <label class="block font-medium text-gray-700 mb-1">員工 LINE User ID *</label>
          <input type="text" id="assignEmpUserId" required placeholder="例如 U4af4980629..." class="w-full border border-gray-300 rounded-xl px-3 py-2 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none">
        </div>
        <div>
          <label class="block font-medium text-gray-700 mb-1">員工姓名 (備註)</label>
          <input type="text" id="assignEmpName" placeholder="例如 王小明" class="w-full border border-gray-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
        </div>
        <div>
          <label class="block font-medium text-gray-700 mb-1">直屬審核主管 LINE User ID *</label>
          <input type="text" id="assignApproverLineId" required placeholder="例如 U8910abcdef..." class="w-full border border-gray-300 rounded-xl px-3 py-2 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none">
          <p class="text-[10px] text-gray-400 mt-1">💡 該同仁送出假勤或補卡申請時，將第一優先推播至此主管 LINE 進行審查。</p>
        </div>
        <div class="flex justify-end space-x-2 pt-3">
          <button type="button" onclick="closeAssignApproverModal()" class="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-xl transition">取消</button>
          <button type="submit" id="assignApproverSubmitBtn" class="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow transition">儲存綁定</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Employee Permissions Configuration (PBAC) -->
  <div id="employeePermissionsModal" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold">
            <i class="fa-solid fa-user-gear"></i>
          </div>
          <div>
            <h3 class="font-bold text-gray-900 text-base">員工細粒度權限配置 (PBAC)</h3>
            <p class="text-[11px] text-gray-500">自訂每位同仁在 LINE 聊天室與系統中的各項原子權限</p>
          </div>
        </div>
        <button onclick="closeEmployeePermissionsModal()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>

      <form id="employeePermissionsForm" onsubmit="handleEmployeePermissionsSubmit(event)" class="space-y-4 text-xs">
        <div>
          <label class="block font-medium text-gray-700 mb-1">快速選擇現有同仁 (自動帶入)：</label>
          <select id="permEmployeeSelect" onchange="onPermEmployeeSelectChange()" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            <option value="">-- 請選擇同仁 (或於下方手動輸入) --</option>
          </select>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-medium text-gray-700 mb-1">員工 LINE User ID *</label>
            <input type="text" id="permLineUserId" required placeholder="例如 U4af4980629..." class="w-full border border-gray-300 rounded-xl px-3 py-2 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none">
          </div>
          <div>
            <label class="block font-medium text-gray-700 mb-1">員工姓名 (備註)</label>
            <input type="text" id="permEmployeeName" placeholder="例如 王小明" class="w-full border border-gray-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
          </div>
        </div>

        <!-- Quick Presets -->
        <div>
          <label class="block font-medium text-gray-700 mb-1.5">⚡ 角色快捷套用範本：</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
            <button type="button" onclick="applyPermPreset('employee')" class="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg border border-gray-200 transition">普通員工</button>
            <button type="button" onclick="applyPermPreset('manager')" class="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium rounded-lg border border-emerald-200 transition">門市店長</button>
            <button type="button" onclick="applyPermPreset('hr')" class="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded-lg border border-blue-200 transition">人資專員</button>
            <button type="button" onclick="applyPermPreset('boss')" class="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium rounded-lg border border-purple-200 transition">全權主管</button>
          </div>
        </div>

        <!-- Permissions Checklist -->
        <div>
          <label class="block font-medium text-gray-700 mb-2">📋 原子權限勾選清單：</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <label class="flex items-start space-x-2 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" id="perm_punch" value="punch" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
              <div>
                <span class="font-bold text-gray-800">基礎打卡 (punch)</span>
                <p class="text-[10px] text-gray-400">GPS/IP 考勤打卡、個人月曆、30s 撤回</p>
              </div>
            </label>
            <label class="flex items-start space-x-2 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" id="perm_apply" value="apply" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
              <div>
                <span class="font-bold text-gray-800">發起簽核 (apply)</span>
                <p class="text-[10px] text-gray-400">線上申請請假、補卡、加班</p>
              </div>
            </label>
            <label class="flex items-start space-x-2 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" id="perm_approve" value="approve" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
              <div>
                <span class="font-bold text-gray-800">假勤審批 (approve)</span>
                <p class="text-[10px] text-gray-400">接收審核推播，LINE 內一鍵核准/駁回</p>
              </div>
            </label>
            <label class="flex items-start space-x-2 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" id="perm_view_store" value="view_store" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
              <div>
                <span class="font-bold text-gray-800">門市看板 (view_store)</span>
                <p class="text-[10px] text-gray-400">聊天室輸入「今日出勤/班表」查閱轄下狀況</p>
              </div>
            </label>
            <label class="flex items-start space-x-2 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" id="perm_view_all" value="view_all" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
              <div>
                <span class="font-bold text-gray-800">全局看板 (view_all)</span>
                <p class="text-[10px] text-gray-400">跨門市查看全體出勤與工時總覽</p>
              </div>
            </label>
            <label class="flex items-start space-x-2 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" id="perm_set_location" value="set_location" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
              <div>
                <span class="font-bold text-gray-800">座標設定 (set_location)</span>
                <p class="text-[10px] text-gray-400">LINE 分享定位直接更新門市 GPS 與地址</p>
              </div>
            </label>
            <label class="flex items-start space-x-2 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" id="perm_set_wifi" value="set_wifi" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
              <div>
                <span class="font-bold text-gray-800">Wi-Fi 綁定 (set_wifi)</span>
                <p class="text-[10px] text-gray-400">現場快速將目前連線 IP 登錄為門市白名單</p>
              </div>
            </label>
            <label class="flex items-start space-x-2 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" id="perm_device_audit" value="device_audit" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
              <div>
                <span class="font-bold text-gray-800">換機解綁 (device_audit)</span>
                <p class="text-[10px] text-gray-400">監控與解除同仁裝置綁定紀錄</p>
              </div>
            </label>
            <label class="flex items-start space-x-2 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" id="perm_export_payroll" value="export_payroll" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
              <div>
                <span class="font-bold text-gray-800">計薪匯出 (export_payroll)</span>
                <p class="text-[10px] text-gray-400">匯出考勤工時與加班計薪 CSV</p>
              </div>
            </label>
            <label class="flex items-start space-x-2 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" id="perm_broadcast" value="broadcast" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
              <div>
                <span class="font-bold text-gray-800">公告推播 (broadcast)</span>
                <p class="text-[10px] text-gray-400">在 LINE 對指定門市或全員發送公告</p>
              </div>
            </label>
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-3 border-t border-gray-100">
          <button type="button" onclick="closeEmployeePermissionsModal()" class="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-xl transition">取消</button>
          <button type="submit" id="permSubmitBtn" class="px-4 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow transition">儲存權限配置</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    const API_BASE = window.location.origin;

    function getSessionToken() {
      return sessionStorage.getItem("admin_session_token") || localStorage.getItem("admin_session_token") || "";
    }

    function getAuthHeaders() {
      const token = getSessionToken();
      return {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      };
    }

    async function handleLogin(e) {
      e.preventDefault();
      const username = document.getElementById("inputUsername").value.trim();
      const password = document.getElementById("inputPassword").value.trim();
      const errorDiv = document.getElementById("loginError");
      const errorText = document.getElementById("loginErrorText");
      const loginBtn = document.getElementById("loginBtn");

      errorDiv.classList.add("hidden");
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>登入中...';

      try {
        const resp = await fetch(API_BASE + "/api/v1/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username, password: password })
        });
        const data = await resp.json();

        if (!resp.ok || !data.success) {
          errorText.innerText = data.error || "登入失敗，請檢查帳號密碼";
          errorDiv.classList.remove("hidden");
          loginBtn.disabled = false;
          loginBtn.innerHTML = '<span>登入系統</span><i class="fa-solid fa-arrow-right text-xs ml-1"></i>';
          return;
        }

        sessionStorage.setItem("admin_session_token", data.token);
        sessionStorage.setItem("admin_user_info", JSON.stringify(data.user));

        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>登入系統</span><i class="fa-solid fa-arrow-right text-xs ml-1"></i>';
        
        initAppView(data.user);
      } catch (err) {
        errorText.innerText = "連線異常：" + err.message;
        errorDiv.classList.remove("hidden");
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>登入系統</span><i class="fa-solid fa-arrow-right text-xs ml-1"></i>';
      }
    }

    async function handleLogout() {
      try {
        await fetch(API_BASE + "/api/v1/admin/logout", {
          method: "POST",
          headers: getAuthHeaders()
        });
      } catch (e) {}
      sessionStorage.removeItem("admin_session_token");
      sessionStorage.removeItem("admin_user_info");
      localStorage.removeItem("admin_session_token");
      localStorage.removeItem("tenant_api_key");
      showLoginView();
    }

    function showLoginView() {
      document.getElementById("loginContainer").classList.remove("hidden");
      document.getElementById("appContainer").classList.add("hidden");
      document.getElementById("inputPassword").value = "";
    }

    function initAppView(user) {
      document.getElementById("loginContainer").classList.add("hidden");
      document.getElementById("appContainer").classList.remove("hidden");
      
      const badgeText = user 
        ? "🏢 統編 " + user.taxId + " ｜ 👤 " + (user.displayName || user.username)
        : '已連線企業後台';
      document.getElementById("userInfoText").innerText = badgeText;

      switchTab('locations');
    }

    async function checkAuthAndInit() {
      const token = getSessionToken();
      if (!token) {
        showLoginView();
        return;
      }

      try {
        const resp = await fetch(API_BASE + "/api/v1/admin/me", {
          headers: getAuthHeaders()
        });
        if (!resp.ok) {
          showLoginView();
          return;
        }

        const data = await resp.json();
        initAppView(data.user);
      } catch (e) {
        showLoginView();
      }
    }

    function switchTab(tabId) {
      ['locations', 'schedules', 'records', 'devices', 'apikeys', 'approvals'].forEach(function(id) {
        const el = document.getElementById('tab-' + id);
        if (el) el.classList.add('hidden');
        const btn = document.getElementById('tabBtn-' + id);
        if (btn) {
          btn.classList.remove('tab-active');
          btn.classList.add('text-gray-500');
        }
      });
      const targetEl = document.getElementById('tab-' + tabId);
      if (targetEl) targetEl.classList.remove('hidden');
      const activeBtn = document.getElementById('tabBtn-' + tabId);
      if (activeBtn) {
        activeBtn.classList.add('tab-active');
        activeBtn.classList.remove('text-gray-500');
      }

      if (tabId === 'locations') fetchLocations();
      if (tabId === 'schedules') fetchSchedules();
      if (tabId === 'records') fetchRecords();
      if (tabId === 'devices') fetchAuditLogs();
      if (tabId === 'apikeys') fetchApiKeys();
      if (tabId === 'approvals') fetchApprovals();
    }

    // ==================== 1. LOCATIONS ====================
    async function fetchLocations() {
      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/locations', { headers: getAuthHeaders() });
        if (resp.status === 401 || resp.status === 403) {
          showLoginView();
          return;
        }
        if (resp.ok) {
          const data = await resp.json();
          renderLocations(data.locations || []);
        }
      } catch (e) {
        console.error(e);
      }
    }

    let cachedLocations = [];

    function renderLocations(locs) {
      cachedLocations = locs || [];
      const container = document.getElementById('locationsList');
      if (!locs || locs.length === 0) {
        container.innerHTML = '<div class="col-span-full py-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-200">查無門市據點，請點擊上方按鈕新增。</div>';
        return;
      }

      container.innerHTML = locs.map(function(l) {
        const wifiBadge = l.has_ip_whitelist 
          ? '<span class="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">🛡️ Wi-Fi 綁定</span>' 
          : '<span class="text-[10px] bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full font-medium">📍 純 GPS</span>';
        
        const ipInfo = l.allowed_ips ? '<div class="text-blue-600 truncate font-mono">IP/網段：' + l.allowed_ips + '</div>' : '<div class="text-gray-400">IP/網段：未設定 (純 GPS 打卡)</div>';
        const managerInfo = l.manager_line_id 
          ? '<div class="text-emerald-700 truncate font-mono">店長 LINE：' + l.manager_line_id + '</div>' 
          : '<div class="text-gray-400">店長 LINE：未設定 (無兜底主管)</div>';

        return '<div onclick="openEditLocationModal(\'' + l.id + '\')" class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-emerald-500 transition flex flex-col justify-between cursor-pointer group relative">' +
          '<div>' +
            '<div class="flex items-center justify-between mb-2">' +
              '<span class="text-xs font-mono font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">' + l.id + '</span>' +
              '<div class="flex items-center space-x-1.5">' +
                wifiBadge +
                '<span class="text-xs text-gray-400 group-hover:text-emerald-600 transition"><i class="fa-solid fa-gear"></i></span>' +
              '</div>' +
            '</div>' +
            '<h3 class="font-bold text-sm text-gray-900 group-hover:text-emerald-700 transition flex items-center justify-between">' +
              '<span>' + l.name + '</span>' +
              '<span class="text-[11px] font-normal text-emerald-600 opacity-0 group-hover:opacity-100 transition">點擊管理 ➔</span>' +
            '</h3>' +
            '<p class="text-xs text-gray-500 mt-1 flex items-start space-x-1">' +
              '<i class="fa-solid fa-location-dot mt-0.5 text-gray-400"></i>' +
              '<span>' + l.address + '</span>' +
            '</p>' +
            '<div class="mt-3 text-[11px] text-gray-600 space-y-1 bg-gray-50 p-2.5 rounded-xl border border-gray-100 font-mono">' +
              '<div>半徑：' + l.allowed_radius + 'm | 座標：' + (l.target_lat !== undefined ? l.target_lat : '-') + ', ' + (l.target_lon !== undefined ? l.target_lon : '-') + '</div>' +
              ipInfo +
              managerInfo +
            '</div>' +
          '</div>' +
          '<div class="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between" onclick="event.stopPropagation()">' +
            '<button type="button" onclick="openEditLocationModal(\'' + l.id + '\')" class="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl font-semibold flex items-center space-x-1.5 transition shadow-sm">' +
              '<i class="fa-solid fa-pen-to-square text-[11px]"></i>' +
              '<span>管理設定</span>' +
            '</button>' +
            '<a href="' + API_BASE + '/api/locations/' + l.id + '/qrcode" target="_blank" class="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center space-x-1 py-1 px-2 hover:bg-emerald-50 rounded-lg transition">' +
              '<i class="fa-solid fa-qrcode"></i>' +
              '<span>立牌 QR</span>' +
            '</a>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function openLocationModal() {
      document.getElementById('locForm').reset();
      document.getElementById('locModalTitle').innerText = '新增門市據點';
      const idEl = document.getElementById('locId');
      idEl.readOnly = false;
      idEl.classList.remove('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
      const qrCont = document.getElementById('locModalQrLinkContainer');
      if (qrCont) qrCont.classList.add('hidden');
      document.getElementById('locSubmitBtn').innerText = '儲存據點';
      document.getElementById('locModal').classList.remove('hidden');
    }

    function openEditLocationModal(id) {
      const loc = cachedLocations.find(function(l) { return l.id === id; });
      if (!loc) return;
      document.getElementById('locModalTitle').innerText = '管理據點設定：' + loc.name;
      const idEl = document.getElementById('locId');
      idEl.value = loc.id;
      idEl.readOnly = true;
      idEl.classList.add('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');

      document.getElementById('locName').value = loc.name || '';
      document.getElementById('locAddress').value = loc.address || '';
      document.getElementById('locLat').value = (loc.target_lat !== undefined && loc.target_lat !== null) ? loc.target_lat : '';
      document.getElementById('locLon').value = (loc.target_lon !== undefined && loc.target_lon !== null) ? loc.target_lon : '';
      document.getElementById('locRadius').value = loc.allowed_radius || 100;
      document.getElementById('locAllowedIps').value = loc.allowed_ips || '';
      document.getElementById('locManagerLineId').value = loc.manager_line_id || '';

      const qrCont = document.getElementById('locModalQrLinkContainer');
      const qrLink = document.getElementById('locModalQrLink');
      if (qrCont && qrLink) {
        qrLink.href = API_BASE + '/api/locations/' + loc.id + '/qrcode';
        qrCont.classList.remove('hidden');
      }

      document.getElementById('locSubmitBtn').innerText = '儲存變更';
      document.getElementById('locModal').classList.remove('hidden');
    }

    function closeLocationModal() {
      document.getElementById('locModal').classList.add('hidden');
    }

    function getCurrentLocationForModal() {
      if (!navigator.geolocation) {
        alert('您的瀏覽器不支援地理定位功能');
        return;
      }
      navigator.geolocation.getCurrentPosition(function(pos) {
        document.getElementById('locLat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('locLon').value = pos.coords.longitude.toFixed(6);
        alert('已成功取得目前瀏覽器經緯度座標！');
      }, function(err) {
        alert('定位失敗：' + err.message);
      }, { enableHighAccuracy: true, timeout: 8000 });
    }

    function clearCoordsForAutoGeocode() {
      document.getElementById('locLat').value = '';
      document.getElementById('locLon').value = '';
      alert('已清空座標！儲存時系統將自動依據中文地址重新解析經緯度。');
    }

    async function handleLocationSubmit(e) {
      e.preventDefault();
      const submitBtn = document.getElementById('locSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>儲存中...';

      const latVal = document.getElementById('locLat').value.trim();
      const lonVal = document.getElementById('locLon').value.trim();

      const payload = {
        id: document.getElementById('locId').value.trim(),
        name: document.getElementById('locName').value.trim(),
        address: document.getElementById('locAddress').value.trim(),
        target_lat: latVal ? parseFloat(latVal) : undefined,
        target_lon: lonVal ? parseFloat(lonVal) : undefined,
        allowed_radius: parseFloat(document.getElementById('locRadius').value) || 100,
        allowed_ips: document.getElementById('locAllowedIps').value.trim() || null,
        manager_line_id: document.getElementById('locManagerLineId').value.trim() || null
      };

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/locations', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const result = await resp.json();
        if (resp.ok && result.success) {
          alert('據點設定儲存成功！');
          closeLocationModal();
          fetchLocations();
        } else {
          alert('儲存失敗：' + (result.error || '未知錯誤'));
        }
      } catch (err) {
        alert('網路請求失敗：' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '儲存據點';
      }
    }

    // ==================== 2. SCHEDULES ====================
    async function fetchSchedules() {
      const month = document.getElementById('scheduleMonth').value;
      const userFilter = document.getElementById('scheduleUserFilter').value.trim();
      let url = API_BASE + '/api/v1/tenant/schedules?month=' + month;
      if (userFilter) url += '&userId=' + encodeURIComponent(userFilter);

      const tbody = document.getElementById('schedulesTableBody');
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>載入班表中...</td></tr>';

      try {
        const resp = await fetch(url, { headers: getAuthHeaders() });
        if (resp.ok) {
          const data = await resp.json();
          renderSchedules(data.schedules || []);
        } else {
          tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">無法載入班表</td></tr>';
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">錯誤：' + e.message + '</td></tr>';
      }
    }

    function renderSchedules(schedules) {
      const tbody = document.getElementById('schedulesTableBody');
      if (!schedules || schedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">查無本月份排班資料。</td></tr>';
        return;
      }

      tbody.innerHTML = schedules.map(function(s) {
        const shiftBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ' + 
          (s.is_rest_day ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-700 border border-emerald-200') + '">' +
          s.shift_name + '</span>';

        const attrText = s.is_rest_day ? '<span class="text-gray-400">例假/休</span>' : (s.is_cross_day ? '<span class="text-purple-600 font-semibold">🌙 跨日大夜</span>' : '<span class="text-emerald-600">常態日班</span>');

        const userText = s.display_name ? (s.display_name + ' (' + s.line_user_id.slice(-6) + ')') : s.line_user_id;

        return '<tr class="hover:bg-gray-50 transition">' +
          '<td class="px-4 py-3 font-mono font-medium text-gray-900">' + s.work_date + '</td>' +
          '<td class="px-4 py-3 text-gray-600">' + s.company_id + '</td>' +
          '<td class="px-4 py-3 font-medium text-gray-800">' + userText + '</td>' +
          '<td class="px-4 py-3">' + shiftBadge + '</td>' +
          '<td class="px-4 py-3 font-mono text-gray-700">' + (s.shift_start || '-') + '</td>' +
          '<td class="px-4 py-3 font-mono text-gray-700">' + (s.shift_end || '-') + '</td>' +
          '<td class="px-4 py-3 font-mono text-gray-600">' + s.break_minutes + '</td>' +
          '<td class="px-4 py-3 text-[11px]">' + attrText + '</td>' +
        '</tr>';
      }).join('');
    }

    async function downloadScheduleTemplate() {
      window.open(API_BASE + '/api/v1/tenant/schedules/template', '_blank');
    }

    async function handleScheduleCsvUpload(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function(evt) {
        const text = evt.target.result;
        const lines = text.split(String.fromCharCode(10)).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
        if (lines.length <= 1) {
          alert("CSV 內容為空或無有效排班列！");
          return;
        }

        const schedules = [];
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',').map(function(c) { return c.trim(); });
          if (row.length < 3) continue;

          schedules.push({
            company_id: row[0],
            line_user_id: row[1],
            work_date: row[2],
            shift_name: row[3] || '常態班',
            shift_start: row[4] || '09:00',
            shift_end: row[5] || '18:00',
            break_minutes: parseInt(row[6], 10) || 60,
            is_rest_day: row[7] === '1' ? 1 : 0,
            is_cross_day: row[8] === '1' ? 1 : 0
          });
        }

        if (schedules.length === 0) {
          alert("未能解析出有效的排班紀錄！");
          return;
        }

        if (!confirm('確定要匯入 ' + schedules.length + ' 筆排班資料嗎？（重複日期將自動覆蓋更新）')) {
          return;
        }

        try {
          const resp = await fetch(API_BASE + '/api/v1/tenant/schedules/batch', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ schedules: schedules })
          });
          const res = await resp.json();
          if (resp.ok && res.success) {
            alert('成功匯入 ' + res.importedCount + ' 筆排班紀錄！');
            fetchSchedules();
          } else {
            alert('匯入失敗：' + (res.error || '未知錯誤'));
          }
        } catch (err) {
          alert('匯入請求失敗：' + err.message);
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsText(file);
    }

    // ==================== 3. RECORDS ====================
    async function fetchRecords() {
      let url = API_BASE + '/api/v1/tenant/records?';
      const start = document.getElementById('filterStartDate').value;
      const end = document.getElementById('filterEndDate').value;
      const status = document.getElementById('filterStatus').value;
      const punchType = document.getElementById('filterPunchType').value;

      if (start) url += '&startDate=' + start;
      if (end) url += '&endDate=' + end;
      if (status) url += '&status=' + status;
      if (punchType) url += '&punchType=' + punchType;

      const tbody = document.getElementById('recordsTableBody');
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>載入紀錄中...</td></tr>';

      try {
        const resp = await fetch(url, { headers: getAuthHeaders() });
        if (resp.ok) {
          const data = await resp.json();
          renderRecords(data.records || []);
        } else {
          tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">無法載入出勤資料</td></tr>';
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">錯誤：' + e.message + '</td></tr>';
      }
    }

    function renderRecords(records) {
      const tbody = document.getElementById('recordsTableBody');
      if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">查無符合條件的打卡紀錄。</td></tr>';
        return;
      }

      tbody.innerHTML = records.map(function(r) {
        const statusClass = r.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
          (r.status === 'DUPLICATE' ? 'bg-gray-100 text-gray-700' :
          (r.status === 'CANCELLED' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'));

        const punchClass = r.punch_type === 'IN' ? 'text-emerald-600' : 'text-blue-600';
        const punchLabel = r.punch_type === 'IN' ? '🟢 上班' : '🔴 下班';
        const verifyText = r.verify_mode === 'IP_WHITELIST' ? '<span class="text-blue-600 font-medium">🛡️ Wi-Fi</span>' : '📍 GPS';

        return '<tr class="hover:bg-gray-50 transition">' +
          '<td class="px-4 py-3 font-mono font-medium text-gray-900">' + r.created_at + '</td>' +
          '<td class="px-4 py-3 text-gray-600">' + (r.company_id || '-') + '</td>' +
          '<td class="px-4 py-3 font-medium text-gray-800">' + (r.display_name || r.line_user_id.slice(-6)) + '</td>' +
          '<td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ' + statusClass + '">' + r.status + '</span></td>' +
          '<td class="px-4 py-3"><span class="font-bold ' + punchClass + '">' + punchLabel + '</span></td>' +
          '<td class="px-4 py-3 font-mono font-semibold text-gray-800">' + (r.work_hours ? (r.work_hours + 'h') : '-') + '</td>' +
          '<td class="px-4 py-3 text-[11px] text-gray-500">' + verifyText + '</td>' +
          '<td class="px-4 py-3 font-mono text-gray-500">' + r.distance_meters + 'm</td>' +
        '</tr>';
      }).join('');
    }

    function exportCsv() {
      let url = API_BASE + '/api/v1/tenant/records?format=csv';
      const start = document.getElementById('filterStartDate').value;
      const end = document.getElementById('filterEndDate').value;
      const status = document.getElementById('filterStatus').value;
      const punchType = document.getElementById('filterPunchType').value;

      if (start) url += '&startDate=' + start;
      if (end) url += '&endDate=' + end;
      if (status) url += '&status=' + status;
      if (punchType) url += '&punchType=' + punchType;

      fetch(url, { headers: getAuthHeaders() })
        .then(function(r) { return r.blob(); })
        .then(function(blob) {
          const downloadUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = 'attendance_payroll_export_' + (new Date().toISOString().slice(0,10)) + '.csv';
          document.body.appendChild(a);
          a.click();
          a.remove();
        });
    }

    // ==================== 4. AUDIT LOGS ====================
    async function fetchAuditLogs() {
      const tbody = document.getElementById('auditTableBody');
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>載入稽核日誌中...</td></tr>';

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/audit', { headers: getAuthHeaders() });
        if (resp.ok) {
          const data = await resp.json();
          renderAuditLogs(data.logs || []);
        } else {
          tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-500">無法載入日誌</td></tr>';
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-500">錯誤：' + e.message + '</td></tr>';
      }
    }

    function renderAuditLogs(logs) {
      const tbody = document.getElementById('auditTableBody');
      if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">暫無稽核日誌。</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(function(l) {
        const warnClass = l.warning_level === 'WARNING' ? 'bg-amber-100 text-amber-800' :
          (l.warning_level === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-blue-50 text-blue-700');

        return '<tr class="hover:bg-gray-50 transition">' +
          '<td class="px-4 py-3 font-mono text-gray-900">' + l.created_at + '</td>' +
          '<td class="px-4 py-3 text-gray-700">' +
            '<div class="font-medium">' + (l.display_name || '員工') + '</div>' +
            '<div class="text-[10px] text-gray-400 font-mono">' + l.line_user_id + '</div>' +
          '</td>' +
          '<td class="px-4 py-3">' +
            '<div class="font-medium text-gray-900">' + l.action + '</div>' +
            '<div class="text-[10px] text-gray-500 mt-0.5">' + (l.detail || '-') + '</div>' +
          '</td>' +
          '<td class="px-4 py-3 font-mono text-gray-500">' + (l.ip_address || '-') + '</td>' +
          '<td class="px-4 py-3">' +
            '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ' + warnClass + '">' + (l.warning_level || 'INFO') + '</span>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    // ==================== 5. API KEYS ====================
    async function fetchApiKeys() {
      const tbody = document.getElementById('apiKeysTableBody');
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 font-sans"><i class="fa-solid fa-spinner fa-spin mr-2"></i>載入金鑰清單中...</td></tr>';

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/keys', { headers: getAuthHeaders() });
        if (resp.ok) {
          const data = await resp.json();
          renderApiKeys(data.keys || []);
        } else {
          tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500 font-sans">無法載入金鑰清單</td></tr>';
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500 font-sans">錯誤：' + e.message + '</td></tr>';
      }
    }

    function renderApiKeys(keys) {
      const tbody = document.getElementById('apiKeysTableBody');
      if (!keys || keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 font-sans">目前尚無發行任何 M2M API 金鑰，請點擊上方按鈕建立。</td></tr>';
        return;
      }

      tbody.innerHTML = keys.map(function(k) {
        const roleClass = k.role === 'ADMIN' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200';
        const statusHtml = k.is_active 
          ? '<span class="inline-flex items-center text-emerald-700 font-semibold text-[11px]"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>啟用中</span>' 
          : '<span class="inline-flex items-center text-gray-400 text-[11px]"><span class="w-1.5 h-1.5 rounded-full bg-gray-400 mr-1.5"></span>已撤銷</span>';

        const actionHtml = k.is_active 
          ? '<button data-id="' + k.id + '" data-name="' + (k.name || '').replace(/"/g, '&quot;') + '" onclick="handleRevokeKey(this)" class="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded hover:bg-red-50 transition"><i class="fa-solid fa-ban mr-1"></i>撤銷金鑰</button>' 
          : '<span class="text-xs text-gray-400">-</span>';

        const rowOpacity = k.is_active ? '' : 'opacity-50 bg-gray-50/50';

        return '<tr class="hover:bg-gray-50 transition ' + rowOpacity + '">' +
          '<td class="px-4 py-3 font-mono font-bold text-gray-900">' + k.key_hint + '</td>' +
          '<td class="px-4 py-3 font-sans font-medium text-gray-800">' + k.name + '</td>' +
          '<td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ' + roleClass + '">' + k.role + '</span></td>' +
          '<td class="px-4 py-3 font-sans">' + statusHtml + '</td>' +
          '<td class="px-4 py-3 text-gray-500 text-[11px]">' + k.created_at + '</td>' +
          '<td class="px-4 py-3 text-gray-500 text-[11px]">' + (k.last_used_at || '尚未呼叫') + '</td>' +
          '<td class="px-4 py-3 text-right font-sans">' + actionHtml + '</td>' +
        '</tr>';
      }).join('');
    }

    function openCreateKeyModal() {
      document.getElementById('keyNameInput').value = '';
      document.getElementById('keyRoleSelect').value = 'ADMIN';
      document.getElementById('createKeyModal').classList.remove('hidden');
    }

    function closeCreateKeyModal() {
      document.getElementById('createKeyModal').classList.add('hidden');
    }

    async function handleCreateKeySubmit(e) {
      e.preventDefault();
      const submitBtn = document.getElementById('createKeySubmitBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>生成中...';

      const payload = {
        name: document.getElementById('keyNameInput').value.trim(),
        role: document.getElementById('keyRoleSelect').value
      };

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/keys', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const data = await resp.json();

        if (resp.ok && data.success && data.apiKey) {
          closeCreateKeyModal();
          showRawKeyModal(data.apiKey);
          fetchApiKeys();
        } else {
          alert('金鑰生成失敗：' + (data.error || '未知錯誤'));
        }
      } catch (err) {
        alert('網路請求失敗：' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '生成金鑰';
      }
    }

    function showRawKeyModal(apiKey) {
      document.getElementById('newRawApiKeyInput').value = apiKey;
      document.getElementById('copyBtnText').innerText = '複製';
      document.getElementById('showKeyModal').classList.remove('hidden');
    }

    function closeShowKeyModal() {
      document.getElementById('showKeyModal').classList.add('hidden');
    }

    function copyRawApiKey() {
      const input = document.getElementById('newRawApiKeyInput');
      input.select();
      navigator.clipboard.writeText(input.value).then(function() {
        document.getElementById('copyBtnText').innerText = '已複製！';
        setTimeout(function() {
          document.getElementById('copyBtnText').innerText = '複製';
        }, 2000);
      }).catch(function() {
        document.execCommand('copy');
        document.getElementById('copyBtnText').innerText = '已複製！';
      });
    }

    async function handleRevokeKey(target, maybeKeyName) {
      const keyId = (typeof target === 'object' && target !== null) ? target.getAttribute('data-id') : target;
      const keyName = (typeof target === 'object' && target !== null) ? target.getAttribute('data-name') : maybeKeyName;
      if (!confirm('確定要撤銷停用「' + keyName + '」金鑰嗎？撤銷後使用此 Key 的外部系統將立即無法連線！')) {
        return;
      }

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/keys/' + keyId + '/revoke', {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          alert('金鑰已成功撤銷！');
          fetchApiKeys();
        } else {
          alert('撤銷失敗：' + (data.error || '未知錯誤'));
        }
      } catch (err) {
        alert('操作失敗：' + err.message);
      }
    }

    // ==================== 6. APPROVALS ====================
    function openAssignApproverModal() {
      document.getElementById('assignApproverForm').reset();
      document.getElementById('assignApproverModal').classList.remove('hidden');
    }

    function closeAssignApproverModal() {
      document.getElementById('assignApproverModal').classList.add('hidden');
    }

    async function handleAssignApproverSubmit(e) {
      e.preventDefault();
      const submitBtn = document.getElementById('assignApproverSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>儲存中...';

      const empUserId = document.getElementById('assignEmpUserId').value.trim();
      const empName = document.getElementById('assignEmpName').value.trim();
      const approverLineId = document.getElementById('assignApproverLineId').value.trim();

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/employees/' + encodeURIComponent(empUserId) + '/approver', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            employeeName: empName || null,
            approverLineId: approverLineId
          })
        });
        const result = await resp.json();
        if (resp.ok && result.success) {
          alert('直屬審核主管綁定成功！');
          closeAssignApproverModal();
        } else {
          alert('綁定失敗：' + (result.error || '未知錯誤'));
        }
      } catch (err) {
        alert('網路請求失敗：' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '儲存綁定';
      }
    }

    // ==================== 7. EMPLOYEE PBAC PERMISSIONS ====================
    let cachedEmployees = [];
    const PERM_KEYS = ['punch', 'apply', 'approve', 'view_store', 'view_all', 'set_location', 'set_wifi', 'device_audit', 'export_payroll', 'broadcast'];

    async function loadTenantEmployeesForPerms(selectedUserId = '') {
      const select = document.getElementById('permEmployeeSelect');
      if (!select) return;
      select.innerHTML = '<option value="">載入同仁清單中...</option>';
      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/employees', { headers: getAuthHeaders() });
        if (resp.ok) {
          const data = await resp.json();
          cachedEmployees = data.employees || [];
          let opts = '<option value="">-- 請選擇同仁 (或於下方手動輸入) --</option>';
          cachedEmployees.forEach(e => {
            const name = e.employeeName || '未命名';
            const loc = e.companyName ? (' [' + e.companyName + ']') : (e.companyId ? (' [' + e.companyId + ']') : '');
            opts += '<option value="' + e.lineUserId + '">' + name + ' (' + e.lineUserId.slice(-6) + ')' + loc + '</option>';
          });
          select.innerHTML = opts;
          if (selectedUserId) {
            select.value = selectedUserId;
          }
        } else {
          select.innerHTML = '<option value="">-- 手動輸入同仁 LINE ID --</option>';
        }
      } catch (err) {
        select.innerHTML = '<option value="">-- 載入清單失敗，請手動輸入 --</option>';
      }
    }

    function onPermEmployeeSelectChange() {
      const select = document.getElementById('permEmployeeSelect');
      const userId = select.value;
      if (!userId) return;
      const emp = cachedEmployees.find(e => e.lineUserId === userId);
      if (emp) {
        document.getElementById('permLineUserId').value = emp.lineUserId;
        document.getElementById('permEmployeeName').value = emp.employeeName || '';
        const perms = Array.isArray(emp.permissions) ? emp.permissions : [];
        PERM_KEYS.forEach(k => {
          const el = document.getElementById('perm_' + k);
          if (el) el.checked = perms.includes(k);
        });
      }
    }

    function openEmployeePermissionsModal(empUserId = '', empName = '', perms = ['punch', 'apply']) {
      document.getElementById('permLineUserId').value = empUserId;
      document.getElementById('permEmployeeName').value = empName;
      PERM_KEYS.forEach(k => {
        const el = document.getElementById('perm_' + k);
        if (el) el.checked = perms.includes(k);
      });
      document.getElementById('employeePermissionsModal').classList.remove('hidden');
      loadTenantEmployeesForPerms(empUserId);
    }

    function closeEmployeePermissionsModal() {
      document.getElementById('employeePermissionsModal').classList.add('hidden');
    }

    function applyPermPreset(type) {
      const presets = {
        employee: ['punch', 'apply'],
        manager: ['punch', 'apply', 'approve', 'view_store', 'set_location', 'set_wifi'],
        hr: ['punch', 'apply', 'view_all', 'device_audit', 'export_payroll'],
        boss: PERM_KEYS
      };
      const list = presets[type] || ['punch', 'apply'];
      PERM_KEYS.forEach(k => {
        const el = document.getElementById('perm_' + k);
        if (el) el.checked = list.includes(k);
      });
    }

    async function handleEmployeePermissionsSubmit(e) {
      e.preventDefault();
      const submitBtn = document.getElementById('permSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>儲存中...';

      const empUserId = document.getElementById('permLineUserId').value.trim();
      const empName = document.getElementById('permEmployeeName').value.trim();
      const perms = [];
      PERM_KEYS.forEach(k => {
        const el = document.getElementById('perm_' + k);
        if (el && el.checked) perms.push(k);
      });

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/employees/' + encodeURIComponent(empUserId) + '/permissions', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            employeeName: empName || null,
            permissions: perms
          })
        });
        const result = await resp.json();
        if (resp.ok && result.success) {
          alert('員工細粒度權限更新成功！');
          closeEmployeePermissionsModal();
        } else {
          alert('儲存失敗：' + (result.error || '未知錯誤'));
        }
      } catch (err) {
        alert('網路請求失敗：' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '儲存權限配置';
      }
    }

    async function fetchApprovals() {
      const tbody = document.getElementById('approvalsTableBody');
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-400 font-sans">載入中...</td></tr>';

      const month = document.getElementById('approvalMonth').value;
      const status = document.getElementById('approvalStatusFilter').value;
      const type = document.getElementById('approvalTypeFilter').value;

      let url = API_BASE + '/api/v1/tenant/approvals?month=' + month;
      if (status) url += '&status=' + status;
      if (type) url += '&type=' + type;

      try {
        const resp = await fetch(url, { headers: getAuthHeaders() });
        if (resp.status === 401 || resp.status === 403) {
          showLoginView();
          return;
        }

        const data = await resp.json();
        if (!resp.ok || !data.success || !data.approvals || data.approvals.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-400 font-sans">目前查無任何符合條件之簽核單據。</td></tr>';
          return;
        }

        tbody.innerHTML = data.approvals.map(function(a) {
          let typeBadge = '';
          if (a.type === 'LEAVE') typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">🌴 請假</span>';
          else if (a.type === 'CORRECTION') typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">⏰ 補卡</span>';
          else if (a.type === 'OVERTIME') typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">🔥 加班</span>';
          else typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-50 text-gray-700">' + a.type + '</span>';

          let statusBadge = '';
          if (a.status === 'APPROVED') statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">✅ 已核准</span>';
          else if (a.status === 'REJECTED') statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">❌ 已駁回</span>';
          else statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">🟡 審核中</span>';

          let detailsObj = {};
          try { detailsObj = JSON.parse(a.details || '{}'); } catch (e) {}
          let detailStr = '';
          if (a.type === 'LEAVE') detailStr = (detailsObj.leave_type || '') + ' ' + (detailsObj.time_range || '');
          else if (a.type === 'CORRECTION') detailStr = (detailsObj.punch_type === 'OUT' ? '下班卡 ' : '上班卡 ') + (detailsObj.time || '');
          else if (a.type === 'OVERTIME') detailStr = (detailsObj.hours ? detailsObj.hours + '小時 ' : '') + (detailsObj.time_range || '');
          if (detailsObj.reason) detailStr += ' (' + detailsObj.reason + ')';

          return '<tr class="hover:bg-gray-50 transition">' +
            '<td class="px-4 py-3 font-mono text-gray-500 font-bold">' + a.id.substring(0, 15) + '...</td>' +
            '<td class="px-4 py-3 font-sans font-bold text-gray-900">' + a.applicant_name + '</td>' +
            '<td class="px-4 py-3 font-mono text-gray-600">' + a.company_id + '</td>' +
            '<td class="px-4 py-3">' + typeBadge + '</td>' +
            '<td class="px-4 py-3 font-mono text-gray-700">' + a.target_date + '</td>' +
            '<td class="px-4 py-3 font-sans text-gray-600 max-w-xs truncate">' + detailStr + '</td>' +
            '<td class="px-4 py-3 font-mono text-gray-500 truncate max-w-[120px]">' + a.approver_line_id + '</td>' +
            '<td class="px-4 py-3">' + statusBadge + '</td>' +
            '<td class="px-4 py-3 font-mono text-gray-400">' + (a.decided_at || '-') + '</td>' +
          '</tr>';
        }).join('');

      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500 font-sans">載入異常：' + err.message + '</td></tr>';
      }
    }

    // Auto-init on page load
    window.addEventListener('DOMContentLoaded', function() {
      checkAuthAndInit();
    });
  </script>
</body>
</html>`;
}
