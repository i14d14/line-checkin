import { Env } from "../types";
import { AnnouncementService } from "../services/announcement.service";
import { authenticateTenantRequest } from "../services/auth.service";

export async function handleAnnouncementRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const pathname = url.pathname;

  // 1. GET /api/v1/tenant/announcements -> List announcements with stats
  if (pathname === "/api/v1/tenant/announcements" && request.method === "GET") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    try {
      const service = new AnnouncementService(env);
      const announcements = await service.listAnnouncements(auth.taxId!);
      return Response.json({ success: true, announcements }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 2. POST /api/v1/tenant/announcements -> Publish announcement & multicast
  if (pathname === "/api/v1/tenant/announcements" && request.method === "POST") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    try {
      const body = (await request.json()) as { title?: string; content?: string; authorName?: string };
      if (!body.title || !body.content) {
        return Response.json({ success: false, error: "公告標題與內容皆為必填項目" }, { status: 400, headers: corsHeaders });
      }

      const service = new AnnouncementService(env);
      const result = await service.publishAnnouncement(auth.taxId!, {
        title: body.title,
        content: body.content,
        authorName: body.authorName || auth.name || "公司人事行政部"
      });

      return Response.json(result, { status: 201, headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 3. POST /api/v1/tenant/announcements/:id/remind -> Multicast reminder to unread employees
  const remindMatch = pathname.match(/^\/api\/v1\/tenant\/announcements\/([^/]+)\/remind$/);
  if (remindMatch && request.method === "POST") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    const announcementId = remindMatch[1];
    try {
      const service = new AnnouncementService(env);
      const result = await service.remindUnreadEmployees(announcementId, auth.taxId!);
      return Response.json(result, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // 4. GET /api/v1/tenant/announcements/:id -> Get announcement details & reads breakdown
  const detailMatch = pathname.match(/^\/api\/v1\/tenant\/announcements\/([^/]+)$/);
  if (detailMatch && request.method === "GET") {
    const auth = await authenticateTenantRequest(request, env.DB);
    if (!auth.authenticated) {
      return Response.json({ success: false, error: auth.error }, { status: auth.status || 401, headers: corsHeaders });
    }

    const announcementId = detailMatch[1];
    try {
      const service = new AnnouncementService(env);
      const details = await service.getAnnouncementDetails(announcementId, auth.taxId!);
      if (!details) {
        return Response.json({ success: false, error: "查無此公告或無存取權限" }, { status: 404, headers: corsHeaders });
      }

      return Response.json({ success: true, ...details }, { headers: corsHeaders });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  return null;
}
