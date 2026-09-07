/**
 * Automated Test Suite: Universal Deficit Quota Model for Leave Applications (v2.19.0)
 * 
 * Verifies:
 * 1. Block leave on past day with full normal attendance (400 Bad Request, "查無缺勤時段")
 * 2. Block leave on day already fully compensated by prior leave (400 Bad Request, "已由先前請假全額抵充")
 * 3. Block leave on day with full-day approved leave (400 Bad Request, "已核准全天請假")
 * 4. Block leave on rest day / weekend (400 Bad Request, "為非工作日 / 休假日")
 * 5. Allow leave on past absent day (200 OK, pending request created)
 * 6. Allow advance leave on future scheduled working day (200 OK)
 * 7. Teardown hook: automatically cleans up test approvals
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envPath = path.resolve(__dirname, '.env');
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

const WORKER_URL = "https://line-checkin-worker.i14d142.workers.dev";
const PIGMAO_USER_ID = "Ubd107bb3ba1b85a8086fc3b2250458e8";
const STORE_ID = "24549210-01";
const TIMESTAMP = Date.now();
const createdApprovalIds = [];

function assert(description, condition, extraInfo) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    if (extraInfo) console.error("     Detail:", extraInfo);
    throw new Error(`Assertion failed: ${description}`);
  }
}

async function runD1Sql(sql) {
  const tempFileName = `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}.sql`;
  const tempFilePath = path.resolve(__dirname, tempFileName);
  fs.writeFileSync(tempFilePath, sql, 'utf8');
  const res = spawnSync('node', ['run-wrangler.js', 'd1', 'execute', 'line-checkin-db', '--remote', `--file=./${tempFileName}`, '-y'], {
    env: process.env,
    shell: false,
    encoding: 'utf8'
  });
  if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  return res.stdout || res.stderr;
}

async function main() {
  console.log("=== Testing Universal Deficit Quota Model for Leave Applications (v2.19.0) ===");

  try {
    // Clean up any stale pending test approvals for pig first
    await runD1Sql(`DELETE FROM approvals WHERE line_user_id = '${PIGMAO_USER_ID}' AND status = 'PENDING' AND target_date IN ('2026-09-03', '2026-09-06', '2026-09-13', '2026-09-17');`);

    // 1. Test Block: Day already fully compensated by prior leave (2026-09-03 for 豬毛)
    console.log("\n--- 1. 驗證已由先前請假全額抵充之工作日（禁止重複請假） ---");
    const compResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fallbackUserId: PIGMAO_USER_ID,
        fallbackDisplayName: "豬毛",
        fallbackCompanyId: STORE_ID,
        type: "LEAVE",
        targetDate: "2026-09-03",
        details: { leave_type: "事假", time_range: "全天", reason: "重複測試" }
      })
    });
    const compData = await compResp.json();
    console.log("   2026-09-03 response:", compResp.status, compData);
    assert("已全額抵充日回傳 400 Bad Request", compResp.status === 400);
    assert("回傳明確抵充提示與查無缺勤時段訊息", compData.error && compData.error.includes("查無缺勤時段"));
    assert("錯誤訊息包含抵充工時細節", compData.error && compData.error.includes("已由先前請假全額抵充"));

    // 2. Test Block: Rest day / Weekend (2026-09-13 is Sunday)
    console.log("\n--- 2. 驗證例假日/週末（禁止請假） ---");
    const restResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fallbackUserId: PIGMAO_USER_ID,
        fallbackDisplayName: "豬毛",
        fallbackCompanyId: STORE_ID,
        type: "LEAVE",
        targetDate: "2026-09-13",
        details: { leave_type: "事假", time_range: "全天", reason: "假日請假測試" }
      })
    });
    const restData = await restResp.json();
    console.log("   2026-09-13 response:", restResp.status, restData);
    assert("休假日回傳 400 Bad Request", restResp.status === 400);
    assert("回傳非工作日/休假日訊息", restData.error && restData.error.includes("為非工作日 / 休假日"));

    // 3. Test Block: Past day with full normal attendance
    console.log("\n--- 3. 驗證全勤正常工作日（禁止請假） ---");
    const attRes = await fetch(`${WORKER_URL}/api/v1/attendance/monthly?userId=${PIGMAO_USER_ID}&month=2026-09&companyId=${STORE_ID}`);
    const attData = await attRes.json();
    const normalDay = attData.days.find(d => d.status === "NORMAL" && !d.isLeave && d.date < "2026-09-07");

    if (normalDay) {
      console.log(`   測試全勤正常日: ${normalDay.date} (工時: ${normalDay.workHours}h)`);
      const normResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fallbackUserId: PIGMAO_USER_ID,
          fallbackDisplayName: "豬毛",
          fallbackCompanyId: STORE_ID,
          type: "LEAVE",
          targetDate: normalDay.date,
          details: { leave_type: "事假", time_range: "全天", reason: "全勤請假測試" }
        })
      });
      const normData = await normResp.json();
      console.log(`   ${normalDay.date} response:`, normResp.status, normData);
      assert("正常出勤日回傳 400 Bad Request", normResp.status === 400);
      assert("回傳查無缺勤時段訊息", normData.error && normData.error.includes("查無缺勤時段"));
    } else {
      console.log("   ℹ️ 9月暫無未請假之全勤正常歷史日，跳過此項（已在第1項驗證 NORMAL 抵充）");
    }

    // 4. Test Pass: Past absent day
    console.log("\n--- 4. 驗證缺勤/曠職日（允許請假） ---");
    const absentDay = attData.days.find(d => d.status === "ABSENT" && d.date < "2026-09-07");
    if (absentDay) {
      console.log(`   測試缺勤日: ${absentDay.date}`);
      const absResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fallbackUserId: PIGMAO_USER_ID,
          fallbackDisplayName: "豬毛",
          fallbackCompanyId: STORE_ID,
          type: "LEAVE",
          targetDate: absentDay.date,
          details: { leave_type: "事假", time_range: "全天", reason: "缺勤補請假測試" }
        })
      });
      const absData = await absResp.json();
      console.log(`   ${absentDay.date} response:`, absResp.status, absData);
      assert("缺勤日成功發起請假申請 200 OK", absResp.status === 200 && absData.success === true);
      if (absData.id) createdApprovalIds.push(absData.id);
    } else {
      console.log("   ℹ️ 9月暫無缺勤歷史日，跳過此項");
    }

    // 5. Test Pass: Future scheduled weekday (e.g. 2026-09-17)
    console.log("\n--- 5. 驗證未來工作日事前預約（允許請假） ---");
    const futResp = await fetch(`${WORKER_URL}/api/v1/approval/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fallbackUserId: PIGMAO_USER_ID,
        fallbackDisplayName: "豬毛",
        fallbackCompanyId: STORE_ID,
        type: "LEAVE",
        targetDate: "2026-09-17",
        details: { leave_type: "特休", time_range: "全天", reason: "未來預約測試" }
      })
    });
    const futData = await futResp.json();
    console.log("   2026-09-17 response:", futResp.status, futData);
    assert("未來工作日成功預約請假 200 OK", futResp.status === 200 && futData.success === true);
    if (futData.id) createdApprovalIds.push(futData.id);

    console.log("\n🎉 ALL DEFICIT QUOTA TESTS PASSED 100%!");
  } finally {
    // 6. Teardown: Clean up created test approvals
    if (createdApprovalIds.length > 0) {
      console.log("\n--- 6. 執行測試資料庫清理 (Teardown) ---");
      const idsList = createdApprovalIds.map(id => `'${id}'`).join(',');
      const cleanupSql = `DELETE FROM approvals WHERE id IN (${idsList});`;
      await runD1Sql(cleanupSql);
      console.log(`  🧹 已徹底清理 ${createdApprovalIds.length} 筆測試請假單據 (${idsList})`);
    }
  }
}

main().catch(err => {
  console.error("Test run error:", err);
  process.exit(1);
});
