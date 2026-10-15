import { assertValidFlexBubble } from "../../utils/flex-validator";

export interface ReminderParams {
  userName: string;
  shiftTime: string;
  locationName: string;
  liffId?: string;
  diffMinutes?: number;
}

export function buildReminderFlexBubble(type: "IN" | "OUT", params: ReminderParams) {
  const { userName, shiftTime, locationName, liffId = "2011328810-vjUUBSYA", diffMinutes = 15 } = params;
  const isIn = type === "IN";

  const headerBgColor = isIn ? "#06C755" : "#3182CE";
  const titleText = isIn ? "⏰ 上班打卡提醒" : "🔔 下班防漏打卡提醒";
  const subText = isIn
    ? `預計上班：${shiftTime}（約 ${diffMinutes} 分鐘後）`
    : `排定下班：${shiftTime}（班次已結束）`;
  const messageBody = isIn
    ? `親愛的 ${userName}，今日排定為工作日，上班時間即將到來，請記得透過 LINE 打卡！`
    : `親愛的 ${userName}，今日班次已告一段落，請記得進行下班打卡以計算今日完整工時！`;
  const buttonColor = isIn ? "#06C755" : "#3182CE";
  const buttonLabel = isIn ? "📱 立即前往打卡" : "📱 立即打下班卡";
  const altText = isIn
    ? `【上班打卡提醒】今日預計 ${shiftTime} 上班，請記得打卡！`
    : `【下班打卡提醒】班次已於 ${shiftTime} 結束，請記得打卡！`;

  const flexBubble: any = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: headerBgColor,
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: titleText,
          weight: "bold",
          size: "lg",
          color: "#ffffff",
        },
        {
          type: "text",
          text: subText,
          size: "xs",
          color: "#ffffffcc",
          margin: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: messageBody,
          size: "sm",
          color: "#4a5568",
          wrap: true,
        },
        {
          type: "separator",
          margin: "md",
          color: "#edf2f7",
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "員工姓名", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: userName, size: "sm", color: "#111111", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "預計門市", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: locationName, size: "sm", color: "#111111", weight: "bold", flex: 7, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: isIn ? "上班班別" : "下班時間", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: shiftTime, size: "sm", color: isIn ? "#06C755" : "#3182CE", weight: "bold", flex: 7 },
          ],
        },
      ],
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
          color: buttonColor,
          height: "sm",
          action: {
            type: "uri",
            label: buttonLabel,
            uri: `https://liff.line.me/${liffId}?tab=punch`,
          },
        },
      ],
    },
  };

  assertValidFlexBubble(flexBubble);

  return { flexBubble, altText };
}

export async function pushReminderMessage(
  accessToken: string,
  userId: string,
  type: "IN" | "OUT",
  params: ReminderParams
): Promise<boolean> {
  if (!accessToken || !userId) return false;
  const { flexBubble, altText } = buildReminderFlexBubble(type, params);

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [
          {
            type: "flex",
            altText,
            contents: flexBubble,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Failed to push ${type} reminder to ${userId}: HTTP ${res.status}`, errText);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Error pushing ${type} reminder to ${userId}:`, err);
    return false;
  }
}
