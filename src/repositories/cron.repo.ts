import { CronNotificationRecord } from "../types";

export interface ActiveScheduleItem {
  id: number;
  company_id: string;
  line_user_id: string;
  work_date: string;
  shift_name: string;
  shift_start: string | null;
  shift_end: string | null;
  break_minutes: number;
  is_rest_day: number;
  is_cross_day: number;
  employee_name: string;
  location_name: string;
}

export class CronRepository {
  constructor(private db: D1Database) {}

  async hasNotificationBeenSent(
    lineUserId: string,
    workDate: string,
    type: "REMIND_IN" | "REMIND_OUT"
  ): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT 1 FROM cron_notifications WHERE line_user_id = ? AND work_date = ? AND type = ? LIMIT 1")
      .bind(lineUserId, workDate, type)
      .first();
    return !!row;
  }

  async recordNotificationSent(
    lineUserId: string,
    workDate: string,
    type: "REMIND_IN" | "REMIND_OUT",
    shiftTime: string | null
  ): Promise<void> {
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO cron_notifications (line_user_id, work_date, type, shift_time) VALUES (?, ?, ?, ?)"
      )
      .bind(lineUserId, workDate, type, shiftTime)
      .run();
  }

  async getActiveSchedulesForDate(workDate: string): Promise<ActiveScheduleItem[]> {
    const res = await this.db
      .prepare(`
        SELECT 
          s.id,
          s.company_id,
          s.line_user_id,
          s.work_date,
          s.shift_name,
          s.shift_start,
          s.shift_end,
          s.break_minutes,
          s.is_rest_day,
          s.is_cross_day,
          COALESCE(ce.employee_name, '同仁') AS employee_name,
          COALESCE(loc.name, '美德總部') AS location_name
        FROM employee_schedules s
        LEFT JOIN company_employees ce ON ce.line_user_id = s.line_user_id
        LEFT JOIN locations loc ON loc.id = s.company_id
        WHERE s.work_date = ? AND s.is_rest_day = 0
      `)
      .bind(workDate)
      .all();
    return (res.results || []) as unknown as ActiveScheduleItem[];
  }

  async getTodayPunches(
    workDate: string
  ): Promise<Array<{ line_user_id: string; punch_type: string; created_at: string }>> {
    const res = await this.db
      .prepare(
        "SELECT line_user_id, punch_type, created_at FROM checkin_records WHERE created_at LIKE ? AND status = 'SUCCESS' ORDER BY id ASC"
      )
      .bind(`${workDate}%`)
      .all();
    return (res.results || []) as unknown as Array<{ line_user_id: string; punch_type: string; created_at: string }>;
  }
}
