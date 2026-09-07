import { DailySchedule, CompanyEmployee } from "../types";

export interface ScheduleQueryFilters {
  month?: string | null;
  userId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export class ScheduleRepository {
  constructor(private db: D1Database) {}

  /**
   * Concurrently fetch employee schedules and checkin records for a given month in a single D1 batch.
   */
  async getMonthlyScheduleAndPunchBatch(
    lineUserId: string,
    targetMonth: string
  ): Promise<{ schedules: DailySchedule[]; punches: any[] }> {
    const [schedBatch, punchBatch] = await this.db.batch([
      this.db.prepare(
        "SELECT work_date, shift_name, shift_start, shift_end, break_minutes, is_rest_day, is_cross_day FROM employee_schedules WHERE line_user_id = ? AND work_date LIKE ? ORDER BY work_date ASC"
      ).bind(lineUserId, `${targetMonth}-%`),
      this.db.prepare(
        "SELECT id, punch_type, created_at, work_hours, verify_mode, status, distance_meters FROM checkin_records WHERE line_user_id = ? AND created_at LIKE ? ORDER BY id ASC"
      ).bind(lineUserId, `${targetMonth}-%`),
    ]);

    return {
      schedules: (schedBatch.results || []) as DailySchedule[],
      punches: (punchBatch.results || []) as any[],
    };
  }

  /**
   * Query tenant shift schedules with optional filtering by month, date range, or user.
   */
  async queryTenantSchedules(taxId: string, filters: ScheduleQueryFilters): Promise<any[]> {
    let sql = `
      SELECT s.id, s.company_id, s.line_user_id, e.employee_name, s.work_date, s.shift_name, s.shift_start, s.shift_end, s.break_minutes, s.is_rest_day, s.is_cross_day, s.created_at
      FROM employee_schedules s
      LEFT JOIN company_employees e ON s.line_user_id = e.line_user_id
      WHERE (s.company_id = ? OR s.company_id LIKE ?)
    `;
    const params: any[] = [taxId, `${taxId}-%`];

    if (filters.month) {
      sql += " AND s.work_date LIKE ?";
      params.push(`${filters.month}%`);
    }
    if (filters.startDate) {
      sql += " AND s.work_date >= ?";
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += " AND s.work_date <= ?";
      params.push(filters.endDate);
    }
    if (filters.userId) {
      sql += " AND s.line_user_id = ?";
      params.push(filters.userId.trim());
    }

    sql += " ORDER BY s.work_date ASC, s.line_user_id ASC LIMIT 500";

    const { results } = await this.db.prepare(sql).bind(...params).all();
    return results || [];
  }

  /**
   * Batch upsert shift schedules scoped to tenant.
   */
  async upsertBatchSchedules(taxId: string, schedules: Array<any>): Promise<number> {
    let insertedCount = 0;

    for (const item of schedules) {
      if (!item.line_user_id || !item.work_date) continue;

      const defaultCompanyId = item.company_id || `${taxId}-01`;
      const sName = item.shift_name || (item.is_rest_day ? "例假" : "常態班");
      const sStart = item.is_rest_day ? null : (item.shift_start || "09:00");
      const sEnd = item.is_rest_day ? null : (item.shift_end || "18:00");
      const breakMins = typeof item.break_minutes === "number" ? item.break_minutes : 60;
      const isRest = item.is_rest_day ? 1 : 0;
      const isCross = item.is_cross_day ? 1 : 0;

      await this.db.prepare(`
        INSERT INTO employee_schedules (company_id, line_user_id, work_date, shift_name, shift_start, shift_end, break_minutes, is_rest_day, is_cross_day, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
        ON CONFLICT(company_id, line_user_id, work_date) DO UPDATE SET
          shift_name = excluded.shift_name,
          shift_start = excluded.shift_start,
          shift_end = excluded.shift_end,
          break_minutes = excluded.break_minutes,
          is_rest_day = excluded.is_rest_day,
          is_cross_day = excluded.is_cross_day,
          updated_at = datetime('now', '+8 hours')
      `).bind(defaultCompanyId, item.line_user_id.trim(), item.work_date.trim(), sName, sStart, sEnd, breakMins, isRest, isCross).run();

      insertedCount++;
    }

    return insertedCount;
  }

  /**
   * Query today's schedules for store or user (used by Webhook and auditing).
   */
  async getSchedulesByDate(workDate: string, companyId?: string | null): Promise<any[]> {
    let sql = `
      SELECT s.company_id, s.line_user_id, s.shift_name, s.shift_start, s.shift_end, s.is_rest_day, COALESCE(e.employee_name, '同仁') as emp_name
      FROM employee_schedules s
      LEFT JOIN company_employees e ON s.line_user_id = e.line_user_id
      WHERE s.work_date = ?
    `;
    const params: any[] = [workDate];

    if (companyId) {
      sql += " AND (s.company_id = ? OR s.company_id LIKE ?)";
      params.push(companyId, `${companyId}-%`);
    }

    const { results } = await this.db.prepare(sql).bind(...params).all();
    return results || [];
  }

  /**
   * Fetch single employee info including schedule_mode and default shift.
   */
  async getEmployeeInfo(lineUserId: string): Promise<CompanyEmployee | null> {
    const row = await this.db
      .prepare("SELECT * FROM company_employees WHERE line_user_id = ? LIMIT 1")
      .bind(lineUserId.trim())
      .first();
    return (row as unknown as CompanyEmployee) || null;
  }

  /**
   * Fetch all employees for a tenant with schedule_mode = 'FIXED'.
   */
  async getFixedEmployeesForTenant(taxId: string): Promise<CompanyEmployee[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM company_employees WHERE (company_id = ? OR company_id LIKE ?) AND schedule_mode = 'FIXED'"
      )
      .bind(taxId, `${taxId}-%`)
      .all();
    return (results || []) as unknown as CompanyEmployee[];
  }

  /**
   * Batch insert default schedules with INSERT OR IGNORE (does not overwrite existing schedules/leaves).
   */
  async batchInsertDefaultSchedules(
    schedules: Array<{
      company_id: string;
      line_user_id: string;
      work_date: string;
      shift_name: string;
      shift_start: string | null;
      shift_end: string | null;
      break_minutes: number;
      is_rest_day: number;
      is_cross_day: number;
    }>
  ): Promise<number> {
    if (!schedules || schedules.length === 0) return 0;

    let inserted = 0;
    // Chunk by 50 to respect D1 batch limits
    const chunkSize = 50;
    for (let i = 0; i < schedules.length; i += chunkSize) {
      const chunk = schedules.slice(i, i + chunkSize);
      const stmts = chunk.map((s) =>
        this.db
          .prepare(`
            INSERT OR IGNORE INTO employee_schedules (
              company_id, line_user_id, work_date, shift_name, shift_start, shift_end, break_minutes, is_rest_day, is_cross_day, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
          `)
          .bind(
            s.company_id,
            s.line_user_id,
            s.work_date,
            s.shift_name,
            s.shift_start,
            s.shift_end,
            s.break_minutes,
            s.is_rest_day,
            s.is_cross_day
          )
      );
      const results = await this.db.batch(stmts);
      for (const r of results) {
        if (r.meta && (r.meta.changes || 0) > 0) {
          inserted += r.meta.changes;
        }
      }
    }
    return inserted;
  }
}
