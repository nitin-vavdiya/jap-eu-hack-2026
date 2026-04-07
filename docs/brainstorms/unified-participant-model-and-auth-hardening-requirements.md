---
date: 2026-04-07
topic: unified-participant-model-and-auth-hardening
---

# Unified Participant Model & Auth Hardening

## Problem Frame

The dataspace platform has four interrelated problems:

1. **Companies are not treated equally** — The codebase implicitly distinguishes "car makers" from "insurance companies" through naming (`manufacturerCompanyId`), static seed data tied to specific companies (e.g., "Toyota"), and role assignments. In reality, all companies are equal dataspace participants who can create assets and share data via EDC.

2. **User creation during onboarding is broken** — Assigns the wrong Keycloak role (`admin` instead of `company_admin`) and sets permanent passwords instead of requiring a change on first login.

3. **Auth coverage is incomplete across the stack** — Multiple backend endpoints handling sensitive data (consent, wallet, underwriting, EDC transactions, company deletion) have no authentication middleware. On the frontend, most portals don't use `createAuthAxios` from the shared auth package, making plain `axios` calls without Bearer tokens.

4. **Static seed data and test users create false assumptions** — Pre-seeded companies, cars, and 3 orphaned Keycloak test users encode a fixed world that doesn't reflect how the platform actually works (companies onboarded dynamically, data created through real flows).

## Requirements

**Unified Company Model — All Companies Are Equal Dataspace Participants**
- R0a. There is no "company type" concept in the system. All onboarded companies are equal dataspace participants — whether they manufacture cars, provide insurance, or offer any other service.
- R0b. Any company can create assets (e.g., cars), share data via EDC, and consume data from other participants. The platform does not restrict capabilities based on what kind of business the company operates.
- R0c. All company admin users receive the same Keycloak role (`company_admin`). There is no role differentiation by company type.
- R0d. Remove any "manufacturer"-specific terminology from the codebase (database fields, variable names, UI labels) and replace with generic participant terminology.

**Company-Scoped Role Model (DB)**
- R1. Add a `Role` master table with `id`, `name` (unique), `description`, timestamps.
- R2. Add a `roleId` foreign key on `CompanyUser` linking each user to their company-scoped role.
- R3. Seed the `Role` table with a single role: `company_admin` (description: "Company administrator with full access"). This is bootstrap/config data, not test data.
- R4. Keycloak manages **platform-level roles** (which portal can the user access). The DB `Role` table manages **company-scoped permissions** (what can the user do within their company). Both are checked: Keycloak via JWT, DB via CompanyUser.role lookup.

**Keycloak User Creation**
- R5. When a company is onboarded, create a Keycloak user with the provided admin email and password.
- R6. The password must be set as **temporary** so Keycloak forces the user to change it on first login.
- R7. Assign the `company_admin` Keycloak realm role to the newly created user (not `admin`).
- R8. Link the Keycloak user to the company via a `CompanyUser` record with `roleId` set to the `company_admin` DB role.

**Backend Route Protection — Critical**
- R9. `DELETE /api/companies/:id` must require `authenticate` + `requireRole('company_admin')`.
- R10. `PATCH /api/companies/:id/edc-provisioning` (internal callback from provisioning service) must validate the caller — either via a shared secret/API key or service-to-service token.

**Backend Route Protection — High**
- R11. Consent endpoints (`GET /consent/pending/:userId`, `/history/:userId`, `/:id`) must require `authenticate` middleware.
- R12. EDC transaction endpoints (`GET /edc/transactions`, `/edc/transactions/:id`) must require `authenticate` middleware.
- R13. Wallet-VP endpoints (`GET /wallet-vp/credentials/:userId/ownership`, `POST /wallet-vp/generate-vp`) must require `authenticate` middleware.
- R14. Underwriting endpoints (`POST /underwriting/transform-and-score`, `/confirm`, `GET /underwriting/:vin`) must require `authenticate` + `requireRole('insurance_agent')`.
- R15. Verifier session endpoints (`GET /verifier/session/:id`, `/session-by-request/:requestId`) must require `authenticate` middleware.

**Backend Route Protection — Medium**
- R16. `GET /vehicle-registry/vehicles/:vin/audit-log` must require `authenticate` middleware.
- R17. `GET /vehicle-registry/vehicles/:vin/access-sessions` must require `authenticate` middleware.
- R18. `GET /companies/:id/edc-status` must require `authenticate` middleware.

**Frontend Auth Standardization**
- R19. All protected portals (dataspace, tata-admin, wallet, insurance, company) must use `createAuthAxios` for API calls to authenticated endpoints.
- R20. Plain `axios` or `fetch` calls without auth headers must be replaced with the auth-aware axios instance, except for intentionally public endpoints (car listings, DID resolution).

**Database Schema — Generalize Car→Company Relationship**
- R21. Rename `Car.manufacturerCompanyId` to `Car.companyId` to reflect that any dataspace participant (not just a "manufacturer") can create assets.
- R22. Rename `Car.manufacturerCredentialId` to `Car.credentialId` to match the generalized naming.
- R23. Rename the Prisma relation `manufacturerCompany` to `company` on the Car model.
- R24. Update all backend routes and frontend components that reference the old field names.
- R25. Since there is no production deployment, reset the database with a fresh migration (no incremental migration needed).

**Remove Test Seed Data & Static Test Users**
- R26. Delete `backend/src/seed-data.ts`, `backend/data/db.json`, and `scripts/seed-org-credential.ts`.
- R27. Replace `backend/prisma/seed.ts` with a minimal seed that only creates the `company_admin` role in the Role table. Remove `seed:org` from root `package.json`.
- R28. The app starts with an empty database except for the seeded Role master data. Companies, cars, and all other data are created only through the application flows.
- R29. Update `CLAUDE.md` and `README.md` to remove old seed-related commands and references.
- R30. Remove the 3 static test users (`toyota-admin`, `mario-sanchez`, `tokiomarine-agent`) from `keycloak/realm-export.json`. Only the platform operator bootstrap account (`company-admin`) remains.

**Cleanup**
- R31. Remove the unused `organizationDid` form field from the onboarding wizard (Step 5 "Compliance") — the DID is always auto-generated and the field value is ignored by the backend.
- R32. Rename "manufacturer"-specific variable names in backend routes (e.g., `mfgCompany`, `manufacturerCred`, `manufacturerVerified`) and UI labels (e.g., "Manufacturer Company" dropdown in `portal-tata-admin`) to generic participant terminology.

## Success Criteria

- A newly onboarded company admin can log in and is immediately prompted to change their password.
- After password change, the user has the `company_admin` role in both Keycloak (JWT) and DB (CompanyUser.role).
- A `Role` master table exists with `company_admin` seeded. `CompanyUser` records reference this role.
- All sensitive backend endpoints return 401 when called without a valid token.
- All mutation endpoints require appropriate role authorization.
- Frontend portals send Bearer tokens on all API calls to protected endpoints.
- The Car model uses generalized field names (`companyId`, `credentialId`) with no "manufacturer" terminology in DB, routes, or UI.
- Only the platform operator bootstrap account remains in Keycloak realm export — no orphaned test users.
- Gaia-X VC flows and EDC provisioning remain unchanged.

## Scope Boundaries

- **Out of scope**: Company admin inviting additional users (future feature).
- **Out of scope**: Differentiating company types — all participants are equal dataspace participants.
- **Out of scope**: Self-registration for public users / customers.
- **Out of scope**: Changes to Gaia-X credential issuance or EDC provisioning flows.
- **Out of scope**: Rate limiting on public endpoints (separate concern).
- **Intentionally public**: Car listings (`GET /cars`), DID resolution, vehicle registry well-known endpoints, org-credential status/proof — these remain unauthenticated.

## Key Decisions

- **All companies are equal**: No company type field, no role differentiation by business type. A car maker and an insurance company have identical capabilities in the dataspace. What they do with those capabilities is up to them.
- **Split role architecture**: Keycloak handles platform-level access (which portal). DB `Role` table handles company-scoped permissions (what actions within a company). Both are checked.
- **Simple Role model for now**: Role table with `name` + `description`. No granular permissions table yet — can be added later without schema-breaking changes.
- **Seed only roles**: The seed script creates only master/config data (the `company_admin` role), not test companies or users.
- **Always `company_admin` role**: All onboarded participants get the same role in both Keycloak and DB.
- **Temporary password**: Keycloak's built-in `temporary: true` credential flag handles forced password change natively.
- **`createAuthAxios` as the standard**: The shared auth package already provides this — adoption is the fix, not new tooling.
- **Provisioning callback protection**: Service-to-service auth via shared secret or client_credentials token (not public auth).

## Dependencies / Assumptions

- The `company_admin` role already exists in the Keycloak realm (verified).
- The Keycloak admin client has permission to create users and assign roles.
- `AUTH_ENABLED` must be `true` in non-dev environments for any of the backend protection to take effect.
- The `createAuthAxios` function in `packages/auth` correctly attaches Bearer tokens (verified).
- The **platform operator account** (`company-admin` / `company`) is a static user in `keycloak/realm-export.json` with the `company_admin` role. This is the bootstrap account needed to onboard the first companies. It is not created by seed data and remains unchanged. Hardcoding this account with a permanent password is acceptable for MVP — a future improvement would be to set a temporary password or use a proper admin bootstrap flow.

## Outstanding Questions

### Deferred to Planning
- [Affects R8][Technical] Verify that `CompanyUser` record creation correctly stores the Keycloak UUID, email, and roleId.
- [Affects R10][Technical] Decide between shared API key vs. client_credentials token for provisioning callback auth.
- [Affects R24, R32][Technical] Verify all references to `manufacturer*` across backend routes, services, and frontend are updated.
- [Affects R31][Technical] Check if `organizationDid` is referenced anywhere else in the frontend.

## Next Steps

-> `/ce:plan` for structured implementation planning
