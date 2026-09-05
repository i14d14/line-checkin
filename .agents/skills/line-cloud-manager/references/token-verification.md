# LINE Login & ID Token Verification Reference

## 1. Overview
When a LIFF app or LINE Login web client sends a user ID to your backend, **never trust client-submitted `lineUserId` directly**. Always require the `idToken` from `liff.getIDToken()` and verify it on your backend server.

---

## 2. Official Verification Endpoint

* **URL**: `POST https://api.line.me/oauth2/v2.1/verify`
* **Content-Type**: `application/x-www-form-urlencoded`
* **Request Body Parameters**:
  - `id_token` (string, required): The JWT ID token obtained from LIFF.
  - `client_id` (string, required): Your LINE Login Channel ID.

### cURL Example
```bash
curl -v -X POST 'https://api.line.me/oauth2/v2.1/verify'   -H 'Content-Type: application/x-www-form-urlencoded'   --data-urlencode 'id_token=SAMPLE_LINE_ID_TOKEN_HERE'   --data-urlencode 'client_id=2001234568'
```

---

## 3. Verification Response Schema

```json
{
  "iss": "https://access.line.me",
  "sub": "U1234567890abcdef1234567890abcdef",
  "aud": "2001234568",
  "exp": 1756543200,
  "iat": 1756539600,
  "nonce": "optional_nonce",
  "name": "王小明",
  "picture": "https://profile.line-scdn.net/...",
  "email": "user@example.com"
}
```

### Claims Checklist:
1. `iss`: Must equal `https://access.line.me`.
2. `aud`: Must equal your `LINE_LOGIN_CHANNEL_ID`.
3. `sub`: The authentic LINE User ID (`userId`).
4. `exp`: Expiration epoch timestamp (must be > `time.time()`).

---

## 4. Backend Verification Implementations

### Python (FastAPI / Requests)
```python
import os
import time
import requests
from fastapi import HTTPException

LINE_LOGIN_CHANNEL_ID = os.environ["LINE_LOGIN_CHANNEL_ID"]

def verify_line_id_token(id_token: str) -> dict:
    url = "https://api.line.me/oauth2/v2.1/verify"
    payload = {
        "id_token": id_token,
        "client_id": LINE_LOGIN_CHANNEL_ID
    }
    
    response = requests.post(url, data=payload, timeout=5)
    
    if response.status_code != 200:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid LINE ID Token: {response.text}"
        )
    
    data = response.json()
    
    # Security validations
    if data.get("iss") != "https://access.line.me":
        raise HTTPException(status_code=401, detail="Invalid token issuer")
    if data.get("aud") != LINE_LOGIN_CHANNEL_ID:
        raise HTTPException(status_code=401, detail="Token audience mismatch")
    if data.get("exp", 0) < time.time():
        raise HTTPException(status_code=401, detail="Token has expired")
        
    return data
```

### Node.js (TypeScript / Express)
```typescript
import axios from 'axios';

interface LineTokenPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  name?: string;
  picture?: string;
  email?: string;
}

export async function verifyLineIdToken(idToken: string): Promise<LineTokenPayload> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  
  const params = new URLSearchParams();
  params.append('id_token', idToken);
  params.append('client_id', channelId!);

  const response = await axios.post<LineTokenPayload>(
    'https://api.line.me/oauth2/v2.1/verify',
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const payload = response.data;
  if (payload.iss !== 'https://access.line.me' || payload.aud !== channelId) {
    throw new Error('LINE token validation failed: Issuer or Audience mismatch');
  }

  return payload;
}
```
