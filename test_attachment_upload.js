const { spawnSync } = require('child_process');
const path = require('path');

const tsFile = path.resolve(__dirname, 'test_attachment_upload.ts');
const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const res = spawnSync(cmd, ['tsx', tsFile], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname,
});

process.exit(res.status ?? 0);
