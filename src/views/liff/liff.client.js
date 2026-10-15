"use strict";
(() => {
  // src/client/liff/index.ts
  var LIFF_ID = window.__LIFF_ID__ || "";
  var idToken = "";
  var userId = "DEMO_USER";
  var displayName = "\u6E2C\u8A66\u7528\u6236";
  function getQueryParam(key) {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has(key)) return searchParams.get(key);
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
      } catch (e) {
      }
    }
    if (window.location.hash) {
      const hashStr = window.location.hash.startsWith("#") ? window.location.hash.substring(1) : window.location.hash;
      const qIdx = hashStr.indexOf("?");
      const hashQuery = qIdx !== -1 ? hashStr.substring(qIdx) : hashStr;
      const hashParams = new URLSearchParams(hashQuery);
      if (hashParams.has(key)) return hashParams.get(key);
    }
    return null;
  }
  var PENDING_ONBOARDING_KEY = "line_checkin_pending_cid";
  var urlCid = getQueryParam("cid");
  if (urlCid) {
    try {
      localStorage.setItem(PENDING_ONBOARDING_KEY, urlCid);
    } catch (e) {
    }
  }
  var companyId = urlCid || localStorage.getItem(PENDING_ONBOARDING_KEY) || "24549210-01";
  var monthlyDataCache = null;
  var currentApprType = "LEAVE";
  var selectedApprProofFile = null;
  function getDeviceId() {
    let dId = localStorage.getItem("line_checkin_device_id");
    if (!dId) {
      dId = "dev_" + Math.random().toString(36).substring(2, 12) + "_" + Date.now().toString(36);
      localStorage.setItem("line_checkin_device_id", dId);
    }
    return dId;
  }
  var USER_CACHE_KEY = "line_checkin_user_profile";
  var cachedProfile = null;
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (raw) cachedProfile = JSON.parse(raw);
  } catch (e) {
  }
  var userPermissions = cachedProfile && Array.isArray(cachedProfile.permissions) ? cachedProfile.permissions : ["punch", "apply"];
  var isUserManager = cachedProfile ? !!cachedProfile.isManager : false;
  var isEnrolled = cachedProfile ? !!cachedProfile.isEnrolled : false;
  var enrollmentChecked = !!(cachedProfile && cachedProfile.userId);
  var currentActiveTab = "checkin";
  var isFriendWithBot = false;
  var currentTargetLocationName = cachedProfile && cachedProfile.companyName || "";
  if (cachedProfile && cachedProfile.userId) {
    userId = cachedProfile.userId;
    if (cachedProfile.displayName) displayName = cachedProfile.displayName;
    if (cachedProfile.companyId && !getQueryParam("cid")) companyId = cachedProfile.companyId;
    const uNameEl = document.getElementById("userName");
    if (uNameEl && displayName) uNameEl.innerText = displayName;
    const tagEl = document.getElementById("userProfileTag");
    if (tagEl && displayName) tagEl.innerText = displayName;
    const compTagEl = document.getElementById("companyTag");
    if (compTagEl) compTagEl.innerText = "\u{1F3E2} \u64DA\u9EDE\uFF1A" + (cachedProfile.companyName || companyId);
    const dispCompEl = document.getElementById("displayCompanyId");
    if (dispCompEl) dispCompEl.innerText = companyId;
    const avatarEl = document.getElementById("userAvatar");
    if (avatarEl && cachedProfile.pictureUrl) avatarEl.src = cachedProfile.pictureUrl;
    const dispDevEl = document.getElementById("displayDevice");
    if (dispDevEl) dispDevEl.innerText = getDeviceId().substring(0, 15) + "...";
  }
  var MANAGEMENT_PERMISSIONS = [
    "view_store",
    "view_all",
    "approve",
    "set_location",
    "set_wifi",
    "device_audit",
    "export_payroll",
    "broadcast",
    "all",
    "admin"
  ];
  function canAccessAdminTab() {
    return userPermissions.some((p) => MANAGEMENT_PERMISSIONS.includes(p));
  }
  function updateOnboardingFriendshipUI() {
    const step1Btn = document.getElementById("onboardingStep1Btn");
    const joinBtn = document.getElementById("joinBtn");
    const joinIcon = document.getElementById("joinBtnIcon");
    const joinTitle = document.getElementById("joinBtnTitle");
    const hintText = document.getElementById("onboardingHintText");
    if (!isFriendWithBot) {
      if (step1Btn) {
        step1Btn.classList.remove("hidden");
        step1Btn.classList.add("flex");
      }
      if (joinBtn) {
        joinBtn.classList.add("hidden");
        joinBtn.classList.remove("flex");
        joinBtn.disabled = true;
      }
      if (hintText) {
        hintText.innerHTML = "\u{1F449} \u9EDE\u64CA\u4E0A\u65B9\u6309\u9215\u52A0\u5165\u597D\u53CB\u5F8C\uFF0C\u8ACB\u76F4\u63A5\u5728\u5B98\u65B9\u5E33\u865F\u804A\u5929\u5BA4\u4E0B\u65B9\u9EDE\u64CA\u3010\u65B0\u9032\u540C\u4EC1\u5165\u8077\u767B\u8A18\u3011\u5373\u53EF\u5B8C\u6210\u5165\u8077\uFF01";
        hintText.className = "text-[11px] text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-center leading-normal";
      }
    } else {
      if (step1Btn) {
        step1Btn.classList.add("hidden");
        step1Btn.classList.remove("flex");
      }
      if (joinBtn) {
        joinBtn.classList.remove("hidden");
        joinBtn.classList.add("flex");
        joinBtn.disabled = false;
        joinBtn.className = "w-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center space-x-3 text-center cursor-pointer";
      }
      if (joinIcon) {
        joinIcon.className = "fa-solid fa-circle-check text-xl flex-shrink-0 text-white";
      }
      if (joinTitle) {
        joinTitle.innerText = "\u78BA\u8A8D\u52A0\u5165\u8003\u52E4\u7CFB\u7D71";
      }
      if (hintText) {
        hintText.innerHTML = "\u2705 \u5DF2\u6210\u529F\u78BA\u8A8D\u597D\u53CB\u8EAB\u5206\uFF01\u8ACB\u9EDE\u64CA\u4E0A\u65B9\u6309\u9215\u5B8C\u6210\u9580\u5E02\u5165\u8077\u767B\u8A18\u3002";
        hintText.className = "text-[11px] text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-center leading-normal";
      }
    }
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
          alertBox.innerHTML = '<i class="fa-solid fa-circle-check mr-1 text-emerald-600"></i><strong>\u5DF2\u6210\u529F\u78BA\u8A8D\u597D\u53CB\u8EAB\u5206\uFF01</strong><br>\u7B2C\u4E8C\u6B65\u5DF2\u89E3\u9396\uFF0C\u8ACB\u9EDE\u64CA\u4E0A\u65B9\u6309\u9215\u78BA\u8A8D\u5165\u8077\u3002';
        } else {
          alertBox.className = "p-3 rounded-xl text-xs bg-amber-50 text-amber-800 border border-amber-200 block";
          alertBox.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1 text-amber-600"></i>\u5C1A\u672A\u5075\u6E2C\u5230\u597D\u53CB\u95DC\u4FC2\uFF0C\u8ACB\u5148\u9EDE\u64CA\u7B2C\u4E00\u6B65\u6309\u9215\u52A0\u5165\u6253\u5361\u5E33\u865F\u597D\u53CB\u3002';
        }
        setTimeout(() => alertBox.classList.add("hidden"), 4e3);
      }
    }
    return isFriendWithBot;
  }
  function getAvailableTabs() {
    if (!isEnrolled) return [];
    const tabs = ["checkin", "calendar", "approvals"];
    if (canAccessAdminTab()) tabs.push("admin");
    return tabs;
  }
  function showOnboardingView(profile) {
    const tabSwitcher = document.getElementById("tabSwitcher");
    if (tabSwitcher) tabSwitcher.classList.remove("hidden");
    const navOnboarding = document.getElementById("nav-onboarding");
    if (navOnboarding) {
      navOnboarding.classList.remove("hidden");
      navOnboarding.classList.add("flex");
      navOnboarding.classList.add("active");
    }
    ["checkin", "calendar", "approvals", "admin"].forEach((tab) => {
      const btn = document.getElementById("nav-" + tab);
      if (btn) {
        btn.classList.add("hidden");
        btn.classList.remove("flex");
        btn.classList.remove("active");
      }
    });
    const allViews = ["onboarding", "checkin", "calendar", "approvals", "admin"];
    allViews.forEach((v) => {
      const el = document.getElementById("view-" + v);
      if (el) el.classList.add("hidden");
    });
    const onboardingEl = document.getElementById("view-onboarding");
    if (onboardingEl) onboardingEl.classList.remove("hidden");
    const onbName = document.getElementById("onboardingCompanyName");
    const onbBranch = document.getElementById("onboardingBranchName");
    const onbTaxId = document.getElementById("onboardingCompanyTaxId");
    const onbBranchBadge = document.getElementById("onboardingBranchBadge");
    const onbAddr = document.getElementById("onboardingCompanyAddress");
    const joinBtnSubText = document.getElementById("joinBtnSubText");
    let compName = "\u516C\u53F8\u8003\u52E4\u7CFB\u7D71";
    let branchName = "\u9580\u5E02\u64DA\u9EDE";
    let taxId = companyId || "-";
    let branchCode = "01";
    if (profile && profile.targetLocation) {
      const rawName = (profile.targetLocation.name || "").trim();
      const rawId = (profile.targetLocation.id || "").trim();
      currentTargetLocationName = rawName;
      if (rawName.includes(" - ")) {
        const parts = rawName.split(" - ");
        compName = parts[0].trim();
        branchName = parts.slice(1).join(" - ").trim();
      } else if (rawName.includes("-")) {
        const parts = rawName.split("-");
        compName = parts[0].trim();
        branchName = parts.slice(1).join("-").trim();
      } else {
        compName = rawName;
        branchName = "\u7E3D\u90E8\u64DA\u9EDE";
      }
      if (rawId.includes("-")) {
        const idParts = rawId.split("-");
        taxId = idParts[0].trim();
        branchCode = idParts.slice(1).join("-").trim();
      } else {
        taxId = rawId;
        branchCode = "\u7E3D\u90E8";
      }
      if (onbName) onbName.innerText = compName;
      if (onbBranch) onbBranch.innerText = branchName;
      if (onbTaxId) onbTaxId.innerText = taxId;
      if (onbBranchBadge) onbBranchBadge.innerText = `\u64DA\u9EDE #${branchCode}`;
      if (onbAddr) onbAddr.innerText = profile.targetLocation.address || "\u9580\u5E02\u5730\u5740\u8F09\u5165\u4E2D...";
      if (joinBtnSubText) joinBtnSubText.innerText = `${compName} \xB7 ${branchName}`;
    } else {
      currentTargetLocationName = "\u9580\u5E02\u64DA\u9EDE " + companyId;
      const cidParts = (companyId || "").split("-");
      const fallbackComp = "\u53D7\u9080\u4F01\u696D";
      const fallbackBranch = cidParts.length > 1 ? `\u9580\u5E02\u64DA\u9EDE #${cidParts[1]}` : "\u9580\u5E02\u64DA\u9EDE";
      const fallbackTax = cidParts[0] || "-";
      const fallbackBadge = cidParts.length > 1 ? `\u64DA\u9EDE #${cidParts[1]}` : "\u9580\u5E02\u4EE3\u78BC";
      if (onbName) onbName.innerText = fallbackComp;
      if (onbBranch) onbBranch.innerText = fallbackBranch;
      if (onbTaxId) onbTaxId.innerText = fallbackTax;
      if (onbBranchBadge) onbBranchBadge.innerText = fallbackBadge;
      if (onbAddr) onbAddr.innerText = "\u9580\u5E02\u4EE3\u78BC\uFF1A" + companyId;
      if (joinBtnSubText) joinBtnSubText.innerText = `${fallbackComp} \xB7 ${fallbackBranch}`;
    }
    updateOnboardingFriendshipUI();
    checkFriendshipStatus(false);
    const onbUser = document.getElementById("onboardingUserName");
    if (onbUser) onbUser.innerText = displayName;
    const userAvatar = document.getElementById("userAvatar");
    if (userAvatar && userAvatar.src) {
      const onbAvatar = document.getElementById("onboardingUserAvatar");
      if (onbAvatar) onbAvatar.src = userAvatar.src;
    }
  }
  function showEnrolledView() {
    const tabSwitcher = document.getElementById("tabSwitcher");
    if (tabSwitcher) tabSwitcher.classList.remove("hidden");
    const navOnboarding = document.getElementById("nav-onboarding");
    if (navOnboarding) {
      navOnboarding.classList.add("hidden");
      navOnboarding.classList.remove("flex");
    }
    ["checkin", "calendar", "approvals"].forEach((tab) => {
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
    switchView("checkin");
  }
  function handleModalFriendClick() {
    setTimeout(() => {
      closeSuccessModalAndGoToCheckin();
    }, 500);
  }
  async function handleJoinCompany() {
    if (!isFriendWithBot) {
      const alertBox2 = document.getElementById("onboardingAlert");
      if (alertBox2) {
        alertBox2.className = "p-3 rounded-xl text-xs bg-amber-50 text-amber-800 border border-amber-200 block";
        alertBox2.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1 text-amber-600"></i><strong>\u672A\u52A0\u597D\u53CB\u4E0D\u5F97\u5165\u8077\uFF1A</strong>\u8ACB\u5148\u9EDE\u64CA\u7B2C\u4E00\u6B65\u6309\u9215\u52A0\u5165\u6253\u5361\u5B98\u65B9\u5E33\u865F\u597D\u53CB\u3002';
      }
      return;
    }
    const btn = document.getElementById("joinBtn");
    const btnTitle = document.getElementById("joinBtnTitle");
    const alertBox = document.getElementById("onboardingAlert");
    if (btn) btn.disabled = true;
    if (btnTitle) btnTitle.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>\u5165\u8077\u7D81\u5B9A\u4E2D...';
    if (alertBox) alertBox.className = "p-3 rounded-xl text-xs hidden";
    try {
      const resp = await fetch("/api/v1/employee/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          lineUserId: userId,
          displayName,
          idToken
        })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        isEnrolled = true;
        try {
          localStorage.removeItem(PENDING_ONBOARDING_KEY);
        } catch (e) {
        }
        await checkUserPermissions();
        showEnrolledView();
        switchView("checkin");
      } else {
        if (alertBox) {
          alertBox.className = "p-3 rounded-xl text-xs bg-red-50 text-red-700 border border-red-200 block";
          alertBox.innerText = "\u26A0\uFE0F \u52A0\u5165\u5931\u6557\uFF1A" + (data.error || "\u672A\u77E5\u932F\u8AA4");
        }
      }
    } catch (err) {
      if (alertBox) {
        alertBox.className = "p-3 rounded-xl text-xs bg-red-50 text-red-700 border border-red-200 block";
        alertBox.innerText = "\u7DB2\u8DEF\u9023\u7DDA\u7570\u5E38\uFF1A" + err.message;
      }
    } finally {
      if (!isEnrolled) {
        if (btn) btn.disabled = false;
        if (btnTitle) btnTitle.innerText = "\u78BA\u8A8D\u52A0\u5165\u8003\u52E4\u7CFB\u7D71";
      }
    }
  }
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
    if (viewName === "punch") viewName = "checkin";
    if (viewName === "schedule") viewName = "calendar";
    if (viewName === "approval") viewName = "approvals";
    if (enrollmentChecked && !isEnrolled && viewName !== "onboarding") {
      viewName = "onboarding";
    }
    if (viewName === "admin" && !canAccessAdminTab()) {
      console.warn("User does not possess management permissions, falling back to checkin.");
      viewName = "checkin";
    }
    currentActiveTab = viewName;
    const allViews = ["onboarding", "checkin", "calendar", "approvals", "admin"];
    allViews.forEach((v) => {
      const el = document.getElementById("view-" + v);
      if (el) el.classList.add("hidden");
      const nav = document.getElementById("nav-" + v);
      if (nav) nav.classList.remove("active");
    });
    const targetView = document.getElementById("view-" + viewName);
    if (targetView) targetView.classList.remove("hidden");
    const targetNav = document.getElementById("nav-" + viewName);
    if (targetNav) targetNav.classList.add("active");
    if (viewName === "calendar") {
      loadMonthlyAttendance();
    } else if (viewName === "approvals") {
      initApprovalForm();
      loadMyApprovals();
    } else if (viewName === "admin") {
      loadAdminProfile();
    }
  }
  var initialRequestedTab = getQueryParam("tab") || getQueryParam("view");
  if (initialRequestedTab && initialRequestedTab !== "admin") {
    switchView(initialRequestedTab);
  }
  var checkPermPromise = null;
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
            if (compTag) compTag.innerText = "\u{1F3E2} \u64DA\u9EDE\uFF1A" + (data.profile.companyName || companyId);
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
          try {
            const avatar = document.getElementById("userAvatar");
            localStorage.setItem(USER_CACHE_KEY, JSON.stringify({
              userId,
              displayName,
              pictureUrl: avatar && avatar.src || "",
              companyId,
              companyName: data.profile.companyName || companyId,
              permissions: userPermissions,
              isManager: isUserManager,
              isEnrolled
            }));
          } catch (e) {
          }
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
          badge.innerText = "\u9580\u5E02\u5E97\u9577 / \u4E3B\u7BA1";
          badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700";
        } else if (canAccessAdminTab()) {
          badge.innerText = "\u9580\u5E02\u7DAD\u904B\u5E79\u90E8";
          badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700";
        } else {
          badge.innerText = "\u4E00\u822C\u54E1\u5DE5";
          badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700";
        }
      }
      const tags = document.getElementById("adminPermTags");
      if (tags) {
        let html = "";
        userPermissions.forEach((p) => {
          html += '<span class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100 flex items-center space-x-1"><i class="fa-solid fa-check text-[10px]"></i><span>' + p + "</span></span>";
        });
        tags.innerHTML = html || '<span class="text-gray-400">\u5C1A\u7121\u7279\u6B8A\u6B0A\u9650</span>';
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
      checkUserPermissions().then((profile) => {
        if (profile && profile.permissionLabels && tags) {
          let html = "";
          userPermissions.forEach((p) => {
            const label = profile.permissionLabels[p] || p;
            html += '<span class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100 flex items-center space-x-1"><i class="fa-solid fa-check text-[10px]"></i><span>' + label + "</span></span>";
          });
          tags.innerHTML = html || '<span class="text-gray-400">\u5C1A\u7121\u7279\u6B8A\u6B0A\u9650</span>';
        }
      });
    } catch (e) {
      console.error("Failed to load admin profile:", e);
    }
  }
  var detectedIpv4Addr = null;
  var detectedIpv6Addr = null;
  function fetchWithTimeout(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
      fetch(url).then((res) => {
        clearTimeout(timer);
        resolve(res);
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
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
    } catch (e) {
    }
    return null;
  }
  async function initWifiRegistrationCard() {
    const allowedSpan = document.getElementById("currentAllowedIps");
    const v4Span = document.getElementById("detectedIpv4");
    const v6Span = document.getElementById("detectedIpv6");
    try {
      const url = "/api/v1/tenant/locations/wifi?companyId=" + encodeURIComponent(companyId) + "&lineUserId=" + encodeURIComponent(userId);
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.success) {
        if (allowedSpan) allowedSpan.innerText = data.allowedIps || "\u672A\u8A2D\u5B9A (\u7D14 GPS \u6253\u5361)";
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
    fetchWithTimeout("https://api4.ipify.org?format=json", 2e3).then((r) => r.json()).then((data) => {
      if (data && data.ip) {
        detectedIpv4Addr = data.ip;
        if (v4Span) v4Span.innerText = data.ip;
      }
    }).catch(() => {
      fetchWithTimeout("https://ipv4.icanhazip.com", 2e3).then((r) => r.text()).then((t) => {
        const ip = t.trim();
        if (ip && !ip.includes(":")) {
          detectedIpv4Addr = ip;
          if (v4Span) v4Span.innerText = ip;
        }
      }).catch(() => {
        if (v4Span && !detectedIpv4Addr) v4Span.innerText = "\u7121\u6CD5\u63A2\u6E2C / \u96E2\u7DDA";
      });
    });
    fetchWithTimeout("https://api6.ipify.org?format=json", 2e3).then((r) => r.json()).then((data) => {
      if (data && data.ip) {
        detectedIpv6Addr = data.ip;
        const sub64 = computeIpv6Subnet64(data.ip);
        if (v6Span) v6Span.innerText = sub64 || data.ip;
      }
    }).catch(() => {
      fetchWithTimeout("https://ipv6.icanhazip.com", 2e3).then((r) => r.text()).then((t) => {
        const ip = t.trim();
        if (ip && ip.includes(":")) {
          detectedIpv6Addr = ip;
          const sub64 = computeIpv6Subnet64(ip);
          if (v6Span) v6Span.innerText = sub64 || ip;
        } else if (v6Span && !detectedIpv6Addr) {
          v6Span.innerText = "\u672A\u5075\u6E2C\u5230 (\u7D14 IPv4)";
        }
      }).catch(() => {
        if (v6Span && !detectedIpv6Addr) v6Span.innerText = "\u672A\u5075\u6E2C\u5230 (\u7D14 IPv4)";
      });
    });
  }
  async function registerCurrentWifiIp() {
    const btn = document.getElementById("wifiRegBtn");
    const msg = document.getElementById("wifiRegMsg");
    const allowedSpan = document.getElementById("currentAllowedIps");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>\u96D9\u68E7\u63A2\u6E2C\u8207\u767B\u8A18\u4E2D...';
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
          companyId,
          ipv4: detectedIpv4Addr || void 0,
          ipv6: detectedIpv6Addr || void 0,
          ips: candidateIps
        })
      });
      const data = await resp.json();
      msg.classList.remove("hidden");
      if (resp.ok && data.success) {
        msg.className = "text-xs font-mono p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800";
        msg.innerHTML = "\u2705 " + data.message + "<br><span class='font-bold'>\u6700\u65B0\u767D\u540D\u55AE\uFF1A</span>" + data.allowedIps;
        if (allowedSpan) allowedSpan.innerText = data.allowedIps;
      } else {
        msg.className = "text-xs font-mono p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800";
        msg.innerText = "\u274C \u767B\u8A18\u5931\u6557\uFF1A" + (data.error || "\u672A\u77E5\u932F\u8AA4");
      }
    } catch (err) {
      msg.classList.remove("hidden");
      msg.className = "text-xs font-mono p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800";
      msg.innerText = "\u7DB2\u8DEF\u7570\u5E38\uFF1A" + err.message;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up mr-1"></i>\u4E00\u9375\u767B\u8A18\u7576\u524D Wi-Fi IP (\u96D9\u68E7 IPv4 + IPv6)';
    }
  }
  async function sendLineCommand(text) {
    if (liff.isInClient && liff.isInClient()) {
      try {
        await liff.sendMessages([{ type: "text", text }]);
        liff.closeWindow();
      } catch (e) {
        alert("\u767C\u9001\u5931\u6557\uFF0C\u8ACB\u76F4\u63A5\u5728\u804A\u5929\u5BA4\u8F38\u5165\u300C" + text + "\u300D");
      }
    } else {
      alert("\u5916\u90E8\u700F\u89BD\u5668\u7121\u6CD5\u76F4\u63A5\u9001\u51FA\u8A0A\u606F\uFF0C\u8ACB\u56DE\u5230 LINE \u804A\u5929\u5BA4\u8F38\u5165\u300C" + text + "\u300D");
    }
  }
  async function initLiff() {
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
        } catch (e) {
        }
        let freshUserId = "";
        let freshName = "";
        let freshPic = "";
        if (decoded && decoded.sub) {
          freshUserId = decoded.sub;
          freshName = decoded.name || displayName;
          freshPic = decoded.picture || "";
        } else {
          try {
            const profile = await liff.getProfile();
            freshUserId = profile.userId;
            freshName = profile.displayName;
            freshPic = profile.pictureUrl || "";
          } catch (e) {
          }
        }
        const userChanged = freshUserId && userId !== freshUserId;
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
        document.getElementById("userName").innerText = "LINE \u8A2A\u5BA2\u7528\u6236";
        document.getElementById("userProfileTag").innerText = "\u8A2A\u5BA2\u6253\u5361";
      }
    } catch (err) {
      console.warn("LIFF init error:", err);
      if (!cachedProfile) {
        document.getElementById("userName").innerText = "\u6A21\u64EC\u6E2C\u8A66\u54E1\u5DE5";
        document.getElementById("userProfileTag").innerText = "\u6E2C\u8A66\u6A21\u5F0F";
      }
    }
    const dispComp = document.getElementById("displayCompanyId");
    if (dispComp) dispComp.innerText = companyId;
    const dispDev = document.getElementById("displayDevice");
    if (dispDev) dispDev.innerText = getDeviceId().substring(0, 15) + "...";
    if (!cachedProfile) {
      const compTag = document.getElementById("companyTag");
      if (compTag) compTag.innerText = "\u{1F3E2} \u64DA\u9EDE\uFF1A" + companyId;
    }
    const empProfile = await checkUserPermissions();
    if (!empProfile || !empProfile.companyId) {
      showOnboardingView(empProfile);
      return;
    }
    showEnrolledView();
    const targetTab = getQueryParam("tab") || getQueryParam("view");
    if (targetTab === "admin") {
      if (canAccessAdminTab()) {
        switchView("admin");
      } else {
        switchView("checkin");
      }
    } else if (targetTab) {
      switchView(targetTab);
    } else {
      switchView("checkin");
    }
  }
  var pendingCheckinCoords = null;
  function showDeviceSwitchConfirmModal(msg) {
    const modal = document.getElementById("deviceSwitchModal");
    const msgEl = document.getElementById("deviceSwitchModalMsg");
    if (msgEl && msg) {
      msgEl.innerHTML = "\u70BA\u9632\u7BC4\u4EE3\u6253\u5361\uFF0C\u4F7F\u7528\u65B0\u624B\u6A5F\u6253\u5361\u5C07<strong>\u89E3\u9664\u820A\u8A2D\u5099\u7D81\u5B9A</strong>\u4E26<strong>\u901A\u5831\u4EBA\u4E8B\u90E8</strong>\u3002";
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
    if (btnText) btnText.innerText = "\u4E00\u9375\u6253\u5361";
    const alertBox = document.getElementById("statusAlert");
    if (alertBox) {
      alertBox.className = "mt-4 p-3 rounded-xl text-xs bg-gray-50 text-gray-600 border border-gray-200 block";
      alertBox.innerText = "\u5DF2\u53D6\u6D88\u63DB\u6A5F\u6253\u5361\uFF0C\u820A\u8A2D\u5099\u7DAD\u6301\u7D81\u5B9A\u3002";
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
    btnText.innerText = "\u53D6\u5F97\u5B9A\u4F4D\u4E2D...";
    alertBox.className = "mt-4 p-3 rounded-xl text-xs hidden";
    if (!navigator.geolocation) {
      showError("\u60A8\u7684\u88DD\u7F6E\u4E0D\u652F\u63F4 GPS \u5730\u7406\u5B9A\u4F4D\u3002");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      document.getElementById("displayLocation").innerText = lat.toFixed(4) + ", " + lon.toFixed(4);
      document.getElementById("displayAccuracy").innerText = "\xB1" + Math.round(acc) + "m";
      await submitCheckinPayload(lat, lon, acc, confirmSwitch);
    }, (err) => {
      showError("GPS \u5B9A\u4F4D\u5931\u6557 (" + err.message + ")\uFF0C\u8ACB\u78BA\u8A8D\u5DF2\u6388\u6B0A\u4F4D\u7F6E\u6B0A\u9650\u3002");
      btn.disabled = false;
      btnText.innerText = "\u91CD\u65B0\u6253\u5361";
    }, { enableHighAccuracy: true, timeout: 1e4 });
  }
  async function submitCheckinPayload(lat, lon, acc, confirmSwitch = false) {
    const btn = document.getElementById("checkinBtn");
    const btnText = document.getElementById("checkinBtnText");
    const alertBox = document.getElementById("statusAlert");
    btn.disabled = true;
    btnText.innerText = confirmSwitch ? "\u63DB\u6A5F\u6253\u5361\u4E2D..." : "\u9001\u51FA\u6253\u5361\u4E2D...";
    try {
      const resp = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: idToken || "demo_token",
          deviceId: getDeviceId(),
          companyId,
          latitude: lat,
          longitude: lon,
          accuracy: acc,
          fallbackUserId: userId,
          fallbackDisplayName: displayName,
          confirmDeviceSwitch: confirmSwitch === true
        })
      });
      const data = await resp.json();
      if (data.requireDeviceSwitchConfirm) {
        pendingCheckinCoords = { lat, lon, acc };
        btn.disabled = false;
        btnText.innerText = "\u66F4\u63DB\u8A2D\u5099\u78BA\u8A8D\u4E2D";
        showDeviceSwitchConfirmModal(data.message);
        return;
      }
      if (resp.ok && data.success) {
        pendingCheckinCoords = null;
        alertBox.className = "mt-4 p-3 rounded-xl text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 block";
        alertBox.innerHTML = `\u{1F389} <strong>${data.message}</strong>${data.deviceSwitched ? '<br><span class="text-amber-700 font-medium">\u{1F4F1} (\u5DF2\u66F4\u63DB\u7D81\u5B9A\u70BA\u6B64\u65B0\u8A2D\u5099\uFF0C\u5DF2\u901A\u5831\u4EBA\u4E8B\u90E8)</span>' : ""}<br>\u6642\u9593\uFF1A${data.checkinTime}<br>\u8DDD\u96E2\uFF1A${data.distanceMeters}m (${data.verifyMode === "IP_WHITELIST" ? "Wi-Fi" : "GPS"})`;
        btnText.innerText = "\u6253\u5361\u5B8C\u6210";
        setTimeout(() => {
          if (liff.isInClient()) liff.closeWindow();
        }, 2e3);
      } else {
        showError(data.error || "\u6253\u5361\u5931\u6557");
      }
    } catch (e) {
      showError("\u7DB2\u8DEF\u9023\u7DDA\u5931\u6557\uFF1A" + e.message);
    } finally {
      btn.disabled = false;
    }
  }
  function showError(msg) {
    const alertBox = document.getElementById("statusAlert");
    alertBox.className = "mt-4 p-3 rounded-xl text-xs bg-red-50 text-red-700 border border-red-200 block";
    alertBox.innerText = "\u26A0\uFE0F " + msg;
    document.getElementById("checkinBtnText").innerText = "\u91CD\u65B0\u6253\u5361";
    document.getElementById("checkinBtn").disabled = false;
  }
  function changeCalendarMonth(offset) {
    let monthInput = document.getElementById("calendarMonthInput");
    if (!monthInput) return;
    let val = monthInput.value;
    if (!val) {
      const d = /* @__PURE__ */ new Date();
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
    const hEl = document.getElementById("statTotalHours");
    if (hEl) hEl.innerText = (data.summary.total_work_hours || 0) + "h";
    const otEl = document.getElementById("statOvertimeHours");
    if (otEl) otEl.innerText = (data.summary.overtime_hours || 0) + "h";
    const lEl = document.getElementById("statLateCount");
    if (lEl) lEl.innerText = (data.summary.late_count || 0) + " \u6B21";
    const mEl = document.getElementById("statMissingCount");
    if (mEl) mEl.innerText = (data.summary.missing_punch_count || 0) + " \u6B21";
    const month = data.month;
    const [year, m] = month.split("-").map(Number);
    const firstDayOfWeek = new Date(Date.UTC(year, m - 1, 1)).getUTCDay();
    const totalDays = new Date(year, m, 0).getDate();
    let cellsHtml = "";
    for (let i = 0; i < firstDayOfWeek; i++) {
      cellsHtml += "<div></div>";
    }
    const todayStr = data && data.todayStr || new Date(Date.now() + 8 * 3600 * 1e3).toISOString().slice(0, 10);
    data.days.forEach((day) => {
      const dayNum = parseInt(day.date.split("-")[2], 10);
      const isToday = day.isToday || day.date === todayStr;
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
        dot = '<span class="text-[9px] font-bold text-emerald-600 leading-none">\u4ECA\u65E5</span>';
      } else if (day.status === "SCHEDULED") {
        bgClass = "bg-sky-50 border-sky-200 text-sky-800";
        dot = "";
      } else if (day.status === "UNSCHEDULED") {
        bgClass = "bg-white border-dashed border-gray-300 text-gray-400";
        dot = '<span class="text-[8px] text-gray-400 font-mono scale-90">\u672A\u6392</span>';
      } else if (day.status === "UNSCHEDULED_WORK") {
        bgClass = "bg-indigo-50 border-indigo-200 text-indigo-800";
        dot = '<span class="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block"></span>';
      } else if (day.isRestDay) {
        bgClass = "bg-gray-100 border-gray-200 text-gray-400";
      }
      cellsHtml += `
          <button onclick="selectDayDetail('${day.date}')" class="h-11 rounded-xl border ${bgClass}${todayRing} flex flex-col items-center justify-center p-1 text-xs hover:border-emerald-500 transition">
            <span class="text-[11px] leading-tight font-mono">${dayNum}</span>
            <div class="h-2 flex items-center justify-center">${dot}</div>
          </button>
        `;
    });
    const grid = document.getElementById("calendarDaysGrid");
    if (grid) grid.innerHTML = cellsHtml;
    const hasToday = data.days.some((d) => d.date === todayStr);
    if (hasToday) {
      selectDayDetail(todayStr);
    } else if (data.days.length > 0) {
      selectDayDetail(data.days[0].date);
    }
  }
  async function loadMonthlyAttendance() {
    let monthInput = document.getElementById("calendarMonthInput");
    if (monthInput && !monthInput.value) {
      const d = /* @__PURE__ */ new Date();
      monthInput.value = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    }
    const month = monthInput.value;
    const grid = document.getElementById("calendarDaysGrid");
    const attCacheKey = "att_cache_" + userId + "_" + month;
    let cachedMonthData = null;
    try {
      const raw = sessionStorage.getItem(attCacheKey);
      if (raw) cachedMonthData = JSON.parse(raw);
    } catch (e) {
    }
    if (cachedMonthData && cachedMonthData.days) {
      renderAttendanceGrid(cachedMonthData);
    } else if (grid && (!monthlyDataCache || monthlyDataCache.month !== month)) {
      grid.innerHTML = '<div class="col-span-7 py-8 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin mr-1"></i>\u8F09\u5165\u4E2D...</div>';
    }
    if (!userId || userId === "DEMO_USER") return;
    try {
      const resp = await fetch("/api/v1/attendance/monthly?userId=" + encodeURIComponent(userId) + "&month=" + encodeURIComponent(month) + "&companyId=" + encodeURIComponent(companyId));
      const data = await resp.json();
      if (!data.success) {
        if (!cachedMonthData && grid) {
          grid.innerHTML = '<div class="col-span-7 py-6 text-center text-red-500 text-xs">\u8F09\u5165\u5931\u6557: ' + data.error + "</div>";
        }
        return;
      }
      try {
        sessionStorage.setItem(attCacheKey, JSON.stringify(data));
      } catch (e) {
      }
      renderAttendanceGrid(data);
    } catch (err) {
      if (!cachedMonthData && grid) {
        grid.innerHTML = '<div class="col-span-7 py-6 text-center text-red-500 text-xs">\u8F09\u5165\u932F\u8AA4: ' + err.message + "</div>";
      }
    }
  }
  function selectDayDetail(dateStr) {
    if (!monthlyDataCache || !monthlyDataCache.days) return;
    const day = monthlyDataCache.days.find((d) => d.date === dateStr);
    if (!day) return;
    const card = document.getElementById("dayDetailCard");
    card.classList.remove("hidden");
    document.getElementById("detailDateText").innerText = day.date + " \u51FA\u52E4\u660E\u7D30 (" + (day.shiftName || "\u5E38\u614B\u73ED") + ")";
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
    document.getElementById("detailScheduleTime").innerText = day.shiftStart && day.shiftEnd ? `${day.shiftStart} ~ ${day.shiftEnd}` : day.status === "UNSCHEDULED" || day.status === "UNSCHEDULED_WORK" ? "\u672A\u6392\u73ED" : day.isRestDay ? "\u4F8B\u5047/\u4F11" : "-";
    let workHoursDisplay = "-";
    if (day.workHours > 0) {
      workHoursDisplay = `${day.workHours} \u5C0F\u6642`;
    } else if (day.overtimeHours > 0) {
      workHoursDisplay = `\u52A0\u73ED ${day.overtimeHours}h`;
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
        const lType = day.shiftName && day.shiftName.includes("\u8ACB\u5047") ? day.shiftName : "\u8ACB\u5047";
        leaveHoursEl.innerText = `${day.leaveHours} \u5C0F\u6642 (${lType})`;
      }
    } else {
      if (leaveRow) {
        leaveRow.classList.add("hidden");
        leaveRow.classList.remove("flex");
      }
    }
    const list = document.getElementById("detailPunchesList");
    if (day.punches && day.punches.length > 0) {
      list.innerHTML = "<strong>\u7576\u65E5\u6253\u5361\u6D41\u6C34\uFF1A</strong><br>" + day.punches.map((p) => {
        const t = p.punch_type === "IN" ? "\u{1F7E2} \u4E0A\u73ED" : "\u{1F534} \u4E0B\u73ED";
        const v = p.verify_mode === "IP_WHITELIST" ? "Wi-Fi" : "GPS";
        return "\u2022 " + p.created_at.slice(11, 16) + " " + t + " (" + v + ", " + Math.round(p.distance_meters) + "m)";
      }).join("<br>");
    } else {
      list.innerHTML = day.isRestDay ? "\u26AA \u4ECA\u65E5\u70BA\u6392\u5B9A\u4F11\u5047\u65E5\uFF0C\u7121\u6253\u5361\u7D00\u9304\u3002" : "\u26A0\uFE0F \u7576\u65E5\u7121\u6253\u5361\u7D00\u9304\u3002";
    }
  }
  function setApprType(type) {
    currentApprType = type;
    ["LEAVE", "CORRECTION", "OVERTIME"].forEach((t) => {
      const btn = document.getElementById("typeBtn-" + t);
      const fields = document.getElementById("fields-" + t);
      if (t === type) {
        btn.className = "py-2 px-1 rounded-xl font-bold bg-amber-50 text-amber-700 border border-amber-300 flex items-center justify-center space-x-1";
        fields.classList.remove("hidden");
      } else {
        btn.className = "py-2 px-1 rounded-xl font-medium bg-gray-50 text-gray-600 border border-gray-200 flex items-center justify-center space-x-1";
        fields.classList.add("hidden");
      }
    });
    onApprDateChange();
  }
  function handleApprProofSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("\u8ACB\u9078\u64C7\u5716\u7247\u6A94\u6848 (JPG / PNG / WebP)");
      event.target.value = "";
      return;
    }
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("\u7167\u7247\u6A94\u6848\u904E\u5927 (\u4E0A\u9650 5MB)\uFF0C\u8ACB\u58D3\u7E2E\u6216\u66F4\u63DB\u7167\u7247\u5F8C\u518D\u8A66\u3002");
      event.target.value = "";
      return;
    }
    selectedApprProofFile = file;
    const emptyState = document.getElementById("apprProofEmptyState") || document.getElementById("leaveProofEmptyState");
    const previewState = document.getElementById("apprProofPreviewState") || document.getElementById("leaveProofPreviewState");
    const filenameEl = document.getElementById("apprProofFilename") || document.getElementById("leaveProofFilename");
    const filesizeEl = document.getElementById("apprProofFilesize") || document.getElementById("leaveProofFilesize");
    const thumbnailEl = document.getElementById("apprProofThumbnail") || document.getElementById("leaveProofThumbnail");
    if (filenameEl) filenameEl.innerText = file.name;
    if (filesizeEl) filesizeEl.innerText = (file.size / 1024).toFixed(1) + " KB";
    const reader = new FileReader();
    reader.onload = function(e) {
      if (thumbnailEl && e.target) thumbnailEl.src = e.target.result;
    };
    reader.readAsDataURL(file);
    if (emptyState) emptyState.classList.add("hidden");
    if (previewState) previewState.classList.remove("hidden");
  }
  function removeApprProof(event) {
    if (event) event.stopPropagation();
    selectedApprProofFile = null;
    const fileInput = document.getElementById("apprProof") || document.getElementById("leaveProof");
    if (fileInput) fileInput.value = "";
    const emptyState = document.getElementById("apprProofEmptyState") || document.getElementById("leaveProofEmptyState");
    const previewState = document.getElementById("apprProofPreviewState") || document.getElementById("leaveProofPreviewState");
    const thumbnailEl = document.getElementById("apprProofThumbnail") || document.getElementById("leaveProofThumbnail");
    if (emptyState) emptyState.classList.remove("hidden");
    if (previewState) previewState.classList.add("hidden");
    if (thumbnailEl) thumbnailEl.src = "";
  }
  function setApprSubmitBlocked(blocked) {
    const btn = document.getElementById("apprSubmitBtn");
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
    const targetDateEl = document.getElementById("apprTargetDate");
    if (!targetDateEl) return;
    const targetDate = targetDateEl.value;
    const noticeBox = document.getElementById("leavePunchNotice");
    const noticeText = document.getElementById("leavePunchNoticeText");
    if (!targetDate || !noticeBox || !noticeText) return;
    setApprSubmitBlocked(false);
    if (currentApprType === "LEAVE") {
      let day = null;
      if (monthlyDataCache && monthlyDataCache.days) {
        day = monthlyDataCache.days.find((d) => d.date === targetDate);
      }
      let isWeekend = false;
      let weekendText = "";
      const parts = targetDate.split("-").map(Number);
      const dow = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
      if (dow === 0 || dow === 6) {
        isWeekend = true;
        weekendText = dow === 0 ? "\u9031\u65E5\u4F8B\u5047" : "\u9031\u516D\u4F8B\u5047";
      }
      if (day ? day.isRestDay && !day.isLeave : isWeekend) {
        const restReason = day && day.shiftName || weekendText || "\u6392\u5B9A\u4F11\u5047\u65E5";
        noticeBox.className = "p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center space-x-1";
        noticeText.innerHTML = "<strong>\u26A0\uFE0F \u63D0\u793A\uFF1A</strong>" + targetDate + " \u70BA\u975E\u5DE5\u4F5C\u65E5 / \u4F11\u5047\u65E5\uFF08" + restReason + "\uFF09\uFF0C\u7121\u9808\u8ACB\u5047\u3002";
        noticeBox.classList.remove("hidden");
        setApprSubmitBlocked(true);
        return;
      }
      if (day && day.status === "LEAVE") {
        noticeBox.className = "p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center space-x-1";
        noticeText.innerHTML = "<strong>\u26A0\uFE0F \u63D0\u793A\uFF1A</strong>" + targetDate + " \u5DF2\u6838\u51C6\u5168\u5929\u8ACB\u5047\uFF08" + (day.shiftName || "\u8ACB\u5047") + "\uFF09\uFF0C\u7121\u9808\u91CD\u8907\u8ACB\u5047\u3002";
        noticeBox.classList.remove("hidden");
        setApprSubmitBlocked(true);
        return;
      }
      if (day && day.status === "NORMAL") {
        const hasOutPunch = Array.isArray(day.punches) && day.punches.some((p) => p.punch_type === "OUT");
        if (day.isToday && !hasOutPunch) {
          noticeBox.className = "p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800 flex items-center space-x-1";
          noticeText.innerHTML = "<strong>\u{1F4A1} \u63D0\u793A\uFF1A</strong>\u4ECA\u65E5\u51FA\u52E4\u9032\u884C\u4E2D\uFF0C\u82E5\u9700\u63D0\u524D\u65E9\u9000\u6216\u8ACB\u5047\uFF0C\u8ACB\u9078\u64C7\u8ACB\u5047\u6642\u6BB5\u5F8C\u9001\u51FA\u3002";
          noticeBox.classList.remove("hidden");
          setApprSubmitBlocked(false);
          return;
        } else {
          const note = day.isLeave ? "\u5DF2\u7531\u5148\u524D\u8ACB\u5047\u5168\u984D\u62B5\u5145\uFF08\u51FA\u52E4 " + day.workHours + "h + \u8ACB\u5047 " + day.leaveHours + "h\uFF09" : "\u51FA\u52E4\u7D00\u9304\u6B63\u5E38\u4E14\u5DF2\u6253\u6EFF\u6392\u73ED\u5DE5\u6642\uFF08\u51FA\u52E4 " + day.workHours + "h\uFF09";
          noticeBox.className = "p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center space-x-1";
          noticeText.innerHTML = "<strong>\u26A0\uFE0F \u63D0\u793A\uFF1A</strong>\u8A72\u65E5\uFF08" + targetDate + "\uFF09" + note + "\uFF0C\u67E5\u7121\u7F3A\u52E4\u6642\u6BB5\uFF0C\u7121\u9808\u8ACB\u5047\u3002";
          noticeBox.classList.remove("hidden");
          setApprSubmitBlocked(true);
          return;
        }
      }
      if (day && ["ABSENT", "LATE", "EARLY_LEAVE", "LATE_AND_EARLY", "MISSING_IN", "MISSING_OUT"].includes(day.status)) {
        noticeBox.className = "p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 flex items-center space-x-1";
        noticeText.innerHTML = "<strong>\u{1F4A1} \u7F3A\u52E4\u6642\u6BB5\u5075\u6E2C\uFF1A</strong>" + day.statusText + "\uFF08\u5DF2\u51FA\u52E4 " + day.workHours + " \u5C0F\u6642\uFF09\uFF0C\u8ACB\u9078\u64C7\u5047\u5225\u8207\u62B5\u5145\u6642\u6BB5\u3002";
        noticeBox.classList.remove("hidden");
        setApprSubmitBlocked(false);
        return;
      }
      if (day && (day.status === "SCHEDULED" || day.status === "TODAY")) {
        noticeBox.className = "p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800 flex items-center space-x-1";
        noticeText.innerHTML = "<strong>\u{1F4C5} \u4E8B\u524D\u8ACB\u5047\uFF1A</strong>" + targetDate + " \u6392\u5B9A\u73ED\u8868\uFF08" + (day.shiftName || "\u5E38\u614B\u73ED") + "\uFF09\uFF0C\u53EF\u9810\u5148\u63D0\u4EA4\u8ACB\u5047\u7533\u8ACB\u3002";
        noticeBox.classList.remove("hidden");
        setApprSubmitBlocked(false);
        return;
      }
    }
    noticeBox.className = "p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800 hidden";
    noticeBox.classList.add("hidden");
  }
  function initApprovalForm() {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const targetInput = document.getElementById("apprTargetDate");
    if (!targetInput.value) {
      targetInput.value = today;
    }
    onApprDateChange();
  }
  async function handleApprSubmit(event) {
    event.preventDefault();
    const btn = document.getElementById("apprSubmitBtn");
    const btnText = document.getElementById("apprSubmitBtnText");
    const alertBox = document.getElementById("apprAlert");
    if (btn && (btn.dataset.blocked === "true" || btn.disabled)) {
      return;
    }
    if (btn) btn.disabled = true;
    if (btnText) btnText.innerText = "\u50B3\u9001\u7533\u8ACB\u4E2D...";
    if (alertBox) alertBox.className = "p-3 rounded-xl text-xs hidden";
    try {
      const targetDateEl = document.getElementById("apprTargetDate");
      const reasonEl = document.getElementById("apprReason");
      const targetDate = targetDateEl ? targetDateEl.value : "";
      const reason = reasonEl ? reasonEl.value.trim() : "";
      if (!targetDate) {
        throw new Error("\u8ACB\u9078\u64C7\u7533\u8ACB\u6D89\u53CA\u65E5\u671F");
      }
      let details = { reason };
      if (currentApprType === "LEAVE") {
        const leaveTypeEl = document.getElementById("apprLeaveType");
        const leaveTimeEl = document.getElementById("apprLeaveTime");
        details.leave_type = leaveTypeEl ? leaveTypeEl.value : "\u4E8B\u5047";
        details.time_range = leaveTimeEl ? leaveTimeEl.value : "\u5168\u5929";
      } else if (currentApprType === "CORRECTION") {
        const punchTypeEl = document.getElementById("apprCorrectionPunchType");
        const punchTimeEl = document.getElementById("apprCorrectionTime");
        details.punch_type = punchTypeEl ? punchTypeEl.value : "IN";
        details.time = punchTimeEl ? punchTimeEl.value : "09:00";
      } else if (currentApprType === "OVERTIME") {
        const otHoursEl = document.getElementById("apprOtHours");
        const otTimeEl = document.getElementById("apprOtTime");
        details.hours = parseFloat(otHoursEl && otHoursEl.value || "1");
        details.time_range = otTimeEl && otTimeEl.value.trim() || "\u4E0B\u73ED\u5F8C";
      }
      if (selectedApprProofFile) {
        if (btnText) btnText.innerText = "\u4E0A\u50B3\u4F50\u8B49\u6A94\u6848\u4E2D...";
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
            alertBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-base text-red-600"></i><div><strong>\u4F50\u8B49\u6A94\u6848\u4E0A\u50B3\u5931\u6557\uFF1A</strong>' + (uploadData.error || "\u672A\u77E5\u932F\u8AA4") + "</div>";
          }
          return;
        }
        details.attachment_key = uploadData.key;
        details.attachment_url = uploadData.url;
        if (btnText) btnText.innerText = "\u50B3\u9001\u7533\u8ACB\u4E2D...";
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
          alertBox.innerHTML = '<i class="fa-solid fa-circle-check text-base text-emerald-600"></i><div><strong>\u7533\u8ACB\u6210\u529F\uFF01</strong>' + data.message + "</div>";
        }
        const reasonInput = document.getElementById("apprReason");
        if (reasonInput) reasonInput.value = "";
        removeApprProof();
        loadMyApprovals();
      } else {
        if (alertBox) {
          alertBox.className = "p-3 rounded-xl text-xs bg-red-50 text-red-800 border border-red-200 flex items-center space-x-2";
          alertBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-base text-red-600"></i><div><strong>\u9001\u51FA\u5931\u6557\uFF1A</strong>' + (data.error || "\u672A\u77E5\u932F\u8AA4") + "</div>";
        }
      }
    } catch (err) {
      if (alertBox) {
        alertBox.className = "p-3 rounded-xl text-xs bg-red-50 text-red-800 border border-red-200";
        alertBox.innerHTML = "<strong>\u767C\u751F\u7570\u5E38\uFF1A</strong>" + err.message;
      }
    } finally {
      if (btn) btn.disabled = false;
      if (btnText) btnText.innerText = "\u9001\u51FA\u7533\u8ACB";
    }
  }
  function renderApprovalsList(approvals) {
    const list = document.getElementById("myApprovalsList");
    if (!list) return;
    if (!approvals || approvals.length === 0) {
      list.innerHTML = '<div class="py-6 text-center text-gray-400">\u5C1A\u672A\u6709\u4EFB\u4F55\u7533\u8ACB\u7D00\u9304\u3002</div>';
      return;
    }
    list.innerHTML = approvals.map((appr) => {
      let typeLabel = "\u{1F4CB} \u7533\u8ACB";
      if (appr.type === "LEAVE") typeLabel = "\u{1F334} \u8ACB\u5047";
      else if (appr.type === "CORRECTION") typeLabel = "\u23F0 \u88DC\u5361";
      else if (appr.type === "OVERTIME") typeLabel = "\u{1F525} \u52A0\u73ED";
      let statusBadge = "";
      if (appr.status === "APPROVED") {
        statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">\u2705 \u5DF2\u6838\u51C6</span>';
      } else if (appr.status === "REJECTED") {
        statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">\u5DF2\u99C1\u56DE</span>';
      } else {
        statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">\u{1F7E1} \u5BE9\u6838\u4E2D</span>';
      }
      let detailsObj = {};
      try {
        detailsObj = JSON.parse(appr.details || "{}");
      } catch (e) {
      }
      const note = detailsObj.reason ? '<div class="text-[11px] text-gray-500 mt-1">\u4E8B\u7531\uFF1A' + detailsObj.reason + "</div>" : "";
      const rejectNote = appr.status === "REJECTED" && detailsObj.reject_reason ? '<div class="text-[11px] text-slate-700 font-semibold mt-1">\u99C1\u56DE\u539F\u56E0\uFF1A' + detailsObj.reject_reason + "</div>" : "";
      const attachLink = detailsObj.attachment_url ? '<div class="mt-1"><a href="' + detailsObj.attachment_url + '" target="_blank" class="inline-flex items-center space-x-1 text-[11px] text-blue-600 hover:underline bg-blue-50/80 px-2 py-0.5 rounded-md border border-blue-100 font-medium"><i class="fa-solid fa-paperclip text-[10px]"></i><span>\u67E5\u770B\u8B49\u660E\u6587\u4EF6</span></a></div>' : "";
      return '<div class="bg-gray-50 p-3 rounded-2xl border border-gray-100 space-y-1"><div class="flex items-center justify-between"><span class="font-bold text-gray-800">' + typeLabel + " - " + appr.target_date + "</span>" + statusBadge + "</div>" + note + attachLink + rejectNote + '<div class="text-[10px] text-gray-400 flex justify-between pt-1 border-t border-gray-200/50"><span>\u55AE\u865F\uFF1A' + appr.id.substring(0, 12) + "...</span><span>" + appr.created_at + "</span></div></div>";
    }).join("");
  }
  async function loadMyApprovals() {
    const list = document.getElementById("myApprovalsList");
    if (!list) return;
    const cacheKey = "appr_cache_" + userId;
    let cachedAppr = null;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) cachedAppr = JSON.parse(raw);
    } catch (e) {
    }
    if (cachedAppr && cachedAppr.length > 0) {
      renderApprovalsList(cachedAppr);
    } else {
      list.innerHTML = '<div class="py-4 text-center text-gray-400">\u8F09\u5165\u4E2D...</div>';
    }
    if (!userId || userId === "DEMO_USER") return;
    try {
      const resp = await fetch("/api/v1/approval/my?userId=" + encodeURIComponent(userId));
      const data = await resp.json();
      if (!data.success || !data.approvals || data.approvals.length === 0) {
        list.innerHTML = '<div class="py-6 text-center text-gray-400">\u5C1A\u672A\u6709\u4EFB\u4F55\u7533\u8ACB\u7D00\u9304\u3002</div>';
        try {
          sessionStorage.removeItem(cacheKey);
        } catch (e) {
        }
        return;
      }
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(data.approvals));
      } catch (e) {
      }
      renderApprovalsList(data.approvals);
    } catch (err) {
      if (!cachedAppr) {
        list.innerHTML = '<div class="py-4 text-center text-red-500">\u8F09\u5165\u5931\u6557: ' + err.message + "</div>";
      }
    }
  }
  var touchStartX = 0;
  var touchStartY = 0;
  var touchStartTime = 0;
  function initSwipeGestures() {
    const mainContainer = document.querySelector("main") || document.body;
    mainContainer.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
    }, { passive: true });
    mainContainer.addEventListener("touchend", (e) => {
      if (e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      const duration = Date.now() - touchStartTime;
      if (duration < 600 && Math.abs(deltaX) >= 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
        const target = e.target;
        if (target) {
          const tag = target.tagName ? target.tagName.toLowerCase() : "";
          if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
            return;
          }
        }
        const tabs = getAvailableTabs();
        const currentIndex = tabs.indexOf(currentActiveTab);
        if (currentIndex === -1) return;
        if (deltaX < -50 && currentIndex < tabs.length - 1) {
          switchView(tabs[currentIndex + 1]);
        } else if (deltaX > 50 && currentIndex > 0) {
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
  Object.assign(window, {
    LIFF_ID,
    handleJoinCompany,
    showEnrolledView,
    showOnboardingView,
    closeSuccessModalAndGoToCheckin,
    handleModalFriendClick,
    checkFriendshipStatus,
    switchView,
    changeCalendarMonth,
    selectDayDetail,
    setApprType,
    removeApprProof,
    loadMyApprovals,
    performCheckin,
    registerCurrentWifiIp,
    sendLineCommand,
    cancelDeviceSwitch,
    confirmAndExecuteDeviceSwitch,
    getAvailableTabs,
    canAccessAdminTab,
    initLiff,
    initSwipeGestures,
    handleApprSubmit,
    onApprDateChange,
    handleApprProofSelected,
    loadMonthlyAttendance,
    renderAttendanceGrid
  });
})();
