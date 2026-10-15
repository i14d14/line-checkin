import { assertValidFlexBubble } from "../../utils/flex-validator";

export interface AnnouncementFlexParams {
  id: string;
  title: string;
  content: string;
  author_name: string;
  created_at?: string;
}

/**
 * Builds an enterprise-grade LINE Flex Message Bubble for Company Announcements.
 * Theme: Professional Navy (#0F172A) & Emerald (#10B981) with Amber (#F59E0B) Priority Badge.
 */
export function buildAnnouncementFlexBubble(
  announcement: AnnouncementFlexParams,
  isReminder: boolean = false
) {
  const { id, title, content, author_name, created_at } = announcement;
  const timeStr = created_at || new Date().toISOString().replace("T", " ").substring(0, 16);

  const badgeText = isReminder ? "🔔 重要公告催簽提醒" : "📢 企業重要通知";
  const badgeColor = isReminder ? "#EF4444" : "#F59E0B";
  const altText = isReminder
    ? `【催簽提醒】請完成企業公告簽收：「${title}」`
    : `【企業重要公告】${title}（請點擊簽收）`;

  const flexBubble: any = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#0F172A",
      paddingAll: "20px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: badgeText,
              size: "xs",
              color: badgeColor,
              weight: "bold",
              flex: 1
            }
          ]
        },
        {
          type: "text",
          text: title,
          weight: "bold",
          size: "lg",
          color: "#FFFFFF",
          wrap: true,
          margin: "sm"
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            {
              type: "text",
              text: `發布單位：${author_name}`,
              size: "xs",
              color: "#94A3B8",
              flex: 6
            },
            {
              type: "text",
              text: timeStr.substring(0, 16),
              size: "xs",
              color: "#64748B",
              align: "end",
              flex: 5
            }
          ]
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: content,
          size: "sm",
          color: "#334155",
          wrap: true,
          lineSpacing: "5px"
        },
        {
          type: "separator",
          margin: "lg",
          color: "#E2E8F0"
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            {
              type: "text",
              text: "📌 本通知為公司重要事項，請點擊下方按鈕完成閱讀與簽收確認。簽收紀錄將即時回報人事後台。",
              size: "xxs",
              color: "#64748B",
              wrap: true
            }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "20px",
      paddingTop: "0px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#10B981",
          height: "sm",
          action: {
            type: "postback",
            label: "✍️ 我已閱讀並簽收",
            data: `action=ack_announcement&id=${encodeURIComponent(id)}`,
            displayText: "已閱讀並完成簽收"
          }
        }
      ]
    }
  };

  assertValidFlexBubble(flexBubble);

  return { flexBubble, altText };
}
