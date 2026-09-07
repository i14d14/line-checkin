const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKER_URL = "https://line-checkin-worker.i14d142.workers.dev";
const TEST_TIMESTAMP = Date.now();
const TEST_USER_ID = `TEST_CRON_USER_${TEST_TIMESTAMP}`;
const TEST_COMPANY_ID = "24549210-01";

// 取得台灣時間當前日期
const now = new Date();
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
const TEST_DATE = formatter.format(now);

async function runD1Sql(sql) {
  const tempFileName = `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}.sql`;
  const tempFilePath = path.resolve(__dirname, tempFileName);
  fs.writeFileSync(tempFilePath, sql, 'utf8');
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const res = spawnSync(cmd, ['wrangler', 'd1', 'execute', 'line-checkin-db', '--remote', `--file=./${tempFileName}`, '-y', '--json'], {
    env: process.env,
    shell: true,
    cwd: __dirname,
    encoding: 'utf8'
  });
  if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  if (res.status !== 0) {
    console.error("D1 SQL Execution failed:", res.stderr || res.stdout);
  }
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    return res.stdout;
  }
}

async function triggerCron(mockDate, mockTime) {
  const res = await fetch(`${WORKER_URL}/api/v1/tenant/cron/trigger?mockDate=${mockDate}&mockTime=${mockTime}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Cron trigger failed with HTTP ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

async function punchIn(userId) {
  const res = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken: "demo_token",
      deviceId: `dev_${userId}`,
      companyId: TEST_COMPANY_ID,
      latitude: 24.157722,
      longitude: 120.683167,
      fallbackUserId: userId,
      fallbackDisplayName: "定時提醒測試同仁"
    })
  });
  return await res.json();
}

async function main() {
  console.log("==================================================================");
  console.log("🚀 開始執行 Cloudflare Cron Triggers 上下班防漏打卡推播整合測試");
  console.log(`測試使用者: ${TEST_USER_ID}, 測試日期: ${TEST_DATE}`);
  console.log("==================================================================");

  try {
    // 0. 初始化種子資料：員工排班 (09:00 ~ 18:00)
    console.log("\n[Step 0] 建立測試員工排班 (09:00 - 18:00)...");
    await runD1Sql(`
      INSERT OR REPLACE INTO company_employees (company_id, line_user_id, employee_name) 
      VALUES ('${TEST_COMPANY_ID}', '${TEST_USER_ID}', '定時提醒測試員');
      
      INSERT OR REPLACE INTO employee_schedules (company_id, line_user_id, work_date, shift_name, shift_start, shift_end, is_rest_day) 
      VALUES ('${TEST_COMPANY_ID}', '${TEST_USER_ID}', '${TEST_DATE}', '常態班', '09:00', '18:00', 0);
      
      DELETE FROM cron_notifications WHERE line_user_id = '${TEST_USER_ID}';
      DELETE FROM checkin_records WHERE line_user_id = '${TEST_USER_ID}';
    `);

    // 1. 情境一：上班前 15 分鐘未打卡 -> 觸發上班打卡提醒
    console.log("\n[Test 1] 模擬 08:45 (上班前 15 分鐘)，同仁尚未打卡...");
    const res1 = await triggerCron(TEST_DATE, "08:45");
    console.log("Cron 執行結果:", JSON.stringify(res1));
    if (res1.remindInSent < 1) {
      throw new Error(`❌ 測試 1 失敗: 預期 remindInSent >= 1，但得到 ${res1.remindInSent}`);
    }
    console.log("✅ [Test 1 PASS] 成功觸發上班打卡提醒！");

    // 2. 情境二：冪等性驗證 -> 再次觸發不重複推播
    console.log("\n[Test 2] 模擬 08:48 (上班前 12 分鐘)，同仁尚未打卡，但已推播過...");
    const res2 = await triggerCron(TEST_DATE, "08:48");
    console.log("Cron 執行結果:", JSON.stringify(res2));
    if (res2.remindInSent !== 0 || res2.skippedCount < 1) {
      throw new Error(`❌ 測試 2 失敗: 預期 remindInSent === 0 且 skippedCount >= 1，但得到 remindInSent=${res2.remindInSent}, skipped=${res2.skippedCount}`);
    }
    console.log("✅ [Test 2 PASS] 冪等性防重複防線生效，未重複推播！");

    // 3. 情境三：若同仁已打上班卡 -> 提醒自動抑制
    console.log("\n[Test 3] 模擬同仁完成上班打卡...");
    const punchInRes = await punchIn(TEST_USER_ID);
    console.log("打卡回應:", JSON.stringify(punchInRes));
    if (!punchInRes.success || punchInRes.punchType !== "IN") {
      throw new Error(`❌ 測試 3 前置打卡失敗: success=${punchInRes.success}, punchType=${punchInRes.punchType}`);
    }

    // 清除 REMIND_IN 記錄以驗證若是已打上班卡是否會抑制推播
    await runD1Sql(`DELETE FROM cron_notifications WHERE line_user_id = '${TEST_USER_ID}' AND type = 'REMIND_IN';`);
    const res3 = await triggerCron(TEST_DATE, "08:49");
    console.log("清除通知紀錄後但已有上班打卡流水，Cron 執行結果:", JSON.stringify(res3));
    if (res3.remindInSent !== 0) {
      throw new Error(`❌ 測試 3 失敗: 同仁已打上班卡，不應再發送上班提醒！remindInSent=${res3.remindInSent}`);
    }
    console.log("✅ [Test 3 PASS] 已打卡同仁成功自動抑制上班提醒！");

    // 4. 情境四：下班後 10 分鐘未打下班卡 -> 觸發下班防漏提醒
    console.log("\n[Test 4] 模擬 18:12 (下班後 12 分鐘)，同仁已上班但尚未打下班卡...");
    const res4 = await triggerCron(TEST_DATE, "18:12");
    console.log("Cron 執行結果:", JSON.stringify(res4));
    if (res4.remindOutSent < 1) {
      throw new Error(`❌ 測試 4 失敗: 預期 remindOutSent >= 1，但得到 ${res4.remindOutSent}`);
    }
    console.log("✅ [Test 4 PASS] 成功觸發下班防漏打卡提醒！");

    // 5. 情境五：同仁打下班卡後 -> 下班提醒自動抑制
    console.log("\n[Test 5] 模擬同仁完成下班打卡...");
    // 為了避免 30 分鐘防重複，手動插入下班流水
    await runD1Sql(`
      INSERT INTO checkin_records (company_id, line_user_id, display_name, latitude, longitude, distance_meters, status, punch_type, verify_mode, created_at)
      VALUES ('${TEST_COMPANY_ID}', '${TEST_USER_ID}', '定時提醒測試員', 24.157722, 120.683167, 10, 'SUCCESS', 'OUT', 'GPS_ONLY', '${TEST_DATE} 18:15:00');
      DELETE FROM cron_notifications WHERE line_user_id = '${TEST_USER_ID}' AND type = 'REMIND_OUT';
    `);
    const res5 = await triggerCron(TEST_DATE, "18:16");
    console.log("同仁已打下班卡，Cron 執行結果:", JSON.stringify(res5));
    if (res5.remindOutSent !== 0) {
      throw new Error(`❌ 測試 5 失敗: 同仁已打下班卡，不應再發送下班提醒！remindOutSent=${res5.remindOutSent}`);
    }
    console.log("✅ [Test 5 PASS] 已打下班卡同仁成功自動抑制下班提醒！");

    console.log("\n==================================================================");
    console.log("🎉 ALL 5 TEST SCENARIOS PASSED! 100% 驗證通過！");
    console.log("==================================================================");

  } finally {
    // 清理測試資料
    console.log("\n[Cleanup] 清理測試員工資料庫紀錄...");
    await runD1Sql(`
      DELETE FROM employee_schedules WHERE line_user_id = '${TEST_USER_ID}';
      DELETE FROM checkin_records WHERE line_user_id = '${TEST_USER_ID}';
      DELETE FROM cron_notifications WHERE line_user_id = '${TEST_USER_ID}';
      DELETE FROM company_employees WHERE line_user_id = '${TEST_USER_ID}';
    `);
    console.log("[Cleanup] 清理完畢！");
  }
}

main().catch((err) => {
  console.error("測試執行異常:", err);
  process.exit(1);
});
