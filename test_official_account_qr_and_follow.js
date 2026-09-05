const crypto = require('crypto');

const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";
const LINE_CHANNEL_SECRET = "REDACTED_LINE_CHANNEL_SECRET_000";
const STORE_ID = "24549210-01";

async function runTest() {
  console.log("=== Testing Stand LIFF QR Code (with CID & bot_prompt=aggressive) & Add Friend Gate (v2.5.0) ===");

  // 1. Inspect Public Stand QR Code Page
  console.log("\n1. Inspecting Public Location Stand QR Code (/api/locations/:id/qrcode)...");
  const pubQrRes = await fetch(`${BASE_URL}/api/locations/${STORE_ID}/qrcode`);
  if (pubQrRes.status !== 200) {
    throw new Error(`Public QR returned status ${pubQrRes.status}`);
  }
  
  const pubHtml = await pubQrRes.text();
  if (!pubHtml.includes("門市考勤打卡立牌")) {
    throw new Error("FAIL: Public QR page does not contain '門市考勤打卡立牌' header!");
  }
  if (!pubHtml.includes("@375nvoga")) {
    throw new Error("FAIL: Public QR page does not contain '@375nvoga' basic ID!");
  }
  if (!pubHtml.includes(`cid=${STORE_ID}`) || !pubHtml.includes("liff.line.me") || !pubHtml.includes("bot_prompt=aggressive")) {
    throw new Error("FAIL: Public QR page does not encode LIFF URL with Store CID and bot_prompt=aggressive!");
  }
  if (!pubHtml.includes("加入打卡帳號好友") || (!pubHtml.includes("https://line.me/R/ti/p/%40375nvoga") && !pubHtml.includes("https://line.me/R/ti/p/@375nvoga"))) {
    throw new Error("FAIL: Public QR page missing '加入打卡帳號好友' button or link!");
  }
  console.log(`  ✅ PASS: Public Stand QR page successfully encodes LIFF URL with Store CID (${STORE_ID}), bot_prompt=aggressive, and provides Add Friend button`);

  // 2. Inspect Tenant Stand QR Code Page
  console.log("\n2. Logging in to admin to get API session for Tenant QR testing...");
  const loginRes = await fetch(`${BASE_URL}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: "Admin@24549210"
    })
  });
  const loginData = await loginRes.json();
  const sessionToken = loginData.token;
  if (!sessionToken) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
  }

  console.log("  Inspecting Tenant Location Stand QR Code (/api/v1/tenant/locations/:id/qrcode)...");
  const tenantQrRes = await fetch(`${BASE_URL}/api/v1/tenant/locations/${STORE_ID}/qrcode`, {
    headers: {
      "Authorization": `Bearer ${sessionToken}`
    }
  });
  if (tenantQrRes.status !== 200) {
    throw new Error(`Tenant QR returned status ${tenantQrRes.status}: ${await tenantQrRes.text()}`);
  }
  const tenantHtml = await tenantQrRes.text();
  if (!tenantHtml.includes(`cid=${STORE_ID}`) || !tenantHtml.includes("liff.line.me") || !tenantHtml.includes("bot_prompt=aggressive")) {
    throw new Error("FAIL: Tenant QR page does not encode LIFF URL with Store CID and bot_prompt=aggressive!");
  }
  if (!tenantHtml.includes("加入打卡帳號好友") || (!tenantHtml.includes("https://line.me/R/ti/p/%40375nvoga") && !tenantHtml.includes("https://line.me/R/ti/p/@375nvoga"))) {
    throw new Error("FAIL: Tenant QR page missing '加入打卡帳號好友' button or link!");
  }
  console.log(`  ✅ PASS: Tenant Stand QR page successfully encodes LIFF URL with Store CID (${STORE_ID}), bot_prompt=aggressive, and provides Add Friend button`);

  // 3. Test Webhook Follow Event Handler
  console.log("\n3. Testing Webhook Follow (Add Friend) Event Handler...");
  const followPayload = JSON.stringify({
    destination: "U_TEST_BOT",
    events: [
      {
        type: "follow",
        mode: "active",
        timestamp: Date.now(),
        source: {
          type: "user",
          userId: "U_MOCK_NEW_FRIEND_TEST"
        },
        replyToken: "mock_test_follow_reply_token00",
        webhookEventId: `mock_evt_${Date.now()}`,
        deliveryContext: {
          isRedelivery: false
        }
      }
    ]
  });

  const signature = crypto.createHmac('sha256', LINE_CHANNEL_SECRET).update(followPayload).digest('base64');
  const webhookRes = await fetch(`${BASE_URL}/api/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-line-signature": signature
    },
    body: followPayload
  });

  if (webhookRes.status !== 200) {
    throw new Error(`Webhook returned status ${webhookRes.status}: ${await webhookRes.text()}`);
  }
  const webhookData = await webhookRes.json();
  if (!webhookData.success) {
    throw new Error(`FAIL: Webhook failed: ${JSON.stringify(webhookData)}`);
  }
  console.log("  ✅ PASS: Webhook processed follow event successfully (status 200 OK)");

  console.log("\n🎉 ALL OFFICIAL ACCOUNT QR & FOLLOW TESTS PASSED 100%!");
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
