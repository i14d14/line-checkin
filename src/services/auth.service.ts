import { TenantAuthResult } from "../types";
import { hashApiKey } from "../utils/crypto";

export async function authenticateTenantRequest(
  request: Request,
  db: D1Database
): Promise<TenantAuthResult> {
  const authHeader = request.headers.get("X-Tenant-Key") || request.headers.get("Authorization");
  if (!authHeader) {
    return { authenticated: false, error: "缺少授權憑證 (請於 Header 帶入 Authorization: Bearer <token> 或 X-Tenant-Key: <key>)", status: 401 };
  }

  const tokenOrKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();
  if (!tokenOrKey) {
    return { authenticated: false, error: "無效的空授權憑證", status: 401 };
  }

  // 1. Check if it is a Web Admin Session Token (prefixed with sess_)
  if (tokenOrKey.startsWith("sess_")) {
    const sessionHash = await hashApiKey(tokenOrKey);
    const session = await db.prepare(`
      SELECT s.id, s.user_id, s.tax_id, s.role, s.expires_at, u.display_name, u.is_active as user_active
      FROM tenant_sessions s
      JOIN tenant_users u ON s.user_id = u.id
      WHERE s.token_hash = ?
    `).bind(sessionHash).first<{ id: number; user_id: number; tax_id: string; role: string; expires_at: string; display_name: string; user_active: number }>();

    if (!session) {
      return { authenticated: false, error: "無效或已過期之登入 Session", status: 401 };
    }

    if (session.user_active !== 1) {
      return { authenticated: false, error: "此管理員帳號已被停用", status: 403 };
    }

    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    if (session.expires_at < now) {
      try {
        await db.prepare("DELETE FROM tenant_sessions WHERE id = ?").bind(session.id).run();
      } catch (e) {}
      return { authenticated: false, error: "登入 Session 已過期，請重新登入", status: 401 };
    }

    return {
      authenticated: true,
      taxId: session.tax_id,
      role: session.role as any,
      name: session.display_name,
      userId: session.user_id,
      authType: "SESSION"
    };
  }

  // 2. Check if it is an M2M API Key
  const hashedKey = await hashApiKey(tokenOrKey);
  const keyRecord = await db.prepare(
    "SELECT id, tax_id, role, name, is_active FROM tenant_api_keys WHERE api_key_hash = ?"
  ).bind(hashedKey).first<{ id: number; tax_id: string; role: string; name: string; is_active: number }>();

  if (!keyRecord) {
    return { authenticated: false, error: "未授權之租戶金鑰 (Invalid Tenant API Key)", status: 401 };
  }

  if (keyRecord.is_active !== 1) {
    return { authenticated: false, error: "此租戶金鑰已被停用 (Deactivated Key)", status: 403 };
  }

  // Update last_used_at non-blocking
  try {
    await db.prepare("UPDATE tenant_api_keys SET last_used_at = datetime('now', '+8 hours') WHERE id = ?").bind(keyRecord.id).run();
  } catch (e) {
    // Non-blocking
  }

  return {
    authenticated: true,
    taxId: keyRecord.tax_id,
    role: keyRecord.role as any,
    name: keyRecord.name,
    authType: "API_KEY"
  };
}

// Verify LINE ID Token against LINE OAuth v2.1
export async function verifyLineIdToken(
  idToken: string,
  channelId?: string
): Promise<{ userId: string; name: string; picture?: string } | null> {
  if (!idToken) return null;
  try {
    const params = new URLSearchParams();
    params.append("id_token", idToken);
    if (channelId) params.append("client_id", channelId);

    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      console.error("LINE verify failed:", await res.text());
      return null;
    }

    const data = (await res.json()) as any;
    return {
      userId: data.sub,
      name: data.name || "LINE 員工",
      picture: data.picture,
    };
  } catch (e) {
    console.error("Error verifying ID Token:", e);
    return null;
  }
}

// LINE Signature verification
export async function verifyLineSignature(body: string, signature: string | null, channelSecret?: string): Promise<boolean> {
  if (!signature || !channelSecret) return true;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(channelSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const hashArray = Array.from(new Uint8Array(signed));
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    return hashBase64 === signature;
  } catch (e) {
    console.error("Signature verification error:", e);
    return false;
  }
}
