const fs = require('fs');
const path = require('path');

const srcPath = path.resolve(__dirname, '../src/views/liff/liff-scripts.ts');
const targetPath = path.resolve(__dirname, '../src/client/liff/index.ts');

const content = fs.readFileSync(srcPath, 'utf8');
const lines = content.split('\n');

// Find start and end of client script inside the template literal
let startIndex = -1;
let endIndex = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<script>')) {
    startIndex = i + 1;
    break;
  }
}

for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('</script>')) {
    endIndex = i;
    break;
  }
}

if (startIndex === -1 || endIndex === -1) {
  console.error("Failed to locate <script> and </script>");
  process.exit(1);
}

// Slice the client lines
const clientLines = lines.slice(startIndex, endIndex);

// Replace const LIFF_ID = "${liffId}"; with const LIFF_ID = (window as any).__LIFF_ID__ || "";
const processedLines = clientLines.map(line => {
  if (line.includes('const LIFF_ID = "${liffId}";')) {
    return '    const LIFF_ID = (window as any).__LIFF_ID__ || "";';
  }
  return line.replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
});

const header = `/**
 * LIFF Mobile Portal Client-Side TypeScript Entrypoint
 * Compiled via esbuild into src/views/liff/liff.client.js
 */

declare const liff: any;

`;

const footer = `

// Expose all functions invoked by HTML inline onclick attributes to window scope
Object.assign(window as any, {
  LIFF_ID,
  handleJoinCompany,
  showEnrolledView,
  showOnboardingView,
  closeSuccessModalAndGoToCheckin,
  handleModalFriendClick,
  checkFriendshipStatus,
  switchView,
  changeCalendarMonth,
  selectDayDetail,
  setApprType,
  removeApprProof,
  loadMyApprovals,
  performCheckin,
  registerCurrentWifiIp,
  sendLineCommand,
  cancelDeviceSwitch,
  confirmAndExecuteDeviceSwitch,
  getAvailableTabs,
  canAccessAdminTab,
  initLiff,
  initSwipeGestures,
});
`;

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, header + processedLines.join('\n') + footer, 'utf8');
console.log(`Successfully extracted ${processedLines.length} lines of client TypeScript to ${targetPath}`);
