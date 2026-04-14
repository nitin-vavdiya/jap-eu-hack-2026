---
title: "fix: Onboarding reliability — sequential steps, duplicate guard, env validation, structured logging"
type: fix
status: completed
date: 2026-04-14
deepened: 2026-04-14
---

# fix: Onboarding reliability — sequential steps, duplicate guard, env validation, structured logging

## Overview

Four issues found during company onboarding in the dataspace portal must be addressed:

1. **Sequential step enforcement broken** — when Keycloak user creation fails, steps 5/6/7 (OrgVC, Gaia-X, EDC) still run unconditionally instead of being skipped.
2. **No duplicate data guard** — the same company name or admin email can be registered multiple times with no rejection.
3. **Silent startup on missing critical env vars** — the backend starts and accepts requests even when `DATABASE_URL`, `KEYCLOAK_ADMIN_CLIENT_SECRET`, `APP_BASE_URL`, or other required variables are absent, producing confusing mid-request errors instead of a clear startup failure.
4. **No standardized logging** — 169 ad-hoc `console.log` calls with inconsistent formats make it impossible to correlate logs from a single API call, filter by severity, or change verbosity without a deployment.

A fifth issue — Gaia-X compliance failing because `APP_BASE_URL` points to an ephemeral ngrok URL — is an infrastructure/configuration problem, not a code bug. The code fix is to add `APP_BASE_URL` to the required env var list and document what "stable and publicly accessible" means. The DID document endpoint must be resolvable from `https://compliance.lab.gaia-x.eu`.

## Problem Frame

The dataspace portal onboarding wizard shows five sequential UI steps. The backend treats them as mostly independent — if step 4 (user creation) fails, steps 5–7 (credential issuance, Gaia-X, EDC) proceed, resulting in half-onboarded state. For a hackathon demo this creates confusing recoveries. Beyond onboarding, the backend has no structured log format, making it impossible to trace a single frontend API call end-to-end across the log stream, or to silence noisy debug lines in production without a redeploy.

## Requirements Trace

- R1. If Keycloak user creation fails (not just skipped), the POST /companies handler must skip OrgVC issuance, Gaia-X verification, and EDC provisioning, and return `userCreated: false` with `userError` in the response.
- R2. POST /companies must return HTTP 409 if a company with the same name already exists in the database.
- R3. POST /companies must return HTTP 409 if `adminUserEmail` already exists in the `CompanyUser` table.
- R4. Keycloak user creation must catch HTTP 409 and surface it as a friendly conflict error rather than an unhandled exception.
- R5. The backend must refuse to start (`process.exit(1)`) if any REQUIRED env var is absent, printing a clear list of what is missing.
- R6. RECOMMENDED env vars (e.g., `ENABLE_EDC_PROVISIONING`, `MAX_COMPANIES`) log a warning at startup but do not block startup.
- R7. `APP_BASE_URL` is a REQUIRED env var; startup validation must document that it must be a stable, publicly accessible URL reachable by external services (including `compliance.lab.gaia-x.eu`).
- R8. All backend log lines must follow a standard JSON format with at minimum: `timestamp`, `level`, `requestId`, `component`, `message`.
- R9. The frontend must send an `X-Request-ID` header on every API call; the backend must read it (or generate one) and attach it to all log lines for that request.
- R10. Log level must be changeable at runtime via `POST /admin/log-level` (protected, requires `admin` Keycloak role) without restarting the server.

## Scope Boundaries

- No changes to the 5-step frontend wizard UI — the frontend already handles `userFailed ? 'skipped'` display correctly.
- No DB schema migration for `Company.name` uniqueness — duplicate check is application-level; a database unique constraint is a future hardening step.
- No changes to EDC provisioning or Gaia-X compliance service logic — those are out of scope.
- Logging migration covers `backend/src/` only; `provisioning/` service is out of scope for this plan.
- The Gaia-X DID resolution failure is a runtime infrastructure problem (ephemeral ngrok URL); fixing it requires the operator to set a stable `APP_BASE_URL`. The plan adds a startup check and documentation, but cannot fix the URL itself.

## Context & Research

### Relevant Code and Patterns

- `backend/src/index.ts` — entry point; loads dotenv, runs migrations, starts Express on port 8000. No env validation today.
- `backend/src/routes/companies.ts:252–566` — POST /companies onboarding handler. Steps 5/6/7 at lines 377–553 run regardless of `userCreated` flag.
- `backend/src/services/keycloakAdmin.ts` — `createKeycloakUser()` calls Keycloak admin API; does not handle 409 conflict.
- `backend/src/middleware/auth.ts` — only middleware file today; `requireRole()` self-contains JWT verification.
- `packages/auth/src/authAxios.ts` — `createAuthAxios()` uses a request interceptor to add `Authorization: Bearer` header; easily extended to also send `X-Request-ID`.
- `backend/.env.example` — reference for all env vars. Must be updated with REQUIRED/RECOMMENDED tier documentation.
- `backend/prisma/schema.prisma` — `Company.name` has no `@unique` constraint; `CompanyUser` has no unique index on `email`.

### Institutional Learnings

- None found in `docs/solutions/` for this topic.

### External References

- `pino` (https://getpino.io) — JSON-first Node.js logger. Justification for adding: zero dependencies for basic JSON output, `child()` for request-scoped sub-loggers (requestId propagation), runtime level change via `logger.level = 'debug'`, 5–10× faster than winston. 169 existing console.log calls make a no-new-dependency approach impractical. `pino` is the correct choice over `winston` (heavier, more config) or `bunyan` (older, less maintained).

## Key Technical Decisions

- **pino over winston:** pino has zero config for JSON output, native child-logger support (critical for request-id propagation), and is the de-facto standard for Express/Fastify apps. `winston` is heavier with more ceremony. Given 169 console.log calls to migrate, pino's minimal API reduces migration effort.
- **App-level duplicate check, not DB constraint:** Adding `@unique` to `Company.name` requires a migration that must handle existing data. For an MVP/demo, an application-level `findFirst` before `create` is sufficient and avoids migration risk. A DB constraint is the recommended next step for production hardening.
- **requestId in logger child, not global:** Using `logger.child({ requestId })` per request (stored on `req.log`) is the pino-idiomatic pattern. It avoids async-context overhead (AsyncLocalStorage) while keeping request correlation in all logs that use `req.log`.
- **Runtime log level via in-process mutation:** `logger.level = newLevel` is synchronous and instant. No file reload, signal handler, or separate config system needed. This is safe for a single-process Express app.
- **`process.exit(1)` on missing REQUIRED vars:** Fail-fast at startup is better than mid-request errors. The validation runs after `dotenv` is loaded but before any async operation (migrations, HTTP listener).

## Open Questions

### Resolved During Planning

- **Should sequential enforcement be frontend-only or backend-only?** Backend — the frontend already handles display; the backend must not persist a half-onboarded company and then fire Gaia-X on it.
- **Where should requestId be generated?** Frontend generates it (uuid) and sends it as `X-Request-ID`; backend reads it and falls back to a generated uuid if absent. This supports both browser-initiated and server-to-server calls.
- **Should pino-http be used?** No — it adds an extra package for marginal benefit. A thin `requestId.ts` middleware that creates a child logger and attaches it to `req.log` is sufficient and more explicit.

### Deferred to Implementation

- Exact list of all console.log call sites to migrate — enumerable at implementation time by grepping `backend/src/`.
- Whether `CompanyUser.email` should get a DB-level unique constraint — deferred; app-level check satisfies R3 for now.
- Exact pino log level names to expose via the runtime API — standard pino levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Request-ID Propagation

```
Browser (CompanyRegistration.tsx)
  → api.post('/companies', body)          // createAuthAxios interceptor
      headers: { Authorization: Bearer, X-Request-ID: <uuid> }

Backend (Express)
  → requestId middleware                   // reads X-Request-ID or generates uuid
      req.requestId = id
      req.log = logger.child({ requestId: id })
      res.setHeader('X-Request-ID', id)
  → requireRole('company_admin')
  → POST /companies handler
      req.log.info({ component: 'onboarding' }, 'START ...')   // all logs carry requestId
      keycloakAdmin.createKeycloakUser(...)                     // uses req.log passed in
      ...
```

### Onboarding Sequential Step Enforcement

```
POST /companies
  ├─ Step 1-3: identifiers + DID + company record (always run)
  ├─ Step 4: Keycloak user creation
  │    ├─ success → userCreated = true
  │    └─ failure → userCreated = false, userError = message
  │
  ├─ [GATE] if (!userCreated) → skip to response with steps 5/6/7 omitted
  │
  ├─ Step 5: Issue OrgVC
  ├─ Step 6: Create OrgCredential + async Gaia-X
  ├─ Step 7: EDC provisioning record
  └─ Response: { company, credential?, orgCredential?, userCreated, userError? }
```

### Env Validation at Startup

```
backend/src/index.ts
  ├─ dotenv.config()
  ├─ validateEnv()                       // exits process if REQUIRED vars missing
  │    ├─ REQUIRED: DATABASE_URL, KEYCLOAK_URL, KEYCLOAK_REALM,
  │    │            KEYCLOAK_ADMIN_CLIENT_ID, KEYCLOAK_ADMIN_CLIENT_SECRET,
  │    │            APP_BASE_URL (must be stable public URL for DID resolution)
  │    └─ RECOMMENDED: ENABLE_EDC_PROVISIONING, MAX_COMPANIES, PROVISIONING_SERVICE_URL
  ├─ prisma.$connect() / migrations
  └─ app.listen(PORT)
```

## Implementation Units

- [ ] **Unit 1: Startup env var validation**

**Goal:** Refuse to start if REQUIRED env vars are missing; warn on missing RECOMMENDED vars; document `APP_BASE_URL` requirement for Gaia-X DID resolution.

**Requirements:** R5, R6, R7

**Dependencies:** None

**Files:**
- Create: `backend/src/utils/validateEnv.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/.env.example`
- Modify: `helm/eu-jap-hack/values-custom.yaml`
- Test: `backend/tests/utils/validateEnv.test.ts`

**Approach:**
- `validateEnv()` reads a static list of REQUIRED vars, collects all missing ones, logs them to stderr (var names only — never print values, as `DATABASE_URL` embeds a password and `KEYCLOAK_ADMIN_CLIENT_SECRET` is a secret), and calls `process.exit(1)` if any are absent. It does not throw — the exit is the failure signal.
- RECOMMENDED tier logs a `warn` line per missing var name and continues.
- `APP_BASE_URL` is REQUIRED in staging/production. In `NODE_ENV=development`, treat it as RECOMMENDED (warn but continue) — developers running locally without a tunnel cannot set a public URL. Document clearly that Gaia-X verification will fail if the URL is not publicly reachable. The `.env.example` already has `APP_BASE_URL=http://localhost:8000` as a default; keep that as a safe dev fallback.
- `APP_BASE_URL` entry in `.env.example` must include a comment: "Must be a stable, publicly accessible HTTPS URL in staging/production. Gaia-X compliance service (`compliance.lab.gaia-x.eu`) resolves the company DID document at `{APP_BASE_URL}/company/{id}/did.json`. An ephemeral URL (ngrok, localhost) will cause Gaia-X verification to fail."
- **Startup ordering:** `validateEnv()` must be called at the very top of `index.ts` body, immediately after `import 'dotenv/config'` and **before** the Prisma migration `execSync` block. The migration block itself requires `DATABASE_URL` — if it runs first and that var is absent, the process exits with a cryptic Prisma error instead of the clear validation message. Correct order: dotenv → validateEnv → migrations → route imports → listen.
- `DATABASE_URL` is currently absent from `.env.example` — add it with a commented example value.
- Update helm `values-custom.yaml` to ensure `APP_BASE_URL`, `LOG_LEVEL`, and `KEYCLOAK_ADMIN_CLIENT_SECRET` are in the env block.

**Patterns to follow:**
- `backend/src/middleware/auth.ts` for how env vars are currently read with defaults — validateEnv replaces ad-hoc defaults with explicit tiered validation.

**Test scenarios:**
- Happy path: all REQUIRED vars set → `validateEnv()` returns without calling `process.exit`
- Error path: one REQUIRED var missing → `process.exit(1)` called, message lists the missing var by name
- Error path: multiple REQUIRED vars missing → single call to `process.exit(1)`, all missing vars listed
- Edge case: RECOMMENDED var missing → no exit, warning logged
- Edge case: `APP_BASE_URL` missing → listed as missing REQUIRED var, exit

**Verification:**
- Starting the backend with an empty `.env` prints a clear list of missing vars and exits with code 1.
- Starting with all REQUIRED vars set but `MAX_COMPANIES` absent logs a warning and starts normally.

---

- [ ] **Unit 2: Structured logging with pino + request-id propagation**

**Goal:** Replace all 169 `console.log/warn/error` calls in `backend/src/` with a structured pino logger; add request-id middleware; propagate `X-Request-ID` from frontend to backend logs; expose a runtime log-level endpoint.

**Requirements:** R8, R9, R10

**Dependencies:** Unit 1 (logger initialization should occur after env validation confirms startup is valid)

**Files:**
- Modify: `backend/package.json` (add `pino` as dependency; add `pino-pretty` as devDependency — required for development pretty-print mode; pino does not bundle it)
- Create: `backend/src/lib/logger.ts`
- Create: `backend/src/middleware/requestId.ts`
- Modify: `backend/src/types/express.d.ts` (add `log: import('pino').Logger` and `requestId: string` to the `Express.Request` interface — required for TypeScript to accept `req.log` across all 20+ modified files under `strict: true`)
- Modify: `backend/src/index.ts` (wire requestId middleware; add `POST /admin/log-level` route)
- Modify: `packages/auth/src/authAxios.ts` (add `X-Request-ID` header in request interceptor)
- Modify: `backend/src/routes/companies.ts` (replace console calls; use `req.log`)
- Modify: `backend/src/routes/consent.ts`, `edc.ts`, `underwriting.ts`, `verifier.ts`, `wallet-vp.ts`, `vehicle-registry.ts`, and all other route/service files that use `console.*`
- Modify: `backend/src/services/keycloakAdmin.ts` (accept a `logger` parameter or use module-level logger)
- Modify: `backend/src/services/gaiax/` files (replace console calls)
- Test: `backend/tests/middleware/requestId.test.ts`

**Approach:**
- `backend/src/lib/logger.ts` creates and exports a singleton pino logger. Default level reads from `LOG_LEVEL` env var (default: `info`). Output is JSON in production (`NODE_ENV=production`), pretty-printed in development.
- `backend/src/middleware/requestId.ts`: reads `req.headers['x-request-id']`, **sanitizes it** (truncate to 128 chars, strip `\n`, `\r`, `"` characters to prevent log injection), falls back to `uuidv4()` if absent or invalid, sets `req.requestId`, creates `req.log = logger.child({ requestId })`, and echoes the value back as `X-Request-ID` response header.
- Register `requestId` middleware in `index.ts` before all route handlers.
- `POST /admin/log-level` body `{ level: string }` — protected by `requireRole('admin')` — calls `logger.level = level`. Returns the new level in the response.
- `packages/auth/src/authAxios.ts` interceptor: generate a `crypto.randomUUID()` (available in all modern browsers since 2022) per request and add it as `X-Request-ID` header alongside `Authorization`.
- For services (`keycloakAdmin.ts`, gaiax services) that are called from route handlers: pass `req.log` as a parameter so they log under the same `requestId`. This avoids async-context complexity.
- **Secret redaction (pre-work for this unit):** Before migrating `keycloakAdmin.ts`, remove the two unsafe log lines: (1) the curl-debug log that prints `client_secret=${ADMIN_SECRET}` verbatim — replace with `client_secret=[REDACTED]`; (2) the `JSON.stringify(userPayload)` line that includes the plaintext new-user password — replace with a redacted copy that omits the `credentials` field. Additionally configure pino's built-in `redact` option on the logger to cover `password`, `client_secret`, and `credentials` fields as a defence-in-depth measure.
- Standard log format per call site: `req.log.info({ component: 'onboarding', step: 4 }, 'Keycloak user created')` — message is static, variable data goes in the object.
- `LOG_LEVEL` env var added to `.env.example` and helm values (RECOMMENDED tier).

**Patterns to follow:**
- Existing `[module]` prefix convention maps to `component` field: `[onboarding]` → `{ component: 'onboarding' }`.
- Existing step marker pattern `Step 4/7 —` maps to `{ step: 4, totalSteps: 7 }` in the log object.

**Test scenarios:**
- Happy path: request with `X-Request-ID: abc123` header → all logs for that request include `requestId: 'abc123'`
- Edge case: request without `X-Request-ID` header → middleware generates a uuid and all logs still include it
- Happy path: `POST /admin/log-level { level: 'debug' }` by admin user → logger level changes, subsequent debug logs appear
- Error path: `POST /admin/log-level { level: 'debug' }` by non-admin user → 403 returned
- Error path: `POST /admin/log-level { level: 'nonsense' }` → 400 returned, level unchanged
- Integration: a log line from the route handler and a log line from `keycloakAdmin.ts` both carry the same `requestId` for the same HTTP request

**Verification:**
- `curl -X POST http://localhost:8000/companies -H 'X-Request-ID: test-123' ...` — all log lines in the terminal include `"requestId":"test-123"`.
- Log line format: `{ "time": ..., "level": "info", "requestId": "...", "component": "onboarding", "msg": "..." }`.
- Runtime level change: after `POST /admin/log-level { level: 'debug' }`, debug-level logs appear without restart.

---

- [ ] **Unit 3: Sequential onboarding step enforcement**

**Goal:** If Keycloak user creation fails (not just skipped), skip OrgVC issuance, Gaia-X verification, and EDC provisioning. Return early with `userCreated: false` and `userError`.

**Requirements:** R1

**Dependencies:** None (pure logic change in the handler)

**Files:**
- Modify: `backend/src/routes/companies.ts`
- Test: `backend/tests/routes/companies.test.ts`

**Approach:**
- After step 4 (Keycloak user creation), check `userCreated`. If `false` **and** `adminUserEmail` was provided (i.e., it was attempted and failed, not merely absent), skip steps 5/6/7 and jump to the response.
- The company record (step 3) is already persisted — it stays. This allows the operator to manually complete onboarding if needed.
- Gate condition: `if (userCreated || !adminUserEmail) { /* run steps 5/6/7 */ }` — this correctly preserves the existing behaviour where omitting credentials skips user creation but still proceeds with credential issuance and Gaia-X.
- The `edcEnabled` response field is set to `false` when steps are skipped.
- **Frontend null-guard required:** `CompanyRegistration.tsx` line 383 unconditionally accesses `orgCredential.id`. When Unit 3 skips step 6, `orgCredential` is absent from the response and this line throws a `TypeError`, swallowing the user-creation failure into a generic "Registration failed" error. The frontend must add a null guard: only call `startPolling` and access `orgCredential.id` when `orgCredential` is present. This is a required frontend change within Unit 3's scope despite the "no UI changes" constraint — it is a bug fix in error handling, not a UI flow change.
- Document the "skipped vs failed" distinction in a code comment at the gate.

**Patterns to follow:**
- `backend/src/routes/companies.ts` existing early-return patterns (e.g., `if (!name) return res.status(400)...`).

**Test scenarios:**
- Happy path: user creation succeeds → steps 5/6/7 proceed normally, response includes `credential` and `orgCredential`
- Error path: Keycloak user creation throws (e.g., 500 from Keycloak) → `userCreated: false`, steps 5/6/7 skipped, response omits `credential`/`orgCredential`, `userError` is set
- Edge case: `adminUserEmail` and `adminUserPassword` not provided → user creation skipped (not failed), steps 5/6/7 still proceed (existing behaviour preserved)
- Integration: when user creation fails, confirm `prisma.credential.create` is NOT called (no orphaned credential records)

**Verification:**
- POST /companies with a Keycloak URL that is unreachable (or returns 500) → response has `userCreated: false`, `userError` is non-empty, `credential` and `orgCredential` are absent from the response.
- POST /companies without `adminUserEmail` → response still includes `credential` and `orgCredential` (existing behavior).

---

- [ ] **Unit 4: Duplicate company name and user email guard**

**Goal:** Reject onboarding with HTTP 409 if a company with the same name or an admin user with the same email already exists.

**Requirements:** R2, R3, R4

**Dependencies:** Unit 3 (both modify `backend/src/routes/companies.ts`; apply after Unit 3 to avoid conflicts)

**Files:**
- Modify: `backend/src/routes/companies.ts`
- Modify: `backend/src/services/keycloakAdmin.ts` (handle 409 from Keycloak gracefully)
- Test: `backend/tests/routes/companies.test.ts`

**Approach:**
- **Both duplicate checks must be placed before step 1 (before identifier generation and before any DB write).** This is the only safe placement — if either check is placed after step 3 (company record creation), a 409 response would leave an orphaned company record.
- **Company name check:** `prisma.company.findFirst({ where: { name } })` → 409 `{ error: 'COMPANY_NAME_EXISTS', message: 'A company with this name is already registered' }`. Case-sensitive match for MVP; document as known limitation.
- **User email check:** Only run when `adminUserEmail` is a non-empty string (the `CompanyUser.email` field is nullable — a query with `undefined` could match unexpected rows). `prisma.companyUser.findFirst({ where: { email: adminUserEmail } })` → 409 `{ error: 'USER_EMAIL_EXISTS', message: 'A user with this email is already registered' }`.
- **Keycloak 409 handling:** In `keycloakAdmin.ts`, if `POST /admin/realms/{realm}/users` returns HTTP 409, throw a typed error (e.g., `new Error('USER_ALREADY_EXISTS_IN_KEYCLOAK')`) so the route handler can surface it as a 409 rather than a 500.
- **Remove stale default in `keycloakAdmin.ts`:** The `KEYCLOAK_REALM` constant currently defaults to `'master'` while `auth.ts` defaults to `'eu-jap-hack'`. Now that Unit 1 makes `KEYCLOAK_REALM` a REQUIRED env var, remove the `|| 'master'` fallback from `keycloakAdmin.ts` to eliminate the silent realm mismatch trap in environments that skip env validation (e.g., tests).

**Patterns to follow:**
- `backend/src/routes/companies.ts` early-return validation pattern at the top of the POST handler.
- `backend/src/services/keycloakAdmin.ts` error handling pattern for Keycloak API calls.

**Test scenarios:**
- Happy path: no existing company with same name, no existing user with same email → onboarding proceeds normally
- Error path: company with same name exists → 409 returned, no new DB records created
- Error path: user with same email exists in `CompanyUser` table → 409 returned, no new DB records created
- Error path: Keycloak returns 409 on user creation → surfaced as 409 to caller with clear message (not a 500)
- Edge case: company name check is case-insensitive vs. case-sensitive → document the decision (case-sensitive for MVP; note for future enhancement)
- Integration: two concurrent requests with the same company name — application-level check has a TOCTOU window; document this as a known limitation for the MVP
- Security note: the `409` response with `USER_EMAIL_EXISTS` reveals whether an email is registered. For MVP with a closed set of participants this is acceptable. Document the decision: production should use a generic 409 or restrict the endpoint to platform-operator role only.

**Verification:**
- POST /companies twice with the same `legalName` → second call returns 409 with `COMPANY_NAME_EXISTS`.
- POST /companies twice with the same `adminUserEmail` → second call returns 409 with `USER_EMAIL_EXISTS`.
- First call with a new name/email succeeds normally after prior failures.

## System-Wide Impact

- **Interaction graph:** `requestId` middleware must be registered before all route handlers in `index.ts`. The `POST /admin/log-level` endpoint must be registered as a named route, not under a sub-router that already has role restrictions.
- **Error propagation:** Duplicate-check 409 errors return before any DB write — no cleanup required. If the check is accidentally placed after step 3, a company record would be orphaned; the implementation must place checks before step 1.
- **State lifecycle risks:** The onboarding handler persists a company record (step 3) before the user creation guard (step 4). Skipping steps 5/6/7 on user creation failure leaves a valid company record with no linked user. This is intentional (operator can manually link later) but must be logged clearly.
- **API surface parity:** The `POST /companies` response shape is unchanged — `{ company, credential?, orgCredential?, edcEnabled, userCreated, userError? }`. The `credential` and `orgCredential` fields become optional (absent when steps are skipped). The frontend already handles absent fields (reads `r.data.orgCredential.id` — verify this won't throw on undefined when user creation fails).
- **Integration coverage:** Unit tests alone won't prove request-id propagation end-to-end. Integration test: send a request with `X-Request-ID: test-trace-1`, check that the response header `X-Request-ID: test-trace-1` is echoed back, and that all log lines captured during that request carry `requestId: 'test-trace-1'`.
- **Unchanged invariants:** The 5-step UI wizard, the Gaia-X orchestration logic, the EDC provisioning callback, and the wallet-vp/verifier flows are not changed by this plan.
- **Keycloak realm mismatch (risk):** Research found `keycloakAdmin.ts` defaults to `KEYCLOAK_REALM=master` while `middleware/auth.ts` defaults to `eu-jap-hack`. Both must be configured via the same `KEYCLOAK_REALM` env var. Unit 1's env validation will surface this misconfiguration at startup. Implementer should verify both files read the same env var.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `prisma.companyUser.findFirst` email check has a race condition (two concurrent identical requests both pass the check before either writes) | Acceptable for MVP/demo load; document as known limitation. DB unique constraint on `CompanyUser.email` is the production fix. |
| Migrating 169 `console.log` calls in Unit 2 is large and may introduce regressions | Migrate module by module, starting with `routes/companies.ts` (highest-value), then other routes, then services. Keep the logger interface identical to `console.*` at each call site before switching to structured fields. |
| `crypto.randomUUID()` is not available in very old browsers | Acceptable for a hackathon demo targeting modern browsers. Polyfill with a simple `Math.random()`-based fallback in `authAxios.ts` if needed. |
| `APP_BASE_URL` being a required env var may block local development without a tunnel | Add a dev-mode override: if `NODE_ENV=development` and `APP_BASE_URL` is absent, log a warning (not exit). Document that Gaia-X verification will fail without a public URL. |
| `POST /admin/log-level` exposes runtime server control | Protected by `requireRole('admin')` — only the platform operator can call it. **However, `requireRole` bypasses auth entirely when `AUTH_ENABLED=false` (the current default).** The endpoint is effectively open in any environment where auth is not explicitly enabled. `AUTH_ENABLED=true` is a prerequisite for this endpoint to be considered protected. Log all level-change calls with who changed it and what level was set. Consider adding a note in the response when auth is disabled warning that the endpoint is unprotected. |

## Documentation / Operational Notes

- Add `LOG_LEVEL` to `backend/.env.example` (RECOMMENDED, default `info`).
- Add `APP_BASE_URL` to `backend/.env.example` with a comment explaining the Gaia-X DID resolution requirement.
- Update helm `values-custom.yaml` to include `APP_BASE_URL`, `LOG_LEVEL`, and `KEYCLOAK_ADMIN_CLIENT_SECRET` in the env block.
- Update `README.md` or `CLAUDE.md` to document the `POST /admin/log-level` endpoint.
- The Gaia-X DID resolution failure documented in the logs (`Unable to retrieve your did`) is an infrastructure issue: the `APP_BASE_URL` must be a stable, publicly accessible HTTPS URL, not an ephemeral ngrok tunnel. Operators must set up a stable reverse proxy or use a DNS-backed URL.

## Sources & References

- Related plan: [docs/plans/2026-04-13-001-feat-unified-participant-model-auth-hardening-plan.md](2026-04-13-001-feat-unified-participant-model-auth-hardening-plan.md)
- `backend/src/routes/companies.ts` — onboarding handler
- `backend/src/services/keycloakAdmin.ts` — Keycloak user creation
- `packages/auth/src/authAxios.ts` — axios interceptor
- `backend/src/middleware/auth.ts` — existing middleware pattern
- pino docs: https://getpino.io
