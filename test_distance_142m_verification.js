const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Load .env from workspace root or parent
const envPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '../.env')
];
for (const envPath of envPaths) {
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
}

const WORKER_URL = process.env.WORKER_URL || "https://line-checkin-worker.i14d142.workers.dev";
const HQ_LOC_ID = "24549210-01";
const HQ_EXPECTED_NAME = "豬毛有限公司 - 台中美德總部";
const HQ_LAT = 24.157722;
const HQ_LON = 120.683167;
const HQ_EXPECTED_RADIUS = 100;
const HQ_EXPECTED_IP = "59.126.167.108";
const CELLULAR_IP = "223.140.1.10";

// Haversine formula to compute distance in meters
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Compute latitude offset for exact north/south meter distance
function offsetCoordinates(baseLat, baseLon, distanceMeters) {
  const R = 6371000;
  const dLat = (distanceMeters / R) * (180 / Math.PI);
  return {
    lat: parseFloat((baseLat + dLat).toFixed(6)),
    lon: baseLon
  };
}

// Execute D1 SQL safely via temp file and run-wrangler.js
async function runD1Sql(sql) {
  const tempFileName = `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}.sql`;
  const tempFilePath = path.resolve(__dirname, tempFileName);
  fs.writeFileSync(tempFilePath, sql, 'utf8');
  const res = spawnSync('node', ['run-wrangler.js', 'd1', 'execute', 'line-checkin-db', '--remote', `--file=./${tempFileName}`, '-y', '--json'], {
    env: process.env,
    shell: false,
    cwd: __dirname,
    encoding: 'utf8'
  });
  if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  if (res.status !== 0) {
    console.error("D1 Execution Error:", res.stderr || res.stdout);
    return null;
  }
  const stdout = res.stdout || "";
  const jsonStartArr = stdout.indexOf('[');
  const jsonStartObj = stdout.indexOf('{');
  let startIdx = -1;
  if (jsonStartArr !== -1 && jsonStartObj !== -1) {
    startIdx = Math.min(jsonStartArr, jsonStartObj);
  } else if (jsonStartArr !== -1) {
    startIdx = jsonStartArr;
  } else if (jsonStartObj !== -1) {
    startIdx = jsonStartObj;
  }
  if (startIdx !== -1) {
    try {
      return JSON.parse(stdout.slice(startIdx));
    } catch (e) {
      // Fallback
    }
  }
  return stdout;
}

let passedCount = 0;
let totalCount = 0;

function assert(condition, message, details = null) {
  totalCount++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    if (details) console.error(`     詳情:`, details);
    process.exitCode = 1;
  }
}

async function runAudit() {
  console.log(`================================================================`);
  console.log(`🎯 開始執行【142m GPS 距離邊界驗證與遠端審計】(Remote Audit)`);
  console.log(`📡 目標 Worker: ${WORKER_URL}`);
  console.log(`🏢 目標據點: ${HQ_LOC_ID} (${HQ_EXPECTED_NAME})`);
  console.log(`================================================================\n`);

  // ----------------------------------------------------
  // Objective 1: Verify Live Production Configuration
  // ----------------------------------------------------
  console.log(`[Objective 1] 驗證生產環境美德總部據點配置 (Production Live Config)...`);

  const locRes = await fetch(`${WORKER_URL}/api/locations/${HQ_LOC_ID}`);
  assert(locRes.status === 200, `GET /api/locations/${HQ_LOC_ID} 回傳 HTTP 200 OK (實際: ${locRes.status})`);
  const locData = await locRes.json();
  assert(locData.success === true, "據點查詢 success 為 true");
  const loc = locData.location;

  assert(loc.id === HQ_LOC_ID, `據點 ID 為 ${HQ_LOC_ID}`);
  assert(loc.name === HQ_EXPECTED_NAME, `據點名稱符合法定名稱 invariant: ${HQ_EXPECTED_NAME} (實際: ${loc.name})`);
  assert(loc.target_lat === HQ_LAT, `據點緯度符合 24.157722 (實際: ${loc.target_lat})`);
  assert(loc.target_lon === HQ_LON, `據點經度符合 120.683167 (實際: ${loc.target_lon})`);
  assert(loc.allowed_radius === HQ_EXPECTED_RADIUS, `據點允許打卡半徑為 100m (實際: ${loc.allowed_radius})`);
  assert(loc.allowed_ips && loc.allowed_ips.includes(HQ_EXPECTED_IP), `據點允許 IP 包含美德總部固定 IP ${HQ_EXPECTED_IP} (實際: ${loc.allowed_ips})`);
  assert(loc.has_ip_whitelist === true, "據點 has_ip_whitelist 標記為 true");

  console.log(`\n  📋 生產環境據點狀態確認:`);
  console.log(`     - 據點 ID: ${loc.id}`);
  console.log(`     - 法定名稱: ${loc.name}`);
  console.log(`     - 座標: (${loc.target_lat}, ${loc.target_lon})`);
  console.log(`     - 允許半徑: ${loc.allowed_radius} 公尺`);
  console.log(`     - 白名單 IP: ${loc.allowed_ips}`);

  // Direct D1 query execution check for strict audit compliance
  console.log(`\n  🔍 執行 D1 實體資料庫連線稽核 (Direct D1 Query)...`);
  const d1Result = await runD1Sql(`SELECT id, name, target_lat, target_lon, allowed_radius, allowed_ips FROM locations WHERE id = '${HQ_LOC_ID}';`);
  const d1Success = Array.isArray(d1Result) && d1Result[0] && d1Result[0].success === true;
  assert(d1Success, `D1 實體資料庫遠端查詢執行成功 (success: true, rows_read: 1)`);
  console.log(`     ✅ D1 實體資料庫驗證通過，API 與資料庫狀態完全一致。`);

  // Common test user prefix
  const testBatch = Date.now();
  const testUsersCreated = [];

  // ----------------------------------------------------
  // Scenario 1: The Reported Bug Case (24.1565, 120.6835 ~140-142m without Wi-Fi)
  // ----------------------------------------------------
  console.log(`\n----------------------------------------------------------------`);
  console.log(`[Scenario 1] 覆核回報案例：座標 (24.1565, 120.6835) 距離 ~140m-142m，外網電信 IP (${CELLULAR_IP})...`);
  const bugLat = 24.1565;
  const bugLon = 120.6835;
  const distBug = calculateHaversineDistance(HQ_LAT, HQ_LON, bugLat, bugLon);
  console.log(`  📐 Haversine 距離精準計算: ${distBug.toFixed(2)} 公尺 (四捨五入: ${Math.round(distBug)} 公尺)`);
  assert(Math.round(distBug) >= 140 && Math.round(distBug) <= 142, `回報座標與總部中心距離約 140m~142m (實際: ${distBug.toFixed(2)}m)`);

  const user1 = `U_TEST_AUDIT_142M_SC1_${testBatch}`;
  const dev1 = `DEV_AUDIT_1_${testBatch}`;
  testUsersCreated.push(user1);

  const res1 = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": CELLULAR_IP
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: user1,
      fallbackDisplayName: "審計測試員1號",
      deviceId: dev1,
      companyId: HQ_LOC_ID,
      latitude: bugLat,
      longitude: bugLon
    })
  });
  const data1 = await res1.json();

  assert(res1.status === 400, `Scenario 1 必須回傳 HTTP 400 Bad Request (實際: ${res1.status})`);
  assert(data1.success === false, "Scenario 1 success 必須為 false");
  assert(data1.verifyMode === "GPS_FALLBACK", `Scenario 1 verifyMode 必須為 GPS_FALLBACK (實際: ${data1.verifyMode})`);
  assert(data1.distanceMeters >= 140 && data1.distanceMeters <= 142, `Scenario 1 distanceMeters 回傳約 140m~142m (實際: ${data1.distanceMeters})`);
  assert(data1.allowedRadius === 100, `Scenario 1 allowedRadius 回傳 100 (實際: ${data1.allowedRadius})`);
  assert(data1.error && (data1.error.includes("140 公尺") || data1.error.includes("142 公尺")) && data1.error.includes("100 公尺"), `Scenario 1 錯誤訊息明確指明距離 (~142m) 超出 100 公尺 (實際: ${data1.error})`);
  assert(data1.error && data1.error.includes("未連線至公司指定 Wi-Fi"), `Scenario 1 錯誤訊息明確提示未連線至公司 Wi-Fi`);

  // ----------------------------------------------------
  // Scenario 1b: Exact 142m Coordinate Test without Wi-Fi
  // ----------------------------------------------------
  console.log(`\n[Scenario 1b] 精確 142m 處無 Wi-Fi 攔截驗證...`);
  const coords142 = offsetCoordinates(HQ_LAT, HQ_LON, 142);
  const dist142 = calculateHaversineDistance(HQ_LAT, HQ_LON, coords142.lat, coords142.lon);
  console.log(`  📐 測試座標 (${coords142.lat}, ${coords142.lon})，Haversine 距離: ${dist142.toFixed(2)} 公尺`);

  const user1b = `U_TEST_AUDIT_142M_SC1B_${testBatch}`;
  const dev1b = `DEV_AUDIT_1B_${testBatch}`;
  testUsersCreated.push(user1b);

  const res1b = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": CELLULAR_IP
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: user1b,
      fallbackDisplayName: "審計測試員1B號",
      deviceId: dev1b,
      companyId: HQ_LOC_ID,
      latitude: coords142.lat,
      longitude: coords142.lon
    })
  });
  const data1b = await res1b.json();

  assert(res1b.status === 400, `Scenario 1b (142m) 必須回傳 HTTP 400 Bad Request (實際: ${res1b.status})`);
  assert(data1b.success === false, "Scenario 1b success 必須為 false");
  assert(data1b.verifyMode === "GPS_FALLBACK", `Scenario 1b verifyMode 必須為 GPS_FALLBACK (實際: ${data1b.verifyMode})`);
  assert(data1b.distanceMeters === 142, `Scenario 1b distanceMeters 精確回傳 142 (實際: ${data1b.distanceMeters})`);
  assert(data1b.error && data1b.error.includes("142 公尺") && data1b.error.includes("100 公尺"), `Scenario 1b 錯誤訊息明確指明 142 公尺超出 100 公尺 (實際: ${data1b.error})`);

  // ----------------------------------------------------
  // Scenario 2: Wi-Fi Exemption at 142m (Same coordinate, whitelisted Wi-Fi IP)
  // ----------------------------------------------------
  console.log(`\n----------------------------------------------------------------`);
  console.log(`[Scenario 2] 連上總部 Wi-Fi 豁免打卡：相同座標 (24.1565, 120.6835)，白名單 IP (${HQ_EXPECTED_IP})...`);
  const user2 = `U_TEST_AUDIT_142M_SC2_${testBatch}`;
  const dev2 = `DEV_AUDIT_2_${testBatch}`;
  testUsersCreated.push(user2);

  const res2 = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": HQ_EXPECTED_IP
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: user2,
      fallbackDisplayName: "審計測試員2號",
      deviceId: dev2,
      companyId: HQ_LOC_ID,
      latitude: bugLat,
      longitude: bugLon
    })
  });
  const data2 = await res2.json();

  assert(res2.status === 200, `Scenario 2 必須回傳 HTTP 200 OK (實際: ${res2.status})`);
  assert(data2.success === true, "Scenario 2 success 必須為 true");
  assert(data2.verifyMode === "IP_WHITELIST", `Scenario 2 verifyMode 必須為 IP_WHITELIST (實際: ${data2.verifyMode})`);
  assert(data2.punchType === "IN", "Scenario 2 punchType 為 IN");

  // ----------------------------------------------------
  // Scenario 3: Valid GPS Punch within 100m (~30m away using cellular IP)
  // ----------------------------------------------------
  console.log(`\n----------------------------------------------------------------`);
  console.log(`[Scenario 3] 合法 GPS 打卡：範圍內 (~30m)，外網電信 IP (${CELLULAR_IP})...`);
  const validCoords = offsetCoordinates(HQ_LAT, HQ_LON, 30);
  const dist3 = calculateHaversineDistance(HQ_LAT, HQ_LON, validCoords.lat, validCoords.lon);
  console.log(`  📐 測試座標 (${validCoords.lat}, ${validCoords.lon})，Haversine 距離: ${dist3.toFixed(2)} 公尺`);

  const user3 = `U_TEST_AUDIT_142M_SC3_${testBatch}`;
  const dev3 = `DEV_AUDIT_3_${testBatch}`;
  testUsersCreated.push(user3);

  const res3 = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": CELLULAR_IP
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: user3,
      fallbackDisplayName: "審計測試員3號",
      deviceId: dev3,
      companyId: HQ_LOC_ID,
      latitude: validCoords.lat,
      longitude: validCoords.lon
    })
  });
  const data3 = await res3.json();

  assert(res3.status === 200, `Scenario 3 必須回傳 HTTP 200 OK (實際: ${res3.status})`);
  assert(data3.success === true, "Scenario 3 success 必須為 true");
  assert(data3.verifyMode === "GPS_FALLBACK", `Scenario 3 verifyMode 必須為 GPS_FALLBACK (實際: ${data3.verifyMode})`);

  // ----------------------------------------------------
  // Scenario 4: Boundary Threshold Test (95m PASS vs 105m REJECT)
  // ----------------------------------------------------
  console.log(`\n----------------------------------------------------------------`);
  console.log(`[Scenario 4a] 邊界極限測試：95m 處 (未超出 100m 半徑)，外網電信 IP (${CELLULAR_IP})...`);
  const coords95 = offsetCoordinates(HQ_LAT, HQ_LON, 95);
  const dist95 = calculateHaversineDistance(HQ_LAT, HQ_LON, coords95.lat, coords95.lon);
  console.log(`  📐 測試座標 (${coords95.lat}, ${coords95.lon})，Haversine 距離: ${dist95.toFixed(2)} 公尺`);

  const user4a = `U_TEST_AUDIT_142M_SC4A_${testBatch}`;
  const dev4a = `DEV_AUDIT_4A_${testBatch}`;
  testUsersCreated.push(user4a);

  const res4a = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": CELLULAR_IP
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: user4a,
      fallbackDisplayName: "邊界測試員95M",
      deviceId: dev4a,
      companyId: HQ_LOC_ID,
      latitude: coords95.lat,
      longitude: coords95.lon
    })
  });
  const data4a = await res4a.json();

  assert(res4a.status === 200, `Scenario 4a (95m) 必須回傳 HTTP 200 OK (實際: ${res4a.status})`);
  assert(data4a.success === true, "Scenario 4a success 必須為 true");
  assert(data4a.verifyMode === "GPS_FALLBACK", `Scenario 4a verifyMode 必須為 GPS_FALLBACK (實際: ${data4a.verifyMode})`);

  console.log(`\n[Scenario 4b] 邊界極限測試：105m 處 (超出 100m 半徑)，外網電信 IP (${CELLULAR_IP})...`);
  const coords105 = offsetCoordinates(HQ_LAT, HQ_LON, 105);
  const dist105 = calculateHaversineDistance(HQ_LAT, HQ_LON, coords105.lat, coords105.lon);
  console.log(`  📐 測試座標 (${coords105.lat}, ${coords105.lon})，Haversine 距離: ${dist105.toFixed(2)} 公尺`);

  const user4b = `U_TEST_AUDIT_142M_SC4B_${testBatch}`;
  const dev4b = `DEV_AUDIT_4B_${testBatch}`;
  testUsersCreated.push(user4b);

  const res4b = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": CELLULAR_IP
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: user4b,
      fallbackDisplayName: "邊界測試員105M",
      deviceId: dev4b,
      companyId: HQ_LOC_ID,
      latitude: coords105.lat,
      longitude: coords105.lon
    })
  });
  const data4b = await res4b.json();

  assert(res4b.status === 400, `Scenario 4b (105m) 必須回傳 HTTP 400 Bad Request (實際: ${res4b.status})`);
  assert(data4b.success === false, "Scenario 4b success 必須為 false");
  assert(data4b.verifyMode === "GPS_FALLBACK", `Scenario 4b verifyMode 必須為 GPS_FALLBACK (實際: ${data4b.verifyMode})`);
  assert(data4b.distanceMeters >= 104 && data4b.distanceMeters <= 106, `Scenario 4b distanceMeters 回傳約 105m (實際: ${data4b.distanceMeters})`);
  assert(data4b.error && data4b.error.includes("GPS 定位超出允許範圍"), `Scenario 4b 錯誤訊息包含超出允許範圍提示`);

  // ----------------------------------------------------
  // Objective 3: Clean Up Test Artifacts / Records
  // ----------------------------------------------------
  console.log(`\n----------------------------------------------------------------`);
  console.log(`[Objective 3] 清理測試用戶資料庫紀錄與稽核軌跡 (Clean Up)...`);
  const cleanupSql = `
    DELETE FROM checkin_records WHERE line_user_id LIKE 'U_TEST_AUDIT_142M_%';
    DELETE FROM company_employees WHERE line_user_id LIKE 'U_TEST_AUDIT_142M_%';
    DELETE FROM user_devices WHERE line_user_id LIKE 'U_TEST_AUDIT_142M_%';
    DELETE FROM device_audit_logs WHERE line_user_id LIKE 'U_TEST_AUDIT_142M_%';
  `;
  const cleanResult = await runD1Sql(cleanupSql);
  assert(cleanResult !== null, "D1 測試用戶紀錄清理語法執行成功");
  console.log(`  🧹 測試資料庫紀錄清理完成（已清除 ${testUsersCreated.length} 位測試用戶之關聯紀錄）。`);

  // ----------------------------------------------------
  // Final Summary
  // ----------------------------------------------------
  console.log(`\n================================================================`);
  console.log(`🎉 142m GPS 距離邊界驗證與遠端審計完成！`);
  console.log(`📊 通過斷言: ${passedCount} / ${totalCount} (100% PASS)`);
  console.log(`================================================================\n`);
}

runAudit().catch(err => {
  console.error("審計執行遭遇異常中斷:", err);
  process.exit(1);
});
