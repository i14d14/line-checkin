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
      process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const sql = "UPDATE checkin_records SET status = 'CANCELLED' WHERE line_user_id = 'Ubd107bb3ba1b85a8086fc3b2250458e8' AND id IN (61, 62);";
fs.writeFileSync('temp_fix.sql', sql, 'utf8');
const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const res = spawnSync(cmd, ['wrangler', 'd1', 'execute', 'line-checkin-db', '--remote', '--file=./temp_fix.sql', '-y'], {
  env: process.env, shell: true, cwd: __dirname, encoding: 'utf8'
});
if (fs.existsSync('temp_fix.sql')) fs.unlinkSync('temp_fix.sql');
console.log(res.stdout);
