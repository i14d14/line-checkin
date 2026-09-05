// test_calendar_metric_cards.js
// 驗證出勤月曆頂部 4 大指標卡片 (本月累計工時、加班時長、遲到/早退、異常缺卡) 之渲染與 API 連動

const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";
const PIGMAO_USER_ID = "Ubd107bb3ba1b85a8086fc3b2250458e8";
const STORE_ID = "24549210-01";

async function runTest() {
  console.log("=== 測試開始：驗證 LIFF 出勤月曆頂部 4 大指標卡片 (加班時長替換出勤日數) ===");

  // 1. 驗證 LIFF HTML 內 4 大卡片之 DOM ID 與文字標籤
  console.log("\n--- 1. 檢查 LIFF HTML 內 4 大卡片結構 ---");
  const liffRes = await fetch(`${BASE_URL}/`);
  const html = await liffRes.text();

  const requiredIds = [
    "statTotalHours",
    "statOvertimeHours",
    "statLateCount",
    "statMissingCount"
  ];

  for (const id of requiredIds) {
    if (!html.includes(`id="${id}"`)) {
      throw new Error(`FAIL: LIFF HTML 缺少元素 id="${id}"`);
    }
    console.log(`  ✅ 元素 id="${id}" 存在於 HTML 中`);
  }

  // 檢查 statDays 已被完全移除
  if (html.includes('id="statDays"')) {
    throw new Error('FAIL: 出勤天數 id="statDays" 應已被移除');
  }
  console.log('  ✅ 元素 id="statDays" (出勤天數) 已成功替換移除');

  // 2. 檢查卡片中文標籤
  const requiredLabels = ["本月累計工時", "加班時長", "遲到 / 早退", "異常缺卡"];
  for (const label of requiredLabels) {
    if (!html.includes(label)) {
      throw new Error(`FAIL: LIFF HTML 缺少卡片標籤 "${label}"`);
    }
    console.log(`  ✅ 卡片標籤 "${label}" 存在於 HTML 中`);
  }

  // 3. 檢查 renderAttendanceGrid 內對 4 大指標之賦值邏輯
  console.log("\n--- 2. 檢查 renderAttendanceGrid JavaScript 賦值邏輯 ---");
  const jsChecks = [
    'document.getElementById("statTotalHours")',
    'document.getElementById("statOvertimeHours")',
    'document.getElementById("statLateCount")',
    'document.getElementById("statMissingCount")',
    'data.summary.total_work_hours',
    'data.summary.overtime_hours',
    'data.summary.late_count',
    'data.summary.missing_punch_count'
  ];

  for (const check of jsChecks) {
    if (!html.includes(check)) {
      throw new Error(`FAIL: JS 缺少賦值語句: ${check}`);
    }
    console.log(`  ✅ JS 包含: ${check}`);
  }

  // 4. 呼叫月度出勤 API (/api/v1/attendance/monthly) 驗證回傳資料結構
  console.log("\n--- 3. 檢查後端 API summary 回傳欄位 ---");
  const apiRes = await fetch(`${BASE_URL}/api/v1/attendance/monthly?userId=${PIGMAO_USER_ID}&month=2026-09&companyId=${STORE_ID}`);
  const data = await apiRes.json();
  if (!data.success) {
    throw new Error(`FAIL: API 回傳失敗: ${data.error}`);
  }

  console.log("  API summary 回傳內容:", JSON.stringify(data.summary, null, 2));

  if (typeof data.summary.total_work_hours !== "number") throw new Error("缺少 summary.total_work_hours");
  if (typeof data.summary.overtime_hours !== "number") throw new Error("缺少 summary.overtime_hours");
  if (typeof data.summary.late_count !== "number") throw new Error("缺少 summary.late_count");
  if (typeof data.summary.missing_punch_count !== "number") throw new Error("缺少 summary.missing_punch_count");

  console.log("  ✅ 後端 API 4 大指標資料結構驗證 100% 正確");
  console.log("\n🎉 全數測試通過！出勤月曆頂部 4 大指標卡片 (本月累計工時、加班時長、遲到/早退、異常缺卡) 配置完備！");
}

runTest().catch(err => {
  console.error("測試失敗:", err);
  process.exit(1);
});
