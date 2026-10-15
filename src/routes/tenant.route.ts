import { Env } from "../types";
import { TenantRepository } from "../repositories/tenant.repo";
import { TenantService } from "../services/tenant.service";
import { authenticateTenantRequest } from "../services/auth.service";

export async function handleTenantRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const repo = new TenantRepository(env.DB);
  const service = new TenantService(repo);

  // 1. POST /api/v1/admin/login -> Authenticate with Username & Password
  if (url.pathname === "/api/v1/admin/login" && request.method === "POST") {
    try {
      const body = (await request.json()) as { username?: string; password?: string };
      const res = await service.loginAdmin(body.username, body.password);
      return Response.json(res.body, { status: res.status, headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 2. POST /api/v1/admin/logout -> Logout & invalidate session
  if (url.pathname === "/api/v1/admin/logout" && request.method === "POST") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: true, message: "已登出" }, { headers: corsHeaders });
    }

    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();
    const res = await service.logoutAdmin(token);
    return Response.json(res, { headers: corsHeaders });
  }

  // 3. GET /api/v1/admin/me -> Get current authenticated session info
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

  // 4. GET /api/v1/tenant/keys -> List all API Keys for authenticated tenant
  if (url.pathname === "/api/v1/tenant/keys" && request.method === "GET") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    try {
      const res = await service.listApiKeys(auth.taxId!);
      return Response.json(res, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 5. POST /api/v1/tenant/keys -> Provision new Tenant API Key
  if (url.pathname === "/api/v1/tenant/keys" && request.method === "POST") {
    try {
      const auth = await authenticateTenantRequest(request, env.DB);
      const body = (await request.json()) as { tax_id?: string; name?: string; role?: string };
      const res = await service.createApiKey(auth, body);
      return Response.json(res.body, { status: res.status, headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 6. POST|DELETE /api/v1/tenant/keys/:id/revoke or /api/v1/tenant/keys/:id -> Revoke API Key
  const revokeKeyMatch = url.pathname.match(/^\/api\/v1\/tenant\/keys\/(\d+)(?:\/revoke)?$/);
  if (revokeKeyMatch && (request.method === "POST" || request.method === "DELETE")) {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    const keyId = parseInt(revokeKeyMatch[1], 10);
    try {
      const res = await service.revokeApiKey(auth, keyId);
      return Response.json(res.body, { status: res.status, headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 7. GET /api/v1/tenant/employees -> List all employees with PBAC permissions
  if (url.pathname === "/api/v1/tenant/employees" && request.method === "GET") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated || !auth.taxId) {
      return Response.json({ success: false, error: auth.error || "未授權存取" }, { status: auth.status || 401, headers: corsHeaders });
    }

    try {
      const res = await service.listEmployees(auth.taxId);
      return Response.json(res, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 8. POST /api/v1/tenant/employees/:id/permissions -> Update employee permissions
  if (url.pathname.startsWith("/api/v1/tenant/employees/") && url.pathname.endsWith("/permissions") && request.method === "POST") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated || !auth.taxId) {
      return Response.json({ success: false, error: auth.error || "未授權存取" }, { status: auth.status || 401, headers: corsHeaders });
    }

    const parts = url.pathname.split("/");
    const targetEmpIdOrUserId = decodeURIComponent(parts[5] || "");
    try {
      const body = (await request.json()) as { permissions?: string[]; employeeName?: string; companyId?: string };
      const res = await service.updateEmployeePermissions(
        env.LINE_CHANNEL_ACCESS_TOKEN,
        auth,
        targetEmpIdOrUserId,
        body
      );
      return Response.json(res.body, { status: res.status, headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 9. POST /api/v1/tenant/richmenu/sync -> Batch sync LINE rich menus for all employees of tenant
  if (url.pathname === "/api/v1/tenant/richmenu/sync" && request.method === "POST") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated || !auth.taxId) {
      return Response.json({ success: false, error: auth.error || "未授權存取" }, { status: auth.status || 401, headers: corsHeaders });
    }

    try {
      const res = await service.batchSyncRichMenu(env.LINE_CHANNEL_ACCESS_TOKEN, auth.taxId);
      return Response.json(res, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 10. GET /api/v1/employee/profile -> Get current employee profile & permissions
  if (url.pathname === "/api/v1/employee/profile" && request.method === "GET") {
    const userId = url.searchParams.get("userId") || "";
    const cid = url.searchParams.get("cid") || "";
    try {
      const res = await service.getEmployeeProfile(env, userId, cid);
      return Response.json(res.body, { status: res.status, headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 11. POST /api/v1/employee/join -> Explicit Onboarding for Newcomer Employee
  if (url.pathname === "/api/v1/employee/join" && request.method === "POST") {
    try {
      const body = (await request.json()) as {
        companyId?: string;
        lineUserId?: string;
        displayName?: string;
      };
      const res = await service.joinEmployee(body, env.LINE_CHANNEL_ACCESS_TOKEN);
      return Response.json(res.body, { status: res.status, headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  return null;
}
