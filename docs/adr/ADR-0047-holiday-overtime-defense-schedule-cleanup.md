# ADR-0047: 考勤稽核引擎週末例假防禦性容錯與歷史排班清洗 (Holiday Overtime Defense & Schedule Cleanup v2.15.3)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.15.3`  
> **領域分類 (Category)**: `Attendance` / `Audit Engine`

---

## 決策內容與架構推演 (Decision Record)

- **問題成因**：
      1. **歷史違規排班殘留**：在 v2.15.0 上線「休假日禁止請假」防呆前，同仁 9/5（週六）曾送出請假單並獲核准，在 D1 `employee_schedules` 遺留 `shift_name: "請假 (事假)"` 與 `is_rest_day: 0`。
      2. **稽核引擎請假優先級缺陷**：原先 `auditDayAttendance` 優先判定 `isLeaveShift`，若同仁當天有出勤打卡，一律判定為「請假 + 出勤」之正常出勤（綠色 `NORMAL`），導致常態週末例假日之打卡無法被識別為「假日加班」（紫色 `OVERTIME`）。
    - **修復與防護措施**：
      1. **考勤稽核引擎防禦性優先級 (`src/services/schedule.service.ts`)**：
         - 在 `auditDayAttendance` 中加入週末防禦檢核：若當日為常態週末（`isStandardWeekend`），即使班表存有請假標記，若有打卡一律強制判定為 `OVERTIME`（紫色 `statusColor = "purple"`，標註為「假日加班」），確保出勤工時不被綠色吃掉。
         - 若無打卡，則自動回歸 `REST_DAY`（灰色休假），保護員工請假額度不被週末無效扣除。
         - 平日（週一至週五）請假打卡邏輯維持不變（支援請假工時混合沖銷）。
      2. **歷史資料即時補丁 (D1 Remote Patch)**：
         - 刪除 `employee_schedules` 中 9/5 的違規排班紀錄（id: 365）。
         - 將對應審核單（`appr_aab7dccc637e4edb`）狀態更新為 `CANCELLED`。
         - 即時驗證 `/api/v1/attendance/monthly`，豬毛 9/5 狀態即刻呈現 `OVERTIME`（紫色，假日加班）。
      3. **全自動化單元與整合測試**：
         - 新增 [`test_holiday_overtime_defense.js`](file:///d:/line-checkin/test_holiday_overtime_defense.js) 覆蓋 6 大邊界情境，6/6 斷言 100% 通過。
         - 全量業務整合測試 131 / 131 項 100% PASS。
         - 最新 Worker 已成功部署至生產環境。
