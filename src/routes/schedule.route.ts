import { Env } from "../types";
import { ScheduleRepository } from "../repositories/schedule.repo";
import { ScheduleService } from "../services/schedule.service";
import { authenticateTenantRequest } from "../services/auth.service";

export async function handleScheduleRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const repo = new ScheduleRepository(env.DB);
  const service = new ScheduleService(repo);

  // 1. GET /api/v1/attendance/monthly -> Monthly attendance audit for LIFF & Admin
  if (url.pathname === "/api/v1/attendance/monthly" && request.method === "GET") {
    try {
      const targetUserId = url.searchParams.get("userId") || "DEMO_USER";
      const targetMonth = url.searchParams.get("month") || new Date().toISOString().slice(0, 7); // 'YYYY-MM'

      const result = await service.getMonthlyAttendance(targetUserId, targetMonth);
      return Response.json(result, { headers: corsHeaders });
    } catch (err: any) {
      const isValidationErr = err.message && err.message.includes("無效的月份格式");
      return Response.json(
        { success: false, error: err.message },
        { status: isValidationErr ? 400 : 500, headers: corsHeaders }
      );
    }
  }

  // 2. GET /api/v1/tenant/schedules/template -> Download Schedule CSV Template
  if (url.pathname === "/api/v1/tenant/schedules/template" && request.method === "GET") {
    const csv = service.generateScheduleCsvTemplate();
    return new Response(csv, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="schedules_template.csv"`,
      },
    });
  }

  // 3. GET /api/v1/tenant/schedules -> Query shift schedules scoped to tenant
  if (url.pathname === "/api/v1/tenant/schedules" && request.method === "GET") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    try {
      const month = url.searchParams.get("month");
      const userId = url.searchParams.get("userId");
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");

      const results = await service.getTenantSchedules(auth.taxId!, { month, userId, startDate, endDate });
      return Response.json({
        success: true,
        companyTaxId: auth.taxId,
        count: results.length,
        schedules: results,
      }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 4. POST /api/v1/tenant/schedules/batch -> Batch upsert shift schedules scoped to tenant
  if (url.pathname === "/api/v1/tenant/schedules/batch" && request.method === "POST") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    if (auth.role !== "ADMIN") {
      return Response.json({ success: false, error: "權限不足：僅 ADMIN 角色可匯入或修改班表" }, { status: 403, headers: corsHeaders });
    }

    try {
      const body = ((await request.json().catch(() => ({}))) || {}) as { schedules: Array<any> };
      if (!body.schedules || !Array.isArray(body.schedules) || body.schedules.length === 0) {
        return Response.json({ success: false, error: "缺少 schedules 陣列資料" }, { status: 400, headers: corsHeaders });
      }

      const result = await service.batchUpsertSchedules(auth.taxId!, body.schedules);
      return Response.json({
        success: true,
        message: result.message,
        insertedCount: result.insertedCount,
        importedCount: result.insertedCount,
      }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 5. POST /api/v1/tenant/schedules/generate -> Batch generate default schedules for FIXED employees
  if (url.pathname === "/api/v1/tenant/schedules/generate" && request.method === "POST") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    if (auth.role !== "ADMIN") {
      return Response.json({ success: false, error: "權限不足：僅 ADMIN 角色可生成班表" }, { status: 403, headers: corsHeaders });
    }

    try {
      const body = ((await request.json().catch(() => ({}))) || {}) as { month?: string };
      const targetMonth = body.month || url.searchParams.get("month") || new Date().toISOString().slice(0, 7);

      const result = await service.generateFixedMonthSchedules(auth.taxId!, targetMonth);
      return Response.json({
        success: true,
        message: result.message,
        createdCount: result.createdCount,
        employeeCount: result.employeeCount,
        month: targetMonth,
      }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  return null;
}
