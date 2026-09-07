// Parse "HH:MM" to minutes from 00:00
export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || !timeStr.includes(":")) return null;
  const parts = timeStr.trim().split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

// Format current time in Taipei timezone
export function getTaipeiDateTimeString(date: Date = new Date()): string {
  return date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}
