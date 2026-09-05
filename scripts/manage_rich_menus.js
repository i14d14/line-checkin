const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../../.env');
const lines = fs.readFileSync(envPath, 'utf8').split('\n');
let token = "";
for (const line of lines) {
  if (line.trim().startsWith('LINE_CHANNEL_ACCESS_TOKEN=')) {
    token = line.trim().split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
}

async function listMenus() {
  const resp = await fetch('https://api.line.me/v2/bot/richmenu/list', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json();
  console.log("Current Rich Menus:", JSON.stringify(data, null, 2));

  // Download existing menu image
  if (data.richmenus && data.richmenus.length > 0) {
    const id = data.richmenus[0].richMenuId;
    const imgResp = await fetch(`https://api-data.line.me/v2/bot/richmenu/${id}/content`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (imgResp.ok) {
      const buf = Buffer.from(await imgResp.arrayBuffer());
      fs.writeFileSync(path.join(__dirname, 'existing_menu.png'), buf);
      console.log(`Downloaded ${id} image, size: ${buf.length} bytes`);
    }
  }

  // Test linking user
  const realUserId = "Ubd107bb3ba1b85a8086fc3b2250458e8";
  const mgrMenuId = "richmenu-5a6656c207df95b9c5d29e7be0e2af5c";
  const linkResp = await fetch(`https://api.line.me/v2/bot/user/${realUserId}/richmenu/${mgrMenuId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`Link test for real user ${realUserId}: status ${linkResp.status} ${await linkResp.text()}`);

  const checkResp = await fetch(`https://api.line.me/v2/bot/user/${realUserId}/richmenu`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`Check linked menu for ${realUserId}: status ${checkResp.status} ${await checkResp.text()}`);
}

listMenus().catch(console.error);
