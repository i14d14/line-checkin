export interface Env {
  DB: D1Database;
  ATTACHMENTS_BUCKET?: R2Bucket;
  LINE_LOGIN_CHANNEL_ID?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
  LINE_BOT_BASIC_ID?: string;
  TARGET_LAT?: string;
  TARGET_LON?: string;
  ALLOWED_RADIUS_METERS?: string;
  LOCATION_NAME?: string;
  LIFF_ID?: string;
  LINE_LIFF_APP_ID?: string;
  ADMIN_MASTER_KEY?: string;
  ENABLE_CHECKIN_SERVER_PUSH?: string;
}

export interface CheckinPayload {
  idToken: string;
  deviceId: string;
  companyId?: string; // May be '24549210' or '24549210-01'
  latitude: number;
  longitude: number;
  accuracy?: number;
  fallbackUserId?: string;
  fallbackDisplayName?: string;
  confirmDeviceSwitch?: boolean;
}

export interface SwitchDevicePayload {
  idToken: string;
  deviceId: string;
  fallbackUserId?: string;
  fallbackDisplayName?: string;
}

export interface LocationPayload {
  id: string;             // '24549210' or '24549210-01'
  name: string;           // '豬毛有限公司 - 台中美德總部'
  address: string;        // '台中市北區美德街56-11號'
  target_lat?: number;
  target_lon?: number;
  allowed_radius?: number;
  allowed_ips?: string | null; // e.g. '211.20.1.5, 114.33.20.0/24'
  manager_line_id?: string | null; // e.g. 'U1234567890abcdef' (Fallback Approver)
}

export interface DailySchedule {
  work_date: string;
  shift_name: string;
  shift_start: string | null;
  shift_end: string | null;
  break_minutes: number;
  is_rest_day: number;
  is_cross_day: number;
}

export interface DayAttendanceAudit {
  date: string;
  dayOfWeek: number;
  isToday: boolean;
  isRestDay: boolean;
  isLeave: boolean;
  shiftName: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  status: "NORMAL" | "LATE" | "EARLY_LEAVE" | "LATE_AND_EARLY" | "MISSING_IN" | "MISSING_OUT" | "ABSENT" | "OVERTIME" | "REST_DAY" | "SCHEDULED" | "LEAVE" | "TODAY";
  statusText: string;
  statusColor: string;
  firstInTime: string | null;
  lastOutTime: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workHours: number;
  leaveHours: number;
  overtimeHours: number;
  verifyMode: string | null;
  punches: any[];
}

export interface MonthlyAttendanceSummary {
  total_work_hours: number;
  total_leave_hours: number;
  attendance_days: number;
  late_count: number;
  early_leave_count: number;
  missing_punch_count: number;
  overtime_hours: number;
}

export interface MonthlyAttendanceResponse {
  success: boolean;
  userId: string;
  month: string;
  todayStr: string;
  summary: MonthlyAttendanceSummary;
  days: DayAttendanceAudit[];
}

export interface TenantAuthResult {
  authenticated: boolean;
  taxId?: string;
  role?: "ADMIN" | "READ_ONLY" | "SANDBOX_QA" | "MANAGER" | "VIEWER";
  name?: string;
  userId?: number;
  authType?: "SESSION" | "API_KEY";
  error?: string;
  status?: number;
}

export const ALL_PERMISSIONS = [
  "punch",          // 基礎打卡與月曆
  "apply",          // 發起請假/補卡/加班
  "approve",        // 審核簽核單據
  "view_store",     // 門市看板 (查看本店今日出勤與班表)
  "view_all",       // 全局看板 (查看跨分店出勤與工時)
  "set_location",   // 座標設定 (LINE 位置訊息直接設定門市經緯度)
  "set_wifi",       // Wi-Fi 登記 (登記當前連線 IP 為白名單)
  "device_audit",   // 換機解綁與資安警訊監控
  "export_payroll", // 計薪匯出 (產生 CSV 下載連結)
  "broadcast"       // 公告推播 (推播全體/門市訊息)
] as const;

export type PermissionCode = typeof ALL_PERMISSIONS[number];

export const PERMISSION_LABELS: Record<string, string> = {
  punch: "基礎打卡",
  apply: "線上申請",
  approve: "假勤審批",
  view_store: "門市看板",
  view_all: "全局看板",
  set_location: "座標設定",
  set_wifi: "Wi-Fi綁定",
  device_audit: "換機解綁",
  export_payroll: "計薪匯出",
  broadcast: "公告推播"
};

export const EMPLOYEE_RICH_MENU_ID = "richmenu-120970060b421fd2a35634007795916f";
export const MANAGER_RICH_MENU_ID = "richmenu-26e2f94f69a7e091962de3f22e6b6361";

export const MANAGEMENT_PERMISSIONS = [
  "view_store", "view_all", "approve", "set_location", "set_wifi", "device_audit", "export_payroll", "broadcast", "all", "admin"
];

export interface UserPermissionContext {
  companyId: string | null;
  companyName: string | null;
  employeeName: string | null;
  permissions: string[];
  isManager: boolean;
}

export type ApprovalType = "LEAVE" | "CORRECTION" | "OVERTIME";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ApprovalRecord {
  id: string;
  company_id: string;
  applicant_line_id: string;
  applicant_name: string;
  approver_line_id: string;
  type: ApprovalType;
  target_date: string;
  details: string; // JSON string
  status: ApprovalStatus;
  decided_at: string | null;
  created_at: string;
}

export interface ApprovalRequestPayload {
  companyId?: string;
  applicantId: string;
  applicantName: string;
  type: ApprovalType;
  targetDate: string;
  details: Record<string, any>;
  idToken?: string;
}

export interface CronNotificationRecord {
  id: number;
  line_user_id: string;
  work_date: string;
  type: "REMIND_IN" | "REMIND_OUT";
  shift_time: string | null;
  sent_at: string;
}

export interface CronRunSummary {
  success: boolean;
  date: string;
  currentTime: string;
  scannedCount: number;
  remindInSent: number;
  remindOutSent: number;
  skippedCount: number;
  errors: string[];
}

export interface AnnouncementRecord {
  id: string;
  company_id: string;
  title: string;
  content: string;
  author_name: string;
  created_at: string;
  total_recipients?: number;
  read_count?: number;
  read_rate?: number;
}

export interface AnnouncementReadRecord {
  announcement_id: string;
  line_user_id: string;
  read_at: string;
  employee_name?: string | null;
}

export interface CreateAnnouncementPayload {
  title: string;
  content: string;
  authorName?: string;
}

export interface AnnouncementDetailResponse {
  announcement: AnnouncementRecord;
  stats: {
    total: number;
    read: number;
    unread: number;
    readRate: number;
  };
  reads: {
    line_user_id: string;
    employee_name: string | null;
    read_at: string;
  }[];
  unreads: {
    line_user_id: string;
    employee_name: string | null;
  }[];
}

export interface PayslipItem {
  line_user_id: string;
  employee_name: string;
  pay_month: string;
  base_salary: number;
  allowances: number;
  overtime_pay: number;
  deductions: number;
  net_salary: number;
  note?: string;
}

export interface PayslipDispatchFailure {
  row?: number;
  line_user_id?: string;
  reason: string;
}

export interface PayslipDispatchResponse {
  success: boolean;
  count: number;
  failures: PayslipDispatchFailure[];
}

