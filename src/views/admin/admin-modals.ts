/**
 * Admin Portal Modals (CreateKey, ShowKey, Location, AssignApprover, PBAC Permissions)
 */
export function renderAdminModals(): string {
  return `
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
          <div class="flex items-center space-x-3">
            <div id="locModalQrLinkContainer" class="hidden">
              <a id="locModalQrLink" href="#" target="_blank" class="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center space-x-1">
                <i class="fa-solid fa-qrcode"></i>
                <span>列印立牌 QR Code</span>
              </a>
            </div>
            <button type="button" id="locDeleteBtn" onclick="handleDeleteCurrentLocation()" class="hidden text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-xl font-semibold flex items-center space-x-1 transition border border-rose-200">
              <i class="fa-solid fa-trash-can"></i>
              <span>刪除據點</span>
            </button>
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

  <!-- MODAL: 發布企業公告 (Compose Announcement) -->
  <div id="announcementModal" class="hidden fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-gray-100">
      <div class="flex items-center justify-between border-b border-gray-100 pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <i class="fa-solid fa-bullhorn text-sm"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold text-gray-900">發布企業重要公告</h3>
            <p class="text-[11px] text-gray-500">透過 LINE 多播發送至全體在職員工聊天室並追蹤簽收</p>
          </div>
        </div>
        <button onclick="closeAnnouncementModal()" class="text-gray-400 hover:text-gray-600 text-sm p-1.5 rounded-lg hover:bg-gray-50 transition">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <form id="announcementForm" onsubmit="handleCreateAnnouncement(event)" class="space-y-3.5">
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">公告標題 <span class="text-red-500">*</span></label>
          <input type="text" id="announcementTitle" required placeholder="例如：2026 中秋連假營運排班與出勤規範公告" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none transition">
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">發布單位 / 署名</label>
          <input type="text" id="announcementAuthor" placeholder="例如：公司人事行政部、總經理室" value="公司人事行政部" class="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none transition">
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">公告完整內文 <span class="text-red-500">*</span></label>
          <textarea id="announcementContent" required rows="5" placeholder="請輸入欲佈達之公告內文詳細說明..." class="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none transition leading-relaxed"></textarea>
        </div>

        <div class="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-[11px] space-y-1">
          <p class="font-semibold flex items-center"><i class="fa-solid fa-circle-info mr-1 text-xs"></i> 系統安全多播提示：</p>
          <p>此功能將以 LINE Messaging API Multicast（非全域廣播）精準發送至本店所有合法同仁，同仁卡片內嵌【✍️ 我已閱讀並簽收】按鈕，簽收紀錄將即時回傳於後台。</p>
        </div>

        <div class="flex justify-end space-x-2 pt-3 border-t border-gray-100">
          <button type="button" onclick="closeAnnouncementModal()" class="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-xl transition">取消</button>
          <button type="submit" id="announcementSubmitBtn" class="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow transition flex items-center space-x-1.5">
            <i class="fa-solid fa-paper-plane text-xs"></i>
            <span>確認發布並多播</span>
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: 公告簽收進度與名單明細 (Announcement Reads Detail) -->
  <div id="announcementReadsModal" class="hidden fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 border border-gray-100">
      <div class="flex items-center justify-between border-b border-gray-100 pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <i class="fa-solid fa-users-viewfinder text-sm"></i>
          </div>
          <div>
            <h3 id="readsModalTitle" class="text-sm font-bold text-gray-900">公告簽收進度追蹤</h3>
            <p id="readsModalSubtitle" class="text-[11px] text-gray-500">載入中...</p>
          </div>
        </div>
        <button onclick="closeAnnouncementReadsModal()" class="text-gray-400 hover:text-gray-600 text-sm p-1.5 rounded-lg hover:bg-gray-50 transition">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- KPI Stat Cards -->
      <div class="grid grid-cols-4 gap-3 text-center">
        <div class="p-3 bg-gray-50 rounded-2xl border border-gray-100">
          <span class="text-[11px] text-gray-400 block font-medium">總應收人數</span>
          <span id="statTotal" class="text-base font-bold text-gray-800">0</span>
        </div>
        <div class="p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
          <span class="text-[11px] text-emerald-600 block font-medium">已簽收同仁</span>
          <span id="statRead" class="text-base font-bold text-emerald-700">0</span>
        </div>
        <div class="p-3 bg-amber-50 rounded-2xl border border-amber-100">
          <span class="text-[11px] text-amber-600 block font-medium">尚未簽收</span>
          <span id="statUnread" class="text-base font-bold text-amber-700">0</span>
        </div>
        <div class="p-3 bg-blue-50 rounded-2xl border border-blue-100">
          <span class="text-[11px] text-blue-600 block font-medium">簽收完成率</span>
          <span id="statRate" class="text-base font-bold text-blue-700">0%</span>
        </div>
      </div>

      <!-- Detail Lists (Tabs or Split View) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <!-- Signed List -->
        <div class="space-y-2 border border-gray-100 rounded-2xl p-3.5 bg-emerald-50/20">
          <div class="flex items-center justify-between pb-1.5 border-b border-emerald-100">
            <span class="font-bold text-emerald-800 flex items-center space-x-1">
              <i class="fa-solid fa-circle-check text-emerald-600 text-xs"></i>
              <span>已簽收同仁</span>
            </span>
            <span id="signedBadge" class="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">0 人</span>
          </div>
          <div id="signedList" class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            <p class="text-gray-400 text-center py-4">無資料</p>
          </div>
        </div>

        <!-- Unsigned List -->
        <div class="space-y-2 border border-gray-100 rounded-2xl p-3.5 bg-amber-50/20">
          <div class="flex items-center justify-between pb-1.5 border-b border-amber-100">
            <span class="font-bold text-amber-800 flex items-center space-x-1">
              <i class="fa-solid fa-clock text-amber-600 text-xs"></i>
              <span>尚未簽收同仁</span>
            </span>
            <span id="unsignedBadge" class="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">0 人</span>
          </div>
          <div id="unsignedList" class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            <p class="text-gray-400 text-center py-4">無資料</p>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="flex items-center justify-between pt-3 border-t border-gray-100">
        <button id="modalRemindBtn" onclick="remindUnreadFromModal()" class="px-4 py-2 text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl shadow transition flex items-center space-x-1.5">
          <i class="fa-solid fa-bell text-xs"></i>
          <span>一鍵催簽未簽收同仁</span>
        </button>
        <button type="button" onclick="closeAnnouncementReadsModal()" class="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-xl transition">關閉</button>
      </div>
    </div>
  </div>
`;
}
