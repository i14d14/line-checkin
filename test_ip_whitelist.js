const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Load .env
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

const WORKER_URL = process.env.WORKER_URL || "https://line-checkin-worker.i14d142.workers.dev";
const TAX_ID = "24549210";
const HQ_LOC_ID = "24549210-TEST-IP";
const BRANCH_NO_IP_ID = "24549210-TEST-NOIP";

const HQ_LAT = 24.157722;
const HQ_LON = 120.683167;

const TEST_CORP_IP = "211.20.1.5";
const TEST_CIDR_IP = "114.33.20.88"; // Part of 114.33.20.0/24
const TEST_CELLULAR_IP = "223.140.1.10";

// IPv6 Dual-Stack Test Constants
const TEST_CORP_IPV6 = "2001:4860:7:810::db";
const TEST_CIDR_IPV6 = "2404:6800:4008::cafe"; // Part of 2404:6800:4008::/48
const TEST_CELLULAR_IPV6 = "2001:b030:9999:ffff::1"; // Unregistered cellular IPv6

let passedCount = 0;
let totalCount = 0;

function assert(condition, message) {
  totalCount++;
  if (condition) {
    console.log(`  ✅ 通過: ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ 失敗: ${message}`);
    process.exitCode = 1;
  }
}

async function runD1Sql(sql) {
  const tempFileName = `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}.sql`;
  const tempFilePath = path.resolve(__dirname, tempFileName);
  fs.writeFileSync(tempFilePath, sql, 'utf8');
  const res = spawnSync('node', ['run-wrangler.js', 'd1', 'execute', 'line-checkin-db', '--remote', `--file=./${tempFileName}`, '-y'], {
    env: process.env,
    shell: false,
    cwd: __dirname,
    encoding: 'utf8'
  });
  if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  return res.status === 0;
}

async function runTests() {
  console.log(`\n🚀 開始執行【據點固定 IP / CIDR 白名單與 GPS 互補打卡機制】自動化測試...`);
  console.log(`📡 目標 Worker: ${WORKER_URL}\n`);

  try {
    // ----------------------------------------------------
    // Test 1: POST /api/locations 格式防呆（非法 IP 格式攔截）
    // ----------------------------------------------------
  console.log(`[Test 1] 測試非法 IP / CIDR 格式攔截...`);
  const invalidLocRes = await fetch(`${WORKER_URL}/api/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: HQ_LOC_ID,
      name: "豬毛科技 - 測試據點",
      address: "台中市北區美德街56-11號",
      target_lat: HQ_LAT,
      target_lon: HQ_LON,
      allowed_ips: "invalid_ip/99, 999.888.777.666"
    })
  });
  const invalidLocData = await invalidLocRes.json();
  assert(!invalidLocData.success && (invalidLocRes.status === 400 || invalidLocRes.status === 500), "非法 IP / CIDR 格式應被 400/500 攔截");

  // ----------------------------------------------------
  // Test 2: POST /api/locations 建立含固定 IP/CIDR 白名單之據點
  // ----------------------------------------------------
  console.log(`\n[Test 2] 設定含固定 IP/CIDR 之美德總部據點...`);
  const corpIps = "59.126.167.108, 2001:4860:7:810::db, 2404:6800:4008::/48, 211.20.1.5, 114.33.20.0/24";
  const createHqRes = await fetch(`${WORKER_URL}/api/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: HQ_LOC_ID,
      name: "豬毛有限公司 - 台中美德總部",
      address: "台中市北區美德街56-11號",
      target_lat: HQ_LAT,
      target_lon: HQ_LON,
      allowed_radius: 100,
      allowed_ips: corpIps
    })
  });
  const createHqData = await createHqRes.json();
  assert(createHqData.success === true, "設定總部據點成功");
  assert(createHqData.location.allowed_ips === corpIps, "正確回傳 allowed_ips");
  assert(createHqData.location.has_ip_whitelist === true, "has_ip_whitelist 標記為 true");

  // 建立無 IP 白名單之小分店
  const createBranchRes = await fetch(`${WORKER_URL}/api/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: BRANCH_NO_IP_ID,
      name: "豬毛科技 - 台北101門市",
      address: "台北市信義區信義路五段7號",
      target_lat: 25.033976,
      target_lon: 121.564538,
      allowed_radius: 100,
      allowed_ips: null
    })
  });
  const createBranchData = await createBranchRes.json();
  assert(createBranchData.success === true, "建立台北門市據點成功");
  assert(createBranchData.location.has_ip_whitelist === false, "無 IP 白名單標記為 false");

  // ----------------------------------------------------
  // Test 3: 室內 GPS 飄移豁免測試（連上公司 IPv4，GPS 偏差 500m 依然打卡成功）
  // ----------------------------------------------------
  console.log(`\n[Test 3] 測試【IPv4 室內 GPS 飄移豁免】：連上公司固定 IP (211.20.1.5)，GPS 偏差 500m...`);
  const driftLat = HQ_LAT + 0.0045; // ~500m away
  const driftLon = HQ_LON + 0.0045;

  const testUser1 = `TEST_IP_USER_1_${Date.now()}`;
  const testDevice1 = `DEV_IP_1_${Date.now()}`;

  const ipCheckinRes = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": TEST_CORP_IP
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: testUser1,
      fallbackDisplayName: "總部內勤同仁",
      deviceId: testDevice1,
      companyId: HQ_LOC_ID,
      latitude: driftLat,
      longitude: driftLon
    })
  });
  const ipCheckinData = await ipCheckinRes.json();
  assert(ipCheckinData.success === true, "符合公司 IPv4 白名單時，即使 GPS 飄移 500m 仍打卡成功");
  assert(ipCheckinData.verifyMode === "IP_WHITELIST", "驗證模式標記為 IP_WHITELIST");

  // ----------------------------------------------------
  // Test 3b: IPv6 直接比對測試（連上公司 IPv6，GPS 偏差 500m 依然打卡成功）
  // ----------------------------------------------------
  console.log(`\n[Test 3b] 測試【IPv6 室內 GPS 飄移豁免】：連上公司固定 IPv6 (${TEST_CORP_IPV6})，GPS 偏差 500m...`);
  const testUser1b = `TEST_IPV6_USER_1_${Date.now()}`;
  const testDevice1b = `DEV_IPV6_1_${Date.now()}`;

  const ipv6CheckinRes = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": TEST_CORP_IPV6
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: testUser1b,
      fallbackDisplayName: "總部雙棧同仁",
      deviceId: testDevice1b,
      companyId: HQ_LOC_ID,
      latitude: driftLat,
      longitude: driftLon
    })
  });
  const ipv6CheckinData = await ipv6CheckinRes.json();
  assert(ipv6CheckinData.success === true, "符合公司 IPv6 白名單時，即使 GPS 飄移 500m 仍打卡成功");
  assert(ipv6CheckinData.verifyMode === "IP_WHITELIST", "IPv6 驗證模式標記為 IP_WHITELIST");

  // ----------------------------------------------------
  // Test 4: IPv4 CIDR 網段比對測試 (114.33.20.88 命中 114.33.20.0/24)
  // ----------------------------------------------------
  console.log(`\n[Test 4] 測試【IPv4 CIDR 網段比對】：連上公司網段 IP (114.33.20.88)，GPS 偏差 300m...`);
  const testUser2 = `TEST_IP_USER_2_${Date.now()}`;
  const testDevice2 = `DEV_IP_2_${Date.now()}`;

  const cidrCheckinRes = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": TEST_CIDR_IP
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: testUser2,
      fallbackDisplayName: "總部研發同仁",
      deviceId: testDevice2,
      companyId: HQ_LOC_ID,
      latitude: HQ_LAT + 0.0025,
      longitude: HQ_LON + 0.0025
    })
  });
  const cidrCheckinData = await cidrCheckinRes.json();
  assert(cidrCheckinData.success === true, "命中 IPv4 CIDR 網段白名單打卡成功");
  assert(cidrCheckinData.verifyMode === "IP_WHITELIST", "驗證模式標記為 IP_WHITELIST");

  // ----------------------------------------------------
  // Test 4b: IPv6 CIDR 網段比對測試 (2404:6800:4008::cafe 命中 2404:6800:4008::/48)
  // ----------------------------------------------------
  console.log(`\n[Test 4b] 測試【IPv6 CIDR 網段比對】：連上公司 IPv6 網段 (${TEST_CIDR_IPV6})，GPS 偏差 300m...`);
  const testUser2b = `TEST_IPV6_USER_2_${Date.now()}`;
  const testDevice2b = `DEV_IPV6_2_${Date.now()}`;

  const cidrIpv6CheckinRes = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": TEST_CIDR_IPV6
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: testUser2b,
      fallbackDisplayName: "總部雙棧研發同仁",
      deviceId: testDevice2b,
      companyId: HQ_LOC_ID,
      latitude: HQ_LAT + 0.0025,
      longitude: HQ_LON + 0.0025
    })
  });
  const cidrIpv6CheckinData = await cidrIpv6CheckinRes.json();
  assert(cidrIpv6CheckinData.success === true, "命中 IPv6 CIDR 網段白名單打卡成功");
  assert(cidrIpv6CheckinData.verifyMode === "IP_WHITELIST", "IPv6 CIDR 驗證模式標記為 IP_WHITELIST");

  // ----------------------------------------------------
  // Test 5: 降級 GPS 模式成功（未連公司 Wi-Fi 走 4G IPv4，但 GPS 在範圍內 20m）
  // ----------------------------------------------------
  console.log(`\n[Test 5] 測試【IPv4 降級 GPS 成功】：未連公司 Wi-Fi (4G IP: 223.140.1.10)，但 GPS 在範圍內 (20m)...`);
  const testUser3 = `TEST_IP_USER_3_${Date.now()}`;
  const testDevice3 = `DEV_IP_3_${Date.now()}`;

  const fallbackCheckinRes = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": TEST_CELLULAR_IP
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: testUser3,
      fallbackDisplayName: "總部外勤同仁",
      deviceId: testDevice3,
      companyId: HQ_LOC_ID,
      latitude: HQ_LAT + 0.0001, // ~15m
      longitude: HQ_LON + 0.0001
    })
  });
  const fallbackCheckinData = await fallbackCheckinRes.json();
  assert(fallbackCheckinData.success === true, "未連 Wi-Fi 但 GPS 在 100m 內打卡成功");
  assert(fallbackCheckinData.verifyMode === "GPS_FALLBACK", "驗證模式標記為 GPS_FALLBACK");

  // ----------------------------------------------------
  // Test 5b: IPv6 降級 GPS 模式成功（未連公司 Wi-Fi 走未登記之電信 IPv6，但 GPS 在範圍內 20m）
  // ----------------------------------------------------
  console.log(`\n[Test 5b] 測試【IPv6 降級 GPS 成功】：未連公司 Wi-Fi (電信 IPv6: ${TEST_CELLULAR_IPV6})，但 GPS 在範圍內 (20m)...`);
  const testUser3b = `TEST_IPV6_USER_3_${Date.now()}`;
  const testDevice3b = `DEV_IPV6_3_${Date.now()}`;

  const fallbackIpv6CheckinRes = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": TEST_CELLULAR_IPV6
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: testUser3b,
      fallbackDisplayName: "總部雙棧外勤同仁",
      deviceId: testDevice3b,
      companyId: HQ_LOC_ID,
      latitude: HQ_LAT + 0.0001, // ~15m
      longitude: HQ_LON + 0.0001
    })
  });
  const fallbackIpv6CheckinData = await fallbackIpv6CheckinRes.json();
  assert(fallbackIpv6CheckinData.success === true, "未在白名單之 IPv6 但 GPS 在 100m 內打卡成功");
  assert(fallbackIpv6CheckinData.verifyMode === "GPS_FALLBACK", "IPv6 驗證模式標記為 GPS_FALLBACK");

  // ----------------------------------------------------
  // Test 6: 雙重攔截失敗（未連公司 Wi-Fi 走 4G IPv4，且 GPS 超出範圍 500m）
  // ----------------------------------------------------
  console.log(`\n[Test 6] 測試【IPv4 雙重攔截失敗】：未連公司 Wi-Fi (4G IP)，且 GPS 超出範圍 (500m)...`);
  const failCheckinRes = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": TEST_CELLULAR_IP
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: testUser3,
      fallbackDisplayName: "總部外勤同仁",
      deviceId: testDevice3,
      companyId: HQ_LOC_ID,
      latitude: driftLat,
      longitude: driftLon
    })
  });
  const failCheckinData = await failCheckinRes.json();
  assert(!failCheckinData.success && failCheckinRes.status === 400, "未連 Wi-Fi 且超出 GPS 範圍應精確被 400 攔截");
  assert(failCheckinData.verifyMode === "GPS_FALLBACK", "錯誤回傳標記 verifyMode 為 GPS_FALLBACK");
  assert(failCheckinData.error.includes("未連線至公司指定 Wi-Fi"), "錯誤訊息明確說明未連線 Wi-Fi");

  // ----------------------------------------------------
  // Test 6b: IPv6 雙重攔截失敗（未連公司 Wi-Fi 走未登記之電信 IPv6，且 GPS 超出範圍 500m）
  // ----------------------------------------------------
  console.log(`\n[Test 6b] 測試【IPv6 雙重攔截失敗】：未連公司 Wi-Fi (電信 IPv6: ${TEST_CELLULAR_IPV6})，且 GPS 超出範圍 (500m)...`);
  const failIpv6CheckinRes = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": TEST_CELLULAR_IPV6
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: testUser3b,
      fallbackDisplayName: "總部雙棧外勤同仁",
      deviceId: testDevice3b,
      companyId: HQ_LOC_ID,
      latitude: driftLat,
      longitude: driftLon
    })
  });
  const failIpv6CheckinData = await failIpv6CheckinRes.json();
  assert(!failIpv6CheckinData.success && failIpv6CheckinRes.status === 400, "未連 Wi-Fi 之 IPv6 且超出 GPS 範圍應精確被 400 攔截");
  assert(failIpv6CheckinData.verifyMode === "GPS_FALLBACK", "錯誤回傳標記 verifyMode 為 GPS_FALLBACK");
  assert(failIpv6CheckinData.error.includes("未連線至公司指定 Wi-Fi"), "錯誤訊息明確說明未連線 Wi-Fi");

  // ----------------------------------------------------
  // Test 7: 無 IP 限制小門市測試（GPS 模式）
  // ----------------------------------------------------
  console.log(`\n[Test 7] 測試【無 IP 白名單小門市】：純 GPS 模式...`);
  const testUser4 = `TEST_IP_USER_4_${Date.now()}`;
  const testDevice4 = `DEV_IP_4_${Date.now()}`;

  const branchGpsRes = await fetch(`${WORKER_URL}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-ip": TEST_CELLULAR_IP
    },
    body: JSON.stringify({
      idToken: "demo_token",
      fallbackUserId: testUser4,
      fallbackDisplayName: "台北店同仁",
      deviceId: testDevice4,
      companyId: BRANCH_NO_IP_ID,
      latitude: 25.033976,
      longitude: 121.564538
    })
  });
  const branchGpsData = await branchGpsRes.json();
  assert(branchGpsData.success === true, "小門市純 GPS 在範圍內打卡成功");
  assert(branchGpsData.verifyMode === "GPS_ONLY", "小門市驗證模式標記為 GPS_ONLY");

  // ----------------------------------------------------
  // Test 8: 查詢歷史打卡紀錄 API 包含 verify_mode
  // ----------------------------------------------------
  console.log(`\n[Test 8] 測試出勤紀錄 API (/api/records) 包含 verify_mode 欄位...`);
  const recordsRes = await fetch(`${WORKER_URL}/api/records`);
  const recordsData = await recordsRes.json();
  assert(recordsData.success === true, "查詢歷史出勤紀錄成功");
  assert(recordsData.records.length > 0, "有歷史出勤紀錄");
  const latestRecord = recordsData.records[0];
  assert(latestRecord.verify_mode !== undefined && latestRecord.verify_mode !== null, `出勤紀錄包含 verify_mode: ${latestRecord.verify_mode}`);
  } finally {
    console.log("\n🧹 清理 IP 白名單測試據點 (Teardown)...");
    await runD1Sql(`
      DELETE FROM checkin_records WHERE company_id IN ('${HQ_LOC_ID}', '${BRANCH_NO_IP_ID}');
      DELETE FROM company_employees WHERE company_id IN ('${HQ_LOC_ID}', '${BRANCH_NO_IP_ID}');
      DELETE FROM locations WHERE id IN ('${HQ_LOC_ID}', '${BRANCH_NO_IP_ID}');
    `);
    console.log(`  ✅ 測試據點 ${HQ_LOC_ID}, ${BRANCH_NO_IP_ID} 清理完成。`);
  }

  console.log(`\n==================================================`);
  console.log(`🎉 測試結果: 通過 ${passedCount} / ${totalCount} 項測試！`);
  console.log(`==================================================\n`);
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
