# LINE Messaging API (v3) Reference & Syntax

## 1. Installation & Environment

### Python (line-bot-sdk >= 3.0.0)
```bash
pip install line-bot-sdk
```

### Node.js (@line/bot-sdk >= 8.0.0)
```bash
npm install @line/bot-sdk
```

---

## 2. Webhook Handling & Signature Verification

### Python (FastAPI)
```python
import os
from fastapi import FastAPI, Request, HTTPException, Header
from linebot.v3 import WebhookHandler
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.webhooks import (
    MessageEvent,
    TextMessageContent,
    FollowEvent,
    UnfollowEvent,
    PostbackEvent
)
from linebot.v3.messaging import (
    Configuration,
    ApiClient,
    MessagingApi,
    ReplyMessageRequest,
    PushMessageRequest,
    TextMessage,
    FlexMessage
)

app = FastAPI()
configuration = Configuration(access_token=os.environ['LINE_CHANNEL_ACCESS_TOKEN'])
handler = WebhookHandler(os.environ['LINE_CHANNEL_SECRET'])

@app.post('/api/line/webhook')
async def line_webhook(request: Request, x_line_signature: str = Header(None)):
    if not x_line_signature:
        raise HTTPException(status_code=400, detail='Missing X-Line-Signature header')
    
    # Must use raw bytes or decoded utf-8 text
    body = (await request.body()).decode('utf-8')
    
    try:
        handler.handle(body, x_line_signature)
    except InvalidSignatureError:
        raise HTTPException(status_code=400, detail='Invalid signature')
    
    return {'status': 'OK'}

@handler.add(MessageEvent, message=TextMessageContent)
def handle_text_message(event: MessageEvent):
    user_text = event.message.text.strip()
    reply_token = event.reply_token
    user_id = event.source.user_id
    
    with ApiClient(configuration) as api_client:
        line_bot_api = MessagingApi(api_client)
        line_bot_api.reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[TextMessage(text=f'收到您的訊息：{user_text}')]
            )
        )

@handler.add(FollowEvent)
def handle_follow(event: FollowEvent):
    line_user_id = event.source.user_id
    # Save or update user follow status in DB

@handler.add(PostbackEvent)
def handle_postback(event: PostbackEvent):
    postback_data = event.postback.data
    # Process rich menu or button postbacks
```

### Node.js (Express)
```javascript
const express = require('express');
const { middleware, messagingApi } = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const app = express();
const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

app.post('/api/line/webhook', middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook error:', err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `收到：${event.message.text}` }]
    });
  }
}
```

---

## 3. Message Delivery Methods

### Reply Message (Free quota)
```python
with ApiClient(configuration) as api_client:
    line_bot_api = MessagingApi(api_client)
    line_bot_api.reply_message(
        ReplyMessageRequest(
            reply_token=reply_token,
            messages=[TextMessage(text='回覆內容')]
        )
    )
```

### Push Message (Direct message to 1 user)
```python
with ApiClient(configuration) as api_client:
    line_bot_api = MessagingApi(api_client)
    line_bot_api.push_message(
        PushMessageRequest(
            to=line_user_id,
            messages=[TextMessage(text='推播通知')]
        )
    )
```

### Multicast Message (Direct message up to 500 users)
```python
from linebot.v3.messaging import MulticastRequest

with ApiClient(configuration) as api_client:
    line_bot_api = MessagingApi(api_client)
    line_bot_api.multicast(
        MulticastRequest(
            to=['U12345...', 'U67890...'],
            messages=[TextMessage(text='全體群發通知')]
        )
    )
```
