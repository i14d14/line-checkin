const https = require('https');

const BASE_URL = "https://line-checkin-worker.i14d142.workers.dev";

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function runTest() {
  console.log("=== Testing LIFF Role-Gated Admin Tab Guard ===");

  // 1. Fetch LIFF HTML
  console.log("1. Fetching LIFF HTML directly from worker...");
  const liffRes = await get(`${BASE_URL}/checkin`);
  if (liffRes.status !== 200) {
    throw new Error(`LIFF returned status ${liffRes.status}`);
  }

  // 2. Verify nav-admin has 'hidden' class by default
  const hasHiddenAdmin = liffRes.body.includes('id="nav-admin" class="nav-btn flex-1 py-2.5 text-center text-gray-500 hidden items-center justify-center space-x-1.5"');
  if (!hasHiddenAdmin) {
    throw new Error("FAIL: nav-admin does not have hidden class by default!");
  }
  console.log("  ✅ PASS: nav-admin has 'hidden' class by default (employees will not see it)");

  // 3. Verify security check exists in switchView (PBAC canAccessAdminTab)
  const hasSecurityCheck = liffRes.body.includes("viewName === 'admin' && !canAccessAdminTab()");
  if (!hasSecurityCheck) {
    throw new Error("FAIL: switchView does not guard against non-management accessing admin view via canAccessAdminTab()!");
  }
  console.log("  ✅ PASS: switchView guards against unauthorized access to admin view via canAccessAdminTab()");

  // 4. Verify checkUserPermissions dynamically reveals nav-admin
  const hasDynamicToggle = liffRes.body.includes("navAdmin.classList.remove(\"hidden\")") && liffRes.body.includes("navAdmin.classList.add(\"flex\")");
  if (!hasDynamicToggle) {
    throw new Error("FAIL: checkUserPermissions does not dynamically toggle nav-admin!");
  }
  console.log("  ✅ PASS: checkUserPermissions dynamically reveals nav-admin for management capability");

  console.log("\n🎉 ALL LIFF TAB ROLE-GUARD CHECKS PASSED!");
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
