import { ApprovalRecord, ApprovalType, ApprovalStatus } from "../types";

export interface CreateApprovalParams {
  id: string;
  companyId: string;
  lineUserId: string;
  applicantName: string;
  approverLineId: string;
  type: ApprovalType;
  targetDate: string;
  detailsJson: string;
}

export interface EmployeeApproverInfo {
  companyId: string;
  applicantName: string;
  approverLineId: string | null;
  locationName: string;
}

export class ApprovalRepository {
  constructor(private db: D1Database) {}

  async createApproval(params: CreateApprovalParams): Promise<void> {
    await this.db.prepare(`
      INSERT INTO approvals (
        id, company_id, line_user_id, applicant_name, approver_line_id,
        type, target_date, details, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).bind(
      params.id,
      params.companyId || "UNKNOWN",
      params.lineUserId,
      params.applicantName,
      params.approverLineId,
      params.type,
      params.targetDate,
      params.detailsJson
    ).run();
  }

  async getApprovalById(id: string): Promise<ApprovalRecord | null> {
    const record = await this.db.prepare(`
      SELECT * FROM approvals WHERE id = ?
    `).bind(id).first<any>();
    if (!record) return null;
    return {
      id: record.id,
      company_id: record.company_id,
      applicant_line_id: record.line_user_id || record.applicant_line_id,
      applicant_name: record.applicant_name,
      approver_line_id: record.approver_line_id,
      type: record.type,
      target_date: record.target_date,
      details: record.details,
      status: record.status,
      decided_at: record.decided_at,
      created_at: record.created_at
    };
  }

  async listApprovalsByApplicant(userId: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT id, company_id, type, target_date, details, status, review_note, decided_at, created_at
      FROM approvals
      WHERE line_user_id = ?
      ORDER BY created_at DESC LIMIT 30
    `).bind(userId).all();
    return results || [];
  }

  async listTenantApprovals(taxId: string, filters: { status?: string | null; type?: string | null; month?: string | null }): Promise<any[]> {
    let query = "SELECT * FROM approvals WHERE (company_id = ? OR company_id LIKE ?)";
    const params: any[] = [taxId, `${taxId}-%`];

    if (filters.status) {
      query += " AND status = ?";
      params.push(filters.status);
    }
    if (filters.type) {
      query += " AND type = ?";
      params.push(filters.type);
    }
    if (filters.month) {
      query += " AND target_date LIKE ?";
      params.push(`${filters.month}%`);
    }

    query += " ORDER BY created_at DESC LIMIT 100";
    const { results } = await this.db.prepare(query).bind(...params).all();
    return results || [];
  }

  async updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    updatedDetailsJson?: string,
    reviewNote?: string
  ): Promise<void> {
    if (updatedDetailsJson !== undefined) {
      await this.db.prepare(`
        UPDATE approvals
        SET status = ?, details = ?, review_note = COALESCE(?, review_note), decided_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).bind(status, updatedDetailsJson, reviewNote || null, id).run();
    } else {
      await this.db.prepare(`
        UPDATE approvals
        SET status = ?, decided_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).bind(status, id).run();
    }
  }

  async assignEmployeeApprover(
    companyId: string,
    targetLineUserId: string,
    employeeName: string | null,
    approverLineId: string
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO company_employees (company_id, line_user_id, employee_name, approver_line_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(line_user_id) DO UPDATE SET
        company_id = excluded.company_id,
        employee_name = COALESCE(excluded.employee_name, company_employees.employee_name),
        approver_line_id = excluded.approver_line_id
    `).bind(companyId, targetLineUserId.trim(), employeeName || null, approverLineId.trim()).run();
  }

  async resolveEmployeeApproverInfo(userId: string, fallbackCompanyId?: string, fallbackDisplayName?: string): Promise<EmployeeApproverInfo> {
    const emp = await this.db.prepare(`
      SELECT company_id, employee_name, approver_line_id
      FROM company_employees
      WHERE line_user_id = ?
    `).bind(userId).first<{ company_id: string; employee_name: string | null; approver_line_id: string | null }>();

    let companyId = emp?.company_id || fallbackCompanyId || "";
    const applicantName = fallbackDisplayName || emp?.employee_name || "LINE用戶";
    let targetApprover = emp?.approver_line_id || null;

    if (!companyId) {
      const lastRecord = await this.db.prepare(`
        SELECT company_id FROM checkin_records WHERE line_user_id = ? ORDER BY id DESC LIMIT 1
      `).bind(userId).first<{ company_id: string }>();
      if (lastRecord) companyId = lastRecord.company_id;
    }

    let locationName = "門市據點";
    if (companyId) {
      const loc = await this.db.prepare(`
        SELECT name, manager_line_id FROM locations WHERE id = ?
      `).bind(companyId).first<{ name: string; manager_line_id: string | null }>();
      if (loc) {
        locationName = loc.name;
        if (!targetApprover && loc.manager_line_id) {
          targetApprover = loc.manager_line_id;
        }
      }
    }

    return {
      companyId,
      applicantName,
      approverLineId: targetApprover,
      locationName
    };
  }

  async applyCorrectionPunch(
    companyId: string,
    lineUserId: string,
    applicantName: string,
    punchType: string,
    workHours: number | null,
    fullTimestamp: string,
    clientIp?: string,
    userAgent?: string
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO checkin_records (
        company_id, line_user_id, display_name, latitude, longitude, distance_meters,
        status, punch_type, work_hours, verify_mode, created_at
      ) VALUES (
        ?, ?, ?, 0, 0, 0, 'SUCCESS', ?, ?, 'APPROVED_OVERRIDE', ?
      )
    `).bind(
      companyId,
      lineUserId,
      applicantName,
      punchType,
      workHours,
      fullTimestamp
    ).run();

    if (clientIp) {
      await this.db.prepare(`
        INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
        VALUES (?, ?, 'APPROVAL_PUNCH_OVERRIDE', NULL, NULL, ?, ?, 'INFO')
      `).bind(lineUserId, applicantName, clientIp, userAgent || "LINE_WEBHOOK").run();
    }
  }

  async applyLeaveSchedule(
    companyId: string,
    lineUserId: string,
    targetDate: string,
    shiftName: string,
    isRestDay: number
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO employee_schedules (
        company_id, line_user_id, work_date, shift_name, is_rest_day, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours')
      )
      ON CONFLICT(company_id, line_user_id, work_date) DO UPDATE SET
        shift_name = excluded.shift_name,
        is_rest_day = excluded.is_rest_day,
        updated_at = datetime('now', '+8 hours')
    `).bind(companyId, lineUserId, targetDate, shiftName, isRestDay).run();
  }

  async countSuccessPunchesOnDate(lineUserId: string, targetDate: string): Promise<number> {
    const result = await this.db.prepare(
      "SELECT COUNT(*) as cnt FROM checkin_records WHERE line_user_id = ? AND date(created_at) = ? AND status IN ('SUCCESS', 'DUPLICATE')"
    ).bind(lineUserId, targetDate).first<{ cnt: number }>();
    return result?.cnt || 0;
  }

  async findEmployeeSchedule(lineUserId: string, workDate: string): Promise<{
    shift_name: string;
    is_rest_day: number;
    shift_start: string | null;
    shift_end: string | null;
  } | null> {
    return await this.db.prepare(`
      SELECT shift_name, is_rest_day, shift_start, shift_end
      FROM employee_schedules
      WHERE line_user_id = ? AND work_date = ?
      ORDER BY id DESC LIMIT 1
    `).bind(lineUserId, workDate).first<any>();
  }

  async hasPendingLeaveRequest(lineUserId: string, targetDate: string): Promise<boolean> {
    const result = await this.db.prepare(`
      SELECT COUNT(*) as cnt FROM approvals
      WHERE line_user_id = ?
        AND target_date = ?
        AND type = 'LEAVE'
        AND status = 'PENDING'
    `).bind(lineUserId, targetDate).first<{ cnt: number }>();
    return (result?.cnt || 0) > 0;
  }
}
