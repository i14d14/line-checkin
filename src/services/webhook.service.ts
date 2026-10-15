import { Env, ALL_PERMISSIONS, PERMISSION_LABELS } from "../types";
import { ApprovalService } from "./approval.service";
import { AnnouncementService } from "./announcement.service";
import { getUserPermissionContext, hasPermission } from "./tenant.service";

// Helper to reply LINE Message
export async function replyLineMessage(accessToken: string, replyToken: string, text: string): Promise<void> {
  if (!accessToken || !replyToken) return;
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    });
  } catch (e) {
    console.error("Reply LINE failed:", e);
  }
}

export class WebhookService {
  constructor(private env: Env) {}

  async handleEvent(event: any, clientIp: string, userAgent: string): Promise<void> {
    const userId = event.source?.userId;
    const replyToken = event.replyToken;
    if (!userId) return;

    const token = this.env.LINE_CHANNEL_ACCESS_TOKEN || "";

    // 1. Handle Follow / Add Friend Event
    if (event.type === "follow") {
      if (replyToken) {
        await replyLineMessage(
          token,
          replyToken,
          "👋 您好！歡迎使用雲端考勤打卡系統。\n\n" +
          "📌 【新進同仁】：請點擊下方圖文選單的【考勤打卡】完成門市入職登記。\n" +
          "📌 【日常出勤】：每日上下班點擊下方選單【考勤打卡】即可快速 GPS / Wi-Fi 打卡。\n" +
          "📌 【排班與簽核】：點擊下方選單【排班月曆】可查閱班表，【線上簽核】可隨時提出請假、補卡或加班申請。"
        );
      }
      return;
    }

    // 2. Handle Postback Events
    if (event.type === "postback") {
      const params = new URLSearchParams(event.postback.data || "");
      const action = params.get("action");

      // In-Chat BPM Approval Actions (Approve / Reject / Reject Prompt)
      if (action === "reject_prompt") {
        // Native openKeyboardWithMessage action triggered in LINE client.
        // No text reply needed to keep the input area clean.
        return;
      }

      if (action === "approve" || action === "reject") {
        const approvalId = params.get("id");
        if (!approvalId) {
          if (replyToken) await replyLineMessage(token, replyToken, "⚠️ 審批參數錯誤：缺少單號。");
          return;
        }

        const approvalService = new ApprovalService(this.env);
        const decisionResult = await approvalService.processDecision(approvalId, action, userId, clientIp, userAgent);
        if (replyToken) {
          await replyLineMessage(token, replyToken, decisionResult.replyMessage);
        }
        return;
      }

      // Company Announcement Read Receipt Acknowledgement
      if (action === "ack_announcement") {
        const announcementId = params.get("id");
        if (!announcementId) {
          if (replyToken) await replyLineMessage(token, replyToken, "⚠️ 簽收參數錯誤：缺少公告編號。");
          return;
        }

        const announcementService = new AnnouncementService(this.env);
        const result = await announcementService.acknowledgeAnnouncement(announcementId, userId);

        if (replyToken) {
          if (result.success) {
            if (result.isFirstTime) {
              await replyLineMessage(
                token,
                replyToken,
                `✅ 【簽收完成】您已成功簽收公告「${result.announcementTitle}」，紀錄已回傳管理後台。`
              );
            } else {
              await replyLineMessage(
                token,
                replyToken,
                `ℹ️ 【提醒】您先前已於 ${result.readAt} 完成簽收此公告。`
              );
            }
          } else {
            await replyLineMessage(token, replyToken, "❌ 查無此公告或簽收失敗。");
          }
        }
        return;
      }

      const recordId = parseInt(params.get("recordId") || params.get("record_id") || "0", 10);

      if (recordId && (action === "flip" || action === "undo")) {
        const record = await this.env.DB.prepare(`
          SELECT id, line_user_id, display_name, status, punch_type, work_hours, created_at,
                 (julianday('now', '+8 hours') - julianday(created_at)) * 86400 AS delta_seconds
          FROM checkin_records
          WHERE id = ? AND line_user_id = ?
        `).bind(recordId, userId).first<{
          id: number;
          line_user_id: string;
          display_name: string;
          status: string;
          punch_type: string;
          work_hours: number | null;
          created_at: string;
          delta_seconds: number;
        }>();

        if (!record) {
          if (replyToken) await replyLineMessage(token, replyToken, "❌ 查無此筆打卡紀錄。");
          return;
        }

        if (record.status === "CANCELLED") {
          if (replyToken) await replyLineMessage(token, replyToken, `ℹ️ 此筆打卡紀錄已被撤回（原打卡時間：${record.created_at}）。`);
          return;
        }

        if (record.status === "DUPLICATE") {
          if (replyToken) await replyLineMessage(token, replyToken, "⚠️ 重複打卡紀錄不支援翻轉或撤回。如需補正請洽後台主管。");
          return;
        }

        if (record.status !== "SUCCESS") {
          if (replyToken) await replyLineMessage(token, replyToken, "⚠️ 僅有成功的打卡紀錄支援翻轉或撤回。如需補正請洽後台主管。");
          return;
        }

        const rawDelta = typeof record.delta_seconds === "number" ? record.delta_seconds : (record.delta_seconds ? parseFloat(String(record.delta_seconds)) : 0);
        const deltaSeconds = isNaN(rawDelta) ? 0 : Math.max(0, rawDelta);

        if (deltaSeconds > 35) {
          const msg = `⚠️ 已超過 30 秒安全時限（目前已過 ${Math.round(deltaSeconds)} 秒），無法自行變更紀錄。\n如需補正考勤請洽後台主管。`;
          if (replyToken) await replyLineMessage(token, replyToken, msg);
          return;
        }

        if (action === "undo") {
          await this.env.DB.prepare(`
            UPDATE checkin_records
            SET status = 'CANCELLED'
            WHERE line_user_id = ?
              AND (
                id = ?
                OR (
                  created_at >= ?
                  AND status IN ('SUCCESS', 'DUPLICATE')
                )
              )
          `).bind(userId, record.id, record.created_at).run();

          await this.env.DB.prepare(`
            INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
            VALUES (?, ?, 'UNDO_CHECKIN', NULL, NULL, ?, ?, 'INFO')
          `).bind(userId, record.display_name, clientIp, userAgent).run();

          const replyText = `🗑️ 【撤回成功】\n已成功撤回此筆打卡！\n原紀錄時間：${record.created_at}\n該筆考勤已標記為作廢，30 分鐘限制已重置。`;
          if (replyToken) await replyLineMessage(token, replyToken, replyText);
        } else if (action === "flip") {
          if (record.punch_type === "IN") {
            const prevRecord = await this.env.DB.prepare(`
              SELECT id, created_at,
                     (julianday(?) - julianday(created_at)) * 24 AS shift_hours
              FROM checkin_records
              WHERE line_user_id = ? AND status = 'SUCCESS' AND id < ?
              ORDER BY id DESC LIMIT 1
            `).bind(record.created_at, userId, record.id).first<{ id: number; created_at: string; shift_hours: number }>();

            let calcHours: number | null = null;
            if (prevRecord && typeof prevRecord.shift_hours === "number" && prevRecord.shift_hours > 0 && prevRecord.shift_hours <= 18) {
              calcHours = parseFloat(prevRecord.shift_hours.toFixed(1));
            }

            await this.env.DB.prepare(
              "UPDATE checkin_records SET punch_type = 'OUT', work_hours = ? WHERE id = ?"
            ).bind(calcHours, record.id).run();

            await this.env.DB.prepare(`
              INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
              VALUES (?, ?, 'FLIP_TO_OUT', NULL, NULL, ?, ?, 'INFO')
            `).bind(userId, record.display_name, clientIp, userAgent).run();

            const hoursText = calcHours !== null ? `\n⏱️ 當段工時：${calcHours} 小時` : "";
            const replyText = `🔄 【翻轉成功】\n狀態已更正為【🔴 下班 (OUT)】${hoursText}\n打卡時間：${record.created_at}`;
            if (replyToken) await replyLineMessage(token, replyToken, replyText);
          } else {
            await this.env.DB.prepare(
              "UPDATE checkin_records SET punch_type = 'IN', work_hours = NULL WHERE id = ?"
            ).bind(record.id).run();

            await this.env.DB.prepare(`
              INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
              VALUES (?, ?, 'FLIP_TO_IN', NULL, NULL, ?, ?, 'INFO')
            `).bind(userId, record.display_name, clientIp, userAgent).run();

            const replyText = `🔄 【翻轉成功】\n狀態已更正為【🟢 上班 (IN)】\n打卡時間：${record.created_at}`;
            if (replyToken) await replyLineMessage(token, replyToken, replyText);
          }
        }
      }
      return;
    }

    // 3. Handle Location Message (Setting Store GPS Coordinates directly from LINE)
    if (event.type === "message" && event.message?.type === "location") {
      const locMsg = event.message as {
        type: "location";
        id: string;
        title?: string;
        address?: string;
        latitude: number;
        longitude: number;
      };

      const permCtx = await getUserPermissionContext(this.env, userId);
      if (!hasPermission(permCtx.permissions, "set_location")) {
        if (replyToken) {
          await replyLineMessage(
            token,
            replyToken,
            "⛔ 【權限不足】\n您的帳號尚未開通「座標設定 (set_location)」權限。\n如需為門市設置打卡 GPS 座標，請洽企業管理員於後台為您賦權。"
          );
        }
        return;
      }

      let targetLocId = permCtx.companyId;
      let targetLocName = permCtx.companyName;

      if (!targetLocId) {
        const mgrLoc = await this.env.DB.prepare(
          "SELECT id, name FROM locations WHERE manager_line_id = ? LIMIT 1"
        ).bind(userId).first<{ id: string; name: string }>();
        if (mgrLoc) {
          targetLocId = mgrLoc.id;
          targetLocName = mgrLoc.name;
        }
      }

      if (!targetLocId) {
        if (replyToken) {
          await replyLineMessage(
            token,
            replyToken,
            "⚠️ 【無所屬門市】\n系統查無您所屬的門市代碼，無法綁定座標。\n請先於管理後台將您的帳號指派至指定門市。"
          );
        }
        return;
      }

      const lat = locMsg.latitude;
      const lon = locMsg.longitude;
      const addr = locMsg.address || locMsg.title || "現場分享座標";

      await this.env.DB.prepare(`
        UPDATE locations
        SET target_lat = ?, target_lon = ?, address = ?
        WHERE id = ?
      `).bind(lat, lon, addr, targetLocId).run();

      await this.env.DB.prepare(`
        INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
        VALUES (?, ?, 'SET_STORE_GPS', NULL, ?, ?, ?, 'INFO')
      `).bind(
        userId,
        permCtx.employeeName || "門市主管",
        `${targetLocId}:${lat.toFixed(6)},${lon.toFixed(6)}`,
        clientIp,
        userAgent
      ).run();

      const successMsg = `🗺️ 【門市 GPS 座標更新成功】\n\n` +
        `🏢 門市據點：${targetLocName || targetLocId}\n` +
        `📍 最新座標：${lat.toFixed(6)}, ${lon.toFixed(6)}\n` +
        `🏠 登記地址：${addr}\n\n` +
        `✅ 經緯度已即時寫入雲端 D1 資料庫，全員即刻起以此座標作為打卡地理圍欄中心點！`;

      if (replyToken) {
        await replyLineMessage(token, replyToken, successMsg);
      }
      return;
    }

    // 4. Handle Text Commands
    if (event.type === "message" && event.message?.type === "text") {
      const userMsg = event.message.text.trim();

      // In-Chat BPM Rejection Reason: 【駁回 #id】原因：xxx
      const rejectMatch = userMsg.match(/^【駁回\s*#([a-zA-Z0-9_-]+)】原因[：:]\s*([\s\S]*)$/);
      if (rejectMatch) {
        const approvalId = rejectMatch[1].trim();
        const rejectReason = rejectMatch[2].trim();

        if (!rejectReason) {
          if (replyToken) {
            await replyLineMessage(
              token,
              replyToken,
              "⚠️ 駁回原因不能為空，請於「原因：」後方輸入具體理由後再次送出。"
            );
          }
          return;
        }

        const approvalService = new ApprovalService(this.env);
        const decisionResult = await approvalService.processDecision(
          approvalId,
          "reject",
          userId,
          clientIp,
          userAgent,
          rejectReason
        );

        if (replyToken) {
          await replyLineMessage(token, replyToken, decisionResult.replyMessage);
        }
        return;
      }

      // Cross-store attendance / global dashboard query
      if (userMsg.includes("全局出勤") || userMsg.includes("跨店出勤") || userMsg.includes("全局看板") || userMsg.includes("跨店看板")) {
        const permCtx = await getUserPermissionContext(this.env, userId);
        if (!hasPermission(permCtx.permissions, "view_all")) {
          if (replyToken) {
            await replyLineMessage(
              token,
              replyToken,
              "⛔ 【權限不足】\n您尚未開通「全局看板 (view_all)」權限，無法跨店查閱其他門市出勤紀錄。"
            );
          }
          return;
        }
      }

      // Payroll export query via LINE
      if (userMsg.includes("計薪匯出") || userMsg.includes("匯出薪資") || userMsg.includes("匯出計薪") || userMsg.includes("匯出工時")) {
        const permCtx = await getUserPermissionContext(this.env, userId);
        if (!hasPermission(permCtx.permissions, "export_payroll")) {
          if (replyToken) {
            await replyLineMessage(
              token,
              replyToken,
              "⛔ 【權限不足】\n您尚未開通「計薪匯出 (export_payroll)」權限，無法匯出計薪報表。"
            );
          }
          return;
        }
        if (replyToken) {
          await replyLineMessage(
            token,
            replyToken,
            "📊 【計薪匯出完成】\n請登入管理後台或透過授權 API 下載本月份薪資報表 CSV。"
          );
        }
        return;
      }

      // Attendance dashboard for store / company
      if (userMsg.includes("今日出勤") || userMsg.includes("門市出勤") || userMsg.includes("出勤看板")) {
        const permCtx = await getUserPermissionContext(this.env, userId);
        const canViewStore = hasPermission(permCtx.permissions, "view_store");
        const canViewAll = hasPermission(permCtx.permissions, "view_all");

        if (!canViewStore && !canViewAll) {
          if (replyToken) {
            await replyLineMessage(
              token,
              replyToken,
              "⛔ 【權限不足】\n您尚未開通「門市看板 (view_store)」或「全局看板 (view_all)」權限，無法查閱當日出勤看板。"
            );
          }
          return;
        }

        const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        const targetCompanyId = permCtx.companyId || "";

        let schedSql = "SELECT s.company_id, s.line_user_id, s.shift_name, s.shift_start, s.shift_end, s.is_rest_day, COALESCE(e.employee_name, '同仁') as emp_name FROM employee_schedules s LEFT JOIN company_employees e ON s.line_user_id = e.line_user_id WHERE s.work_date = ?";
        let schedParams: any[] = [todayStr];
        if (!canViewAll && targetCompanyId) {
          schedSql += " AND (s.company_id = ? OR s.company_id LIKE ?)";
          schedParams.push(targetCompanyId, `${targetCompanyId}-%`);
        }
        const { results: schedResults } = await this.env.DB.prepare(schedSql).bind(...schedParams).all();

        let punchSql = "SELECT line_user_id, display_name, punch_type, status, created_at FROM checkin_records WHERE created_at LIKE ? AND status = 'SUCCESS'";
        let punchParams: any[] = [`${todayStr}%`];
        if (!canViewAll && targetCompanyId) {
          punchSql += " AND (company_id = ? OR company_id LIKE ?)";
          punchParams.push(targetCompanyId, `${targetCompanyId}-%`);
        }
        const { results: punchResults } = await this.env.DB.prepare(punchSql).bind(...punchParams).all();

        const punches = (punchResults as any[]) || [];
        const schedules = (schedResults as any[]) || [];

        const userPunches = new Map<string, any[]>();
        for (const p of punches) {
          if (!userPunches.has(p.line_user_id)) userPunches.set(p.line_user_id, []);
          userPunches.get(p.line_user_id)!.push(p);
        }

        let totalScheduled = 0;
        let restCount = 0;
        let checkedInCount = 0;
        const missingPunchNames: string[] = [];
        const checkedInNames: string[] = [];

        for (const s of schedules) {
          if (s.is_rest_day === 1) {
            restCount++;
            continue;
          }
          totalScheduled++;
          const pList = userPunches.get(s.line_user_id) || [];
          const hasIn = pList.some(p => p.punch_type === "IN");
          if (hasIn) {
            checkedInCount++;
            checkedInNames.push(s.emp_name);
          } else {
            missingPunchNames.push(s.emp_name);
          }
        }

        const rate = totalScheduled > 0 ? Math.round((checkedInCount / totalScheduled) * 100) : 100;
        const storeLabel = permCtx.companyName || (canViewAll ? "全體門市" : targetCompanyId || "所屬門市");

        let msg = `📊 【${storeLabel} 今日出勤看板】\n📅 日期：${todayStr}\n─────────────────\n`;
        msg += `👥 應出勤：${totalScheduled} 人\n`;
        msg += `🟢 已出勤：${checkedInCount} 人 (${rate}%)\n`;
        msg += `🔴 尚未打卡：${missingPunchNames.length} 人\n`;
        msg += `⚪ 休假同仁：${restCount} 人\n`;

        if (missingPunchNames.length > 0) {
          msg += `\n⚠️ 【未到勤名單】：${missingPunchNames.join("、")}`;
        }
        if (checkedInNames.length > 0) {
          msg += `\n\n✅ 【已打卡名單】：${checkedInNames.join("、")}`;
        }

        if (replyToken) await replyLineMessage(token, replyToken, msg);
        return;
      }

      // Schedule for store / company
      if (userMsg.includes("今日班表") || userMsg.includes("門市班表")) {
        const permCtx = await getUserPermissionContext(this.env, userId);
        const canViewStore = hasPermission(permCtx.permissions, "view_store");
        const canViewAll = hasPermission(permCtx.permissions, "view_all");

        if (!canViewStore && !canViewAll) {
          if (replyToken) {
            await replyLineMessage(
              token,
              replyToken,
              "⛔ 【權限不足】\n您尚未開通「門市看板 (view_store)」權限，無法查閱門市班表。"
            );
          }
          return;
        }

        const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        const targetCompanyId = permCtx.companyId || "";

        let schedSql = "SELECT s.shift_name, s.shift_start, s.shift_end, s.is_rest_day, COALESCE(e.employee_name, '同仁') as emp_name FROM employee_schedules s LEFT JOIN company_employees e ON s.line_user_id = e.line_user_id WHERE s.work_date = ?";
        let schedParams: any[] = [todayStr];
        if (!canViewAll && targetCompanyId) {
          schedSql += " AND (s.company_id = ? OR s.company_id LIKE ?)";
          schedParams.push(targetCompanyId, `${targetCompanyId}-%`);
        }
        schedSql += " ORDER BY s.is_rest_day ASC, s.shift_start ASC";

        const { results: schedResults } = await this.env.DB.prepare(schedSql).bind(...schedParams).all();
        const schedules = (schedResults as any[]) || [];

        if (schedules.length === 0) {
          if (replyToken) await replyLineMessage(token, replyToken, `📅 【${todayStr}】今日門市無排班紀錄。`);
        } else {
          let msg = `📅 【${todayStr} 今日門市班表】\n─────────────────\n`;
          for (const s of schedules) {
            if (s.is_rest_day === 1) {
              msg += `⚪ ${s.emp_name}：休假 (${s.shift_name || "例假"})\n`;
            } else {
              msg += `🕒 ${s.emp_name}：${s.shift_start || "09:00"} - ${s.shift_end || "18:00"} (${s.shift_name})\n`;
            }
          }
          if (replyToken) await replyLineMessage(token, replyToken, msg.trim());
        }
        return;
      }

      // User PBAC permissions query
      if (userMsg.includes("我的權限") || userMsg.includes("權限查詢")) {
        const permCtx = await getUserPermissionContext(this.env, userId);
        let msg = `🛡️ 【您的 LINE 帳號權限清單】\n─────────────────\n`;
        msg += `👤 員工：${permCtx.employeeName || "未設定姓名"}\n`;
        msg += `🏢 門市：${permCtx.companyName || permCtx.companyId || "未綁定"}\n`;
        if (permCtx.isManager) msg += `⭐ 身分：門市店長 / 主管\n`;
        msg += `\n📋 目前已開通權限：\n`;

        for (const p of ALL_PERMISSIONS) {
          const isGranted = permCtx.permissions.includes(p) || permCtx.permissions.includes("all");
          const icon = isGranted ? "✅" : "▫️";
          msg += `${icon} ${PERMISSION_LABELS[p] || p} (${p})\n`;
        }

        if (replyToken) await replyLineMessage(token, replyToken, msg.trim());
        return;
      }

      // Personal schedule query
      if (userMsg === "班表" || userMsg === "我的班表" || userMsg === "個人班表") {
        const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        const { results } = await this.env.DB.prepare(`
          SELECT work_date, shift_name, shift_start, shift_end, is_rest_day
          FROM employee_schedules
          WHERE line_user_id = ? AND work_date >= ?
          ORDER BY work_date ASC LIMIT 7
        `).bind(userId, todayStr).all();

        const list = (results as any[]) || [];
        if (list.length === 0) {
          if (replyToken) await replyLineMessage(token, replyToken, "📅 查無未來 7 天排班紀錄。");
        } else {
          let msg = `📆 【您的未來一週排班】\n─────────────────\n`;
          for (const item of list) {
            if (item.is_rest_day === 1) {
              msg += `⚪ ${item.work_date}：休假 (${item.shift_name})\n`;
            } else {
              msg += `🟢 ${item.work_date}：${item.shift_start || "09:00"}-${item.shift_end || "18:00"} (${item.shift_name})\n`;
            }
          }
          if (replyToken) await replyLineMessage(token, replyToken, msg.trim());
        }
        return;
      }

      // Attendance records query
      if (userMsg.includes("打卡紀錄") || userMsg.includes("出勤紀錄")) {
        const { results } = await this.env.DB.prepare(`
          SELECT id, punch_type, work_hours, status, created_at
          FROM checkin_records
          WHERE line_user_id = ?
          ORDER BY id DESC LIMIT 5
        `).bind(userId).all();

        if (!results || results.length === 0) {
          if (replyToken) await replyLineMessage(token, replyToken, "📅 查無近期的打卡紀錄。");
        } else {
          let summary = "📋 最近 5 筆出勤紀錄：\n";
          for (const r of results as any[]) {
            const typeTag = r.status === "CANCELLED" ? "❌ 已撤回" : (r.punch_type === "IN" ? "🟢 上班" : "🔴 下班");
            const hourTag = r.work_hours ? ` (${r.work_hours}h)` : "";
            summary += `• ${r.created_at} ${typeTag}${hourTag}\n`;
          }
          if (replyToken) await replyLineMessage(token, replyToken, summary.trim());
        }
      } else if (userMsg.includes("撤回")) {
        const latest = await this.env.DB.prepare(`
          SELECT id, created_at,
                 (julianday('now', '+8 hours') - julianday(created_at)) * 86400 AS delta_seconds
          FROM checkin_records
          WHERE line_user_id = ? AND status IN ('SUCCESS', 'DUPLICATE')
          ORDER BY id DESC LIMIT 1
        `).bind(userId).first<{ id: number; created_at: string; delta_seconds: number }>();

        if (!latest) {
          if (replyToken) await replyLineMessage(token, replyToken, "❌ 查無可撤回的打卡紀錄。");
        } else if (latest.delta_seconds > 35) {
          if (replyToken) await replyLineMessage(token, replyToken, `⚠️ 最近一筆打卡已超過 30 秒安全時效（已過 ${Math.round(latest.delta_seconds)} 秒），無法自行撤回。`);
        } else {
          await this.env.DB.prepare(`
            UPDATE checkin_records
            SET status = 'CANCELLED'
            WHERE line_user_id = ?
              AND created_at >= ?
              AND status IN ('SUCCESS', 'DUPLICATE')
          `).bind(userId, latest.created_at).run();

          await this.env.DB.prepare(`
            INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
            VALUES (?, 'LINE用戶', 'UNDO_CHECKIN', NULL, NULL, ?, ?, 'INFO')
          `).bind(userId, clientIp, userAgent).run();

          if (replyToken) await replyLineMessage(token, replyToken, `🗑️ 已成功撤回剛才的打卡紀錄（${latest.created_at}），30 分鐘限制已重置。`);
        }
      } else if (userMsg.includes("翻轉") || userMsg.includes("更正")) {
        const latest = await this.env.DB.prepare(`
          SELECT id, punch_type, created_at,
                 (julianday('now', '+8 hours') - julianday(created_at)) * 86400 AS delta_seconds
          FROM checkin_records
          WHERE line_user_id = ? AND status = 'SUCCESS'
          ORDER BY id DESC LIMIT 1
        `).bind(userId).first<{ id: number; punch_type: string; created_at: string; delta_seconds: number }>();

        if (!latest) {
          if (replyToken) await replyLineMessage(token, replyToken, "❌ 查無可翻轉的打卡紀錄。");
        } else if (latest.delta_seconds > 35) {
          if (replyToken) await replyLineMessage(token, replyToken, `⚠️ 最近一筆打卡已超過 30 秒安全時效（已過 ${Math.round(latest.delta_seconds)} 秒），無法自行翻轉。`);
        } else {
          const newType = latest.punch_type === "IN" ? "OUT" : "IN";
          await this.env.DB.prepare("UPDATE checkin_records SET punch_type = ? WHERE id = ?").bind(newType, latest.id).run();
          const newLabel = newType === "IN" ? "🟢 上班 (IN)" : "🔴 下班 (OUT)";
          if (replyToken) await replyLineMessage(token, replyToken, `🔄 狀態已翻轉更正為【${newLabel}】（打卡時間：${latest.created_at}）。`);
        }
      }
    }
  }
}
