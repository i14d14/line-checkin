/**
 * Admin Portal Tabs (Locations, Schedules, Records, Devices, API Keys, Approvals)
 */
export function renderAdminTabs(): string {
  return `      
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
              <button onclick="generateFixedSchedules()" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center space-x-1.5" title="為所有固定班 (FIXED) 同仁一鍵建立該月份平日常態班與週末例假">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span>一鍵生成固定班排班</span>
              </button>
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

      <!-- TAB 7: 企業公告與多播簽收管理 -->
      <section id="tab-announcements" class="space-y-6 hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h2 class="text-base font-bold text-gray-900">企業公告發布與 LINE 多播簽收管理</h2>
            <p class="text-xs text-gray-500 mt-0.5">發布營運公告至全體在職員工 LINE 聊天室，即時追蹤同仁閱讀與簽收進度，支援一鍵催簽。</p>
          </div>
          <button onclick="openAnnouncementModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow transition flex items-center justify-center space-x-2">
            <i class="fa-solid fa-bullhorn"></i>
            <span>發布新公告</span>
          </button>
        </div>

        <!-- Announcements Table -->
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left">
              <thead class="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                <tr>
                  <th class="px-4 py-3">發布時間</th>
                  <th class="px-4 py-3">公告標題</th>
                  <th class="px-4 py-3">發布單位 / 署名</th>
                  <th class="px-4 py-3">簽收率與進度</th>
                  <th class="px-4 py-3 text-right">操作與催簽</th>
                </tr>
              </thead>
              <tbody id="announcementsTableBody" class="divide-y divide-gray-100">
                <tr>
                  <td colspan="5" class="text-center py-8 text-gray-400">載入公告資料中...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 8: 電子薪資條管理與 LINE 隱私推播 -->
      <section id="tab-payslips" class="space-y-6 hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h2 class="text-base font-bold text-gray-900">💰 個人電子薪資條批次發送 (E-Payslips)</h2>
            <p class="text-xs text-gray-500 mt-0.5">企業地端計薪 ✕ LINE 私密一對一推播：手機鎖定螢幕推播通知 100% 遮罩所有金額，保障同仁薪資隱私。</p>
          </div>
          <div class="flex items-center space-x-2">
            <button onclick="downloadPayslipTemplate()" class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2.5 rounded-xl transition flex items-center space-x-1.5">
              <i class="fa-solid fa-download"></i>
              <span>下載 CSV 範本</span>
            </button>
            <label class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5 cursor-pointer">
              <i class="fa-solid fa-file-csv"></i>
              <span>選擇薪資 CSV 檔案</span>
              <input type="file" id="payslipFileInput" accept=".csv" class="hidden" onchange="handlePayslipCsvSelect(event)">
            </label>
          </div>
        </div>

        <!-- Privacy & Security Notice Banner -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 flex items-start space-x-3">
            <div class="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
              <i class="fa-solid fa-mobile-screen-button text-sm"></i>
            </div>
            <div>
              <h3 class="text-xs font-bold text-emerald-900">鎖定螢幕零洩漏</h3>
              <p class="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">LINE 推播預覽文字完全遮罩任何薪資數字，僅在同仁親自點入聊天室後呈現完整明細。</p>
            </div>
          </div>
          <div class="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 flex items-start space-x-3">
            <div class="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
              <i class="fa-solid fa-shield-halved text-sm"></i>
            </div>
            <div>
              <h3 class="text-xs font-bold text-blue-900">跨租戶隔離防呆</h3>
              <p class="text-[11px] text-blue-700 mt-0.5 leading-relaxed">系統嚴格檢查每列 LINE ID 是否屬於本企業在職員工名冊，絕不發生跨企業誤發。</p>
            </div>
          </div>
          <div class="bg-amber-50/70 border border-amber-100 rounded-2xl p-4 flex items-start space-x-3">
            <div class="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
              <i class="fa-solid fa-cloud-arrow-up text-sm"></i>
            </div>
            <div>
              <h3 class="text-xs font-bold text-amber-900">雲端零薪資留存</h3>
              <p class="text-[11px] text-amber-700 mt-0.5 leading-relaxed">資料採即時推送，雲端資料庫不留存任何員工薪資金額數字，發送後僅留存資安稽核紀錄。</p>
            </div>
          </div>
        </div>

        <!-- Initial Placeholder State (Shown when no CSV is loaded) -->
        <div id="payslipEmptyPlaceholder" class="bg-white rounded-2xl border border-gray-200 p-12 text-center space-y-3">
          <div class="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 mx-auto">
            <i class="fa-solid fa-file-invoice-dollar text-2xl"></i>
          </div>
          <h3 class="text-sm font-bold text-gray-700">尚未載入薪資 CSV 檔案</h3>
          <p class="text-xs text-gray-500 max-w-md mx-auto">
            請點擊上方【下載 CSV 範本】依欄位格式填入本月薪資數據（包含底薪、津貼、加班費、扣款與實發金額），再點擊【選擇薪資 CSV 檔案】進行預覽與發送。
          </p>
        </div>

        <!-- CSV Preview & Verification Area (Hidden by default) -->
        <div id="payslipPreviewArea" class="hidden space-y-6">
          <!-- Summary Metrics & Action Bar -->
          <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div class="grid grid-cols-3 gap-4 w-full sm:w-auto">
                <div class="bg-gray-50 rounded-xl p-3 border border-gray-100 min-w-[120px]">
                  <p class="text-[11px] text-gray-500 font-medium">發送名單人數</p>
                  <p id="previewTotalEmployees" class="text-base font-bold text-gray-900 font-mono mt-0.5">0 人</p>
                </div>
                <div class="bg-emerald-50 rounded-xl p-3 border border-emerald-100 min-w-[140px]">
                  <p class="text-[11px] text-emerald-700 font-medium">實發薪資總計</p>
                  <p id="previewTotalPayout" class="text-base font-bold text-emerald-700 font-mono mt-0.5">$0</p>
                </div>
                <div class="bg-blue-50 rounded-xl p-3 border border-blue-100 min-w-[120px]">
                  <p class="text-[11px] text-blue-700 font-medium">欄位檢核狀態</p>
                  <p id="previewValidationBadge" class="text-xs font-bold text-emerald-600 mt-1">檢驗通過</p>
                </div>
              </div>

              <div class="flex items-center space-x-3">
                <button onclick="resetPayslipUpload()" class="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg border border-gray-200 transition">
                  取消重選
                </button>
                <button id="btnDispatchPayslips" onclick="confirmDispatchPayslips()" class="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center space-x-2">
                  <i class="fa-solid fa-paper-plane text-xs"></i>
                  <span>【🚀 確認批次發送至 LINE】</span>
                </button>
              </div>
            </div>

            <!-- Error Notice Box (if any rows have issues) -->
            <div id="previewErrorAlert" class="hidden p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs space-y-1">
              <div class="font-bold flex items-center space-x-1.5">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>發現資料異常，請修正後重新上傳：</span>
              </div>
              <ul id="previewErrorList" class="list-disc pl-5 text-[11px] space-y-0.5 text-red-600 font-mono"></ul>
            </div>
          </div>

          <!-- Preview Table -->
          <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div class="px-5 py-3.5 bg-gray-50/70 border-b border-gray-200 flex items-center justify-between">
              <h3 class="text-xs font-bold text-gray-700">待發送薪資明細預覽 (<span id="previewRowCount">0</span> 筆)</h3>
              <span class="text-[11px] text-gray-400">所有金額均以新台幣 (NTD) 計算顯示</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs text-left">
                <thead class="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                  <tr>
                    <th class="px-4 py-3">狀態</th>
                    <th class="px-4 py-3">員工姓名</th>
                    <th class="px-4 py-3">LINE User ID</th>
                    <th class="px-4 py-3">計薪月份</th>
                    <th class="px-4 py-3 text-right">底薪</th>
                    <th class="px-4 py-3 text-right">津貼加給</th>
                    <th class="px-4 py-3 text-right">加班津貼</th>
                    <th class="px-4 py-3 text-right">應扣項目</th>
                    <th class="px-4 py-3 text-right text-emerald-700">實發金額</th>
                    <th class="px-4 py-3">備註</th>
                  </tr>
                </thead>
                <tbody id="payslipsTableBody" class="divide-y divide-gray-100 font-mono">
                  <tr>
                    <td colspan="10" class="text-center py-8 text-gray-400 font-sans">無資料</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
`;
}

