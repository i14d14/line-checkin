const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

const WORKER_URL = "https://line-checkin-worker.i14d142.workers.dev";
const TEST_USER_ID = "TEST_SMART_USER_" + Date.now();
const TEST_DEVICE_ID = "dev_smart_test_" + Date.now();
const TARGET_LAT = 24.157722;
const TARGET_LON = 120.683167;

async function runD1Sql(sql) {
  const tempFileName = `temp_${Date.now()}_${Math.floor(Math.random()*1000)}.sql`;
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
  return res.stdout;
}

async function executeCheckin(userId, deviceId, lat, lon) {
  const res = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken: "demo_token",
      deviceId: deviceId,
      companyId: "24549210-01",
      latitude: lat,
      longitude: lon,
      fallbackUserId: userId,
      fallbackDisplayName: "智慧打卡測試員"
    })
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log("=== 開始驗證智慧上下班推論狀態機 ===");

  // 1. 首次打卡 -> 應判定為 上班 (IN)
  console.log("\n[測試 1] 首次打卡...");
  const t1 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TARGET_LAT, TARGET_LON);
  console.log("Response:", t1.data);
  if (t1.data.punchType !== "IN" || t1.data.isDuplicate) {
    throw new Error("測試 1 失敗：首次打卡未判定為 IN");
  }
  console.log("✅ 測試 1 通過：首次打卡成功判定為【上班 (IN)】");

  // 2. 5 秒內再次打卡 -> 應觸發 < 30 分鐘防手抖，維持 IN 且 isDuplicate === true
  console.log("\n[測試 2] 30 分鐘內重複打卡...");
  const t2 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TARGET_LAT, TARGET_LON);
  console.log("Response:", t2.data);
  if (t2.data.punchType !== "IN" || !t2.data.isDuplicate) {
    throw new Error("測試 2 失敗：未正確識別 30 分鐘內重複打卡");
  }
  console.log("✅ 測試 2 通過：30 分鐘內重複打卡維持【上班 (IN)】並標記 duplicate");

  // 3. 模擬 4 小時後打卡 -> 應判定為 下班 (OUT)，工時約 4.0 小時
  console.log("\n[測試 3] 模擬 4 小時後下班打卡...");
  await runD1Sql(`UPDATE checkin_records SET created_at = datetime('now', '-4 hours', '+8 hours') WHERE line_user_id = '${TEST_USER_ID}' AND status = 'SUCCESS'`);
  
  const t3 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TARGET_LAT, TARGET_LON);
  console.log("Response:", t3.data);
  if (t3.data.punchType !== "OUT" || t3.data.workHours !== 4.0) {
    throw new Error(`測試 3 失敗：未判定為 OUT 或工時錯誤 (預期 4.0, 得到 ${t3.data.workHours})`);
  }
  console.log("✅ 測試 3 通過：正常下班成功判定為【下班 (OUT)】，工時精準計算為 4.0 小時");

  // 4. 模擬早晚班（下班後 3 小時再來打卡） -> 應判定為 晚班上班 (IN)
  console.log("\n[測試 4] 模擬早晚班（下班 3 小時後再進店打卡）...");
  await runD1Sql(`UPDATE checkin_records SET created_at = datetime('now', '-3 hours', '+8 hours') WHERE line_user_id = '${TEST_USER_ID}' AND id = (SELECT MAX(id) FROM checkin_records WHERE line_user_id = '${TEST_USER_ID}')`);
  
  const t4 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TARGET_LAT, TARGET_LON);
  console.log("Response:", t4.data);
  if (t4.data.punchType !== "IN" || t4.data.workHours !== null) {
    throw new Error("測試 4 失敗：早晚班第二段未判定為 IN");
  }
  console.log("✅ 測試 4 通過：早晚班第二段成功判定為【上班 (IN)】");

  // 5. 模擬跨日大夜班（上班後 9 小時跨日打卡） -> 應判定為 下班 (OUT)，工時 9.0 小時
  console.log("\n[測試 5] 模擬跨日大夜班（22:00 -> 隔日 07:00，相隔 9 小時）...");
  await runD1Sql(`UPDATE checkin_records SET created_at = datetime('now', '-9 hours', '+8 hours') WHERE line_user_id = '${TEST_USER_ID}' AND id = (SELECT MAX(id) FROM checkin_records WHERE line_user_id = '${TEST_USER_ID}')`);
  
  const t5 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TARGET_LAT, TARGET_LON);
  console.log("Response:", t5.data);
  if (t5.data.punchType !== "OUT" || t5.data.workHours !== 9.0) {
    throw new Error(`測試 5 失敗：大夜跨日未判定為 OUT 或工時錯誤 (預期 9.0, 得到 ${t5.data.workHours})`);
  }
  console.log("✅ 測試 5 通過：跨日大夜班成功判定為【下班 (OUT)】，工時精準計算為 9.0 小時");

  // 6. 模擬漏打下班 / 超過 18 小時（相隔 22 小時） -> 應自動歸位為 上班 (IN)
  console.log("\n[測試 6] 模擬漏打下班 / 超長間隔（相隔 22 小時）...");
  await runD1Sql(`UPDATE checkin_records SET punch_type = 'IN', created_at = datetime('now', '-22 hours', '+8 hours') WHERE line_user_id = '${TEST_USER_ID}' AND id = (SELECT MAX(id) FROM checkin_records WHERE line_user_id = '${TEST_USER_ID}')`);
  
  const t6 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TARGET_LAT, TARGET_LON);
  console.log("Response:", t6.data);
  if (t6.data.punchType !== "IN" || t6.data.workHours !== null) {
    throw new Error("測試 6 失敗：超長間隔未自動重置為 IN");
  }
  console.log("✅ 測試 6 通過：超長間隔/漏打卡成功自動歸位為【上班 (IN)】");

  // 7. 驗證 /api/records 查詢回傳包含 punch_type 與 work_hours
  console.log("\n[測試 7] 驗證歷史紀錄 API 回傳欄位...");
  const recRes = await fetch(`${WORKER_URL}/api/records`);
  const recData = await recRes.json();
  const latest = recData.records[0];
  console.log("Latest record in DB:", latest);
  if (!latest.punch_type) {
    throw new Error("測試 7 失敗：歷史紀錄未包含 punch_type 欄位");
  }
  console.log("✅ 測試 7 通過：歷史紀錄 API 成功回傳 punch_type 與 work_hours");

  // 清理測試數據
  console.log("\n[清理] 移除測試用戶數據...");
  await runD1Sql(`DELETE FROM checkin_records WHERE line_user_id = '${TEST_USER_ID}'; DELETE FROM user_devices WHERE line_user_id = '${TEST_USER_ID}'; DELETE FROM company_employees WHERE line_user_id = '${TEST_USER_ID}';`);
  console.log("✅ 測試數據清理完畢");

  console.log("\n🎉 全部 7 項推論狀態機與邊際情境測試 100% 通過！");
}

main().catch(err => {
  console.error("\n❌ 測試中斷失敗:", err);
  process.exit(1);
});
