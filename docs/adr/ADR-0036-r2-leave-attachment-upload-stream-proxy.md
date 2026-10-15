# ADR-0036: Cloudflare R2 請假附件證明照片上傳與主管審核卡片一鍵查看 (R2 Leave Attachment Upload & Stream Proxy ADR v2.12.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.12.0`  
> **領域分類 (Category)**: `Storage` / `Cloudflare R2`

---

## 決策內容與架構推演 (Decision Record)

- **核心痛點**：
      1. 員工申請病假、婚假、喪假等特殊假別時，勞基法與企業規章要求檢附看診收據、診斷證明或訃聞等佐證文件。
      2. 專案原先缺少檔案/照片上傳能力，同仁需於 LINE 私訊主管或另行繳交紙本，造成線上 BPM 流程斷裂。
    - **架構升級原則與解法**：
      1. **Cloudflare R2 原生物件儲存綁定 (`ATTACHMENTS_BUCKET`)**：
         - 在 `wrangler.jsonc` 配置 `"r2_buckets": [{ "binding": "ATTACHMENTS_BUCKET", "bucket_name": "line-checkin-attachments" }]`。
         - 在 `src/types/index.ts` 擴充 `Env.ATTACHMENTS_BUCKET?: R2Bucket`。
      2. **邊緣安全上傳與快取代理串流 (`AttachmentService` & `AttachmentRoute`)**：
         - 建立 [`src/services/attachment.service.ts`](file:///d:/line-checkin/src/services/attachment.service.ts) 與 [`src/routes/attachment.route.ts`](file:///d:/line-checkin/src/routes/attachment.route.ts)。
         - `POST /api/v1/attachments/upload`：支援 `multipart/form-data` 與二進位直傳，內建 MIME 類型檢核（僅允許 `image/jpeg`、`image/png`、`image/webp`）與 5MB 嚴格防呆限制。
         - 防碰撞 Key 命名規範：`proofs/${companyId}/${yyyy-mm-dd}/${uuid}.${ext}`。
         - `GET /api/v1/attachments/:key`：由 Worker 代理 R2 串流響應，注入 `Content-Type` 與 `Cache-Control: public, max-age=31536000, immutable` 邊緣極速快取。
      3. **零 Migration 資料庫相容性保證**：
         - 證明文件之 `attachment_key` 與 `attachment_url` 直接封裝於 `approvals.details` JSON 欄位中，完全無需變更資料庫 Schema。
      4. **LIFF 行動端相機/相簿直選與即時預覽體驗**：
         - 在請假分頁（[`src/views/liff/liff-tabs.ts`](file:///d:/line-checkin/src/views/liff/liff-tabs.ts)）新增拍照/選圖卡片 `<input type="file" id="leaveProof" accept="image/*" capture="environment">`。
         - 選圖後即時以 FileReader 渲染縮圖、檔名與大小，並提供一鍵移除功能。
         - 送單時自動先上傳照片取得 URL，再一併提交簽核申請。
         - 個人申請紀錄清單（`myApprovalsList`）同步提供 `[📎 查看證明文件]` 超連結。
      5. **主管審查 Flex 卡片【📎 查看證明文件】一鍵查看直通**：
         - 在主管審核推播 Flex 卡片（[`src/views/flex/approval-flex.ts`](file:///d:/line-checkin/src/views/flex/approval-flex.ts)）中偵測 `attachment_url`。
         - 若存在證明文件，自動於卡片本體注入 `【📎 查看證明文件】` 次級按鈕（URI Action），主管於 LINE 聊天室點擊即可直達圖檔檢閱。
      6. **成效指標**：
         - 全新單元與整合測試套件 `test_attachment_upload.js` / `test_attachment_upload.ts` **28 項測試 100% PASS**。
         - 現有 BPM 全功能整合測試 `test_bpm_approvals.js` **46 項測試維持 100% PASS**。
         - 依賴檢查與型別編譯 `npm run check` 達成 **0 型別錯誤、0 架構違規**（41 模組、95 條依賴關係）。
         - `src/index.ts` 保持精簡，代碼量控制於 106 LOC（嚴格低於 120 LOC 限制）。
