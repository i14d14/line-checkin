import { Env } from "../types";
import { verifyLineSignature } from "../services/auth.service";
import { WebhookService } from "../services/webhook.service";

export async function handleWebhookRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: Record<string, string>,
  clientIp: string,
  userAgent: string
): Promise<Response | null> {
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
      const service = new WebhookService(env);

      for (const event of events) {
        await service.handleEvent(event, clientIp, userAgent);
      }

      return Response.json({ success: true, message: "Webhook processed" }, { headers: corsHeaders });
    } catch (err: any) {
      console.error("Webhook processing error:", err);
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  return null;
}
