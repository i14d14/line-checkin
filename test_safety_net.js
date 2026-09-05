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
const TEST_USER_ID = "SAFETY_NET_USER_" + Date.now();
const TEST_DEVICE_ID = "dev_safety_test_" + Date.now();
const TARGET_LAT = 24.157722;
const TARGET_LON = 120.683167;

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

async function getLatestUserRecord(userId) {
  const res = await fetch(`${WORKER_URL}/api/records`);
  const data = await res.json();
  if (!data.records) return null;
  return data.records.find(r => r.line_user_id === userId);
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
      fallbackDisplayName: "防護網測試員"
    })
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function sendWebhookPostback(userId, recordId, action) {
  const res = await fetch(`${WORKER_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "postback",
          replyToken: "dummy_reply_token",
          source: { userId },
          postback: {
            data: `action=${action}&record_id=${recordId}`
          }
        }
      ]
    })
  });
  return await res.json();
}

async function sendWebhookText(userId, text) {
  const res = await fetch(`${WORKER_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          type: "message",
          replyToken: "dummy_reply_token",
          source: { userId },
          message: { type: "text", text }
        }
      ]
    })
  });
  return await res.json();
}

async function main() {
  console.log("=== 開始驗證 30 秒安全防護網 (Safety Net) ===");

  // 1. 打卡建立初始紀錄
  console.log("\n[測試 1] 打卡建立初始紀錄...");
  const c1 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TARGET_LAT, TARGET_LON);
  console.log("Check-in Result:", c1.data);
  if (!c1.data.success || c1.data.punchType !== "IN") {
    throw new Error("打卡建立失敗");
  }

  const initialRecord = await getLatestUserRecord(TEST_USER_ID);
  const recordId = initialRecord.id;
  console.log(`取得記錄 ID: ${recordId}, 初始狀態: ${initialRecord.punch_type}, status: ${initialRecord.status}`);

  // 2. 測試 30 秒內【翻轉為 OUT】
  console.log("\n[測試 2] 30 秒內觸發 Postback 翻轉 (IN -> OUT)...");
  const f1 = await sendWebhookPostback(TEST_USER_ID, recordId, "flip");
  console.log("Webhook Response:", f1);

  const rec2 = await getLatestUserRecord(TEST_USER_ID);
  console.log("DB Record after flip 1:", rec2);
  if (rec2.punch_type !== "OUT") {
    throw new Error(`測試 2 失敗：未成功翻轉為 OUT (目前為 ${rec2.punch_type})`);
  }
  console.log("✅ 測試 2 通過：30 秒內成功將狀態翻轉為【下班 (OUT)】");

  // 3. 測試 30 秒內再次【翻轉回 IN】
  console.log("\n[測試 3] 30 秒內再次觸發 Postback 翻轉 (OUT -> IN)...");
  await sendWebhookPostback(TEST_USER_ID, recordId, "flip");
  const rec3 = await getLatestUserRecord(TEST_USER_ID);
  console.log("DB Record after flip 2:", rec3);
  if (rec3.punch_type !== "IN") {
    throw new Error(`測試 3 失敗：未成功翻轉回 IN (目前為 ${rec3.punch_type})`);
  }
  console.log("✅ 測試 3 通過：30 秒內成功將狀態再次翻轉為【上班 (IN)】");

  // 4. 測試 30 秒內【撤回打卡 (Undo)】
  console.log("\n[測試 4] 30 秒內觸發 Postback 撤回 (Undo)...");
  await sendWebhookPostback(TEST_USER_ID, recordId, "undo");
  const rec4 = await getLatestUserRecord(TEST_USER_ID);
  console.log("DB Record after undo:", rec4);
  if (rec4.status !== "CANCELLED") {
    throw new Error(`測試 4 失敗：未成功標記為 CANCELLED (目前為 ${rec4.status})`);
  }
  console.log("✅ 測試 4 通過：30 秒內成功撤回打卡並標記為【CANCELLED (作廢)】");

  // 5. 測試超時 (> 30 秒) 攔截防護
  console.log("\n[測試 5] 模擬超過 30 秒後嘗試翻轉/撤回（應被攔截）...");
  const c2 = await executeCheckin(TEST_USER_ID, TEST_DEVICE_ID, TARGET_LAT, TARGET_LON);
  const newRec = await getLatestUserRecord(TEST_USER_ID);
  const newRecId = newRec.id;
  
  // 將建立時間手動往前調 50 秒
  await runD1Sql(`UPDATE checkin_records SET created_at = datetime('now', '-50 seconds', '+8 hours') WHERE id = ${newRecId}`);
  
  // 發送翻轉請求
  await sendWebhookPostback(TEST_USER_ID, newRecId, "flip");
  
  // 檢驗狀態是否依然為 IN (未被翻轉)
  const rec6 = await getLatestUserRecord(TEST_USER_ID);
  console.log("DB Record after expired flip attempt:", rec6);
  if (rec6.punch_type !== "IN") {
    throw new Error("測試 5 失敗：超時翻轉未被攔截");
  }
  console.log("✅ 測試 5 通過：超過 30 秒之操作被精準攔截，原紀錄維持不變");

  // 6. 測試聊天室文字指令
  console.log("\n[測試 6] 測試聊天室文字指令 (\"打卡紀錄\")...");
  const wText = await sendWebhookText(TEST_USER_ID, "打卡紀錄");
  console.log("Text Command Response:", wText);
  if (!wText.success) {
    throw new Error("測試 6 失敗：文字指令處理異常");
  }
  console.log("✅ 測試 6 通過：聊天室關鍵字指令運作正常");

  // 清理測試數據
  console.log("\n[清理] 移除測試數據...");
  await runD1Sql(`DELETE FROM checkin_records WHERE line_user_id = '${TEST_USER_ID}'; DELETE FROM user_devices WHERE line_user_id = '${TEST_USER_ID}'; DELETE FROM company_employees WHERE line_user_id = '${TEST_USER_ID}';`);
  console.log("✅ 測試數據清理完畢");

  console.log("\n🎉 30 秒安全防護網 6 大情境驗證 100% 通過！");
}

main().catch(err => {
  console.error("\n❌ 防護網測試失敗:", err);
  process.exit(1);
});
