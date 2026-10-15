# ADR-0065: Batch 4 自主驗證落地：企業 M2M API 金鑰自主生成撤銷中心與門市據點防呆 (Batch 4 Tenant M2M Keys & Location Safety Guards v2.25.0)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.25.0`  
> **領域分類 (Category)**: `Tenant Management` / `Identity & Security` / `Testing & Verification`

---

## 決策內容與架構推演 (Decision Record)

- **核心背景與待驗收範疇**：
  - 依據 [`AUTONOMOUS_VERIFICATION_ROADMAP.md`](file:///d:/line-checkin/AUTONOMOUS_VERIFICATION_ROADMAP.md) 之 Attention Budget Protocol，啟動 **Batch 4（後台金鑰與據點防呆）** 之輕量化自主驗證。
  - 覆蓋兩大關鍵待驗證項目：
    1. **項目 9**：企業 M2M API 金鑰自主生成 / 撤銷中心（Tier 2 HTML AST + Tier 4 D1 沙盒）
    2. **項目 10**：門市據點配置與刪除防呆（總部保護與員工綁定攔截）
- **Tier 2 靜態 HTML AST 語法樹與標籤閉合檢驗**：
  - **嚴格堆疊標籤平衡檢驗 (Stack-Based HTML Tag Balancer)**：
    - 遍歷 SSR 樣板字串，以先進後出（LIFO）堆疊檢驗所有非 void HTML 標籤。
    - 斷言 `src/views/admin/admin-modals.ts`（包含 `#createKeyModal` 與 `#showKeyModal`）與 `src/views/admin/admin-tabs.ts`（包含 `#tab-apikeys`）標籤 100% 嚴格閉合、零巢狀越界、零遺漏。
  - **JSDOM 語法樹與屬性合規性校驗**：
    - 驗證 `#createKeyModal` 具備 `hidden flex items-center justify-center`、`#createKeyForm` 綁定 `handleCreateKeySubmit(event)`、`#keyNameInput` 具備 `required`、`#keyRoleSelect` 包含 `ADMIN` 與 `READ_ONLY`、`#createKeySubmitBtn` 為 `type="submit"`。
    - 驗證 `#showKeyModal` 包含唯讀輸入框 `#newRawApiKeyInput`（`readonly`、`font-mono select-all`）、複製提示節點 `#copyBtnText` 與 `closeShowKeyModal()` 關閉按鈕。
    - 驗證 `#tab-apikeys` 包含「生成新金鑰」與「重新整理」按鈕、標準 7 大欄位表格（金鑰前綴提示、備註名稱、權限角色、狀態、建立時間、最後使用時間、操作）與 `#apiKeysTableBody`。
    - 斷言全域 DOM ID 唯一性（零重複 ID）。
- **Tier 4 D1 沙盒 - 項目 9：企業 M2M API 金鑰自主生成 / 撤銷中心**：
  - **參數校驗與負向防禦**：缺少 `tax_id`（400）、無效統編格式（400）、缺少備註名稱（400）、無效角色（400）均被精準攔截。
  - **一次性明文簽發與 SHA-256 落庫**：`POST /api/v1/tenant/keys` 成功簽發 `pk_live_99999999_...` 明文金鑰；D1 `tenant_api_keys` 中落庫之 `api_key_hash` 精準吻合 SHA-256 雜湊，`key_hint` 遮罩提示正確且 `is_active = 1`。
  - **安全遮罩查詢**：`GET /api/v1/tenant/keys` 未授權阻斷（401）；管理員金鑰查詢放行（200），回傳清單遮罩僅見 `key_hint`，嚴格保證不洩漏明文與雜湊值。
  - **金鑰撤銷端點權限與動詞相容性**：未認證阻斷（401）；READ_ONLY 金鑰嘗試撤銷阻斷（403 僅 ADMIN 可撤銷）；撤銷非所屬統編金鑰阻斷（404）；管理員呼叫 `POST/DELETE /api/v1/tenant/keys/:id/revoke` 成功將 D1 `is_active` 落庫變更為 `0`。
  - **已撤銷金鑰失效阻斷防禦**：使用已作廢金鑰請求金鑰清單或門市清單 API 時，後端即刻以 `403 Forbidden`（「此租戶金鑰已被停用 (Deactivated Key)」）全面拒絕。
- **Tier 4 D1 沙盒 - 項目 10：門市據點配置與刪除防呆 (總部保護與員工綁定攔截)**：
  - **總部法定名稱規範**：D1 中地址為台中市北區美德街56-11號之據點名稱恆為「豬毛有限公司 - 台中美德總部」。
  - **刪除權限邊界**：未認證刪除阻斷（401）；READ_ONLY 角色金鑰刪除阻斷（403 僅 ADMIN 可刪除）。
  - **總部保護不變量**：嘗試刪除 `taxId-01` 或純統編 `taxId` 總部主要據點，100% 拋錯阻斷（400「企業總部主要據點不可刪除」）。
  - **跨統編防越界阻斷**：非金鑰所屬統編之據點 ID 刪除時精準阻斷（400「權限越界」）。
  - **員工綁定防呆攔截**：門市若尚有在職員工綁定（`countEmployeesByLocation > 0`），刪除時嚴格阻斷（400「無法刪除：該門市尚有 X 位在職員工綁定」），D1 門市資料完好無損。
  - **空置據點正常刪除與解綁轉換**：無員工綁定之次級門市可正常物理刪除（200 OK）；在職員工解綁後，原門市重試刪除即刻放行並徹底自 D1 清除。
- **強制環境自動清理 (Mandatory Teardown Hook)**：
  - 測試結束於 `finally` 區塊無條件執行 D1 清理，刪除所有以 `99999999` 或 `-B4-` 為標記之測試同仁、門市據點與 API 金鑰，確認殘留數嚴格為 0。
- **成效指標**：
  - 專屬測試套件 [`test_batch4_verification.js`](file:///d:/line-checkin/test_batch4_verification.js) **102/102 斷言全數通過（100% PASS）**。
  - `npm run check`（`build:client` + `client:check` + `typecheck` + `arch:check`）維持 **0 型別錯誤、0 架構違規**。
  - Cloudflare Workers 邊緣部署成功（Version ID: `bd263cb1-985e-4c75-8fcf-e263fb16fe0d`）。
  - `LINE_CHECKIN_PROGRESS.md` 與 `AUTONOMOUS_VERIFICATION_ROADMAP.md` 正式將 Batch 4 標記為 `[User Verified ✅]`。
