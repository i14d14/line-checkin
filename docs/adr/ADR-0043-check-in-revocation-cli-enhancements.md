# ADR-0043: 考勤撤銷 CLI 增強支援 `--latest` / `--id` 與豬毛最新打卡紀錄撤銷 (Check-in Revocation CLI Enhancements v2.14.5)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.14.5`  
> **領域分類 (Category)**: `DevOps` / `CLI`

---

## 決策內容與架構推演 (Decision Record)

- **工項背景**：
      - 使用者提出指令需求，欲將員工「豬毛」最新一筆打卡紀錄刪除或取消。
      - 原 CLI 腳本 [`scripts/revoke-checkin.js`](file:///d:/line-checkin/scripts/revoke-checkin.js) 預設會影響整日所有打卡紀錄，未支援單獨針對最新一筆或指定 ID 操作。
    - **實作內容**：
      1. 升級 [`scripts/revoke-checkin.js`](file:///d:/line-checkin/scripts/revoke-checkin.js)：
         - 新增 `--latest` 參數：精準定位目標員工之最新一筆打卡，並自動比對前後 60 秒內之同梯次重試紀錄（如連帶產生的 DUPLICATE 紀錄），確保整個打卡事件被完整撤銷。
         - 新增 `--id <ID>` 參數：支援直接傳入精確打卡紀錄 ID 進行單筆撤回或刪除。
         - 刪除/撤銷語法由原本的整個時間區間比對收斂至 `WHERE id IN (${idList})`，避免誤傷同日其他正常打卡（如早上的上班打卡）。
      2. 執行撤銷處理：
         - 成功將豬毛於 11:16 產生的最新打卡紀錄（ID 681: `OUT`, `SUCCESS` 與 ID 682: `OUT`, `DUPLICATE`）標記為 `CANCELLED`。
         - 寫入 `device_audit_logs` 稽核軌跡。
         - 狀態機自動恢復至 10:37:42 之有效上班狀態（前次有效打卡：ID 668，上班中），30 分鐘防呆鎖定已同步解除，下次可正常執行下班打卡。
