import {
  Env,
  UserPermissionContext,
  TenantAuthResult,
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  MANAGEMENT_PERMISSIONS,
  EMPLOYEE_RICH_MENU_ID,
  MANAGER_RICH_MENU_ID,
  PermissionCode
} from "../types";
import { TenantRepository } from "../repositories/tenant.repo";
import { hashPassword, hashApiKey } from "../utils/crypto";
import { isValidTaiwanTaxId } from "../utils/taiwan";

// Re-export permissions and menu constants for backward compatibility
export {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  MANAGEMENT_PERMISSIONS,
  EMPLOYEE_RICH_MENU_ID,
  MANAGER_RICH_MENU_ID,
  PermissionCode
};

export async function syncUserRichMenu(
  token: string,
  userId: string,
  permissions: string[],
  isManager: boolean = false
): Promise<void> {
  if (!token || !userId) return;
  const isManagerRole = isManager || permissions.some(p => MANAGEMENT_PERMISSIONS.includes(p));
  try {
    if (isManagerRole) {
      await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(userId)}/richmenu/${MANAGER_RICH_MENU_ID}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
    } else {
      await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(userId)}/richmenu`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
    }
  } catch (err) {
    console.error(`Failed to sync rich menu for ${userId}:`, err);
  }
}

export async function getUserPermissionContext(env: Env, lineUserId: string): Promise<UserPermissionContext> {
  const repo = new TenantRepository(env.DB);
  const emp = await repo.findEmployeeWithLocation(lineUserId);

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
    const loc = await repo.findLocationByManager(lineUserId);
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

export class TenantService {
  constructor(private repo: TenantRepository) {}

  // ==================== Web Admin Auth ====================

  async loginAdmin(username?: string, password?: string): Promise<{
    status: number;
    body: any;
  }> {
    if (!username || !password) {
      return { status: 400, body: { success: false, error: "請輸入帳號與密碼" } };
    }

    const cleanUsername = username.trim();
    const user = await this.repo.findUserByUsername(cleanUsername);

    if (!user) {
      return { status: 401, body: { success: false, error: "帳號或密碼錯誤" } };
    }

    if (user.is_active !== 1) {
      return { status: 403, body: { success: false, error: "此帳號已被停用，請聯繫系統管理員" } };
    }

    const computedHash = await hashPassword(password, user.salt);
    if (computedHash !== user.password_hash) {
      return { status: 401, body: { success: false, error: "帳號或密碼錯誤" } };
    }

    const sessionToken = `sess_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
    const sessionHash = await hashApiKey(sessionToken);

    const expiresDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiresAt = expiresDate.toISOString().replace("T", " ").substring(0, 19);

    await this.repo.createSession(sessionHash, user.id, user.tax_id, user.role, expiresAt);
    await this.repo.updateUserLastLogin(user.id);

    return {
      status: 200,
      body: {
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
      }
    };
  }

  async logoutAdmin(token: string): Promise<{ success: boolean; message: string }> {
    if (token.startsWith("sess_")) {
      const sessionHash = await hashApiKey(token);
      await this.repo.deleteSessionByHash(sessionHash);
    }
    return { success: true, message: "已安全登出" };
  }

  // ==================== Tenant M2M API Keys ====================

  async listApiKeys(taxId: string): Promise<any> {
    const results = await this.repo.listApiKeys(taxId);
    return {
      success: true,
      companyTaxId: taxId,
      count: results.length,
      keys: results
    };
  }

  async createApiKey(
    auth: TenantAuthResult,
    body: { tax_id?: string; name?: string; role?: string }
  ): Promise<{ status: number; body: any }> {
    let targetTaxId = "";
    if (auth.authenticated && auth.taxId) {
      targetTaxId = auth.taxId;
    } else if (body.tax_id) {
      const clean = body.tax_id.trim().split("-")[0];
      if (!isValidTaiwanTaxId(clean)) {
        return { status: 400, body: { success: false, error: `統一編號 [${clean}] 格式無效！` } };
      }
      targetTaxId = clean;
    } else {
      return { status: 400, body: { success: false, error: "缺少 tax_id 或請先登入後台" } };
    }

    if (!body.name || !body.name.trim()) {
      return { status: 400, body: { success: false, error: "缺少金鑰備註名稱 (name)" } };
    }

    const role = (body.role || "ADMIN").toUpperCase();
    if (!["ADMIN", "READ_ONLY", "SANDBOX_QA"].includes(role)) {
      return { status: 400, body: { success: false, error: "角色必須為 ADMIN, READ_ONLY 或 SANDBOX_QA" } };
    }

    const randomSecret = crypto.randomUUID().replace(/-/g, "");
    const rawApiKey = `pk_live_${targetTaxId}_${randomSecret}`;
    const keyHash = await hashApiKey(rawApiKey);
    const keyHint = `pk_live_${targetTaxId}...${randomSecret.slice(-4)}`;

    await this.repo.createApiKey(targetTaxId, keyHash, keyHint, body.name.trim(), role);

    return {
      status: 200,
      body: {
        success: true,
        message: "租戶金鑰建立成功！請妥善保存，金鑰僅於建立時顯示一次。",
        apiKey: rawApiKey,
        keyHint,
        taxId: targetTaxId,
        name: body.name.trim(),
        role
      }
    };
  }

  async revokeApiKey(auth: TenantAuthResult, keyId: number): Promise<{ status: number; body: any }> {
    if (auth.role !== "ADMIN") {
      return { status: 403, body: { success: false, error: "僅企業管理員 (ADMIN) 有權限撤銷金鑰" } };
    }

    const revoked = await this.repo.revokeApiKey(keyId, auth.taxId!);
    if (!revoked) {
      return { status: 404, body: { success: false, error: "查無此金鑰或非本公司所屬金鑰" } };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: "API 金鑰已成功撤銷停用"
      }
    };
  }

  // ==================== Employee PBAC & Profiles ====================

  async listEmployees(taxId: string): Promise<any> {
    const results = await this.repo.listEmployees(taxId);
    const employees = results.map(r => {
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

    return { success: true, employees };
  }

  async updateEmployeePermissions(
    lineToken: string | undefined,
    auth: TenantAuthResult,
    targetEmpIdOrUserId: string,
    body: {
      permissions?: string[];
      employeeName?: string;
      companyId?: string;
      scheduleMode?: string;
      defaultShiftStart?: string;
      defaultShiftEnd?: string;
      defaultBreakMinutes?: number;
    }
  ): Promise<{ status: number; body: any }> {
    if (auth.role !== "ADMIN") {
      return { status: 403, body: { success: false, error: "僅 ADMIN 角色具備權限變更權限" } };
    }

    if (!targetEmpIdOrUserId) {
      return { status: 400, body: { success: false, error: "缺少目標員工識別碼" } };
    }

    const permissions = Array.isArray(body.permissions) ? body.permissions : ["punch", "apply"];
    const effectiveCompanyId = body.companyId || auth.taxId!;
    const permStr = JSON.stringify(permissions);
    const scheduleMode = body.scheduleMode || "FIXED";
    const defaultShiftStart = body.defaultShiftStart || "09:00";
    const defaultShiftEnd = body.defaultShiftEnd || "18:00";
    const defaultBreakMinutes = typeof body.defaultBreakMinutes === "number" ? body.defaultBreakMinutes : 60;

    await this.repo.upsertEmployeePermissions(
      effectiveCompanyId,
      targetEmpIdOrUserId.trim(),
      body.employeeName || null,
      permStr,
      scheduleMode,
      defaultShiftStart,
      defaultShiftEnd,
      defaultBreakMinutes
    );

    if (lineToken) {
      const isManager = await this.repo.isStoreManager(targetEmpIdOrUserId.trim());
      await syncUserRichMenu(lineToken, targetEmpIdOrUserId.trim(), permissions, isManager);
    }

    return {
      status: 200,
      body: {
        success: true,
        message: `已成功更新員工 [${targetEmpIdOrUserId}] 權限設定並同步 LINE 圖文選單`,
        permissions
      }
    };
  }

  async batchSyncRichMenu(lineToken: string | undefined, taxId: string): Promise<any> {
    const results = await this.repo.listEmployeesForSync(taxId);
    let syncedCount = 0;

    for (const row of results) {
      let perms: string[] = ["punch", "apply"];
      if (row.permissions) {
        try {
          const p = JSON.parse(row.permissions);
          if (Array.isArray(p)) perms = p;
        } catch (e) {}
      }
      const isMgr = row.manager_line_id === row.line_user_id;
      await syncUserRichMenu(lineToken || "", row.line_user_id, perms, isMgr);
      syncedCount++;
    }

    return {
      success: true,
      message: `已完成 ${syncedCount} 位同仁之 LINE 圖文選單動態同步`,
      syncedCount,
      employeeMenuId: EMPLOYEE_RICH_MENU_ID,
      managerMenuId: MANAGER_RICH_MENU_ID
    };
  }

  async getEmployeeProfile(
    env: Env,
    userId: string,
    cid?: string | null
  ): Promise<{ status: number; body: any }> {
    if (!userId) {
      return { status: 400, body: { success: false, error: "缺少 userId 參數" } };
    }

    const permCtx = await getUserPermissionContext(env, userId);
    let targetLocation: any = null;
    if (cid) {
      const loc = await this.repo.findLocationById(cid);
      if (loc) {
        targetLocation = loc;
      }
    }

    return {
      status: 200,
      body: {
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
      }
    };
  }

  async joinEmployee(body: {
    companyId?: string;
    lineUserId?: string;
    displayName?: string;
  }): Promise<{ status: number; body: any }> {
    const companyId = body.companyId?.trim();
    const lineUserId = body.lineUserId?.trim();
    const displayName = body.displayName?.trim() || "新進同仁";

    if (!companyId || !lineUserId) {
      return { status: 400, body: { success: false, error: "缺少 companyId 或 lineUserId 參數" } };
    }

    const location = await this.repo.findLocationById(companyId);
    if (!location) {
      return { status: 404, body: { success: false, error: `找不到此門市代碼 [${companyId}]` } };
    }

    await this.repo.joinEmployee(companyId, lineUserId, displayName);
    await this.repo.logAudit(lineUserId, displayName, "INITIAL_JOIN", companyId);

    return {
      status: 200,
      body: {
        success: true,
        message: `成功加入【${location.name}】考勤系統！`,
        companyId: location.id,
        companyName: location.name,
        employeeName: displayName
      }
    };
  }
}
