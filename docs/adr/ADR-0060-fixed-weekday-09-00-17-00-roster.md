# ADR-0060: 員工「豬毛」設定固定平日朝九晚五 (Fixed Weekday 09:00-17:00 Roster v2.20.5)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.20.5`  
> **領域分類 (Category)**: `Scheduling` / `Fixed Roster`

---

## 決策內容與架構推演 (Decision Record)

- **母檔與排班架構落實**：
      - 於 `company_employees` 更新豬毛母檔：`schedule_mode = 'FIXED'`、`default_shift_start = '09:00'`、`default_shift_end = '17:00'`、`default_break_minutes = 60`。
      - 於 `employee_schedules` 同步校準 2026-09 月度整月 30 天排班：週一至週五為 09:00~17:00 常態班，週末六日為例假（`is_rest_day = 1`）。
      - 提供維運腳本 [`scripts/configure-pigmao-schedule.js`](file:///d:/line-checkin/scripts/configure-pigmao-schedule.js)，支援一鍵設定與 D1 資料庫直接校準。
    - **成效指標**：
      - `/api/v1/attendance/monthly` 實測驗證：平日精準呈現 09:00~17:00 常態班，週末為例假。
      - `npm test` 迴歸測試全數通過（33/33 + 39/39 + 46/46 + ... 100% PASS）。
      - `npm run check` 維持 **0 型別錯誤、0 架構違規**。
