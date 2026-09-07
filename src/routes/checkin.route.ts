import { Env, CheckinPayload, SwitchDevicePayload, LocationPayload } from "../types";
import { CheckinRepository } from "../repositories/checkin.repo";
import { CheckinService } from "../services/checkin.service";
import { authenticateTenantRequest } from "../services/auth.service";
import { getUserPermissionContext, hasPermission } from "../services/tenant.service";
import { decomposeLocation } from "../utils/taiwan";

export async function handleCheckinRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: Record<string, string>,
  clientIp: string,
  userAgent: string
): Promise<Response | null> {
  const repo = new CheckinRepository(env.DB);
  const service = new CheckinService(repo);

  // 1. POST /api/checkin -> Core Check-in Endpoint
  if (url.pathname === "/api/checkin" && request.method === "POST") {
    try {
      const body = (await request.json()) as CheckinPayload;
      const res = await service.processCheckin(body, env, clientIp, userAgent);
      return Response.json(res.body, { status: res.status, headers: corsHeaders });
    } catch (err: any) {
      console.error("Check-in error:", err);
      return Response.json({ success: false, error: `伺服器處理錯誤: ${err.message}` }, { status: 500, headers: corsHeaders });
    }
  }

  // 2. POST /api/device/switch -> Switch & bind new device
  if (url.pathname === "/api/device/switch" && request.method === "POST") {
    try {
      const body = (await request.json()) as SwitchDevicePayload;
      const res = await service.switchDevice(body, env, clientIp, userAgent);
      return Response.json(res.body, { status: res.status, headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 3. GET /api/v1/tenant/locations -> Get all branches strictly scoped to authenticated tenant
  if (url.pathname === "/api/v1/tenant/locations" && request.method === "GET") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    try {
      const results = await repo.getLocationsByTaxId(auth.taxId!);
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

  // 4. POST /api/v1/tenant/locations -> Add/Edit location strictly scoped to authenticated tenant
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
        return Response.json({ success: false, error: "缺少必要欄位 (id, name, address)" }, { status: 400, headers: corsHeaders });
      }

      const cleanId = body.id.trim();
      const bodyTaxId = cleanId.split("-")[0];
      if (bodyTaxId !== auth.taxId) {
        return Response.json({ success: false, error: `權限越界：金鑰所屬統編為 [${auth.taxId}]，無法操作 [${bodyTaxId}] 之門市據點` }, { status: 403, headers: corsHeaders });
      }

      const result = await service.saveLocation(body);
      return Response.json({
        success: true,
        message: "門市據點已儲存" + (result.message.includes("自動轉換") ? " (已自動轉換地址為 GPS 座標)" : ""),
        location: result.location
      }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 4b. DELETE /api/v1/tenant/locations/:id -> Delete location strictly scoped to authenticated tenant
  const tenantLocDeleteMatch = url.pathname.match(/^\/api\/v1\/tenant\/locations\/([^/]+)$/);
  if (tenantLocDeleteMatch && request.method === "DELETE") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    if (auth.role !== "ADMIN") {
      return Response.json({ success: false, error: "權限不足：僅 ADMIN 角色金鑰可刪除門市據點" }, { status: 403, headers: corsHeaders });
    }

    const locId = decodeURIComponent(tenantLocDeleteMatch[1]).trim();
    try {
      const result = await service.removeLocation(auth.taxId!, locId);
      return Response.json(result, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
    }
  }

  // 5. GET /api/v1/tenant/locations/:id/qrcode -> Generate stand QR Code scoped to tenant
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

    const result = await repo.getLocationById(locId);
    if (!result) {
      return new Response("Location not found", { status: 404, headers: corsHeaders });
    }

    const html = renderQrPage(result, env);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // 6. GET /api/v1/tenant/records -> Query attendance records strictly scoped to tenant, with CSV export option
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
      const res = await service.getTenantRecords(
        auth.taxId!,
        auth.role || "ADMIN",
        { startDate, endDate, status, punchType, limit },
        format
      );

      if (res.isCsv) {
        return new Response(res.data, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="attendance_${auth.taxId}_${new Date().toISOString().slice(0, 10)}.csv"`,
          }
        });
      }

      return Response.json(res.data, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 7. GET /api/v1/tenant/audit -> Query audit logs scoped to tenant
  if (url.pathname === "/api/v1/tenant/audit" && request.method === "GET") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    try {
      const results = await repo.getTenantAuditLogs(auth.taxId!, 50);
      return Response.json({
        success: true,
        companyTaxId: auth.taxId,
        count: results.length,
        logs: results
      }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 8. POST /api/v1/tenant/locations/wifi -> Register current IP to location allowed_ips
  if (url.pathname === "/api/v1/tenant/locations/wifi" && request.method === "POST") {
    try {
      const body = (await request.json()) as {
        companyId?: string;
        lineUserId?: string;
        ips?: string[];
        ipv4?: string;
        ipv6?: string;
      };
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

      const candidateIps: string[] = [];
      if (Array.isArray(body.ips)) {
        candidateIps.push(...body.ips);
      }
      if (body.ipv4 && typeof body.ipv4 === "string") {
        candidateIps.push(body.ipv4);
      }
      if (body.ipv6 && typeof body.ipv6 === "string") {
        candidateIps.push(body.ipv6);
      }

      const res = await service.registerLocationWifi(companyId, clientIp, candidateIps);
      return Response.json(res, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 8b. GET /api/v1/tenant/locations/wifi -> Query current location allowed_ips & detected client IP
  if (url.pathname === "/api/v1/tenant/locations/wifi" && request.method === "GET") {
    try {
      const lineUserId = url.searchParams.get("lineUserId");
      let companyId = url.searchParams.get("companyId");

      if (lineUserId) {
        const permCtx = await getUserPermissionContext(env, lineUserId);
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

      const loc = await repo.getLocationById(companyId);
      if (!loc) {
        return Response.json({ success: false, error: "門市不存在" }, { status: 404, headers: corsHeaders });
      }

      return Response.json({
        success: true,
        locationId: loc.id,
        locationName: loc.name,
        allowedIps: loc.allowed_ips || "未設定 (純 GPS 打卡)",
        clientIp
      }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // ==================== Legacy & Public Compatibility Routes ====================

  // 9. POST /api/locations -> Create/Update Location
  if (url.pathname === "/api/locations" && request.method === "POST") {
    try {
      const body = (await request.json()) as LocationPayload;
      const res = await service.saveLocation(body);
      return Response.json(res, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
    }
  }

  // 10. GET /api/locations -> List locations
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
        const emp = await repo.getEmployeeCompany(userIdFilter.trim());
        if (emp && emp.company_id) {
          taxId = emp.company_id.split("-")[0];
        }
      }

      const results = await repo.getAllLocations(taxId);
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

  // 11. GET /api/locations/:id -> Single location details
  const locSingleMatch = url.pathname.match(/^\/api\/locations\/([^/]+)$/);
  if (locSingleMatch && request.method === "GET") {
    const locId = locSingleMatch[1];
    try {
      const result = await repo.getLocationById(locId);
      if (!result) {
        return Response.json({ success: false, error: `找不到據點代碼 [${locId}]` }, { status: 404, headers: corsHeaders });
      }
      return Response.json({ success: true, location: decomposeLocation(result) }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 12. GET /api/companies/:taxId/branches
  const compBranchesMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/branches$/);
  if (compBranchesMatch && request.method === "GET") {
    const taxId = compBranchesMatch[1].trim();
    try {
      const results = await repo.getAllLocations(taxId);
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

  // 13. GET /api/companies/:taxId/records
  const compAllRecordsMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/records$/);
  if (compAllRecordsMatch && request.method === "GET") {
    const taxId = compAllRecordsMatch[1].trim();
    try {
      const results = await repo.getCompanyRecords(taxId, 50);
      return Response.json({ success: true, taxId, count: results.length, records: results }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 14. GET /api/locations/:id/qrcode -> Serve printable QR Code with address
  const locQrMatch = url.pathname.match(/^\/api\/locations\/([^/]+)\/qrcode$/) || url.pathname.match(/^\/api\/companies\/([^/]+)\/qrcode$/);
  if (locQrMatch && request.method === "GET") {
    const locId = locQrMatch[1];
    const result = await repo.getLocationById(locId);
    if (!result) {
      return new Response("Location not found", { status: 404, headers: corsHeaders });
    }

    const html = renderQrPage(result, env);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // 15. GET /api/records -> Global checkin records
  if (url.pathname === "/api/records" && request.method === "GET") {
    try {
      const results = await repo.getLegacyRecords(20);
      return Response.json({ success: true, count: results.length, records: results }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 16. GET /api/devices/audit -> Query recent 20 device audit logs
  if (url.pathname === "/api/devices/audit" && request.method === "GET") {
    try {
      const results = await repo.getLegacyAuditLogs(20);
      return Response.json({ success: true, count: results.length, logs: results }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  return null;
}

function renderQrPage(result: any, env: Env): string {
  const decomposed = decomposeLocation(result);
  const rawBotId = (env.LINE_BOT_BASIC_ID || "@375nvoga").trim();
  const botBasicId = rawBotId.startsWith("@") ? rawBotId : `@${rawBotId}`;
  const liffAppId = (env.LINE_LIFF_APP_ID || "2011328810-vjUUBSYA").trim();
  const targetUrl = `https://liff.line.me/${liffAppId}?cid=${encodeURIComponent(result.id)}&bot_prompt=aggressive`;
  const friendAddUrl = `https://line.me/R/ti/p/${encodeURIComponent(botBasicId)}`;
  const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(targetUrl)}`;

  return `<!DOCTYPE html>
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
}
