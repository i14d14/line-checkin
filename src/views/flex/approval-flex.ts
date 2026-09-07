import { ApprovalType, ApprovalStatus } from "../../types";

export function buildApprovalRequestFlex(
  approvalId: string,
  type: ApprovalType,
  applicantName: string,
  companyName: string,
  targetDate: string,
  details: Record<string, any>
) {
  const typeConfig: Record<string, { title: string; color: string; label: string }> = {
    LEAVE: { title: "🌴 員工請假申請", color: "#D69E2E", label: "請假申請" },
    CORRECTION: { title: "⏰ 考勤補卡申請", color: "#3182CE", label: "補卡申請" },
    OVERTIME: { title: "🔥 員工加班申請", color: "#805AD5", label: "加班申請" },
  };
  const currentConfig = typeConfig[type] || { title: "📋 考勤審批申請", color: "#4A5568", label: "其他申請" };

  const detailItems: { label: string; value: string; color?: string }[] = [];

  if (type === "LEAVE") {
    detailItems.push(
      { label: "請假類別", value: details.leave_type || "事假", color: "#D69E2E" },
      { label: "請假時段", value: details.time_range || "全天" }
    );
  } else if (type === "CORRECTION") {
    const punchLabel = details.punch_type === "OUT" ? "🔴 下班卡 (OUT)" : "🟢 上班卡 (IN)";
    detailItems.push(
      { label: "補卡方向", value: punchLabel, color: details.punch_type === "OUT" ? "#E53E3E" : "#38A169" },
      { label: "補正時間", value: details.time || "09:00" },
      ...(details.work_hours ? [{ label: "補正工時", value: `${details.work_hours} 小時` }] : [])
    );
  } else if (type === "OVERTIME") {
    detailItems.push(
      { label: "預計時數", value: `${details.hours || 1} 小時`, color: "#805AD5" },
      { label: "加班時段", value: details.time_range || "下班後" }
    );
  }

  detailItems.push({ label: "申請事由", value: details.reason || "無說明" });

  const bodyContents: any[] = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "申請同仁", size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: applicantName, size: "sm", color: "#111111", weight: "bold", flex: 7 },
      ],
    },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "所屬門市", size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: companyName, size: "sm", color: "#111111", weight: "bold", flex: 7, wrap: true },
      ],
    },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "申請日期", size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: targetDate, size: "sm", color: "#111111", weight: "bold", flex: 7 },
      ],
    },
    { type: "separator", margin: "md" }
  ];

  for (const item of detailItems) {
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      margin: "md",
      contents: [
        { type: "text", text: item.label, size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: item.value, size: "sm", color: item.color || "#333333", weight: item.color ? "bold" : "regular", flex: 7, wrap: true },
      ],
    });
  }

  if (details.attachment_url || details.attachment_key) {
    const rawUrl = details.attachment_url || `/api/v1/attachments/${details.attachment_key}`;
    const fullAttachmentUrl = rawUrl.startsWith("http")
      ? rawUrl
      : `https://line-checkin-worker.i14d142.workers.dev${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;

    bodyContents.push(
      { type: "separator", margin: "md" },
      {
        type: "box",
        layout: "vertical",
        margin: "md",
        contents: [
          {
            type: "button",
            style: "secondary",
            color: "#3182CE",
            height: "sm",
            action: {
              type: "uri",
              label: "📎 查看證明文件",
              uri: fullAttachmentUrl,
            },
          },
        ],
      }
    );
  }

  return {
    flexBubble: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: currentConfig.color,
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: currentConfig.title,
            weight: "bold",
            size: "lg",
            color: "#ffffff",
          },
          {
            type: "text",
            text: `單號：${approvalId}`,
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
        spacing: "xs",
        contents: bodyContents,
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "md",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#06C755",
                height: "sm",
                action: {
                  type: "postback",
                  label: "✅ 核准通過",
                  data: `action=approve&id=${approvalId}`,
                  displayText: `核准【${applicantName}】的${currentConfig.label}`,
                },
                flex: 1,
              },
              {
                type: "button",
                style: "secondary",
                color: "#E53E3E",
                height: "sm",
                action: {
                  type: "postback",
                  label: "❌ 駁回申請",
                  data: `action=reject_prompt&id=${approvalId}`,
                  inputOption: "openKeyboard",
                  fillInText: `【駁回 #${approvalId}】原因：`,
                },
                flex: 1,
              },
            ],
          },
          {
            type: "text",
            text: "💡 提示：點擊核准後即刻生效；點擊駁回將開啟鍵盤輸入具體原因。",
            size: "xxs",
            color: "#a0aec0",
            align: "center",
            margin: "sm",
            wrap: true,
          },
        ],
      },
    },
    altText: `【簽核通知】${applicantName} 提交了${currentConfig.label} (${targetDate})`
  };
}

export async function pushApprovalRequestFlex(
  accessToken: string,
  approverId: string,
  approvalId: string,
  type: ApprovalType,
  applicantName: string,
  companyName: string,
  targetDate: string,
  details: Record<string, any>
) {
  if (!accessToken || !approverId) return;
  const { flexBubble, altText } = buildApprovalRequestFlex(approvalId, type, applicantName, companyName, targetDate, details);

  try {
    const resp = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: approverId,
        messages: [
          {
            type: "flex",
            altText,
            contents: flexBubble,
          },
        ],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`Failed to push approval flex message: [${resp.status}] ${errText}`);
    }
  } catch (e) {
    console.error("Failed to push Approval Request Flex message:", e);
  }
}

export function buildApprovalResultFlex(
  applicantName: string,
  type: string,
  targetDate: string,
  status: "APPROVED" | "REJECTED",
  rejectReason?: string
) {
  const isApproved = status === "APPROVED";
  const headerBgColor = isApproved ? "#06C755" : "#4A5568";
  const titleText = isApproved ? "✅ 簽核申請已通過" : "📋 簽核申請未通過 (駁回)";
  const typeText = type === "LEAVE" ? "請假申請" : (type === "CORRECTION" ? "補卡申請" : "加班申請");

  const bodyContents: any[] = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "申請項目", size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: typeText, size: "sm", color: "#111111", weight: "bold", flex: 7 },
      ],
    },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "涉及日期", size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: targetDate, size: "sm", color: "#111111", weight: "bold", flex: 7 },
      ],
    },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "審查結果", size: "sm", color: "#8c8c8c", flex: 3 },
        { type: "text", text: isApproved ? "已核准並生效" : "主管已駁回", size: "sm", color: isApproved ? "#06C755" : "#111111", weight: "bold", flex: 7 },
      ],
    },
  ];

  if (!isApproved && rejectReason) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#F1F5F9",
      borderColor: "#CBD5E1",
      borderWidth: "1px",
      cornerRadius: "8px",
      paddingAll: "12px",
      margin: "md",
      contents: [
        {
          type: "text",
          text: "📌 駁回原因 / 主管意見：",
          size: "xs",
          color: "#475569",
          weight: "bold",
        },
        {
          type: "text",
          text: rejectReason,
          size: "sm",
          color: "#1E293B",
          wrap: true,
          margin: "xs",
        },
      ],
    });
  }

  bodyContents.push({
    type: "text",
    text: isApproved
      ? "🎉 出勤紀錄與班表已自動同步更新，您可開啟出勤月曆查看最新狀態。"
      : "ℹ️ 如有疑問請洽您的直屬主管或門市店長確認。",
    size: "xs",
    color: "#718096",
    margin: "sm",
    wrap: true,
  });

  const flexBubble = {
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
          text: `通知對象：${applicantName}`,
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
      contents: bodyContents,
    },
  };

  const altText = (!isApproved && rejectReason)
    ? `【審核結果】您的${typeText} (${targetDate})：已駁回（原因：${rejectReason}）`
    : `【審核結果】您的${typeText} (${targetDate})：${isApproved ? "已核准" : "已駁回"}`;

  return {
    flexBubble,
    altText
  };
}

export async function pushApprovalResultFlex(
  accessToken: string,
  applicantId: string,
  applicantName: string,
  type: string,
  targetDate: string,
  status: "APPROVED" | "REJECTED",
  rejectReason?: string
) {
  if (!accessToken || !applicantId) return;
  const { flexBubble, altText } = buildApprovalResultFlex(applicantName, type, targetDate, status, rejectReason);

  try {
    const resp = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: applicantId,
        messages: [
          {
            type: "flex",
            altText,
            contents: flexBubble,
          },
        ],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`Failed to push approval result flex message: [${resp.status}] ${errText}`);
    }
  } catch (e) {
    console.error("Failed to push Approval Result Flex message:", e);
  }
}

export const buildManagerApprovalCard = buildApprovalRequestFlex;
