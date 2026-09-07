/**
 * LIFF Mobile Portal Modals (OnboardingSuccessModal & DeviceSwitchModal)
 */
export function renderLiffModals(): string {
  return `    <!-- 入職成功 & 強引導加好友彈窗 Modal -->
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

`;
}
