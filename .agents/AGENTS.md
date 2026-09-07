# Project Rules & Context (LINE Check-in)

## LINE Channel Identity
- **LINE Channel ID**: `2011286264`

## Cloudflare Account Identity
- **Cloudflare Account ID**: `855d7f93966abed2712c15f619ea6721`

## Cloudflare Dual-Stack Network & IPv6 Verification Invariants
- **Edge Dual-Stack Routing (RFC 8305 / Happy Eyeballs)**:
  Cloudflare edge proxies operate in native dual-stack mode (IPv4 + IPv6). Whenever a client's local network (such as store broadband Wi-Fi, Chunghwa Telecom, or mobile carrier dual-stack APNs) supports IPv6, modern OS stacks and mobile browsers automatically prefer IPv6 connections to Cloudflare. Consequently, the incoming HTTP header `cf-connecting-ip` (and mock header `x-mock-ip` in tests) delivers an IPv6 address (e.g., `2001:b030:...` or `2404:6800:...`).
- **Root Cause of False Wi-Fi Downgrades (`GPS_FALLBACK`)**:
  If a store location's `allowed_ips` configuration in Cloudflare D1 only registers an IPv4 egress address (e.g. `59.126.167.108`) while the store Wi-Fi provides dual-stack IPv6, incoming employee check-in requests with IPv6 addresses fail the IP whitelist match. The server fallback logic then downgrades the verification mode from `IP_WHITELIST` to `GPS_FALLBACK`. If indoor GPS accuracy drifts beyond the configured `allowed_radius` (e.g., > 100m indoors), the check-in is rejected with an error ("未連線至公司指定 Wi-Fi，或確認 GPS 定位在門市範圍內"), misleading users to believe "Wi-Fi is connected but reported as external network downgrade".
- **Mandatory Dual-Stack Whitelisting & Diagnostic Protocol**:
  All agents, engineers, and test scripts must strictly observe the following invariants:
  1. **Dual-Stack Configuration**: Whenever registering or updating store Wi-Fi whitelists, check and include both the public IPv4 address/CIDR and the ISP-assigned IPv6 address or prefix (e.g. `59.126.167.108, 2001:4860:7:810::db, 2404:6800:4008::/48`).
  2. **Mandatory Dual-Stack Automated Testing**: Automated test suites for IP whitelists and check-in services MUST execute test cases for **both IPv4 and IPv6** covering:
     - Exact IPv6 matches (`IP_WHITELIST`).
     - IPv6 CIDR prefix matches (`IP_WHITELIST`).
     - Unregistered IPv6 addresses falling back to `GPS_FALLBACK` when within range.
     - Unregistered IPv6 addresses rejected when exceeding radius.
  3. **Diagnostic Invariant**: When investigating any store Wi-Fi check-in failure or unexpected fallback, first inspect the client's `cf-connecting-ip` to determine if an unregistered IPv6 egress address was received.

## LINE Official Account Response Configuration Invariant
- **Bot Mode & Auto-Response Disabled Invariant**:
  The LINE Official Account settings in LINE Official Account Manager (`manager.line.biz`) must strictly follow:
  1. **Response Mode**: `Bot`
  2. **Webhook**: `Enabled`
  3. **Auto-reply messages**: `Disabled`
  - **Rationale**: All in-chat textual interactions (e.g., manager rejection reasons `【駁回 #id】原因：...`, attendance dashboard queries, GPS coordinate updates) are parsed and processed exclusively by the Cloudflare Worker Webhook. Leaving LINE's native auto-response enabled causes the platform to emit default fallback messages ("很抱歉，本帳號無法個別回復用戶的訊息") whenever incoming text does not match LINE's internal auto-reply keywords, disrupting user experience and causing confusion.

## Environment Variables & Credential Management (.env)
- **Never Commit Secrets**: Ensure `.env`, `.env.local`, `.env.*.local` are strictly ignored in `.gitignore`.
- **Maintain `.env.example`**: Keep `.env.example` perfectly in sync whenever adding, renaming, or removing environment variables. Use descriptive placeholder values (e.g., `your_api_key`) and clear section comments.
- **No Hardcoded Credentials or Fallbacks**: Load configuration strictly via environment variable loaders (`process.env`, `env`). Never provide hardcoded secrets as fallback defaults in code or function signatures.
- **Log & Output Sanitization**: Never log, print, output in console logs, error traces, or write raw API tokens, app secrets, or credentials to files or artifacts. Always mask tokens when inspecting requests (e.g., `Bearer ***`).
- **Early Startup Validation & Fail-Fast**: Validate the presence and format of required environment variables early during startup or client initialization. Fail fast with actionable error messages if required variables are missing.
- **Least Privilege Access**: Ensure access tokens and service account credentials stored in `.env` hold only the minimum necessary scopes required for the execution context.
- **Consistent Naming & Namespacing**: Use `UPPER_SNAKE_CASE` with descriptive service prefixes (e.g., `LINE_CHANNEL_SECRET`, `CLOUDFLARE_API_TOKEN`).

## Coding Skills & Learning Loops
- **JavaScript / TypeScript**: Load `.agents/skills/javascript-typescript/SKILL.md` whenever writing or modifying JS/TS code. Add new entries to this skill whenever a JS/TS mistake, build trap, or runtime failure occurs.
- **Software Architecture**: Load `.agents/skills/software-architecture/SKILL.md` whenever architecting or refactoring medium-to-large projects (e.g. multi-domain systems, persistent DB schemas, multiple integration channels, or whenever any core file approaches/exceeds 300 LOC). Do not load for single-file scripts or quick fixes.

## Architectural Modernization & Documentation Lifecycles
- **`ARCHITECTURE_REVIEW.md` (Transitional Modernization Blueprint - Retired)**:
  - Governed the architectural decoupling roadmap (Phases 1–4). With all modernization milestones completed and the codebase cleanly modularized, this transitional document has been permanently retired.
- **`LINE_CHECKIN_PROGRESS.md` (Living Product Single Source of Truth - SSOT)**:
  - Serves as the authoritative source for current business specifications, the Persistent Verification Matrix (239+ passing tests), active API endpoints, D1 schemas, and production deployment parameters.
  - Architectural changes must never break documented business behaviors; all version iterations, database schema updates, or verified features must continuously reflect in this file.

## Architectural Guardrails: Strict Unidirectional Call Chain
- **Strict Downward Dependency Hierarchy**:
  All codebase modules must strictly adhere to the downward invocation order:
  $$\text{Entrypoint (src/index.ts)} \longrightarrow \text{Routes} \longrightarrow \text{Services} \longrightarrow \text{Repositories} \longrightarrow \text{D1 Database}$$
- **Layer Responsibility & Boundary Invariants**:
  - **`Routes` (Layer 3 - Transport)**: Thin HTTP controllers. Strictly responsible for HTTP parsing, request parameter validation, and status code dispatching. Must delegate all business workflows to `Services`. Never directly executes raw SQL or queries D1.
  - **`Services` (Layer 2 - Business Domain)**: Pure domain business logic, state machines, and PBAC policies. Interacts with persistence strictly via `Repositories`. Never executes raw SQL. Strictly forbidden from importing or depending on `Routes` (`service-not-to-route`).
  - **`Repositories` (Layer 1 - Data Access)**: Encapsulates all D1 SQL statements, transactions, and table queries. Strictly forbidden from importing or depending on `Services` or `Routes` (`repo-not-to-service-or-route`).
  - **`Views` (Presentation Layer)**: Pure HTML/JSON template builders and push emitters. Strictly forbidden from importing `Repositories`, `D1`, or `Services` (`ui-not-to-db`, `views-not-to-service`).
  - **`Utils` & `Types` (Layer 0 - Leaf Foundation)**: Zero-dependency foundational utilities and shared domain interfaces. Strictly forbidden from importing any higher domain layers (`utils-must-be-leaf`).
  - **`Entrypoint` (`src/index.ts`)**: Pure assembler and lifecycle dispatcher only. Strictly capped at < 120 LOC.
- **Continuous Automated Enforcement**:
  - All directional boundary rules are hard-coded into [`.dependency-cruiser.cjs`](file:///d:/line-checkin/.dependency-cruiser.cjs). Every code modification must achieve a zero-error, zero-violation baseline via `npm run check` (`tsc --noEmit` + `depcruise src`) before completion.

## Versioning & Rollback Notifications
- **Mandatory Version Iteration**: Every project change (including feature additions, architectural adjustments, bug fixes, or schema alterations) must increment and record an explicit version tag (e.g., `v2.x.x` / `Schema vX`).
- **Explicit Version Notice in Chat**: Every completed response to the user must proactively include the current project version (e.g., `【當前專案版本：v2.8.1】`) to facilitate rollback tracking and auditability.

## Mandatory Automated Cloudflare Deployment Protocol
- **Edge Deployment Invariant**: Because this system relies on live LINE Webhooks, LINE LIFF, and Cloudflare Workers edge computing (`https://line-checkin-worker.i14d142.workers.dev`), local code changes are completely invisible to user testing on real devices until deployed.
- **Mandatory Finalization Pipeline**: At the conclusion of ANY task involving code or configuration changes, the agent MUST execute the full completion pipeline before responding to the user:
  1. **Integrity & Architecture Check**: Run `npm run check` (`tsc --noEmit` + `depcruise src`) to guarantee 0 type errors and 0 architectural violations.
  2. **Automated Verification**: Run relevant test scripts (e.g., `node test_...` or `npm test`) to ensure all assertions pass 100%.
  3. **Mandatory Edge Deployment**: Execute `node run-wrangler.js deploy` (or `npm run deploy`) to immediately publish the updated bundle to Cloudflare Workers edge.
  4. **Deployment Confirmation**: Verify the wrangler output confirms successful deployment (e.g., `Uploaded line-checkin-worker`, `Current Version ID: ...`).
  5. **Version Notice**: Record the version bump and emit the current version tag in the response chat.

## Automated Test Teardown & Database Cleanliness Invariant
- **Mandatory Teardown Hook in Tests**: Every automated test script that inserts or mutates test entities in Cloudflare D1 (including tenant locations, employee records, schedules, check-in records, approvals, or device bindings) MUST execute an automated teardown in a `finally` block or completion hook.
- **Dedicated Test Prefixes & Zero Persistent Pollution**:
  - Test locations and entities must carry dedicated test identifiers (e.g., `-TEST-`, `-BPM-`, `-PBAC-`).
  - Tests must never leave mock or transient stores/locations in the shared D1 database upon completion or failure.
  - Test suites must cleanly delete test locations, user attributions, and generated records to preserve production database integrity.

## Headquarters Location Naming Rule
- **Legal Naming Invariant for 56-11 Meide Street**: The official location name for the address "台中市北區美德街56-11號" must always be **`豬毛有限公司 - 台中美德總部`**. All database records, test suites, configuration files, seed data, and UI displays must strictly adhere to this exact legal entity name. Never use alternate naming (such as "換機測試旗艦店", "豬毛科技", or "豬毛餐飲").

## Documentation & Instruction Language Standards
- **Agent Instructions & Skill Guidance (`AGENTS.md`, `SKILL.md`)**: Must be written in 100% English for maximum token efficiency, semantic precision, and optimal LLM instruction following.
- **Skill References (`references/*.md`)**: Technical structure and documentation must be in English. Domain-specific entities, test payloads, UI strings (e.g., LINE Rich Menu CTA labels), and mock data may retain their target Chinese text where required by the platform.

