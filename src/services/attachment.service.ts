import { Env } from "../types";

export interface UploadAttachmentOptions {
  data: ArrayBuffer | ReadableStream;
  contentType: string;
  size: number;
  companyId?: string;
  filename?: string;
  baseUrl?: string;
}

export interface UploadAttachmentResult {
  success: boolean;
  key?: string;
  url?: string;
  error?: string;
}

export interface GetAttachmentResult {
  body: ReadableStream;
  contentType: string;
  size?: number;
  etag?: string;
}

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export class AttachmentService {
  constructor(private env: Env) {}

  async uploadAttachment(options: UploadAttachmentOptions): Promise<UploadAttachmentResult> {
    if (!this.env.ATTACHMENTS_BUCKET) {
      return { success: false, error: "Cloudflare R2 附件儲存空間尚未配置 (ATTACHMENTS_BUCKET)" };
    }

    const { data, contentType, size, companyId, baseUrl } = options;

    const normalizedMime = (contentType || "").toLowerCase().split(";")[0].trim();
    const ext = ALLOWED_MIME_TYPES[normalizedMime];
    if (!ext) {
      return {
        success: false,
        error: "不支援的檔案格式，請上傳 JPG、PNG 或 WebP 照片證明 (僅支援 image/jpeg, image/png, image/webp)"
      };
    }

    if (size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `檔案大小超出限制 (上限 5MB，目前為 ${(size / (1024 * 1024)).toFixed(2)} MB)`
      };
    }

    const safeCompanyId = (companyId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
    const dateStr = new Date().toISOString().split("T")[0];
    const uniqueId = crypto.randomUUID().replace(/-/g, "");
    const key = `proofs/${safeCompanyId}/${dateStr}/${uniqueId}.${ext}`;

    try {
      await this.env.ATTACHMENTS_BUCKET.put(key, data, {
        httpMetadata: {
          contentType: normalizedMime,
          cacheControl: "public, max-age=31536000, immutable",
        },
      });

      const relativeUrl = `/api/v1/attachments/${key}`;
      const url = baseUrl ? `${baseUrl.replace(/\/$/, "")}${relativeUrl}` : relativeUrl;

      return {
        success: true,
        key,
        url,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `上傳儲存失敗: ${err?.message || "未知錯誤"}`
      };
    }
  }

  async getAttachment(key: string): Promise<GetAttachmentResult | null> {
    if (!this.env.ATTACHMENTS_BUCKET || !key) return null;

    try {
      const object = await this.env.ATTACHMENTS_BUCKET.get(key);
      if (!object) return null;

      const contentType = object.httpMetadata?.contentType || "application/octet-stream";

      return {
        body: object.body,
        contentType,
        size: object.size,
        etag: object.httpEtag,
      };
    } catch (err) {
      return null;
    }
  }
}
