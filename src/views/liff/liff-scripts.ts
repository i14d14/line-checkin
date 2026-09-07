/**
 * LIFF Mobile Portal Client-Side JavaScript Logic
 */
export function renderLiffScripts(liffId: string): string {
  return `
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
    let currentApprType = "LEAVE";
    let selectedApprProofFile = null;

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
          if (card) {
            card.classList.remove("hidden");
            initWifiRegistrationCard();
          }
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

    let detectedIpv4Addr = null;
    let detectedIpv6Addr = null;

    function fetchWithTimeout(url, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
        fetch(url)
          .then(res => { clearTimeout(timer); resolve(res); })
          .catch(err => { clearTimeout(timer); reject(err); });
      });
    }

    function computeIpv6Subnet64(ip) {
      if (!ip || !ip.includes(":")) return null;
      try {
        const clean = ip.trim().toLowerCase();
        const parts = clean.split("::");
        let allParts = [];
        if (parts.length === 2) {
          const left = parts[0] ? parts[0].split(":") : [];
          const right = parts[1] ? parts[1].split(":") : [];
          const omitted = 8 - (left.length + right.length);
          allParts = [...left, ...Array(Math.max(0, omitted)).fill("0"), ...right];
        } else {
          allParts = clean.split(":");
        }
        if (allParts.length >= 4) {
          return allParts.slice(0, 4).join(":") + "::/64";
        }
      } catch (e) {}
      return null;
    }

    async function initWifiRegistrationCard() {
      const allowedSpan = document.getElementById("currentAllowedIps");
      const v4Span = document.getElementById("detectedIpv4");
      const v6Span = document.getElementById("detectedIpv6");

      // 1. Fetch current location allowed_ips & server-detected IP
      try {
        const url = "/api/v1/tenant/locations/wifi?companyId=" + encodeURIComponent(companyId) + "&lineUserId=" + encodeURIComponent(userId);
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.success) {
          if (allowedSpan) allowedSpan.innerText = data.allowedIps || "未設定 (純 GPS 打卡)";
          if (data.clientIp && data.clientIp !== "unknown") {
            if (data.clientIp.includes(":")) {
              detectedIpv6Addr = data.clientIp;
              const sub64 = computeIpv6Subnet64(data.clientIp);
              if (v6Span) v6Span.innerText = sub64 || data.clientIp;
            } else {
              detectedIpv4Addr = data.clientIp;
              if (v4Span) v4Span.innerText = data.clientIp;
            }
          }
        }
      } catch (e) {
        console.warn("Failed to fetch location wifi info:", e);
      }

      // 2. Probe IPv4 egress (api4.ipify.org / icanhazip)
      fetchWithTimeout("https://api4.ipify.org?format=json", 2000)
        .then(r => r.json())
        .then(data => {
          if (data && data.ip) {
            detectedIpv4Addr = data.ip;
            if (v4Span) v4Span.innerText = data.ip;
          }
        })
        .catch(() => {
          fetchWithTimeout("https://ipv4.icanhazip.com", 2000)
            .then(r => r.text())
            .then(t => {
              const ip = t.trim();
              if (ip && !ip.includes(":")) {
                detectedIpv4Addr = ip;
                if (v4Span) v4Span.innerText = ip;
              }
            })
            .catch(() => {
              if (v4Span && !detectedIpv4Addr) v4Span.innerText = "無法探測 / 離線";
            });
        });

      // 3. Probe IPv6 egress (api6.ipify.org / icanhazip)
      fetchWithTimeout("https://api6.ipify.org?format=json", 2000)
        .then(r => r.json())
        .then(data => {
          if (data && data.ip) {
            detectedIpv6Addr = data.ip;
            const sub64 = computeIpv6Subnet64(data.ip);
            if (v6Span) v6Span.innerText = sub64 || data.ip;
          }
        })
        .catch(() => {
          fetchWithTimeout("https://ipv6.icanhazip.com", 2000)
            .then(r => r.text())
            .then(t => {
              const ip = t.trim();
              if (ip && ip.includes(":")) {
                detectedIpv6Addr = ip;
                const sub64 = computeIpv6Subnet64(ip);
                if (v6Span) v6Span.innerText = sub64 || ip;
              } else if (v6Span && !detectedIpv6Addr) {
                v6Span.innerText = "未偵測到 (純 IPv4)";
              }
            })
            .catch(() => {
              if (v6Span && !detectedIpv6Addr) v6Span.innerText = "未偵測到 (純 IPv4)";
            });
        });
    }

    async function registerCurrentWifiIp() {
      const btn = document.getElementById("wifiRegBtn");
      const msg = document.getElementById("wifiRegMsg");
      const allowedSpan = document.getElementById("currentAllowedIps");
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>雙棧探測與登記中...';
      msg.classList.add("hidden");

      try {
        const candidateIps = [];
        if (detectedIpv4Addr) candidateIps.push(detectedIpv4Addr);
        if (detectedIpv6Addr) candidateIps.push(detectedIpv6Addr);

        const resp = await fetch("/api/v1/tenant/locations/wifi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lineUserId: userId,
            companyId: companyId,
            ipv4: detectedIpv4Addr || undefined,
            ipv6: detectedIpv6Addr || undefined,
            ips: candidateIps
          })
        });
        const data = await resp.json();
        msg.classList.remove("hidden");
        if (resp.ok && data.success) {
          msg.className = "text-xs font-mono p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800";
          msg.innerHTML = "✅ " + data.message + "<br><span class='font-bold'>最新白名單：</span>" + data.allowedIps;
          if (allowedSpan) allowedSpan.innerText = data.allowedIps;
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
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up mr-1"></i>一鍵登記當前 Wi-Fi IP (雙棧 IPv4 + IPv6)';
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
        } else if (day.status === "UNSCHEDULED") {
          bgClass = "bg-white border-dashed border-gray-300 text-gray-400";
          dot = '<span class="text-[8px] text-gray-400 font-mono scale-90">未排</span>';
        } else if (day.status === "UNSCHEDULED_WORK") {
          bgClass = "bg-indigo-50 border-indigo-200 text-indigo-800";
          dot = '<span class="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block"></span>';
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
      else if (day.statusColor === "indigo") badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200";
      else if (day.status === "UNSCHEDULED") badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-dashed border-gray-300";
      else badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600";

      document.getElementById("detailScheduleTime").innerText = (day.shiftStart && day.shiftEnd) ? \`\${day.shiftStart} ~ \${day.shiftEnd}\` : (day.status === "UNSCHEDULED" || day.status === "UNSCHEDULED_WORK" ? "未排班" : (day.isRestDay ? "例假/休" : "-"));
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
      onApprDateChange();
    }

    function handleApprProofSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        alert('請選擇圖片檔案 (JPG / PNG / WebP)');
        event.target.value = '';
        return;
      }

      const MAX_SIZE = 5 * 1024 * 1024; // 5MB
      if (file.size > MAX_SIZE) {
        alert('照片檔案過大 (上限 5MB)，請壓縮或更換照片後再試。');
        event.target.value = '';
        return;
      }

      selectedApprProofFile = file;

      const emptyState = document.getElementById('apprProofEmptyState') || document.getElementById('leaveProofEmptyState');
      const previewState = document.getElementById('apprProofPreviewState') || document.getElementById('leaveProofPreviewState');
      const filenameEl = document.getElementById('apprProofFilename') || document.getElementById('leaveProofFilename');
      const filesizeEl = document.getElementById('apprProofFilesize') || document.getElementById('leaveProofFilesize');
      const thumbnailEl = document.getElementById('apprProofThumbnail') || document.getElementById('leaveProofThumbnail');

      if (filenameEl) filenameEl.innerText = file.name;
      if (filesizeEl) filesizeEl.innerText = (file.size / 1024).toFixed(1) + ' KB';

      const reader = new FileReader();
      reader.onload = function(e) {
        if (thumbnailEl) thumbnailEl.src = e.target.result;
      };
      reader.readAsDataURL(file);

      if (emptyState) emptyState.classList.add('hidden');
      if (previewState) previewState.classList.remove('hidden');
    }

    function removeApprProof(event) {
      if (event) event.stopPropagation();
      selectedApprProofFile = null;
      const fileInput = document.getElementById('apprProof') || document.getElementById('leaveProof');
      if (fileInput) fileInput.value = '';

      const emptyState = document.getElementById('apprProofEmptyState') || document.getElementById('leaveProofEmptyState');
      const previewState = document.getElementById('apprProofPreviewState') || document.getElementById('leaveProofPreviewState');
      const thumbnailEl = document.getElementById('apprProofThumbnail') || document.getElementById('leaveProofThumbnail');

      if (emptyState) emptyState.classList.remove('hidden');
      if (previewState) previewState.classList.add('hidden');
      if (thumbnailEl) thumbnailEl.src = '';
    }

    // Backward compatibility aliases
    const handleLeaveProofSelected = handleApprProofSelected;
    const removeLeaveProof = removeApprProof;

    function setApprSubmitBlocked(blocked) {
      const btn = document.getElementById('apprSubmitBtn');
      if (!btn) return;
      if (blocked) {
        btn.disabled = true;
        btn.dataset.blocked = "true";
        btn.className = "w-full py-3 bg-gray-300 text-gray-500 font-bold rounded-xl cursor-not-allowed transition flex items-center justify-center space-x-1.5";
      } else {
        btn.disabled = false;
        btn.dataset.blocked = "false";
        btn.className = "w-full py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-1.5";
      }
    }

    function onApprDateChange() {
      const targetDateEl = document.getElementById('apprTargetDate');
      if (!targetDateEl) return;
      const targetDate = targetDateEl.value;
      const noticeBox = document.getElementById('leavePunchNotice');
      const noticeText = document.getElementById('leavePunchNoticeText');
      if (!targetDate || !noticeBox || !noticeText) return;

      // Reset blocked state first
      setApprSubmitBlocked(false);

      if (currentApprType === "LEAVE") {
        let day = null;
        if (monthlyDataCache && monthlyDataCache.days) {
          day = monthlyDataCache.days.find(d => d.date === targetDate);
        }

        // Fallback weekend calculation if day is not in cached monthly data
        let isWeekend = false;
        let weekendText = "";
        const parts = targetDate.split("-").map(Number);
        const dow = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
        if (dow === 0 || dow === 6) {
          isWeekend = true;
          weekendText = dow === 0 ? "週日例假" : "週六例假";
        }

        // 1. Rest day check (isRestDay is true and not an approved leave shift)
        if (day ? (day.isRestDay && !day.isLeave) : isWeekend) {
          const restReason = (day && day.shiftName) || weekendText || "排定休假日";
          noticeBox.className = "p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center space-x-1";
          noticeText.innerHTML = '<strong>⚠️ 提示：</strong>' + targetDate + ' 為非工作日 / 休假日（' + restReason + '），無須請假。';
          noticeBox.classList.remove('hidden');
          setApprSubmitBlocked(true);
          return;
        }

        // 2. Already full-day approved leave
        if (day && day.status === "LEAVE") {
          noticeBox.className = "p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center space-x-1";
          noticeText.innerHTML = '<strong>⚠️ 提示：</strong>' + targetDate + ' 已核准全天請假（' + (day.shiftName || '請假') + '），無須重複請假。';
          noticeBox.classList.remove('hidden');
          setApprSubmitBlocked(true);
          return;
        }

        // 3. Normal full attendance or already fully compensated by prior leave
        if (day && day.status === "NORMAL") {
          const hasOutPunch = Array.isArray(day.punches) && day.punches.some(p => p.punch_type === "OUT");
          if (day.isToday && !hasOutPunch) {
            // Today, currently working or pending completion: allow advance early leave notice
            noticeBox.className = "p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800 flex items-center space-x-1";
            noticeText.innerHTML = '<strong>💡 提示：</strong>今日出勤進行中，若需提前早退或請假，請選擇請假時段後送出。';
            noticeBox.classList.remove('hidden');
            setApprSubmitBlocked(false);
            return;
          } else {
            const note = day.isLeave
              ? '已由先前請假全額抵充（出勤 ' + day.workHours + 'h + 請假 ' + day.leaveHours + 'h）'
              : '出勤紀錄正常且已打滿排班工時（出勤 ' + day.workHours + 'h）';
            noticeBox.className = "p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center space-x-1";
            noticeText.innerHTML = '<strong>⚠️ 提示：</strong>該日（' + targetDate + '）' + note + '，查無缺勤時段，無須請假。';
            noticeBox.classList.remove('hidden');
            setApprSubmitBlocked(true);
            return;
          }
        }

        // 4. Deficit detected (Absent, Late, Early Leave, Missing punch, etc.)
        if (day && ["ABSENT", "LATE", "EARLY_LEAVE", "LATE_AND_EARLY", "MISSING_IN", "MISSING_OUT"].includes(day.status)) {
          noticeBox.className = "p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 flex items-center space-x-1";
          noticeText.innerHTML = '<strong>💡 缺勤時段偵測：</strong>' + day.statusText + '（已出勤 ' + day.workHours + ' 小時），請選擇假別與抵充時段。';
          noticeBox.classList.remove('hidden');
          setApprSubmitBlocked(false);
          return;
        }

        // 5. Future scheduled day or today before shift
        if (day && (day.status === "SCHEDULED" || day.status === "TODAY")) {
          noticeBox.className = "p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800 flex items-center space-x-1";
          noticeText.innerHTML = '<strong>📅 事前請假：</strong>' + targetDate + ' 排定班表（' + (day.shiftName || '常態班') + '），可預先提交請假申請。';
          noticeBox.classList.remove('hidden');
          setApprSubmitBlocked(false);
          return;
        }
      }

      noticeBox.className = "p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800 hidden";
      noticeBox.classList.add('hidden');
    }

    function initApprovalForm() {
      const today = new Date().toISOString().split('T')[0];
      const targetInput = document.getElementById('apprTargetDate');
      if (!targetInput.value) {
        targetInput.value = today;
      }
      onApprDateChange();
    }

    async function handleApprSubmit(event) {
      event.preventDefault();
      const btn = document.getElementById('apprSubmitBtn');
      const btnText = document.getElementById('apprSubmitBtnText');
      const alertBox = document.getElementById('apprAlert');

      if (btn && (btn.dataset.blocked === "true" || btn.disabled)) {
        return;
      }

      if (btn) btn.disabled = true;
      if (btnText) btnText.innerText = "傳送申請中...";
      if (alertBox) alertBox.className = "p-3 rounded-xl text-xs hidden";

      try {
        const targetDateEl = document.getElementById('apprTargetDate');
        const reasonEl = document.getElementById('apprReason');
        const targetDate = targetDateEl ? targetDateEl.value : "";
        const reason = reasonEl ? reasonEl.value.trim() : "";

        if (!targetDate) {
          throw new Error("請選擇申請涉及日期");
        }

        let details = { reason };

        if (currentApprType === "LEAVE") {
          const leaveTypeEl = document.getElementById('apprLeaveType');
          const leaveTimeEl = document.getElementById('apprLeaveTime');
          details.leave_type = leaveTypeEl ? leaveTypeEl.value : "事假";
          details.time_range = leaveTimeEl ? leaveTimeEl.value : "全天";
        } else if (currentApprType === "CORRECTION") {
          const punchTypeEl = document.getElementById('apprCorrectionPunchType');
          const punchTimeEl = document.getElementById('apprCorrectionTime');
          details.punch_type = punchTypeEl ? punchTypeEl.value : "IN";
          details.time = punchTimeEl ? punchTimeEl.value : "09:00";
        } else if (currentApprType === "OVERTIME") {
          const otHoursEl = document.getElementById('apprOtHours');
          const otTimeEl = document.getElementById('apprOtTime');
          details.hours = parseFloat((otHoursEl && otHoursEl.value) || "1");
          details.time_range = (otTimeEl && otTimeEl.value.trim()) || "下班後";
        }

        // Universal attachment upload (optional for LEAVE, CORRECTION, OVERTIME)
        if (selectedApprProofFile) {
          if (btnText) btnText.innerText = "上傳佐證檔案中...";
          const formData = new FormData();
          formData.append("file", selectedApprProofFile);
          formData.append("companyId", companyId || "");

          const uploadResp = await fetch("/api/v1/attachments/upload", {
            method: "POST",
            body: formData
          });
          const uploadData = await uploadResp.json();
          if (!uploadData.success) {
            if (alertBox) {
              alertBox.className = "p-3 rounded-xl text-xs bg-red-50 text-red-800 border border-red-200 flex items-center space-x-2";
              alertBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-base text-red-600"></i><div><strong>佐證檔案上傳失敗：</strong>' + (uploadData.error || "未知錯誤") + '</div>';
            }
            return;
          }

          details.attachment_key = uploadData.key;
          details.attachment_url = uploadData.url;
          if (btnText) btnText.innerText = "傳送申請中...";
        }

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
          if (alertBox) {
            alertBox.className = "p-3 rounded-xl text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center space-x-2";
            alertBox.innerHTML = '<i class="fa-solid fa-circle-check text-base text-emerald-600"></i><div><strong>申請成功！</strong>' + data.message + '</div>';
          }
          const reasonInput = document.getElementById('apprReason');
          if (reasonInput) reasonInput.value = "";
          removeApprProof();
          loadMyApprovals();
        } else {
          if (alertBox) {
            alertBox.className = "p-3 rounded-xl text-xs bg-red-50 text-red-800 border border-red-200 flex items-center space-x-2";
            alertBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-base text-red-600"></i><div><strong>送出失敗：</strong>' + (data.error || "未知錯誤") + '</div>';
          }
        }
      } catch (err) {
        if (alertBox) {
          alertBox.className = "p-3 rounded-xl text-xs bg-red-50 text-red-800 border border-red-200";
          alertBox.innerHTML = '<strong>發生異常：</strong>' + err.message;
        }
      } finally {
        if (btn) btn.disabled = false;
        if (btnText) btnText.innerText = "送出申請";
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
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">已駁回</span>';
        } else {
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">🟡 審核中</span>';
        }

        let detailsObj = {};
        try { detailsObj = JSON.parse(appr.details || "{}"); } catch (e) {}
        const note = detailsObj.reason ? ('<div class="text-[11px] text-gray-500 mt-1">事由：' + detailsObj.reason + '</div>') : '';
        const rejectNote = (appr.status === 'REJECTED' && detailsObj.reject_reason)
          ? ('<div class="text-[11px] text-slate-700 font-semibold mt-1">駁回原因：' + detailsObj.reject_reason + '</div>')
          : '';
        const attachLink = detailsObj.attachment_url
          ? ('<div class="mt-1"><a href="' + detailsObj.attachment_url + '" target="_blank" class="inline-flex items-center space-x-1 text-[11px] text-blue-600 hover:underline bg-blue-50/80 px-2 py-0.5 rounded-md border border-blue-100 font-medium"><i class="fa-solid fa-paperclip text-[10px]"></i><span>查看證明文件</span></a></div>')
          : '';

        return '<div class="bg-gray-50 p-3 rounded-2xl border border-gray-100 space-y-1">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-bold text-gray-800">' + typeLabel + ' - ' + appr.target_date + '</span>' +
            statusBadge +
          '</div>' +
          note +
          attachLink +
          rejectNote +
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
`;
}
