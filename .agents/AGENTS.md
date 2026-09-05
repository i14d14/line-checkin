# Project Rules & Context (LINE Check-in)

## LINE Channel Identity
- **LINE Channel ID**: `2011286264`

## Cloudflare Account Identity
- **Cloudflare Account ID**: `855d7f93966abed2712c15f619ea6721`

## Environment Variables & Credential Management (.env)
- **Never Commit Secrets**: Ensure `.env`, `.env.local`, `.env.*.local` are strictly ignored in `.gitignore`.
- **Maintain `.env.example`**: Keep `.env.example` perfectly in sync whenever adding, renaming, or removing environment variables. Use descriptive placeholder values (e.g., `your_api_key`) and clear section comments.
- **No Hardcoded Credentials or Fallbacks**: Load configuration strictly via environment variable loaders (`process.env`, `env`). Never provide hardcoded secrets as fallback defaults in code or function signatures.
- **Log & Output Sanitization**: Never log, print, output in console logs, error traces, or write raw API tokens, app secrets, or credentials to files or artifacts. Always mask tokens when inspecting requests (e.g., `Bearer ***`).
- **Early Startup Validation & Fail-Fast**: Validate the presence and format of required environment variables early during startup or client initialization. Fail fast with actionable error messages if required variables are missing.
- **Least Privilege Access**: Ensure access tokens and service account credentials stored in `.env` hold only the minimum necessary scopes required for the execution context.
- **Consistent Naming & Namespacing**: Use `UPPER_SNAKE_CASE` with descriptive service prefixes (e.g., `LINE_CHANNEL_SECRET`, `CLOUDFLARE_API_TOKEN`).

## Git Best Practices
- **Atomic & Semantic Commits**: Keep commits small and focused on a single logical change. Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- **Inspect Before Staging**: Check status and diff (`git status`, `git diff --staged`) before staging to avoid blindly adding untracked build artifacts or temporary files.
- **Strict Secret Exclusion**: Verify credentials, `.env*`, and tool caches remain strictly ignored before committing. Never force-add ignored files.
- **Clean & Linear History**: Use `git pull --rebase` to integrate upstream changes smoothly without redundant merge commits.
- **Descriptive Branching**: Use semantic branch naming (e.g., `feat/<name>`, `fix/<issue>`, `chore/<task>`).

## Coding Skills & Learning Loops
- **JavaScript / TypeScript**: Load `.agents/skills/javascript-typescript/SKILL.md` whenever writing or modifying JS/TS code. Add new entries to this skill whenever a JS/TS mistake, build trap, or runtime failure occurs.
- **Software Architecture**: Load `.agents/skills/software-architecture/SKILL.md` whenever architecting or refactoring medium-to-large projects (e.g. multi-domain systems, persistent DB schemas, multiple integration channels, or whenever any core file approaches/exceeds 300 LOC). Do not load for single-file scripts or quick fixes.

## LINE Check-in Project (Single Source of Truth)
- **Always Keep `LINE_CHECKIN_PROGRESS.md` Up to Date**: All latest states, architectural changes, API routes, database schema modifications, feature progress, deployment statuses, and verified test results of the LINE Check-in project must be continuously and strictly reflected in `LINE_CHECKIN_PROGRESS.md`.

## Versioning & Rollback Notifications (版本更迭與通知規範)
- **Mandatory Version Iteration**: 每次專案更動（包含功能新增、架構微調、Bug 修復或 Schema 變更）都必須遞增並留下明確的版本號紀錄（例如 `v1.x.x` / `Schema vX`）。
- **Explicit Version Notice in Chat**: 每次完成變更並回覆使用者時，**必須在訊息中主動標明當前的版本號**（例如：`【當前專案版本：v1.8.0】`），以利使用者進行追蹤與版本復原（Rollback）。

## Headquarters Location Naming Rule (總部據點永久命名規範)
- **美德街56-11號據點法定命名**：地址為「台中市北區美德街56-11號」的據點名稱永遠為 **`豬毛有限公司 - 台中美德總部`**。所有資料庫記錄、測試資料、設定檔、種子資料與 UI 呈現皆必須嚴格遵守此命名，嚴禁使用其他名稱（如「換機測試旗艦店」、「豬毛科技」或「豬毛餐飲」）。
