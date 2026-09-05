import { renderLiffHtml } from "./liff-html";
import { renderLocalAdminHtml } from "./local-admin-html";

export interface Env {
  DB: D1Database;
  LINE_LOGIN_CHANNEL_ID?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
  LINE_BOT_BASIC_ID?: string;
  TARGET_LAT?: string;
  TARGET_LON?: string;
  ALLOWED_RADIUS_METERS?: string;
  LOCATION_NAME?: string;
  LIFF_ID?: string;
  ADMIN_MASTER_KEY?: string;
}

interface CheckinPayload {
  idToken: string;
  deviceId: string;
  companyId?: string; // May be '24549210' or '24549210-01'
  latitude: number;
  longitude: number;
  accuracy?: number;
  fallbackUserId?: string;
  fallbackDisplayName?: string;
  confirmDeviceSwitch?: boolean;
}

interface SwitchDevicePayload {
  idToken: string;
  deviceId: string;
  fallbackUserId?: string;
  fallbackDisplayName?: string;
}

interface LocationPayload {
  id: string;             // '24549210' or '24549210-01'
  name: string;           // '豬毛有限公司 - 台中美德總部'
  address: string;        // '台中市北區美德街56-11號'
  target_lat?: number;
  target_lon?: number;
  allowed_radius?: number;
  allowed_ips?: string | null; // e.g. '211.20.1.5, 114.33.20.0/24'
  manager_line_id?: string | null; // e.g. 'U1234567890abcdef' (Fallback Approver)
}

export interface DailySchedule {
  work_date: string;
  shift_name: string;
  shift_start: string | null;
  shift_end: string | null;
  break_minutes: number;
  is_rest_day: number;
  is_cross_day: number;
}

// ==================== Tenant Key & Auth Utilities ====================

export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key.trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface TenantAuthResult {
  authenticated: boolean;
  taxId?: string;
  role?: "ADMIN" | "READ_ONLY" | "SANDBOX_QA" | "MANAGER" | "VIEWER";
  name?: string;
  userId?: number;
  authType?: "SESSION" | "API_KEY";
  error?: string;
  status?: number;
}

export async function authenticateTenantRequest(
  request: Request,
  db: D1Database
): Promise<TenantAuthResult> {
  const authHeader = request.headers.get("X-Tenant-Key") || request.headers.get("Authorization");
  if (!authHeader) {
    return { authenticated: false, error: "缺少授權憑證 (請於 Header 帶入 Authorization: Bearer <token> 或 X-Tenant-Key: <key>)", status: 401 };
  }

  const tokenOrKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();
  if (!tokenOrKey) {
    return { authenticated: false, error: "無效的空授權憑證", status: 401 };
  }

  // 1. Check if it is a Web Admin Session Token (prefixed with sess_)
  if (tokenOrKey.startsWith("sess_")) {
    const sessionHash = await hashApiKey(tokenOrKey);
    const session = await db.prepare(`
      SELECT s.id, s.user_id, s.tax_id, s.role, s.expires_at, u.display_name, u.is_active as user_active
      FROM tenant_sessions s
      JOIN tenant_users u ON s.user_id = u.id
      WHERE s.token_hash = ?
    `).bind(sessionHash).first<{ id: number; user_id: number; tax_id: string; role: string; expires_at: string; display_name: string; user_active: number }>();

    if (!session) {
      return { authenticated: false, error: "無效或已過期之登入 Session", status: 401 };
    }

    if (session.user_active !== 1) {
      return { authenticated: false, error: "此管理員帳號已被停用", status: 403 };
    }

    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    if (session.expires_at < now) {
      try {
        await db.prepare("DELETE FROM tenant_sessions WHERE id = ?").bind(session.id).run();
      } catch (e) {}
      return { authenticated: false, error: "登入 Session 已過期，請重新登入", status: 401 };
    }

    return {
      authenticated: true,
      taxId: session.tax_id,
      role: session.role as any,
      name: session.display_name,
      userId: session.user_id,
      authType: "SESSION"
    };
  }

  // 2. Check if it is an M2M API Key
  const hashedKey = await hashApiKey(tokenOrKey);
  const keyRecord = await db.prepare(
    "SELECT id, tax_id, role, name, is_active FROM tenant_api_keys WHERE api_key_hash = ?"
  ).bind(hashedKey).first<{ id: number; tax_id: string; role: string; name: string; is_active: number }>();

  if (!keyRecord) {
    return { authenticated: false, error: "未授權之租戶金鑰 (Invalid Tenant API Key)", status: 401 };
  }

  if (keyRecord.is_active !== 1) {
    return { authenticated: false, error: "此租戶金鑰已被停用 (Deactivated Key)", status: 403 };
  }

  // Update last_used_at non-blocking
  try {
    await db.prepare("UPDATE tenant_api_keys SET last_used_at = datetime('now', '+8 hours') WHERE id = ?").bind(keyRecord.id).run();
  } catch (e) {
    // Non-blocking
  }

  return {
    authenticated: true,
    taxId: keyRecord.tax_id,
    role: keyRecord.role as any,
    name: keyRecord.name,
    authType: "API_KEY"
  };
}


// Convert IPv4 string to 32-bit unsigned integer
export function ip4ToLong(ip: string): number | null {
  if (!ip || typeof ip !== "string") return null;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (isNaN(n) || n < 0 || n > 255 || p !== n.toString()) return null;
    num = (num << 8) + n;
  }
  return (num >>> 0);
}

// Check if client IP matches single IP or CIDR rule (IPv4 / IPv6)
export function isIpInAllowedList(clientIp: string, allowedIpsStr: string | null | undefined): boolean {
  if (!allowedIpsStr || !allowedIpsStr.trim()) return true; // NULL/empty = unrestricted
  if (!clientIp || clientIp === "unknown") return false;

  const cleanClient = clientIp.trim();
  const rules = allowedIpsStr.split(",").map(s => s.trim()).filter(Boolean);
  if (rules.length === 0) return true;

  const clientV4 = ip4ToLong(cleanClient);

  for (const rule of rules) {
    if (rule.includes("/")) {
      const [netStr, maskStr] = rule.split("/");
      const maskBits = parseInt(maskStr, 10);
      if (isNaN(maskBits)) continue;

      if (clientV4 !== null) {
        const netV4 = ip4ToLong(netStr);
        if (netV4 !== null && maskBits >= 0 && maskBits <= 32) {
          const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
          if ((clientV4 & mask) === (netV4 & mask)) {
            return true;
          }
        }
      } else {
        if (cleanClient.toLowerCase().startsWith(netStr.toLowerCase())) {
          return true;
        }
      }
    } else {
      if (rule.toLowerCase() === cleanClient.toLowerCase()) {
        return true;
      }
    }
  }

  return false;
}

// Validate format of allowed_ips string
export function isValidAllowedIpsFormat(allowedIps: string): boolean {
  if (!allowedIps || !allowedIps.trim()) return true;
  const items = allowedIps.split(",").map(s => s.trim()).filter(Boolean);
  if (items.length === 0) return true;

  for (const item of items) {
    if (item.includes("/")) {
      const [ip, mask] = item.split("/");
      const m = parseInt(mask, 10);
      if (isNaN(m)) return false;
      if (ip.includes(":")) {
        if (m < 0 || m > 128) return false;
      } else {
        if (m < 0 || m > 32 || ip4ToLong(ip) === null) return false;
      }
    } else {
      if (!item.includes(":") && ip4ToLong(item) === null) {
        return false;
      }
    }
  }
  return true;
}

// 台灣統一編號官方檢驗演算法 + 測試沙盒統編放行
export function isValidTaiwanTaxId(taxId: string): boolean {
  if (!taxId || typeof taxId !== "string") return false;
  
  const cleanId = taxId.trim().split("-")[0];
  if (!/^\d{8}$/.test(cleanId)) return false;

  // 放行專用沙盒統編 (QA Sandbox)
  if (cleanId === "00000000" || cleanId === "99999999") return true;

  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  let sum = 0;

  for (let i = 0; i < 8; i++) {
    const digit = parseInt(cleanId[i], 10);
    const product = digit * weights[i];
    sum += Math.floor(product / 10) + (product % 10);
  }

  if (sum % 5 === 0) return true;

  if (cleanId[6] === "7") {
    if ((sum - 9) % 5 === 0 || (sum + 1) % 5 === 0) return true;
  }

  return false;
}

// 自動地址轉經緯度 (Progressive Auto-Geocoding for Taiwan addresses)
export async function autoGeocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  if (!address || typeof address !== "string") return null;

  const raw = address.trim();
  const queries: string[] = [raw];

  const cleanStreet = raw.replace(/\d+[-~至之\d]*號.*$/, "");
  if (cleanStreet && cleanStreet !== raw) {
    queries.push(cleanStreet);
  }

  queries.push(raw.replace(/(市|縣)(.+?區)/, "$1"));
  if (cleanStreet) {
    queries.push(cleanStreet.replace(/(市|縣)(.+?區)/, "$1"));
  }

  for (const q of queries) {
    const qClean = q.trim();
    if (!qClean) continue;

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(qClean)}&format=json&limit=1&countrycodes=tw`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Antigravity-LINE-Checkin/1.0 (contact@checkin.local)" }
      });
      if (resp.ok) {
        const data = (await resp.json()) as any;
        if (data && data.length > 0) {
          return {
            lat: parseFloat(parseFloat(data[0].lat).toFixed(6)),
            lon: parseFloat(parseFloat(data[0].lon).toFixed(6))
          };
        }
      }
    } catch (e) {
      console.error("Nominatim query failed for:", qClean, e);
    }
  }

  return null;
}

// 複合性資料拆解工具 (Decomposition Helper)
export function decomposeLocation(loc: any) {
  const id = loc.id || "";
  const name = loc.name || "";
  
  const hasHyphen = id.includes("-");
  const taxId = hasHyphen ? id.split("-")[0] : id;
  const branchCode = hasHyphen ? id.split("-").slice(1).join("-") : "HQ";

  const hasNameSplit = name.includes(" - ");
  const companyName = hasNameSplit ? name.split(" - ")[0] : name;
  const branchName = hasNameSplit ? name.split(" - ").slice(1).join(" - ") : "總部";

  const allowedIps = loc.allowed_ips ? loc.allowed_ips.trim() : null;

  return {
    id: loc.id,
    taxId,
    branchCode,
    name: loc.name,
    companyName,
    branchName,
    address: loc.address || "",
    target_lat: loc.target_lat,
    target_lon: loc.target_lon,
    allowed_radius: loc.allowed_radius || 100,
    allowed_ips: allowedIps,
    has_ip_whitelist: !!allowedIps,
    manager_line_id: loc.manager_line_id || null,
    created_at: loc.created_at
  };
}

// Haversine formula to compute distance in meters
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Parse "HH:MM" to minutes from 00:00
export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || !timeStr.includes(":")) return null;
  const parts = timeStr.trim().split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

// ==================== Granular Permission-Based Access Control (PBAC) ====================

export const ALL_PERMISSIONS = [
  "punch",          // 基礎打卡與月曆
  "apply",          // 發起請假/補卡/加班
  "approve",        // 審核簽核單據
  "view_store",     // 門市看板 (查看本店今日出勤與班表)
  "view_all",       // 全局看板 (查看跨分店出勤與工時)
  "set_location",   // 座標設定 (LINE 位置訊息直接設定門市經緯度)
  "set_wifi",       // Wi-Fi 登記 (登記當前連線 IP 為白名單)
  "device_audit",   // 換機解綁與資安警訊監控
  "export_payroll", // 計薪匯出 (產生 CSV 下載連結)
  "broadcast"       // 公告推播 (推播全體/門市訊息)
] as const;

export type PermissionCode = typeof ALL_PERMISSIONS[number];

export const PERMISSION_LABELS: Record<string, string> = {
  punch: "基礎打卡",
  apply: "線上申請",
  approve: "假勤審批",
  view_store: "門市看板",
  view_all: "全局看板",
  set_location: "座標設定",
  set_wifi: "Wi-Fi綁定",
  device_audit: "換機解綁",
  export_payroll: "計薪匯出",
  broadcast: "公告推播"
};

export const EMPLOYEE_RICH_MENU_ID = "richmenu-120970060b421fd2a35634007795916f";
export const MANAGER_RICH_MENU_ID = "richmenu-26e2f94f69a7e091962de3f22e6b6361";

export const MANAGEMENT_PERMISSIONS = [
  "view_store", "view_all", "approve", "set_location", "set_wifi", "device_audit", "export_payroll", "broadcast", "all", "admin"
];

export async function syncUserRichMenu(token: string, userId: string, permissions: string[], isManager: boolean = false) {
  if (!token || !userId) return;
  const isManagerRole = isManager || permissions.some(p => MANAGEMENT_PERMISSIONS.includes(p));
  try {
    if (isManagerRole) {
      await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(userId)}/richmenu/${MANAGER_RICH_MENU_ID}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
    } else {
      await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(userId)}/richmenu`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
    }
  } catch (err) {
    console.error(`Failed to sync rich menu for ${userId}:`, err);
  }
}

export interface UserPermissionContext {
  companyId: string | null;
  companyName: string | null;
  employeeName: string | null;
  permissions: string[];
  isManager: boolean;
}

export async function getUserPermissionContext(env: Env, lineUserId: string): Promise<UserPermissionContext> {
  const emp = await env.DB.prepare(`
    SELECT ce.company_id, ce.employee_name, ce.permissions, l.name as company_name, l.manager_line_id
    FROM company_employees ce
    LEFT JOIN locations l ON ce.company_id = l.id
    WHERE ce.line_user_id = ?
  `).bind(lineUserId).first<{
    company_id: string;
    employee_name: string | null;
    permissions: string | null;
    company_name: string | null;
    manager_line_id: string | null;
  }>();

  let perms: string[] = ["punch", "apply"];
  let companyId: string | null = null;
  let companyName: string | null = null;
  let employeeName: string | null = null;
  let isManager = false;

  if (emp) {
    companyId = emp.company_id;
    companyName = emp.company_name;
    employeeName = emp.employee_name;
    if (emp.manager_line_id === lineUserId) isManager = true;

    if (emp.permissions) {
      try {
        const parsed = JSON.parse(emp.permissions);
        if (Array.isArray(parsed)) perms = parsed;
      } catch (e) {}
    }
  } else {
    const loc = await env.DB.prepare(
      "SELECT id, name FROM locations WHERE manager_line_id = ? LIMIT 1"
    ).bind(lineUserId).first<{ id: string; name: string }>();

    if (loc) {
      companyId = loc.id;
      companyName = loc.name;
      isManager = true;
      perms = ["punch", "apply", "approve", "view_store", "set_location", "set_wifi"];
    }
  }

  return { companyId, companyName, employeeName, permissions: perms, isManager };
}

export function hasPermission(perms: string[], required: string): boolean {
  if (perms.includes("all") || perms.includes("admin")) return true;
  return perms.includes(required);
}


// Attendance Auditor Engine for Single Day
export function auditDayAttendance(
  dateStr: string,
  schedule: DailySchedule | undefined,
  punches: any[],
  todayStr?: string,
  currentMinutes?: number
) {
  if (!todayStr) {
    const nowUtc = new Date();
    const twDate = new Date(nowUtc.getTime() + 8 * 3600 * 1000);
    todayStr = twDate.toISOString().slice(0, 10);
    currentMinutes = twDate.getUTCHours() * 60 + twDate.getUTCMinutes();
  }

  // Timezone-agnostic Day of Week calculation (deterministic UTC calendar anchor)
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const rawShiftName = schedule ? schedule.shift_name : (dayOfWeek === 0 || dayOfWeek === 6 ? "例假" : "常態班");
  const isLeaveShift = rawShiftName.includes("請假");
  const isStandardWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isRest = schedule ? schedule.is_rest_day === 1 : isStandardWeekend;
  const shiftName = rawShiftName;
  const shiftStart = schedule?.shift_start || (isRest && !isLeaveShift ? null : "09:00");
  const shiftEnd = schedule?.shift_end || (isRest && !isLeaveShift ? null : "18:00");

  const validPunches = (punches || []).filter(p => p.status === "SUCCESS" || p.status === "DUPLICATE");
  const inPunches = validPunches.filter(p => p.punch_type === "IN");
  const outPunches = validPunches.filter(p => p.punch_type === "OUT");

  const firstIn = inPunches.length > 0 ? inPunches[0] : null;
  const lastOut = outPunches.length > 0 ? outPunches[outPunches.length - 1] : null;

  const firstInTime = firstIn ? firstIn.created_at.slice(11, 16) : null;
  const lastOutTime = lastOut ? lastOut.created_at.slice(11, 16) : null;

  let totalWorkHours = 0;
  for (const p of outPunches) {
    if (typeof p.work_hours === "number" && p.work_hours > 0) {
      totalWorkHours += p.work_hours;
    }
  }
  totalWorkHours = parseFloat(totalWorkHours.toFixed(1));

  let status: "NORMAL" | "LATE" | "EARLY_LEAVE" | "LATE_AND_EARLY" | "MISSING_IN" | "MISSING_OUT" | "ABSENT" | "OVERTIME" | "REST_DAY" | "SCHEDULED" | "LEAVE" | "TODAY" = "NORMAL";
  let statusText = "正常出勤";
  let statusColor = "green";
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let overtimeHours = 0;
  let leaveHours = 0;

  if (isLeaveShift) {
    let standardHours = 8.0;
    if (shiftStart && shiftEnd) {
      const sMins = parseTimeToMinutes(shiftStart);
      const eMins = parseTimeToMinutes(shiftEnd);
      const brk = schedule?.break_minutes ?? 60;
      if (eMins > sMins) {
        standardHours = Math.max(0, parseFloat(((eMins - sMins - brk) / 60).toFixed(1)));
      }
    }

    if (validPunches.length === 0) {
      status = "LEAVE";
      statusText = shiftName;
      statusColor = "amber";
      leaveHours = standardHours;
    } else {
      // Employee actually came in and punched! Leave covers unworked portion.
      status = "NORMAL";
      statusText = `${shiftName} + 出勤`;
      statusColor = "green";
      overtimeHours = 0; // Regular work hours, NOT holiday overtime!
      leaveHours = Math.max(0, parseFloat((standardHours - totalWorkHours).toFixed(1)));
    }
  } else if (isRest) {
    if (validPunches.length === 0) {
      status = "REST_DAY";
      statusText = "休假";
      statusColor = "gray";
    } else {
      status = "OVERTIME";
      statusText = "假日加班";
      statusColor = "purple";
      overtimeHours = totalWorkHours;
    }
  } else {
    // Working day
    if (validPunches.length === 0) {
      if (dateStr > todayStr) {
        status = "SCHEDULED";
        statusText = "待出勤";
        statusColor = "sky";
      } else if (dateStr === todayStr) {
        const schedOutMins = shiftEnd ? parseTimeToMinutes(shiftEnd) : 1080;
        if (currentMinutes !== undefined && currentMinutes <= schedOutMins) {
          status = "TODAY";
          statusText = "今日待出勤";
          statusColor = "emerald";
        } else {
          status = "ABSENT";
          statusText = "今日未打卡";
          statusColor = "red";
        }
      } else {
        status = "ABSENT";
        statusText = "未出勤/曠職";
        statusColor = "red";
      }
    } else if (inPunches.length > 0 && outPunches.length === 0) {
      if (dateStr === todayStr) {
        status = "NORMAL";
        statusText = "已上班/待下班";
        statusColor = "green";
      } else {
        status = "MISSING_OUT";
        statusText = "下班缺卡";
        statusColor = "red";
      }
    } else if (inPunches.length === 0 && outPunches.length > 0) {
      status = "MISSING_IN";
      statusText = "上班缺卡";
      statusColor = "red";
    } else {
      // Both IN and OUT exist
      const inMins = firstInTime ? parseTimeToMinutes(firstInTime) : null;
      const outMins = lastOutTime ? parseTimeToMinutes(lastOutTime) : null;
      const schedInMins = shiftStart ? parseTimeToMinutes(shiftStart) : null;
      const schedOutMins = shiftEnd ? parseTimeToMinutes(shiftEnd) : null;

      if (inMins !== null && schedInMins !== null && inMins > schedInMins) {
        lateMinutes = inMins - schedInMins;
      }

      if (outMins !== null && schedOutMins !== null && outMins < schedOutMins) {
        earlyLeaveMinutes = schedOutMins - outMins;
      }

      const isLate = lateMinutes > 5;
      const isEarly = earlyLeaveMinutes > 5;

      if (isLate && isEarly) {
        status = "LATE_AND_EARLY";
        statusText = `遲到${lateMinutes}分+早退${earlyLeaveMinutes}分`;
        statusColor = "yellow";
      } else if (isLate) {
        status = "LATE";
        statusText = `遲到 (${lateMinutes}分)`;
        statusColor = "yellow";
      } else if (isEarly) {
        status = "EARLY_LEAVE";
        statusText = `早退 (${earlyLeaveMinutes}分)`;
        statusColor = "yellow";
      } else {
        status = "NORMAL";
        statusText = "正常出勤";
        statusColor = "green";
      }
    }
  }

  const primaryVerifyMode = validPunches.length > 0 ? validPunches[0].verify_mode : null;

  return {
    date: dateStr,
    dayOfWeek,
    isToday: dateStr === todayStr,
    isRestDay: isLeaveShift ? false : isRest,
    isLeave: isLeaveShift,
    shiftName,
    shiftStart,
    shiftEnd,
    status,
    statusText,
    statusColor,
    firstInTime,
    lastOutTime,
    lateMinutes,
    earlyLeaveMinutes,
    workHours: totalWorkHours,
    leaveHours,
    overtimeHours,
    verifyMode: primaryVerifyMode,
    punches: validPunches
  };
}

// Verify LINE ID Token against LINE OAuth v2.1
async function verifyLineIdToken(
  idToken: string,
  channelId?: string
): Promise<{ userId: string; name: string; picture?: string } | null> {
  if (!idToken) return null;
  try {
    const params = new URLSearchParams();
    params.append("id_token", idToken);
    if (channelId) params.append("client_id", channelId);

    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      console.error("LINE verify failed:", await res.text());
      return null;
    }

    const data = (await res.json()) as any;
    return {
      userId: data.sub,
      name: data.name || "LINE 員工",
      picture: data.picture,
    };
  } catch (e) {
    console.error("Error verifying ID Token:", e);
    return null;
  }
}

// LINE Signature verification
async function verifyLineSignature(body: string, signature: string | null, channelSecret?: string): Promise<boolean> {
  if (!signature || !channelSecret) return true;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(channelSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const hashArray = Array.from(new Uint8Array(signed));
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    return hashBase64 === signature;
  } catch (e) {
    console.error("Signature verification error:", e);
    return false;
  }
}

// Helper to reply LINE Message
async function replyLineMessage(accessToken: string, replyToken: string, text: string) {
  if (!accessToken || !replyToken) return;
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    });
  } catch (e) {
    console.error("Reply LINE failed:", e);
  }
}

// Push Check-in Receipt Flex Message to User
async function pushCheckinReceipt(
  accessToken: string,
  userId: string,
  userName: string,
  timeStr: string,
  distanceMeters: number,
  locationName: string,
  address: string,
  punchType: "IN" | "OUT" = "IN",
  workHours: number | null = null,
  isDuplicate: boolean = false,
  recordId?: number,
  originalTime?: string,
  verifyMode: "IP_WHITELIST" | "GPS_FALLBACK" | "GPS_ONLY" = "GPS_ONLY"
) {
  if (!accessToken || !userId) return;

  const isIn = punchType === "IN";
  const headerBgColor = isDuplicate ? "#718096" : (isIn ? "#06C755" : "#3182CE");
  const titleText = isDuplicate
    ? "🔄 重複打卡提醒 (維持原紀錄)"
    : (isIn ? "🟢 上班打卡成功" : "🔴 下班打卡成功");

  const modeBadgeText = verifyMode === "IP_WHITELIST"
    ? "🛡️ 公司固定網路 (Wi-Fi 驗證)"
    : (verifyMode === "GPS_FALLBACK" ? "📍 GPS 定位 (外網降級)" : "📍 GPS 地理圍欄");

  const flexBubble: any = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: headerBgColor,
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: titleText,
          weight: "bold",
          size: "lg",
          color: "#ffffff",
        },
        {
          type: "text",
          text: isDuplicate ? `前次打卡：${originalTime || timeStr}` : `打卡時間：${timeStr}`,
          size: "xs",
          color: "#ffffffcc",
          margin: "xs",
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            {
              type: "text",
              text: modeBadgeText,
              size: "xxs",
              color: "#ffffff",
              weight: "bold",
            }
          ]
        }
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "員工姓名", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: userName, size: "sm", color: "#111111", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "打卡據點", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: locationName, size: "sm", color: "#111111", weight: "bold", flex: 7, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "門市地址", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: address, size: "sm", color: "#555555", flex: 7, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "定位距離", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: `${Math.round(distanceMeters)} 公尺 (驗證通過)`, size: "sm", color: "#06C755", flex: 7 },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: [
        {
          type: "text",
          text: "💡 提示：如打卡方向有誤，可於 30 秒內點擊下方按鈕修正或撤回。",
          size: "xxs",
          color: "#a0aec0",
          wrap: true,
          align: "center",
          margin: "xs",
        },
      ],
    },
  };

  if (!isIn && workHours !== null) {
    flexBubble.body.contents.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "當段工時", size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: `⏱️ ${workHours} 小時`, size: "sm", color: "#3182CE", weight: "bold", flex: 7 },
      ],
    });
  }

  if (recordId) {
    const flipText = isIn ? "🔴 翻轉為【下班】" : "🟢 翻轉為【上班】";
    flexBubble.footer.contents.unshift({
      type: "box",
      layout: "horizontal",
      spacing: "md",
      margin: "md",
      contents: [
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: flipText,
            data: `action=flip&recordId=${recordId}`,
            displayText: `我想更正為${isIn ? "下班" : "上班"}`,
          },
          flex: 1,
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          color: "#E53E3E",
          action: {
            type: "postback",
            label: "🗑️ 撤回打卡",
            data: `action=undo&recordId=${recordId}`,
            displayText: "我想撤回剛才的打卡",
          },
          flex: 1,
        },
      ],
    });
  }

  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [
          {
            type: "flex",
            altText: `${titleText}：${userName} - ${locationName} (${timeStr})`,
            contents: flexBubble,
          },
        ],
      }),
    });
  } catch (e) {
    console.error("Failed to push Flex message:", e);
  }
}

// Push Approval Request Flex Message to Line Manager
async function pushApprovalRequestFlex(
  accessToken: string,
  approverId: string,
  approvalId: string,
  type: "LEAVE" | "CORRECTION" | "OVERTIME",
  applicantName: string,
  companyName: string,
  targetDate: string,
  details: Record<string, any>
) {
  if (!accessToken || !approverId) return;

  const typeConfig: Record<string, { title: string; color: string; label: string }> = {
    LEAVE: { title: "🌴 員工請假申請", color: "#D69E2E", label: "請假申請" },
    CORRECTION: { title: "⏰ 考勤補卡申請", color: "#3182CE", label: "補卡申請" },
    OVERTIME: { title: "🔥 員工加班申請", color: "#805AD5", label: "加班申請" },
  };
  const currentConfig = typeConfig[type] || { title: "📋 考勤審批申請", color: "#4A5568", label: "其他申請" };

  const detailItems: { label: string; value: string; color?: string }[] = [];

  if (type === "LEAVE") {
    detailItems.push(
      { label: "請假類別", value: details.leave_type || "事假", color: "#D69E2E" },
      { label: "請假時段", value: details.time_range || "全天" }
    );
  } else if (type === "CORRECTION") {
    const punchLabel = details.punch_type === "OUT" ? "🔴 下班卡 (OUT)" : "🟢 上班卡 (IN)";
    detailItems.push(
      { label: "補卡方向", value: punchLabel, color: details.punch_type === "OUT" ? "#E53E3E" : "#38A169" },
      { label: "補正時間", value: details.time || "09:00" },
      ...(details.work_hours ? [{ label: "補正工時", value: `${details.work_hours} 小時` }] : [])
    );
  } else if (type === "OVERTIME") {
    detailItems.push(
      { label: "預計時數", value: `${details.hours || 1} 小時`, color: "#805AD5" },
      { label: "加班時段", value: details.time_range || "下班後" }
    );
  }

  detailItems.push({ label: "申請事由", value: details.reason || "無說明" });

  const bodyContents: any[] = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "申請同仁", size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: applicantName, size: "sm", color: "#111111", weight: "bold", flex: 7 },
      ],
    },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "所屬門市", size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: companyName, size: "sm", color: "#111111", weight: "bold", flex: 7, wrap: true },
      ],
    },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "申請日期", size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: targetDate, size: "sm", color: "#111111", weight: "bold", flex: 7 },
      ],
    },
    { type: "separator", margin: "md" }
  ];

  for (const item of detailItems) {
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      margin: "md",
      contents: [
        { type: "text", text: item.label, size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: item.value, size: "sm", color: item.color || "#333333", weight: item.color ? "bold" : "regular", flex: 7, wrap: true },
      ],
    });
  }

  const flexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: currentConfig.color,
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: currentConfig.title,
          weight: "bold",
          size: "lg",
          color: "#ffffff",
        },
        {
          type: "text",
          text: `單號：${approvalId}`,
          size: "xs",
          color: "#ffffffcc",
          margin: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "xs",
      contents: bodyContents,
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#06C755",
              height: "sm",
              action: {
                type: "postback",
                label: "✅ 核准通過",
                data: `action=approve&id=${approvalId}`,
                displayText: `核准【${applicantName}】的${currentConfig.label}`,
              },
              flex: 1,
            },
            {
              type: "button",
              style: "secondary",
              color: "#E53E3E",
              height: "sm",
              action: {
                type: "postback",
                label: "❌ 駁回申請",
                data: `action=reject&id=${approvalId}`,
                displayText: `駁回【${applicantName}】的${currentConfig.label}`,
              },
              flex: 1,
            },
          ],
        },
        {
          type: "text",
          text: "💡 提示：點擊核准後，系統將自動同步更新打卡流水與出勤月曆。",
          size: "xxs",
          color: "#a0aec0",
          align: "center",
          margin: "sm",
          wrap: true,
        },
      ],
    },
  };

  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: approverId,
        messages: [
          {
            type: "flex",
            altText: `【簽核通知】${applicantName} 提交了${currentConfig.label} (${targetDate})`,
            contents: flexBubble,
          },
        ],
      }),
    });
  } catch (e) {
    console.error("Failed to push Approval Request Flex message:", e);
  }
}

// Push Approval Result Flex Message to Applicant Employee
async function pushApprovalResultFlex(
  accessToken: string,
  applicantId: string,
  applicantName: string,
  type: string,
  targetDate: string,
  status: "APPROVED" | "REJECTED"
) {
  if (!accessToken || !applicantId) return;

  const isApproved = status === "APPROVED";
  const headerBgColor = isApproved ? "#06C755" : "#E53E3E";
  const titleText = isApproved ? "✅ 簽核申請已通過" : "❌ 簽核申請未通過 (駁回)";
  const typeText = type === "LEAVE" ? "請假申請" : (type === "CORRECTION" ? "補卡申請" : "加班申請");

  const flexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: headerBgColor,
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: titleText,
          weight: "bold",
          size: "lg",
          color: "#ffffff",
        },
        {
          type: "text",
          text: `通知對象：${applicantName}`,
          size: "xs",
          color: "#ffffffcc",
          margin: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "申請項目", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: typeText, size: "sm", color: "#111111", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "涉及日期", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: targetDate, size: "sm", color: "#111111", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "審查結果", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: isApproved ? "已核准並生效" : "主管已駁回", size: "sm", color: isApproved ? "#06C755" : "#E53E3E", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "text",
          text: isApproved
            ? "🎉 出勤紀錄與班表已自動同步更新，您可開啟出勤月曆查看最新狀態。"
            : "⚠️ 如有疑問請洽您的直屬主管或門市店長確認。",
          size: "xs",
          color: "#718096",
          margin: "sm",
          wrap: true,
        },
      ],
    },
  };

  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: applicantId,
        messages: [
          {
            type: "flex",
            altText: `【審核結果】您的${typeText} (${targetDate})：${isApproved ? "已核准" : "已駁回"}`,
            contents: flexBubble,
          },
        ],
      }),
    });
  } catch (e) {
    console.error("Failed to push Approval Result Flex message:", e);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const clientIp = request.headers.get("x-mock-ip") || request.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Tenant-Key, X-Mock-IP, X-Admin-Master-Key",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Route: GET / or /checkin or /liff -> Serve LIFF Frontend HTML
    if (url.pathname === "/" || url.pathname === "/checkin" || url.pathname === "/liff") {
      const liffId = env.LIFF_ID || "YOUR_LIFF_ID";
      const defaultLocation = env.LOCATION_NAME || "台中市北區美德街56-11號";
      const html = renderLiffHtml(liffId, defaultLocation);
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Route: GET /admin or /local-admin -> Serve Client On-Premises Local Admin Portal
    if (url.pathname === "/admin" || url.pathname === "/local-admin") {
      const html = renderLocalAdminHtml();
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Route: GET /api/health
    if (url.pathname === "/api/health") {
      return Response.json(
        { status: "ok", service: "line-gps-checkin-v3", timestamp: new Date().toISOString() },
        { headers: corsHeaders }
      );
    }

    // ==================== ATTENDANCE CALENDAR & AUDITING API ====================

    // Route: GET /api/v1/attendance/monthly -> Monthly attendance audit for LIFF & Admin
    if (url.pathname === "/api/v1/attendance/monthly" && request.method === "GET") {
      try {
        const targetUserId = url.searchParams.get("userId") || "DEMO_USER";
        const targetMonth = url.searchParams.get("month") || new Date().toISOString().slice(0, 7); // 'YYYY-MM'

        const [yearStr, monthStr] = targetMonth.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);

        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
          return Response.json({ success: false, error: "無效的月份格式 (請使用 YYYY-MM)" }, { status: 400, headers: corsHeaders });
        }

        const daysInMonth = new Date(year, month, 0).getDate();

        // 1 & 2. Fetch schedules and checkin records concurrently in a single D1 batch
        const [schedBatch, punchBatch] = await env.DB.batch([
          env.DB.prepare(
            "SELECT work_date, shift_name, shift_start, shift_end, break_minutes, is_rest_day, is_cross_day FROM employee_schedules WHERE line_user_id = ? AND work_date LIKE ? ORDER BY work_date ASC"
          ).bind(targetUserId, `${targetMonth}-%`),
          env.DB.prepare(
            "SELECT id, punch_type, created_at, work_hours, verify_mode, status, distance_meters FROM checkin_records WHERE line_user_id = ? AND created_at LIKE ? ORDER BY id ASC"
          ).bind(targetUserId, `${targetMonth}-%`)
        ]);

        const schedules = (schedBatch.results || []) as DailySchedule[];
        const punches = (punchBatch.results || []) as any[];

        const scheduleMap = new Map<string, DailySchedule>();
        for (const s of schedules) {
          scheduleMap.set(s.work_date, s);
        }

        const punchesMap = new Map<string, any[]>();
        for (const p of (punches as any[])) {
          const pDate = p.created_at.slice(0, 10);
          if (!punchesMap.has(pDate)) punchesMap.set(pDate, []);
          punchesMap.get(pDate)!.push(p);
        }

        // 3. Audit each day
        const nowUtc = new Date();
        const twTime = new Date(nowUtc.getTime() + 8 * 3600 * 1000);
        const todayStr = twTime.toISOString().slice(0, 10);
        const currentMinutes = twTime.getUTCHours() * 60 + twTime.getUTCMinutes();

        const daysAudit: any[] = [];
        let totalWorkHours = 0;
        let totalLeaveHours = 0;
        let attendanceDays = 0;
        let lateCount = 0;
        let earlyLeaveCount = 0;
        let missingPunchCount = 0;
        let overtimeHours = 0;

        for (let d = 1; d <= daysInMonth; d++) {
          const dStr = `${targetMonth}-${d.toString().padStart(2, "0")}`;
          const sched = scheduleMap.get(dStr);
          const dayPunches = punchesMap.get(dStr) || [];

          const audit = auditDayAttendance(dStr, sched, dayPunches, todayStr, currentMinutes);
          daysAudit.push(audit);

          totalWorkHours += audit.workHours;
          totalLeaveHours += (audit.leaveHours || 0);
          if (audit.workHours > 0 || ["NORMAL", "LATE", "EARLY_LEAVE", "LATE_AND_EARLY", "OVERTIME"].includes(audit.status)) {
            attendanceDays++;
          }
          if (audit.lateMinutes > 5) lateCount++;
          if (audit.earlyLeaveMinutes > 5) earlyLeaveCount++;
          if (["MISSING_IN", "MISSING_OUT", "ABSENT"].includes(audit.status)) missingPunchCount++;
          overtimeHours += audit.overtimeHours;
        }

        return Response.json({
          success: true,
          userId: targetUserId,
          month: targetMonth,
          todayStr,
          summary: {
            total_work_hours: parseFloat(totalWorkHours.toFixed(1)),
            total_leave_hours: parseFloat(totalLeaveHours.toFixed(1)),
            attendance_days: attendanceDays,
            late_count: lateCount,
            early_leave_count: earlyLeaveCount,
            missing_punch_count: missingPunchCount,
            overtime_hours: parseFloat(overtimeHours.toFixed(1))
          },
          days: daysAudit
        }, { headers: corsHeaders });

      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ==================== IN-CHAT BPM APPROVAL ENDPOINTS (v2.0.0) ====================

    // Route: POST /api/v1/approval/request -> Submit Leave, Correction, or Overtime approval request
    if (url.pathname === "/api/v1/approval/request" && request.method === "POST") {
      try {
        const body = (await request.json()) as any;
        const { idToken, type, targetDate, details, fallbackUserId, fallbackDisplayName, fallbackCompanyId } = body;

        if (!type || !targetDate) {
          return Response.json({ success: false, error: "缺少必要欄位 (type 申請類型, targetDate 涉及日期)" }, { status: 400, headers: corsHeaders });
        }

        if (!["LEAVE", "CORRECTION", "OVERTIME"].includes(type)) {
          return Response.json({ success: false, error: "不支援的申請類型 (僅支援 LEAVE, CORRECTION, OVERTIME)" }, { status: 400, headers: corsHeaders });
        }

        // Verify user identity
        let userId = "";
        let displayName = "";
        if (idToken && idToken.trim()) {
          const profile = await verifyLineIdToken(idToken, env.LINE_LOGIN_CHANNEL_ID || "");
          if (profile) {
            userId = profile.sub;
            displayName = profile.name || "LINE用戶";
          }
        }

        if (!userId && fallbackUserId) {
          userId = fallbackUserId;
          displayName = fallbackDisplayName || "測試用戶";
        }

        if (!userId) {
          return Response.json({ success: false, error: "未授權：LINE 身分驗證失敗" }, { status: 401, headers: corsHeaders });
        }

        // Determine employee's assigned company and approver
        const emp = await env.DB.prepare(`
          SELECT company_id, employee_name, approver_line_id
          FROM company_employees
          WHERE line_user_id = ?
        `).bind(userId).first<{ company_id: string; employee_name: string | null; approver_line_id: string | null }>();

        let companyId = emp?.company_id || fallbackCompanyId || "";
        const applicantName = displayName || emp?.employee_name || "LINE用戶";
        let targetApprover = emp?.approver_line_id;

        // Fallback 1: If no company_employees record, check checkin_records for last known company
        if (!companyId) {
          const lastRecord = await env.DB.prepare(`
            SELECT company_id FROM checkin_records WHERE line_user_id = ? ORDER BY id DESC LIMIT 1
          `).bind(userId).first<{ company_id: string }>();
          if (lastRecord) companyId = lastRecord.company_id;
        }

        // Fallback 2: Check location's manager_line_id
        let locationName = "門市據點";
        if (companyId) {
          const loc = await env.DB.prepare(`
            SELECT name, manager_line_id FROM locations WHERE id = ?
          `).bind(companyId).first<{ name: string; manager_line_id: string | null }>();
          if (loc) {
            locationName = loc.name;
            if (!targetApprover && loc.manager_line_id) {
              targetApprover = loc.manager_line_id;
            }
          }
        }

        // If still no target approver, reject with clear instructions
        if (!targetApprover) {
          return Response.json({
            success: false,
            error: "尚未設定您的直屬審查主管，且所屬門市據點亦未設定店長 LINE ID。請洽公司管理員於後台設定。"
          }, { status: 400, headers: corsHeaders });
        }

        const approvalId = "appr_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
        const detailsJson = typeof details === "object" ? JSON.stringify(details) : (details || "{}");

        await env.DB.prepare(`
          INSERT INTO approvals (
            id, company_id, line_user_id, applicant_name, approver_line_id,
            type, target_date, details, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `).bind(
          approvalId,
          companyId || "UNKNOWN",
          userId,
          applicantName,
          targetApprover,
          type,
          targetDate,
          detailsJson
        ).run();

        // Push Flex interactive card to manager's LINE
        const token = env.LINE_CHANNEL_ACCESS_TOKEN || "";
        const parsedDetails = typeof details === "object" ? details : {};
        await pushApprovalRequestFlex(
          token,
          targetApprover,
          approvalId,
          type,
          applicantName,
          locationName,
          targetDate,
          parsedDetails
        );

        return Response.json({
          success: true,
          id: approvalId,
          approverLineId: targetApprover,
          status: "PENDING",
          message: "申請已成功送出，已即時推播審核卡片至主管 LINE 聊天室。"
        }, { headers: corsHeaders });

      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/v1/approval/my -> Query employee's own approval history
    if (url.pathname === "/api/v1/approval/my" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId") || "";
        if (!userId) {
          return Response.json({ success: false, error: "缺少 userId 參數" }, { status: 400, headers: corsHeaders });
        }

        const { results } = await env.DB.prepare(`
          SELECT id, company_id, type, target_date, details, status, review_note, decided_at, created_at
          FROM approvals
          WHERE line_user_id = ?
          ORDER BY created_at DESC LIMIT 30
        `).bind(userId).all();

        return Response.json({
          success: true,
          approvals: results || []
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ==================== WEB ADMIN AUTH ENDPOINTS ====================

    // Route: POST /api/v1/admin/login -> Authenticate with Username & Password
    if (url.pathname === "/api/v1/admin/login" && request.method === "POST") {
      try {
        const body = (await request.json()) as { username?: string; password?: string };
        if (!body.username || !body.password) {
          return Response.json({ success: false, error: "請輸入帳號與密碼" }, { status: 400, headers: corsHeaders });
        }

        const username = body.username.trim();
        const user = await env.DB.prepare(`
          SELECT id, tax_id, username, password_hash, salt, display_name, role, is_active
          FROM tenant_users
          WHERE username = ?
        `).bind(username).first<{ id: number; tax_id: string; username: string; password_hash: string; salt: string; display_name: string; role: string; is_active: number }>();

        if (!user) {
          return Response.json({ success: false, error: "帳號或密碼錯誤" }, { status: 401, headers: corsHeaders });
        }

        if (user.is_active !== 1) {
          return Response.json({ success: false, error: "此帳號已被停用，請聯繫系統管理員" }, { status: 403, headers: corsHeaders });
        }

        const computedHash = await hashPassword(body.password, user.salt);
        if (computedHash !== user.password_hash) {
          return Response.json({ success: false, error: "帳號或密碼錯誤" }, { status: 401, headers: corsHeaders });
        }

        // Generate high-entropy Session Token
        const sessionToken = `sess_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
        const sessionHash = await hashApiKey(sessionToken);

        // Expiry: 7 days
        const expiresDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const expiresAt = expiresDate.toISOString().replace("T", " ").substring(0, 19);

        await env.DB.prepare(`
          INSERT INTO tenant_sessions (token_hash, user_id, tax_id, role, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(sessionHash, user.id, user.tax_id, user.role, expiresAt).run();

        await env.DB.prepare(`
          UPDATE tenant_users SET last_login_at = datetime('now', '+8 hours') WHERE id = ?
        `).bind(user.id).run();

        return Response.json({
          success: true,
          message: "登入成功",
          token: sessionToken,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            taxId: user.tax_id,
            role: user.role
          },
          expiresAt
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: POST /api/v1/admin/logout -> Logout & invalidate session
    if (url.pathname === "/api/v1/admin/logout" && request.method === "POST") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated) {
        return Response.json({ success: true, message: "已登出" }, { headers: corsHeaders });
      }

      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();
      if (token.startsWith("sess_")) {
        const sessionHash = await hashApiKey(token);
        try {
          await env.DB.prepare("DELETE FROM tenant_sessions WHERE token_hash = ?").bind(sessionHash).run();
        } catch (e) {}
      }

      return Response.json({ success: true, message: "已安全登出" }, { headers: corsHeaders });
    }

    // Route: GET /api/v1/admin/me -> Get current authenticated session info
    if (url.pathname === "/api/v1/admin/me" && request.method === "GET") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated) {
        return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
      }

      return Response.json({
        success: true,
        user: {
          taxId: auth.taxId,
          role: auth.role,
          name: auth.name,
          userId: auth.userId,
          authType: auth.authType
        }
      }, { headers: corsHeaders });
    }

    // ==================== TENANT M2M API & KEY MANAGEMENT ====================

    // Route: GET /api/v1/tenant/keys -> List all API Keys for authenticated tenant
    if (url.pathname === "/api/v1/tenant/keys" && request.method === "GET") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated) {
        return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
      }

      try {
        const { results } = await env.DB.prepare(`
          SELECT id, tax_id, key_hint, name, role, is_active, created_at, last_used_at
          FROM tenant_api_keys
          WHERE tax_id = ?
          ORDER BY id DESC
        `).bind(auth.taxId).all();

        return Response.json({
          success: true,
          companyTaxId: auth.taxId,
          count: results.length,
          keys: results
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: POST /api/v1/tenant/keys -> Provision new Tenant API Key
    if (url.pathname === "/api/v1/tenant/keys" && request.method === "POST") {
      try {
        const auth = await authenticateTenantRequest(request, env.DB);
        const body = (await request.json()) as { tax_id?: string; name: string; role?: string };
        
        let targetTaxId = "";
        if (auth.authenticated && auth.taxId) {
          // Logged-in admin generating key for their company
          targetTaxId = auth.taxId;
        } else if (body.tax_id) {
          // Root provisioning or unauthenticated setup
          const clean = body.tax_id.trim().split("-")[0];
          if (!isValidTaiwanTaxId(clean)) {
            return Response.json({ success: false, error: `統一編號 [${clean}] 格式無效！` }, { status: 400, headers: corsHeaders });
          }
          targetTaxId = clean;
        } else {
          return Response.json({ success: false, error: "缺少 tax_id 或請先登入後台" }, { status: 400, headers: corsHeaders });
        }

        if (!body.name || !body.name.trim()) {
          return Response.json({ success: false, error: "缺少金鑰備註名稱 (name)" }, { status: 400, headers: corsHeaders });
        }

        const role = (body.role || "ADMIN").toUpperCase();
        if (!["ADMIN", "READ_ONLY", "SANDBOX_QA"].includes(role)) {
          return Response.json({ success: false, error: "角色必須為 ADMIN, READ_ONLY 或 SANDBOX_QA" }, { status: 400, headers: corsHeaders });
        }

        const randomSecret = crypto.randomUUID().replace(/-/g, "");
        const rawApiKey = `pk_live_${targetTaxId}_${randomSecret}`;
        const keyHash = await hashApiKey(rawApiKey);
        const keyHint = `pk_live_${targetTaxId}...${randomSecret.slice(-4)}`;

        await env.DB.prepare(`
          INSERT INTO tenant_api_keys (tax_id, api_key_hash, key_hint, name, role, is_active)
          VALUES (?, ?, ?, ?, ?, 1)
        `).bind(targetTaxId, keyHash, keyHint, body.name.trim(), role).run();

        return Response.json({
          success: true,
          message: "租戶金鑰建立成功！請妥善保存，金鑰僅於建立時顯示一次。",
          apiKey: rawApiKey,
          keyHint,
          taxId: targetTaxId,
          name: body.name.trim(),
          role
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: POST /api/v1/tenant/keys/:id/revoke or DELETE /api/v1/tenant/keys/:id -> Revoke API Key
    const revokeKeyMatch = url.pathname.match(/^\/api\/v1\/tenant\/keys\/(\d+)(?:\/revoke)?$/);
    if (revokeKeyMatch && (request.method === "POST" || request.method === "DELETE")) {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated) {
        return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
      }

      if (auth.role !== "ADMIN") {
        return Response.json({ success: false, error: "僅企業管理員 (ADMIN) 有權限撤銷金鑰" }, { status: 403, headers: corsHeaders });
      }

      const keyId = parseInt(revokeKeyMatch[1], 10);
      try {
        const res = await env.DB.prepare(`
          UPDATE tenant_api_keys
          SET is_active = 0
          WHERE id = ? AND tax_id = ?
        `).bind(keyId, auth.taxId).run();

        if (res.meta.changes === 0) {
          return Response.json({ success: false, error: "查無此金鑰或非本公司所屬金鑰" }, { status: 404, headers: corsHeaders });
        }

        return Response.json({
          success: true,
          message: "API 金鑰已成功撤銷停用"
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }


    // Route: GET /api/v1/tenant/locations -> Get all branches strictly scoped to authenticated tenant
    if (url.pathname === "/api/v1/tenant/locations" && request.method === "GET") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated) {
        return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
      }

      try {
        const { results } = await env.DB.prepare(
          "SELECT id, name, address, target_lat, target_lon, allowed_radius, allowed_ips, manager_line_id, created_at FROM locations WHERE id = ? OR id LIKE ? ORDER BY id ASC"
        ).bind(auth.taxId, `${auth.taxId}-%`).all();

        const decomposed = results.map(decomposeLocation);
        return Response.json({
          success: true,
          companyTaxId: auth.taxId,
          tenantName: auth.name,
          role: auth.role,
          count: decomposed.length,
          locations: decomposed
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: POST /api/v1/tenant/locations -> Add/Edit location strictly scoped to authenticated tenant
    if (url.pathname === "/api/v1/tenant/locations" && request.method === "POST") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated) {
        return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
      }

      if (auth.role !== "ADMIN") {
        return Response.json({ success: false, error: "權限不足：僅 ADMIN 角色金鑰可新增或修改據點配置" }, { status: 403, headers: corsHeaders });
      }

      try {
        const body = (await request.json()) as LocationPayload;
        if (!body.id || !body.name || !body.address) {
          return Response.json(
            { success: false, error: "缺少必要參數 (id 據點代碼, name 據點名稱, address 中文地址)" },
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanId = body.id.trim();

        if (cleanId !== auth.taxId && !cleanId.startsWith(`${auth.taxId}-`)) {
          return Response.json(
            { success: false, error: `權限不足：您所持金鑰僅能管理統編 [${auth.taxId}] 之據點，禁止登記其他統編據點 [${cleanId}]！` },
            { status: 403, headers: corsHeaders }
          );
        }

        if (body.allowed_ips && !isValidAllowedIpsFormat(body.allowed_ips)) {
          return Response.json(
            { success: false, error: `allowed_ips 格式無效！請提供有效之 IP 或 CIDR 網段（例如 '211.20.1.5, 114.33.20.0/24'）` },
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanAllowedIps = body.allowed_ips && body.allowed_ips.trim() ? body.allowed_ips.trim() : null;
        const cleanManagerId = body.manager_line_id && body.manager_line_id.trim() ? body.manager_line_id.trim() : null;

        let targetLat = body.target_lat;
        let targetLon = body.target_lon;
        let isAutoGeocoded = false;

        if (typeof targetLat !== "number" || typeof targetLon !== "number") {
          const geo = await autoGeocodeAddress(body.address);
          if (!geo) {
            return Response.json(
              { success: false, error: `無法自動解析地址 [${body.address}] 之 GPS 座標，請手動提供 target_lat 與 target_lon。` },
              { status: 400, headers: corsHeaders }
            );
          }
          targetLat = geo.lat;
          targetLon = geo.lon;
          isAutoGeocoded = true;
        }

        const radius = body.allowed_radius || 100;

        await env.DB.prepare(`
          INSERT INTO locations (id, name, address, target_lat, target_lon, allowed_radius, allowed_ips, manager_line_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            address = excluded.address,
            target_lat = excluded.target_lat,
            target_lon = excluded.target_lon,
            allowed_radius = excluded.allowed_radius,
            allowed_ips = excluded.allowed_ips,
            manager_line_id = excluded.manager_line_id
        `).bind(cleanId, body.name.trim(), body.address.trim(), targetLat, targetLon, radius, cleanAllowedIps, cleanManagerId).run();

        const decomposed = decomposeLocation({
          id: cleanId,
          name: body.name.trim(),
          address: body.address.trim(),
          target_lat: targetLat,
          target_lon: targetLon,
          allowed_radius: radius,
          allowed_ips: cleanAllowedIps,
          manager_line_id: cleanManagerId
        });

        return Response.json({
          success: true,
          message: "門市據點已儲存" + (isAutoGeocoded ? " (已自動轉換地址為 GPS 座標)" : ""),
          location: decomposed
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/v1/tenant/locations/:id/qrcode -> Generate stand QR Code scoped to tenant
    const tenantQrMatch = url.pathname.match(/^\/api\/v1\/tenant\/locations\/([^/]+)\/qrcode$/);
    if (tenantQrMatch && request.method === "GET") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated) {
        return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
      }

      const locId = tenantQrMatch[1].trim();
      if (locId !== auth.taxId && !locId.startsWith(`${auth.taxId}-`)) {
        return Response.json({ success: false, error: "無權存取非本公司之據點 QR Code" }, { status: 403, headers: corsHeaders });
      }

      const result = await env.DB.prepare(
        "SELECT id, name, address FROM locations WHERE id = ?"
      ).bind(locId).first<{ id: string; name: string; address: string }>();

      if (!result) {
        return new Response("Location not found", { status: 404, headers: corsHeaders });
      }

      const decomposed = decomposeLocation(result);
      const rawBotId = (env.LINE_BOT_BASIC_ID || "@375nvoga").trim();
      const botBasicId = rawBotId.startsWith("@") ? rawBotId : `@${rawBotId}`;
      const liffAppId = (env.LINE_LIFF_APP_ID || "2011328810-vjUUBSYA").trim();
      const targetUrl = `https://liff.line.me/${liffAppId}?cid=${encodeURIComponent(result.id)}&bot_prompt=aggressive`;
      const friendAddUrl = `https://line.me/R/ti/p/${encodeURIComponent(botBasicId)}`;
      const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(targetUrl)}`;

      const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${result.name} - 門市考勤打卡立牌 QR Code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#F0F2F5; margin:0; padding:20px; box-sizing:border-box; }
    .card { background:white; padding:36px; border-radius:24px; box-shadow:0 8px 30px rgba(0,0,0,0.08); text-align:center; max-width:440px; width:100%; box-sizing:border-box; }
    .header { background:#06C755; color:white; padding:12px 24px; border-radius:12px; font-size:20px; font-weight:bold; margin-bottom:20px; display:flex; align-items:center; justify-content:center; gap:8px; }
    .title { font-size:20px; font-weight:bold; color:#1A202C; margin-bottom:4px; }
    .subtitle { font-size:14px; color:#4A5568; margin-bottom:6px; font-weight:600; }
    .address { font-size:13px; color:#718096; margin-bottom:16px; }
    .bot-badge { display:inline-block; background:#EBFBEE; color:#06C755; font-weight:700; font-size:13px; padding:6px 14px; border-radius:20px; margin-bottom:18px; border:1px solid #D3F9D8; }
    .qr { width:260px; height:260px; border-radius:16px; border:2px solid #E2E8F0; padding:12px; background:white; margin:0 auto; display:block; }
    .btn-friend { display:flex; align-items:center; justify-content:center; gap:8px; background:#06C755; color:white; font-weight:bold; font-size:15px; padding:13px 20px; border-radius:14px; text-decoration:none; margin-top:16px; box-shadow:0 4px 12px rgba(6,199,85,0.25); transition:transform 0.1s ease; }
    .btn-friend:active { transform:scale(0.98); }
    .tip { margin-top:16px; font-size:13px; color:#4A5568; background:#F8FAFC; padding:14px; border-radius:12px; line-height:1.7; text-align:left; border:1px solid #E2E8F0; }
    .tip strong { color:#1E293B; }
    .link { font-size:12px; color:#06C755; word-break:break-all; margin-top:14px; font-weight:600; }
    @media print { body { background:white; padding:0; } .card { box-shadow:none; padding:0; max-width:100%; } .btn-friend { border:1px solid #06C755; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">📍 門市考勤打卡立牌</div>
    <div class="title">${decomposed.companyName}</div>
    <div class="subtitle">${decomposed.branchName} (代碼: ${result.id})</div>
    <div class="address">門市地址：${result.address}</div>
    <div class="bot-badge">LINE 官方帳號：${botBasicId}</div>
    <img class="qr" src="${qrApi}" alt="門市打卡 QR Code">
    <a href="${friendAddUrl}" target="_blank" class="btn-friend">
      <i style="font-style:normal;font-size:18px;">💬</i> 加入打卡帳號好友 (${botBasicId})
    </a>
    <div class="tip">
      👉 <strong>掃碼打卡與入職</strong>：開啟手機相機或 LINE 掃描上方 QR 碼，直接進入本門市<strong>入職登記</strong>或<strong>每日出勤打卡</strong>。<br>
      👉 <strong>加入打卡好友</strong>：初次使用請點擊上方【加入打卡帳號好友】按鈕，加入好友以接收<strong>打卡收據推播</strong>與使用<strong>常駐圖文選單</strong>。
    </div>
    <div class="link"><a href="${targetUrl}" target="_blank" style="color: inherit; text-decoration: none;">${targetUrl}</a></div>
  </div>
</body>
</html>`;

      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // ==================== SHIFT SCHEDULE ENDPOINTS ====================

    // Route: GET /api/v1/tenant/schedules/template -> Download Schedule CSV Template
    if (url.pathname === "/api/v1/tenant/schedules/template" && request.method === "GET") {
      let csv = "\uFEFF";
      csv += "員工LINE_ID,員工姓名,排班日期(YYYY-MM-DD),班別名稱,預計上班(HH:MM),預計下班(HH:MM),休息分鐘,是否休假(0或1)\r\n";
      csv += `"Ubd107bb3ba1b85a8086fc3b2250458e8","豬毛","2026-08-01","常態班","09:00","18:00",60,0\r\n`;
      csv += `"Ubd107bb3ba1b85a8086fc3b2250458e8","豬毛","2026-08-02","例假","","",0,1\r\n`;

      return new Response(csv, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="schedules_template.csv"`,
        }
      });
    }

    // Route: GET /api/v1/tenant/schedules -> Query shift schedules scoped to tenant
    if (url.pathname === "/api/v1/tenant/schedules" && request.method === "GET") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated) {
        return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
      }

      const month = url.searchParams.get("month");
      const userId = url.searchParams.get("userId");
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");

      try {
        let sql = `
          SELECT s.id, s.company_id, s.line_user_id, e.employee_name, s.work_date, s.shift_name, s.shift_start, s.shift_end, s.break_minutes, s.is_rest_day, s.is_cross_day, s.created_at
          FROM employee_schedules s
          LEFT JOIN company_employees e ON s.line_user_id = e.line_user_id
          WHERE (s.company_id = ? OR s.company_id LIKE ?)
        `;
        const params: any[] = [auth.taxId, `${auth.taxId}-%`];

        if (month) {
          sql += " AND s.work_date LIKE ?";
          params.push(`${month}%`);
        }
        if (startDate) {
          sql += " AND s.work_date >= ?";
          params.push(startDate);
        }
        if (endDate) {
          sql += " AND s.work_date <= ?";
          params.push(endDate);
        }
        if (userId) {
          sql += " AND s.line_user_id = ?";
          params.push(userId.trim());
        }

        sql += " ORDER BY s.work_date ASC, s.line_user_id ASC LIMIT 500";

        const { results } = await env.DB.prepare(sql).bind(...params).all();
        return Response.json({ success: true, companyTaxId: auth.taxId, count: results.length, schedules: results }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: POST /api/v1/tenant/schedules/batch -> Batch upsert shift schedules scoped to tenant
    if (url.pathname === "/api/v1/tenant/schedules/batch" && request.method === "POST") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated) {
        return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
      }

      if (auth.role !== "ADMIN") {
        return Response.json({ success: false, error: "權限不足：僅 ADMIN 角色可匯入或修改班表" }, { status: 403, headers: corsHeaders });
      }

      try {
        const body = (await request.json()) as { schedules: Array<any> };
        if (!body.schedules || !Array.isArray(body.schedules) || body.schedules.length === 0) {
          return Response.json({ success: false, error: "缺少 schedules 陣列資料" }, { status: 400, headers: corsHeaders });
        }

        let insertedCount = 0;

        for (const item of body.schedules) {
          if (!item.line_user_id || !item.work_date) continue;

          const defaultCompanyId = item.company_id || `${auth.taxId}-01`;
          const sName = item.shift_name || (item.is_rest_day ? "例假" : "常態班");
          const sStart = item.is_rest_day ? null : (item.shift_start || "09:00");
          const sEnd = item.is_rest_day ? null : (item.shift_end || "18:00");
          const breakMins = typeof item.break_minutes === "number" ? item.break_minutes : 60;
          const isRest = item.is_rest_day ? 1 : 0;
          const isCross = item.is_cross_day ? 1 : 0;

          await env.DB.prepare(`
            INSERT INTO employee_schedules (company_id, line_user_id, work_date, shift_name, shift_start, shift_end, break_minutes, is_rest_day, is_cross_day, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
            ON CONFLICT(company_id, line_user_id, work_date) DO UPDATE SET
              shift_name = excluded.shift_name,
              shift_start = excluded.shift_start,
              shift_end = excluded.shift_end,
              break_minutes = excluded.break_minutes,
              is_rest_day = excluded.is_rest_day,
              is_cross_day = excluded.is_cross_day,
              updated_at = datetime('now', '+8 hours')
          `).bind(defaultCompanyId, item.line_user_id.trim(), item.work_date.trim(), sName, sStart, sEnd, breakMins, isRest, isCross).run();

          insertedCount++;
        }

        return Response.json({
          success: true,
          message: `成功更新 ${insertedCount} 筆排班資料。`,
          insertedCount
        }, { headers: corsHeaders });

      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/v1/tenant/records -> Query attendance records strictly scoped to tenant, with CSV export option
    if (url.pathname === "/api/v1/tenant/records" && request.method === "GET") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated) {
        return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
      }

      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");
      const status = url.searchParams.get("status");
      const punchType = url.searchParams.get("punchType");
      const format = (url.searchParams.get("format") || "json").toLowerCase();
      const limit = parseInt(url.searchParams.get("limit") || "100", 10);

      try {
        let sql = "SELECT id, company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at FROM checkin_records WHERE (company_id = ? OR company_id LIKE ?)";
        const params: any[] = [auth.taxId, `${auth.taxId}-%`];

        if (startDate) {
          sql += " AND created_at >= ?";
          params.push(`${startDate} 00:00:00`);
        }
        if (endDate) {
          sql += " AND created_at <= ?";
          params.push(`${endDate} 23:59:59`);
        }
        if (status) {
          sql += " AND status = ?";
          params.push(status.trim());
        }
        if (punchType) {
          sql += " AND punch_type = ?";
          params.push(punchType.trim());
        }

        sql += " ORDER BY id DESC LIMIT ?";
        params.push(limit);

        const stmt = env.DB.prepare(sql);
        const { results } = await stmt.bind(...params).all();

        if (format === "csv") {
          let csv = "\uFEFF";
          csv += "紀錄序號,據點代碼,員工LINE_ID,員工姓名,打卡狀態,打卡類型,當段工時(小時),驗證方式,打卡時間,距離(公尺)\r\n";

          for (const r of (results as any[])) {
            const pTypeStr = r.punch_type === "IN" ? "上班" : "下班";
            const vModeStr = r.verify_mode === "IP_WHITELIST" ? "公司Wi-Fi" : (r.verify_mode === "GPS_FALLBACK" ? "外網GPS" : "GPS");
            const wHoursStr = r.work_hours !== null && r.work_hours !== undefined ? r.work_hours.toString() : "";
            
            const line = [
              r.id,
              `"${(r.company_id || "").replace(/"/g, '""')}"`,
              `"${(r.line_user_id || "").replace(/"/g, '""')}"`,
              `"${(r.display_name || "").replace(/"/g, '""')}"`,
              `"${(r.status || "").replace(/"/g, '""')}"`,
              `"${pTypeStr}"`,
              `"${wHoursStr}"`,
              `"${vModeStr}"`,
              `"${r.created_at}"`,
              Math.round(r.distance_meters || 0)
            ].join(",");

            csv += line + "\r\n";
          }

          return new Response(csv, {
            headers: {
              ...corsHeaders,
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="attendance_${auth.taxId}_${new Date().toISOString().slice(0, 10)}.csv"`,
            }
          });
        }

        return Response.json({
          success: true,
          companyTaxId: auth.taxId,
          role: auth.role,
          count: results.length,
          records: results
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Note: 裝置解綁改由員工端於打卡或換機時自主完成，後端自動寫入 SWITCH_DEVICE 警訊日誌供管理者稽核。

    // Route: GET /api/v1/tenant/audit -> Query audit logs scoped to tenant
    if (url.pathname === "/api/v1/tenant/audit" && request.method === "GET") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated) {
        return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
      }

      try {
        const { results } = await env.DB.prepare(`
          SELECT a.id, a.line_user_id, a.display_name, a.action, a.old_device_id, a.new_device_id, a.ip_address, a.warning_level, a.created_at
          FROM device_audit_logs a
          JOIN company_employees e ON a.line_user_id = e.line_user_id
          WHERE e.company_id = ? OR e.company_id LIKE ?
          ORDER BY a.id DESC LIMIT 50
        `).bind(auth.taxId, `${auth.taxId}-%`).all();

        return Response.json({ success: true, companyTaxId: auth.taxId, count: results.length, logs: results }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/v1/tenant/approvals -> Query all approval records scoped to tenant
    if (url.pathname === "/api/v1/tenant/approvals" && request.method === "GET") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated || !auth.taxId) {
        return Response.json({ success: false, error: auth.error || "未授權" }, { status: auth.status || 401, headers: corsHeaders });
      }

      try {
        const status = url.searchParams.get("status");
        const type = url.searchParams.get("type");
        const month = url.searchParams.get("month"); // YYYY-MM

        let query = "SELECT * FROM approvals WHERE (company_id = ? OR company_id LIKE ?)";
        const params: any[] = [auth.taxId, `${auth.taxId}-%`];

        if (status) {
          query += " AND status = ?";
          params.push(status);
        }
        if (type) {
          query += " AND type = ?";
          params.push(type);
        }
        if (month) {
          query += " AND target_date LIKE ?";
          params.push(`${month}%`);
        }

        query += " ORDER BY created_at DESC LIMIT 100";

        const { results } = await env.DB.prepare(query).bind(...params).all();
        return Response.json({ success: true, companyTaxId: auth.taxId, count: results?.length || 0, approvals: results || [] }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: POST /api/v1/tenant/employees/:lineUserId/approver -> Assign manager LINE ID to employee
    if (url.pathname.startsWith("/api/v1/tenant/employees/") && url.pathname.endsWith("/approver") && request.method === "POST") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated || !auth.taxId) {
        return Response.json({ success: false, error: auth.error || "未授權" }, { status: auth.status || 401, headers: corsHeaders });
      }

      if (auth.role !== "ADMIN" && auth.role !== "MANAGER") {
        return Response.json({ success: false, error: "權限不足：僅 ADMIN 或 MANAGER 角色可指派審核主管" }, { status: 403, headers: corsHeaders });
      }

      const parts = url.pathname.split("/");
      const targetLineUserId = decodeURIComponent(parts[5] || "");

      if (!targetLineUserId) {
        return Response.json({ success: false, error: "缺少 targetLineUserId 參數" }, { status: 400, headers: corsHeaders });
      }

      try {
        const body = (await request.json()) as { approverLineId?: string; employeeName?: string; companyId?: string };
        const { approverLineId, employeeName, companyId } = body;

        if (!approverLineId || !approverLineId.trim()) {
          return Response.json({ success: false, error: "缺少 approverLineId 參數" }, { status: 400, headers: corsHeaders });
        }

        const effectiveCompanyId = companyId || auth.taxId;

        await env.DB.prepare(`
          INSERT INTO company_employees (company_id, line_user_id, employee_name, approver_line_id)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(line_user_id) DO UPDATE SET
            company_id = excluded.company_id,
            employee_name = COALESCE(excluded.employee_name, company_employees.employee_name),
            approver_line_id = excluded.approver_line_id
        `).bind(effectiveCompanyId, targetLineUserId.trim(), employeeName || null, approverLineId.trim()).run();

        return Response.json({
          success: true,
          message: `已成功為員工 [${targetLineUserId}] 綁定直屬審核主管 [${approverLineId}]`
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/v1/tenant/employees -> List all employees with PBAC permissions
    if (url.pathname === "/api/v1/tenant/employees" && request.method === "GET") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated || !auth.taxId) {
        return Response.json({ success: false, error: auth.error || "未授權存取" }, { status: auth.status || 401, headers: corsHeaders });
      }

      try {
        const { results } = await env.DB.prepare(`
          SELECT ce.id, ce.company_id, ce.line_user_id, ce.employee_name, ce.approver_line_id, ce.permissions, ce.created_at,
                 l.name as company_name, l.manager_line_id
          FROM company_employees ce
          LEFT JOIN locations l ON ce.company_id = l.id
          WHERE (ce.company_id = ? OR ce.company_id LIKE ?)
          ORDER BY ce.id DESC
        `).bind(auth.taxId, `${auth.taxId}-%`).all();

        const employees = ((results as any[]) || []).map(r => {
          let perms = ["punch", "apply"];
          if (r.permissions) {
            try {
              const parsed = JSON.parse(r.permissions);
              if (Array.isArray(parsed)) perms = parsed;
            } catch (e) {}
          }
          const isManager = r.manager_line_id === r.line_user_id;
          if (isManager) {
            for (const p of ["approve", "view_store", "set_location"]) {
              if (!perms.includes(p)) perms.push(p);
            }
          }
          return {
            id: r.id,
            companyId: r.company_id,
            companyName: r.company_name,
            lineUserId: r.line_user_id,
            employeeName: r.employee_name,
            approverLineId: r.approver_line_id,
            permissions: perms,
            isManager,
            createdAt: r.created_at
          };
        });

        return Response.json({ success: true, employees }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: POST /api/v1/tenant/employees/:id/permissions -> Update employee permissions
    if (url.pathname.startsWith("/api/v1/tenant/employees/") && url.pathname.endsWith("/permissions") && request.method === "POST") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated || !auth.taxId) {
        return Response.json({ success: false, error: auth.error || "未授權存取" }, { status: auth.status || 401, headers: corsHeaders });
      }
      if (auth.role !== "ADMIN") {
        return Response.json({ success: false, error: "僅 ADMIN 角色具備權限變更權限" }, { status: 403, headers: corsHeaders });
      }

      const parts = url.pathname.split("/");
      const targetEmpIdOrUserId = decodeURIComponent(parts[5] || "");
      if (!targetEmpIdOrUserId) {
        return Response.json({ success: false, error: "缺少目標員工識別碼" }, { status: 400, headers: corsHeaders });
      }

      try {
        const body = (await request.json()) as { permissions?: string[]; employeeName?: string; companyId?: string };
        const permissions = Array.isArray(body.permissions) ? body.permissions : ["punch", "apply"];
        const effectiveCompanyId = body.companyId || auth.taxId;
        const permStr = JSON.stringify(permissions);

        await env.DB.prepare(`
          INSERT INTO company_employees (company_id, line_user_id, employee_name, permissions)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(line_user_id) DO UPDATE SET
            company_id = excluded.company_id,
            employee_name = COALESCE(excluded.employee_name, company_employees.employee_name),
            permissions = excluded.permissions
        `).bind(effectiveCompanyId, targetEmpIdOrUserId.trim(), body.employeeName || null, permStr).run();

        // Auto sync LINE Rich Menu based on PBAC projection
        if (env.LINE_CHANNEL_ACCESS_TOKEN) {
          const isManager = await env.DB.prepare("SELECT 1 FROM locations WHERE manager_line_id = ? LIMIT 1").bind(targetEmpIdOrUserId.trim()).first();
          await syncUserRichMenu(env.LINE_CHANNEL_ACCESS_TOKEN, targetEmpIdOrUserId.trim(), permissions, !!isManager);
        }

        return Response.json({
          success: true,
          message: `已成功更新員工 [${targetEmpIdOrUserId}] 權限設定並同步 LINE 圖文選單`,
          permissions
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: POST /api/v1/tenant/richmenu/sync -> Batch sync LINE rich menus for all employees of tenant
    if (url.pathname === "/api/v1/tenant/richmenu/sync" && request.method === "POST") {
      const auth = await authenticateTenantRequest(request, env.DB);
      if (!auth.authenticated || !auth.taxId) {
        return Response.json({ success: false, error: auth.error || "未授權存取" }, { status: auth.status || 401, headers: corsHeaders });
      }

      try {
        const { results } = await env.DB.prepare(`
          SELECT ce.line_user_id, ce.permissions, l.manager_line_id
          FROM company_employees ce
          LEFT JOIN locations l ON ce.company_id = l.id
          WHERE ce.company_id = ? OR ce.company_id LIKE ?
        `).bind(auth.taxId, `${auth.taxId}-%`).all();

        let syncedCount = 0;
        for (const row of ((results as any[]) || [])) {
          let perms: string[] = ["punch", "apply"];
          if (row.permissions) {
            try {
              const p = JSON.parse(row.permissions);
              if (Array.isArray(p)) perms = p;
            } catch (e) {}
          }
          const isMgr = row.manager_line_id === row.line_user_id;
          await syncUserRichMenu(env.LINE_CHANNEL_ACCESS_TOKEN, row.line_user_id, perms, isMgr);
          syncedCount++;
        }

        return Response.json({
          success: true,
          message: `已完成 ${syncedCount} 位同仁之 LINE 圖文選單動態同步`,
          syncedCount,
          employeeMenuId: EMPLOYEE_RICH_MENU_ID,
          managerMenuId: MANAGER_RICH_MENU_ID
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/v1/employee/profile -> Get current employee profile & permissions
    if (url.pathname === "/api/v1/employee/profile" && request.method === "GET") {
      const userId = url.searchParams.get("userId") || "";
      const cid = url.searchParams.get("cid") || "";
      if (!userId) {
        return Response.json({ success: false, error: "缺少 userId 參數" }, { status: 400, headers: corsHeaders });
      }

      try {
        const permCtx = await getUserPermissionContext(env, userId);
        let targetLocation: any = null;
        if (cid) {
          const loc = await env.DB.prepare(
            "SELECT id, name, address FROM locations WHERE id = ?"
          ).bind(cid).first<{ id: string; name: string; address: string }>();
          if (loc) {
            targetLocation = loc;
          }
        }

        return Response.json({
          success: true,
          profile: {
            userId,
            companyId: permCtx.companyId,
            companyName: permCtx.companyName,
            employeeName: permCtx.employeeName,
            permissions: permCtx.permissions,
            isManager: permCtx.isManager,
            allPermissions: ALL_PERMISSIONS,
            permissionLabels: PERMISSION_LABELS,
            targetLocation
          }
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: POST /api/v1/employee/join -> Explicit Onboarding for Newcomer Employee
    if (url.pathname === "/api/v1/employee/join" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          companyId?: string;
          lineUserId?: string;
          displayName?: string;
          idToken?: string;
        };

        const companyId = body.companyId?.trim();
        const lineUserId = body.lineUserId?.trim();
        const displayName = body.displayName?.trim() || "新進同仁";

        if (!companyId || !lineUserId) {
          return Response.json({ success: false, error: "缺少 companyId 或 lineUserId 參數" }, { status: 400, headers: corsHeaders });
        }

        // Validate location exists
        const location = await env.DB.prepare(
          "SELECT id, name, address FROM locations WHERE id = ?"
        ).bind(companyId).first<{ id: string; name: string; address: string }>();

        if (!location) {
          return Response.json({ success: false, error: `找不到此門市代碼 [${companyId}]` }, { status: 404, headers: corsHeaders });
        }

        // Upsert company_employees
        await env.DB.prepare(`
          INSERT INTO company_employees (company_id, line_user_id, employee_name, permissions)
          VALUES (?, ?, ?, '["punch","apply"]')
          ON CONFLICT(line_user_id) DO UPDATE SET
            company_id = excluded.company_id,
            employee_name = excluded.employee_name
        `).bind(companyId, lineUserId, displayName).run();

        // Record audit log
        try {
          await env.DB.prepare(`
            INSERT INTO device_audit_logs (line_user_id, display_name, action, new_device_id, warning_level)
            VALUES (?, ?, 'INITIAL_JOIN', ?, 'INFO')
          `).bind(lineUserId, displayName, companyId).run();
        } catch (e) {}

        return Response.json({
          success: true,
          message: `成功加入【${location.name}】考勤系統！`,
          companyId: location.id,
          companyName: location.name,
          employeeName: displayName
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: POST /api/v1/tenant/locations/wifi -> Register current IP to location allowed_ips
    if (url.pathname === "/api/v1/tenant/locations/wifi" && request.method === "POST") {
      try {
        const body = (await request.json()) as { companyId?: string; lineUserId?: string };
        let companyId = body.companyId;

        if (body.lineUserId) {
          const permCtx = await getUserPermissionContext(env, body.lineUserId);
          if (!hasPermission(permCtx.permissions, "set_wifi")) {
            return Response.json({ success: false, error: "權限不足：缺少 set_wifi 權限" }, { status: 403, headers: corsHeaders });
          }
          if (!companyId) companyId = permCtx.companyId || "";
        } else {
          const auth = await authenticateTenantRequest(request, env.DB);
          if (!auth.authenticated || !auth.taxId) {
            return Response.json({ success: false, error: auth.error || "未授權存取" }, { status: auth.status || 401, headers: corsHeaders });
          }
          if (!companyId) companyId = auth.taxId;
        }

        if (!companyId) {
          return Response.json({ success: false, error: "缺少門市 companyId" }, { status: 400, headers: corsHeaders });
        }

        const loc = await env.DB.prepare("SELECT id, name, allowed_ips FROM locations WHERE id = ?").bind(companyId).first<{ id: string; name: string; allowed_ips: string | null }>();
        if (!loc) {
          return Response.json({ success: false, error: "門市不存在" }, { status: 404, headers: corsHeaders });
        }

        let existingIps = loc.allowed_ips ? loc.allowed_ips.split(",").map(ip => ip.trim()).filter(Boolean) : [];
        if (!existingIps.includes(clientIp)) {
          existingIps.push(clientIp);
        }
        const updatedIps = existingIps.join(", ");

        await env.DB.prepare("UPDATE locations SET allowed_ips = ? WHERE id = ?").bind(updatedIps, companyId).run();

        return Response.json({
          success: true,
          message: `已成功將當前連線 IP [${clientIp}] 加入門市 [${loc.name}] 白名單`,
          allowedIps: updatedIps
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ==================== LINE Webhook Handler ====================
    if ((url.pathname === "/api/webhook" || url.pathname === "/webhook") && request.method === "POST") {
      try {
        const rawBody = await request.text();
        const signature = request.headers.get("x-line-signature");

        const isValid = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);
        if (!isValid) {
          return new Response("Invalid signature", { status: 401, headers: corsHeaders });
        }

        const data = JSON.parse(rawBody || "{}");
        const events = data.events || [];
        const token = env.LINE_CHANNEL_ACCESS_TOKEN || "";

        for (const event of events) {
          const userId = event.source?.userId;
          const replyToken = event.replyToken;
          if (!userId) continue;

          // Handle Follow / Add Friend Event
          if (event.type === "follow") {
            if (replyToken) {
              await replyLineMessage(
                token,
                replyToken,
                "👋 您好！歡迎使用雲端考勤打卡系統。\n\n" +
                "📌 【新進同仁】：請點擊下方圖文選單的【考勤打卡】完成門市入職登記。\n" +
                "📌 【日常出勤】：每日上下班點擊下方選單【考勤打卡】即可快速 GPS / Wi-Fi 打卡。\n" +
                "📌 【排班與簽核】：點擊下方選單【排班月曆】可查閱班表，【線上簽核】可隨時提出請假、補卡或加班申請。"
              );
            }
            continue;
          }

          if (event.type === "postback") {
            const params = new URLSearchParams(event.postback.data || "");
            const action = params.get("action");

            // Handle In-Chat BPM Approval Actions (Approve / Reject)
            if (action === "approve" || action === "reject") {
              const approvalId = params.get("id");
              if (!approvalId) {
                if (replyToken) await replyLineMessage(token, replyToken, "⚠️ 審批參數錯誤：缺少單號。");
                continue;
              }

              const approval = await env.DB.prepare(`
                SELECT * FROM approvals WHERE id = ?
              `).bind(approvalId).first<{
                id: string;
                company_id: string;
                line_user_id: string;
                applicant_name: string;
                approver_line_id: string;
                type: string;
                target_date: string;
                details: string;
                status: string;
              }>();

              if (!approval) {
                if (replyToken) await replyLineMessage(token, replyToken, "❌ 查無此審批單據。");
                continue;
              }

              // Security Check: Approver Identity Verification
              if (approval.approver_line_id !== userId) {
                if (replyToken) await replyLineMessage(token, replyToken, "⚠️ 您不是本單據的指定審核人，無權進行此操作。");
                continue;
              }

              // Idempotency Check: Status must be PENDING
              if (approval.status !== "PENDING") {
                const statusTag = approval.status === "APPROVED" ? "已核准" : (approval.status === "REJECTED" ? "已駁回" : approval.status);
                if (replyToken) await replyLineMessage(token, replyToken, `ℹ️ 此單據已由主管處理完畢（目前狀態：${statusTag}），無法重複操作。`);
                continue;
              }

              const isApprove = action === "approve";
              const newStatus = isApprove ? "APPROVED" : "REJECTED";

              await env.DB.prepare(`
                UPDATE approvals
                SET status = ?, decided_at = datetime('now', '+8 hours')
                WHERE id = ?
              `).bind(newStatus, approval.id).run();

              // Trigger business side-effects upon approval
              if (isApprove) {
                let detailsObj: any = {};
                try {
                  detailsObj = JSON.parse(approval.details || "{}");
                } catch (e) {}

                if (approval.type === "CORRECTION") {
                  const punchType = detailsObj.punch_type || "IN";
                  const punchTime = detailsObj.time || "09:00:00";
                  const fullTimestamp = `${approval.target_date} ${punchTime.length === 5 ? punchTime + ":00" : punchTime}`;
                  const workHours = typeof detailsObj.work_hours === "number" ? detailsObj.work_hours : null;

                  await env.DB.prepare(`
                    INSERT INTO checkin_records (
                      company_id, line_user_id, display_name, latitude, longitude, distance_meters,
                      status, punch_type, work_hours, verify_mode, created_at
                    ) VALUES (
                      ?, ?, ?, 0, 0, 0, 'SUCCESS', ?, ?, 'APPROVED_OVERRIDE', ?
                    )
                  `).bind(
                    approval.company_id,
                    approval.line_user_id,
                    approval.applicant_name,
                    punchType,
                    workHours,
                    fullTimestamp
                  ).run();

                  await env.DB.prepare(`
                    INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
                    VALUES (?, ?, 'APPROVAL_PUNCH_OVERRIDE', NULL, NULL, ?, ?, 'INFO')
                  `).bind(approval.line_user_id, approval.applicant_name, clientIp, userAgent).run();

                } else if (approval.type === "LEAVE") {
                  const leaveType = detailsObj.leave_type || "事假";
                  const timeRange = detailsObj.time_range || "";
                  const shiftName = `請假 (${leaveType})`;

                  // Check if this employee already has successful punches on target_date
                  const punchCount = await env.DB.prepare(
                    "SELECT COUNT(*) as cnt FROM checkin_records WHERE line_user_id = ? AND date(created_at) = ? AND status IN ('SUCCESS', 'DUPLICATE')"
                  ).bind(approval.line_user_id, approval.target_date).first<{ cnt: number }>();

                  const hasPunches = (punchCount?.cnt || 0) > 0;
                  const isPartial = timeRange.includes("上半天") || timeRange.includes("下半天") || timeRange.includes("小時");
                  const isRestDay = (hasPunches || isPartial) ? 0 : 1;

                  await env.DB.prepare(`
                    INSERT INTO employee_schedules (
                      company_id, line_user_id, work_date, shift_name, is_rest_day, created_at, updated_at
                    ) VALUES (
                      ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours')
                    )
                    ON CONFLICT(company_id, line_user_id, work_date) DO UPDATE SET
                      shift_name = excluded.shift_name,
                      is_rest_day = excluded.is_rest_day,
                      updated_at = datetime('now', '+8 hours')
                  `).bind(approval.company_id, approval.line_user_id, approval.target_date, shiftName, isRestDay).run();
                }
              }

              // Reply confirmation to manager
              const itemLabel = approval.type === "LEAVE" ? "請假" : (approval.type === "CORRECTION" ? "補卡" : "加班");
              const replyText = isApprove
                ? `✅ 【核准成功】\n已核准【${approval.applicant_name}】的${itemLabel}申請（日期：${approval.target_date}）。\n系統已自動同步更新出勤紀錄與班表！`
                : `❌ 【已駁回】\n已駁回【${approval.applicant_name}】的${itemLabel}申請（日期：${approval.target_date}）。`;
              if (replyToken) await replyLineMessage(token, replyToken, replyText);

              // Push result notification to applicant
              await pushApprovalResultFlex(
                token,
                approval.line_user_id,
                approval.applicant_name,
                approval.type,
                approval.target_date,
                newStatus as any
              );
              continue;
            }

            const recordId = parseInt(params.get("recordId") || params.get("record_id") || "0", 10);

            if (recordId && (action === "flip" || action === "undo")) {
              const record = await env.DB.prepare(`
                SELECT id, line_user_id, display_name, status, punch_type, work_hours, created_at,
                       (julianday('now', '+8 hours') - julianday(created_at)) * 86400 AS delta_seconds
                FROM checkin_records
                WHERE id = ? AND line_user_id = ?
              `).bind(recordId, userId).first<{
                id: number;
                line_user_id: string;
                display_name: string;
                status: string;
                punch_type: string;
                work_hours: number | null;
                created_at: string;
                delta_seconds: number;
              }>();

              if (!record) {
                if (replyToken) await replyLineMessage(token, replyToken, "❌ 查無此筆打卡紀錄。");
                continue;
              }

              if (record.status === "CANCELLED") {
                if (replyToken) await replyLineMessage(token, replyToken, `ℹ️ 此筆打卡紀錄已被撤回（原打卡時間：${record.created_at}）。`);
                continue;
              }

              const rawDelta = typeof record.delta_seconds === "number" ? record.delta_seconds : (record.delta_seconds ? parseFloat(String(record.delta_seconds)) : 0);
              const deltaSeconds = isNaN(rawDelta) ? 0 : Math.max(0, rawDelta);

              if (deltaSeconds > 35) {
                const msg = `⚠️ 已超過 30 秒安全時限（目前已過 ${Math.round(deltaSeconds)} 秒），無法自行變更紀錄。\n如需補正考勤請洽後台主管。`;
                if (replyToken) await replyLineMessage(token, replyToken, msg);
                continue;
              }

              if (action === "undo") {
                await env.DB.prepare(`
                  UPDATE checkin_records
                  SET status = 'CANCELLED'
                  WHERE line_user_id = ?
                    AND (
                      id = ?
                      OR (
                        created_at >= ?
                        AND status IN ('SUCCESS', 'DUPLICATE')
                      )
                    )
                `).bind(userId, record.id, record.created_at).run();

                await env.DB.prepare(`
                  INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
                  VALUES (?, ?, 'UNDO_CHECKIN', NULL, NULL, ?, ?, 'INFO')
                `).bind(userId, record.display_name, clientIp, userAgent).run();

                const replyText = `🗑️ 【撤回成功】\n已成功撤回此筆打卡！\n原紀錄時間：${record.created_at}\n該筆考勤已標記為作廢，30 分鐘限制已重置。`;
                if (replyToken) await replyLineMessage(token, replyToken, replyText);
              } else if (action === "flip") {
                if (record.punch_type === "IN") {
                  const prevRecord = await env.DB.prepare(`
                    SELECT id, created_at,
                           (julianday(?) - julianday(created_at)) * 24 AS shift_hours
                    FROM checkin_records
                    WHERE line_user_id = ? AND status = 'SUCCESS' AND id < ?
                    ORDER BY id DESC LIMIT 1
                  `).bind(record.created_at, userId, record.id).first<{ id: number; created_at: string; shift_hours: number }>();

                  let calcHours: number | null = null;
                  if (prevRecord && typeof prevRecord.shift_hours === "number" && prevRecord.shift_hours > 0 && prevRecord.shift_hours <= 18) {
                    calcHours = parseFloat(prevRecord.shift_hours.toFixed(1));
                  }

                  await env.DB.prepare(
                    "UPDATE checkin_records SET punch_type = 'OUT', work_hours = ? WHERE id = ?"
                  ).bind(calcHours, record.id).run();

                  await env.DB.prepare(`
                    INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
                    VALUES (?, ?, 'FLIP_TO_OUT', NULL, NULL, ?, ?, 'INFO')
                  `).bind(userId, record.display_name, clientIp, userAgent).run();

                  const hoursText = calcHours !== null ? `\n⏱️ 當段工時：${calcHours} 小時` : "";
                  const replyText = `🔄 【翻轉成功】\n狀態已更正為【🔴 下班 (OUT)】${hoursText}\n打卡時間：${record.created_at}`;
                  if (replyToken) await replyLineMessage(token, replyToken, replyText);
                } else {
                  await env.DB.prepare(
                    "UPDATE checkin_records SET punch_type = 'IN', work_hours = NULL WHERE id = ?"
                  ).bind(record.id).run();

                  await env.DB.prepare(`
                    INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
                    VALUES (?, ?, 'FLIP_TO_IN', NULL, NULL, ?, ?, 'INFO')
                  `).bind(userId, record.display_name, clientIp, userAgent).run();

                  const replyText = `🔄 【翻轉成功】\n狀態已更正為【🟢 上班 (IN)】\n打卡時間：${record.created_at}`;
                  if (replyToken) await replyLineMessage(token, replyToken, replyText);
                }
              }
            }
          }

          // Handle Location Message (Setting Store GPS Coordinates directly from LINE)
          if (event.type === "message" && event.message?.type === "location") {
            const locMsg = event.message as {
              type: "location";
              id: string;
              title?: string;
              address?: string;
              latitude: number;
              longitude: number;
            };

            const permCtx = await getUserPermissionContext(env, userId);
            if (!hasPermission(permCtx.permissions, "set_location")) {
              if (replyToken) {
                await replyLineMessage(
                  token,
                  replyToken,
                  "⛔ 【權限不足】\n您的帳號尚未開通「座標設定 (set_location)」權限。\n如需為門市設置打卡 GPS 座標，請洽企業管理員於後台為您賦權。"
                );
              }
              continue;
            }

            let targetLocId = permCtx.companyId;
            let targetLocName = permCtx.companyName;

            if (!targetLocId) {
              const mgrLoc = await env.DB.prepare(
                "SELECT id, name FROM locations WHERE manager_line_id = ? LIMIT 1"
              ).bind(userId).first<{ id: string; name: string }>();
              if (mgrLoc) {
                targetLocId = mgrLoc.id;
                targetLocName = mgrLoc.name;
              }
            }

            if (!targetLocId) {
              if (replyToken) {
                await replyLineMessage(
                  token,
                  replyToken,
                  "⚠️ 【無所屬門市】\n系統查無您所屬的門市代碼，無法綁定座標。\n請先於管理後台將您的帳號指派至指定門市。"
                );
              }
              continue;
            }

            const lat = locMsg.latitude;
            const lon = locMsg.longitude;
            const addr = locMsg.address || locMsg.title || "現場分享座標";

            await env.DB.prepare(`
              UPDATE locations
              SET target_lat = ?, target_lon = ?, address = ?
              WHERE id = ?
            `).bind(lat, lon, addr, targetLocId).run();

            await env.DB.prepare(`
              INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
              VALUES (?, ?, 'SET_STORE_GPS', NULL, ?, ?, ?, 'INFO')
            `).bind(
              userId,
              permCtx.employeeName || "門市主管",
              `${targetLocId}:${lat.toFixed(6)},${lon.toFixed(6)}`,
              clientIp,
              userAgent
            ).run();

            const successMsg = `🗺️ 【門市 GPS 座標更新成功】\n\n` +
              `🏢 門市據點：${targetLocName || targetLocId}\n` +
              `📍 最新座標：${lat.toFixed(6)}, ${lon.toFixed(6)}\n` +
              `🏠 登記地址：${addr}\n\n` +
              `✅ 經緯度已即時寫入雲端 D1 資料庫，全員即刻起以此座標作為打卡地理圍欄中心點！`;

            if (replyToken) {
              await replyLineMessage(token, replyToken, successMsg);
            }
            continue;
          }

          if (event.type === "message" && event.message?.type === "text") {
            const userMsg = event.message.text.trim();

            // 1. Attendance dashboard for store / company
            if (userMsg.includes("今日出勤") || userMsg.includes("門市出勤") || userMsg.includes("出勤看板")) {
              const permCtx = await getUserPermissionContext(env, userId);
              const canViewStore = hasPermission(permCtx.permissions, "view_store");
              const canViewAll = hasPermission(permCtx.permissions, "view_all");

              if (!canViewStore && !canViewAll) {
                if (replyToken) {
                  await replyLineMessage(
                    token,
                    replyToken,
                    "⛔ 【權限不足】\n您尚未開通「門市看板 (view_store)」或「全局看板 (view_all)」權限，無法查閱當日出勤看板。"
                  );
                }
                continue;
              }

              const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
              const targetCompanyId = permCtx.companyId || "";

              let schedSql = "SELECT s.company_id, s.line_user_id, s.shift_name, s.shift_start, s.shift_end, s.is_rest_day, COALESCE(e.employee_name, '同仁') as emp_name FROM employee_schedules s LEFT JOIN company_employees e ON s.line_user_id = e.line_user_id WHERE s.work_date = ?";
              let schedParams: any[] = [todayStr];
              if (!canViewAll && targetCompanyId) {
                schedSql += " AND (s.company_id = ? OR s.company_id LIKE ?)";
                schedParams.push(targetCompanyId, `${targetCompanyId}-%`);
              }
              const { results: schedResults } = await env.DB.prepare(schedSql).bind(...schedParams).all();

              let punchSql = "SELECT line_user_id, display_name, punch_type, status, created_at FROM checkin_records WHERE created_at LIKE ? AND status = 'SUCCESS'";
              let punchParams: any[] = [`${todayStr}%`];
              if (!canViewAll && targetCompanyId) {
                punchSql += " AND (company_id = ? OR company_id LIKE ?)";
                punchParams.push(targetCompanyId, `${targetCompanyId}-%`);
              }
              const { results: punchResults } = await env.DB.prepare(punchSql).bind(...punchParams).all();

              const punches = (punchResults as any[]) || [];
              const schedules = (schedResults as any[]) || [];

              const userPunches = new Map<string, any[]>();
              for (const p of punches) {
                if (!userPunches.has(p.line_user_id)) userPunches.set(p.line_user_id, []);
                userPunches.get(p.line_user_id)!.push(p);
              }

              let totalScheduled = 0;
              let restCount = 0;
              let checkedInCount = 0;
              const missingPunchNames: string[] = [];
              const checkedInNames: string[] = [];

              for (const s of schedules) {
                if (s.is_rest_day === 1) {
                  restCount++;
                  continue;
                }
                totalScheduled++;
                const pList = userPunches.get(s.line_user_id) || [];
                const hasIn = pList.some(p => p.punch_type === "IN");
                if (hasIn) {
                  checkedInCount++;
                  checkedInNames.push(s.emp_name);
                } else {
                  missingPunchNames.push(s.emp_name);
                }
              }

              const rate = totalScheduled > 0 ? Math.round((checkedInCount / totalScheduled) * 100) : 100;
              const storeLabel = permCtx.companyName || (canViewAll ? "全體門市" : targetCompanyId || "所屬門市");

              let msg = `📊 【${storeLabel} 今日出勤看板】\n📅 日期：${todayStr}\n─────────────────\n`;
              msg += `👥 應出勤：${totalScheduled} 人\n`;
              msg += `🟢 已出勤：${checkedInCount} 人 (${rate}%)\n`;
              msg += `🔴 尚未打卡：${missingPunchNames.length} 人\n`;
              msg += `⚪ 休假同仁：${restCount} 人\n`;

              if (missingPunchNames.length > 0) {
                msg += `\n⚠️ 【未到勤名單】：${missingPunchNames.join("、")}`;
              }
              if (checkedInNames.length > 0) {
                msg += `\n\n✅ 【已打卡名單】：${checkedInNames.join("、")}`;
              }

              if (replyToken) await replyLineMessage(token, replyToken, msg);
              continue;
            }

            // 2. Schedule for store / company
            if (userMsg.includes("今日班表") || userMsg.includes("門市班表")) {
              const permCtx = await getUserPermissionContext(env, userId);
              const canViewStore = hasPermission(permCtx.permissions, "view_store");
              const canViewAll = hasPermission(permCtx.permissions, "view_all");

              if (!canViewStore && !canViewAll) {
                if (replyToken) {
                  await replyLineMessage(
                    token,
                    replyToken,
                    "⛔ 【權限不足】\n您尚未開通「門市看板 (view_store)」權限，無法查閱門市班表。"
                  );
                }
                continue;
              }

              const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
              const targetCompanyId = permCtx.companyId || "";

              let schedSql = "SELECT s.shift_name, s.shift_start, s.shift_end, s.is_rest_day, COALESCE(e.employee_name, '同仁') as emp_name FROM employee_schedules s LEFT JOIN company_employees e ON s.line_user_id = e.line_user_id WHERE s.work_date = ?";
              let schedParams: any[] = [todayStr];
              if (!canViewAll && targetCompanyId) {
                schedSql += " AND (s.company_id = ? OR s.company_id LIKE ?)";
                schedParams.push(targetCompanyId, `${targetCompanyId}-%`);
              }
              schedSql += " ORDER BY s.is_rest_day ASC, s.shift_start ASC";

              const { results: schedResults } = await env.DB.prepare(schedSql).bind(...schedParams).all();
              const schedules = (schedResults as any[]) || [];

              if (schedules.length === 0) {
                if (replyToken) await replyLineMessage(token, replyToken, `📅 【${todayStr}】今日門市無排班紀錄。`);
              } else {
                let msg = `📅 【${todayStr} 今日門市班表】\n─────────────────\n`;
                for (const s of schedules) {
                  if (s.is_rest_day === 1) {
                    msg += `⚪ ${s.emp_name}：休假 (${s.shift_name || "例假"})\n`;
                  } else {
                    msg += `🕒 ${s.emp_name}：${s.shift_start || "09:00"} - ${s.shift_end || "18:00"} (${s.shift_name})\n`;
                  }
                }
                if (replyToken) await replyLineMessage(token, replyToken, msg.trim());
              }
              continue;
            }

            // 3. User PBAC permissions query
            if (userMsg.includes("我的權限") || userMsg.includes("權限查詢")) {
              const permCtx = await getUserPermissionContext(env, userId);
              let msg = `🛡️ 【您的 LINE 帳號權限清單】\n─────────────────\n`;
              msg += `👤 員工：${permCtx.employeeName || "未設定姓名"}\n`;
              msg += `🏢 門市：${permCtx.companyName || permCtx.companyId || "未綁定"}\n`;
              if (permCtx.isManager) msg += `⭐ 身分：門市店長 / 主管\n`;
              msg += `\n📋 目前已開通權限：\n`;

              for (const p of ALL_PERMISSIONS) {
                const isGranted = permCtx.permissions.includes(p) || permCtx.permissions.includes("all");
                const icon = isGranted ? "✅" : "▫️";
                msg += `${icon} ${PERMISSION_LABELS[p] || p} (${p})\n`;
              }

              if (replyToken) await replyLineMessage(token, replyToken, msg.trim());
              continue;
            }

            // 4. Personal schedule query
            if (userMsg === "班表" || userMsg === "我的班表" || userMsg === "個人班表") {
              const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
              const { results } = await env.DB.prepare(`
                SELECT work_date, shift_name, shift_start, shift_end, is_rest_day
                FROM employee_schedules
                WHERE line_user_id = ? AND work_date >= ?
                ORDER BY work_date ASC LIMIT 7
              `).bind(userId, todayStr).all();

              const list = (results as any[]) || [];
              if (list.length === 0) {
                if (replyToken) await replyLineMessage(token, replyToken, "📅 查無未來 7 天排班紀錄。");
              } else {
                let msg = `📆 【您的未來一週排班】\n─────────────────\n`;
                for (const item of list) {
                  if (item.is_rest_day === 1) {
                    msg += `⚪ ${item.work_date}：休假 (${item.shift_name})\n`;
                  } else {
                    msg += `🟢 ${item.work_date}：${item.shift_start || "09:00"}-${item.shift_end || "18:00"} (${item.shift_name})\n`;
                  }
                }
                if (replyToken) await replyLineMessage(token, replyToken, msg.trim());
              }
              continue;
            }

            // 5. Existing: Attendance records
            if (userMsg.includes("打卡紀錄") || userMsg.includes("出勤紀錄")) {
              const { results } = await env.DB.prepare(`
                SELECT id, punch_type, work_hours, status, created_at
                FROM checkin_records
                WHERE line_user_id = ?
                ORDER BY id DESC LIMIT 5
              `).bind(userId).all();

              if (!results || results.length === 0) {
                if (replyToken) await replyLineMessage(token, replyToken, "📅 查無近期的打卡紀錄。");
              } else {
                let summary = "📋 最近 5 筆出勤紀錄：\n";
                for (const r of results as any[]) {
                  const typeTag = r.status === "CANCELLED" ? "❌ 已撤回" : (r.punch_type === "IN" ? "🟢 上班" : "🔴 下班");
                  const hourTag = r.work_hours ? ` (${r.work_hours}h)` : "";
                  summary += `• ${r.created_at} ${typeTag}${hourTag}\n`;
                }
                if (replyToken) await replyLineMessage(token, replyToken, summary.trim());
              }
            } else if (userMsg.includes("撤回")) {
              const latest = await env.DB.prepare(`
                SELECT id, created_at,
                       (julianday('now', '+8 hours') - julianday(created_at)) * 86400 AS delta_seconds
                FROM checkin_records
                WHERE line_user_id = ? AND status IN ('SUCCESS', 'DUPLICATE')
                ORDER BY id DESC LIMIT 1
              `).bind(userId).first<{ id: number; created_at: string; delta_seconds: number }>();

              if (!latest) {
                if (replyToken) await replyLineMessage(token, replyToken, "❌ 查無可撤回的打卡紀錄。");
              } else if (latest.delta_seconds > 35) {
                if (replyToken) await replyLineMessage(token, replyToken, `⚠️ 最近一筆打卡已超過 30 秒安全時效（已過 ${Math.round(latest.delta_seconds)} 秒），無法自行撤回。`);
              } else {
                await env.DB.prepare(`
                  UPDATE checkin_records
                  SET status = 'CANCELLED'
                  WHERE line_user_id = ?
                    AND created_at >= ?
                    AND status IN ('SUCCESS', 'DUPLICATE')
                `).bind(userId, latest.created_at).run();

                await env.DB.prepare(`
                  INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
                  VALUES (?, 'LINE用戶', 'UNDO_CHECKIN', NULL, NULL, ?, ?, 'INFO')
                `).bind(userId, clientIp, userAgent).run();

                if (replyToken) await replyLineMessage(token, replyToken, `🗑️ 已成功撤回剛才的打卡紀錄（${latest.created_at}），30 分鐘限制已重置。`);
              }
            } else if (userMsg.includes("翻轉") || userMsg.includes("更正")) {
              const latest = await env.DB.prepare(`
                SELECT id, punch_type, created_at,
                       (julianday('now', '+8 hours') - julianday(created_at)) * 86400 AS delta_seconds
                FROM checkin_records
                WHERE line_user_id = ? AND status = 'SUCCESS'
                ORDER BY id DESC LIMIT 1
              `).bind(userId).first<{ id: number; punch_type: string; created_at: string; delta_seconds: number }>();

              if (!latest) {
                if (replyToken) await replyLineMessage(token, replyToken, "❌ 查無可翻轉的打卡紀錄。");
              } else if (latest.delta_seconds > 35) {
                if (replyToken) await replyLineMessage(token, replyToken, `⚠️ 最近一筆打卡已超過 30 秒安全時效（已過 ${Math.round(latest.delta_seconds)} 秒），無法自行翻轉。`);
              } else {
                const newType = latest.punch_type === "IN" ? "OUT" : "IN";
                await env.DB.prepare("UPDATE checkin_records SET punch_type = ? WHERE id = ?").bind(newType, latest.id).run();
                const newLabel = newType === "IN" ? "🟢 上班 (IN)" : "🔴 下班 (OUT)";
                if (replyToken) await replyLineMessage(token, replyToken, `🔄 狀態已翻轉更正為【${newLabel}】（打卡時間：${latest.created_at}）。`);
              }
            }
          }
        }

        return Response.json({ success: true, message: "Webhook processed" }, { headers: corsHeaders });
      } catch (err: any) {
        console.error("Webhook processing error:", err);
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ==================== Legacy / Public Location Endpoints ====================

    // Route: POST /api/locations -> Create/Update Location with Tax ID check & Auto-Geocoding & Allowed IPs
    if (url.pathname === "/api/locations" && request.method === "POST") {
      try {
        const body = (await request.json()) as LocationPayload;
        if (!body.id || !body.name || !body.address) {
          return Response.json(
            { success: false, error: "缺少必要參數 (id 統編[-分店號], name 據點名稱, address 中文地址)" },
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanId = body.id.trim();

        if (!isValidTaiwanTaxId(cleanId)) {
          return Response.json(
            { success: false, error: `代碼 [${cleanId}] 包含之統一編號無效！未通過台灣官方邏輯檢驗。` },
            { status: 400, headers: corsHeaders }
          );
        }

        if (body.allowed_ips && !isValidAllowedIpsFormat(body.allowed_ips)) {
          return Response.json(
            { success: false, error: `allowed_ips 格式無效！請提供有效之 IP 或 CIDR 網段（例如 '211.20.1.5, 114.33.20.0/24'）` },
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanAllowedIps = body.allowed_ips && body.allowed_ips.trim() ? body.allowed_ips.trim() : null;

        let targetLat = body.target_lat;
        let targetLon = body.target_lon;
        let isAutoGeocoded = false;

        if (typeof targetLat !== "number" || typeof targetLon !== "number") {
          const geo = await autoGeocodeAddress(body.address);
          if (!geo) {
            return Response.json(
              { success: false, error: `無法自動解析地址 [${body.address}] 之 GPS 座標，請手動提供 target_lat 與 target_lon。` },
              { status: 400, headers: corsHeaders }
            );
          }
          targetLat = geo.lat;
          targetLon = geo.lon;
          isAutoGeocoded = true;
        }

        const radius = body.allowed_radius || 100;

        await env.DB.prepare(`
          INSERT INTO locations (id, name, address, target_lat, target_lon, allowed_radius, allowed_ips)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            address = excluded.address,
            target_lat = excluded.target_lat,
            target_lon = excluded.target_lon,
            allowed_radius = excluded.allowed_radius,
            allowed_ips = excluded.allowed_ips
        `).bind(cleanId, body.name.trim(), body.address.trim(), targetLat, targetLon, radius, cleanAllowedIps).run();

        const decomposed = decomposeLocation({
          id: cleanId,
          name: body.name.trim(),
          address: body.address.trim(),
          target_lat: targetLat,
          target_lon: targetLon,
          allowed_radius: radius,
          allowed_ips: cleanAllowedIps
        });

        return Response.json({
          success: true,
          message: "據點已驗證並儲存" + (isAutoGeocoded ? " (已自動由地址轉換座標)" : ""),
          location: decomposed
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/locations -> List locations with Decomposed Fields & Optional Filters
    if (url.pathname === "/api/locations" && request.method === "GET") {
      const taxIdFilter = url.searchParams.get("taxId");
      const branchFilter = url.searchParams.get("branch");
      const userIdFilter = url.searchParams.get("userId");
      const cidFilter = url.searchParams.get("cid");

      try {
        let taxId = taxIdFilter ? taxIdFilter.trim() : null;

        if (!taxId && cidFilter) {
          taxId = cidFilter.trim().split("-")[0];
        }

        if (!taxId && userIdFilter) {
          const emp = await env.DB.prepare(
            "SELECT company_id FROM company_employees WHERE line_user_id = ?"
          ).bind(userIdFilter.trim()).first<{ company_id: string }>();
          if (emp && emp.company_id) {
            taxId = emp.company_id.split("-")[0];
          }
        }

        let query = "SELECT id, name, address, target_lat, target_lon, allowed_radius, allowed_ips, created_at FROM locations";
        const params: string[] = [];

        if (taxId) {
          query += " WHERE id LIKE ?";
          params.push(`${taxId}%`);
        }

        query += " ORDER BY id ASC";

        const stmt = env.DB.prepare(query);
        const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

        let decomposedResults = results.map(decomposeLocation);

        if (branchFilter) {
          decomposedResults = decomposedResults.filter(l => l.branchCode === branchFilter.trim());
        }

        return Response.json({
          success: true,
          companyTaxId: taxId,
          count: decomposedResults.length,
          locations: decomposedResults
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/locations/:id -> Single location details with decomposed properties
    const locSingleMatch = url.pathname.match(/^\/api\/locations\/([^/]+)$/);
    if (locSingleMatch && request.method === "GET") {
      const locId = locSingleMatch[1];
      try {
        const result = await env.DB.prepare(
          "SELECT id, name, address, target_lat, target_lon, allowed_radius, allowed_ips, created_at FROM locations WHERE id = ?"
        ).bind(locId).first();

        if (!result) {
          return Response.json({ success: false, error: `找不到據點代碼 [${locId}]` }, { status: 404, headers: corsHeaders });
        }

        return Response.json({ success: true, location: decomposeLocation(result) }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/companies/:taxId/branches -> Decomposed syntax to list all branches under a taxId
    const compBranchesMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/branches$/);
    if (compBranchesMatch && request.method === "GET") {
      const taxId = compBranchesMatch[1].trim();
      try {
        const { results } = await env.DB.prepare(
          "SELECT id, name, address, target_lat, target_lon, allowed_radius, allowed_ips, created_at FROM locations WHERE id LIKE ? ORDER BY id ASC"
        ).bind(`${taxId}%`).all();

        const branches = results.map(decomposeLocation);
        return Response.json({
          success: true,
          taxId,
          companyName: branches.length > 0 ? branches[0].companyName : "",
          branchCount: branches.length,
          branches
        }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/companies/:taxId/records -> Query check-in records across all branches of a Tax ID
    const compAllRecordsMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/records$/);
    if (compAllRecordsMatch && request.method === "GET") {
      const taxId = compAllRecordsMatch[1].trim();
      try {
        const { results } = await env.DB.prepare(
          "SELECT id, company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, created_at FROM checkin_records WHERE company_id LIKE ? ORDER BY id DESC LIMIT 50"
        ).bind(`${taxId}%`).all();

        return Response.json({ success: true, taxId, count: results.length, records: results }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/locations/:id/qrcode -> Serve printable QR Code with address
    const locQrMatch = url.pathname.match(/^\/api\/locations\/([^/]+)\/qrcode$/) || url.pathname.match(/^\/api\/companies\/([^/]+)\/qrcode$/);
    if (locQrMatch && request.method === "GET") {
      const locId = locQrMatch[1];
      const result = await env.DB.prepare(
        "SELECT id, name, address FROM locations WHERE id = ?"
      ).bind(locId).first<{ id: string; name: string; address: string }>();

      if (!result) {
        return new Response("Location not found", { status: 404, headers: corsHeaders });
      }

      const decomposed = decomposeLocation(result);
      const rawBotId = (env.LINE_BOT_BASIC_ID || "@375nvoga").trim();
      const botBasicId = rawBotId.startsWith("@") ? rawBotId : `@${rawBotId}`;
      const liffAppId = (env.LINE_LIFF_APP_ID || "2011328810-vjUUBSYA").trim();
      const targetUrl = `https://liff.line.me/${liffAppId}?cid=${encodeURIComponent(result.id)}&bot_prompt=aggressive`;
      const friendAddUrl = `https://line.me/R/ti/p/${encodeURIComponent(botBasicId)}`;
      const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(targetUrl)}`;

      const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${result.name} - 門市考勤打卡立牌 QR Code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#F0F2F5; margin:0; padding:20px; box-sizing:border-box; }
    .card { background:white; padding:36px; border-radius:24px; box-shadow:0 8px 30px rgba(0,0,0,0.08); text-align:center; max-width:440px; width:100%; box-sizing:border-box; }
    .header { background:#06C755; color:white; padding:12px 24px; border-radius:12px; font-size:20px; font-weight:bold; margin-bottom:20px; display:flex; align-items:center; justify-content:center; gap:8px; }
    .title { font-size:20px; font-weight:bold; color:#1A202C; margin-bottom:4px; }
    .subtitle { font-size:14px; color:#4A5568; margin-bottom:6px; font-weight:600; }
    .address { font-size:13px; color:#718096; margin-bottom:16px; }
    .bot-badge { display:inline-block; background:#EBFBEE; color:#06C755; font-weight:700; font-size:13px; padding:6px 14px; border-radius:20px; margin-bottom:18px; border:1px solid #D3F9D8; }
    .qr { width:260px; height:260px; border-radius:16px; border:2px solid #E2E8F0; padding:12px; background:white; margin:0 auto; display:block; }
    .btn-friend { display:flex; align-items:center; justify-content:center; gap:8px; background:#06C755; color:white; font-weight:bold; font-size:15px; padding:13px 20px; border-radius:14px; text-decoration:none; margin-top:16px; box-shadow:0 4px 12px rgba(6,199,85,0.25); transition:transform 0.1s ease; }
    .btn-friend:active { transform:scale(0.98); }
    .tip { margin-top:16px; font-size:13px; color:#4A5568; background:#F8FAFC; padding:14px; border-radius:12px; line-height:1.7; text-align:left; border:1px solid #E2E8F0; }
    .tip strong { color:#1E293B; }
    .link { font-size:12px; color:#06C755; word-break:break-all; margin-top:14px; font-weight:600; }
    @media print { body { background:white; padding:0; } .card { box-shadow:none; padding:0; max-width:100%; } .btn-friend { border:1px solid #06C755; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">📍 門市考勤打卡立牌</div>
    <div class="title">${decomposed.companyName}</div>
    <div class="subtitle">${decomposed.branchName} (代碼: ${result.id})</div>
    <div class="address">門市地址：${result.address}</div>
    <div class="bot-badge">LINE 官方帳號：${botBasicId}</div>
    <img class="qr" src="${qrApi}" alt="門市打卡 QR Code">
    <a href="${friendAddUrl}" target="_blank" class="btn-friend">
      <i style="font-style:normal;font-size:18px;">💬</i> 加入打卡帳號好友 (${botBasicId})
    </a>
    <div class="tip">
      👉 <strong>掃碼打卡與入職</strong>：開啟手機相機或 LINE 掃描上方 QR 碼，直接進入本門市<strong>入職登記</strong>或<strong>每日出勤打卡</strong>。<br>
      👉 <strong>加入打卡好友</strong>：初次使用請點擊上方【加入打卡帳號好友】按鈕，加入好友以接收<strong>打卡收據推播</strong>與使用<strong>常駐圖文選單</strong>。
    </div>
    <div class="link"><a href="${targetUrl}" target="_blank" style="color: inherit; text-decoration: none;">${targetUrl}</a></div>
  </div>
</body>
</html>`;

      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // Route: GET /api/records -> Global checkin records
    if (url.pathname === "/api/records" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT id, company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at FROM checkin_records ORDER BY id DESC LIMIT 20"
        ).all();
        return Response.json({ success: true, count: results.length, records: results }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: GET /api/devices/audit -> Query recent 20 device audit logs
    if (url.pathname === "/api/devices/audit" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT id, line_user_id, display_name, action, old_device_id, new_device_id, ip_address, warning_level, created_at FROM device_audit_logs ORDER BY id DESC LIMIT 20"
        ).all();
        return Response.json({ success: true, count: results.length, logs: results }, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Route: POST /api/device/switch -> Switch & bind new device
    if (url.pathname === "/api/device/switch" && request.method === "POST") {
      try {
        const body = (await request.json()) as SwitchDevicePayload;
        if (!body.deviceId) {
          return Response.json({ success: false, error: "缺少 deviceId" }, { status: 400, headers: corsHeaders });
        }

        let userId = "";
        let userName = "";

        if (body.idToken && body.idToken !== "demo_token") {
          const verified = await verifyLineIdToken(body.idToken, env.LINE_LOGIN_CHANNEL_ID);
          if (!verified) {
            return Response.json({ success: false, error: "身分驗證失敗" }, { status: 401, headers: corsHeaders });
          }
          userId = verified.userId;
          userName = verified.name;
        } else {
          userId = body.fallbackUserId || "DEMO_USER";
          userName = body.fallbackDisplayName || "測試用戶";
        }

        const currentBinding = await env.DB.prepare(
          "SELECT device_id FROM user_devices WHERE line_user_id = ?"
        ).bind(userId).first<{ device_id: string }>();

        const oldDeviceId = currentBinding ? currentBinding.device_id : null;

        await env.DB.prepare(`
          INSERT INTO user_devices (line_user_id, device_id, device_name, updated_at)
          VALUES (?, ?, ?, datetime('now', '+8 hours'))
          ON CONFLICT(line_user_id) DO UPDATE SET
            device_id = excluded.device_id,
            updated_at = datetime('now', '+8 hours')
        `).bind(userId, body.deviceId, userAgent).run();

        await env.DB.prepare(`
          INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          userId,
          userName,
          oldDeviceId ? "SWITCH_DEVICE" : "INITIAL_BIND",
          oldDeviceId,
          body.deviceId,
          clientIp,
          userAgent,
          oldDeviceId ? "WARNING" : "INFO"
        ).run();

        return Response.json({
          success: true,
          message: "裝置已成功更換綁定，舊裝置已作廢。",
          userId,
          newDeviceId: body.deviceId,
          oldDeviceId: oldDeviceId
        }, { headers: corsHeaders });

      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ==================== Core Check-in Endpoint ====================
    if (url.pathname === "/api/checkin" && request.method === "POST") {
      try {
        const body = (await request.json()) as CheckinPayload;

        if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
          return Response.json(
            { success: false, error: "缺少經緯度數值 (latitude/longitude)" },
            { status: 400, headers: corsHeaders }
          );
        }

        if (!body.deviceId) {
          return Response.json(
            { success: false, error: "缺少裝置識別碼 (deviceId)" },
            { status: 400, headers: corsHeaders }
          );
        }

        // 1. Identify User ID
        let userId = "";
        let userName = "";

        if (body.idToken && body.idToken !== "demo_token") {
          const verified = await verifyLineIdToken(body.idToken, env.LINE_LOGIN_CHANNEL_ID);
          if (!verified) {
            return Response.json(
              { success: false, error: "LINE 身分驗證無效或 Token 已過期" },
              { status: 401, headers: corsHeaders }
            );
          }
          userId = verified.userId;
          userName = verified.name;
        } else {
          userId = body.fallbackUserId || "DEMO_USER";
          userName = body.fallbackDisplayName || "測試用戶";
        }

        // 2. Multi-Tenant Company Registration & Location Scoping
        const incomingId = body.companyId ? body.companyId.trim() : "";
        let companyTaxId = "";

        const existingEmp = await env.DB.prepare(
          "SELECT company_id FROM company_employees WHERE line_user_id = ?"
        ).bind(userId).first<{ company_id: string }>();

        if (incomingId) {
          if (!isValidTaiwanTaxId(incomingId)) {
            return Response.json(
              { success: false, error: `無效的統一編號/據點代碼 [${incomingId}]（未通過官方檢查碼驗證）` },
              { status: 400, headers: corsHeaders }
            );
          }
          companyTaxId = incomingId.split("-")[0];

          await env.DB.prepare(`
            INSERT INTO company_employees (company_id, line_user_id, employee_name)
            VALUES (?, ?, ?)
            ON CONFLICT(line_user_id) DO UPDATE SET
              company_id = excluded.company_id,
              employee_name = excluded.employee_name
          `).bind(incomingId, userId, userName).run();
        } else if (existingEmp && existingEmp.company_id) {
          companyTaxId = existingEmp.company_id.split("-")[0];
        } else {
          return Response.json(
            {
              success: false,
              code: "UNREGISTERED_EMPLOYEE",
              error: "尚未綁定所屬公司！初次使用請先掃描公司專屬的入職打卡 QR Code 完成註冊。"
            },
            { status: 403, headers: corsHeaders }
          );
        }

        // Fetch ONLY locations belonging strictly to this employee's company
        const { results: companyLocations } = await env.DB.prepare(
          "SELECT id, name, address, target_lat, target_lon, allowed_radius, allowed_ips FROM locations WHERE id = ? OR id LIKE ?"
        ).bind(companyTaxId, `${companyTaxId}-%`).all<{ id: string; name: string; address: string; target_lat: number; target_lon: number; allowed_radius: number; allowed_ips: string | null }>();

        if (!companyLocations || companyLocations.length === 0) {
          return Response.json(
            { success: false, error: `所屬公司 [${companyTaxId}] 尚未註冊任何打卡據點，請向人事確認。` },
            { status: 400, headers: corsHeaders }
          );
        }

        let matchedLoc: { id: string; name: string; address: string; target_lat: number; target_lon: number; allowed_radius: number; allowed_ips: string | null } | null = null;
        let distance = 999999;

        if (incomingId && companyLocations.some(l => l.id === incomingId)) {
          matchedLoc = companyLocations.find(l => l.id === incomingId)!;
          distance = calculateHaversineDistance(body.latitude, body.longitude, matchedLoc.target_lat, matchedLoc.target_lon);
        } else {
          let nearestLoc = companyLocations[0];
          let minDistance = 999999;

          for (const loc of companyLocations) {
            const d = calculateHaversineDistance(body.latitude, body.longitude, loc.target_lat, loc.target_lon);
            if (d <= loc.allowed_radius) {
              matchedLoc = loc;
              distance = d;
              break;
            }
            if (d < minDistance) {
              minDistance = d;
              nearestLoc = loc;
            }
          }

          if (!matchedLoc) {
            matchedLoc = nearestLoc;
            distance = minDistance;
          }
        }

        const locationId = matchedLoc.id;
        const targetLat = matchedLoc.target_lat;
        const targetLon = matchedLoc.target_lon;
        const allowedRadius = matchedLoc.allowed_radius || 100;
        const locationName = matchedLoc.name;
        const locationAddress = matchedLoc.address;
        const locationAllowedIps = matchedLoc.allowed_ips ? matchedLoc.allowed_ips.trim() : null;

        // 4. Single Device Verification & Self-Service Device Switching
        const boundDevice = await env.DB.prepare(
          "SELECT device_id FROM user_devices WHERE line_user_id = ?"
        ).bind(userId).first<{ device_id: string }>();

        let deviceSwitched = false;

        if (!boundDevice) {
          await env.DB.prepare(
            "INSERT INTO user_devices (line_user_id, device_id, device_name) VALUES (?, ?, ?)"
          ).bind(userId, body.deviceId, userAgent).run();

          await env.DB.prepare(`
            INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
            VALUES (?, ?, 'INITIAL_BIND', NULL, ?, ?, ?, 'INFO')
          `).bind(userId, userName, body.deviceId, clientIp, userAgent).run();
        } else if (boundDevice.device_id !== body.deviceId) {
          // 換機防弊門禁：若尚未確認換機，先攔截並回傳警訊要求確認
          if (!body.confirmDeviceSwitch) {
            return Response.json(
              {
                success: false,
                requireDeviceSwitchConfirm: true,
                code: "DEVICE_SWITCH_CONFIRM_REQUIRED",
                error: "偵測到更換打卡設備",
                message: "為防範代打卡，使用新手機打卡將解除舊設備綁定並通報人事部。是否確認換機打卡？"
              },
              { status: 409, headers: corsHeaders }
            );
          }

          // 員工已二次確認換機：覆蓋為新裝置，並寫入 WARNING 警示日誌供管理者稽核
          await env.DB.prepare(`
            UPDATE user_devices 
            SET device_id = ?, device_name = ?, updated_at = datetime('now', '+8 hours') 
            WHERE line_user_id = ?
          `).bind(body.deviceId, userAgent, userId).run();

          await env.DB.prepare(`
            INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
            VALUES (?, ?, 'SWITCH_DEVICE', ?, ?, ?, ?, 'WARNING')
          `).bind(userId, userName, boundDevice.device_id, body.deviceId, clientIp, userAgent).run();

          deviceSwitched = true;
        }

        // 5. GPS Distance & IP Whitelist Complementary Verification
        distance = calculateHaversineDistance(
          body.latitude,
          body.longitude,
          targetLat,
          targetLon
        );

        const hasIpWhitelist = !!locationAllowedIps;
        const isIpMatched = hasIpWhitelist && isIpInAllowedList(clientIp, locationAllowedIps);

        let verifyMode: "IP_WHITELIST" | "GPS_FALLBACK" | "GPS_ONLY" = "GPS_ONLY";
        let isVerified = false;
        let verifyErrorMsg = "";

        if (hasIpWhitelist) {
          if (isIpMatched) {
            verifyMode = "IP_WHITELIST";
            isVerified = true;
          } else {
            verifyMode = "GPS_FALLBACK";
            if (distance <= allowedRadius) {
              isVerified = true;
            } else {
              isVerified = false;
              verifyErrorMsg = `打卡失敗：未連線至公司指定 Wi-Fi（偵測到連線 IP: ${clientIp}），且 GPS 定位超出允許範圍（目前距離 ${locationName} 約 ${distance.toFixed(0)} 公尺，允許半徑：${allowedRadius} 公尺）。`;
            }
          }
        } else {
          verifyMode = "GPS_ONLY";
          if (distance <= allowedRadius) {
            isVerified = true;
          } else {
            isVerified = false;
            verifyErrorMsg = `打卡失敗：GPS 定位超出範圍！目前距離 ${locationName} 約 ${distance.toFixed(0)} 公尺（允許半徑：${allowedRadius} 公尺）。本據點未配置公司 Wi-Fi 限制，請移至收訊良好處重試。`;
          }
        }

        // 5.5. Smart Clock-In / Clock-Out Inference State Machine
        const lastSuccess = await env.DB.prepare(`
          SELECT id, punch_type, created_at,
                 (julianday('now', '+8 hours') - julianday(created_at)) * 24 AS delta_hours
          FROM checkin_records
          WHERE line_user_id = ? AND status = 'SUCCESS'
          ORDER BY id DESC LIMIT 1
        `).bind(userId).first<{ id: number; punch_type: string; created_at: string; delta_hours: number | null }>();

        let punchType: "IN" | "OUT" = "IN";
        let workHours: number | null = null;
        let isDuplicate = false;
        let prevCheckinTime: string | null = null;

        if (!lastSuccess) {
          punchType = "IN";
        } else {
          const deltaHours = typeof lastSuccess.delta_hours === "number" ? Math.max(0, lastSuccess.delta_hours) : 999;
          const deltaMinutes = deltaHours * 60;
          const lastType = lastSuccess.punch_type || "IN";

          if (deltaMinutes < 30) {
            isDuplicate = true;
            punchType = lastType as "IN" | "OUT";
            prevCheckinTime = lastSuccess.created_at;
          } else if (deltaHours > 18) {
            punchType = "IN";
          } else {
            if (lastType === "IN") {
              punchType = "OUT";
              workHours = parseFloat(deltaHours.toFixed(1));
            } else {
              punchType = "IN";
            }
          }
        }

        if (!isVerified) {
          try {
            await env.DB.prepare(
              "INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
              .bind(locationId, userId, userName, body.deviceId, body.latitude, body.longitude, distance, "OUT_OF_RANGE", punchType, workHours, verifyMode)
              .run();
          } catch (e) {
            console.error("DB insert error on failure:", e);
          }

          return Response.json(
            {
              success: false,
              error: verifyErrorMsg,
              verifyMode,
              clientIp,
              locationId,
              locationName,
              address: locationAddress,
              distanceMeters: Math.round(distance),
              allowedRadius,
            },
            { status: 400, headers: corsHeaders }
          );
        }

        const recordStatus = isDuplicate ? "DUPLICATE" : "SUCCESS";

        // 6. Record Check-in in D1
        const insertResult = await env.DB.prepare(
          "INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(locationId, userId, userName, body.deviceId, body.latitude, body.longitude, distance, recordStatus, punchType, workHours, verifyMode)
          .run();

        const savedRecord = await env.DB.prepare(
          "SELECT created_at FROM checkin_records WHERE id = ?"
        )
          .bind(insertResult.meta.last_row_id)
          .first<{ created_at: string }>();

        const checkinTime = savedRecord?.created_at || new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

        // 7. Trigger LINE Flex Message push
        if (env.LINE_CHANNEL_ACCESS_TOKEN) {
          await pushCheckinReceipt(
            env.LINE_CHANNEL_ACCESS_TOKEN,
            userId,
            userName,
            checkinTime,
            distance,
            locationName,
            locationAddress,
            punchType,
            workHours,
            isDuplicate,
            insertResult.meta.last_row_id,
            prevCheckinTime || undefined,
            verifyMode
          );
        }

        const typeDesc = punchType === "IN" ? "上班" : "下班";
        const messageText = isDuplicate
          ? `您於 ${prevCheckinTime || checkinTime} 已經打卡成功`
          : `${typeDesc}打卡成功！` + (punchType === "OUT" && workHours !== null ? `（本次工時 ${workHours} 小時）` : "");

        return Response.json(
          {
            success: true,
            message: messageText,
            userId,
            displayName: userName,
            punchType,
            workHours,
            verifyMode,
            clientIp,
            isDuplicate,
            prevCheckinTime,
            locationId,
            locationName,
            address: locationAddress,
            deviceId: body.deviceId.substring(0, 10) + "...",
            deviceSwitched,
            checkinTime,
            distanceMeters: Math.round(distance * 10) / 10,
          },
          { headers: corsHeaders }
        );
      } catch (err: any) {
        console.error("Check-in error:", err);
        return Response.json(
          { success: false, error: `伺服器處理錯誤: ${err.message}` },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
};
