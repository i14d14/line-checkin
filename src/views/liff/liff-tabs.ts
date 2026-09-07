/**
 * LIFF Mobile Portal Tabs (Onboarding, Checkin, Calendar, Approvals, Admin)
 */
export function renderLiffTabs(currentMonthStr: string): string {
  return `    
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

          <!-- Attachment Photo Upload (Universal for LEAVE, CORRECTION, OVERTIME) -->
          <div class="space-y-1.5">
            <label class="block text-[11px] font-semibold text-gray-600">
              <i class="fa-solid fa-paperclip text-emerald-600 mr-1"></i>佐證照片 / 附件 (<span class="text-gray-400 font-normal">選填</span>)
            </label>
            <div class="relative">
              <input type="file" id="apprProof" accept="image/*" capture="environment" class="hidden" onchange="handleApprProofSelected(event)">
              <div id="apprProofDropzone" onclick="document.getElementById('apprProof').click()" class="border-2 border-dashed border-gray-200 hover:border-emerald-400 rounded-2xl p-3 text-center cursor-pointer transition bg-gray-50/50 hover:bg-emerald-50/30">
                <div id="apprProofEmptyState" class="flex items-center justify-center space-x-2 text-gray-500 py-1">
                  <i class="fa-solid fa-camera text-base text-emerald-500"></i>
                  <span class="text-xs font-medium">拍照或選擇照片上傳 (選填，上限 5MB)</span>
                </div>
                <div id="apprProofPreviewState" class="hidden flex items-center justify-between">
                  <div class="flex items-center space-x-2 truncate">
                    <img id="apprProofThumbnail" class="w-10 h-10 object-cover rounded-lg border border-gray-200" src="" alt="證明縮圖">
                    <div class="text-left truncate">
                      <div id="apprProofFilename" class="text-xs font-semibold text-gray-800 truncate">proof.jpg</div>
                      <div id="apprProofFilesize" class="text-[10px] text-gray-400">0 KB</div>
                    </div>
                  </div>
                  <button type="button" onclick="removeApprProof(event)" class="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition text-xs flex items-center space-x-1">
                    <i class="fa-solid fa-trash-can"></i>
                    <span>移除</span>
                  </button>
                </div>
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
            <span id="apprSubmitBtnText">送出申請</span>
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
            <span>門市 Wi-Fi 雙棧白名單登記</span>
          </h2>
          <span class="text-[10px] text-gray-400 font-mono">set_wifi</span>
        </div>
        <p class="text-xs text-gray-500">連上門市 Wi-Fi 後，點擊下方按鈕將自動探測雙棧（IPv4 + IPv6）對外 IP，並自動收斂為門市 /64 網段登記，全員在店內即可免開 GPS 直通打卡。</p>
        
        <!-- Detected Network Info Box -->
        <div id="wifiDetectBox" class="bg-gray-50 rounded-2xl p-3 border border-gray-100 space-y-2 text-xs font-mono">
          <div class="flex justify-between items-center text-gray-600">
            <span class="flex items-center space-x-1"><span>🌐</span><span>當前探測 IPv4：</span></span>
            <span id="detectedIpv4" class="font-semibold text-gray-900">探測中...</span>
          </div>
          <div class="flex justify-between items-center text-gray-600">
            <span class="flex items-center space-x-1"><span>🌐</span><span>當前探測 IPv6：</span></span>
            <span id="detectedIpv6" class="font-semibold text-gray-900">探測中...</span>
          </div>
          <div class="pt-1.5 border-t border-gray-200/60 flex justify-between items-start text-[11px] text-gray-500">
            <span class="whitespace-nowrap">📋 門市現有白名單：</span>
            <span id="currentAllowedIps" class="font-semibold text-indigo-600 text-right break-all ml-2">載入中...</span>
          </div>
        </div>

        <button onclick="registerCurrentWifiIp()" id="wifiRegBtn" class="w-full py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-2xl border border-emerald-200 text-xs transition flex items-center justify-center space-x-2">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span>一鍵登記當前 Wi-Fi IP (雙棧 IPv4 + IPv6)</span>
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
`;
}
