# LINE Front-end Framework (LIFF v2) Reference & Syntax

## 1. Installation & CDN Loading

### CDN
```html
<script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
```

### NPM / Yarn
```bash
npm install @line/liff
```
```javascript
import liff from '@line/liff';
```

---

## 2. Core LIFF Methods & Lifecycle

| Method | Description | Return Type | Requirements / Notes |
| :--- | :--- | :--- | :--- |
| `liff.init({ liffId })` | Initializes the LIFF SDK | `Promise<void>` | **Must be called first** before any other method |
| `liff.isLoggedIn()` | Checks if user is authenticated | `boolean` | `true` inside LINE app; `false` in external browser if not logged in |
| `liff.login({ redirectUri })` | Triggers LINE Login flow | `void` | Used for external browsers |
| `liff.logout()` | Logs out current user | `void` | Clears local login tokens |
| `liff.getProfile()` | Returns basic profile | `Promise<Profile>` | Requires `profile` scope. Returns `{ userId, displayName, pictureUrl, statusMessage }` |
| `liff.getIDToken()` | Returns raw JWT ID Token | `string` | Requires `openid` scope. Send to backend for verification |
| `liff.getDecodedIDToken()` | Returns decoded JWT payload | `object` | Decoded on client (contains `sub`, `name`, `picture`, `email`) |
| `liff.getContext()` | Returns execution environment context | `object` | Returns `{ type: 'utou'|'room'|'group'|'none', viewType: 'full'|'tall'|'compact', userId, ... }` |
| `liff.getFriendship()` | Checks if user added official account | `Promise<{ friendFlag: boolean }>` | Requires linked OA in console |
| `liff.sendMessages(messages)` | Sends message to current chat room | `Promise<void>` | Requires `chat_message.write` scope. Only works inside LINE app |
| `liff.closeWindow()` | Closes the LIFF in-app webview | `void` | Only works inside LINE in-app browser |
| `liff.openWindow({ url, external })` | Opens target URL | `void` | `external: true` forces opening in external browser |

---

## 3. Standard LIFF Initialization Pattern

```javascript
async function initializeLiffApp(liffId) {
  try {
    await liff.init({ liffId });

    if (!liff.isLoggedIn()) {
      // In external browser, redirect to LINE login
      liff.login();
      return;
    }

    const profile = await liff.getProfile();
    const idToken = liff.getIDToken();
    const context = liff.getContext();

    console.log('Logged in user:', profile.displayName, profile.userId);
    return { profile, idToken, context };
  } catch (err) {
    console.error('LIFF initialization failed:', err);
    throw err;
  }
}
```

---

## 4. GPS Location Attendance Pattern (JavaScript)

```javascript
function getCurrentGPSLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this device.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

async function submitClockIn(liffId, apiEndpoint) {
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login();
    return;
  }

  const profile = await liff.getProfile();
  const idToken = liff.getIDToken();
  const gps = await getCurrentGPSLocation();

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lineUserId: profile.userId,
      idToken: idToken,
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracy: gps.accuracy
    })
  });

  const data = await response.json();
  if (response.ok && data.success) {
    alert('打卡成功！');
    if (liff.isInClient()) {
      liff.closeWindow();
    }
  } else {
    alert(`打卡失敗: ${data.message}`);
  }
}
```
