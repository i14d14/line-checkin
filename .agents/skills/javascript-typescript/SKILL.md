---
name: javascript-typescript
description: Write, refactor, debug, and verify modern JavaScript and TypeScript. Use whenever you need to write JS / TS code, handle template literals, server-side HTML/code generation, types, build tools, or runtime logic.
---

# JavaScript & TypeScript

Write clean, robust, and type-safe JavaScript (ES6+) and TypeScript.

> [!IMPORTANT]
> **Learning Rule**: Add to this skill whenever you make a JS/TS mistake, encounter a build/bundler failure, or discover a runtime gotcha. Keep entries concise, actionable, and rule-focused.

---

## Technical Guardrails & Gotchas

### 1. Template Literal Nesting (Code-Generating-Code / SSR)
- **Symptom / Gotcha**: When generating client-side JavaScript (e.g. inside an HTML `<script>` block) from within a backend JS/TS template literal (`` `...` ``), unescaped `${expression}` is evaluated immediately at compile/bundle time by Node/esbuild/TS rather than in the browser.
- **Rule**:
  - Always escape client-side template expressions using `\${expression}`:
    ```typescript
    // ✅ Correct: \${...} is preserved in the HTML string for browser execution
    return `
      <script>
        const msg = \`Hello \${user.name}\`;
      </script>
    `;
    ```
  - Or use plain string concatenation for client-side HTML injections.
  - **Regex Backslash Escaping in Template Literals**: Writing `/\r?\n/` inside a template literal causes `\r` and `\n` to be evaluated as literal carriage returns/newlines at compile-time, resulting in broken multiline regexes (`SyntaxError: Invalid regular expression: missing /`) in the browser. Avoid raw regex escapes in template strings; prefer string manipulation (e.g. `.split('\n').map(l => l.trim())`) or double-escaped `\\r?\\n`.
### 2. Variable Re-declaration in Extended Function Scopes
- **Symptom / Gotcha**: When introducing upstream matching or pre-calculation logic, re-using a variable name (e.g. `let distance` upstream and `const distance` downstream) triggers `The symbol 'X' has already been declared` build error.
- **Rule**: When adding pre-computations, audit downstream references in the same block scope to reassign the existing variable instead of declaring a conflicting `const`/`let`.

### 3. Cloudflare Edge Reserved Headers (`cf-connecting-ip` Error 1000)
- **Symptom / Gotcha**: Sending `cf-connecting-ip` in client request headers (e.g. in test suites simulating client IP) causes Cloudflare Edge proxy to reject the request with `Error 1000: DNS points to prohibited IP` before it ever reaches the Worker.
- **Rule**: Never manually set `cf-connecting-ip` in HTTP client requests. Support a test mock header in Worker code:
  ```typescript
  const clientIp = request.headers.get("x-mock-ip") || request.headers.get("cf-connecting-ip") || "unknown";
  ```

### 4. Integration Test Database State Leakage
- **Symptom / Gotcha**: Integration test assertions relying on exact table row counts (e.g. `locData.count === 2`) fail when executed after another test suite that inserted new permanent records into shared remote databases.
- **Rule**: Ensure integration tests are self-contained and idempotent. Use scoped queries (e.g. `companyTaxId`), upsert test prerequisites at suite initialization, and avoid hardcoding total table row counts.

### 5. Single-Quote Escaping inside Backend Template Literals (`Unexpected string`)
- **Symptom / Gotcha**: Writing inline event handlers like `'<button onclick="fn(\\'' + id + '\\')">'` inside a TypeScript backtick template literal (`` `...` ``) causes `\'` to evaluate to a bare `'` at compile time. In the generated HTML, the browser receives `'<button onclick="fn('' + id + '')">'`, which immediately throws `SyntaxError: Unexpected string` on page load, terminating the entire `<script>` execution.
- **Rule**: Avoid inline single-quote string concatenation in HTML string templates. Instead, use HTML5 data attributes:
  ```javascript
  // ✅ Correct & immune to template escaping issues
  '<button data-id="' + id + '" onclick="fn(this.dataset.id)">'
  ```

### 6. Temporal Dead Zone (TDZ) via Early-Executing Hoisted Calls
- **Symptom / Gotcha**: Function declarations are hoisted to the top of the scope, but `let` and `const` variables are not initialized until execution reaches their lexical declaration (Temporal Dead Zone - TDZ). If top-level script execution (e.g. early view switching based on URL parameters `?tab=approvals`) calls a hoisted function that references a `let` variable declared lower in the file, JavaScript throws `ReferenceError: Cannot access 'X' before initialization`. This uncaught top-level error aborts execution of the entire `<script>` tag, breaking all subsequent initialization (e.g. `initLiff()`).
- **Rule**: Declare all top-level state variables (`let`, `const`) at the very top of client-side scripts, strictly before any top-level executable logic or function invocations.

### 7. Form Submission UI State Locking (`try...finally` Button Protection)
- **Symptom / Gotcha**: Disabling a submit button (`btn.disabled = true; btn.innerText = "Submitting...";`) before or outside the `try` block leaves the button permanently frozen if an unexpected error occurs during pre-request validation, DOM query, or payload construction. The user remains stuck with a disabled button and no way to retry.
- **Rule**: Ensure any code path that disables a button or changes its state to "in progress" is unconditionally wrapped in a `try...finally` block where the `finally` clause guarantees the button is re-enabled and restored to its default label.

### 8. Newline Escaping inside Backend Template Literals (`Invalid or unexpected token`)
- **Symptom / Gotcha**: In server-rendered JavaScript string templates (e.g. `renderAdminScripts()` returning a backtick template literal `` `...` ``), writing `\n` inside a client-side string (e.g. `'Are you sure?\nThis cannot be undone.'`) is evaluated at compile-time as a literal line break in the emitted HTML. In the browser, raw unescaped line breaks inside single- or double-quoted JS strings cause an immediate `SyntaxError: Invalid or unexpected token` on script parse, crashing all client-side JavaScript execution (including login, event handlers, and page initialization).
- **Rule**: In SSR/backend template literals, never use bare `\n` inside client-side quoted string literals. Use quadruple backslashes (`\\\\n`) so TypeScript emits `\n` as an escape sequence in the output JS, or use string concatenation without embedded newlines. Always validate generated client scripts with `new Function(code)` in integration tests.

---

## Workflow & Best Practices

1. **Explicit Return Types & Interfaces**: Always define clear interfaces for API request payloads, responses, and environment variables (`Env`).
2. **Fail Fast on Edge Types**: Avoid `any` where possible; use `unknown` with runtime type narrowing or guards.
3. **Safe Async & Error Handling**: Avoid unhandled promise rejections. Always wrap async network/database I/O in `try...catch` blocks with typed/logged error details.
