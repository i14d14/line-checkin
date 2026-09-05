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

const args = process.argv.slice(2);
const isWin = process.platform === 'win32';
const cmd = isWin ? 'npx.cmd' : 'npx';

const result = spawnSync(cmd, ['--yes', 'wrangler', ...args], {
  stdio: 'inherit',
  env: process.env,
  shell: true,
  cwd: __dirname
});
process.exit(result.status || 0);
