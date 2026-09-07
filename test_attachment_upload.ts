/**
 * Automated Test Suite: Leave Request Attachment Upload via Cloudflare R2 (v2.12.0)
 * Verifies:
 * 1. AttachmentService validation (MIME types, 5MB limit, key generation, R2 operations)
 * 2. Attachment route endpoints (POST upload multipart/binary, GET proxy streaming, 404 handling)
 * 3. Manager Approval Flex Card integration (attachment button, URI action)
 * 4. LIFF UI elements (file picker, dropzone, upload handlers)
 */

import { AttachmentService } from "./src/services/attachment.service";
import { handleAttachmentRoutes } from "./src/routes/attachment.route";
import { buildApprovalRequestFlex, buildManagerApprovalCard } from "./src/views/flex/approval-flex";
import { renderLiffTabs } from "./src/views/liff/liff-tabs";
import { renderLiffScripts } from "./src/views/liff/liff-scripts";
import { Env } from "./src/types";

const assert = (desc: string, condition: boolean) => {
  if (condition) {
    console.log(`  ✅ [PASS] ${desc}`);
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    throw new Error(`Assertion failed: ${desc}`);
  }
};

// Mock Cloudflare R2Bucket
class MockR2Bucket {
  public storage = new Map<string, any>();

  async put(key: string, data: any, options: any = {}) {
    let buffer: Buffer;
    if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
    } else if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (typeof data === "string") {
      buffer = Buffer.from(data);
    } else {
      buffer = Buffer.from("mock_stream_data");
    }

    const item = {
      body: buffer,
      size: buffer.byteLength,
      httpMetadata: options.httpMetadata || {},
      httpEtag: `"${Math.random().toString(36).substring(2)}"`,
    };
    this.storage.set(key, item);
    return item as any;
  }

  async get(key: string) {
    const item = this.storage.get(key);
    if (!item) return null;
    return {
      body: item.body,
      size: item.size,
      httpMetadata: item.httpMetadata,
      httpEtag: item.httpEtag,
    } as any;
  }

  async delete(key: string) {
    this.storage.delete(key);
  }
}

async function runAttachmentTests() {
  console.log("================================================================================");
  console.log("🚀 STARTING AUTOMATED TEST: R2 LEAVE ATTACHMENT UPLOAD & PROXY (v2.12.0)");
  console.log("================================================================================\n");

  const mockBucket = new MockR2Bucket() as unknown as R2Bucket;
  const mockEnv: Env = {
    DB: {} as any,
    ATTACHMENTS_BUCKET: mockBucket,
  };
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
  };

  // --- 1. AttachmentService Unit Tests ---
  console.log("--- 1. AttachmentService 核心驗證與 R2 操作測試 ---");
  const service = new AttachmentService(mockEnv);

  // 1.1 Missing R2 binding test
  const serviceNoBucket = new AttachmentService({ DB: {} as any });
  const noBucketResult = await serviceNoBucket.uploadAttachment({
    data: new ArrayBuffer(100),
    contentType: "image/jpeg",
    size: 100,
  });
  assert("未綁定 R2 Bucket 時防呆攔截回傳錯誤", noBucketResult.success === false && !!noBucketResult.error && noBucketResult.error.includes("尚未配置"));

  // 1.2 Invalid MIME type rejection
  const pdfResult = await service.uploadAttachment({
    data: new ArrayBuffer(100),
    contentType: "application/pdf",
    size: 100,
  });
  assert("拒絕非照片格式 (application/pdf)", pdfResult.success === false && !!pdfResult.error && pdfResult.error.includes("不支援的檔案格式"));

  const txtResult = await service.uploadAttachment({
    data: new ArrayBuffer(100),
    contentType: "text/plain",
    size: 100,
  });
  assert("拒絕純文字檔案 (text/plain)", txtResult.success === false);

  // 1.3 Oversized file rejection (> 5MB)
  const oversizedResult = await service.uploadAttachment({
    data: new ArrayBuffer(10),
    contentType: "image/jpeg",
    size: 5 * 1024 * 1024 + 1, // 5MB + 1 byte
  });
  assert("超過 5MB 檔案大小限制攔截", oversizedResult.success === false && !!oversizedResult.error && oversizedResult.error.includes("超出限制"));

  // 1.4 Valid JPG upload
  const validJpgResult = await service.uploadAttachment({
    data: new ArrayBuffer(2048),
    contentType: "image/jpeg",
    size: 2048,
    companyId: "24549210-01",
    baseUrl: "https://line-checkin-worker.i14d142.workers.dev",
  });
  assert("合法 JPG 照片上傳成功", validJpgResult.success === true && !!validJpgResult.key);
  assert("Key 符合 proofs/{companyId}/{date}/{uuid}.jpg 格式", /^proofs\/24549210-01\/\d{4}-\d{2}-\d{2}\/[a-f0-9]+\.jpg$/.test(validJpgResult.key!));
  assert("回傳完整絕對 URL", !!validJpgResult.url && validJpgResult.url.startsWith("https://line-checkin-worker.i14d142.workers.dev/api/v1/attachments/proofs/24549210-01/"));

  // 1.5 Valid PNG & WebP upload
  const validPngResult = await service.uploadAttachment({
    data: new ArrayBuffer(1024),
    contentType: "image/png; charset=utf-8",
    size: 1024,
    companyId: "TEST_CO",
  });
  assert("合法 PNG 照片上傳成功且副檔名為 png", validPngResult.success === true && !!validPngResult.key && validPngResult.key.endsWith(".png"));

  const validWebpResult = await service.uploadAttachment({
    data: new ArrayBuffer(1024),
    contentType: "image/webp",
    size: 1024,
  });
  assert("合法 WebP 照片上傳成功且副檔名為 webp", validWebpResult.success === true && !!validWebpResult.key && validWebpResult.key.endsWith(".webp"));

  // 1.6 Fetch object from R2
  const fetchedObj = await service.getAttachment(validJpgResult.key!);
  assert("從 R2 獲取附件成功", fetchedObj !== null && fetchedObj.size === 2048);
  assert("Content-Type 正確還原為 image/jpeg", fetchedObj !== null && fetchedObj.contentType === "image/jpeg");

  const nonExistent = await service.getAttachment("proofs/invalid/not-found.jpg");
  assert("不存在的 key 回傳 null", nonExistent === null);

  // --- 2. HTTP Route Handlers Integration Tests ---
  console.log("\n--- 2. HTTP 路由端點 (/api/v1/attachments) 整合測試 ---");

  // 2.1 Binary POST /api/v1/attachments/upload
  const binaryReq = new Request("https://line-checkin-worker.i14d142.workers.dev/api/v1/attachments/upload", {
    method: "POST",
    headers: {
      "content-type": "image/jpeg",
      "x-company-id": "24549210-01",
    },
    body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]), // JPEG header
  });
  const binaryResp = await handleAttachmentRoutes(binaryReq, mockEnv, new URL(binaryReq.url), corsHeaders);
  assert("二進位 POST 上傳 200 OK", binaryResp !== null && binaryResp.status === 200);
  const binaryData: any = await binaryResp!.json();
  assert("二進位上傳回傳 success 與 key", binaryData.success === true && !!binaryData.key);

  // 2.2 GET /api/v1/attachments/:key (streaming)
  const getReq = new Request(`https://line-checkin-worker.i14d142.workers.dev/api/v1/attachments/${binaryData.key}`, {
    method: "GET",
  });
  const getResp = await handleAttachmentRoutes(getReq, mockEnv, new URL(getReq.url), corsHeaders);
  assert("串流 GET 附件 200 OK", getResp !== null && getResp.status === 200);
  assert("回應標頭包含 Content-Type: image/jpeg", getResp!.headers.get("Content-Type") === "image/jpeg");
  assert("回應標頭包含 Cache-Control immutable", !!getResp!.headers.get("Cache-Control") && getResp!.headers.get("Cache-Control")!.includes("immutable"));

  // 2.3 GET /api/v1/attachments?key=:key (query param)
  const getQueryReq = new Request(`https://line-checkin-worker.i14d142.workers.dev/api/v1/attachments?key=${encodeURIComponent(binaryData.key)}`, {
    method: "GET",
  });
  const getQueryResp = await handleAttachmentRoutes(getQueryReq, mockEnv, new URL(getQueryReq.url), corsHeaders);
  assert("Query Param GET 附件 200 OK", getQueryResp !== null && getQueryResp.status === 200);

  // 2.4 GET 404 on non-existent attachment
  const get404Req = new Request("https://line-checkin-worker.i14d142.workers.dev/api/v1/attachments/proofs/missing/key.jpg", {
    method: "GET",
  });
  const get404Resp = await handleAttachmentRoutes(get404Req, mockEnv, new URL(get404Req.url), corsHeaders);
  assert("不存在之附件回應 404 Not Found", get404Resp !== null && get404Resp.status === 404);

  // 2.5 Empty body upload returns 400
  const emptyReq = new Request("https://line-checkin-worker.i14d142.workers.dev/api/v1/attachments/upload", {
    method: "POST",
    headers: { "content-type": "image/jpeg" },
    body: new Uint8Array(0),
  });
  const emptyResp = await handleAttachmentRoutes(emptyReq, mockEnv, new URL(emptyReq.url), corsHeaders);
  assert("空內容上傳回應 400 Bad Request", emptyResp !== null && emptyResp.status === 400);

  // --- 3. Manager Approval Flex Card Integration Tests ---
  console.log("\n--- 3. 主管審核 Flex 卡片證明文件按鈕測試 ---");

  // 3.1 Card without attachment
  const cardNoAttach = buildApprovalRequestFlex(
    "appr_123",
    "LEAVE",
    "張小美",
    "豬毛有限公司 - 台中美德總部",
    "2026-09-08",
    { leave_type: "病假", time_range: "全天", reason: "感冒發燒" }
  );
  const bodyContentsNoAttach = cardNoAttach.flexBubble.body.contents;
  const hasAttachBtnNoAttach = JSON.stringify(bodyContentsNoAttach).includes("查看證明文件");
  assert("無附件之請假單據不顯示附件按鈕", hasAttachBtnNoAttach === false);

  // 3.2 Card with attachment_url
  const testAttachUrl = "https://line-checkin-worker.i14d142.workers.dev/api/v1/attachments/proofs/default/2026-09-08/sample.jpg";
  const cardWithAttach = buildApprovalRequestFlex(
    "appr_456",
    "LEAVE",
    "王大同",
    "豬毛有限公司 - 台中美德總部",
    "2026-09-08",
    {
      leave_type: "病假",
      time_range: "全天",
      reason: "腸胃炎就醫診斷",
      attachment_url: testAttachUrl,
    }
  );
  const bodyContentsWithAttach = cardWithAttach.flexBubble.body.contents;
  const cardJson = JSON.stringify(bodyContentsWithAttach);
  assert("有附件之請假單據包含【📎 查看證明文件】按鈕", cardJson.includes("查看證明文件"));
  assert("按鈕 action 包含精準 URI 連結", cardJson.includes(testAttachUrl));

  // 3.3 buildManagerApprovalCard alias consistency
  assert("buildManagerApprovalCard 與 buildApprovalRequestFlex 等價導出", buildManagerApprovalCard === buildApprovalRequestFlex);

  // --- 4. LIFF Frontend HTML & Script Integration Tests ---
  console.log("\n--- 4. LIFF 行動端介面與客戶端腳本整合測試 ---");
  const liffHtml = renderLiffTabs("2026-09");
  assert("LIFF 頁面包含 #leaveProof 檔案選擇器", liffHtml.includes('id="leaveProof"'));
  assert("檔案選擇器限制 accept=\"image/*\"", liffHtml.includes('accept="image/*"'));
  assert("檔案選擇器具備 capture=\"environment\" 相機拍照屬性", liffHtml.includes('capture="environment"'));
  assert("LIFF 包含 #leaveProofDropzone 點擊區域", liffHtml.includes('id="leaveProofDropzone"'));
  assert("LIFF 包含 #leaveProofThumbnail 縮圖元素", liffHtml.includes('id="leaveProofThumbnail"'));

  const liffScripts = renderLiffScripts("2011328810-vjUUBSYA");
  assert("客戶端腳本包含 handleLeaveProofSelected 函式", liffScripts.includes("function handleLeaveProofSelected"));
  assert("客戶端腳本包含 removeLeaveProof 函式", liffScripts.includes("function removeLeaveProof"));
  assert("客戶端腳本支援 /api/v1/attachments/upload 上傳呼叫", liffScripts.includes("/api/v1/attachments/upload"));
  assert("申請紀錄列表包含查看證明文件連結", liffScripts.includes("查看證明文件"));

  console.log("\n================================================================================");
  console.log("🎉 ALL R2 ATTACHMENT UNIT & INTEGRATION TESTS PASSED (100% GREEN)!");
  console.log("================================================================================");
}

runAttachmentTests().catch(err => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
