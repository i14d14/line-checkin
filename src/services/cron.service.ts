import { Env, CronRunSummary } from "../types";
import { CronRepository, ActiveScheduleItem } from "../repositories/cron.repo";
import { pushReminderMessage } from "../views/flex/reminder-flex";
import { parseTimeToMinutes } from "../utils/time";

export class CronService {
  private cronRepo: CronRepository;

  constructor(private env: Env) {
    this.cronRepo = new CronRepository(env.DB);
  }

  /**
   * Resolve current date (YYYY-MM-DD) and minutes from 00:00 in Asia/Taipei timezone.
   */
  getTaipeiNow(mockDate?: string, mockTime?: string) {
    if (mockDate && mockTime) {
      return {
        workDate: mockDate,
        timeStr: mockTime,
        currentMinutes: parseTimeToMinutes(mockTime) || 0,
      };
    }

    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const getPart = (t: string) => parts.find((p) => p.type === t)?.value || "";
    const workDate = mockDate || `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
    const timeStr = mockTime || `${getPart("hour")}:${getPart("minute")}`;
    const currentMinutes = parseTimeToMinutes(timeStr) || 0;

    return { workDate, timeStr, currentMinutes };
  }

  /**
   * Main cron execution loop for clock-in & clock-out reminders.
   */
  async handleCronScheduled(mockDate?: string, mockTime?: string): Promise<CronRunSummary> {
    const { workDate, timeStr, currentMinutes } = this.getTaipeiNow(mockDate, mockTime);

    let remindInSent = 0;
    let remindOutSent = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    try {
      const schedules = await this.cronRepo.getActiveSchedulesForDate(workDate);
      const punches = await this.cronRepo.getTodayPunches(workDate);

      // Build punch index by user ID
      const userPunches = new Map<string, { hasIn: boolean; hasOut: boolean }>();
      for (const p of punches) {
        const entry = userPunches.get(p.line_user_id) || { hasIn: false, hasOut: false };
        if (p.punch_type === "IN") entry.hasIn = true;
        if (p.punch_type === "OUT") entry.hasOut = true;
        userPunches.set(p.line_user_id, entry);
      }

      const accessToken = this.env.LINE_CHANNEL_ACCESS_TOKEN || "";
      const liffId = this.env.LIFF_ID || "2011328810-vjUUBSYA";

      for (const sched of schedules) {
        const userId = sched.line_user_id;
        const punchStatus = userPunches.get(userId) || { hasIn: false, hasOut: false };

        // 1. Clock-in Reminder (上班打卡提醒)
        // Target: Employee has NOT punched in yet, and current time is 10~20 minutes before shift_start
        if (!punchStatus.hasIn && sched.shift_start) {
          const startMins = parseTimeToMinutes(sched.shift_start);
          if (startMins !== null) {
            const diff = startMins - currentMinutes;
            if (diff >= 10 && diff <= 20) {
              const alreadySent = await this.cronRepo.hasNotificationBeenSent(userId, workDate, "REMIND_IN");
              if (!alreadySent) {
                if (accessToken) {
                  await pushReminderMessage(accessToken, userId, "IN", {
                    userName: sched.employee_name,
                    shiftTime: sched.shift_start,
                    locationName: sched.location_name,
                    liffId,
                    diffMinutes: diff,
                  });
                }
                await this.cronRepo.recordNotificationSent(userId, workDate, "REMIND_IN", sched.shift_start);
                remindInSent++;
                continue;
              } else {
                skippedCount++;
              }
            }
          }
        }

        // 2. Clock-out Reminder (下班防漏打卡提醒)
        // Target: Employee has punched in, but has NOT punched out yet, and current time is 10~25 minutes after shift_end
        if (punchStatus.hasIn && !punchStatus.hasOut && sched.shift_end) {
          const endMins = parseTimeToMinutes(sched.shift_end);
          if (endMins !== null) {
            const diff = currentMinutes - endMins;
            if (diff >= 10 && diff <= 25) {
              const alreadySent = await this.cronRepo.hasNotificationBeenSent(userId, workDate, "REMIND_OUT");
              if (!alreadySent) {
                if (accessToken) {
                  await pushReminderMessage(accessToken, userId, "OUT", {
                    userName: sched.employee_name,
                    shiftTime: sched.shift_end,
                    locationName: sched.location_name,
                    liffId,
                    diffMinutes: diff,
                  });
                }
                await this.cronRepo.recordNotificationSent(userId, workDate, "REMIND_OUT", sched.shift_end);
                remindOutSent++;
                continue;
              } else {
                skippedCount++;
              }
            }
          }
        }
      }

      return {
        success: true,
        date: workDate,
        currentTime: timeStr,
        scannedCount: schedules.length,
        remindInSent,
        remindOutSent,
        skippedCount,
        errors,
      };
    } catch (err: any) {
      console.error("Cron execution error:", err);
      errors.push(err.message || String(err));
      return {
        success: false,
        date: workDate,
        currentTime: timeStr,
        scannedCount: 0,
        remindInSent,
        remindOutSent,
        skippedCount,
        errors,
      };
    }
  }
}
