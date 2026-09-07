// test_holiday_overtime_defense.js
const assert = require("assert");

// Extract auditDayAttendance logic for direct testing
function parseTimeToMinutes(t) {
  if (!t || typeof t !== "string") return null;
  const parts = t.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

// Attendance Auditor Engine for Single Day (Mirroring schedule.service.ts)
function auditDayAttendance(
  dateStr,
  schedule,
  punches,
  todayStr,
  currentMinutes
) {
  if (!todayStr) {
    const nowUtc = new Date();
    const twDate = new Date(nowUtc.getTime() + 8 * 3600 * 1000);
    todayStr = twDate.toISOString().slice(0, 10);
    currentMinutes = twDate.getUTCHours() * 60 + twDate.getUTCMinutes();
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const rawShiftName = schedule ? schedule.shift_name : (dayOfWeek === 0 || dayOfWeek === 6 ? "例假" : "常態班");
  const isLeaveShift = rawShiftName.includes("請假");
  const isStandardWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isRest = schedule ? schedule.is_rest_day === 1 : isStandardWeekend;
  const shiftName = rawShiftName;
  const shiftStart = schedule?.shift_start || (isRest && !isLeaveShift ? null : "09:00");
  const shiftEnd = schedule?.shift_end || (isRest && !isLeaveShift ? null : "18:00");

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

  let status = "NORMAL";
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
        overtimeHours = 0;
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
    // Weekday attendance logic
    if (validPunches.length === 0) {
      if (dateStr > todayStr) {
        status = "SCHEDULED";
        statusText = "待出勤";
        statusColor = "sky";
      } else {
        status = "ABSENT";
        statusText = "未出勤/曠職";
        statusColor = "red";
      }
    } else {
      status = "NORMAL";
      statusText = "正常出勤";
      statusColor = "green";
    }
  }

  return {
    date: dateStr,
    status,
    statusText,
    statusColor,
    workHours: totalWorkHours,
    overtimeHours,
    leaveHours
  };
}

console.log("================================================================================");
console.log("🧪 TESTING DEFENSIVE HOLIDAY OVERTIME & REST DAY LEAVE AUDIT RULES");
console.log("================================================================================");

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

// 1. Weekend with punches (2026-09-05 is Saturday)
test("1A. Weekend with no schedule + punches -> OVERTIME (purple)", () => {
  const audit = auditDayAttendance(
    "2026-09-05",
    undefined,
    [{ punch_type: "IN", status: "SUCCESS", created_at: "2026-09-05 10:00:00" }, { punch_type: "OUT", status: "SUCCESS", work_hours: 5.5, created_at: "2026-09-05 15:30:00" }]
  );
  assert.strictEqual(audit.status, "OVERTIME");
  assert.strictEqual(audit.statusColor, "purple");
  assert.strictEqual(audit.overtimeHours, 5.5);
  assert.strictEqual(audit.leaveHours, 0);
});

test("1B. Weekend with dirty leave schedule + punches -> OVERTIME (purple)", () => {
  const dirtySchedule = {
    shift_name: "請假 (事假)",
    shift_start: "09:00",
    shift_end: "18:00",
    break_minutes: 60,
    is_rest_day: 0
  };
  const audit = auditDayAttendance(
    "2026-09-05",
    dirtySchedule,
    [{ punch_type: "IN", status: "SUCCESS", created_at: "2026-09-05 11:36:57" }]
  );
  assert.strictEqual(audit.status, "OVERTIME");
  assert.strictEqual(audit.statusColor, "purple");
  assert.strictEqual(audit.leaveHours, 0);
});

test("1C. Weekend with dirty leave schedule + NO punches -> REST_DAY (gray)", () => {
  const dirtySchedule = {
    shift_name: "請假 (事假)",
    shift_start: "09:00",
    shift_end: "18:00",
    break_minutes: 60,
    is_rest_day: 0
  };
  const audit = auditDayAttendance("2026-09-05", dirtySchedule, []);
  assert.strictEqual(audit.status, "REST_DAY");
  assert.strictEqual(audit.statusColor, "gray");
  assert.strictEqual(audit.leaveHours, 0);
});

// 2. Weekday with leave schedule (2026-09-02 is Wednesday)
test("2A. Weekday with leave schedule + NO punches -> LEAVE (amber)", () => {
  const leaveSchedule = {
    shift_name: "請假 (病假)",
    shift_start: "09:00",
    shift_end: "18:00",
    break_minutes: 60,
    is_rest_day: 1
  };
  const audit = auditDayAttendance("2026-09-02", leaveSchedule, []);
  assert.strictEqual(audit.status, "LEAVE");
  assert.strictEqual(audit.statusColor, "amber");
  assert.strictEqual(audit.leaveHours, 8);
  assert.strictEqual(audit.overtimeHours, 0);
});

test("2B. Weekday with leave schedule + punches -> NORMAL (green, partial work)", () => {
  const leaveSchedule = {
    shift_name: "請假 (事假)",
    shift_start: "09:00",
    shift_end: "18:00",
    break_minutes: 60,
    is_rest_day: 0
  };
  const audit = auditDayAttendance(
    "2026-09-02",
    leaveSchedule,
    [{ punch_type: "IN", status: "SUCCESS", created_at: "2026-09-02 09:00:00" }, { punch_type: "OUT", status: "SUCCESS", work_hours: 4.0, created_at: "2026-09-02 13:00:00" }]
  );
  assert.strictEqual(audit.status, "NORMAL");
  assert.strictEqual(audit.statusColor, "green");
  assert.strictEqual(audit.leaveHours, 4.0); // 8.0 - 4.0 = 4.0 leave hours
  assert.strictEqual(audit.overtimeHours, 0);
});

// 3. Weekday normal schedule + punches -> NORMAL (green)
test("3. Weekday normal schedule + normal punches -> NORMAL (green)", () => {
  const audit = auditDayAttendance(
    "2026-09-02",
    undefined,
    [{ punch_type: "IN", status: "SUCCESS", created_at: "2026-09-02 08:58:00" }, { punch_type: "OUT", status: "SUCCESS", work_hours: 8.0, created_at: "2026-09-02 18:02:00" }]
  );
  assert.strictEqual(audit.status, "NORMAL");
  assert.strictEqual(audit.statusColor, "green");
  assert.strictEqual(audit.overtimeHours, 0);
});

console.log("================================================================================");
console.log(`🎉 ALL ${passCount} DEFENSIVE AUDIT TESTS PASSED!`);
console.log("================================================================================");
