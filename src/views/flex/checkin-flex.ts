export interface CheckinReceiptParams {
  accessToken: string;
  userId: string;
  userName: string;
  timeStr: string;
  distanceMeters: number;
  locationName: string;
  address: string;
  punchType?: "IN" | "OUT";
  workHours?: number | null;
  isDuplicate?: boolean;
  recordId?: number;
  originalTime?: string;
  verifyMode?: "IP_WHITELIST" | "GPS_FALLBACK" | "GPS_ONLY";
}

export function buildCheckinReceiptBubble(params: Omit<CheckinReceiptParams, "accessToken" | "userId">): any {
  const {
    userName,
    timeStr,
    distanceMeters,
    locationName,
    address,
    punchType = "IN",
    workHours = null,
    isDuplicate = false,
    recordId,
    originalTime,
    verifyMode = "GPS_ONLY",
  } = params;

  const isIn = punchType === "IN";
  const headerBgColor = isDuplicate ? "#718096" : (isIn ? "#06C755" : "#3182CE");
  const titleText = isDuplicate
    ? "🔄 重複打卡提醒 (維持原紀錄)"
    : (isIn ? "🟢 上班打卡成功" : "🔴 下班打卡成功");

  const modeBadgeText = verifyMode === "IP_WHITELIST"
    ? "🛡️ 公司固定網路 (Wi-Fi 驗證)"
    : (verifyMode === "GPS_FALLBACK" ? "📍 GPS 定位 (外網降級)" : "📍 GPS 地理圍欄");

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
          text: isDuplicate ? `前次打卡：${originalTime || timeStr}` : `打卡時間：${timeStr}`,
          size: "xs",
          color: "#ffffffcc",
          margin: "xs",
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            {
              type: "text",
              text: modeBadgeText,
              size: "xxs",
              color: "#ffffff",
              weight: "bold",
            }
          ]
        }
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
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
            { type: "text", text: "打卡據點", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: locationName, size: "sm", color: "#111111", weight: "bold", flex: 7, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "門市地址", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: address, size: "sm", color: "#555555", flex: 7, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "定位距離", size: "sm", color: "#8c8c8c", flex: 3 },
            { type: "text", text: `${Math.round(distanceMeters)} 公尺 (驗證通過)`, size: "sm", color: "#06C755", flex: 7 },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: [
        {
          type: "text",
          text: isDuplicate
            ? "💡 提示：重複打卡不影響出勤，系統維持首次有效打卡紀錄。"
            : "💡 提示：如打卡方向有誤，可於 30 秒內點擊下方按鈕修正或撤回。",
          size: "xxs",
          color: "#a0aec0",
          wrap: true,
          align: "center",
          margin: "xs",
        },
      ],
    },
  };

  if (!isIn && workHours !== null) {
    flexBubble.body.contents.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "當段工時", size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: `⏱️ ${workHours} 小時`, size: "sm", color: "#3182CE", weight: "bold", flex: 7 },
      ],
    });
  }

  if (recordId && !isDuplicate) {
    flexBubble.footer.contents.unshift({
      type: "box",
      layout: "horizontal",
      spacing: "md",
      margin: "md",
      contents: [
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "翻轉上下班",
            data: `action=flip&recordId=${recordId}`,
            displayText: `我想更正為${isIn ? "下班" : "上班"}`,
          },
          flex: 1,
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          color: "#718096",
          action: {
            type: "postback",
            label: "🗑️ 撤回打卡",
            data: `action=undo&recordId=${recordId}`,
            displayText: "我想撤回剛才的打卡",
          },
          flex: 1,
        },
      ],
    });
  }

  return flexBubble;
}

export interface CheckinFlexMessagePayload {
  type: "flex";
  altText: string;
  contents: any;
}

// Build standard LINE Flex Message object (ready for liff.sendMessages or push API)
export function buildCheckinFlexMessage(
  params: Omit<CheckinReceiptParams, "accessToken" | "userId">
): CheckinFlexMessagePayload {
  const {
    userName,
    timeStr,
    locationName,
    punchType = "IN",
    isDuplicate = false,
  } = params;

  const flexBubble = buildCheckinReceiptBubble(params);
  const isIn = punchType === "IN";
  const titleText = isDuplicate
    ? "🔄 重複打卡提醒 (維持原紀錄)"
    : (isIn ? "🟢 上班打卡成功" : "🔴 下班打卡成功");

  return {
    type: "flex",
    altText: `${titleText}：${userName} - ${locationName} (${timeStr})`,
    contents: flexBubble,
  };
}

// Push Check-in Receipt Flex Message to User (Legacy / Optional Push)
export async function pushCheckinReceipt(
  accessToken: string,
  userId: string,
  userName: string,
  timeStr: string,
  distanceMeters: number,
  locationName: string,
  address: string,
  punchType: "IN" | "OUT" = "IN",
  workHours: number | null = null,
  isDuplicate: boolean = false,
  recordId?: number,
  originalTime?: string,
  verifyMode: "IP_WHITELIST" | "GPS_FALLBACK" | "GPS_ONLY" = "GPS_ONLY"
) {
  if (!accessToken || !userId) return;

  const flexMessage = buildCheckinFlexMessage({
    userName,
    timeStr,
    distanceMeters,
    locationName,
    address,
    punchType,
    workHours,
    isDuplicate,
    recordId,
    originalTime,
    verifyMode,
  });

  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [flexMessage],
      }),
    });
  } catch (e) {
    console.error("Failed to push Flex message:", e);
  }
}
