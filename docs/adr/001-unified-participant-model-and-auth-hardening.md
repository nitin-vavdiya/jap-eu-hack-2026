# ADR-001: Unified Participant Model & Auth Hardening

- **Status**: Proposed
- **Date**: 2026-04-07
- **Decision Makers**: Nitin Vavdiya

## Context

The dataspace platform onboards business partners (companies) who participate in secure data exchange via Eclipse Dataspace Connectors (EDC). Two interrelated auth problems exist:

### Problem 1: Broken user creation during onboarding

The existing `createKeycloakUser()` function in `backend/src/services/keycloakAdmin.ts` creates a Keycloak user during onboarding but:

1. **Wrong role assigned** — Assigns `admin` (car maker fleet management) instead of `company_admin` (dataspace participant administrator).
2. **Permanent password** — Set with `temporary: false`, so users never change the initial password set by the platform operator.

The system historically treated car makers and insurance companies as distinct types. In practice, **all companies are equal dataspace participants** — they can create assets, share data, and consume data from each other through EDC.

### Problem 2: Incomplete auth coverage across the stack

An audit of backend routes and frontend portals revealed:

**Backend** — Multiple sensitive endpoints have no authentication:
- `DELETE /companies/:id` — unprotected company deletion
- `PATCH /companies/:id/edc-provisioning` — unprotected internal callback
- Consent, wallet-VP, underwriting, EDC transaction, and verifier session endpoints all expose sensitive data without auth

**Frontend** — The shared auth package (`@jap-eu-hack/auth`) provides `createAuthAxios` for authenticated API calls, but 4 of 6 portals don't use it. They make plain `axios` calls without Bearer tokens, even to endpoints that require authentication.

## Decision

### 1. Treat all companies as equal dataspace participants

No "company type" concept. Every onboarded company is a dataspace participant with the same capabilities. The role they play (data provider, data consumer, or both) is determined by usage, not a static type.

### 2. Create Keycloak user with temporary password during onboarding

Password marked as **temporary** (`temporary: true`), triggering Keycloak's "Update Password" required action on first login. This ensures:

- The platform operator who sets the initial password does not retain permanent access
- The company admin sets their own password on first login

### 3. Split role architecture — Keycloak for platform access, DB for company permissions

Roles are managed at two levels:

- **Keycloak realm roles** (`company_admin`, `customer`, `insurance_agent`) control **platform-level access** — which portal a user can log into. These are embedded in the JWT token.
- **DB `Role` table** controls **company-scoped permissions** — what a user can do within their company. A `CompanyUser` record links a user to both a company and a role.

A new `Role` model is added to the Prisma schema:

```
Role: id, name (unique), description, createdAt, updatedAt
CompanyUser: id, keycloakId, email, companyId, roleId, createdAt, updatedAt
```

For this scope, only one role is seeded: `company_admin`. The schema supports adding more roles (e.g., `viewer`, `editor`) and eventually a granular permissions table without breaking changes.

### 4. Assign the `company_admin` role in both Keycloak and DB

All onboarded company admin users receive the `company_admin` Keycloak realm role AND are linked to the `company_admin` DB role via `CompanyUser.roleId`. No parameterized role assignment — all participants are equal.

### 5. Protect all sensitive backend endpoints

Apply `authenticate` middleware to all endpoints that handle sensitive data. Apply `requireRole(...)` to mutation endpoints where role-based access control is appropriate.

**Critical fixes:**
- `DELETE /companies/:id` → `authenticate` + `requireRole('company_admin')`
- `PATCH /companies/:id/edc-provisioning` → service-to-service auth (shared secret or client_credentials token)

**High-priority fixes:**
- Consent endpoints → `authenticate`
- EDC transaction endpoints → `authenticate`
- Wallet-VP endpoints → `authenticate`
- Underwriting endpoints → `authenticate` + `requireRole('insurance_agent')`
- Verifier session endpoints → `authenticate`

**Medium-priority fixes:**
- Vehicle audit log, access sessions, EDC status polling → `authenticate`

**Intentionally public (no change):**
- Car listings, DID resolution, vehicle registry well-known, org-credential status/proof

### 6. Standardize frontend auth via `createAuthAxios`

All protected portals must use `createAuthAxios` from the shared auth package for API calls to authenticated endpoints. Plain `axios`/`fetch` without auth headers is only acceptable for intentionally public endpoints (car listings, DID resolution).

### 7. Generalize the Car→Company relationship in the database

The `Car` model currently uses `manufacturerCompanyId` and `manufacturerCredentialId`, encoding the assumption that only "manufacturers" create cars. Since all companies are equal dataspace participants, these fields are renamed:

- `manufacturerCompanyId` → `companyId`
- `manufacturerCredentialId` → `credentialId`
- `manufacturerCompany` relation → `company`

Since there is no production deployment, the database is reset with a fresh migration rather than an incremental one. All backend routes, seed data, and frontend components referencing the old names are updated.

### 8. Remove test seed data, keep role seed

Static test data (`backend/src/seed-data.ts`, `backend/data/db.json`, `scripts/seed-org-credential.ts`) and their npm script references are removed. The seed script (`backend/prisma/seed.ts`) is replaced with a minimal version that only creates the `company_admin` role in the `Role` table — this is bootstrap/config data, not test data.

The application starts with an empty database except for the seeded role. All other data is created through application flows:

- Companies via the onboarding wizard
- Cars via the admin portal
- Users via Keycloak user creation during onboarding
- Credentials, consents, and policies via their respective workflows

### 9. No changes to Gaia-X or EDC provisioning flows

The Gaia-X credential issuance flow and EDC provisioning flow remain unchanged. All onboarding form fields feed into Gaia-X VCs and are preserved. EDC provisioning depends only on `companyId`, `tenantCode`, and `bpn`.

## Alternatives Considered

### A. Parameterized role assignment based on company type

Create a company type field and map each type to a Keycloak role. **Rejected** — all participants are functionally equal; type-based roles add artificial distinctions and unnecessary complexity.

### B. Keep permanent passwords with email-based reset

Rely on "Forgot Password" flow. **Rejected** — leaves the operator-set password active indefinitely if the user never resets it.

### C. Self-registration for company admins

Invitation link → self-registration on Keycloak. **Deferred** — better long-term UX but adds complexity (invitation tokens, email delivery, expiry) beyond MVP scope.

### D. Global auth middleware

Apply `authenticate` to all routes by default and whitelist public endpoints. **Considered but deferred** — would be cleaner architecturally, but the current per-route approach is explicit and the risk of breaking public endpoints (DID resolution, well-known) during a hackathon is not worth the refactor.

### E. Frontend auth via axios interceptor on a global instance

Create one global axios instance with auth headers instead of using `createAuthAxios` per-component. **Rejected** — the shared auth package already provides the right pattern; a global instance would bypass the OIDC token lifecycle managed by `react-oidc-context`.

### F. Roles + granular permissions table from day one

Add a `Permission` table and `RolePermission` join table for fully dynamic RBAC. **Deferred** — adds schema complexity without immediate value since we only have one role (`company_admin`). The simple `Role` table can be extended with a permissions layer later without breaking changes.

### G. Roles in Keycloak only (no DB role table)

Keep roles exclusively in Keycloak and cache a role string on `CompanyUser`. **Rejected** — Keycloak is suited for platform-level access control (which portal), but company-scoped permissions (what actions within a company) need to be queryable from the DB for future role-based UI rendering and API authorization.

## Consequences

### Positive

- **Security** — Temporary passwords, correct role assignment, and protected endpoints close the main auth gaps.
- **Correct RBAC** — Users get `company_admin` in both Keycloak (JWT) and DB (CompanyUser.role).
- **Future-ready role model** — Simple `Role` table supports adding more roles and eventually granular permissions without schema-breaking changes.
- **Consistent auth pattern** — `createAuthAxios` becomes the single way to make authenticated API calls across all portals.
- **Simpler model** — All companies are equal participants.
- **Zero impact on Gaia-X and EDC** — Credential issuance, provisioning, and form fields unchanged.

### Negative

- **Platform operator must communicate initial credentials out-of-band** — Acceptable for MVP.
- **Frontend changes across 5 portals** — Replacing plain axios calls is mechanical but touches many files.

### Known Gaps (Acceptable for MVP)

- **Platform operator bootstrap account** — The `company-admin` user in `keycloak/realm-export.json` has a hardcoded permanent password (`company`). This is the bootstrap account needed to onboard the first companies. Future improvement: temporary password or a proper admin bootstrap flow.

### Risks

- **Breaking public endpoints** — Adding auth to routes that frontends currently call without tokens will cause 401s until the frontend is updated. Backend and frontend changes must be coordinated.
- **Keycloak admin client permissions** — Must be verified in non-dev environments.
- **`AUTH_ENABLED` flag** — Must be `true` in non-dev environments for any backend protection to take effect.

## Implementation Scope

**Backend:**
- `backend/src/services/keycloakAdmin.ts` — `temporary: true`, role `company_admin`
- `backend/src/routes/companies.ts` — Add auth to DELETE and EDC-status endpoints
- `backend/src/routes/consent.ts` — Add auth to GET endpoints
- `backend/src/routes/edc.ts` — Add auth to transaction endpoints
- `backend/src/routes/wallet-vp.ts` — Add auth to credential/VP endpoints
- `backend/src/routes/underwriting.ts` — Add auth + role to all endpoints
- `backend/src/routes/verifier.ts` — Add auth to session endpoints
- `backend/src/routes/vehicle-registry.ts` — Add auth to audit-log and access-sessions

**Frontend:**
- `apps/portal-dataspace/` — Use `createAuthAxios`, remove unused `organizationDid` field
- `apps/portal-tata-admin/` — Standardize remaining plain axios calls
- `apps/portal-wallet/` — Fix consent polling auth
- `apps/portal-insurance/` — Replace plain axios with `createAuthAxios`
- `apps/portal-company/` — Replace plain axios with `createAuthAxios`

**Database:**
- `backend/prisma/schema.prisma` — Add `Role` model (`id`, `name` unique, `description`, timestamps). Add `roleId` FK on `CompanyUser`. Rename `manufacturerCompanyId` → `companyId`, `manufacturerCredentialId` → `credentialId`, relation `manufacturerCompany` → `company` on Car model
- Fresh migration via `prisma migrate dev` (no incremental migration, database reset)

**Seed data:**
- Replace `backend/prisma/seed.ts` with minimal seed that creates only the `company_admin` role in the `Role` table
- Delete `backend/src/seed-data.ts`, `backend/data/db.json`, `scripts/seed-org-credential.ts`
- Remove `seed:org` from root `package.json`
- Remove 3 static test users (`toyota-admin`, `mario-sanchez`, `tokiomarine-agent`) from `keycloak/realm-export.json` — only platform operator `company-admin` remains

**Terminology cleanup:**
- Rename `manufacturer*` variable names in backend routes and UI labels to generic participant terminology

**No changes:** Gaia-X flows, EDC provisioning, onboarding form fields.
