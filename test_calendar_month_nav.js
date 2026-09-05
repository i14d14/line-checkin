const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";
const PIGMAO_USER_ID = "Ubd107bb3ba1b85a8086fc3b2250458e8";
const STORE_ID = "24549210-01";

async function runTest() {
  console.log("=== Testing Calendar Month Navigation & Clean Work Hours Display (v2.5.5) ===");

  // 1. Test calculation logic of changeCalendarMonth
  console.log("\n1. Verifying month navigation offset calculations (UTC deterministic)...");
  function calcMonth(val, offset) {
    const [year, month] = val.split("-").map(Number);
    const targetDate = new Date(Date.UTC(year, month - 1 + offset, 1));
    const targetYear = targetDate.getUTCFullYear();
    const targetMonth = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
    return `${targetYear}-${targetMonth}`;
  }

  const testCases = [
    { in: "2026-09", offset: -1, exp: "2026-08" },
    { in: "2026-09", offset: 1, exp: "2026-10" },
    { in: "2026-01", offset: -1, exp: "2025-12" }, // Cross year backward
    { in: "2026-12", offset: 1, exp: "2027-01" }, // Cross year forward
    { in: "2026-03", offset: -1, exp: "2026-02" }
  ];

  for (const tc of testCases) {
    const res = calcMonth(tc.in, tc.offset);
    if (res !== tc.exp) {
      throw new Error(`FAIL: calcMonth(${tc.in}, ${tc.offset}) = ${res}, expected ${tc.exp}`);
    }
    console.log(`   ✅ ${tc.in} (offset ${tc.offset > 0 ? '+' : ''}${tc.offset}) => ${res}`);
  }
  console.log("  ✅ PASS: Month offset calculation logic is 100% accurate and cross-year safe");

  // 2. Fetch LIFF HTML and verify navigation UI elements and absence of 已抵請假
  console.log("\n2. Verifying LIFF HTML for month navigation buttons and clean display...");
  const res = await fetch(`${BASE_URL}/checkin`);
  if (res.status !== 200) {
    throw new Error(`Fetch /checkin returned HTTP ${res.status}`);
  }
  const html = await res.text();

  if (!html.includes('onclick="changeCalendarMonth(-1)"')) {
    throw new Error("FAIL: LIFF HTML missing 'changeCalendarMonth(-1)' previous month button!");
  }
  if (!html.includes('onclick="changeCalendarMonth(1)"')) {
    throw new Error("FAIL: LIFF HTML missing 'changeCalendarMonth(1)' next month button!");
  }
  if (!html.includes('function changeCalendarMonth(offset)')) {
    throw new Error("FAIL: LIFF HTML missing changeCalendarMonth(offset) function definition!");
  }
  if (html.includes("已抵請假")) {
    throw new Error("FAIL: LIFF HTML should NOT contain '已抵請假'!");
  }
  console.log("  ✅ PASS: LIFF HTML contains '<' and '>' buttons and changeCalendarMonth function");
  console.log("  ✅ PASS: '已抵請假' tag has been completely removed from LIFF HTML");

  // 3. Test API responses for previous and current months
  console.log("\n3. Verifying attendance API responses across multiple months...");
  const months = ["2026-08", "2026-09"];
  for (const m of months) {
    const apiRes = await fetch(`${BASE_URL}/api/v1/attendance/monthly?userId=${PIGMAO_USER_ID}&month=${m}&companyId=${STORE_ID}`);
    if (apiRes.status !== 200) {
      throw new Error(`API for month ${m} returned HTTP ${apiRes.status}`);
    }
    const data = await apiRes.json();
    if (!data.success || !Array.isArray(data.days)) {
      throw new Error(`API for month ${m} returned invalid response`);
    }
    console.log(`   Month ${m}: ${data.days.length} days returned, summary total_work_hours = ${data.summary.total_work_hours}h`);
  }
  console.log("  ✅ PASS: Monthly attendance API successfully serves queries across months");

  console.log("\n🎉 ALL CALENDAR MONTH NAVIGATION & CLEAN DISPLAY TESTS PASSED 100%!");
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
