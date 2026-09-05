const https = require('https');

const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";
const PIGMAO_USER_ID = "Ubd107bb3ba1b85a8086fc3b2250458e8";
const JIAYU_USER_ID = "U4eb5f204f746d1ab2b360e687eb99105";
const STORE_ID = "24549210-01";

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
  console.log("=== Testing Calendar Today (TODAY) & Approved Leave (LEAVE) Calibrations (v2.6.1) ===");

  const now = new Date();
  const twDate = new Date(now.getTime() + 8 * 3600 * 1000);
  const currentMonthStr = twDate.toISOString().slice(0, 7);
  const todayStr = twDate.toISOString().slice(0, 10);

  // 1. Inspect LIFF HTML
  console.log("\n1. Verifying LIFF HTML has TODAY & LEAVE styling and isToday ring indicator...");
  const liffRes = await get(`${BASE_URL}/checkin`);
  if (liffRes.status !== 200) {
    throw new Error(`LIFF returned status ${liffRes.status}`);
  }

  if (!liffRes.body.includes('day.status === "LEAVE"') || !liffRes.body.includes('bg-amber-50 border-amber-200 text-amber-900')) {
    throw new Error("FAIL: LIFF HTML does not include LEAVE amber card styling!");
  }
  console.log("  ✅ PASS: LIFF HTML contains LEAVE amber styling (bg-amber-50 / text-amber-900)");

  if (!liffRes.body.includes('day.status === "TODAY"') || !liffRes.body.includes('今日')) {
    throw new Error("FAIL: LIFF HTML does not include TODAY status and 今日 badge!");
  }
  console.log("  ✅ PASS: LIFF HTML contains TODAY emerald status and 今日 badge");

  if (!liffRes.body.includes('ring-2 ring-emerald-500 ring-offset-1')) {
    throw new Error("FAIL: LIFF HTML does not include isToday ring-2 ring-emerald-500 indicator!");
  }
  console.log("  ✅ PASS: LIFF HTML contains isToday ring-2 ring-emerald-500 highlight indicator");

  // 2. Query Monthly API for pigmao (User with approved leave today)
  console.log(`\n2. Auditing today (${todayStr}) for User with Approved Leave (豬毛)...`);
  const pigRes = await get(`${BASE_URL}/api/v1/attendance/monthly?userId=${PIGMAO_USER_ID}&month=${currentMonthStr}&companyId=${STORE_ID}`);
  const pigData = JSON.parse(pigRes.body);
  const pigToday = pigData.days.find(d => d.date === todayStr);

  console.log("   豬毛 today audit result:", {
    date: pigToday.date,
    isToday: pigToday.isToday,
    isRestDay: pigToday.isRestDay,
    status: pigToday.status,
    statusText: pigToday.statusText,
    statusColor: pigToday.statusColor,
    leaveHours: pigToday.leaveHours
  });

  if (!pigToday.isToday) {
    throw new Error("FAIL: pigToday.isToday must be true!");
  }
  if (pigToday.punches && pigToday.punches.length > 0) {
    if (pigToday.status !== "NORMAL" || !pigToday.statusText.includes("請假")) {
      throw new Error(`FAIL: Expected status 'NORMAL' with leave text for punched leave, got '${pigToday.status}' / '${pigToday.statusText}'`);
    }
    console.log("  ✅ PASS: 豬毛今日有打卡流水且請假，精準判定為出勤沖銷 (NORMAL / 請假 + 出勤)，且 isToday: true！");
  } else {
    if (pigToday.status !== "LEAVE") {
      throw new Error(`FAIL: Expected status 'LEAVE', got '${pigToday.status}' (must not be REST_DAY!)`);
    }
    if (pigToday.statusColor !== "amber") {
      throw new Error(`FAIL: Expected statusColor 'amber', got '${pigToday.statusColor}' (must not be gray!)`);
    }
    if (pigToday.isRestDay !== false) {
      throw new Error(`FAIL: Expected isRestDay false for approved leave, got '${pigToday.isRestDay}'`);
    }
    console.log("  ✅ PASS: 豬毛今日請假 (事假) 精準判定為 LEAVE (amber)，非例假 (REST_DAY/gray)，且 isToday: true！");
  }

  // 3. Query Monthly API for Regular User without punches today (test_user_today)
  console.log(`\n3. Auditing today (${todayStr}) for Regular User with pending check-in (test_user_today)...`);
  const regRes = await get(`${BASE_URL}/api/v1/attendance/monthly?userId=test_user_today&month=${currentMonthStr}&companyId=${STORE_ID}`);
  const regData = JSON.parse(regRes.body);
  const regToday = regData.days.find(d => d.date === todayStr);

  console.log("   一般員工 today audit result:", {
    date: regToday.date,
    isToday: regToday.isToday,
    isRestDay: regToday.isRestDay,
    status: regToday.status,
    statusText: regToday.statusText,
    statusColor: regToday.statusColor
  });

  if (!regToday.isToday) {
    throw new Error("FAIL: regToday.isToday must be true!");
  }
  if (regToday.status !== "TODAY") {
    throw new Error(`FAIL: Expected status 'TODAY' for pending today workday, got '${regToday.status}'`);
  }
  if (regToday.statusText !== "今日待出勤") {
    throw new Error(`FAIL: Expected statusText '今日待出勤', got '${regToday.statusText}'`);
  }
  if (regToday.statusColor !== "emerald") {
    throw new Error(`FAIL: Expected statusColor 'emerald', got '${regToday.statusColor}' (must not be gray or red!)`);
  }
  console.log("  ✅ PASS: 一般員工今日排班中待出勤精準判定為 TODAY (今日待出勤 / emerald)，絕非灰色或紅色！");

  // 4. Query Monthly API for User with Active Check-in today (jiayu)
  console.log(`\n4. Auditing today (${todayStr}) for User with active check-in (jiayu)...`);
  const jiaRes = await get(`${BASE_URL}/api/v1/attendance/monthly?userId=${JIAYU_USER_ID}&month=${currentMonthStr}&companyId=${STORE_ID}`);
  const jiaData = JSON.parse(jiaRes.body);
  const jiaToday = jiaData.days.find(d => d.date === todayStr);

  console.log("   jiayu today audit result:", {
    date: jiaToday.date,
    isToday: jiaToday.isToday,
    status: jiaToday.status,
    statusText: jiaToday.statusText,
    statusColor: jiaToday.statusColor,
    firstInTime: jiaToday.firstInTime
  });

  if (!jiaToday.isToday) {
    throw new Error("FAIL: jiaToday.isToday must be true!");
  }
  if (jiaToday.status !== "NORMAL") {
    throw new Error(`FAIL: Expected status 'NORMAL' for checked-in user, got '${jiaToday.status}'`);
  }
  if (jiaToday.statusText !== "已上班/待下班") {
    throw new Error(`FAIL: Expected statusText '已上班/待下班', got '${jiaToday.statusText}'`);
  }
  console.log("  ✅ PASS: 今日已上班同仁精準維持 NORMAL (已上班/待下班 / green)，且 isToday: true！");

  console.log("\n🎉 ALL CALENDAR TODAY & LEAVE TESTS PASSED 100%!");
}

runTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
