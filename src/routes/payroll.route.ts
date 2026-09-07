import { Env } from "../types";
import { PayrollRepository } from "../repositories/payroll.repo";
import { PayrollService } from "../services/payroll.service";
import { authenticateTenantRequest } from "../services/auth.service";

/**
 * Payroll Routes Controller
 * Handles payslip CSV template export and batch dispatch endpoints.
 */
export async function handlePayrollRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: Record<string, string>,
  clientIp?: string,
  userAgent?: string
): Promise<Response | null> {
  const repo = new PayrollRepository(env.DB);
  const service = new PayrollService(repo);

  // 1. GET /api/v1/tenant/payslips/template -> Download standard UTF-8 BOM CSV template
  if (url.pathname === "/api/v1/tenant/payslips/template" && request.method === "GET") {
    const csv = service.generatePayslipCsvTemplate();
    return new Response(csv, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payslips_template.csv"`
      }
    });
  }

  // 2. POST /api/v1/tenant/payslips/dispatch -> Batch validate and push payslips to LINE
  if (url.pathname === "/api/v1/tenant/payslips/dispatch" && request.method === "POST") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated || !auth.taxId) {
      return Response.json(
        { success: false, error: auth.error || "未授權存取" },
        { status: auth.status || 401, headers: corsHeaders }
      );
    }

    if (auth.role === "READ_ONLY" || auth.role === "VIEWER") {
      return Response.json(
        { success: false, error: "權限不足：僅管理員具備發送薪資條之權限" },
        { status: 403, headers: corsHeaders }
      );
    }

    try {
      const body = await request.json() as any;
      const rawPayslips = Array.isArray(body) ? body : (body.payslips || []);

      const result = await service.dispatchPayslips(
        env.LINE_CHANNEL_ACCESS_TOKEN || "",
        auth.taxId,
        rawPayslips,
        clientIp,
        userAgent
      );

      const status = result.success ? 200 : (rawPayslips.length === 0 || (result.count === 0 && result.failures.length > 0) ? 400 : 200);

      return Response.json(result, { status, headers: corsHeaders });
    } catch (err: any) {
      return Response.json(
        { success: false, error: `處理薪資發送失敗：${err.message}` },
        { status: 500, headers: corsHeaders }
      );
    }
  }

  return null;
}
