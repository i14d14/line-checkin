const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";
const PIGMAO_USER_ID = "Ubd107bb3ba1b85a8086fc3b2250458e8";
const STORE_ID = "24549210-01";

async function runTest() {
  console.log("=== Testing Retroactive Leave Compensation & Overtime Conflict Prevention (v2.5.0) ===");

  // 1. Verify 2026-09-03 Attendance for 豬毛
  console.log("\n1. Verifying 2026-09-03 Attendance record for 豬毛...");
  const attRes = await fetch(`${BASE_URL}/api/v1/attendance/monthly?userId=${PIGMAO_USER_ID}&month=2026-09&companyId=${STORE_ID}`);
  if (attRes.status !== 200) {
    throw new Error(`Monthly attendance returned status ${attRes.status}`);
  }
  const attData = await attRes.json();
  const day3 = attData.days.find(d => d.date === "2026-09-03");
  if (!day3) {
    throw new Error("FAIL: Day 2026-09-03 not found in monthly attendance!");
  }

  console.log("   Day 3 evaluation result:", {
    status: day3.status,
    statusText: day3.statusText,
    statusColor: day3.statusColor,
    workHours: day3.workHours,
    overtimeHours: day3.overtimeHours,
    isRestDay: day3.isRestDay
  });

  if (day3.status !== "NORMAL") {
    throw new Error(`FAIL: Expected status 'NORMAL', got '${day3.status}'`);
  }
  if (day3.statusColor !== "green") {
    throw new Error(`FAIL: Expected statusColor 'green', got '${day3.statusColor}'`);
  }
  if (day3.workHours !== 6.9) {
    throw new Error(`FAIL: Expected workHours 6.9, got ${day3.workHours}`);
  }
  if (day3.leaveHours !== 1.1) {
    throw new Error(`FAIL: Expected leaveHours 1.1, got ${day3.leaveHours}`);
  }
  if (day3.overtimeHours !== 0) {
    throw new Error(`FAIL: Expected overtimeHours 0, got ${day3.overtimeHours} (conflict still exists!)`);
  }
  if (day3.isRestDay !== false) {
    throw new Error(`FAIL: Expected isRestDay false for worked day, got ${day3.isRestDay}`);
  }
  if (!day3.statusText.includes("請假") || !day3.statusText.includes("出勤")) {
    throw new Error(`FAIL: Expected statusText to contain '請假' and '出勤', got '${day3.statusText}'`);
  }
  console.log("  ✅ PASS: 2026-09-03 successfully calibrated: 6.9h regular work hours, 1.1h leave offset, 0h overtime, NORMAL status (green)");

  // 2. Verify Monthly Summary stats exclude false overtime and include regular hours
  console.log("\n2. Verifying monthly summary statistics...");
  console.log("   Summary:", attData.summary);
  if (attData.summary.overtime_hours >= 6.9) {
    throw new Error(`FAIL: Monthly overtime_hours (${attData.summary.overtime_hours}) still includes false overtime from 9/3!`);
  }
  if (attData.summary.total_work_hours < 6.9) {
    throw new Error(`FAIL: Monthly total_work_hours (${attData.summary.total_work_hours}) did not include 6.9h from 9/3!`);
  }
  if (!attData.summary.total_leave_hours || attData.summary.total_leave_hours <= 0) {
    throw new Error(`FAIL: Monthly total_leave_hours (${attData.summary.total_leave_hours}) should be > 0!`);
  }
  console.log("  ✅ PASS: Monthly summary accurately includes regular work hours and total leave hours");

  // 3. Inspect LIFF HTML for leave compensation notice and dynamic date handler
  console.log("\n3. Inspecting LIFF HTML for leave punch compensation notices & detailLeaveRow...");
  const liffRes = await fetch(`${BASE_URL}/checkin`);
  const liffHtml = await liffRes.text();
  if (!liffHtml.includes("leavePunchNotice") || !liffHtml.includes("onApprDateChange")) {
    throw new Error("FAIL: LIFF HTML does not include leavePunchNotice or onApprDateChange handler!");
  }
  if (liffHtml.includes("已抵請假")) {
    throw new Error("FAIL: LIFF HTML should NOT include '已抵請假' tag in detailWorkHours anymore!");
  }
  if (!liffHtml.includes("detailLeaveRow") || !liffHtml.includes("detailLeaveHours")) {
    throw new Error("FAIL: LIFF HTML does not include detailLeaveRow or detailLeaveHours element!");
  }
  console.log("  ✅ PASS: LIFF HTML successfully provides leave punch notice, detailLeaveRow, and clean work hours without '已抵請假'");

  console.log("\n🎉 ALL RETROACTIVE LEAVE COMPENSATION TESTS PASSED 100%!");
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
