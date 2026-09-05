/**
 * Comprehensive Automated Test & Seeder: Attendance Calendar & Work Hours Summary
 * Generates 30-day realistic shift schedules and actual punch records for 豬毛 (Ubd107bb3ba1b85a8086fc3b2250458e8),
 * and verifies Attendance Auditor Engine, Schedule APIs, and Monthly Summary stats.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";
const PIGMAO_USER_ID = "Ubd107bb3ba1b85a8086fc3b2250458e8";
const COMPANY_ID = "24549210-01";
const TAX_ID = "24549210";

// Read env for D1 execution
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

function runD1Sql(sql) {
  const tempFile = path.resolve(__dirname, 'seed_temp.sql');
  fs.writeFileSync(tempFile, sql, 'utf8');
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'npx.cmd' : 'npx';
  const res = spawnSync(cmd, ['wrangler', 'd1', 'execute', 'line-checkin-db', '--remote', '--file', 'seed_temp.sql'], {
    cwd: __dirname,
    env: process.env,
    encoding: 'utf8',
    shell: true
  });
  if (fs.existsSync(tempFile)) {
    fs.unlinkSync(tempFile);
  }
  if (res.status !== 0) {
    console.error("D1 SQL Error:", res.stderr || res.stdout);
  }
  return res.stdout;
}

async function runTest() {
  console.log("================================================================================");
  console.log("🚀 STARTING AUTOMATED TEST: ATTENDANCE CALENDAR, SHIFTS & WORK HOURS AUDITING");
  console.log(`🌐 TARGET WORKER: ${BASE_URL}`);
  console.log(`👤 TARGET USER: 豬毛 (${PIGMAO_USER_ID}) @ 據點: ${COMPANY_ID}`);
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(title, condition, extra = "") {
    if (condition) {
      console.log(`  ✅ [PASS] ${title} ${extra ? `(${extra})` : ""}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title} ${extra ? `(${extra})` : ""}`);
      failed++;
    }
  }

  // 1. Issue Tenant Admin API Key for 24549210
  console.log("--- 1. 取得企業租戶 ADMIN 金鑰 ---");
  const keyResp = await fetch(`${BASE_URL}/api/v1/tenant/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_id: TAX_ID, name: "出勤月曆自動化測試", role: "ADMIN" })
  });
  const keyData = await keyResp.json();
  const apiKey = keyData.apiKey;
  assert("簽發 ADMIN 金鑰成功", keyResp.status === 200 && !!apiKey);

  // 2. Test Schedule Template Download
  console.log("\n--- 2. 下載排班 CSV 範本端點測試 ---");
  const tplResp = await fetch(`${BASE_URL}/api/v1/tenant/schedules/template?apiKey=${apiKey}`);
  const tplText = await tplResp.text();
  assert("下載排班 CSV 範本 200 OK", tplResp.status === 200);
  assert("CSV 範本包含 UTF-8 BOM 與正確欄位標頭", tplText.includes("員工LINE_ID,員工姓名,排班日期(YYYY-MM-DD),班別名稱,預計上班(HH:MM),預計下班(HH:MM),休息分鐘,是否休假(0或1)"));

  // 3. Generate 30-day Shift Schedules (2026-08-01 ~ 2026-08-31)
  console.log("\n--- 3. 建立 2026-08 整月 31 天排班資料 ---");
  const mockSchedules = [];
  const totalDays = 31;

  for (let d = 1; d <= totalDays; d++) {
    const dStr = `2026-08-${d.toString().padStart(2, "0")}`;
    const dateObj = new Date(2026, 7, d);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

    if (isWeekend) {
      mockSchedules.push({
        line_user_id: PIGMAO_USER_ID,
        work_date: dStr,
        shift_name: "例假",
        shift_start: null,
        shift_end: null,
        break_minutes: 0,
        is_rest_day: 1,
        is_cross_day: 0
      });
    } else if (d === 19) {
      // 8/19 晚班
      mockSchedules.push({
        line_user_id: PIGMAO_USER_ID,
        work_date: dStr,
        shift_name: "晚班",
        shift_start: "13:00",
        shift_end: "22:00",
        break_minutes: 60,
        is_rest_day: 0,
        is_cross_day: 0
      });
    } else if (d === 25) {
      // 8/25 大夜班
      mockSchedules.push({
        line_user_id: PIGMAO_USER_ID,
        work_date: dStr,
        shift_name: "大夜班",
        shift_start: "22:00",
        shift_end: "07:00",
        break_minutes: 60,
        is_rest_day: 0,
        is_cross_day: 1
      });
    } else {
      // 常態班 09:00 - 18:00
      mockSchedules.push({
        line_user_id: PIGMAO_USER_ID,
        work_date: dStr,
        shift_name: "常態班",
        shift_start: "09:00",
        shift_end: "18:00",
        break_minutes: 60,
        is_rest_day: 0,
        is_cross_day: 0
      });
    }
  }

  const batchSchedResp = await fetch(`${BASE_URL}/api/v1/tenant/schedules/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-Key": apiKey },
    body: JSON.stringify({ schedules: mockSchedules })
  });
  const batchSchedData = await batchSchedResp.json();
  assert("批量匯入 31 筆排班資料成功", batchSchedResp.status === 200 && batchSchedData.insertedCount === 31);

  // 4. Query Shift Schedules
  console.log("\n--- 4. 查詢企業排班資料 ---");
  const querySchedResp = await fetch(`${BASE_URL}/api/v1/tenant/schedules?month=2026-08&userId=${PIGMAO_USER_ID}`, {
    headers: { "X-Tenant-Key": apiKey }
  });
  const querySchedData = await querySchedResp.json();
  assert("查詢 2026-08 班表成功", querySchedResp.status === 200 && querySchedData.count === 31);

  // 5. Seed 30-Day Check-in Records (Mock Punches)
  console.log("\n--- 5. 植入 2026-08 擬真打卡情境數據 (涵蓋正常/遲到/早退/缺卡/加班/休假) ---");
  
  // Clean previous records for 2026-08
  runD1Sql(`DELETE FROM checkin_records WHERE line_user_id = '${PIGMAO_USER_ID}' AND created_at LIKE '2026-08%';`);

  const mockPunchesSql = [];
  
  // Scenarios:
  // 1. Normal Days (16 working days): IN @ 08:55, OUT @ 18:05, work_hours = 8.0
  const normalDays = [3, 5, 6, 7, 10, 12, 13, 17, 19, 20, 24, 25, 26, 28, 31];
  for (const d of normalDays) {
    const dStr = `2026-08-${d.toString().padStart(2, "0")}`;
    if (d === 19) {
      // 晚班 13:00 - 22:00
      mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'IN', NULL, 'IP_WHITELIST', '${dStr} 12:55:00');`);
      mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'OUT', 8.0, 'IP_WHITELIST', '${dStr} 22:05:00');`);
    } else {
      mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'IN', NULL, 'IP_WHITELIST', '${dStr} 08:55:00');`);
      mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'OUT', 8.0, 'IP_WHITELIST', '${dStr} 18:05:00');`);
    }
  }

  // 2. Late Day: 2026-08-04 (09:25 IN [25m late], 18:10 OUT, 7.5h)
  mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'IN', NULL, 'IP_WHITELIST', '2026-08-04 09:25:00');`);
  mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'OUT', 7.5, 'IP_WHITELIST', '2026-08-04 18:10:00');`);

  // 3. Early Leave Day: 2026-08-11 (08:50 IN, 17:15 OUT [45m early], 7.0h)
  mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'IN', NULL, 'IP_WHITELIST', '2026-08-11 08:50:00');`);
  mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'OUT', 7.0, 'IP_WHITELIST', '2026-08-11 17:15:00');`);

  // 4. Late + Early Leave Day: 2026-08-14 (09:18 IN [18m late], 17:30 OUT [30m early], 7.0h)
  mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'IN', NULL, 'IP_WHITELIST', '2026-08-14 09:18:00');`);
  mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'OUT', 7.0, 'IP_WHITELIST', '2026-08-14 17:30:00');`);

  // 5. Rest Day Overtime: 2026-08-15 (Saturday, 10:00 IN, 16:00 OUT, 6.0h OT)
  mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'IN', NULL, 'IP_WHITELIST', '2026-08-15 10:00:00');`);
  mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'OUT', 6.0, 'IP_WHITELIST', '2026-08-15 16:00:00');`);

  // 6. Missing OUT Day: 2026-08-18 (08:55 IN, no OUT)
  mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'IN', NULL, 'IP_WHITELIST', '2026-08-18 08:55:00');`);

  // 7. Missing IN Day: 2026-08-21 (no IN, 18:05 OUT)
  mockPunchesSql.push(`INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at) VALUES ('${COMPANY_ID}', '${PIGMAO_USER_ID}', '🐖毛', 'dev_mock', 24.157722, 120.683167, 10, 'SUCCESS', 'OUT', NULL, 'IP_WHITELIST', '2026-08-21 18:05:00');`);

  // 8. Absent Day: 2026-08-27 (Thursday, working day, zero punches) -> no SQL inserted

  // Execute SQL in D1
  runD1Sql(mockPunchesSql.join("\n"));
  console.log("  ✅ 已成功植入 2026-08 打卡情境數據");

  // 6. Call Attendance Auditor Monthly API
  console.log("\n--- 6. 呼叫出勤月曆與工時統計 API (/api/v1/attendance/monthly) ---");
  const monthResp = await fetch(`${BASE_URL}/api/v1/attendance/monthly?userId=${PIGMAO_USER_ID}&month=2026-08`);
  const monthData = await monthResp.json();
  assert("出勤月曆 API 回傳 200 OK", monthResp.status === 200 && monthData.success);
  assert("包含 31 天完整每日稽核結果", monthData.days?.length === 31);

  // 7. Verify Day-level Auditing States
  console.log("\n--- 7. 驗證各邊際情境之稽核比對精準度 ---");
  const dNormal = monthData.days.find(d => d.date === "2026-08-03");
  assert("2026-08-03 (正常上班 08:55, 下班 18:05) 判定為 NORMAL (8.0h)", dNormal.status === "NORMAL" && dNormal.workHours === 8.0);

  const dLate = monthData.days.find(d => d.date === "2026-08-04");
  assert("2026-08-04 (09:25 上班) 精準判定為 LATE 遲到 25 分鐘", dLate.status === "LATE" && dLate.lateMinutes === 25);

  const dEarly = monthData.days.find(d => d.date === "2026-08-11");
  assert("2026-08-11 (17:15 下班) 精準判定為 EARLY_LEAVE 早退 45 分鐘", dEarly.status === "EARLY_LEAVE" && dEarly.earlyLeaveMinutes === 45);

  const dLateEarly = monthData.days.find(d => d.date === "2026-08-14");
  assert("2026-08-14 (09:18 上班, 17:30 下班) 判定為 LATE_AND_EARLY (遲到18分+早退30分)", dLateEarly.status === "LATE_AND_EARLY" && dLateEarly.lateMinutes === 18 && dLateEarly.earlyLeaveMinutes === 30);

  const dOvertime = monthData.days.find(d => d.date === "2026-08-15");
  assert("2026-08-15 (週六例假出勤) 判定為 OVERTIME 假日加班 6.0h", dOvertime.status === "OVERTIME" && dOvertime.overtimeHours === 6.0);

  const dMissingOut = monthData.days.find(d => d.date === "2026-08-18");
  assert("2026-08-18 (有上班無下班) 精準判定為 MISSING_OUT 下班缺卡", dMissingOut.status === "MISSING_OUT");

  const dMissingIn = monthData.days.find(d => d.date === "2026-08-21");
  assert("2026-08-21 (無上班有下班) 精準判定為 MISSING_IN 上班缺卡", dMissingIn.status === "MISSING_IN");

  const dAbsent = monthData.days.find(d => d.date === "2026-08-27");
  assert("2026-08-27 (排班常態班但全天未打卡) 精準判定為 ABSENT 曠職/未出勤", dAbsent.status === "ABSENT");

  const dRest = monthData.days.find(d => d.date === "2026-08-02");
  assert("2026-08-02 (週日例假無打卡) 判定為 REST_DAY 正常休假", dRest.status === "REST_DAY" && dRest.isRestDay === true);

  // 8. Verify Monthly Summary Statistics
  console.log("\n--- 8. 驗證當月匯總指標統計 ---");
  const summary = monthData.summary;
  console.log("Summary Result:", summary);
  assert("本月總出勤工時統計正確 (>= 140h)", summary.total_work_hours >= 140);
  assert("遲到次數精準統計 (2 次：8/4, 8/14)", summary.late_count === 2);
  assert("早退次數精準統計 (2 次：8/11, 8/14)", summary.early_leave_count === 2);
  assert("異常缺卡與未出勤次數精準統計 (3 次：8/18, 8/21, 8/27)", summary.missing_punch_count === 3);
  assert("假日加班工時精準統計 (6.0h)", summary.overtime_hours === 6.0);

  console.log("\n================================================================================");
  console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED.`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
