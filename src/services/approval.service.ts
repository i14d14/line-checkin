import { Env, ApprovalType, ApprovalStatus } from "../types";
import { ApprovalRepository } from "../repositories/approval.repo";
import { pushApprovalRequestFlex, pushApprovalResultFlex } from "../views/flex/approval-flex";
import { auditDayAttendance } from "./schedule.service";

export interface SubmitApprovalParams {
  userId: string;
  displayName: string;
  type: ApprovalType;
  targetDate: string;
  details: Record<string, any>;
  fallbackCompanyId?: string;
}

export interface SubmitApprovalResult {
  success: boolean;
  approvalId?: string;
  approverLineId?: string;
  status?: string;
  message?: string;
  error?: string;
  statusCode?: number;
}

export interface ProcessDecisionResult {
  success: boolean;
  isApprove: boolean;
  applicantLineId?: string;
  applicantName?: string;
  type?: string;
  targetDate?: string;
  replyMessage: string;
  rejectReason?: string;
}

export class ApprovalService {
  private repo: ApprovalRepository;

  constructor(private env: Env) {
    this.repo = new ApprovalRepository(env.DB);
  }

  async submitRequest(params: SubmitApprovalParams): Promise<SubmitApprovalResult> {
    const { userId, displayName, type, targetDate, details, fallbackCompanyId } = params;

    if (!type || !targetDate) {
      return { success: false, error: "缺少必要欄位 (type 申請類型, targetDate 涉及日期)", statusCode: 400 };
    }

    if (!["LEAVE", "CORRECTION", "OVERTIME"].includes(type)) {
      return { success: false, error: "不支援的申請類型 (僅支援 LEAVE, CORRECTION, OVERTIME)", statusCode: 400 };
    }

    const approverInfo = await this.repo.resolveEmployeeApproverInfo(userId, fallbackCompanyId, displayName);

    if (!approverInfo.approverLineId) {
      return {
        success: false,
        error: "尚未設定您的直屬審查主管，且所屬門市據點亦未設定店長 LINE ID。請洽公司管理員於後台設定。",
        statusCode: 400
      };
    }

    // Validation: Leave requests must satisfy Universal Deficit Invariant
    if (type === "LEAVE") {
      const hasPending = await this.repo.hasPendingLeaveRequest(userId, targetDate);
      if (hasPending) {
        return {
          success: false,
          error: `您在該日（${targetDate}）已有一筆審核中的請假申請，請勿重複提交。`,
          statusCode: 400
        };
      }

      // Query schedule and punches for attendance deficit evaluation
      const schedule = await this.repo.findEmployeeSchedule(userId, targetDate);
      const punches = await this.repo.findPunchesByDate(userId, targetDate);

      // Deterministic Taiwan (UTC+8) time anchor
      const nowUtc = new Date();
      const twDate = new Date(nowUtc.getTime() + 8 * 3600 * 1000);
      const todayStr = twDate.toISOString().slice(0, 10);
      const currentMinutes = twDate.getUTCHours() * 60 + twDate.getUTCMinutes();

      const audit = auditDayAttendance(targetDate, schedule || undefined, punches, todayStr, currentMinutes);

      // 1. Rest days / weekends (Standard or scheduled rest without regular shift requirement)
      if (audit.isRestDay && !audit.isLeave) {
        const restReason = audit.shiftName || "例假日";
        return {
          success: false,
          error: `無法發起請假申請：${targetDate} 為非工作日 / 休假日（${restReason}），無須請假。`,
          statusCode: 400
        };
      }

      // 2. Already full-day approved leave
      if (audit.status === "LEAVE") {
        return {
          success: false,
          error: `無法發起請假申請：該日（${targetDate}）已核准全天請假（${audit.shiftName}），無須重複請假。`,
          statusCode: 400
        };
      }

      // 3. Normal full attendance or already fully compensated by prior leave
      if (audit.status === "NORMAL") {
        const hasOutPunch = punches.some(p => p.punch_type === "OUT");
        // Exception: Today, currently working or pending completion (no OUT punch)
        if (targetDate === todayStr && !hasOutPunch) {
          // Allow advance notice for leaving early / remainder of shift
        } else {
          const note = audit.isLeave
            ? `已由先前請假全額抵充（出勤 ${audit.workHours}h + 請假 ${audit.leaveHours}h）`
            : `出勤紀錄正常且已打滿排班工時（出勤 ${audit.workHours}h）`;
          return {
            success: false,
            error: `無法發起請假申請：該日（${targetDate}）${note}，查無缺勤時段。`,
            statusCode: 400
          };
        }
      }
    }

    const approvalId = "appr_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    const detailsJson = typeof details === "object" ? JSON.stringify(details) : (details || "{}");

    await this.repo.createApproval({
      id: approvalId,
      companyId: approverInfo.companyId,
      lineUserId: userId,
      applicantName: approverInfo.applicantName,
      approverLineId: approverInfo.approverLineId,
      type,
      targetDate,
      detailsJson
    });

    const token = this.env.LINE_CHANNEL_ACCESS_TOKEN || "";
    const parsedDetails = typeof details === "object" ? details : {};

    await pushApprovalRequestFlex(
      token,
      approverInfo.approverLineId,
      approvalId,
      type,
      approverInfo.applicantName,
      approverInfo.locationName,
      targetDate,
      parsedDetails
    );

    return {
      success: true,
      approvalId,
      approverLineId: approverInfo.approverLineId,
      status: "PENDING",
      message: "申請已成功送出，已即時推播審核卡片至主管 LINE 聊天室。"
    };
  }

  async processDecision(
    approvalId: string,
    action: "approve" | "reject",
    operatorUserId: string,
    clientIp?: string,
    userAgent?: string,
    rejectReason?: string
  ): Promise<ProcessDecisionResult> {
    const approval = await this.repo.getApprovalById(approvalId);

    if (!approval) {
      return {
        success: false,
        isApprove: false,
        replyMessage: "❌ 查無此審批單據。"
      };
    }

    if (approval.approver_line_id !== operatorUserId) {
      return {
        success: false,
        isApprove: false,
        replyMessage: "⚠️ 您不是本單據的指定審核人，無權進行此操作。"
      };
    }

    if (approval.status !== "PENDING") {
      const statusTag = approval.status === "APPROVED" ? "已核准" : (approval.status === "REJECTED" ? "已駁回" : approval.status);
      return {
        success: false,
        isApprove: false,
        replyMessage: `ℹ️ 此單據已由主管處理完畢（目前狀態：${statusTag}），無法重複操作。`
      };
    }

    const isApprove = action === "approve";
    const newStatus: ApprovalStatus = isApprove ? "APPROVED" : "REJECTED";

    if (isApprove) {
      await this.repo.updateApprovalStatus(approval.id, newStatus);

      let detailsObj: any = {};
      try {
        detailsObj = JSON.parse(approval.details || "{}");
      } catch (e) {}

      if (approval.type === "CORRECTION") {
        const punchType = detailsObj.punch_type || "IN";
        const punchTime = detailsObj.time || "09:00:00";
        const fullTimestamp = `${approval.target_date} ${punchTime.length === 5 ? punchTime + ":00" : punchTime}`;
        const workHours = typeof detailsObj.work_hours === "number" ? detailsObj.work_hours : null;

        await this.repo.applyCorrectionPunch(
          approval.company_id,
          approval.applicant_line_id,
          approval.applicant_name,
          punchType,
          workHours,
          fullTimestamp,
          clientIp,
          userAgent
        );
      } else if (approval.type === "LEAVE") {
        const leaveType = detailsObj.leave_type || "事假";
        const timeRange = detailsObj.time_range || "";
        const shiftName = `請假 (${leaveType})`;

        const punchCount = await this.repo.countSuccessPunchesOnDate(approval.applicant_line_id, approval.target_date);
        const hasPunches = punchCount > 0;
        const isPartial = timeRange.includes("上半天") || timeRange.includes("下半天") || timeRange.includes("小時");
        const isRestDay = (hasPunches || isPartial) ? 0 : 1;

        await this.repo.applyLeaveSchedule(
          approval.company_id,
          approval.applicant_line_id,
          approval.target_date,
          shiftName,
          isRestDay
        );
      }
    } else {
      let detailsObj: any = {};
      try {
        detailsObj = JSON.parse(approval.details || "{}");
      } catch (e) {}

      if (rejectReason) {
        detailsObj.reject_reason = rejectReason;
      }

      await this.repo.updateApprovalStatus(
        approval.id,
        "REJECTED",
        JSON.stringify(detailsObj),
        rejectReason
      );

      if (clientIp) {
        try {
          await this.env.DB.prepare(`
            INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
            VALUES (?, ?, 'APPROVAL_REJECTED', ?, NULL, ?, ?, 'INFO')
          `).bind(operatorUserId, "主管", approval.id, clientIp, userAgent || "LINE_WEBHOOK").run();
        } catch (e) {
          console.error("Failed to log approval rejection audit:", e);
        }
      }
    }

    const itemLabel = approval.type === "LEAVE" ? "請假" : (approval.type === "CORRECTION" ? "補卡" : "加班");
    let replyText = "";
    if (isApprove) {
      replyText = `✅ 【核准成功】\n已核准【${approval.applicant_name}】的${itemLabel}申請（日期：${approval.target_date}）。\n系統已自動同步更新出勤紀錄與班表！`;
    } else if (rejectReason) {
      replyText = `✅ 已成功駁回單號 #${approval.id}。\n駁回原因：${rejectReason}`;
    } else {
      replyText = `❌ 【已駁回】\n已駁回【${approval.applicant_name}】的${itemLabel}申請（日期：${approval.target_date}）。`;
    }

    const token = this.env.LINE_CHANNEL_ACCESS_TOKEN || "";
    await pushApprovalResultFlex(
      token,
      approval.applicant_line_id,
      approval.applicant_name,
      approval.type,
      approval.target_date,
      newStatus,
      rejectReason
    );

    return {
      success: true,
      isApprove,
      applicantLineId: approval.applicant_line_id,
      applicantName: approval.applicant_name,
      type: approval.type,
      targetDate: approval.target_date,
      replyMessage: replyText,
      rejectReason
    };
  }
}
