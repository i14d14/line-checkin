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
const TEST_USER_ID = "CORP_ISOLATION_USER_" + Date.now();
const TEST_DEVICE_ID = "dev_corp_test_" + Date.now();

// 座標定義
const TC_LAT = 24.157722, TC_LON = 120.683167; // 豬毛科技 台中美德總部
const TP_LAT = 25.033976, TP_LON = 121.564538; // 豬毛科技 台北101門市
const KH_LAT = 22.627278, KH_LON = 120.301435; // 統一超商 高雄旗艦店 (他社據點)

async function runD1Sql(sql) {
  const tempFileName = `temp_${Date.now()}_${Math.floor(Math.random()*1000)}.sql`;
  const tempFilePath = path.resolve(__dirname, tempFileName);
  fs.writeFileSync(tempFilePath, sql, 'utf8');
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const res = spawnSync(cmd, ['wrangler', 'd1', 'execute', 'line-checkin-db', '--remote', `--file=./${tempFileName}`, '-y'], {
    env: process.env,
    shell: true,
    cwd: __dirname,
    encoding: 'utf8'
  });
  if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  return res.stdout;
}

async function executeCheckin(userId, deviceId, lat, lon, companyId) {
  const payload = {
    idToken: "demo_token",
    deviceId: deviceId,
    latitude: lat,
    longitude: lon,
    fallbackUserId: userId,
    fallbackDisplayName: "多租戶員工"
  };
  if (companyId) payload.companyId = companyId;

  const res = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log("=== 開始驗證多租戶企業據點資料隔離 (Company Multi-Tenant Isolation) ===");

  // 0. 初始化確保測試據點存在
  await runD1Sql(`
    INSERT INTO locations (id, name, address, target_lat, target_lon, allowed_radius)
    VALUES ('24549210-01', '豬毛有限公司 - 台中美德總部', '台中市北區美德街56-11號', ${TC_LAT}, ${TC_LON}, 100)
    ON CONFLICT(id) DO UPDATE SET target_lat = excluded.target_lat, target_lon = excluded.target_lon, name = excluded.name;
    INSERT INTO locations (id, name, address, target_lat, target_lon, allowed_radius)
    VALUES ('24549210-02', '豬毛科技 - 台北101門市', '台北市信義區信義路五段7號', ${TP_LAT}, ${TP_LON}, 100)
    ON CONFLICT(id) DO UPDATE SET target_lat = excluded.target_lat, target_lon = excluded.target_lon, name = excluded.name;
  `);

  // 1. 未註冊且未帶 QR Code 參數之訪客嘗試打卡 -> 應被拒絕
  console.log("\n[測試 1] 未註冊且未帶公司 QR Code 嘗試打卡 (應被拒絕)...");
  const t1 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TC_LAT, TC_LON, null);
  console.log("T1 Response:", t1);
  if (t1.status !== 403 || t1.data.code !== "UNREGISTERED_EMPLOYEE") {
    throw new Error(`測試 1 失敗：未阻擋未註冊訪客 (狀態碼: ${t1.status})`);
  }
  console.log("✅ 測試 1 通過：未綁定公司之訪客被精準阻擋，提示掃描入職 QR Code");

  // 2. 掃描公司 QR Code (24549210-01) 進行首次打卡與公司綁定
  console.log("\n[測試 2] 掃描公司專屬 QR Code (24549210-01) 進行入職註冊打卡...");
  const t2 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TC_LAT, TC_LON, "24549210-01");
  console.log("T2 Response:", t2.data);
  if (!t2.data.success || t2.data.locationId !== "24549210-01") {
    throw new Error("測試 2 失敗：首次註冊打卡未成功");
  }
  console.log("✅ 測試 2 通過：成功完成公司綁定 (24549210) 並於台中美德總部打卡成功");

  // 3. 查詢員工可見據點清單 (/api/locations?userId=...) -> 只能看見 24549210 名下據點
  console.log("\n[測試 3] 驗證據點查詢 API 之企業隔離...");
  const locRes = await fetch(`${WORKER_URL}/api/locations?userId=${TEST_USER_ID}`);
  const locData = await locRes.json();
  console.log(`回傳據點數: ${locData.count}, 公司統編: ${locData.companyTaxId}`);
  console.log("據點清單:", locData.locations.map(l => `${l.id} (${l.name})`));

  const hasOtherCompany = locData.locations.some(l => !l.id.startsWith("24549210"));
  if (hasOtherCompany || locData.count === 0) {
    throw new Error("測試 3 失敗：洩漏了他社 (如統一超商/聯發科) 據點資料！");
  }
  console.log("✅ 測試 3 通過：員工只能存取所屬公司名下據點，嚴格隔離他社地點");

  // 4. 第二天由官方選單開啟 (不帶參數)，在台中美德總部打卡
  console.log("\n[測試 4] 無帶入 QR Code 參數，於台中美德總部打卡...");
  const t4 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TC_LAT, TC_LON, null);
  console.log("T4 Response:", t4.data);
  if (!t4.data.success || t4.data.locationId !== "24549210-01") {
    throw new Error("測試 4 失敗：未正確匹配至台中美德總部");
  }
  console.log("✅ 測試 4 通過：自動識別所屬公司並匹配至【台中美德總部】");

  // 5. 員工出差至台北101門市 (24549210-02) 打卡 (不帶參數)
  console.log("\n[測試 5] 員工出差至台北101門市打卡 (自動動態匹配公司分店)...");
  const t5 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TP_LAT, TP_LON, null);
  console.log("T5 Response:", t5.data);
  if (!t5.data.success || t5.data.locationId !== "24549210-02") {
    throw new Error("測試 5 失敗：出差未自動匹配至台北門市");
  }
  console.log("✅ 測試 5 通過：自動於公司名下多據點動態切換，成功判定為【台北101門市】");

  // 6. 員工走到高雄統一超商 (10458575-01) 門口打卡 -> 不應匹配到統一超商，應判定為超出範圍
  console.log("\n[測試 6] 員工於他社 (高雄統一超商) 據點座標打卡 (應判定為本公司超出範圍)...");
  const t6 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, KH_LAT, KH_LON, null);
  console.log("T6 Response:", t6.data);
  if (t6.status !== 400 || t6.data.success !== false || !t6.data.error.includes("豬毛科技")) {
    throw new Error("測試 6 失敗：誤匹配至他社據點！");
  }
  console.log("✅ 測試 6 通過：完全無視他社據點，精準回報距離本公司據點超出範圍");

  // 清理測試數據
  console.log("\n[清理] 移除測試數據...");
  await runD1Sql(`DELETE FROM checkin_records WHERE line_user_id = '${TEST_USER_ID}'; DELETE FROM user_devices WHERE line_user_id = '${TEST_USER_ID}'; DELETE FROM company_employees WHERE line_user_id = '${TEST_USER_ID}';`);
  console.log("✅ 測試數據清理完畢");

  console.log("\n🎉 企業據點多租戶資料隔離 6 大情境驗證 100% 通過！");
}

main().catch(err => {
  console.error("\n❌ 測試失敗:", err);
  process.exit(1);
});
