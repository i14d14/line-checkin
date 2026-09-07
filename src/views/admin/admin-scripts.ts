/**
 * Admin Portal Client-Side JavaScript Logic
 */
export function renderAdminScripts(): string {
  return `
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
        localStorage.setItem("admin_session_token", data.token);
        localStorage.setItem("admin_user_info", JSON.stringify(data.user));

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
      ['locations', 'schedules', 'records', 'devices', 'apikeys', 'approvals', 'announcements', 'payslips'].forEach(function(id) {
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
      if (tabId === 'announcements') fetchAnnouncements();
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

        return '<div data-id="' + l.id + '" onclick="openEditLocationModal(this.dataset.id)" class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-emerald-500 transition flex flex-col justify-between cursor-pointer group relative">' +
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
            '<button type="button" data-id="' + l.id + '" onclick="openEditLocationModal(this.dataset.id)" class="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl font-semibold flex items-center space-x-1.5 transition shadow-sm">' +
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
      const delBtn = document.getElementById('locDeleteBtn');
      if (delBtn) delBtn.classList.add('hidden');
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

      const delBtn = document.getElementById('locDeleteBtn');
      if (delBtn) {
        if (loc.id.endsWith('-01') || (currentUser && loc.id === currentUser.taxId)) {
          delBtn.classList.add('hidden');
        } else {
          delBtn.classList.remove('hidden');
        }
      }

      document.getElementById('locSubmitBtn').innerText = '儲存變更';
      document.getElementById('locModal').classList.remove('hidden');
    }

    async function handleDeleteCurrentLocation() {
      const idEl = document.getElementById('locId');
      const nameEl = document.getElementById('locName');
      const locId = idEl ? idEl.value.trim() : '';
      const locName = nameEl ? nameEl.value.trim() : locId;
      if (!locId) return;

      if (locId.endsWith('-01')) {
        alert('企業總部主要據點不可刪除。');
        return;
      }

      if (!confirm('確定要刪除門市據點【' + locName + '】(' + locId + ') 嗎？\\\\n\\\\n⚠️ 注意：若該門市尚有在職員工綁定，將會被系統阻擋。此操作無法復原。')) {
        return;
      }

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/locations/' + encodeURIComponent(locId), {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await resp.json();
        if (data.success) {
          alert('✅ ' + (data.message || '門市據點已成功刪除！'));
          closeLocationModal();
          fetchLocations();
        } else {
          alert('❌ 刪除失敗：' + (data.error || '未知錯誤'));
        }
      } catch (err) {
        alert('伺服器連線異常：' + err.message);
      }
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
          else if (a.status === 'REJECTED') statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">已駁回</span>';
          else statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">🟡 審核中</span>';

          let detailsObj = {};
          try { detailsObj = JSON.parse(a.details || '{}'); } catch (e) {}
          let detailStr = '';
          if (a.type === 'LEAVE') detailStr = (detailsObj.leave_type || '') + ' ' + (detailsObj.time_range || '');
          else if (a.type === 'CORRECTION') detailStr = (detailsObj.punch_type === 'OUT' ? '下班卡 ' : '上班卡 ') + (detailsObj.time || '');
          else if (a.type === 'OVERTIME') detailStr = (detailsObj.hours ? detailsObj.hours + '小時 ' : '') + (detailsObj.time_range || '');
          if (detailsObj.reason) detailStr += ' (' + detailsObj.reason + ')';
          if (detailsObj.reject_reason) detailStr += ' [駁回: ' + detailsObj.reject_reason + ']';
          if (detailsObj.attachment_url) detailStr += ' <a href="' + detailsObj.attachment_url + '" target="_blank" class="text-blue-600 hover:underline font-semibold ml-1">📎 附件</a>';

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

    // ==================== 7. ANNOUNCEMENTS & MULTICAST READ RECEIPTS ====================
    let currentViewingAnnouncementId = null;

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    async function fetchAnnouncements() {
      const tbody = document.getElementById('announcementsTableBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">載入公告資料中...</td></tr>';

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/announcements', { headers: getAuthHeaders() });
        if (resp.status === 401 || resp.status === 403) {
          showLoginView();
          return;
        }

        const data = await resp.json();
        const announcements = data.announcements || [];

        if (announcements.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">目前尚無已發布之企業公告。點擊上方按鈕發布第一則公告。</td></tr>';
          return;
        }

        tbody.innerHTML = announcements.map(function(a) {
          const total = a.total_recipients || 0;
          const read = a.read_count || 0;
          const rate = a.read_rate !== undefined ? a.read_rate : (total > 0 ? Math.round((read / total) * 100) : 0);
          
          let rateColor = 'text-gray-500 bg-gray-100';
          let progressBg = 'bg-gray-300';
          if (rate >= 80) {
            rateColor = 'text-emerald-700 bg-emerald-50 border border-emerald-200';
            progressBg = 'bg-emerald-500';
          } else if (rate >= 50) {
            rateColor = 'text-blue-700 bg-blue-50 border border-blue-200';
            progressBg = 'bg-blue-500';
          } else if (rate > 0) {
            rateColor = 'text-amber-700 bg-amber-50 border border-amber-200';
            progressBg = 'bg-amber-500';
          }

          return '<tr class="hover:bg-gray-50 transition">' +
            '<td class="px-4 py-3 font-mono text-gray-500 text-xs whitespace-nowrap">' + (a.created_at || '').substring(0, 16) + '</td>' +
            '<td class="px-4 py-3 text-gray-900 max-w-xs">' +
              '<div class="truncate font-bold">' + escapeHtml(a.title) + '</div>' +
              '<div class="text-[11px] text-gray-400 truncate mt-0.5">' + escapeHtml(a.content) + '</div>' +
            '</td>' +
            '<td class="px-4 py-3 text-gray-600 font-medium whitespace-nowrap">' + escapeHtml(a.author_name || '人事行政部') + '</td>' +
            '<td class="px-4 py-3 whitespace-nowrap">' +
              '<div class="flex items-center space-x-2">' +
                '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ' + rateColor + '">簽收率 ' + read + '/' + total + ' (' + rate + '%)</span>' +
              '</div>' +
              '<div class="w-28 bg-gray-100 rounded-full h-1.5 mt-1.5 overflow-hidden">' +
                '<div class="' + progressBg + ' h-1.5 rounded-full" style="width: ' + rate + '%"></div>' +
              '</div>' +
            '</td>' +
            '<td class="px-4 py-3 text-right whitespace-nowrap space-x-1.5">' +
              '<button data-id="' + a.id + '" onclick="viewAnnouncementReads(this.dataset.id)" class="px-2.5 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg transition inline-flex items-center space-x-1">' +
                '<i class="fa-solid fa-users text-[10px]"></i>' +
                '<span>名單</span>' +
              '</button>' +
              '<button data-id="' + a.id + '" onclick="remindUnread(this.dataset.id)" class="px-2.5 py-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold rounded-lg transition inline-flex items-center space-x-1">' +
                '<i class="fa-solid fa-bell text-[10px]"></i>' +
                '<span>一鍵催簽</span>' +
              '</button>' +
            '</td>' +
          '</tr>';
        }).join('');

      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-500">載入異常：' + err.message + '</td></tr>';
      }
    }

    function openAnnouncementModal() {
      const modal = document.getElementById('announcementModal');
      if (modal) {
        document.getElementById('announcementForm').reset();
        document.getElementById('announcementAuthor').value = '公司人事行政部';
        modal.classList.remove('hidden');
      }
    }

    function closeAnnouncementModal() {
      const modal = document.getElementById('announcementModal');
      if (modal) modal.classList.add('hidden');
    }

    async function handleCreateAnnouncement(e) {
      e.preventDefault();
      const title = document.getElementById('announcementTitle').value.trim();
      const author = document.getElementById('announcementAuthor').value.trim();
      const content = document.getElementById('announcementContent').value.trim();
      const submitBtn = document.getElementById('announcementSubmitBtn');

      if (!title || !content) {
        alert('請填寫完整公告標題與內容');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>多播發送中...';

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/announcements', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            title: title,
            authorName: author,
            content: content
          })
        });

        const data = await resp.json();
        if (!resp.ok || !data.success) {
          alert('發布失敗：' + (data.error || '未知錯誤'));
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane text-xs mr-1"></i>確認發布並多播';
          return;
        }

        alert('🎉 公告發布成功！已透過 LINE 多播推播給 ' + (data.recipientsCount || 0) + ' 位在職同仁。');
        closeAnnouncementModal();
        fetchAnnouncements();
      } catch (err) {
        alert('發布連線異常：' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane text-xs mr-1"></i>確認發布並多播';
      }
    }

    async function viewAnnouncementReads(id) {
      currentViewingAnnouncementId = id;
      const modal = document.getElementById('announcementReadsModal');
      if (!modal) return;

      modal.classList.remove('hidden');
      document.getElementById('readsModalSubtitle').innerText = '載入名單與統計中...';
      document.getElementById('signedList').innerHTML = '<p class="text-gray-400 text-center py-4">載入中...</p>';
      document.getElementById('unsignedList').innerHTML = '<p class="text-gray-400 text-center py-4">載入中...</p>';

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/announcements/' + id, { headers: getAuthHeaders() });
        if (!resp.ok) {
          const errData = await resp.json();
          alert('載入明細失敗：' + (errData.error || '無權限'));
          closeAnnouncementReadsModal();
          return;
        }

        const data = await resp.json();
        const ann = data.announcement || {};
        const stats = data.stats || { total: 0, read: 0, unread: 0, readRate: 0 };
        const reads = data.reads || [];
        const unreads = data.unreads || [];

        document.getElementById('readsModalTitle').innerText = ann.title || '公告簽收進度';
        document.getElementById('readsModalSubtitle').innerText = '發布單位：' + (ann.author_name || '人事行政部') + ' | ' + (ann.created_at || '').substring(0, 16);

        document.getElementById('statTotal').innerText = stats.total;
        document.getElementById('statRead').innerText = stats.read;
        document.getElementById('statUnread').innerText = stats.unread;
        document.getElementById('statRate').innerText = stats.readRate + '%';

        document.getElementById('signedBadge').innerText = stats.read + ' 人';
        document.getElementById('unsignedBadge').innerText = stats.unread + ' 人';

        // Render signed list
        if (reads.length === 0) {
          document.getElementById('signedList').innerHTML = '<p class="text-gray-400 text-center py-4">尚無同仁完成簽收</p>';
        } else {
          document.getElementById('signedList').innerHTML = reads.map(function(r) {
            return '<div class="flex items-center justify-between p-2 bg-white rounded-xl border border-emerald-100 text-xs">' +
              '<div>' +
                '<span class="font-bold text-gray-800">' + escapeHtml(r.employee_name || '員工') + '</span>' +
                '<span class="text-[10px] text-gray-400 block font-mono">' + (r.line_user_id ? r.line_user_id.substring(0, 12) + '...' : '') + '</span>' +
              '</div>' +
              '<span class="text-[11px] font-mono text-emerald-700 font-semibold">' + (r.read_at || '').substring(5, 16) + '</span>' +
            '</div>';
          }).join('');
        }

        // Render unsigned list
        if (unreads.length === 0) {
          document.getElementById('unsignedList').innerHTML = '<p class="text-emerald-600 font-bold text-center py-4">🎉 全體同仁皆已完成簽收！</p>';
        } else {
          document.getElementById('unsignedList').innerHTML = unreads.map(function(u) {
            return '<div class="flex items-center justify-between p-2 bg-white rounded-xl border border-amber-100 text-xs">' +
              '<div>' +
                '<span class="font-bold text-gray-800">' + escapeHtml(u.employee_name || '員工') + '</span>' +
                '<span class="text-[10px] text-gray-400 block font-mono">' + (u.line_user_id ? u.line_user_id.substring(0, 12) + '...' : '') + '</span>' +
              '</div>' +
              '<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">尚未簽收</span>' +
            '</div>';
          }).join('');
        }

      } catch (err) {
        alert('載入名單異常：' + err.message);
      }
    }

    function closeAnnouncementReadsModal() {
      currentViewingAnnouncementId = null;
      const modal = document.getElementById('announcementReadsModal');
      if (modal) modal.classList.add('hidden');
    }

    async function remindUnread(id) {
      if (!confirm('確定要向尚未簽收此公告的同仁發送 LINE 催簽提醒嗎？')) {
        return;
      }

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/announcements/' + id + '/remind', {
          method: 'POST',
          headers: getAuthHeaders()
        });

        const data = await resp.json();
        if (!resp.ok || !data.success) {
          alert('催簽失敗：' + (data.error || '未知錯誤'));
          return;
        }

        alert('🔔 ' + (data.message || ('已成功催簽 ' + data.remindedCount + ' 位同仁')));
        fetchAnnouncements();
        if (currentViewingAnnouncementId === id) {
          viewAnnouncementReads(id);
        }
      } catch (err) {
        alert('催簽連線異常：' + err.message);
      }
    }

    function remindUnreadFromModal() {
      if (currentViewingAnnouncementId) {
        remindUnread(currentViewingAnnouncementId);
      }
    }

    // ==================== 8. PAYSLIPS (E-PAYSLIPS) ====================
    let selectedPayslips = [];

    function downloadPayslipTemplate() {
      window.open(API_BASE + '/api/v1/tenant/payslips/template', '_blank');
    }

    function resetPayslipUpload() {
      selectedPayslips = [];
      const fileInput = document.getElementById('payslipFileInput');
      if (fileInput) fileInput.value = '';
      const previewArea = document.getElementById('payslipPreviewArea');
      if (previewArea) previewArea.classList.add('hidden');
      const placeholder = document.getElementById('payslipEmptyPlaceholder');
      if (placeholder) placeholder.classList.remove('hidden');
      const alertBox = document.getElementById('previewErrorAlert');
      if (alertBox) alertBox.classList.add('hidden');
    }

    function formatMoneyDisplay(num) {
      const isNeg = num < 0;
      const absVal = Math.abs(Math.round(num));
      return (isNeg ? '-$' : '$') + absVal.toLocaleString('en-US');
    }

    function handlePayslipCsvSelect(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
        let text = evt.target.result || '';
        if (text.charCodeAt(0) === 0xFEFF) {
          text = text.slice(1);
        }

        const lines = text.split(String.fromCharCode(10)).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
        if (lines.length <= 1) {
          alert("CSV 內容為空或無有效薪資資料列！");
          resetPayslipUpload();
          return;
        }

        const rows = [];
        const errorList = [];
        let totalNetPayout = 0;

        for (let i = 1; i < lines.length; i++) {
          const rowNum = i + 1;
          const parts = [];
          let cur = '';
          let inQuotes = false;
          const lineStr = lines[i];

          for (let c = 0; c < lineStr.length; c++) {
            const ch = lineStr[c];
            if (ch === '"') {
              inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
              parts.push(cur.trim().replace(/^["']|["']$/g, ''));
              cur = '';
            } else {
              cur += ch;
            }
          }
          parts.push(cur.trim().replace(/^["']|["']$/g, ''));

          if (parts.length < 8) {
            errorList.push('第 ' + rowNum + ' 列欄位數量不足 (至少需 8 欄)');
            continue;
          }

          const lineUserId = parts[0] || '';
          const empName = parts[1] || '';
          const payMonth = parts[2] || '';
          const baseSalary = parseFloat(parts[3]);
          const allowances = parts[4] !== '' ? parseFloat(parts[4]) : 0;
          const overtimePay = parts[5] !== '' ? parseFloat(parts[5]) : 0;
          const deductions = parts[6] !== '' ? parseFloat(parts[6]) : 0;
          const netSalary = parseFloat(parts[7]);
          const note = parts[8] || '';

          const rowErrors = [];
          if (!lineUserId) rowErrors.push('缺少 LINE User ID');
          if (!empName) rowErrors.push('缺少員工姓名');
          if (!payMonth || !payMonth.match(/^\\d{4}[-/]\\d{1,2}$/)) rowErrors.push('月份格式無效 (需為 YYYY-MM)');
          if (isNaN(baseSalary) || baseSalary < 0) rowErrors.push('底薪必須為數值且大於等於0');
          if (isNaN(allowances) || allowances < 0) rowErrors.push('津貼必須為數值且大於等於0');
          if (isNaN(overtimePay) || overtimePay < 0) rowErrors.push('加班費必須為數值且大於等於0');
          if (isNaN(deductions) || deductions < 0) rowErrors.push('扣款必須為數值且大於等於0');
          if (isNaN(netSalary)) rowErrors.push('實發金額必須為數值');

          const isValid = rowErrors.length === 0;
          if (isValid) {
            totalNetPayout += netSalary;
          } else {
            errorList.push('第 ' + rowNum + ' 列 (' + (empName || lineUserId || '未知') + ')：' + rowErrors.join('、'));
          }

          rows.push({
            rowNum: rowNum,
            isValid: isValid,
            errors: rowErrors,
            line_user_id: lineUserId,
            employee_name: empName,
            pay_month: payMonth,
            base_salary: isNaN(baseSalary) ? 0 : baseSalary,
            allowances: isNaN(allowances) ? 0 : allowances,
            overtime_pay: isNaN(overtimePay) ? 0 : overtimePay,
            deductions: isNaN(deductions) ? 0 : deductions,
            net_salary: isNaN(netSalary) ? 0 : netSalary,
            note: note
          });
        }

        selectedPayslips = rows.filter(function(r) { return r.isValid; });

        // Update UI Metrics
        document.getElementById('previewTotalEmployees').innerText = rows.length + ' 人';
        document.getElementById('previewTotalPayout').innerText = formatMoneyDisplay(totalNetPayout);
        document.getElementById('previewRowCount').innerText = rows.length;

        const badge = document.getElementById('previewValidationBadge');
        const alertBox = document.getElementById('previewErrorAlert');
        const errorUl = document.getElementById('previewErrorList');
        const btnDispatch = document.getElementById('btnDispatchPayslips');

        if (errorList.length > 0) {
          badge.innerText = '發現 ' + errorList.length + ' 筆異常';
          badge.className = 'text-xs font-bold text-red-600 mt-1';
          alertBox.classList.remove('hidden');
          errorUl.innerHTML = errorList.map(function(err) { return '<li>' + err + '</li>'; }).join('');
          btnDispatch.disabled = true;
          btnDispatch.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
          badge.innerText = '✅ 全數檢核通過';
          badge.className = 'text-xs font-bold text-emerald-600 mt-1';
          alertBox.classList.add('hidden');
          errorUl.innerHTML = '';
          btnDispatch.disabled = false;
          btnDispatch.classList.remove('opacity-50', 'cursor-not-allowed');
        }

        // Render Table Body
        const tbody = document.getElementById('payslipsTableBody');
        tbody.innerHTML = rows.map(function(r) {
          const statusBadge = r.isValid 
            ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">✅ 正常</span>'
            : '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">❌ 異常</span>';

          return '<tr class="hover:bg-gray-50 transition">' +
            '<td class="px-4 py-3">' + statusBadge + '</td>' +
            '<td class="px-4 py-3 font-semibold text-gray-900">' + r.employee_name + '</td>' +
            '<td class="px-4 py-3 text-gray-500 font-mono text-[11px]">' + r.line_user_id + '</td>' +
            '<td class="px-4 py-3 font-mono text-gray-700">' + r.pay_month + '</td>' +
            '<td class="px-4 py-3 text-right font-mono text-gray-800">' + formatMoneyDisplay(r.base_salary) + '</td>' +
            '<td class="px-4 py-3 text-right font-mono text-gray-800">' + formatMoneyDisplay(r.allowances) + '</td>' +
            '<td class="px-4 py-3 text-right font-mono text-gray-800">' + formatMoneyDisplay(r.overtime_pay) + '</td>' +
            '<td class="px-4 py-3 text-right font-mono text-red-600">' + (r.deductions > 0 ? ('-' + formatMoneyDisplay(r.deductions)) : '$0') + '</td>' +
            '<td class="px-4 py-3 text-right font-mono font-bold text-emerald-700">' + formatMoneyDisplay(r.net_salary) + '</td>' +
            '<td class="px-4 py-3 text-gray-500 text-[11px]">' + (r.note || '-') + '</td>' +
          '</tr>';
        }).join('');

        document.getElementById('payslipEmptyPlaceholder').classList.add('hidden');
        document.getElementById('payslipPreviewArea').classList.remove('hidden');
      };

      reader.readAsText(file, 'UTF-8');
    }

    async function confirmDispatchPayslips() {
      if (!selectedPayslips || selectedPayslips.length === 0) {
        alert('無有效薪資紀錄可發送！');
        return;
      }

      const msg = '確定要將 ' + selectedPayslips.length + ' 筆個人薪資條以 LINE 官方帳號私密發送嗎？\\n\\n' +
        '🛡️ 隱私安全保證：\\n' +
        '1. 手機鎖定螢幕與通知橫幅絕不洩漏任何金額。\\n' +
        '2. 雲端資料庫不留存任何薪資明細數字。\\n' +
        '3. 嚴格跨租戶驗證，非本公司員工絕不誤發。';

      if (!confirm(msg)) {
        return;
      }

      const btn = document.getElementById('btnDispatchPayslips');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>發送中...';

      try {
        const resp = await fetch(API_BASE + '/api/v1/tenant/payslips/dispatch', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ payslips: selectedPayslips })
        });

        const data = await resp.json();

        if (!resp.ok || !data.success) {
          const errMsg = data.error || (data.failures && data.failures.length > 0 ? data.failures.map(function(f) { return f.reason; }).join('\\n') : '未知錯誤');
          alert('發送失敗：' + errMsg);
          btn.disabled = false;
          btn.innerHTML = originalText;
          return;
        }

        const failCount = data.failures ? data.failures.length : 0;
        let successMsg = '🎉 薪資條批次發送完成！\\n\\n' +
          '✅ 成功發送：' + data.count + ' 位同仁\\n';
        if (failCount > 0) {
          successMsg += '⚠️ 失敗或被攔截：' + failCount + ' 筆\\n' +
            data.failures.map(function(f) { return '- ' + (f.line_user_id || '第 ' + f.row + ' 列') + ': ' + f.reason; }).join('\\n');
        }

        alert(successMsg);
        resetPayslipUpload();
      } catch (err) {
        alert('發送請求異常：' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }

    // Auto-init on page load
    window.addEventListener('DOMContentLoaded', function() {
      checkAuthAndInit();
    });
  </script>
`;
}
