const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

let browserPath = EDGE_PATHS.find(p => fs.existsSync(p));
if (!browserPath) {
  console.error("Error: Neither Microsoft Edge nor Google Chrome was found.");
  process.exit(1);
}

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const OUTPUT_DIR = __dirname;
const TEMP_USER_DIR = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'edge_richmenu_render');

if (!fs.existsSync(TEMP_USER_DIR)) {
  fs.mkdirSync(TEMP_USER_DIR, { recursive: true });
}

const MENUS = [
  {
    template: 'richmenu_employee.html',
    output: 'richmenu_employee.png',
    width: 2500,
    height: 843
  },
  {
    template: 'richmenu_onboarding.html',
    output: 'richmenu_onboarding.png',
    width: 2500,
    height: 843
  },
  {
    template: 'richmenu_manager.html',
    output: 'richmenu_manager.png',
    width: 2500,
    height: 1686
  }
];

console.log(`Using Browser Engine: ${browserPath}`);
console.log(`Temp User Profile: ${TEMP_USER_DIR}`);

for (const menu of MENUS) {
  const htmlPath = path.join(TEMPLATES_DIR, menu.template);
  const pngPath = path.join(OUTPUT_DIR, menu.output);
  const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;

  console.log(`\nRendering ${menu.template} -> ${menu.output} (${menu.width}x${menu.height})...`);
  if (fs.existsSync(pngPath)) {
    fs.unlinkSync(pngPath);
  }

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    `--screenshot=${pngPath}`,
    `--window-size=${menu.width},${menu.height}`,
    `--user-data-dir=${TEMP_USER_DIR}`,
    fileUrl
  ];

  try {
    execFileSync(browserPath, args, { stdio: 'inherit' });
  } catch (err) {
    // Edge may exit with code 0 or throw if stderr output is captured
  }

  if (fs.existsSync(pngPath)) {
    const stats = fs.statSync(pngPath);
    console.log(`  Successfully generated: ${menu.output} (${stats.size} bytes)`);
  } else {
    console.error(`  Failed to generate: ${menu.output}`);
    process.exit(1);
  }
}

console.log("\nAll 3 Rich Menu images rendered successfully!");
