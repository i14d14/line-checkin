const https = require('https');

const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function runTest() {
  console.log("=== Testing LIFF Swipe Tab Switching & Calendar Dot Removal ===");

  // 1. Fetch LIFF HTML
  console.log("1. Fetching LIFF HTML directly from worker...");
  const liffRes = await get(`${BASE_URL}/checkin`);
  if (liffRes.status !== 200) {
    throw new Error(`LIFF returned status ${liffRes.status}`);
  }

  // 2. Verify SCHEDULED days have NO dots
  console.log("2. Verifying SCHEDULED calendar dot removal...");
  const scheduledBlockRegex = /else if \(day\.status === "SCHEDULED"\) \{\s*bgClass = "bg-sky-50 border-sky-200 text-sky-800";\s*dot = "";\s*\}/;
  if (!scheduledBlockRegex.test(liffRes.body)) {
    throw new Error("FAIL: SCHEDULED calendar block does not set dot to empty string!");
  }
  console.log("  ✅ PASS: Future SCHEDULED days have no dots (dot = \"\")");

  // 3. Verify swipe gestures implementation
  console.log("3. Verifying swipe gestures implementation in LIFF...");
  if (!liffRes.body.includes("initSwipeGestures") || !liffRes.body.includes("touchstart") || !liffRes.body.includes("touchend")) {
    throw new Error("FAIL: initSwipeGestures or touch event listeners missing in LIFF HTML!");
  }
  console.log("  ✅ PASS: initSwipeGestures and touch listeners present");

  if (!liffRes.body.includes("getAvailableTabs") || !liffRes.body.includes("currentActiveTab")) {
    throw new Error("FAIL: getAvailableTabs or currentActiveTab tracking missing!");
  }
  console.log("  ✅ PASS: getAvailableTabs and currentActiveTab tracking present");

  if (!liffRes.body.includes("touch-action: pan-y") || !liffRes.body.includes("tab-section")) {
    throw new Error("FAIL: touch-action: pan-y or tab-section styling missing!");
  }
  console.log("  ✅ PASS: touch-action: pan-y and tab-section animations present");

  console.log("\n🎉 ALL LIFF SWIPE & CALENDAR DOT CHECKS PASSED!");
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
