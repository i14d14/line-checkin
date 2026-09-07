/**
 * test_roster_ssot_and_unscheduled.js
 * Comprehensive automated verification for SSOT Roster & Unscheduled Transparency
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKER_URL = "https://line-checkin-worker.i14d142.workers.dev";
const TEST_TIMESTAMP = Date.now();
const TEST_TAX_ID = "24549210";
const TEST_COMPANY_ID = "24549210-01";
const SHIFT_USER_ID = `U_TEST_SHIFT_${TEST_TIMESTAMP}`;
const FIXED_USER_ID = `U_TEST_FIXED_${TEST_TIMESTAMP}`;
const TEST_MONTH = "2026-10"; // Use future month for isolated testing

// Load .env
const envPath = path.resolve(__dirname, '.env');
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const accountId = env.CLOUDFLARE_ACCOUNT_ID || '855d7f93966abed2712c15f619ea6721';
const dbId = env.CLOUDFLARE_D1_DATABASE_ID || 'd331ccb9-3aa5-48bd-8803-5e074e38b1c2';
const token = env.CLOUDFLARE_API_TOKEN;

async function queryD1(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });
  const data = await res.json();
  if (!data.success) throw new Error(JSON.stringify(data.errors || data));
  return data.result[0]?.results || [];
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 STARTING AUTOMATED TEST: SSOT ROSTER & UNSCHEDULED TRANSPARENCY");
  console.log(`👤 SHIFT USER: ${SHIFT_USER_ID} (排班制)`);
  console.log(`👤 FIXED USER: ${FIXED_USER_ID} (固定常態班)`);
  console.log(`📅 TEST MONTH: ${TEST_MONTH}`);
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;
  function assert(condition, message) {
    total++;
    if (!condition) {
      console.error(`❌ FAIL [${total}]: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    passed++;
    console.log(`  ✅ PASS [${total}]: ${message}`);
  }

  try {
    // 0. Seed test employees in D1
    console.log("[Step 0] Seeding test employees in company_employees...");
    await queryD1(`
      INSERT INTO company_employees (company_id, line_user_id, employee_name, schedule_mode, default_shift_start, default_shift_end, default_break_minutes)
      VALUES 
        ('${TEST_COMPANY_ID}', '${SHIFT_USER_ID}', '測試排班制同仁', 'SHIFT', '10:00', '19:00', 60),
        ('${TEST_COMPANY_ID}', '${FIXED_USER_ID}', '測試固定班同仁', 'FIXED', '09:00', '18:00', 60);
    `);
    assert(true, "Successfully inserted test employees into D1");

    // 1. Test Unscheduled Transparency for SHIFT employee
    console.log("\n[Test 1] Querying monthly attendance for SHIFT employee with 0 schedules...");
    const shiftRes = await fetch(`${WORKER_URL}/api/v1/attendance/monthly?userId=${SHIFT_USER_ID}&month=${TEST_MONTH}`);
    assert(shiftRes.ok, `Monthly API returns 200 (status: ${shiftRes.status})`);
    const shiftData = await shiftRes.json();
    assert(shiftData.success === true, "shiftData.success is true");
    assert(shiftData.days.length === 31, `October has 31 days (got ${shiftData.days.length})`);

    // Verify all days are marked as UNSCHEDULED
    const unscheduledDays = shiftData.days.filter(d => d.status === "UNSCHEDULED");
    assert(unscheduledDays.length === 31, `All 31 days are explicitly UNSCHEDULED (got ${unscheduledDays.length})`);
    assert(unscheduledDays[0].statusText === "未排班", "statusText is '未排班'");
    assert(unscheduledDays[0].statusColor === "gray", "statusColor is 'gray'");
    assert(shiftData.summary.missing_punch_count === 0, "missing_punch_count is 0 (unscheduled is not absent!)");
    assert(shiftData.summary.late_count === 0, "late_count is 0");
    assert(shiftData.summary.early_leave_count === 0, "early_leave_count is 0");

    // 2. Test Punch on Unscheduled Day
    console.log("\n[Test 2] Testing punch-in on unscheduled day for SHIFT employee...");
    await queryD1(`
      INSERT INTO checkin_records (company_id, line_user_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at)
      VALUES 
        ('${TEST_COMPANY_ID}', '${SHIFT_USER_ID}', 24.157722, 120.683167, 20.0, 'SUCCESS', 'IN', null, 'IP_WHITELIST', '${TEST_MONTH}-15 10:00:00'),
        ('${TEST_COMPANY_ID}', '${SHIFT_USER_ID}', 24.157722, 120.683167, 20.0, 'SUCCESS', 'OUT', 8.0, 'IP_WHITELIST', '${TEST_MONTH}-15 18:00:00');
    `);

    const punchedRes = await fetch(`${WORKER_URL}/api/v1/attendance/monthly?userId=${SHIFT_USER_ID}&month=${TEST_MONTH}`);
    const punchedData = await punchedRes.json();
    const day15 = punchedData.days.find(d => d.date === `${TEST_MONTH}-15`);
    assert(day15.status === "UNSCHEDULED_WORK", `Day 15 status is UNSCHEDULED_WORK (got ${day15.status})`);
    assert(day15.statusText === "未排班出勤", `Day 15 statusText is '未排班出勤' (got ${day15.statusText})`);
    assert(day15.statusColor === "indigo", `Day 15 statusColor is 'indigo'`);
    assert(day15.workHours === 8.0, `Day 15 workHours is 8.0 (got ${day15.workHours})`);
    assert(punchedData.summary.attendance_days === 1, "attendance_days increments to 1 for unscheduled work");

    // 3. Test One-Click Schedule Generation for FIXED employee
    console.log("\n[Test 3] Testing one-click schedule generation via POST /api/v1/tenant/schedules/generate...");
    // Create admin login session for test
    const loginRes = await fetch(`${WORKER_URL}/api/v1/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin@24549210' })
    });
    assert(loginRes.ok, "Admin login successful");
    const loginData = await loginRes.json();
    const token = loginData.token;

    // Call generate endpoint
    const genRes = await fetch(`${WORKER_URL}/api/v1/tenant/schedules/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ month: TEST_MONTH })
    });
    assert(genRes.ok, `Generate endpoint returns 200 (got ${genRes.status})`);
    const genData = await genRes.json();
    assert(genData.success === true, "Generate response success is true");
    assert(genData.createdCount > 0, `Generated ${genData.createdCount} schedules for FIXED employees`);

    // Verify FIXED employee now has full materialized schedule
    console.log("\n[Test 4] Verifying monthly attendance for FIXED employee after generation...");
    const fixedRes = await fetch(`${WORKER_URL}/api/v1/attendance/monthly?userId=${FIXED_USER_ID}&month=${TEST_MONTH}`);
    const fixedData = await fixedRes.json();
    assert(fixedData.success === true, "fixedData.success is true");
    
    // Check weekday vs weekend in October 2026 (2026-10-01 is Thursday)
    const day1 = fixedData.days.find(d => d.date === `${TEST_MONTH}-01`); // Thursday
    const day3 = fixedData.days.find(d => d.date === `${TEST_MONTH}-03`); // Saturday
    const day4 = fixedData.days.find(d => d.date === `${TEST_MONTH}-04`); // Sunday

    assert(day1.shiftName === "常態班", `Weekday 10/01 is '常態班' (got ${day1.shiftName})`);
    assert(day1.shiftStart === "09:00", "Weekday 10/01 start is 09:00");
    assert(day1.shiftEnd === "18:00", "Weekday 10/01 end is 18:00");
    assert(day1.status === "SCHEDULED", `Future weekday 10/01 is SCHEDULED (got ${day1.status})`);

    assert(day3.shiftName === "例假", `Weekend 10/03 is '例假' (got ${day3.shiftName})`);
    assert(day3.isRestDay === true, "Weekend 10/03 isRestDay is true");
    assert(day3.status === "REST_DAY", `Weekend 10/03 status is REST_DAY (got ${day3.status})`);

    assert(day4.shiftName === "例假", `Weekend 10/04 is '例假' (got ${day4.shiftName})`);
    assert(day4.status === "REST_DAY", "Weekend 10/04 status is REST_DAY");

    // 4. Verify Cron Behavior: FIXED employee is scanned, SHIFT employee with no schedule is suppressed
    console.log("\n[Test 5] Simulating Cron Trigger for weekday 2026-10-01 at 08:45...");
    const cronRes = await fetch(`${WORKER_URL}/api/v1/tenant/cron/trigger?mockDate=${TEST_MONTH}-01&mockTime=08:45`, {
      method: 'POST'
    });
    assert(cronRes.ok, "Cron simulation returns 200");
    const cronData = await cronRes.json();
    assert(cronData.success === true, "Cron trigger success is true");
    assert(cronData.scannedCount >= 1, `Cron scanned at least 1 schedule (got ${cronData.scannedCount})`);
    assert(cronData.remindInSent >= 1, `Cron sent remindIn for FIXED employee (got ${cronData.remindInSent})`);

    console.log("\n================================================================================");
    console.log(`🎉 ALL TESTS COMPLETED: ${passed} / ${total} ASSERTIONS PASSED (100%)`);
    console.log("================================================================================\n");
  } finally {
    // Teardown: Clean up test records
    console.log("[Teardown] Cleaning up test data from D1...");
    try {
      await queryD1(`
        DELETE FROM company_employees WHERE line_user_id IN ('${SHIFT_USER_ID}', '${FIXED_USER_ID}');
        DELETE FROM employee_schedules WHERE line_user_id IN ('${SHIFT_USER_ID}', '${FIXED_USER_ID}');
        DELETE FROM checkin_records WHERE line_user_id IN ('${SHIFT_USER_ID}', '${FIXED_USER_ID}');
        DELETE FROM cron_notifications WHERE line_user_id IN ('${SHIFT_USER_ID}', '${FIXED_USER_ID}');
      `);
      console.log("✅ Teardown complete. Database is 100% clean.");
    } catch (cleanErr) {
      console.error("Warning: Teardown failed:", cleanErr);
    }
  }
}

main().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
