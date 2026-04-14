---
title: "feat: Unified Participant Model & Auth Hardening"
type: feat
status: completed
date: 2026-04-13
origin: docs/brainstorms/unified-participant-model-and-auth-hardening-requirements.md
deepened: 2026-04-13
---

# feat: Unified Participant Model & Auth Hardening

## Overview

This plan closes four interrelated gaps in the dataspace platform:

1. **Manufacturer bias** — The Prisma schema, backend routes, and frontend UI encode "manufacturers" as a special company type. Renamed fields (`manufacturerCompanyId` → `companyId`) and labels make all companies equal dataspace participants.
2. **Broken user creation** — Keycloak user onboarding assigns the wrong role (`admin` instead of `company_admin`) and sets a permanent password. Both are fixed; a new DB `Role` model links each `CompanyUser` to a company-scoped role.
3. **Unprotected backend routes** — Fourteen sensitive endpoints (company deletion, consent, EDC transactions, wallet-VP, underwriting, verifier sessions, vehicle audit) have no auth middleware. All are protected in this plan.
4. **Frontend auth gaps** — Four of six portals call protected endpoints without Bearer tokens. All are migrated to `createAuthAxios`.

## Problem Frame

See origin document for full context (see origin: `docs/brainstorms/unified-participant-model-and-auth-hardening-requirements.md`). The ADR is at `docs/adr/001-unified-participant-model-and-auth-hardening.md`.

## Requirements Trace

- R0a–R0d. All companies are equal dataspace participants — no type field, no role differentiation by business type.
- R1–R4. `Role` master table + `roleId` FK on `CompanyUser`. DB role controls company-scoped permissions; Keycloak role controls platform-level access.
- R5–R8. Keycloak user creation: temporary password, `company_admin` realm role, `CompanyUser.roleId` set.
- R9–R10. Critical backend protection: `DELETE /companies/:id`, `PATCH /companies/:id/edc-provisioning`.
- R11–R15. High-priority backend protection: consent, EDC transactions, wallet-VP, underwriting, verifier sessions.
- R16–R18. Medium-priority backend protection: vehicle-registry audit-log and access-sessions, `GET /companies/:id/edc-status`.
- R19–R20. Frontend auth standardization: all protected portals use `createAuthAxios`.
- R21–R25. Car model: `manufacturerCompanyId` → `companyId`, `manufacturerCredentialId` → `credentialId`, relation `manufacturerCompany` → `company`. Fresh migration (no production DB).
- R26–R30. Remove static seed data files and Keycloak test users; minimal seed (role only).
- R31–R32. Remove unused `organizationDid` form field; rename manufacturer* variable names and UI labels.

## Scope Boundaries

- **Out of scope**: Company admin inviting additional users.
- **Out of scope**: Company type differentation — all participants are equal.
- **Out of scope**: Self-registration for public users or customers.
- **Out of scope**: Changes to Gaia-X credential issuance or EDC provisioning flows.
- **Out of scope**: Rate limiting on public endpoints.
- **Intentionally public (no auth added)**: `GET /cars`, DID resolution (`/company/:id/did.json`), vehicle registry well-known, org-credential status/proof endpoints.

## Context & Research

### Relevant Code and Patterns

**Auth middleware** (`backend/src/middleware/auth.ts`):
- `authenticate(req, res, next)` — validates Bearer JWT; mock user when `AUTH_ENABLED !== 'true'`
- `requireRole(role: string)` — validates JWT AND checks `realm_access.roles`
- Pattern: `router.delete('/:id', authenticate, requireRole('company_admin'), handler)`

**Keycloak user creation** (`backend/src/services/keycloakAdmin.ts`):
- Line 33: `temporary: false` → must become `temporary: true`
- Line 55: `roles/admin` → must become `roles/company_admin`
- Returns Keycloak UUID extracted from `Location` header

**CompanyUser creation** (`backend/src/routes/companies.ts`, line 329):
- Currently: `prisma.companyUser.create({ data: { keycloakId, email, companyId } })`
- Must add: look up seeded `company_admin` Role record and pass `roleId`

**createAuthAxios** (`packages/auth/src/authAxios.ts`):
- Factory returns Axios instance with `Authorization: Bearer <token>` on every request
- Used as: `const api = createAuthAxios(getToken); api.get('/api/...')`

**Mock users in auth.ts** (lines 22–28):
- Reference `toyota-admin`, `mario-sanchez`, `tokiomarine-agent` — must be updated to generic names when test users are removed

### Manufacturer blast radius (all files that reference old field names)

**Backend:**
- `backend/src/routes/companies.ts` — line 210: `where: { manufacturerCompanyId: id }`, `data: { manufacturerCompanyId: null }`
- `backend/src/routes/cars.ts` — lines 22–25, 81–84, 120: `car.manufacturerCompanyId`, `dpp.manufacturerCredential`
- `backend/src/routes/vehicle-registry.ts` — ~15 references: `manufacturerCompanyId`, `manufacturerCompany`, `manufacturerCredentialId`, local var `manufacturerCred`
- `backend/src/routes/purchases.ts` — lines 21, 33–35: `include: { manufacturerCompany: true }`, local vars `mfgCompany`, `mfgOrgCred`
- `backend/src/seed-data.ts` — (static data module, scheduled for deletion in Unit 8)
- `backend/data/db.json` — (static fallback data, scheduled for deletion in Unit 8)

**Shared types:**
- `packages/shared-types/src/index.ts` — line 349: `manufacturerCredential: ManufacturerCredential` in DPP type

**Frontend:**
- `apps/portal-tata-admin/src/pages/CreateCar.tsx` — `manufacturerCompanyId` state, "Manufacturer Company" dropdown
- `apps/portal-tata-admin/src/pages/CarDPP.tsx` — section titled "Manufacturer Credential"
- `apps/portal-tata-public/src/pages/CarDetail.tsx` — `{ title: 'Manufacturer Credential', key: 'manufacturerCredential' }`
- `apps/portal-wallet/src/pages/DPPViewer.tsx` — section key `'manufacturerCredential'`

**Note on `dpp.manufacturerCredential` JSON key**: This is a semantic field name _inside_ the DPP JSON blob (stored in `cars.dpp` column), read by the underwriting transformer at `backend/src/services/underwriting/dpp-to-jaspar-transformer.ts` line 193. The DPP JSON key rename (`manufacturerCredential` → `credential`) is **in scope** for this plan as part of terminology cleanup; the transformer and shared types must both be updated consistently. (Note: the DB column rename is `manufacturerCredentialId` → `credentialId`; the JSON blob key is separately renamed from `manufacturerCredential` → `credential`.)

### Institutional Learnings

- `docs/adr/001-unified-participant-model-and-auth-hardening.md` — architectural decision record covering all 8 decisions in this plan
- `AUTH_ENABLED` must be `true` in non-dev environments or all backend auth is bypassed silently
- Global axios interceptor approach was rejected — `createAuthAxios` per component is the correct pattern (see ADR alternative E)
- `portal-tata-public` uses intentionally public endpoints — plain axios is acceptable there
- Platform operator bootstrap account (`company-admin` / `company` in `keycloak/realm-export.json`) is permanent by design for MVP

## Key Technical Decisions

- **All companies are equal**: No `companyType` field, no role differentiation by business type. Every onboarded participant gets `company_admin` in both Keycloak (JWT) and DB (`CompanyUser.roleId`). (see origin: `docs/brainstorms/...`, Key Decisions)
- **Split role architecture**: Keycloak realm roles = platform-level access (which portal); DB `Role` table = company-scoped permissions (what actions within a company). Both are checked.
- **Provisioning callback auth**: Shared API key (`PROVISIONING_CALLBACK_SECRET` env var). The provisioning service sends `X-Internal-Token: <secret>` header; the backend validates it inline in the handler. This is MVP-appropriate and avoids a Keycloak dependency for the internal callback. (resolved from: deferred R10 in origin doc)
- **Temporary password**: Keycloak's `temporary: true` credential flag triggers the "Update Password" required action on first login natively — no custom code needed.
- **Fresh migration**: No production DB, so `prisma migrate dev` + reset is used instead of an incremental rename migration. All Car field renames, Role table, and CompanyUser FK are done in a single migration.
- **CompanyUser roleId on create**: The onboarding handler must look up the seeded `company_admin` Role record from DB and pass its `id` as `roleId` when creating `CompanyUser`. (resolved from: deferred R8 in origin doc)
- **`organizationDid` field removal**: Confirmed only referenced in `CompanyRegistration.tsx` — safe to remove `did` from `FormData`, initial state, and the Step 5 form. Backend already ignores the `inputDid` value.
- **Mock users**: The mock users in `auth.ts` reference removed test users. Update to generic names (`platform-admin`, `demo-customer`, `demo-agent`) so `AUTH_ENABLED=false` dev mode still works.
- **DPP JSON key**: The semantic field `manufacturerCredential` inside the DPP JSON blob is renamed to `credential` to match the generalized terminology. The underwriting transformer and shared types are updated consistently.
- **User identity field for ownership checks**: Wallets and wallet-VP records are keyed by `preferred_username`, not the Keycloak UUID (`sub`). The `useAuthUser()` hook in the shared auth package returns `userId: profile?.preferred_username`. All ownership/user-matching checks must compare `req.user?.preferred_username` against `:userId` path parameters — not `req.user?.sub`. Using `sub` (a UUID) against a `preferred_username` value would produce a permanent 403 for every real user.
- **`realm_admin_client` must be in realm export**: The backend's Keycloak admin client (`KEYCLOAK_ADMIN_CLIENT_ID`, defaulting to `realm_admin_client`) is not defined in `keycloak/realm-export.json`. If the realm is re-imported as part of the deployment (e.g., after DB reset), the admin client disappears and all company onboarding fails. Unit 3 must add the admin client definition to the realm export so re-import is safe.
- **`AUTH_ENABLED` in Helm values**: `helm/eu-jap-hack/values-custom.yaml` currently sets `AUTH_ENABLED: "false"`. Unit 5's deployment must include updating this to `AUTH_ENABLED: "true"` as an atomic change with the middleware additions. Without this, all newly added `authenticate` middleware is bypassed in production.
- **Provisioning service as hard prerequisite for Unit 4**: The provisioning service's `notifyBackend` call silently drops terminal status (`ready`, `failed`) after exhausting retries. If the backend's `PROVISIONING_CALLBACK_SECRET` check is deployed before the provisioning service sends the `X-Internal-Token` header, every in-flight EDC provisioning job will silently fail — the derived EDC config (managementUrl, dataplaneUrl, etc.) will never be written to the DB. Unit 4 must have the provisioning service update as a hard deployment prerequisite, not a concurrent one.

## Open Questions

### Resolved During Planning

- **How to protect provisioning callback (R10)?** — Shared API key (`X-Internal-Token` header). Add `PROVISIONING_CALLBACK_SECRET` to `backend/.env.example` and Helm `values.yaml`. The provisioning service must be updated to send this header.
- **Does CompanyUser creation correctly store roleId (R8)?** — No, line 329 of `companies.ts` omits `roleId`. Plan includes updating the onboarding handler to look up the `company_admin` Role and pass `roleId`.
- **Is `organizationDid` referenced elsewhere in the frontend (R31)?** — No, only in `CompanyRegistration.tsx`. Safe to remove.
- **What happens to mock users in auth.ts after test users are removed (R30)?** — Update mock user names to generic identifiers; keep the role-based mock structure so `AUTH_ENABLED=false` development still works.

### Deferred to Implementation

- **DPP JSON key migration**: Existing car records in the database may have `manufacturerCredential` in the `dpp` JSONB column. Since the DB is reset during the fresh migration (R25), no backfill is needed — new cars created through the application flow will use the updated key.
- **`PROVISIONING_CALLBACK_SECRET` value coordination**: The actual secret value must be communicated to the provisioning service operator. Implementation should document this in the provisioning service README.
- **`insurance_agent` role existence in live Keycloak instance**: `keycloak/realm-export.json` confirms `insurance_agent` role is defined in the file. However, if the live Keycloak instance was imported from an older realm-export version, the role may be absent. Verify via the Keycloak admin UI or API against the running instance before deploying Unit 5 — not just against the file.
- **`wallet.ts` IDOR (out of scope for this plan)**: `GET /wallet/:userId` and `POST /wallet/:userId/credentials` in `backend/src/routes/wallet.ts` have `authenticate` middleware but no ownership check — any authenticated user can read any other user's wallet. Adding `preferred_username` ownership enforcement there is out of scope for this plan but should be tracked as a follow-on security fix.
- **`keycloakAdmin.ts` logs `ADMIN_SECRET` in plaintext** (out of scope): Line 30 interpolates `${ADMIN_SECRET}` into a console.log cURL string — the Keycloak admin client secret is captured in logs on every company onboarding. This is a credential leak in any log-aggregating environment. Track as a separate security fix; do not block this plan on it.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Provisioning Callback Auth Flow

```
Provisioning Service → PATCH /companies/:id/edc-provisioning
                       Header: X-Internal-Token: <shared_secret>
                       ↓
                  backend/src/routes/companies.ts
                       validateProvisioningToken(req, res, next)
                       ↓
                  if header missing or mismatch → 401
                  else → proceed to update handler
```

### Onboarding → CompanyUser Role Linkage

```
POST /companies (requireRole company_admin)
  → createKeycloakUser(email, password, name) [temporary:true, company_admin role]
    → returns keycloakUuid
  → prisma.role.findUnique({ where: { name: 'company_admin' } })
    → returns { id: roleId }
  → prisma.companyUser.create({ keycloakId, email, companyId, roleId })
```

### Auth Middleware Stack for Protected Routes

```
Route groups by middleware pattern:
  authenticate only          → consent GET, edc-tx GET, wallet-vp, verifier session,
                               vehicle-registry audit, edc-status, vehicle access-sessions
  authenticate + requireRole → DELETE /companies/:id (company_admin)
                               POST /underwriting (insurance_agent)
  validateProvisioningToken  → PATCH /companies/:id/edc-provisioning
```

## Implementation Units

- [x] **Unit 1: Prisma Schema — Role table, CompanyUser roleId, Car field renames, fresh migration**

**Goal:** Establish the generalized DB schema: add `Role` model, `roleId` FK on `CompanyUser`, rename Car manufacturer fields to generic names. Apply as a single fresh migration with DB reset.

**Requirements:** R0a, R0b, R1, R2, R3, R4, R21, R22, R23, R24, R25

**Dependencies:** None — this is the foundational unit that creates TypeScript errors in dependent files.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_unified_participant_model/migration.sql`
- Modify: `backend/prisma/seed.ts` (replace with minimal role-only seed)

**Approach:**
- Add `Role` model: `id` (uuid, default uuid()), `name` (String, @unique), `description` (String?), `createdAt`, `updatedAt`, `@@map("roles")`
- Add `roleId String?` FK on `CompanyUser` with `@relation(fields: [roleId], references: [id])` and `role Role? @relation(...)`; add back-relation `users CompanyUser[]` on `Role`. `@@map("company_users")`
- Rename on `Car` model: `manufacturerCompanyId` → `companyId`, `manufacturerCredentialId` → `credentialId`, relation `manufacturerCompany` → `company`; update `Company` back-relation from `carsManufactured` to `cars`
- Run `npx prisma migrate dev --name "unified_participant_model"` with `--force-reset` to apply clean migration
- Run `npx prisma generate` to regenerate client
- Seed: Replace `seed.ts` with a single `prisma.role.upsert({ where: { name: 'company_admin' }, ... })`. Remove all Toyota/Tokio Marine hard-coded company and car seeds.
- The migration will cause TypeScript compilation errors in route files referencing old field names — this is expected and resolved in Unit 2.

**Patterns to follow:**
- Existing model conventions in `backend/prisma/schema.prisma` (snake_case `@@map`, uuid defaults, `@db.Uuid` annotations)
- Existing seed idempotency: use `upsert` not `create`

**Test scenarios:**
- Happy path: `npx prisma migrate dev` succeeds; `npx prisma db seed` creates exactly one `Role` record with `name: 'company_admin'` and no companies, cars, or users
- Edge case: Running `npx prisma db seed` twice produces the same single Role record (idempotent via upsert)
- Happy path: Prisma client exposes `prisma.role` and `prisma.companyUser` with `roleId` field after `prisma generate`
- Happy path: `prisma.car.findMany({ include: { company: true } })` works; `prisma.car.findMany({ include: { manufacturerCompany: true } })` fails at TypeScript compile time

**Verification:**
- Schema compiles without errors via `npx prisma validate`
- `npx prisma db seed` exits 0 and produces exactly one row in `roles` table with `name = 'company_admin'`
- TypeScript build (`tsc --noEmit`) reports errors only in the files that reference renamed fields (expected — resolved in Unit 2)

---

- [x] **Unit 2: Backend — Terminology cleanup (manufacturer* → company* in routes, services, shared-types)**

**Goal:** Update all backend route files, services, and shared-types that reference the old manufacturer field names to use the new Prisma client field names. Eliminates TypeScript errors introduced by Unit 1.

**Requirements:** R0d, R24, R32

**Dependencies:** Unit 1 (schema field renames create the TypeScript errors this unit resolves)

**Files:**
- Modify: `backend/src/routes/companies.ts` (lines 209–211: `manufacturerCompanyId` → `companyId`)
- Modify: `backend/src/routes/cars.ts` (lines 22–25, 81–84, 120: `manufacturerCompanyId` → `companyId`, `manufacturerCredentialId` → `credentialId`)
- Modify: `backend/src/routes/vehicle-registry.ts` (~15 references: `manufacturerCompanyId` → `companyId`, `manufacturerCompany` → `company`, `manufacturerCredentialId` → `credentialId`, local var `manufacturerCred` → `cred`)
- Modify: `backend/src/routes/purchases.ts` (lines 21, 33–35: `manufacturerCompany` → `company`, `mfgCompany` → `company`, `mfgOrgCred` → `orgCred`)
- Modify: `backend/src/services/underwriting/dpp-to-jaspar-transformer.ts` (lines 193, 307, 314–315, 392–393: `dpp.manufacturerCredential` → `dpp.credential`)
- Modify: `packages/shared-types/src/index.ts` (line 349: `manufacturerCredential` → `credential` in DPP type; rename `ManufacturerCredential` type if used)

**Approach:**
- For each file, replace Prisma relation references (`include: { manufacturerCompany: true }` → `include: { company: true }`) and field accesses (`car.manufacturerCompanyId` → `car.companyId`)
- Rename local variables where they used manufacturer-specific names (`mfgCompany` → `company`, `manufacturerCred` → `cred`) for readability
- For `vehicle-registry.ts`, which has the heaviest usage (~15 references), do a systematic search-and-replace; verify no old names remain via `grep`
- For the DPP JSON key in `dpp-to-jaspar-transformer.ts`: change `dpp.manufacturerCredential` → `dpp.credential`; since the DB is reset (R25), existing DPP JSON in the database will not need backfill
- In `shared-types/src/index.ts`: rename the type and field name; check if `ManufacturerCredential` is the interface name and rename to `CredentialInfo` or `DPPCredential` — keep the shape the same, only rename

**Patterns to follow:**
- Existing route patterns in `vehicle-registry.ts` and `purchases.ts`

**Test scenarios:**
- Happy path: `tsc --noEmit` in `backend/` passes with zero errors after this unit
- Happy path: `tsc --noEmit` in `packages/shared-types/` passes
- Edge case: `grep -r "manufacturerCompanyId\|manufacturerCredentialId\|manufacturerCompany\|manufacturerCred\|mfgCompany\|mfgOrgCred" backend/src/routes/ backend/src/services/` returns no matches
- Edge case: `grep -r "manufacturerCredential" packages/shared-types/src/` returns no matches

**Verification:**
- Zero TypeScript errors in backend and shared-types packages
- No grep hits for old manufacturer field names in backend routes, services, or shared-types

---

- [x] **Unit 3: Backend — Keycloak user creation fix + CompanyUser roleId linkage**

**Goal:** Fix the two Keycloak bugs (wrong role, permanent password) and link the new `CompanyUser` record to the seeded `company_admin` DB role via `roleId`.

**Requirements:** R5, R6, R7, R8, R0c

**Dependencies:** Unit 1 (`Role` model and `roleId` FK must exist before this unit runs)

**Files:**
- Modify: `backend/src/services/keycloakAdmin.ts` (line 33: `temporary: false` → `true`; line 55: `roles/admin` → `roles/company_admin`; update log message line 68)
- Modify: `backend/src/routes/companies.ts` (Step 4 / line 329: look up `company_admin` Role and pass `roleId` on `companyUser.create`)
- Modify: `backend/src/middleware/auth.ts` (lines 22–28: update mock user names from `toyota-admin`/`mario-sanchez`/`tokiomarine-agent` to generic `platform-admin`/`demo-customer`/`demo-agent`)
- Modify: `keycloak/realm-export.json` — add `realm_admin_client` service account client definition (with `serviceAccountsEnabled: true`, `clientAuthenticatorType: client-secret`, and `manage-users` + `view-users` service account roles from `realm-management` client). This ensures re-importing the realm does not destroy the admin client the backend uses for Keycloak user creation.

**Approach:**
- In `keycloakAdmin.ts`: change the credentials array to `[{ type: 'password', value: password, temporary: true }]`; change the role fetch URL from `roles/admin` to `roles/company_admin`; update the log statement on line 68 from `"admin"` to `"company_admin"`
- In `companies.ts` onboarding handler (Step 4, around line 326–335):
  - Before creating `CompanyUser`, call `prisma.role.findUnique({ where: { name: 'company_admin' } })`
  - If role is not found, log a warning but do not fail the onboarding — treat `roleId` as null (defensive)
  - Pass `roleId: role?.id` in the `prisma.companyUser.create` data
- In `auth.ts`: rename mock users to generic identifiers so dev mode still works after test user removal

**Patterns to follow:**
- Existing Keycloak admin pattern in `keycloakAdmin.ts` (axios calls with admin token)
- Existing error handling in Step 4 of the onboarding handler

**Test scenarios:**
- Happy path: After onboarding a company with `adminUserEmail` and `adminUserPassword`, the created `CompanyUser` record has `roleId` pointing to the `company_admin` Role in the `roles` table
- Happy path: Keycloak user is created with `temporary: true`; Keycloak admin panel shows "Update Password" as a required action for the new user
- Happy path: Keycloak user has `company_admin` realm role (verify via Keycloak admin API: `GET /admin/realms/{realm}/users/{uuid}/role-mappings/realm`)
- Edge case: If `adminUserEmail` is not provided, `CompanyUser` creation is skipped (existing behavior); `roleId` not needed
- Error path: If `prisma.role.findUnique` for `company_admin` returns null (misconfigured seed), log a warning; `CompanyUser` is created with `roleId: null`; onboarding continues

**Verification:**
- POST `/companies` (with adminUserEmail/adminUserPassword) creates a `company_users` DB row with non-null `roleId`
- The referenced `roles` row has `name = 'company_admin'`
- Keycloak user inspection confirms `temporary: true` flag set on credentials (user must change password on first login)
- Keycloak user inspection confirms `company_admin` realm role assignment

---

- [x] **Unit 4: Backend — Provisioning callback security (shared API key)**

**Goal:** Protect the `PATCH /companies/:id/edc-provisioning` internal callback so only the provisioning microservice can call it.

**Requirements:** R10

**Dependencies:** None (independent of schema changes)

**Files:**
- Modify: `backend/src/routes/companies.ts` (add inline token validation to the `PATCH /:id/edc-provisioning` handler)
- Modify: `backend/.env.example` (add `PROVISIONING_CALLBACK_SECRET=`)
- Modify: helm chart `values.yaml` (add `PROVISIONING_CALLBACK_SECRET` env var entry)
- Modify: `README.md` (document the new env var)
- Note: The provisioning service (`provisioning/`) must be updated separately to send `X-Internal-Token` header — document this dependency in implementation notes

**Approach:**
- Add a middleware function `validateProvisioningToken(req, res, next)` directly in `companies.ts` (not a shared middleware — this is the only endpoint that needs it):
  - Read `process.env.PROVISIONING_CALLBACK_SECRET` and `process.env.NODE_ENV`
  - If `NODE_ENV === 'development'` and secret is not set: log a warning and allow through (dev-only bypass)
  - If `NODE_ENV !== 'development'` (staging/production) and secret is not set: return 503 with a clear error message indicating the service is misconfigured. This is fail-closed behavior — a misconfigured non-dev environment must not silently allow unauthenticated provisioning callbacks.
  - If secret is set: check `req.headers['x-internal-token'] === PROVISIONING_CALLBACK_SECRET`; return 401 if mismatch
- Apply `validateProvisioningToken` as the first middleware on the `PATCH /:id/edc-provisioning` route
- Add `PROVISIONING_CALLBACK_SECRET` to `.env.example` with a comment explaining it is used for internal service-to-service auth on the EDC provisioning callback; add `NODE_ENV=development` to `.env.example` so the dev bypass is explicit

**Patterns to follow:**
- Inline middleware pattern used elsewhere in routes (e.g., `requireRole` applied per-route)
- `AUTH_ENABLED` flag pattern for dev-mode bypass: if secret not configured, allow through with a warning

**Test scenarios:**
- Happy path: `PATCH /companies/:id/edc-provisioning` with correct `X-Internal-Token` header returns 200
- Error path: Request without `X-Internal-Token` header when `PROVISIONING_CALLBACK_SECRET` is set returns 401
- Error path: Request with wrong token value returns 401
- Edge case: `PROVISIONING_CALLBACK_SECRET` not set in env → request proceeds (dev-friendly fallback, warning logged)

**Verification:**
- `PROVISIONING_CALLBACK_SECRET=secret123 curl -X PATCH /companies/{id}/edc-provisioning -H "X-Internal-Token: wrong" → 401`
- `PROVISIONING_CALLBACK_SECRET=secret123 curl -X PATCH /companies/{id}/edc-provisioning -H "X-Internal-Token: secret123" -d '{...}' → 200`

---

- [x] **Unit 5: Backend — All missing authenticate/requireRole middleware (R9–R18)**

**Goal:** Add authentication middleware to all remaining sensitive endpoints that currently have no protection.

**Requirements:** R9, R11, R12, R13, R14, R15, R16, R17, R18

**Dependencies:** None (middleware already exists; no schema changes needed)

**Files:**
- Modify: `backend/src/routes/companies.ts` — add `authenticate` + `requireRole('company_admin')` to `DELETE /:id`; add `authenticate` to `GET /:id/edc-status`
- Modify: `backend/src/routes/consent.ts` — add `authenticate` to `GET /pending/:userId`, `GET /history/:userId`, `GET /:id`
- Modify: `backend/src/routes/edc.ts` — add `authenticate` to `GET /transactions`, `GET /transactions/:id`
- Modify: `backend/src/routes/wallet-vp.ts` — add `authenticate` to `GET /credentials/:userId/ownership`, `POST /generate-vp`, `POST /submit-vp`
- Modify: `backend/src/routes/underwriting.ts` — add `authenticate` + `requireRole('insurance_agent')` to `POST /transform-and-score`, `POST /confirm`, `GET /:vin`
- Modify: `backend/src/routes/verifier.ts` — add `authenticate` to `GET /session/:id`, `GET /session-by-request/:requestId`
- Modify: `backend/src/routes/vehicle-registry.ts` — add `authenticate` to `GET /vehicles/:vin/audit-log`, `GET /vehicles/:vin/access-sessions`
- Modify: `helm/eu-jap-hack/values-custom.yaml` — update `AUTH_ENABLED: "false"` to `AUTH_ENABLED: "true"`. **This must be deployed atomically with the middleware changes** — the added `authenticate` calls are no-ops while `AUTH_ENABLED=false`.

**Approach:**
- Import `authenticate` and `requireRole` at the top of each route file (some already import `requireRole`)
- Apply middleware using Express route-level composition: `router.delete('/:id', authenticate, requireRole('company_admin'), handler)`
- For `wallet-vp.ts`: the `/credentials/:userId/ownership` endpoint should additionally validate that `req.user?.preferred_username` matches the `:userId` path parameter — return 403 if they differ (prevents cross-user credential exposure). This is a local check in the handler, not a new middleware. **Important**: use `preferred_username`, not `sub` — wallet records are keyed by `preferred_username` (e.g., `mario-sanchez`), not the Keycloak UUID. The `useAuthUser()` hook passes `preferred_username` as the `:userId` segment. Using `sub` (a UUID) would permanently fail the check for every real user.
- For `consent.ts`: the user-scoped GET routes (`GET /pending/:userId`, `GET /history/:userId`) should additionally validate that `req.user?.preferred_username` matches the `:userId` path parameter — return 403 if they differ. `GET /:id` (fetching by consent record ID rather than userId) does not need this check but should verify the returned record belongs to the requesting user before returning it. This prevents cross-user consent history exposure.
- Do **not** add `authenticate` to: `GET /companies/`, `GET /companies/:id`, `GET /cars`, `GET /cars/:vin`, public DID endpoints, well-known endpoints, org-credential status/proof

**Patterns to follow:**
- `backend/src/routes/companies.ts` line 220: `router.post('/', requireRole('company_admin'), handler)` — existing usage of `requireRole` without separate `authenticate` (requireRole already validates the token)
- `backend/src/routes/purchases.ts`: existing `requireRole('customer')` usage

**Test scenarios:**
- Happy path: `GET /consent/pending/:userId` with valid Bearer token where `preferred_username` === `:userId` returns 200 / data
- Error path: `GET /consent/pending/:userId` without Bearer token returns 401
- Error path: `GET /consent/pending/:userId` with valid Bearer token but `preferred_username` ≠ `:userId` returns 403 (cross-user access denied)
- Error path: `GET /edc/transactions` without Bearer token returns 401
- Error path: `DELETE /companies/:id` without Bearer token returns 401
- Error path: `DELETE /companies/:id` with valid Bearer token but role `customer` (not `company_admin`) returns 403
- Error path: `POST /underwriting/transform-and-score` with `company_admin` role returns 403 (requires `insurance_agent`)
- Error path: `GET /wallet-vp/credentials/:userId/ownership` where `req.user.preferred_username` ≠ `:userId` (e.g., requesting another user's credentials) returns 403
- Happy path: `GET /wallet-vp/credentials/:userId/ownership` where `req.user.preferred_username` === `:userId` returns 200
- Edge case: `AUTH_ENABLED=false` — all routes return data (mock user injected by middleware, dev-mode bypass)
- Integration: `GET /verifier/session/:id` — without token returns 401; with token returns session data from DB

**Verification:**
- Each listed endpoint returns 401 when called without Authorization header (with `AUTH_ENABLED=true`)
- Role-gated endpoints (`DELETE /companies/:id`, underwriting routes) return 403 for wrong roles
- Intentionally public endpoints (`GET /cars`, `GET /companies`) remain accessible without tokens

---

- [x] **Unit 6: Frontend — Terminology cleanup (manufacturer* → company* in UI)**

**Goal:** Update all frontend components that reference old `manufacturerCompanyId` state variables, DPP section keys, and UI labels to use generic participant terminology.

**Requirements:** R0d, R32

**Dependencies:** Unit 1 (Prisma field rename ensures backend now returns `companyId` not `manufacturerCompanyId` in API responses)

**Files:**
- Modify: `apps/portal-tata-admin/src/pages/CreateCar.tsx` — rename `manufacturerCompanyId` state to `companyId`; rename "Manufacturer Company" dropdown label to "Company"; update POST body field name
- Modify: `apps/portal-tata-admin/src/pages/CarDPP.tsx` — rename section key `'manufacturerCredential'` to `'credential'` and title "Manufacturer Credential" to "Credential"
- Modify: `apps/portal-tata-public/src/pages/CarDetail.tsx` — rename `{ title: 'Manufacturer Credential', key: 'manufacturerCredential' }` to `{ title: 'Credential', key: 'credential' }`
- Modify: `apps/portal-wallet/src/pages/DPPViewer.tsx` — rename section key `'manufacturerCredential'` to `'credential'`
- Modify: `packages/shared-types/src/index.ts` — rename `manufacturerCredential` field and `ManufacturerCredential` interface if not already done in Unit 2

**Approach:**
- In `CreateCar.tsx`: rename the `manufacturerCompanyId` state variable to `companyId`; update the "Manufacturer Company" `<label>` to "Company"; rename the `<select>` label. The POST body field name must match what the backend endpoint expects — verify in `cars.ts` after Unit 2 renames.
- In `CarDPP.tsx`, `CarDetail.tsx`, `DPPViewer.tsx`: update the section key and display title from `manufacturerCredential` to `credential`. These reference the DPP JSON key, which is also renamed in Unit 2 (`dpp-to-jaspar-transformer.ts`).
- Do not rename concepts that are genuinely product-level terms (e.g., if "Credential" is ambiguous in context, use "Asset Credential" — defer to implementer judgment on specific label copy).

**Patterns to follow:**
- Existing component structure in each portal file

**Test scenarios:**
- Happy path: `CreateCar.tsx` form submits `{ companyId: '...', ... }` in POST body (not `manufacturerCompanyId`)
- Happy path: `CarDPP.tsx` renders the credential section using key `'credential'`; the DPP JSON from the backend (after Unit 2) contains `credential` not `manufacturerCredential`
- Edge case: TypeScript compilation of each portal passes with no type errors related to renamed fields
- Edge case: `grep -r "manufacturerCompanyId\|manufacturerCredential\|Manufacturer Company\|Manufacturer Credential" apps/` returns no matches

**Verification:**
- Portal TypeScript builds pass (no errors in `apps/portal-tata-admin`, `apps/portal-wallet`, `apps/portal-tata-public`)
- No `grep` hits for old manufacturer terminology in frontend source files

---

- [x] **Unit 7: Frontend — Auth standardization (createAuthAxios) + remove organizationDid field**

**Goal:** Migrate all protected portal API calls to `createAuthAxios`; remove the unused `organizationDid` form field from the onboarding wizard.

**Requirements:** R19, R20, R31

**Dependencies:** Unit 5 (backend endpoints now require auth; frontend must send tokens)

**Files:**
- Modify: `apps/portal-dataspace/src/pages/CompanyRegistration.tsx` — use `createAuthAxios` for authenticated API calls; remove `did` from `FormData`, initial state, and Step 5 form; remove `organizationDid` input element
- Modify: `apps/portal-dataspace/src/pages/DataExchangeDashboard.tsx` — replace plain axios with `createAuthAxios`
- Modify: `apps/portal-dataspace/src/pages/RegistrationSuccess.tsx` — replace plain axios if making authenticated calls
- Modify: `apps/portal-company/src/pages/CompanyList.tsx` — replace plain axios with `createAuthAxios`
- Modify: `apps/portal-company/src/pages/CompanyDetail.tsx` — replace plain axios with `createAuthAxios`
- Modify: `apps/portal-wallet/src/pages/DPPViewer.tsx` — replace plain axios with `createAuthAxios`
- Modify: `apps/portal-wallet/src/pages/PresentationRequest.tsx` — replace plain axios with `createAuthAxios`
- Modify: `apps/portal-wallet/src/hooks/useConsentPolling.ts` — replace plain axios with `createAuthAxios` (consent polling endpoint now requires auth after Unit 5)
- Modify: `apps/portal-insurance/src/pages/ConsentWait.tsx` — replace plain axios with `createAuthAxios`
- Modify: `apps/portal-insurance/src/components/UnderwritingPanel.tsx` — replace plain axios with `createAuthAxios`
- Modify: `apps/portal-tata-admin/src/pages/CarList.tsx` — replace plain axios with `createAuthAxios`
- Modify: `apps/portal-tata-admin/src/pages/CarDPP.tsx` — replace plain axios with `createAuthAxios`
- Modify: `apps/portal-tata-admin/src/pages/VehicleRegistry.tsx` — replace plain axios with `createAuthAxios`
- Keep: `apps/portal-tata-public/` — car listing and car detail intentionally use public endpoints; plain axios is acceptable

**Approach:**
- Pattern: Obtain the token getter from `useAuth()` (or the portal's OIDC hook) and call `createAuthAxios(getToken)` or use the portal's shared `api` instance. Check each portal's App.tsx to see if a shared `api = createAuthAxios(...)` already exists and pass it as a prop or use a context.
- `portal-tata-admin/App.tsx` already creates `api = createAuthAxios(...)` — individual page files should use this shared instance instead of creating their own.
- `portal-wallet/App.tsx` already creates `api = createAuthAxios(...)` — same pattern.
- For portals without a shared `api` (company, insurance, dataspace), create the instance in each component using the auth hook.
- For `organizationDid` removal in `CompanyRegistration.tsx`:
  - Remove `did: string` from the `FormData` interface
  - Remove `did: ''` from initial form state
  - Remove the `organizationDid` / `Organization DID` input element in Step 5 "Compliance"
  - Remove `did: inputDid` from the POST body in the submit handler
  - The `inputDid` variable reference in the route handler `companies.ts` is already harmlessly ignored; no backend change needed

**Patterns to follow:**
- `apps/portal-tata-admin/App.tsx` — existing `createAuthAxios` usage pattern
- `packages/auth/src/authAxios.ts` — `createAuthAxios(getToken: () => string): AxiosInstance`

**Test scenarios:**
- Happy path: `portal-company` `CompanyList.tsx` API call to `GET /api/companies` includes `Authorization: Bearer <token>` header
- Happy path: `portal-wallet` consent polling in `useConsentPolling.ts` sends Bearer token to `GET /api/consent/pending/:userId`
- Happy path: `portal-insurance` underwriting flow calls `POST /api/underwriting/transform-and-score` with Bearer token
- Error path: If auth token is expired, `createAuthAxios` triggers OIDC token refresh (handled by `react-oidc-context` interceptor)
- Happy path: `CompanyRegistration.tsx` Step 5 form renders without `Organization DID` field; POST body does not include `did` property
- Edge case: Removing `did` from `FormData` type causes TypeScript compile error if any other component passes `did` — verify no other consumer
- Integration: Full onboarding flow completes with company created after `organizationDid` field removal

**Verification:**
- Each portal's TypeScript build passes with zero errors
- Network tab in browser shows `Authorization: Bearer ...` header on API calls to protected endpoints in each migrated portal
- `organizationDid` input is absent from the Step 5 form in `portal-dataspace`

---

- [x] **Unit 8: Cleanup — Seed data removal, Keycloak test users, documentation**

**Goal:** Remove all static test seed data files, Keycloak test users, orphaned npm scripts, and update documentation to reflect the clean state.

**Requirements:** R26, R27, R28, R29, R30

**Dependencies:** Unit 1 (seed.ts is already replaced in Unit 1; this unit handles the remaining files)

**Files:**
- Delete: `backend/src/seed-data.ts`
- Delete: `backend/data/db.json`
- Delete: `scripts/seed-org-credential.ts`
- Modify: `backend/src/routes/*.ts` — remove any `import` of `seed-data.ts`; replace fallback references to seed data with empty arrays or 404 responses
- Modify: `package.json` (root) — remove `seed:org` script
- Modify: `keycloak/realm-export.json` — remove users `toyota-admin`, `mario-sanchez`, `tokiomarine-agent`; keep `company-admin`
- Modify: `.claude/CLAUDE.md` — remove references to `seed:org` command, `seed-org-credential.ts`, `db.json`
- Modify: `README.md` — update seeding section to describe minimal role-only seed; remove old seed commands

**Approach:**
- Before deleting `seed-data.ts`, search all route files for `import ... from '../seed-data'` or `from '../../seed-data'` — identify every usage of exported constants (`seedCredentials`, `seedCars`, etc.) and replace with proper DB queries or remove the fallback entirely.
- `backend/data/db.json` is likely imported as a fallback data source in some route file — verify via `grep` and replace each usage with a Prisma query before deleting the file.
- In `keycloak/realm-export.json`: locate the `users` array and remove entries where `username` is `toyota-admin`, `mario-sanchez`, or `tokiomarine-agent`. Keep `company-admin`.
- Remove the `seed:org` script from the root `package.json` scripts object.
- Update `README.md` to replace the old seed command section with: "Run `npm run dev` — the database starts empty. Use the dataspace portal to onboard companies."

**Patterns to follow:**
- Existing Prisma query patterns in route files for fallback-free data access

**Test scenarios:**
- Happy path: Backend starts and all routes serve requests without importing `seed-data.ts` (no runtime import errors)
- Happy path: `GET /api/cars` returns an empty array `[]` when no cars have been created (not seed data)
- Happy path: `GET /api/companies` returns an empty array `[]` when no companies have been onboarded
- Edge case: `grep -r "seed-data\|db.json\|seed-org-credential" backend/src/ scripts/` returns no matches after deletion
- Happy path: Keycloak realm import from `keycloak/realm-export.json` succeeds without errors; only `company-admin` user exists
- Happy path: `npm run` from repo root does not show a `seed:org` script

**Verification:**
- Backend application starts cleanly with an empty database (after `prisma migrate dev`)
- No references to deleted files remain in the codebase (`grep` confirms)
- Keycloak realm export contains exactly one non-service user: `company-admin`

---

## System-Wide Impact

- **Interaction graph — consent polling silent stall**: `useConsentPolling.ts` in `portal-wallet` calls `GET /api/consent/pending/:userId` using bare `axios` (not the auth-aware instance). When auth is enforced, every poll returns 401 and the error is silently swallowed in the hook's empty `catch` block. `pendingConsent` stays `null` permanently and the consent modal never appears — the insurance → ownership verification flow stalls invisibly. Unit 7 must explicitly migrate `useConsentPolling.ts` to `createAuthAxios`; this is not fixed automatically by updating other components in the portal.
- **Error propagation**: Adding `authenticate` to 14 endpoints and flipping `AUTH_ENABLED: "true"` in Helm is an all-or-nothing change — no per-route incremental rollout is possible. All 14 endpoints and all 5 frontend portals must be validated in a staging environment with `AUTH_ENABLED=true` before flipping the flag in production. Any unmigrated frontend component will break with a 401.
- **State lifecycle risks**: Fresh migration resets the database (R25). Any demo data created before applying this plan will be lost. Keycloak must also be re-imported from the updated `realm-export.json` after the DB reset — otherwise existing Keycloak users will have no matching `CompanyUser` or `Company` records and company membership lookups will fail. Required deployment order: **DB reset → Keycloak realm re-import → seed.ts**.
- **API surface parity — wallet user identity**: Wallet records are keyed by `preferred_username` (the field `useAuthUser().userId` returns), not by Keycloak UUID (`sub`). The wallet-vp ownership check uses `req.user.preferred_username` vs `:userId`. Any external client passing a Keycloak UUID as `:userId` will receive 403 — they must pass `preferred_username` instead.
- **`AUTH_ENABLED` global bypass**: `helm/eu-jap-hack/values-custom.yaml` currently ships `AUTH_ENABLED: "false"`. All `authenticate` middleware calls are no-ops until this is flipped. The public `/health` endpoint returns `authEnabled: AUTH_ENABLED`, exposing whether auth is disabled to any caller. Update this value to `"true"` as part of Unit 5's deployment.
- **Token expiry during long-running flows**: The EDC negotiation flow can run 60–90 seconds server-side. `AuthProvider.tsx` does not configure `automaticSilentRenew: true`. If a Keycloak access token expires mid-flow (under short token lifetimes), subsequent API calls will silently return 401 until the user reloads. The multi-step insurance flow (VP sharing → consent → EDC → underwriting) is the most vulnerable.
- **Integration coverage — provisioning service hard prerequisite**: The provisioning service's `notifyBackend` silently drops terminal status (`ready`, `failed`) after exhausting retries. If Unit 4 (callback auth) is deployed before the provisioning service sends `X-Internal-Token`, every in-flight EDC provisioning job will silently fail — no derived EDC config (managementUrl, dataplaneUrl, etc.) will be written to the DB, leaving tenant connectivity permanently broken. The provisioning service update is a **hard deployment prerequisite** for Unit 4, not a concurrent step.
- **Unchanged invariants**: Gaia-X VC issuance flow, EDC provisioning flow, onboarding form fields (except `organizationDid` removal) remain unchanged. Keycloak realm roles and clients are unchanged except: (a) 3 test users removed from `realm-export.json`, (b) `realm_admin_client` service account added to the export so re-import is safe.
- **DPP JSON key migration**: The `credential` key rename only affects new cars created after the DB reset. The underwriting transformer will read `dpp.credential` from new DPP JSON payloads correctly after Unit 2.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Backend auth added before frontend sends tokens → 401 errors in demo | Deploy Units 5 and 7 together, with staging validation under `AUTH_ENABLED=true` first |
| `AUTH_ENABLED: "false"` in Helm not updated → all middleware is a no-op in production | Update `helm/eu-jap-hack/values-custom.yaml` atomically with Unit 5 middleware changes |
| Fresh DB migration destroys existing demo data | Coordinate with all demo environment users; confirm no critical demo in progress |
| DB reset without Keycloak re-import → Keycloak users have no DB Company/CompanyUser backing | Define and execute in order: DB reset → Keycloak realm re-import → seed.ts; treat as single deployment step |
| `realm_admin_client` missing from `realm-export.json` → re-import breaks Keycloak user creation during onboarding | Add admin client definition to realm export (Unit 3) before any re-import; verify POST /companies creates a Keycloak user in a fresh realm |
| `insurance_agent` Keycloak role missing from live instance (not just the file) | Verify via Keycloak admin UI or API against the running instance before deploying Unit 5 |
| Provisioning service not updated to send `X-Internal-Token` → in-flight provisioning jobs silently drop terminal status, EDC config never written | Provision service update is a hard blocker for Unit 4 backend deploy; smoke-test a provisioning callback before enabling auth on that route |
| Schema rename deployed before application code → runtime Prisma errors on all car-related queries | Migration and updated application code must deploy atomically in the same build artifact |
| `seed-data.ts` is imported by routes in ways not caught by simple grep | Run TypeScript build after deletion to catch any remaining import errors |
| Mock user names in `auth.ts` reference removed test users | Search for hardcoded test usernames (`toyota-admin`, `mario-sanchez`, `tokiomarine-agent`) in all non-deleted files before closing Unit 3 |
| Consent polling silent stall if `useConsentPolling.ts` not migrated alongside other frontend changes | Treat `useConsentPolling.ts` migration as a blocking item in Unit 7 — mark unit incomplete until this hook is verified |

## Documentation / Operational Notes

- **Deployment order (mandatory):** DB reset → Keycloak realm re-import from updated `realm-export.json` → `npx prisma migrate deploy` → `npx prisma db seed`. These must be executed in this exact order to avoid state divergence between Keycloak users and DB records.
- **`AUTH_ENABLED`**: Update `helm/eu-jap-hack/values-custom.yaml` from `AUTH_ENABLED: "false"` to `AUTH_ENABLED: "true"` as part of Unit 5. Without this, all `authenticate` middleware is a no-op in the K8s deployment.
- **`PROVISIONING_CALLBACK_SECRET`**: Add to backend Helm `values.yaml`, backend `backend/.env.example`, and backend Helm secret template (`helm/eu-jap-hack/templates/backend-secret.yaml`). The provisioning service must be updated to send `X-Internal-Token: <value>` on all `notifyBackend` calls before Unit 4 is deployed.
- **`realm_admin_client` in realm export**: The `realm_admin_client` service account (used by the backend for Keycloak user creation) must be added to `keycloak/realm-export.json` before re-import. Verify the client has `serviceAccountsEnabled: true` and the `manage-users` + `view-users` roles from the `realm-management` client. Without this, re-importing the realm disables the backend's ability to create Keycloak users during company onboarding.
- **Credential leak (follow-on)**: `keycloakAdmin.ts` line 30 logs the Keycloak admin client secret (`ADMIN_SECRET`) in plaintext as part of a cURL reconstruction. Track this as a separate security fix — do not block this plan on it, but address it before any production log aggregation is enabled.
- **`automaticSilentRenew`**: Consider enabling token auto-refresh in `AuthProvider.tsx` (`automaticSilentRenew: true`) to prevent mid-session auth failures during long-running EDC flows. Track as a follow-on enhancement.

## Sources & References

- **Origin document:** [docs/brainstorms/unified-participant-model-and-auth-hardening-requirements.md](docs/brainstorms/unified-participant-model-and-auth-hardening-requirements.md)
- **ADR:** [docs/adr/001-unified-participant-model-and-auth-hardening.md](docs/adr/001-unified-participant-model-and-auth-hardening.md)
- Auth middleware: `backend/src/middleware/auth.ts`
- Keycloak service: `backend/src/services/keycloakAdmin.ts`
- Company onboarding route: `backend/src/routes/companies.ts`
- Auth package: `packages/auth/src/authAxios.ts`
