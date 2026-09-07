import { DailySchedule, DayAttendanceAudit, MonthlyAttendanceResponse } from "../types";
import { parseTimeToMinutes } from "../utils/time";
import { ScheduleQueryFilters, ScheduleRepository } from "../repositories/schedule.repo";

// Attendance Auditor Engine for Single Day
export function auditDayAttendance(
  dateStr: string,
  schedule: DailySchedule | undefined,
  punches: any[],
  todayStr?: string,
  currentMinutes?: number
): DayAttendanceAudit {
  if (!todayStr) {
    const nowUtc = new Date();
    const twDate = new Date(nowUtc.getTime() + 8 * 3600 * 1000);
    todayStr = twDate.toISOString().slice(0, 10);
    currentMinutes = twDate.getUTCHours() * 60 + twDate.getUTCMinutes();
  }

  // Timezone-agnostic Day of Week calculation (deterministic UTC calendar anchor)
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const validPunches = (punches || []).filter(p => p.status === "SUCCESS" || p.status === "DUPLICATE");
  const inPunches = validPunches.filter(p => p.punch_type === "IN");
  const outPunches = validPunches.filter(p => p.punch_type === "OUT");

  const firstIn = inPunches.length > 0 ? inPunches[0] : null;
  const lastOut = outPunches.length > 0 ? outPunches[outPunches.length - 1] : null;

  const firstInTime = firstIn ? firstIn.created_at.slice(11, 16) : null;
  const lastOutTime = lastOut ? lastOut.created_at.slice(11, 16) : null;

  let totalWorkHours = 0;
  for (const p of outPunches) {
    if (typeof p.work_hours === "number" && p.work_hours > 0) {
      totalWorkHours += p.work_hours;
    }
  }
  totalWorkHours = parseFloat(totalWorkHours.toFixed(1));

  // --- SSOT: If NO schedule exists in D1 ---
  if (!schedule) {
    if (validPunches.length === 0) {
      return {
        date: dateStr,
        dayOfWeek,
        isToday: dateStr === todayStr,
        isRestDay: false,
        isLeave: false,
        shiftName: "未排班",
        shiftStart: null,
        shiftEnd: null,
        status: "UNSCHEDULED",
        statusText: "未排班",
        statusColor: "gray",
        firstInTime: null,
        lastOutTime: null,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        workHours: 0,
        leaveHours: 0,
        overtimeHours: 0,
        verifyMode: null,
        punches: validPunches,
      };
    } else {
      return {
        date: dateStr,
        dayOfWeek,
        isToday: dateStr === todayStr,
        isRestDay: false,
        isLeave: false,
        shiftName: "未排班",
        shiftStart: null,
        shiftEnd: null,
        status: "UNSCHEDULED_WORK",
        statusText: "未排班出勤",
        statusColor: "indigo",
        firstInTime,
        lastOutTime,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        workHours: totalWorkHours,
        leaveHours: 0,
        overtimeHours: totalWorkHours,
        verifyMode: firstIn?.verify_mode || null,
        punches: validPunches,
      };
    }
  }

  // --- Normal path: Schedule exists in D1 ---
  const rawShiftName = schedule.shift_name || "常態班";
  const isLeaveShift = rawShiftName.includes("請假");
  const isStandardWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isRest = schedule.is_rest_day === 1;
  const shiftName = rawShiftName;
  const shiftStart = schedule.shift_start;
  const shiftEnd = schedule.shift_end;

  let status: "NORMAL" | "LATE" | "EARLY_LEAVE" | "LATE_AND_EARLY" | "MISSING_IN" | "MISSING_OUT" | "ABSENT" | "OVERTIME" | "REST_DAY" | "SCHEDULED" | "LEAVE" | "TODAY" = "NORMAL";
  let statusText = "正常出勤";
  let statusColor = "green";
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let overtimeHours = 0;
  let leaveHours = 0;

  if (isLeaveShift) {
    let standardHours = 8.0;
    if (shiftStart && shiftEnd) {
      const sMins = parseTimeToMinutes(shiftStart);
      const eMins = parseTimeToMinutes(shiftEnd);
      const brk = schedule?.break_minutes ?? 60;
      if (sMins !== null && eMins !== null && eMins > sMins) {
        standardHours = Math.max(0, parseFloat(((eMins - sMins - brk) / 60).toFixed(1)));
      }
    }

    if (validPunches.length === 0) {
      if (isStandardWeekend) {
        status = "REST_DAY";
        statusText = "休假";
        statusColor = "gray";
        leaveHours = 0;
      } else {
        status = "LEAVE";
        statusText = shiftName;
        statusColor = "amber";
        leaveHours = standardHours;
      }
    } else {
      // Defensive rule: If leave exists on standard weekend,
      // actual punches represent holiday overtime, not weekday regular attendance!
      if (isStandardWeekend) {
        status = "OVERTIME";
        statusText = "假日加班";
        statusColor = "purple";
        overtimeHours = totalWorkHours;
        leaveHours = 0;
      } else {
        // Weekday: Employee actually came in and punched! Leave covers unworked portion.
        status = "NORMAL";
        statusText = `${shiftName} + 出勤`;
        statusColor = "green";
        overtimeHours = 0; // Regular work hours, NOT holiday overtime!
        leaveHours = Math.max(0, parseFloat((standardHours - totalWorkHours).toFixed(1)));
      }
    }
  } else if (isRest) {
    if (validPunches.length === 0) {
      status = "REST_DAY";
      statusText = "休假";
      statusColor = "gray";
    } else {
      status = "OVERTIME";
      statusText = "假日加班";
      statusColor = "purple";
      overtimeHours = totalWorkHours;
    }
  } else {
    // Working day
    if (validPunches.length === 0) {
      if (dateStr > todayStr) {
        status = "SCHEDULED";
        statusText = "待出勤";
        statusColor = "sky";
      } else if (dateStr === todayStr) {
        const parsedOut = shiftEnd ? parseTimeToMinutes(shiftEnd) : null;
        const schedOutMins = parsedOut ?? 1080;
        if (currentMinutes !== undefined && currentMinutes <= schedOutMins) {
          status = "TODAY";
          statusText = "今日待出勤";
          statusColor = "emerald";
        } else {
          status = "ABSENT";
          statusText = "今日未打卡";
          statusColor = "red";
        }
      } else {
        status = "ABSENT";
        statusText = "未出勤/曠職";
        statusColor = "red";
      }
    } else if (inPunches.length > 0 && outPunches.length === 0) {
      if (dateStr === todayStr) {
        status = "NORMAL";
        statusText = "已上班/待下班";
        statusColor = "green";
      } else {
        status = "MISSING_OUT";
        statusText = "下班缺卡";
        statusColor = "red";
      }
    } else if (inPunches.length === 0 && outPunches.length > 0) {
      status = "MISSING_IN";
      statusText = "上班缺卡";
      statusColor = "red";
    } else {
      // Both IN and OUT exist
      const inMins = firstInTime ? parseTimeToMinutes(firstInTime) : null;
      const outMins = lastOutTime ? parseTimeToMinutes(lastOutTime) : null;
      const schedInMins = shiftStart ? parseTimeToMinutes(shiftStart) : null;
      const schedOutMins = shiftEnd ? parseTimeToMinutes(shiftEnd) : null;

      if (inMins !== null && schedInMins !== null && inMins > schedInMins) {
        lateMinutes = inMins - schedInMins;
      }

      if (outMins !== null && schedOutMins !== null && outMins < schedOutMins) {
        earlyLeaveMinutes = schedOutMins - outMins;
      }

      const isLate = lateMinutes > 5;
      const isEarly = earlyLeaveMinutes > 5;

      if (isLate && isEarly) {
        status = "LATE_AND_EARLY";
        statusText = `遲到${lateMinutes}分+早退${earlyLeaveMinutes}分`;
        statusColor = "yellow";
      } else if (isLate) {
        status = "LATE";
        statusText = `遲到 (${lateMinutes}分)`;
        statusColor = "yellow";
      } else if (isEarly) {
        status = "EARLY_LEAVE";
        statusText = `早退 (${earlyLeaveMinutes}分)`;
        statusColor = "yellow";
      } else {
        status = "NORMAL";
        statusText = "正常出勤";
        statusColor = "green";
      }
    }
  }

  const primaryVerifyMode = validPunches.length > 0 ? validPunches[0].verify_mode : null;

  return {
    date: dateStr,
    dayOfWeek,
    isToday: dateStr === todayStr,
    isRestDay: isLeaveShift ? false : isRest,
    isLeave: isLeaveShift,
    shiftName,
    shiftStart,
    shiftEnd,
    status,
    statusText,
    statusColor,
    firstInTime,
    lastOutTime,
    lateMinutes,
    earlyLeaveMinutes,
    workHours: totalWorkHours,
    leaveHours,
    overtimeHours,
    verifyMode: primaryVerifyMode,
    punches: validPunches
  };
}

export class ScheduleService {
  constructor(private repo: ScheduleRepository) {}

  /**
   * Compute monthly attendance audit calendar for user.
   */
  async getMonthlyAttendance(targetUserId: string, targetMonth: string): Promise<MonthlyAttendanceResponse> {
    const [yearStr, monthStr] = targetMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new Error("無效的月份格式 (請使用 YYYY-MM)");
    }

    const daysInMonth = new Date(year, month, 0).getDate();

    // Fetch schedules and punches via repository batch
    const { schedules, punches } = await this.repo.getMonthlyScheduleAndPunchBatch(targetUserId, targetMonth);

    const scheduleMap = new Map<string, DailySchedule>();
    for (const s of schedules) {
      scheduleMap.set(s.work_date, s);
    }

    // Check employee schedule_mode: If FIXED and month has NO schedules, auto-materialize into D1
    const empInfo = await this.repo.getEmployeeInfo(targetUserId);
    const scheduleMode = empInfo?.schedule_mode || "FIXED";

    if (scheduleMode === "FIXED" && schedules.length === 0) {
      const defaultCompanyId = empInfo?.company_id || "24549210-01";
      const startShift = empInfo?.default_shift_start || "09:00";
      const endShift = empInfo?.default_shift_end || "18:00";
      const breakMins = empInfo?.default_break_minutes || 60;

      const toInsert: Array<{
        company_id: string;
        line_user_id: string;
        work_date: string;
        shift_name: string;
        shift_start: string | null;
        shift_end: string | null;
        break_minutes: number;
        is_rest_day: number;
        is_cross_day: number;
      }> = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const dStr = `${targetMonth}-${day.toString().padStart(2, "0")}`;
        const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        toInsert.push({
          company_id: defaultCompanyId,
          line_user_id: targetUserId,
          work_date: dStr,
          shift_name: isWeekend ? "例假" : "常態班",
          shift_start: isWeekend ? null : startShift,
          shift_end: isWeekend ? null : endShift,
          break_minutes: isWeekend ? 0 : breakMins,
          is_rest_day: isWeekend ? 1 : 0,
          is_cross_day: 0,
        });
      }

      await this.repo.batchInsertDefaultSchedules(toInsert);

      for (const s of toInsert) {
        scheduleMap.set(s.work_date, {
          work_date: s.work_date,
          shift_name: s.shift_name,
          shift_start: s.shift_start,
          shift_end: s.shift_end,
          break_minutes: s.break_minutes,
          is_rest_day: s.is_rest_day,
          is_cross_day: s.is_cross_day,
        });
      }
    }

    const punchesMap = new Map<string, any[]>();
    for (const p of punches) {
      const pDate = p.created_at.slice(0, 10);
      if (!punchesMap.has(pDate)) punchesMap.set(pDate, []);
      punchesMap.get(pDate)!.push(p);
    }

    // Current Taiwan (UTC+8) time context
    const nowUtc = new Date();
    const twTime = new Date(nowUtc.getTime() + 8 * 3600 * 1000);
    const todayStr = twTime.toISOString().slice(0, 10);
    const currentMinutes = twTime.getUTCHours() * 60 + twTime.getUTCMinutes();

    const daysAudit: DayAttendanceAudit[] = [];
    let totalWorkHours = 0;
    let totalLeaveHours = 0;
    let attendanceDays = 0;
    let lateCount = 0;
    let earlyLeaveCount = 0;
    let missingPunchCount = 0;
    let overtimeHours = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${targetMonth}-${d.toString().padStart(2, "0")}`;
      const sched = scheduleMap.get(dStr);
      const dayPunches = punchesMap.get(dStr) || [];

      const audit = auditDayAttendance(dStr, sched, dayPunches, todayStr, currentMinutes);
      daysAudit.push(audit);

      totalWorkHours += audit.workHours;
      totalLeaveHours += (audit.leaveHours || 0);
      if (audit.workHours > 0 || ["NORMAL", "LATE", "EARLY_LEAVE", "LATE_AND_EARLY", "OVERTIME", "UNSCHEDULED_WORK"].includes(audit.status)) {
        attendanceDays++;
      }
      if (audit.lateMinutes > 5) lateCount++;
      if (audit.earlyLeaveMinutes > 5) earlyLeaveCount++;
      if (["MISSING_IN", "MISSING_OUT", "ABSENT"].includes(audit.status)) missingPunchCount++;
      overtimeHours += audit.overtimeHours;
    }

    return {
      success: true,
      userId: targetUserId,
      month: targetMonth,
      todayStr,
      summary: {
        total_work_hours: parseFloat(totalWorkHours.toFixed(1)),
        total_leave_hours: parseFloat(totalLeaveHours.toFixed(1)),
        attendance_days: attendanceDays,
        late_count: lateCount,
        early_leave_count: earlyLeaveCount,
        missing_punch_count: missingPunchCount,
        overtime_hours: parseFloat(overtimeHours.toFixed(1))
      },
      days: daysAudit
    };
  }

  /**
   * Generate CSV template string for shift schedule batch import.
   */
  generateScheduleCsvTemplate(): string {
    let csv = "\uFEFF";
    csv += "員工LINE_ID,員工姓名,排班日期(YYYY-MM-DD),班別名稱,預計上班(HH:MM),預計下班(HH:MM),休息分鐘,是否休假(0或1)\r\n";
    csv += `"Ubd107bb3ba1b85a8086fc3b2250458e8","豬毛","2026-08-01","常態班","09:00","18:00",60,0\r\n`;
    csv += `"Ubd107bb3ba1b85a8086fc3b2250458e8","豬毛","2026-08-02","例假","","",0,1\r\n`;
    return csv;
  }

  /**
   * Query tenant shift schedules.
   */
  async getTenantSchedules(taxId: string, filters: ScheduleQueryFilters): Promise<any[]> {
    return this.repo.queryTenantSchedules(taxId, filters);
  }

  /**
   * Batch upsert shift schedules scoped to tenant.
   */
  async batchUpsertSchedules(taxId: string, schedules: Array<any>): Promise<{ insertedCount: number; message: string }> {
    if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
      throw new Error("缺少 schedules 陣列資料");
    }

    const insertedCount = await this.repo.upsertBatchSchedules(taxId, schedules);
    return {
      insertedCount,
      message: `成功更新 ${insertedCount} 筆排班資料。`
    };
  }

  /**
   * Batch generate default schedules for all FIXED employees of a tenant for a given month.
   */
  async generateFixedMonthSchedules(taxId: string, month: string): Promise<{ createdCount: number; employeeCount: number; message: string }> {
    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(m) || m < 1 || m > 12) {
      throw new Error("無效的月份格式 (請使用 YYYY-MM)");
    }
    const daysInMonth = new Date(year, m, 0).getDate();

    const employees = await this.repo.getFixedEmployeesForTenant(taxId);
    if (employees.length === 0) {
      return { createdCount: 0, employeeCount: 0, message: "本企業目前沒有設定為固定班 (FIXED) 的員工。" };
    }

    const allSchedulesToInsert: Array<{
      company_id: string;
      line_user_id: string;
      work_date: string;
      shift_name: string;
      shift_start: string | null;
      shift_end: string | null;
      break_minutes: number;
      is_rest_day: number;
      is_cross_day: number;
    }> = [];

    for (const emp of employees) {
      const companyId = emp.company_id || `${taxId}-01`;
      const startShift = emp.default_shift_start || "09:00";
      const endShift = emp.default_shift_end || "18:00";
      const breakMins = emp.default_break_minutes || 60;

      for (let day = 1; day <= daysInMonth; day++) {
        const dStr = `${month}-${day.toString().padStart(2, "0")}`;
        const dayOfWeek = new Date(Date.UTC(year, m - 1, day)).getUTCDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        allSchedulesToInsert.push({
          company_id: companyId,
          line_user_id: emp.line_user_id,
          work_date: dStr,
          shift_name: isWeekend ? "例假" : "常態班",
          shift_start: isWeekend ? null : startShift,
          shift_end: isWeekend ? null : endShift,
          break_minutes: isWeekend ? 0 : breakMins,
          is_rest_day: isWeekend ? 1 : 0,
          is_cross_day: 0,
        });
      }
    }

    const createdCount = await this.repo.batchInsertDefaultSchedules(allSchedulesToInsert);
    return {
      createdCount,
      employeeCount: employees.length,
      message: `成功為 ${employees.length} 位固定班同仁生成 ${month} 月份排班 (新寫入 ${createdCount} 筆，已存在排班自動保留)。`
    };
  }
}
