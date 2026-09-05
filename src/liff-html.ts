export function renderLiffHtml(liffId: string, defaultLocationName: string): string {
  const nowUtc = new Date();
  const twTime = new Date(nowUtc.getTime() + 8 * 3600 * 1000);
  const currentMonthStr = twTime.toISOString().slice(0, 7);

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
    
    <!-- VIEW 0: 新人入職確認卡片 (僅向尚未綁定公司之新人展示) -->
    <section id="view-onboarding" class="tab-section space-y-4 hidden">
      <div class="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center space-y-5">
        
        <!-- Welcome Header -->
        <div class="inline-flex items-center space-x-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full border border-emerald-200">
          <i class="fa-solid fa-handshake"></i>
          <span>新進同仁入職邀請</span>
        </div>

        <!-- User Info -->
        <div class="space-y-2">
          <div class="relative w-20 h-20 mx-auto">
            <img id="onboardingUserAvatar" src="https://via.placeholder.com/150/06C755/FFFFFF?text=USER" class="w-20 h-20 rounded-full object-cover border-2 border-emerald-500 shadow">
            <span class="absolute bottom-0 right-0 bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">LINE</span>
          </div>
          <h2 id="onboardingUserName" class="font-bold text-lg text-gray-900">載入用戶資料中...</h2>
          <p class="text-xs text-gray-500">歡迎！您已收到以下門市據點之考勤打卡邀請：</p>
        </div>

        <!-- Store Target Card -->
        <div class="bg-gradient-to-br from-emerald-50/60 to-blue-50/60 p-4 rounded-2xl border border-emerald-100 text-left text-xs space-y-2.5">
          <div class="flex items-start justify-between">
            <div>
              <span class="text-[10px] uppercase font-bold text-emerald-600 block mb-0.5">受邀加入據點</span>
              <div id="onboardingCompanyName" class="font-bold text-sm text-gray-900">載入中...</div>
            </div>
            <span id="onboardingCompanyBadge" class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800">-</span>
          </div>
          <div class="flex items-center text-gray-600 text-xs space-x-1.5 pt-1 border-t border-emerald-100/70">
            <i class="fa-solid fa-location-dot text-emerald-600 text-xs"></i>
            <span id="onboardingCompanyAddress" class="truncate">門市地址載入中...</span>
          </div>
        </div>

        <!-- Feature preview pills -->
        <div class="grid grid-cols-3 gap-2 text-center text-[11px] text-gray-600">
          <div class="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
            <i class="fa-solid fa-fingerprint text-emerald-500 text-sm block mb-1"></i>
            <span>一鍵打卡</span>
          </div>
          <div class="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
            <i class="fa-solid fa-calendar-days text-blue-500 text-sm block mb-1"></i>
            <span>出勤月曆</span>
          </div>
          <div class="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
            <i class="fa-solid fa-file-signature text-purple-500 text-sm block mb-1"></i>
            <span>線上簽核</span>
          </div>
        </div>

        <!-- Action Button -->
        <!-- Action Button (Direct 1-Click Join) -->
        <div class="pt-2 space-y-2.5">
          <button id="joinBtn" onclick="handleJoinCompany()" class="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/20 text-base transition flex items-center justify-center space-x-2">
            <i class="fa-solid fa-circle-check text-lg"></i>
            <span id="joinBtnText">確認加入公司考勤系統</span>
          </button>
          <p class="text-[11px] text-gray-400">點擊確認即完成門市綁定，完成後將引導加入打卡官方帳號</p>
        </div>

        <div id="onboardingAlert" class="p-3 rounded-xl text-xs hidden"></div>
      </div>
    </section>

    <!-- 入職成功 & 強引導加好友彈窗 Modal -->
    <div id="onboardingSuccessModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 hidden">
      <div class="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <!-- Icon & Header -->
        <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl shadow-inner">
          <i class="fa-solid fa-circle-check"></i>
        </div>
        
        <div class="space-y-1">
          <h3 class="font-bold text-lg text-gray-900">🎉 入職登記成功！</h3>
          <p id="successModalStoreName" class="text-xs font-semibold text-emerald-700">已成功加入門市考勤系統</p>
        </div>

        <!-- Callout for Adding Friend -->
        <div class="p-3.5 bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl border border-emerald-200 text-left space-y-2">
          <div class="flex items-center space-x-1.5 text-emerald-900 font-bold text-xs">
            <i class="fa-solid fa-bell text-emerald-600"></i>
            <span>重要提醒：請加入打卡帳號好友</span>
          </div>
          <p class="text-[11px] text-gray-600 leading-relaxed">
            入職已完成！請加入官方帳號好友，以接收<strong>每日打卡收據推播</strong>並在聊天室使用<strong>考勤圖文選單</strong>。
          </p>
        </div>

        <!-- Actions -->
        <div class="space-y-2 pt-1">
          <a id="modalAddFriendBtn" href="https://line.me/R/ti/p/@375nvoga" target="_blank" onclick="handleModalFriendClick()" class="w-full bg-[#06C755] hover:bg-[#05b34c] active:scale-95 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-emerald-500/20 text-sm transition flex items-center justify-center space-x-2">
            <i class="fa-brands fa-line text-xl"></i>
            <span>💬 立即加入打卡帳號好友</span>
          </a>
          <button type="button" onclick="closeSuccessModalAndGoToCheckin()" class="w-full py-2 text-xs text-gray-400 hover:text-gray-700 font-semibold transition flex items-center justify-center space-x-1">
            <span>直接進入打卡頁面</span>
            <i class="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 換機打卡防弊確認彈窗 Modal -->
    <div id="deviceSwitchModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 hidden">
      <div class="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <!-- Icon & Header -->
        <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-3xl shadow-inner">
          <i class="fa-solid fa-mobile-screen-button"></i>
        </div>
        
        <div class="space-y-1">
          <h3 class="font-bold text-lg text-gray-900">⚠️ 偵測到更換打卡設備</h3>
          <p class="text-xs font-semibold text-amber-700">防作弊與設備安全檢核</p>
        </div>

        <!-- Callout -->
        <div class="p-3.5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 text-left space-y-2">
          <div class="flex items-center space-x-1.5 text-amber-900 font-bold text-xs">
            <i class="fa-solid fa-shield-halved text-amber-600"></i>
            <span>防作弊警訊說明</span>
          </div>
          <p id="deviceSwitchModalMsg" class="text-[11px] text-amber-800 leading-relaxed">
            為防範代打卡，使用新手機打卡將<strong>解除舊設備綁定</strong>並<strong>通報人事部</strong>。
          </p>
        </div>

        <p class="text-xs text-gray-600 font-medium">是否確認換機打卡？</p>

        <!-- Actions -->
        <div class="space-y-2 pt-1">
          <button type="button" id="confirmSwitchDeviceBtn" onclick="confirmAndExecuteDeviceSwitch()" class="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-95 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-amber-500/20 text-sm transition flex items-center justify-center space-x-2">
            <i class="fa-solid fa-check"></i>
            <span>確認換機並打卡</span>
          </button>
          <button type="button" onclick="cancelDeviceSwitch()" class="w-full py-2.5 text-xs text-gray-400 hover:text-gray-700 font-semibold transition flex items-center justify-center space-x-1">
            <span>取消打卡</span>
          </button>
        </div>
      </div>
    </div>

    <!-- VIEW 1: 一鍵打卡 -->
    <section id="view-checkin" class="tab-section space-y-4">
      <div class="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center">
        <div class="relative w-20 h-20 mx-auto mb-3">
          <img id="userAvatar" src="https://via.placeholder.com/150/06C755/FFFFFF?text=USER" class="w-20 h-20 rounded-full object-cover border-2 border-emerald-500 shadow">
          <span class="absolute bottom-0 right-0 bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">LINE</span>
        </div>
        <h2 id="userName" class="font-bold text-base text-gray-900 mb-0.5">載入用戶資料中...</h2>
        <div id="companyTag" class="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full border border-blue-200 mt-1 mb-2">
          🏢 門市據點載入中...
        </div>
        <div class="mb-3">
          <a href="https://line.me/R/ti/p/@375nvoga" target="_blank" class="inline-flex items-center space-x-1.5 text-xs text-[#06C755] hover:text-[#05b34c] font-bold bg-[#EBFBEE] px-3 py-1 rounded-full border border-[#D3F9D8]">
            <i class="fa-brands fa-line text-sm"></i>
            <span>加入打卡帳號好友</span>
          </a>
        </div>

        <div class="bg-gray-50 p-4 rounded-2xl border border-gray-200 text-left text-xs space-y-2 mb-4 font-mono">
          <div class="flex justify-between"><span class="text-gray-500">據點代碼</span><span id="displayCompanyId" class="font-bold text-gray-800">-</span></div>
          <div class="flex justify-between"><span class="text-gray-500">目前 GPS</span><span id="displayLocation" class="text-gray-700 truncate max-w-[200px]">尚未定位</span></div>
          <div class="flex justify-between"><span class="text-gray-500">精準誤差</span><span id="displayAccuracy" class="text-gray-700">-</span></div>
          <div class="flex justify-between"><span class="text-gray-500">裝置代碼</span><span id="displayDevice" class="text-gray-400 truncate max-w-[200px]">-</span></div>
        </div>

        <button id="checkinBtn" onclick="performCheckin()" class="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/20 text-base transition flex items-center justify-center space-x-2">
          <i class="fa-solid fa-fingerprint text-xl"></i>
          <span id="checkinBtnText">立即打卡</span>
        </button>

        <div id="statusAlert" class="mt-4 p-3 rounded-xl text-xs hidden"></div>
      </div>
    </section>

    <!-- VIEW 2: 出勤月曆與工時統計 -->
    <section id="view-calendar" class="tab-section space-y-4 hidden">
      <!-- Month Filter & Summary Stats -->
      <div class="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="font-bold text-sm text-gray-900 flex items-center space-x-1.5">
            <i class="fa-solid fa-calendar-check text-emerald-500"></i>
            <span>個人出勤統計</span>
          </h2>
          <div class="flex items-center space-x-1 bg-gray-50 p-0.5 rounded-xl border border-gray-200">
            <button type="button" onclick="changeCalendarMonth(-1)" class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white text-gray-600 hover:text-emerald-600 transition active:scale-90" title="上個月">
              <i class="fa-solid fa-chevron-left text-xs"></i>
            </button>
            <input type="month" id="calendarMonthInput" value="${currentMonthStr}" onchange="loadMonthlyAttendance()" class="bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-emerald-500 shadow-sm cursor-pointer">
            <button type="button" onclick="changeCalendarMonth(1)" class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white text-gray-600 hover:text-emerald-600 transition active:scale-90" title="下個月">
              <i class="fa-solid fa-chevron-right text-xs"></i>
            </button>
          </div>
        </div>

        <!-- 4 Metric Cards (本月累計工時, 加班時長, 遲到 / 早退, 異常缺卡) -->
        <div class="grid grid-cols-2 gap-2.5 text-center">
          <div class="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl">
            <div class="text-[10px] text-emerald-700 font-semibold uppercase">本月累計工時</div>
            <div class="text-xl font-bold font-mono text-emerald-800 mt-0.5" id="statTotalHours">0.0h</div>
          </div>
          <div class="bg-purple-50 border border-purple-100 p-3 rounded-2xl">
            <div class="text-[10px] text-purple-700 font-semibold uppercase">加班時長</div>
            <div class="text-xl font-bold font-mono text-purple-800 mt-0.5" id="statOvertimeHours">0.0h</div>
          </div>
          <div class="bg-amber-50 border border-amber-100 p-3 rounded-2xl">
            <div class="text-[10px] text-amber-700 font-semibold uppercase">遲到 / 早退</div>
            <div class="text-xl font-bold font-mono text-amber-800 mt-0.5" id="statLateCount">0 次</div>
          </div>
          <div class="bg-red-50 border border-red-100 p-3 rounded-2xl">
            <div class="text-[10px] text-red-700 font-semibold uppercase">異常缺卡</div>
            <div class="text-xl font-bold font-mono text-red-800 mt-0.5" id="statMissingCount">0 次</div>
          </div>
        </div>
      </div>

      <!-- Calendar Month Grid -->
      <div class="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
        <div class="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-gray-400 pb-2 border-b border-gray-100">
          <span class="text-red-400">日</span>
          <span>一</span>
          <span>二</span>
          <span>三</span>
          <span>四</span>
          <span>五</span>
          <span class="text-emerald-500">六</span>
        </div>
        <div id="calendarDaysGrid" class="grid grid-cols-7 gap-1.5 text-center">
          <div class="col-span-7 py-8 text-center text-gray-400 text-xs">載入月曆資料中...</div>
        </div>
      </div>

      <!-- Selected Day Detail Card -->
      <div id="dayDetailCard" class="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 hidden space-y-3">
        <div class="flex items-center justify-between border-b border-gray-100 pb-2">
          <h3 class="font-bold text-xs text-gray-900" id="detailDateText">2026-08-15 出勤明細</h3>
          <span id="detailStatusBadge" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">🟢 正常</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs font-mono">
          <div class="bg-gray-50 p-2.5 rounded-xl"><span class="text-gray-400 text-[10px] block">預排班次</span><span id="detailScheduleTime" class="font-bold text-gray-800">-</span></div>
          <div class="bg-gray-50 p-2.5 rounded-xl"><span class="text-gray-400 text-[10px] block">實際工時</span><span id="detailWorkHours" class="font-bold text-blue-600">-</span></div>
          <div class="bg-gray-50 p-2.5 rounded-xl"><span class="text-gray-400 text-[10px] block">上班打卡</span><span id="detailFirstIn" class="font-bold text-emerald-600">-</span></div>
          <div class="bg-gray-50 p-2.5 rounded-xl"><span class="text-gray-400 text-[10px] block">下班打卡</span><span id="detailLastOut" class="font-bold text-red-600">-</span></div>
          <div id="detailLeaveRow" class="bg-amber-50/80 border border-amber-200/80 p-2.5 rounded-xl col-span-2 hidden items-center justify-between">
            <span class="text-amber-800 text-[11px] font-bold flex items-center space-x-1">
              <span>🌴 請假時數</span>
            </span>
            <span id="detailLeaveHours" class="font-bold text-amber-900 text-xs">-</span>
          </div>
        </div>
        <div id="detailPunchesList" class="text-[11px] text-gray-500 space-y-1 pt-1"></div>
      </div>
    </section>

    <!-- VIEW 3: 線上簽核申請與審批進度 -->
    <section id="view-approvals" class="tab-section space-y-4 hidden">
      <!-- Application Form Card -->
      <div class="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="font-bold text-sm text-gray-900 flex items-center space-x-1.5">
            <i class="fa-solid fa-file-pen text-emerald-500"></i>
            <span>發起申請</span>
          </h2>
          <span class="text-[11px] text-gray-400">直屬主管 LINE 一鍵審批</span>
        </div>

        <!-- Type Selector Tabs -->
        <div class="grid grid-cols-3 gap-2 text-xs">
          <button type="button" onclick="setApprType('LEAVE')" id="typeBtn-LEAVE" class="py-2 px-1 rounded-xl font-bold bg-amber-50 text-amber-700 border border-amber-300 flex items-center justify-center space-x-1">
            <span>🌴 請假</span>
          </button>
          <button type="button" onclick="setApprType('CORRECTION')" id="typeBtn-CORRECTION" class="py-2 px-1 rounded-xl font-medium bg-gray-50 text-gray-600 border border-gray-200 flex items-center justify-center space-x-1">
            <span>⏰ 補卡</span>
          </button>
          <button type="button" onclick="setApprType('OVERTIME')" id="typeBtn-OVERTIME" class="py-2 px-1 rounded-xl font-medium bg-gray-50 text-gray-600 border border-gray-200 flex items-center justify-center space-x-1">
            <span>🔥 加班</span>
          </button>
        </div>

        <form id="apprForm" onsubmit="handleApprSubmit(event)" class="space-y-3 text-xs">
          <!-- Target Date -->
          <div>
            <label class="block text-[11px] font-semibold text-gray-600 mb-1">申請涉及日期</label>
            <input type="date" id="apprTargetDate" required onchange="onApprDateChange()" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-1 focus:ring-emerald-500">
          </div>

          <!-- Leave Punch Compensation Notice -->
          <div id="leavePunchNotice" class="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800 hidden">
            <i class="fa-solid fa-circle-info text-blue-600 mr-1"></i>
            <span id="leavePunchNoticeText">該日已有出勤打卡，請假將自動沖銷未到勤時段，不影響已上班時數。</span>
          </div>

          <!-- Dynamic Fields: LEAVE -->
          <div id="fields-LEAVE" class="space-y-3">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] font-semibold text-gray-600 mb-1">請假類別</label>
                <select id="apprLeaveType" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                  <option value="事假">事假</option>
                  <option value="病假">病假</option>
                  <option value="特休">特別休假</option>
                  <option value="公假">公假</option>
                  <option value="婚假">婚假</option>
                  <option value="喪假">喪假</option>
                </select>
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-gray-600 mb-1">請假時段</label>
                <select id="apprLeaveTime" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                  <option value="全天 (09:00 - 18:00)">全天</option>
                  <option value="上半天 (09:00 - 13:00)">上半天</option>
                  <option value="下半天 (14:00 - 18:00)">下半天</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Dynamic Fields: CORRECTION -->
          <div id="fields-CORRECTION" class="space-y-3 hidden">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] font-semibold text-gray-600 mb-1">補卡方向</label>
                <select id="apprCorrectionPunchType" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                  <option value="IN">🟢 上班卡 (IN)</option>
                  <option value="OUT">🔴 下班卡 (OUT)</option>
                </select>
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-gray-600 mb-1">補正時間 (HH:MM)</label>
                <input type="time" id="apprCorrectionTime" value="09:00" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
              </div>
            </div>
          </div>

          <!-- Dynamic Fields: OVERTIME -->
          <div id="fields-OVERTIME" class="space-y-3 hidden">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] font-semibold text-gray-600 mb-1">加班時數 (小時)</label>
                <input type="number" step="0.5" min="0.5" max="12" id="apprOtHours" value="2" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-gray-600 mb-1">加班時段說明</label>
                <input type="text" id="apprOtTime" value="18:00 - 20:00" placeholder="例如 18:00 - 20:00" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
              </div>
            </div>
          </div>

          <!-- Reason -->
          <div>
            <label class="block text-[11px] font-semibold text-gray-600 mb-1">事由說明</label>
            <textarea id="apprReason" rows="2" required placeholder="請簡述申請原因..." class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-1 focus:ring-emerald-500"></textarea>
          </div>

          <button type="submit" id="apprSubmitBtn" class="w-full py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-1.5">
            <i class="fa-solid fa-paper-plane"></i>
            <span id="apprSubmitBtnText">送出申請並推播主管</span>
          </button>

          <div id="apprAlert" class="p-3 rounded-xl text-xs hidden"></div>
        </form>
      </div>

      <!-- My Applications List Card -->
      <div class="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
        <div class="flex items-center justify-between border-b border-gray-100 pb-2">
          <h2 class="font-bold text-sm text-gray-900 flex items-center space-x-1.5">
            <i class="fa-solid fa-clock-rotate-left text-blue-500"></i>
            <span>我的申請進度</span>
          </h2>
          <button onclick="loadMyApprovals()" class="text-xs text-emerald-600 font-semibold hover:underline flex items-center space-x-1">
            <i class="fa-solid fa-arrows-rotate text-[10px]"></i>
            <span>重新整理</span>
          </button>
        </div>
        <div id="myApprovalsList" class="space-y-2 text-xs">
          <div class="py-6 text-center text-gray-400">載入中...</div>
        </div>
      </div>
    </section>

    <!-- VIEW 4: 管理工作台 (PBAC) -->
    <section id="view-admin" class="tab-section space-y-4 hidden">
      <!-- Permissions Card -->
      <div class="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
        <div class="flex items-center justify-between border-b border-gray-100 pb-2">
          <h2 class="font-bold text-sm text-gray-900 flex items-center space-x-1.5">
            <i class="fa-solid fa-id-badge text-indigo-500"></i>
            <span>我的權限與職能 (PBAC)</span>
          </h2>
          <span id="adminRoleBadge" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">一般員工</span>
        </div>
        <div id="adminPermTags" class="flex flex-wrap gap-1.5 text-[11px]">
          <span class="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">載入中...</span>
        </div>
      </div>

      <!-- Quick Action: Store Wi-Fi Registration -->
      <div id="cardWifiReg" class="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3 hidden">
        <div class="flex items-center justify-between border-b border-gray-100 pb-2">
          <h2 class="font-bold text-sm text-gray-900 flex items-center space-x-1.5">
            <i class="fa-solid fa-wifi text-emerald-500"></i>
            <span>門市 Wi-Fi 白名單登記</span>
          </h2>
          <span class="text-[10px] text-gray-400 font-mono">set_wifi</span>
        </div>
        <p class="text-xs text-gray-500">連上門市現場 Wi-Fi 後，點擊下方按鈕將目前對外 IP 登記至白名單，全員在店內即可免開 GPS 直通打卡。</p>
        <button onclick="registerCurrentWifiIp()" id="wifiRegBtn" class="w-full py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-2xl border border-emerald-200 text-xs transition flex items-center justify-center space-x-2">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span>一鍵登記當前 Wi-Fi IP</span>
        </button>
        <div id="wifiRegMsg" class="text-xs font-mono p-2.5 rounded-xl bg-gray-50 border border-gray-200 hidden"></div>
      </div>

      <!-- Quick Guide: Store GPS Coordinate Setup -->
      <div id="cardGpsGuide" class="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3 hidden">
        <div class="flex items-center justify-between border-b border-gray-100 pb-2">
          <h2 class="font-bold text-sm text-gray-900 flex items-center space-x-1.5">
            <i class="fa-solid fa-location-crosshairs text-blue-500"></i>
            <span>門市 GPS 座標即時更新</span>
          </h2>
          <span class="text-[10px] text-gray-400 font-mono">set_location</span>
        </div>
        <p class="text-xs text-gray-500">您具備門市座標設定權限。若需重新校準門市打卡範圍：</p>
        <div class="bg-blue-50/50 p-3 rounded-2xl border border-blue-100 text-xs text-gray-700 space-y-1.5">
          <div class="flex items-start space-x-2">
            <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">1</span>
            <span>在門市現場打開 LINE 機器人聊天室。</span>
          </div>
          <div class="flex items-start space-x-2">
            <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">2</span>
            <span>點擊聊天室左下角「+」號，選擇「分享位置資訊」。</span>
          </div>
          <div class="flex items-start space-x-2">
            <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">3</span>
            <span>釘選當前門市位置發送，系統即自動覆寫門市打卡座標！</span>
          </div>
        </div>
      </div>

      <!-- Store Today Attendance Quick Link -->
      <div id="cardStoreAttend" class="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3 hidden">
        <div class="flex items-center justify-between border-b border-gray-100 pb-2">
          <h2 class="font-bold text-sm text-gray-900 flex items-center space-x-1.5">
            <i class="fa-solid fa-chart-pie text-purple-500"></i>
            <span>門市今日出勤即時看板</span>
          </h2>
          <span class="text-[10px] text-gray-400 font-mono">view_store</span>
        </div>
        <p class="text-xs text-gray-500">您可在 LINE 聊天室直接輸入「今日出勤」或「今日班表」查閱出席概況，或點擊下方直接傳送：</p>
        <button onclick="sendLineCommand('今日出勤')" class="w-full py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-2xl border border-purple-200 text-xs transition flex items-center justify-center space-x-2">
          <i class="fa-solid fa-paper-plane"></i>
          <span>在聊天室查看今日出勤看板</span>
        </button>
      </div>
    </section>

  </main>

  <script>
    const LIFF_ID = "${liffId}";
    let idToken = "";
    let userId = "DEMO_USER";
    let displayName = "測試用戶";
    function getQueryParam(key) {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.has(key)) return searchParams.get(key);

      // Check liff.state for redirected params inside LINE client
      const liffState = searchParams.get("liff.state");
      if (liffState) {
        try {
          const decoded = decodeURIComponent(liffState);
          const qIdx = decoded.indexOf("?");
          if (qIdx !== -1) {
            const stateParams = new URLSearchParams(decoded.substring(qIdx));
            if (stateParams.has(key)) return stateParams.get(key);
          } else {
            const stateParams = new URLSearchParams(decoded);
            if (stateParams.has(key)) return stateParams.get(key);
          }
        } catch (e) {}
      }

      // Check hash fallback
      if (window.location.hash) {
        const hashStr = window.location.hash.startsWith("#") ? window.location.hash.substring(1) : window.location.hash;
        const qIdx = hashStr.indexOf("?");
        const hashQuery = qIdx !== -1 ? hashStr.substring(qIdx) : hashStr;
        const hashParams = new URLSearchParams(hashQuery);
        if (hashParams.has(key)) return hashParams.get(key);
      }
      return null;
    }

    let companyId = getQueryParam("cid") || "24549210-01";
    let monthlyDataCache = null;

    function getDeviceId() {
      let dId = localStorage.getItem("line_checkin_device_id");
      if (!dId) {
        dId = "dev_" + Math.random().toString(36).substring(2, 12) + "_" + Date.now().toString(36);
        localStorage.setItem("line_checkin_device_id", dId);
      }
      return dId;
    }

    const USER_CACHE_KEY = "line_checkin_user_profile";
    let cachedProfile = null;
    try {
      const raw = localStorage.getItem(USER_CACHE_KEY);
      if (raw) cachedProfile = JSON.parse(raw);
    } catch (e) {}

    let userPermissions = (cachedProfile && Array.isArray(cachedProfile.permissions)) ? cachedProfile.permissions : ["punch", "apply"];
    let isUserManager = cachedProfile ? !!cachedProfile.isManager : false;
    let isEnrolled = cachedProfile ? !!cachedProfile.isEnrolled : false;
    let enrollmentChecked = !!(cachedProfile && cachedProfile.userId);
    let currentActiveTab = 'checkin';
    let isFriendWithBot = false;
    let currentTargetLocationName = (cachedProfile && cachedProfile.companyName) || "";

    if (cachedProfile && cachedProfile.userId) {
      userId = cachedProfile.userId;
      if (cachedProfile.displayName) displayName = cachedProfile.displayName;
      if (cachedProfile.companyId && !getQueryParam("cid")) companyId = cachedProfile.companyId;

      // Immediate synchronous DOM hydration from cache (0ms first paint)
      const uNameEl = document.getElementById("userName");
      if (uNameEl && displayName) uNameEl.innerText = displayName;
      const tagEl = document.getElementById("userProfileTag");
      if (tagEl && displayName) tagEl.innerText = displayName;
      const compTagEl = document.getElementById("companyTag");
      if (compTagEl) compTagEl.innerText = "🏢 據點：" + (cachedProfile.companyName || companyId);
      const dispCompEl = document.getElementById("displayCompanyId");
      if (dispCompEl) dispCompEl.innerText = companyId;
      const avatarEl = document.getElementById("userAvatar");
      if (avatarEl && cachedProfile.pictureUrl) avatarEl.src = cachedProfile.pictureUrl;
      const dispDevEl = document.getElementById("displayDevice");
      if (dispDevEl) dispDevEl.innerText = getDeviceId().substring(0, 15) + "...";
    }

    const MANAGEMENT_PERMISSIONS = [
      "view_store", "view_all", "approve", "set_location", "set_wifi", "device_audit", "export_payroll", "broadcast", "all", "admin"
    ];

    function canAccessAdminTab() {
      return userPermissions.some(p => MANAGEMENT_PERMISSIONS.includes(p));
    }

    async function checkFriendshipStatus(showToast = false) {
      try {
        if (typeof liff !== "undefined" && liff.getFriendship) {
          const friendship = await liff.getFriendship();
          isFriendWithBot = !!(friendship && friendship.friendFlag);
        } else {
          isFriendWithBot = true;
        }
      } catch (err) {
        console.warn("liff.getFriendship error:", err);
        isFriendWithBot = false;
      }

      updateOnboardingFriendshipUI();

      if (showToast) {
        const alertBox = document.getElementById("onboardingAlert");
        if (alertBox) {
          if (isFriendWithBot) {
            alertBox.className = "p-3 rounded-xl text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 block";
            alertBox.innerHTML = '<i class="fa-solid fa-circle-check mr-1 text-emerald-600"></i><strong>已成功確認好友身分！</strong><br>第 2 步已為您解鎖，請點選下方按鈕確認入職。';
          } else {
            alertBox.className = "p-3 rounded-xl text-xs bg-amber-50 text-amber-800 border border-amber-200 block";
            alertBox.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1 text-amber-600"></i>尚未偵測到好友關係，請先點擊第 1 步加入官方帳號好友。';
          }
          setTimeout(() => alertBox.classList.add("hidden"), 4000);
        }
      }

      return isFriendWithBot;
    }

    function getAvailableTabs() {
      if (!isEnrolled) return [];
      const tabs = ['checkin', 'calendar', 'approvals'];
      if (canAccessAdminTab()) tabs.push('admin');
      return tabs;
    }

    function showOnboardingView(profile) {
      const tabSwitcher = document.getElementById("tabSwitcher");
      if (tabSwitcher) tabSwitcher.classList.remove("hidden");

      // Show ONLY the single 3-buttons-wide "入職登記" tab in the tab switcher
      const navOnboarding = document.getElementById("nav-onboarding");
      if (navOnboarding) {
        navOnboarding.classList.remove("hidden");
        navOnboarding.classList.add("flex");
        navOnboarding.classList.add("active");
      }

      ['checkin', 'calendar', 'approvals', 'admin'].forEach(tab => {
        const btn = document.getElementById("nav-" + tab);
        if (btn) {
          btn.classList.add("hidden");
          btn.classList.remove("flex");
          btn.classList.remove("active");
        }
      });

      const allViews = ['onboarding', 'checkin', 'calendar', 'approvals', 'admin'];
      allViews.forEach(v => {
        const el = document.getElementById('view-' + v);
        if (el) el.classList.add('hidden');
      });

      const onboardingEl = document.getElementById("view-onboarding");
      if (onboardingEl) onboardingEl.classList.remove("hidden");

      if (profile && profile.targetLocation) {
        currentTargetLocationName = profile.targetLocation.name;
        document.getElementById("onboardingCompanyName").innerText = profile.targetLocation.name;
        document.getElementById("onboardingCompanyAddress").innerText = profile.targetLocation.address;
        document.getElementById("onboardingCompanyBadge").innerText = profile.targetLocation.id;
        document.getElementById("joinBtnText").innerText = "確認加入 " + profile.targetLocation.name;
      } else {
        currentTargetLocationName = "門市據點 " + companyId;
        document.getElementById("onboardingCompanyName").innerText = "門市據點 " + companyId;
        document.getElementById("onboardingCompanyAddress").innerText = "門市代碼：" + companyId;
        document.getElementById("onboardingCompanyBadge").innerText = companyId;
        document.getElementById("joinBtnText").innerText = "確認加入公司考勤系統";
      }

      const joinBtn = document.getElementById("joinBtn");
      if (joinBtn) joinBtn.disabled = false;

      document.getElementById("onboardingUserName").innerText = displayName;
      const userAvatar = document.getElementById("userAvatar");
      if (userAvatar && userAvatar.src) {
        const onbAvatar = document.getElementById("onboardingUserAvatar");
        if (onbAvatar) onbAvatar.src = userAvatar.src;
      }
    }

    function showEnrolledView() {
      const tabSwitcher = document.getElementById("tabSwitcher");
      if (tabSwitcher) tabSwitcher.classList.remove("hidden");

      // Hide non-employee onboarding tab
      const navOnboarding = document.getElementById("nav-onboarding");
      if (navOnboarding) {
        navOnboarding.classList.add("hidden");
        navOnboarding.classList.remove("flex");
      }

      // Show regular employee tabs
      ['checkin', 'calendar', 'approvals'].forEach(tab => {
        const btn = document.getElementById("nav-" + tab);
        if (btn) {
          btn.classList.remove("hidden");
          btn.classList.add("flex");
        }
      });

      const navAdmin = document.getElementById("nav-admin");
      if (navAdmin) {
        if (canAccessAdminTab()) {
          navAdmin.classList.remove("hidden");
          navAdmin.classList.add("flex");
        } else {
          navAdmin.classList.add("hidden");
          navAdmin.classList.remove("flex");
        }
      }

      const onboardingEl = document.getElementById("view-onboarding");
      if (onboardingEl) onboardingEl.classList.add("hidden");
    }

    function closeSuccessModalAndGoToCheckin() {
      const modal = document.getElementById("onboardingSuccessModal");
      if (modal) modal.classList.add("hidden");
      switchView('checkin');
    }

    function handleModalFriendClick() {
      setTimeout(() => {
        closeSuccessModalAndGoToCheckin();
      }, 500);
    }

    async function handleJoinCompany() {
      const btn = document.getElementById("joinBtn");
      const btnText = document.getElementById("joinBtnText");
      const alertBox = document.getElementById("onboardingAlert");

      btn.disabled = true;
      btnText.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>入職綁定中...';
      alertBox.className = "p-3 rounded-xl text-xs hidden";

      try {
        const resp = await fetch("/api/v1/employee/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: companyId,
            lineUserId: userId,
            displayName: displayName,
            idToken: idToken
          })
        });

        const data = await resp.json();
        if (resp.ok && data.success) {
          isEnrolled = true;
          // Pre-fetch permissions and configure views
          await checkUserPermissions();
          showEnrolledView();

          // Show Onboarding Success Modal with prompt to add friend
          const locName = currentTargetLocationName || "公司考勤系統";
          const modalStore = document.getElementById("successModalStoreName");
          if (modalStore) modalStore.innerText = "已成功加入【" + locName + "】考勤系統";
          
          const successModal = document.getElementById("onboardingSuccessModal");
          if (successModal) {
            successModal.classList.remove("hidden");
          } else {
            switchView('checkin');
          }
        } else {
          alertBox.className = "p-3 rounded-xl text-xs bg-red-50 text-red-700 border border-red-200 block";
          alertBox.innerText = "⚠️ 加入失敗：" + (data.error || "未知錯誤");
          btn.disabled = false;
          btnText.innerText = "重新確認加入";
        }
      } catch (err) {
        alertBox.className = "p-3 rounded-xl text-xs bg-red-50 text-red-700 border border-red-200 block";
        alertBox.innerText = "網路連線異常：" + err.message;
        btn.disabled = false;
        btnText.innerText = "重新確認加入";
      }
    }

    // Auto re-check friendship status when user returns from LINE Add Friend screen
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !isEnrolled) {
        checkFriendshipStatus();
      }
    });
    window.addEventListener("focus", () => {
      if (!isEnrolled) {
        checkFriendshipStatus();
      }
    });

    function switchView(viewName) {
      if (!viewName) return;
      if (viewName === 'punch') viewName = 'checkin';
      if (viewName === 'schedule') viewName = 'calendar';
      if (viewName === 'approval') viewName = 'approvals';

      // Security check: non-enrolled user can only view onboarding
      if (enrollmentChecked && !isEnrolled && viewName !== 'onboarding') {
        viewName = 'onboarding';
      }

      // Security check: user without management capability cannot enter admin workbench
      if (viewName === 'admin' && !canAccessAdminTab()) {
        console.warn("User does not possess management permissions, falling back to checkin.");
        viewName = 'checkin';
      }

      currentActiveTab = viewName;

      const allViews = ['onboarding', 'checkin', 'calendar', 'approvals', 'admin'];
      allViews.forEach(v => {
        const el = document.getElementById('view-' + v);
        if (el) el.classList.add('hidden');
        const nav = document.getElementById('nav-' + v);
        if (nav) nav.classList.remove('active');
      });

      const targetView = document.getElementById('view-' + viewName);
      if (targetView) targetView.classList.remove('hidden');
      const targetNav = document.getElementById('nav-' + viewName);
      if (targetNav) targetNav.classList.add('active');

      if (viewName === 'calendar') {
        loadMonthlyAttendance();
      } else if (viewName === 'approvals') {
        initApprovalForm();
        loadMyApprovals();
      } else if (viewName === 'admin') {
        loadAdminProfile();
      }
    }

    // Initial instant switch based on URL parameter (defer admin until verified)
    const initialRequestedTab = getQueryParam("tab") || getQueryParam("view");
    if (initialRequestedTab && initialRequestedTab !== 'admin') {
      switchView(initialRequestedTab);
    }

    let checkPermPromise = null;

    async function checkUserPermissions(force = false) {
      if (checkPermPromise && !force) return checkPermPromise;
      checkPermPromise = (async () => {
        try {
          const resp = await fetch("/api/v1/employee/profile?userId=" + encodeURIComponent(userId) + "&cid=" + encodeURIComponent(companyId));
          const data = await resp.json();
          if (data.success && data.profile) {
            userPermissions = data.profile.permissions || ["punch", "apply"];
            isUserManager = !!data.profile.isManager;
            isEnrolled = !!data.profile.companyId;
            enrollmentChecked = true;

            if (data.profile.companyId) {
              companyId = data.profile.companyId;
              const dispComp = document.getElementById("displayCompanyId");
              if (dispComp) dispComp.innerText = companyId;
              const compTag = document.getElementById("companyTag");
              if (compTag) compTag.innerText = "🏢 據點：" + (data.profile.companyName || companyId);
            }
            
            const navAdmin = document.getElementById("nav-admin");
            if (navAdmin) {
              if (canAccessAdminTab()) {
                navAdmin.classList.remove("hidden");
                navAdmin.classList.add("flex");
              } else {
                navAdmin.classList.add("hidden");
                navAdmin.classList.remove("flex");
              }
            }

            // Sync with local persistent cache
            try {
              const avatar = document.getElementById("userAvatar");
              localStorage.setItem(USER_CACHE_KEY, JSON.stringify({
                userId,
                displayName,
                pictureUrl: (avatar && avatar.src) || "",
                companyId,
                companyName: data.profile.companyName || companyId,
                permissions: userPermissions,
                isManager: isUserManager,
                isEnrolled: isEnrolled
              }));
            } catch (e) {}

            return data.profile;
          }
        } catch (e) {
          console.error("Failed to check user permissions:", e);
        } finally {
          checkPermPromise = null;
        }
        return null;
      })();
      return checkPermPromise;
    }

    async function loadAdminProfile() {
      try {
        const badge = document.getElementById("adminRoleBadge");
        if (badge) {
          if (isUserManager) {
            badge.innerText = "門市店長 / 主管";
            badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700";
          } else if (canAccessAdminTab()) {
            badge.innerText = "門市維運幹部";
            badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700";
          } else {
            badge.innerText = "一般員工";
            badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700";
          }
        }

        const tags = document.getElementById("adminPermTags");
        if (tags) {
          let html = "";
          userPermissions.forEach(p => {
            html += '<span class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100 flex items-center space-x-1"><i class="fa-solid fa-check text-[10px]"></i><span>' + p + '</span></span>';
          });
          tags.innerHTML = html || '<span class="text-gray-400">尚無特殊權限</span>';
        }

        if (userPermissions.includes("set_wifi")) {
          const card = document.getElementById("cardWifiReg");
          if (card) card.classList.remove("hidden");
        }
        if (userPermissions.includes("set_location")) {
          const card = document.getElementById("cardGpsGuide");
          if (card) card.classList.remove("hidden");
        }
        if (userPermissions.includes("view_store") || userPermissions.includes("view_all")) {
          const card = document.getElementById("cardStoreAttend");
          if (card) card.classList.remove("hidden");
        }

        // Silent background update for descriptive permission labels
        checkUserPermissions().then(profile => {
          if (profile && profile.permissionLabels && tags) {
            let html = "";
            userPermissions.forEach(p => {
              const label = profile.permissionLabels[p] || p;
              html += '<span class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100 flex items-center space-x-1"><i class="fa-solid fa-check text-[10px]"></i><span>' + label + '</span></span>';
            });
            tags.innerHTML = html || '<span class="text-gray-400">尚無特殊權限</span>';
          }
        });
      } catch (e) {
        console.error("Failed to load admin profile:", e);
      }
    }

    async function registerCurrentWifiIp() {
      const btn = document.getElementById("wifiRegBtn");
      const msg = document.getElementById("wifiRegMsg");
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>登記中...';
      msg.classList.add("hidden");

      try {
        const resp = await fetch("/api/v1/tenant/locations/wifi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineUserId: userId, companyId: companyId })
        });
        const data = await resp.json();
        msg.classList.remove("hidden");
        if (resp.ok && data.success) {
          msg.className = "text-xs font-mono p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800";
          msg.innerHTML = "✅ " + data.message + "<br>最新白名單：" + data.allowedIps;
        } else {
          msg.className = "text-xs font-mono p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800";
          msg.innerText = "❌ 登記失敗：" + (data.error || "未知錯誤");
        }
      } catch (err) {
        msg.classList.remove("hidden");
        msg.className = "text-xs font-mono p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800";
        msg.innerText = "網路異常：" + err.message;
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up mr-1"></i>一鍵登記當前 Wi-Fi IP';
      }
    }

    async function sendLineCommand(text) {
      if (liff.isInClient && liff.isInClient()) {
        try {
          await liff.sendMessages([{ type: "text", text: text }]);
          liff.closeWindow();
        } catch (e) {
          alert("發送失敗，請直接在聊天室輸入「" + text + "」");
        }
      } else {
        alert("外部瀏覽器無法直接送出訊息，請回到 LINE 聊天室輸入「" + text + "」");
      }
    }

    async function initLiff() {
      // If we already have a cached userId, prefetch permissions in parallel
      if (userId && userId !== "DEMO_USER") {
        checkUserPermissions();
      }

      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          idToken = liff.getIDToken() || "";
          let decoded = null;
          try {
            decoded = liff.getDecodedIDToken();
          } catch (e) {}

          let freshUserId = "";
          let freshName = "";
          let freshPic = "";

          if (decoded && decoded.sub) {
            freshUserId = decoded.sub;
            freshName = decoded.name || displayName;
            freshPic = decoded.picture || "";
          } else {
            // Fallback to getProfile only if decoded token unavailable
            try {
              const profile = await liff.getProfile();
              freshUserId = profile.userId;
              freshName = profile.displayName;
              freshPic = profile.pictureUrl || "";
            } catch (e) {}
          }

          const userChanged = (freshUserId && userId !== freshUserId);
          if (freshUserId) userId = freshUserId;
          if (freshName) displayName = freshName;
          
          document.getElementById("userName").innerText = displayName;
          document.getElementById("userProfileTag").innerText = displayName;
          if (freshPic) {
            const avatar = document.getElementById("userAvatar");
            if (avatar) avatar.src = freshPic;
          }

          if (userChanged) {
            await checkUserPermissions(true);
          }
        } else {
          document.getElementById("userName").innerText = "LINE 訪客用戶";
          document.getElementById("userProfileTag").innerText = "訪客打卡";
        }
      } catch (err) {
        console.warn("LIFF init error:", err);
        if (!cachedProfile) {
          document.getElementById("userName").innerText = "模擬測試員工";
          document.getElementById("userProfileTag").innerText = "測試模式";
        }
      }

      const dispComp = document.getElementById("displayCompanyId");
      if (dispComp) dispComp.innerText = companyId;
      const dispDev = document.getElementById("displayDevice");
      if (dispDev) dispDev.innerText = getDeviceId().substring(0, 15) + "...";
      if (!cachedProfile) {
        const compTag = document.getElementById("companyTag");
        if (compTag) compTag.innerText = "🏢 據點：" + companyId;
      }

      // Check enrollment & manager permissions
      const empProfile = await checkUserPermissions();

      if (!empProfile || !empProfile.companyId) {
        // Newcomer: Not yet enrolled in any company
        showOnboardingView(empProfile);
        return;
      }

      // Enrolled employee: Show full regular UI
      showEnrolledView();

      // Ensure data is loaded for the requested tab with real userId
      const targetTab = getQueryParam("tab") || getQueryParam("view");
      if (targetTab === 'admin') {
        if (canAccessAdminTab()) {
          switchView('admin');
        } else {
          switchView('checkin');
        }
      } else if (targetTab) {
        switchView(targetTab);
      } else {
        switchView('checkin');
      }
    }

    let pendingCheckinCoords = null;

    function showDeviceSwitchConfirmModal(msg) {
      const modal = document.getElementById("deviceSwitchModal");
      const msgEl = document.getElementById("deviceSwitchModalMsg");
      if (msgEl && msg) {
        msgEl.innerHTML = "為防範代打卡，使用新手機打卡將<strong>解除舊設備綁定</strong>並<strong>通報人事部</strong>。";
      }
      if (modal) modal.classList.remove("hidden");
    }

    function closeDeviceSwitchModal() {
      const modal = document.getElementById("deviceSwitchModal");
      if (modal) modal.classList.add("hidden");
    }

    function cancelDeviceSwitch() {
      closeDeviceSwitchModal();
      pendingCheckinCoords = null;
      const btn = document.getElementById("checkinBtn");
      const btnText = document.getElementById("checkinBtnText");
      if (btn) btn.disabled = false;
      if (btnText) btnText.innerText = "一鍵打卡";
      const alertBox = document.getElementById("statusAlert");
      if (alertBox) {
        alertBox.className = "mt-4 p-3 rounded-xl text-xs bg-gray-50 text-gray-600 border border-gray-200 block";
        alertBox.innerText = "已取消換機打卡，舊設備維持綁定。";
      }
    }

    async function confirmAndExecuteDeviceSwitch() {
      closeDeviceSwitchModal();
      if (!pendingCheckinCoords) {
        performCheckin(true);
        return;
      }
      await submitCheckinPayload(pendingCheckinCoords.lat, pendingCheckinCoords.lon, pendingCheckinCoords.acc, true);
    }

    async function performCheckin(confirmSwitch = false) {
      const btn = document.getElementById("checkinBtn");
      const btnText = document.getElementById("checkinBtnText");
      const alertBox = document.getElementById("statusAlert");

      btn.disabled = true;
      btnText.innerText = "取得定位中...";
      alertBox.className = "mt-4 p-3 rounded-xl text-xs hidden";

      if (!navigator.geolocation) {
        showError("您的裝置不支援 GPS 地理定位。");
        return;
      }

      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const acc = pos.coords.accuracy;

        document.getElementById("displayLocation").innerText = lat.toFixed(4) + ", " + lon.toFixed(4);
        document.getElementById("displayAccuracy").innerText = "±" + Math.round(acc) + "m";

        await submitCheckinPayload(lat, lon, acc, confirmSwitch);
      }, (err) => {
        showError("GPS 定位失敗 (" + err.message + ")，請確認已授權位置權限。");
        btn.disabled = false;
        btnText.innerText = "重新打卡";
      }, { enableHighAccuracy: true, timeout: 10000 });
    }

    async function submitCheckinPayload(lat, lon, acc, confirmSwitch = false) {
      const btn = document.getElementById("checkinBtn");
      const btnText = document.getElementById("checkinBtnText");
      const alertBox = document.getElementById("statusAlert");

      btn.disabled = true;
      btnText.innerText = confirmSwitch ? "換機打卡中..." : "送出打卡中...";

      try {
        const resp = await fetch("/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken: idToken || "demo_token",
            deviceId: getDeviceId(),
            companyId: companyId,
            latitude: lat,
            longitude: lon,
            accuracy: acc,
            fallbackUserId: userId,
            fallbackDisplayName: displayName,
            confirmDeviceSwitch: confirmSwitch === true
          })
        });

        const data = await resp.json();

        // 偵測到換機且尚未二次確認：暫停並彈出防弊警訊框
        if (data.requireDeviceSwitchConfirm) {
          pendingCheckinCoords = { lat, lon, acc };
          btn.disabled = false;
          btnText.innerText = "更換設備確認中";
          showDeviceSwitchConfirmModal(data.message);
          return;
        }

        if (resp.ok && data.success) {
          pendingCheckinCoords = null;
          alertBox.className = "mt-4 p-3 rounded-xl text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 block";
          alertBox.innerHTML = \`🎉 <strong>\${data.message}</strong>\${data.deviceSwitched ? '<br><span class="text-amber-700 font-medium">📱 (已更換綁定為此新設備，已通報人事部)</span>' : ''}<br>時間：\${data.checkinTime}<br>距離：\${data.distanceMeters}m (\${data.verifyMode === 'IP_WHITELIST' ? 'Wi-Fi' : 'GPS'})\`;
          btnText.innerText = "打卡完成";
          setTimeout(() => { if (liff.isInClient()) liff.closeWindow(); }, 2000);
        } else {
          showError(data.error || "打卡失敗");
        }
      } catch (e) {
        showError("網路連線失敗：" + e.message);
      } finally {
        btn.disabled = false;
      }
    }

    function showError(msg) {
      const alertBox = document.getElementById("statusAlert");
      alertBox.className = "mt-4 p-3 rounded-xl text-xs bg-red-50 text-red-700 border border-red-200 block";
      alertBox.innerText = "⚠️ " + msg;
      document.getElementById("checkinBtnText").innerText = "重新打卡";
      document.getElementById("checkinBtn").disabled = false;
    }

    // ==================== MONTHLY CALENDAR ====================

    function changeCalendarMonth(offset) {
      let monthInput = document.getElementById("calendarMonthInput");
      if (!monthInput) return;
      let val = monthInput.value;
      if (!val) {
        const d = new Date();
        val = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      }
      const [year, month] = val.split("-").map(Number);
      const targetDate = new Date(Date.UTC(year, month - 1 + offset, 1));
      const targetYear = targetDate.getUTCFullYear();
      const targetMonth = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
      monthInput.value = targetYear + "-" + targetMonth;
      loadMonthlyAttendance();
    }

    function renderAttendanceGrid(data) {
      monthlyDataCache = data;

      // Render Metrics (4 Cards)
      const hEl = document.getElementById("statTotalHours");
      if (hEl) hEl.innerText = (data.summary.total_work_hours || 0) + "h";
      const otEl = document.getElementById("statOvertimeHours");
      if (otEl) otEl.innerText = (data.summary.overtime_hours || 0) + "h";
      const lEl = document.getElementById("statLateCount");
      if (lEl) lEl.innerText = (data.summary.late_count || 0) + " 次";
      const mEl = document.getElementById("statMissingCount");
      if (mEl) mEl.innerText = (data.summary.missing_punch_count || 0) + " 次";

      // Build Calendar Grid
      const month = data.month;
      const [year, m] = month.split("-").map(Number);
      const firstDayOfWeek = new Date(Date.UTC(year, m - 1, 1)).getUTCDay(); // 0 = Sunday
      const totalDays = new Date(year, m, 0).getDate();

      let cellsHtml = "";
      for (let i = 0; i < firstDayOfWeek; i++) {
        cellsHtml += '<div></div>';
      }

      const todayStr = (data && data.todayStr) || (new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10));

      data.days.forEach(day => {
        const dayNum = parseInt(day.date.split("-")[2], 10);
        const isToday = day.isToday || (day.date === todayStr);
        let bgClass = "bg-gray-50 border-gray-100 text-gray-700";
        let dot = "";
        let todayRing = isToday ? " ring-2 ring-emerald-500 ring-offset-1 font-bold z-10 relative" : "";

        if (day.status === "NORMAL") {
          bgClass = "bg-emerald-50 border-emerald-200 text-emerald-900";
          dot = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>';
        } else if (day.status === "LATE" || day.status === "EARLY_LEAVE" || day.status === "LATE_AND_EARLY") {
          bgClass = "bg-amber-50 border-amber-200 text-amber-900 font-bold";
          dot = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>';
        } else if (day.status === "MISSING_IN" || day.status === "MISSING_OUT" || day.status === "ABSENT") {
          bgClass = "bg-red-50 border-red-200 text-red-900 font-bold";
          dot = '<span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>';
        } else if (day.status === "OVERTIME") {
          bgClass = "bg-purple-50 border-purple-200 text-purple-900 font-bold";
          dot = '<span class="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"></span>';
        } else if (day.status === "LEAVE") {
          bgClass = "bg-amber-50 border-amber-200 text-amber-900";
          dot = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>';
        } else if (day.status === "TODAY") {
          bgClass = "bg-emerald-50/80 border-emerald-300 text-emerald-900";
          dot = '<span class="text-[9px] font-bold text-emerald-600 leading-none">今日</span>';
        } else if (day.status === "SCHEDULED") {
          bgClass = "bg-sky-50 border-sky-200 text-sky-800";
          dot = "";
        } else if (day.isRestDay) {
          bgClass = "bg-gray-100 border-gray-200 text-gray-400";
        }

        cellsHtml += \`
          <button onclick="selectDayDetail('\${day.date}')" class="h-11 rounded-xl border \${bgClass}\${todayRing} flex flex-col items-center justify-center p-1 text-xs hover:border-emerald-500 transition">
            <span class="text-[11px] leading-tight font-mono">\${dayNum}</span>
            <div class="h-2 flex items-center justify-center">\${dot}</div>
          </button>
        \`;
      });

      const grid = document.getElementById("calendarDaysGrid");
      if (grid) grid.innerHTML = cellsHtml;

      // Auto select today if in this month, otherwise first day
      const hasToday = data.days.some(d => d.date === todayStr);
      if (hasToday) {
        selectDayDetail(todayStr);
      } else if (data.days.length > 0) {
        selectDayDetail(data.days[0].date);
      }
    }

    async function loadMonthlyAttendance() {
      let monthInput = document.getElementById("calendarMonthInput");
      if (monthInput && !monthInput.value) {
        const d = new Date();
        monthInput.value = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      }
      const month = monthInput.value;
      const grid = document.getElementById("calendarDaysGrid");

      // Check SWR cache in sessionStorage
      const attCacheKey = "att_cache_" + userId + "_" + month;
      let cachedMonthData = null;
      try {
        const raw = sessionStorage.getItem(attCacheKey);
        if (raw) cachedMonthData = JSON.parse(raw);
      } catch (e) {}

      if (cachedMonthData && cachedMonthData.days) {
        renderAttendanceGrid(cachedMonthData);
      } else if (grid && (!monthlyDataCache || monthlyDataCache.month !== month)) {
        grid.innerHTML = '<div class="col-span-7 py-8 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin mr-1"></i>載入中...</div>';
      }

      if (!userId || userId === "DEMO_USER") return;

      try {
        const resp = await fetch("/api/v1/attendance/monthly?userId=" + encodeURIComponent(userId) + "&month=" + encodeURIComponent(month) + "&companyId=" + encodeURIComponent(companyId));
        const data = await resp.json();
        if (!data.success) {
          if (!cachedMonthData && grid) {
            grid.innerHTML = '<div class="col-span-7 py-6 text-center text-red-500 text-xs">載入失敗: ' + data.error + '</div>';
          }
          return;
        }

        try { sessionStorage.setItem(attCacheKey, JSON.stringify(data)); } catch (e) {}
        renderAttendanceGrid(data);
      } catch (err) {
        if (!cachedMonthData && grid) {
          grid.innerHTML = '<div class="col-span-7 py-6 text-center text-red-500 text-xs">載入錯誤: ' + err.message + '</div>';
        }
      }
    }

    function selectDayDetail(dateStr) {
      if (!monthlyDataCache || !monthlyDataCache.days) return;
      const day = monthlyDataCache.days.find(d => d.date === dateStr);
      if (!day) return;

      const card = document.getElementById("dayDetailCard");
      card.classList.remove("hidden");

      document.getElementById("detailDateText").innerText = day.date + " 出勤明細 (" + (day.shiftName || "常態班") + ")";
      
      const badge = document.getElementById("detailStatusBadge");
      badge.innerText = day.statusText;
      if (day.statusColor === "green" || day.statusColor === "emerald") badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200";
      else if (day.statusColor === "yellow" || day.statusColor === "amber") badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200";
      else if (day.statusColor === "red") badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200";
      else if (day.statusColor === "purple") badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200";
      else if (day.statusColor === "sky" || day.statusColor === "blue") badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200";
      else badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600";

      document.getElementById("detailScheduleTime").innerText = (day.shiftStart && day.shiftEnd) ? \`\${day.shiftStart} ~ \${day.shiftEnd}\` : (day.isRestDay ? "例假/休" : "-");
      let workHoursDisplay = "-";
      if (day.workHours > 0) {
        workHoursDisplay = \`\${day.workHours} 小時\`;
      } else if (day.overtimeHours > 0) {
        workHoursDisplay = \`加班 \${day.overtimeHours}h\`;
      }
      document.getElementById("detailWorkHours").innerText = workHoursDisplay;
      document.getElementById("detailFirstIn").innerText = day.firstInTime || "-";
      document.getElementById("detailLastOut").innerText = day.lastOutTime || "-";

      const leaveRow = document.getElementById("detailLeaveRow");
      const leaveHoursEl = document.getElementById("detailLeaveHours");
      if (day.leaveHours && day.leaveHours > 0) {
        if (leaveRow) {
          leaveRow.classList.remove("hidden");
          leaveRow.classList.add("flex");
        }
        if (leaveHoursEl) {
          const lType = (day.shiftName && day.shiftName.includes("請假")) ? day.shiftName : "請假";
          leaveHoursEl.innerText = \`\${day.leaveHours} 小時 (\${lType})\`;
        }
      } else {
        if (leaveRow) {
          leaveRow.classList.add("hidden");
          leaveRow.classList.remove("flex");
        }
      }

      const list = document.getElementById("detailPunchesList");
      if (day.punches && day.punches.length > 0) {
        list.innerHTML = "<strong>當日打卡流水：</strong><br>" + day.punches.map(p => {
          const t = p.punch_type === "IN" ? "🟢 上班" : "🔴 下班";
          const v = p.verify_mode === "IP_WHITELIST" ? "Wi-Fi" : "GPS";
          return '• ' + p.created_at.slice(11, 16) + ' ' + t + ' (' + v + ', ' + Math.round(p.distance_meters) + 'm)';
        }).join("<br>");
      } else {
        list.innerHTML = day.isRestDay ? "⚪ 今日為排定休假日，無打卡紀錄。" : "⚠️ 當日無打卡紀錄。";
      }
    }

    let currentApprType = "LEAVE";

    function setApprType(type) {
      currentApprType = type;
      ['LEAVE', 'CORRECTION', 'OVERTIME'].forEach(t => {
        const btn = document.getElementById('typeBtn-' + t);
        const fields = document.getElementById('fields-' + t);
        if (t === type) {
          btn.className = "py-2 px-1 rounded-xl font-bold bg-amber-50 text-amber-700 border border-amber-300 flex items-center justify-center space-x-1";
          fields.classList.remove('hidden');
        } else {
          btn.className = "py-2 px-1 rounded-xl font-medium bg-gray-50 text-gray-600 border border-gray-200 flex items-center justify-center space-x-1";
          fields.classList.add('hidden');
        }
      });
    }

    function initApprovalForm() {
      const today = new Date().toISOString().split('T')[0];
      const targetInput = document.getElementById('apprTargetDate');
      if (!targetInput.value) {
        targetInput.value = today;
      }
    }

    async function handleApprSubmit(event) {
      event.preventDefault();
      const btn = document.getElementById('apprSubmitBtn');
      const btnText = document.getElementById('apprSubmitBtnText');
      const alertBox = document.getElementById('apprAlert');

      btn.disabled = true;
      btnText.innerText = "傳送申請中...";
      alertBox.className = "p-3 rounded-xl text-xs hidden";

      const targetDate = document.getElementById('apprTargetDate').value;
      const reason = document.getElementById('apprReason').value.trim();

      let details = { reason };

      if (currentApprType === "LEAVE") {
        details.leave_type = document.getElementById('apprLeaveType').value;
        details.time_range = document.getElementById('apprLeaveTime').value;
      } else if (currentApprType === "CORRECTION") {
        details.punch_type = document.getElementById('apprCorrectionPunchType').value;
        details.time = document.getElementById('apprCorrectionTime').value;
      } else if (currentApprType === "OVERTIME") {
        details.hours = parseFloat(document.getElementById('apprOtHours').value || "1");
        details.time_range = document.getElementById('apprOtTime').value.trim();
      }

      try {
        const resp = await fetch("/api/v1/approval/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken,
            fallbackUserId: userId,
            fallbackDisplayName: displayName,
            fallbackCompanyId: companyId,
            type: currentApprType,
            targetDate,
            details
          })
        });

        const data = await resp.json();
        if (data.success) {
          alertBox.className = "p-3 rounded-xl text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center space-x-2";
          alertBox.innerHTML = '<i class="fa-solid fa-circle-check text-base text-emerald-600"></i><div><strong>申請成功！</strong>' + data.message + '</div>';
          document.getElementById('apprReason').value = "";
          loadMyApprovals();
        } else {
          alertBox.className = "p-3 rounded-xl text-xs bg-red-50 text-red-800 border border-red-200 flex items-center space-x-2";
          alertBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-base text-red-600"></i><div><strong>送出失敗：</strong>' + (data.error || "未知錯誤") + '</div>';
        }
      } catch (err) {
        alertBox.className = "p-3 rounded-xl text-xs bg-red-50 text-red-800 border border-red-200";
        alertBox.innerHTML = '網路連線異常：' + err.message;
      } finally {
        btn.disabled = false;
        btnText.innerText = "送出申請並推播主管";
      }
    }

    function renderApprovalsList(approvals) {
      const list = document.getElementById('myApprovalsList');
      if (!list) return;

      if (!approvals || approvals.length === 0) {
        list.innerHTML = '<div class="py-6 text-center text-gray-400">尚未有任何申請紀錄。</div>';
        return;
      }

      list.innerHTML = approvals.map(appr => {
        let typeLabel = "📋 申請";
        if (appr.type === "LEAVE") typeLabel = "🌴 請假";
        else if (appr.type === "CORRECTION") typeLabel = "⏰ 補卡";
        else if (appr.type === "OVERTIME") typeLabel = "🔥 加班";

        let statusBadge = "";
        if (appr.status === "APPROVED") {
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">✅ 已核准</span>';
        } else if (appr.status === "REJECTED") {
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">❌ 已駁回</span>';
        } else {
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">🟡 審核中</span>';
        }

        let detailsObj = {};
        try { detailsObj = JSON.parse(appr.details || "{}"); } catch (e) {}
        const note = detailsObj.reason ? ('<div class="text-[11px] text-gray-500 mt-1">事由：' + detailsObj.reason + '</div>') : '';

        return '<div class="bg-gray-50 p-3 rounded-2xl border border-gray-100 space-y-1">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-bold text-gray-800">' + typeLabel + ' - ' + appr.target_date + '</span>' +
            statusBadge +
          '</div>' +
          note +
          '<div class="text-[10px] text-gray-400 flex justify-between pt-1 border-t border-gray-200/50">' +
            '<span>單號：' + appr.id.substring(0, 12) + '...</span>' +
            '<span>' + appr.created_at + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function loadMyApprovals() {
      const list = document.getElementById('myApprovalsList');
      if (!list) return;

      const cacheKey = "appr_cache_" + userId;
      let cachedAppr = null;
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) cachedAppr = JSON.parse(raw);
      } catch (e) {}

      if (cachedAppr && cachedAppr.length > 0) {
        renderApprovalsList(cachedAppr);
      } else {
        list.innerHTML = '<div class="py-4 text-center text-gray-400">載入中...</div>';
      }

      if (!userId || userId === "DEMO_USER") return;

      try {
        const resp = await fetch('/api/v1/approval/my?userId=' + encodeURIComponent(userId));
        const data = await resp.json();

        if (!data.success || !data.approvals || data.approvals.length === 0) {
          list.innerHTML = '<div class="py-6 text-center text-gray-400">尚未有任何申請紀錄。</div>';
          try { sessionStorage.removeItem(cacheKey); } catch (e) {}
          return;
        }

        try { sessionStorage.setItem(cacheKey, JSON.stringify(data.approvals)); } catch (e) {}
        renderApprovalsList(data.approvals);
      } catch (err) {
        if (!cachedAppr) {
          list.innerHTML = '<div class="py-4 text-center text-red-500">載入失敗: ' + err.message + '</div>';
        }
      }
    }

    // ==================== SWIPE GESTURE TAB SWITCHING ====================
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    function initSwipeGestures() {
      const mainContainer = document.querySelector('main') || document.body;

      mainContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
      }, { passive: true });

      mainContainer.addEventListener('touchend', (e) => {
        if (e.changedTouches.length !== 1) return;
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        const duration = Date.now() - touchStartTime;

        // Condition: Fast enough (<600ms), horizontal distance >= 50px, predominantly horizontal (|deltaX| > |deltaY| * 1.3)
        if (duration < 600 && Math.abs(deltaX) >= 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
          const target = e.target;
          if (target) {
            const tag = target.tagName ? target.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
              return;
            }
          }

          const tabs = getAvailableTabs();
          const currentIndex = tabs.indexOf(currentActiveTab);
          if (currentIndex === -1) return;

          if (deltaX < -50 && currentIndex < tabs.length - 1) {
            // Swipe Left -> Next Tab (e.g. checkin -> calendar -> approvals -> admin)
            switchView(tabs[currentIndex + 1]);
          } else if (deltaX > 50 && currentIndex > 0) {
            // Swipe Right -> Prev Tab (e.g. admin -> approvals -> calendar -> checkin)
            switchView(tabs[currentIndex - 1]);
          }
        }
      }, { passive: true });
    }

    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", () => {
        initLiff();
        initSwipeGestures();
      });
    } else {
      initLiff();
      initSwipeGestures();
    }
  </script>
</body>
</html>`;
}
