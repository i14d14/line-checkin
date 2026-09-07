# LINE Rich Menu API Reference

## 1. Specifications, Grid Dimensions & Typography
- **Supported Canvas Dimensions**:
  - Full size: `2500 x 1686` px (Aspect ratio ~1.48:1)
  - Compact size: `2500 x 843` px (Aspect ratio ~2.96:1)
- **Supported Formats**: JPEG, PNG (max 1 MB).
- **Common Button Grid Dimensions (2500px Canvas)**:
  - **Full 6-Grid (2x3)**: Columns ~`833, 834, 833` px, Rows `843, 843` px (each button `~833 x 843` px).
  - **Full 4-Grid (2x2)**: Width `1250` px, Height `843` px (each button `1250 x 843` px).
  - **Full Asymmetric (3-Grid)**: Left hero `1250 x 1686` px, Right top/bottom `1250 x 843` px.
  - **Compact 3-Grid (1x3)**: Width `~833` px, Height `843` px.
  - **Compact 2-Grid (1x2)**: Width `1250` px, Height `843` px.
- **Typography & Minimalist Layout Best Practices (at 2500px canvas)**:
  - **Primary CTA Text**: `80px – 120px` (bold sans-serif font, absolute vertical and horizontal center `anchor="mm"`).
  - **Zero Subtitles & Zero Mini Badges**: Completely eliminate all subtitles, descriptive captions, and top pill badges to maximize clean negative space.
  - **Theme Color & High Contrast**: Apply category theme colors directly to button backgrounds (pastel tints or brand solid bases) and primary CTA typography for clean aesthetics and accessibility.
  - **Font Weight & Family**: Bold sans-serif (e.g. Noto Sans CJK TC, Microsoft JhengHei Bold).
- **Character Count & Copywriting**:
  - **Button Visual Text**: **2 to 4 Chinese characters** (e.g.「考勤打卡」, 「排班月曆」, 「今日出勤」). Max 6 characters.
  - **Action Technical `label`**: Max 20 characters (accessibility / fallback).

---

## 2. Rich Menu JSON Object Definition

```json
{
  "size": {
    "width": 2500,
    "height": 1686
  },
  "selected": true,
  "name": "Employee-Attendance-Menu",
  "chatBarText": "打卡與服務選單",
  "areas": [
    {
      "bounds": { "x": 0, "y": 0, "width": 1250, "height": 843 },
      "action": {
        "type": "uri",
        "label": "上班打卡",
        "uri": "https://liff.line.me/2001234567-AbCdEfGh?type=clock_in"
      }
    },
    {
      "bounds": { "x": 1250, "y": 0, "width": 1250, "height": 843 },
      "action": {
        "type": "uri",
        "label": "下班打卡",
        "uri": "https://liff.line.me/2001234567-AbCdEfGh?type=clock_out"
      }
    },
    {
      "bounds": { "x": 0, "y": 843, "width": 1250, "height": 843 },
      "action": {
        "type": "uri",
        "label": "請假補卡",
        "uri": "https://liff.line.me/2001234567-AbCdEfGh?type=leave"
      }
    },
    {
      "bounds": { "x": 1250, "y": 843, "width": 1250, "height": 843 },
      "action": {
        "type": "message",
        "label": "出勤紀錄",
        "text": "查詢本月出勤"
      }
    }
  ]
}
```

---

## 3. Lifecycle Operations (Python SDK v3)

```python
import os
from linebot.v3.messaging import (
    Configuration,
    ApiClient,
    MessagingApi,
    MessagingApiBlob,
    RichMenuRequest,
    RichMenuSize,
    RichMenuArea,
    RichMenuBounds,
    URIAction,
    MessageAction
)

configuration = Configuration(access_token=os.environ['LINE_CHANNEL_ACCESS_TOKEN'])

def create_and_upload_rich_menu(image_path: str, liff_id: str) -> str:
    with ApiClient(configuration) as api_client:
        messaging_api = MessagingApi(api_client)
        messaging_blob_api = MessagingApiBlob(api_client)

        # 1. Define Rich Menu
        rich_menu_request = RichMenuRequest(
            size=RichMenuSize(width=2500, height=843),
            selected=True,
            name='Attendance-Compact-Menu',
            chat_bar_text='打卡選單',
            areas=[
                RichMenuArea(
                    bounds=RichMenuBounds(x=0, y=0, width=1250, height=843),
                    action=URIAction(uri=f'https://liff.line.me/{liff_id}')
                ),
                RichMenuArea(
                    bounds=RichMenuBounds(x=1250, y=0, width=1250, height=843),
                    action=MessageAction(text='查看出勤歷史')
                )
            ]
        )

        # 2. Create in LINE
        res = messaging_api.create_rich_menu(rich_menu_request)
        rich_menu_id = res.rich_menu_id

        # 3. Upload Image
        with open(image_path, 'rb') as f:
            image_data = f.read()
        messaging_blob_api.set_rich_menu_image(
            rich_menu_id=rich_menu_id,
            body=image_data,
            _headers={'Content-Type': 'image/png'}
        )

        # 4. Set as Default for all users
        messaging_api.set_default_rich_menu(rich_menu_id)
        
        return rich_menu_id
```

---

## 4. Design & Encoding Pitfalls

- **避免在 Rich Menu 圖稿或文字中使用 Emoji**：
  - 在製作圖稿（Pillow / Canvas）或設定 `chatBarText` / `action.label` 時，請勿置入 Emoji 表情符號。
  - 多數字型環境與 LINE 介面無法正確繪製彩色 Emoji，會導致字元遺失並直接顯示為 Unicode 缺字方塊（豆腐塊 `□`）。
  - **建議做法**：使用純文字搭配向量圖示（PNG / SVG 剪影）繪製於底圖上。

