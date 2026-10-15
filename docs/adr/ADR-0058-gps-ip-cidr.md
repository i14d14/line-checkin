# ADR-0058: 雙軌驗證打卡 (GPS + IP/CIDR 白名單) 使用者實機驗收通過 (Persistent User Verification of Dual-Track Check-in v2.20.1)

> **狀態 (Status)**: 已採納 (Accepted) | **生效版本 (Version)**: `v2.20.1`  
> **領域分類 (Category)**: `Network` / `Verification`

---

## 決策內容與架構推演 (Decision Record)

- **驗收結果與持久化繼承**：
      - 使用者於真實行動裝置與實體門市網路情境（台中美德總部 `24549210-01`，對外固定 IP `59.126.167.108`）完成實機打卡測試與驗收。
      - 實測確認連線公司指定 Wi-Fi 時精準命中白名單直通（`verify_mode: "IP_WHITELIST"`），出勤打卡秒級成功且享有室內 GPS 飄移豁免。
      - 狀態持久化繼承：Section 2.1 全功能使用者實機驗證狀態矩陣已永久更新為 `[User Verified ✅]`，跨版本永久繼承。
