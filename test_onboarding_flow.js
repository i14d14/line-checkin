const https = require('https');

const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";
const TIMESTAMP = Date.now();
const NEW_USER_ID = `U_ONBOARD_TEST_${TIMESTAMP}`;
const NEW_USER_NAME = "熊貓 (測試新人)";
const STORE_ID = "24549210-01";

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: resData }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTest() {
  console.log("=== Testing Explicit Employee Onboarding Flow (v2.2.9) ===");

  // 1. LIFF HTML structure check
  console.log("1. Inspecting LIFF HTML for Onboarding Card and Handlers...");
  const liffRes = await get(`${BASE_URL}/checkin`);
  if (liffRes.status !== 200) {
    throw new Error(`LIFF returned status ${liffRes.status}`);
  }

  if (!liffRes.body.includes('id="view-onboarding"') || !liffRes.body.includes('新進同仁入職邀請')) {
    throw new Error("FAIL: LIFF HTML missing #view-onboarding section!");
  }
  console.log("  ✅ PASS: LIFF HTML contains #view-onboarding section");

  if (!liffRes.body.includes('id="tabSwitcher"') || !liffRes.body.includes('handleJoinCompany')) {
    throw new Error("FAIL: LIFF HTML missing #tabSwitcher or handleJoinCompany!");
  }
  console.log("  ✅ PASS: LIFF HTML contains #tabSwitcher and handleJoinCompany");

  if (!liffRes.body.includes('id="nav-onboarding"') || !liffRes.body.includes('入職登記')) {
    throw new Error("FAIL: LIFF HTML missing #nav-onboarding single tab button!");
  }
  console.log("  ✅ PASS: LIFF HTML contains #nav-onboarding single button (入職登記)");

  if (!liffRes.body.includes('showOnboardingView') || !liffRes.body.includes('showEnrolledView')) {
    throw new Error("FAIL: LIFF script missing view state controllers!");
  }
  console.log("  ✅ PASS: LIFF script contains showOnboardingView and showEnrolledView");

  if (!liffRes.body.includes('id="onboardingSuccessModal"') || !liffRes.body.includes('handleModalFriendClick')) {
    throw new Error("FAIL: LIFF HTML missing #onboardingSuccessModal or handleModalFriendClick!");
  }
  console.log("  ✅ PASS: LIFF HTML contains #onboardingSuccessModal and handleModalFriendClick");

  // 2. Query profile of new un-enrolled user with cid
  console.log("\n2. Querying profile for un-enrolled newcomer with cid...");
  const profRes1 = await get(`${BASE_URL}/api/v1/employee/profile?userId=${NEW_USER_ID}&cid=${STORE_ID}`);
  if (profRes1.status !== 200) {
    throw new Error(`Profile query returned status ${profRes1.status}: ${profRes1.body}`);
  }
  const prof1 = JSON.parse(profRes1.body);
  if (!prof1.success || prof1.profile.companyId !== null) {
    throw new Error(`FAIL: Un-enrolled user profile should have companyId=null! Got: ${JSON.stringify(prof1)}`);
  }
  if (!prof1.profile.targetLocation || prof1.profile.targetLocation.id !== STORE_ID) {
    throw new Error(`FAIL: Profile did not return expected targetLocation for cid ${STORE_ID}!`);
  }
  console.log(`  ✅ PASS: Newcomer profile returned companyId: null, targetLocation: "${prof1.profile.targetLocation.name}"`);

  // 3. Newcomer clicks "Join Company" -> POST /api/v1/employee/join
  console.log("\n3. Newcomer submits explicit join request (POST /api/v1/employee/join)...");
  const joinRes = await post(`${BASE_URL}/api/v1/employee/join`, {
    companyId: STORE_ID,
    lineUserId: NEW_USER_ID,
    displayName: NEW_USER_NAME
  });
  if (joinRes.status !== 200) {
    throw new Error(`Join API returned status ${joinRes.status}: ${joinRes.body}`);
  }
  const joinData = JSON.parse(joinRes.body);
  if (!joinData.success || joinData.companyId !== STORE_ID) {
    throw new Error(`FAIL: Join API failed: ${joinRes.body}`);
  }
  console.log(`  ✅ PASS: Join API succeeded -> "${joinData.message}"`);

  // 4. Query profile of now-enrolled employee
  console.log("\n4. Querying profile after onboarding completion...");
  const profRes2 = await get(`${BASE_URL}/api/v1/employee/profile?userId=${NEW_USER_ID}&cid=${STORE_ID}`);
  const prof2 = JSON.parse(profRes2.body);
  if (!prof2.success || prof2.profile.companyId !== STORE_ID) {
    throw new Error(`FAIL: Enrolled user profile companyId mismatch! Expected ${STORE_ID}, got: ${prof2.profile.companyId}`);
  }
  console.log(`  ✅ PASS: Employee profile successfully updated to companyId: "${prof2.profile.companyId}" (${prof2.profile.companyName})`);

  console.log("\n🎉 ALL ONBOARDING FLOW TESTS PASSED 100%!");
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
