import { Env } from "../types";
import { AttachmentService } from "../services/attachment.service";

export async function handleAttachmentRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const service = new AttachmentService(env);

  // 1. POST /api/v1/attachments/upload
  if (url.pathname === "/api/v1/attachments/upload" && request.method === "POST") {
    const contentTypeHeader = request.headers.get("content-type") || "";
    let data: ArrayBuffer | null = null;
    let mimeType = "";
    let size = 0;
    let companyId = url.searchParams.get("companyId") || request.headers.get("x-company-id") || "";

    try {
      if (contentTypeHeader.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("file") || formData.get("proof") || formData.get("attachment");

        if (file && typeof file === "object" && "arrayBuffer" in file) {
          const fileObj = file as File;
          data = await fileObj.arrayBuffer();
          mimeType = fileObj.type || "application/octet-stream";
          size = fileObj.size;
        }

        const formCid = formData.get("companyId");
        if (typeof formCid === "string" && formCid.trim()) {
          companyId = formCid.trim();
        }
      } else {
        mimeType = contentTypeHeader.split(";")[0].trim();
        data = await request.arrayBuffer();
        size = data.byteLength;
      }

      if (!data || size === 0) {
        return Response.json(
          { success: false, error: "未接收到有效檔案內容，請選擇照片檔案後重新上傳。" },
          { status: 400, headers: corsHeaders }
        );
      }

      const uploadResult = await service.uploadAttachment({
        data,
        contentType: mimeType,
        size,
        companyId,
        baseUrl: url.origin,
      });

      const statusCode = uploadResult.success ? 200 : 400;
      return Response.json(uploadResult, { status: statusCode, headers: corsHeaders });
    } catch (err: any) {
      return Response.json(
        { success: false, error: `處理上傳請求失敗: ${err?.message || "未知錯誤"}` },
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // 2. GET /api/v1/attachments/* or GET /api/v1/attachments?key=...
  const isGetAttachment =
    request.method === "GET" &&
    (url.pathname === "/api/v1/attachments" || url.pathname.startsWith("/api/v1/attachments/"));

  if (isGetAttachment) {
    let key = "";
    if (url.pathname === "/api/v1/attachments") {
      key = url.searchParams.get("key") || "";
    } else {
      key = decodeURIComponent(url.pathname.replace(/^\/api\/v1\/attachments\//, ""));
    }

    if (!key) {
      return Response.json(
        { success: false, error: "缺少附件檔案識別碼 (key)" },
        { status: 400, headers: corsHeaders }
      );
    }

    const attachment = await service.getAttachment(key);
    if (!attachment) {
      return new Response("Attachment Not Found", { status: 404, headers: corsHeaders });
    }

    const headers: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": attachment.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    };

    if (attachment.size) {
      headers["Content-Length"] = attachment.size.toString();
    }
    if (attachment.etag) {
      headers["ETag"] = attachment.etag;
    }

    return new Response(attachment.body, {
      status: 200,
      headers,
    });
  }

  return null;
}
