# LINE Flex Message Templates & Syntax

## 1. Overview
Flex Messages are customizable messages with a flexible container layout based on CSS Flexible Box (Flexbox).
Test & design visually at: [LINE Flex Message Simulator](https://developers.line.biz/flex-simulator/)

---

## 2. Clock-In Attendance Receipt Template (JSON)

```json
{
  "type": "bubble",
  "header": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#06C755",
    "contents": [
      {
        "type": "text",
        "text": "打卡成功通知",
        "weight": "bold",
        "color": "#FFFFFF",
        "size": "lg"
      }
    ]
  },
  "body": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "text",
        "text": "上班打卡已記錄",
        "weight": "bold",
        "size": "md",
        "color": "#1DB446"
      },
      {
        "type": "separator",
        "margin": "md"
      },
      {
        "type": "box",
        "layout": "vertical",
        "margin": "md",
        "spacing": "sm",
        "contents": [
          {
            "type": "box",
            "layout": "baseline",
            "contents": [
              { "type": "text", "text": "員工姓名", "color": "#aaaaaa", "size": "sm", "flex": 3 },
              { "type": "text", "text": "王小明", "weight": "bold", "color": "#666666", "size": "sm", "flex": 7 }
            ]
          },
          {
            "type": "box",
            "layout": "baseline",
            "contents": [
              { "type": "text", "text": "打卡時間", "color": "#aaaaaa", "size": "sm", "flex": 3 },
              { "type": "text", "text": "2026-08-30 08:30:15", "color": "#666666", "size": "sm", "flex": 7 }
            ]
          },
          {
            "type": "box",
            "layout": "baseline",
            "contents": [
              { "type": "text", "text": "打卡地點", "color": "#aaaaaa", "size": "sm", "flex": 3 },
              { "type": "text", "text": "台北總部辦公室 (GPS)", "color": "#666666", "size": "sm", "flex": 7 }
            ]
          }
        ]
      }
    ]
  },
  "footer": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "button",
        "style": "secondary",
        "height": "sm",
        "action": {
          "type": "uri",
          "label": "查看本月出勤月曆",
          "uri": "https://liff.line.me/YOUR_LIFF_ID"
        }
      }
    ]
  }
}
```

---

## 3. Manager Leave Request Approval Card (JSON)

```json
{
  "type": "bubble",
  "header": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#007BFF",
    "contents": [
      {
        "type": "text",
        "text": "請假審核通知",
        "weight": "bold",
        "color": "#FFFFFF",
        "size": "lg"
      }
    ]
  },
  "body": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "text",
        "text": "員工 王小明 提出請假申請",
        "weight": "bold",
        "size": "md"
      },
      {
        "type": "box",
        "layout": "vertical",
        "margin": "md",
        "spacing": "xs",
        "contents": [
          { "type": "text", "text": "假別：特休 (8 小時)", "size": "sm", "color": "#555555" },
          { "type": "text", "text": "日期：2026-09-01", "size": "sm", "color": "#555555" },
          { "type": "text", "text": "事由：個人事務", "size": "sm", "color": "#555555" }
        ]
      }
    ]
  },
  "footer": {
    "type": "box",
    "layout": "horizontal",
    "spacing": "md",
    "contents": [
      {
        "type": "button",
        "style": "primary",
        "color": "#06C755",
        "height": "sm",
        "action": {
          "type": "postback",
          "label": "核准",
          "data": "action=approve_leave&id=REQ12345"
        }
      },
      {
        "type": "button",
        "style": "primary",
        "color": "#E53935",
        "height": "sm",
        "action": {
          "type": "postback",
          "label": "駁回",
          "data": "action=reject_leave&id=REQ12345"
        }
      }
    ]
  }
}
```
