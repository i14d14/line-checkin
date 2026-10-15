# ADR-0057: SSOT 實體排班架構、未排班透明感知與固定班一鍵實體化 (SSOT Physical Roster, Unscheduled Transparency & One-Click Materialization ADR v2.20.0 / Schema v13)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.20.0`  
> **領域分類 (Category)**: `Scheduling` / `SSOT Roster`

---

## 決策內容與架構推演 (Decision Record)

- **背景與痛點根因**：
      - 使用者反映從未收到過「上班前 15 分鐘 / 下班後 10 分鐘」之定時打卡提醒推播。
      - 經深度巡檢架構發現核心矛盾：出勤月曆查詢過去在無排班資料時，會在代碼層動態捏造「09:00~18:00 常態班」的虛擬幽靈班表（Ghost Fallback）；而雲端 Cron Worker 巡檢時查詢實體 D1 資料庫（`WHERE work_date = ? AND is_rest_day = 0`），因資料庫無實體資料而查無任何應打卡同仁，導致推播從未觸發。
      - 同時，排班制同仁（`SHIFT`）若尚未排班，出勤月曆過去會誤顯示為常態班，無法透明看見「未排班」真實狀態。
    - **架構重構核心措施**：
      1. **D1 Schema v13 擴充工時制度**：
         - 於 `company_employees` 新增 `schedule_mode`（`FIXED` 固定班 / `SHIFT` 排班制）、`default_shift_start`（預設 09:00）、`default_shift_end`（預設 18:00）、`default_break_minutes`（預設 60）。
      2. **徹底拔除虛擬幽靈班表，落實未排班狀態機**：
         - 重構 `ScheduleService.auditDayAttendance`：徹底廢止幽靈常態班 fallback。
         - 排班制同仁（`SHIFT`）無排班之日，無打卡呈現 `UNSCHEDULED`（未排班，灰白底虛線框，缺卡/遲到/早退為 0）；有打卡則精準呈現 `UNSCHEDULED_WORK`（未排班出勤，靛藍色徽章，累計工時與出勤天數）。
      3. **固定班實體自動與一鍵實體化**：
         - `ScheduleService.getMonthlyAttendance`：固定班同仁查詢出勤月曆時，若當月無排班，自動一鍵將整月預設班表（平日 09:00~18:00 常態班、週末例假日）寫入 D1 `employee_schedules`，達成實體落庫。
         - 提供 `POST /api/v1/tenant/schedules/generate` 專屬 API 與管理後台【⚡ 一鍵生成固定班排班】按鈕，供人資隨時為全體固定班員工批次實體化排班。
      4. **定時巡檢推播（REMIND_IN / REMIND_OUT）完全對齊**：
         - Cron Worker 巡檢時直接對齊實體班表，固定班同仁每天於上班前 15 分鐘及下班後 10 分鐘皆能準時收到 Flex 卡片推播；排班制同仁在人資排班後自動納入巡檢。
      5. **管理後台與 LIFF 前端全面升級**：
         - 管理後台「員工權限彈窗」支援配置工時制度（`FIXED` vs `SHIFT`）與個人預設班別時間。
         - LIFF 前端月曆升級支援 `UNSCHEDULED` 灰白虛線未排卡片與 `UNSCHEDULED_WORK` 靛藍標籤。
    - **成效指標**：
      - 新增專屬驗證套件 [`test_roster_ssot_and_unscheduled.js`](file:///d:/line-checkin/test_roster_ssot_and_unscheduled.js) **33/33 斷言 100% PASS**。
      - 全量迴歸測試 131/131 PASS，累計 164 項自動化測試 100% 通過。
