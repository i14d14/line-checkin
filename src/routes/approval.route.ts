import { Env } from "../types";
import { ApprovalRepository } from "../repositories/approval.repo";
import { ApprovalService } from "../services/approval.service";
import { authenticateTenantRequest, verifyLineIdToken } from "../services/auth.service";

export async function handleApprovalRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const approvalRepo = new ApprovalRepository(env.DB);
  const approvalService = new ApprovalService(env);

  // 1. POST /api/v1/approval/request -> Submit Leave, Correction, or Overtime approval request
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
          userId = profile.userId;
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

      const result = await approvalService.submitRequest({
        userId,
        displayName,
        type,
        targetDate,
        details,
        fallbackCompanyId
      });

      if (!result.success) {
        return Response.json({ success: false, error: result.error }, { status: result.statusCode || 400, headers: corsHeaders });
      }

      return Response.json({
        success: true,
        id: result.approvalId,
        approverLineId: result.approverLineId,
        status: result.status,
        message: result.message
      }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 2. GET /api/v1/approval/my -> Query employee's own approval history
  if (url.pathname === "/api/v1/approval/my" && request.method === "GET") {
    try {
      const userId = url.searchParams.get("userId") || "";
      if (!userId) {
        return Response.json({ success: false, error: "缺少 userId 參數" }, { status: 400, headers: corsHeaders });
      }

      const approvals = await approvalRepo.listApprovalsByApplicant(userId);
      return Response.json({
        success: true,
        approvals
      }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 3. GET /api/v1/tenant/approvals -> Query all approval records scoped to tenant
  if (url.pathname === "/api/v1/tenant/approvals" && request.method === "GET") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated || !auth.taxId) {
      return Response.json({ success: false, error: auth.error || "未授權" }, { status: auth.status || 401, headers: corsHeaders });
    }

    try {
      const status = url.searchParams.get("status");
      const type = url.searchParams.get("type");
      const month = url.searchParams.get("month");

      const approvals = await approvalRepo.listTenantApprovals(auth.taxId, { status, type, month });
      return Response.json({
        success: true,
        companyTaxId: auth.taxId,
        count: approvals.length,
        approvals
      }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 4. POST /api/v1/tenant/employees/:lineUserId/approver -> Assign manager LINE ID to employee
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
      await approvalRepo.assignEmployeeApprover(
        effectiveCompanyId,
        targetLineUserId,
        employeeName || null,
        approverLineId
      );

      return Response.json({
        success: true,
        message: `已成功為員工 [${targetLineUserId}] 綁定直屬審核主管 [${approverLineId}]`
      }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  return null;
}
