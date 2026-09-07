import { renderLiffHtml } from "./liff-html";
import { renderLocalAdminHtml } from "./local-admin-html";
import { Env } from "./types";
import { handleApprovalRoutes } from "./routes/approval.route";
import { handleTenantRoutes } from "./routes/tenant.route";
import { handleScheduleRoutes } from "./routes/schedule.route";
import { handleCheckinRoutes } from "./routes/checkin.route";
import { handleWebhookRoutes } from "./routes/webhook.route";
import { handleAttachmentRoutes } from "./routes/attachment.route";
import { handleAnnouncementRoutes } from "./routes/announcement.route";
import { handlePayrollRoutes } from "./routes/payroll.route";
import { CronService } from "./services/cron.service";

// Re-export domain modules for backward compatibility
export * from "./types";
export * from "./utils/crypto";
export * from "./utils/geo";
export * from "./utils/time";
export * from "./utils/network";
export * from "./utils/taiwan";
export * from "./services/auth.service";
export * from "./services/approval.service";
export * from "./services/tenant.service";
export * from "./services/schedule.service";
export * from "./services/checkin.service";
export * from "./services/webhook.service";
export * from "./services/cron.service";
export * from "./services/attachment.service";
export * from "./services/announcement.service";
export * from "./services/payroll.service";
export * from "./routes/approval.route";
export * from "./routes/tenant.route";
export * from "./routes/schedule.route";
export * from "./routes/checkin.route";
export * from "./routes/webhook.route";
export * from "./routes/attachment.route";
export * from "./routes/announcement.route";
export * from "./routes/payroll.route";
export * from "./repositories/approval.repo";
export * from "./repositories/tenant.repo";
export * from "./repositories/schedule.repo";
export * from "./repositories/checkin.repo";
export * from "./repositories/cron.repo";
export * from "./repositories/announcement.repo";
export * from "./repositories/payroll.repo";
export * from "./views/flex/approval-flex";
export * from "./views/flex/checkin-flex";
export * from "./views/flex/reminder-flex";
export * from "./views/flex/announcement-flex";
export * from "./views/flex/payslip-flex";

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

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // 1. Dispatch domain routes
    const resp =
      (await handleApprovalRoutes(request, env, url, corsHeaders)) ||
      (await handleTenantRoutes(request, env, url, corsHeaders)) ||
      (await handlePayrollRoutes(request, env, url, corsHeaders, clientIp, userAgent)) ||
      (await handleAnnouncementRoutes(request, env, url, corsHeaders)) ||
      (await handleScheduleRoutes(request, env, url, corsHeaders)) ||
      (await handleCheckinRoutes(request, env, url, corsHeaders, clientIp, userAgent)) ||
      (await handleWebhookRoutes(request, env, url, corsHeaders, clientIp, userAgent)) ||
      (await handleAttachmentRoutes(request, env, url, corsHeaders));
    if (resp) return resp;

    // 2. Serve LIFF Frontend HTML
    if (url.pathname === "/" || url.pathname === "/checkin" || url.pathname === "/liff") {
      const html = renderLiffHtml(env.LIFF_ID || "YOUR_LIFF_ID", env.LOCATION_NAME || "豬毛有限公司 - 台中美德總部");
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // 3. Serve Client On-Premises Local Admin Portal
    if (url.pathname === "/admin" || url.pathname === "/local-admin") {
      return new Response(renderLocalAdminHtml(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // 4. Cron Trigger Test & Simulation Endpoint
    if (url.pathname === "/api/v1/tenant/cron/trigger" && request.method === "POST") {
      const result = await new CronService(env).handleCronScheduled(
        url.searchParams.get("mockDate") || undefined,
        url.searchParams.get("mockTime") || undefined
      );
      return Response.json(result, { headers: corsHeaders });
    }

    // 5. Worker Health Check
    if (url.pathname === "/api/health") {
      return Response.json(
        { status: "ok", service: "line-gps-checkin-v3", timestamp: new Date().toISOString() },
        { headers: corsHeaders }
      );
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },

  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    const cronService = new CronService(env);
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(cronService.handleCronScheduled());
    } else {
      await cronService.handleCronScheduled();
    }
  },
};
