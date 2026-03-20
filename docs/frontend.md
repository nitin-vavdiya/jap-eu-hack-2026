# Frontend

Six React 18 portals, each a Vite SPA. They share authentication, theming, and TypeScript types via three internal npm packages. Every portal is independently deployable via Docker/nginx.

---

## Table of Contents

- [Shared Packages](#shared-packages)
- [Portal Overview](#portal-overview)
- [Portal: Dataspace Registry](#portal-dataspace-registry)
- [Portal: TATA Admin](#portal-tata-admin)
- [Portal: Public Showroom](#portal-public-showroom)
- [Portal: Wallet](#portal-wallet)
- [Portal: Insurance](#portal-insurance)
- [Portal: Company Directory](#portal-company-directory)
- [Authentication Integration](#authentication-integration)
- [Runtime Configuration](#runtime-configuration)
- [Docker & nginx](#docker--nginx)
- [Development](#development)

---

## Shared Packages

Three internal packages are shared across all portals via npm workspaces.

### `@eu-jap-hack/auth`

The most important shared package. Provides:

| Export | Type | Description |
|---|---|---|
| `AuthProvider` | Component | OIDC context provider — wraps the app root |
| `useAuthUser()` | Hook | Returns `{ userId, fullName, roles, accessToken }` |
| `ProtectedRoute` | Component | Route wrapper; redirects to login if role requirement not met |
| `LoginPage` | Component | Pre-built login UI with portal branding |
| `createAuthAxios()` | Factory | Returns an Axios instance with JWT injected into every request |
| `ROLES` | Object | Role constants: `admin`, `customer`, `insurance_agent`, `company_admin` |
| `PortalTheme` | Config | Theme config (colors, name, icon) per portal |
| `getKeycloakUrl()` | Helper | Reads `window.__CONFIG__.VITE_KEYCLOAK_URL` |
| `getApiBase()` | Helper | Reads `window.__CONFIG__.VITE_API_BASE_URL` |
| `getPortal*Url()` | Helpers | Cross-portal navigation URLs |

Every portal's `main.tsx` looks like this:

```tsx
import { AuthProvider } from '@eu-jap-hack/auth'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AuthProvider portalName="portal-insurance" requiredRole="insurance_agent">
    <App />
  </AuthProvider>
)
```

### `@eu-jap-hack/shared-types`

TypeScript interfaces shared between frontend and backend (indirectly via API response shapes):

| Type | Description |
|---|---|
| `AssetAdministrationShell` | Vehicle digital twin (AAS standard) |
| `SubmodelDescriptor` | AAS submodel reference |
| `SpecificAssetId` | CatenaX-style asset identifiers |
| `PassportMetadata` | DPP metadata envelope |
| `IdentificationType` | VIN / serial number types |

### `@eu-jap-hack/ui-tokens`

Design tokens and Tailwind config shared across portals. Ensures consistent spacing, colors, and typography without copy-pasting Tailwind classes.

---

## Portal Overview

| Portal | Port | Primary Role | Key Pages |
|---|---|---|---|
| `portal-dataspace` | 3001 | company_admin | Org registration, Gaia-X credentials |
| `portal-tata-admin` | 3002 | admin | Fleet management, DPP editor |
| `portal-tata-public` | 3003 | customer | Vehicle showroom, purchase |
| `portal-wallet` | 3004 | customer | Credential wallet, VP responses |
| `portal-insurance` | 3005 | insurance_agent | VP verification, premium calculation |
| `portal-company` | 3006 | any | Company directory |

---

## Portal: Dataspace Registry

**Port:** 3001 | **Role:** `company_admin`

Manages organization registration and Gaia-X compliance credentials.

### Pages

| Page | Route | Description |
|---|---|---|
| `CompanyRegistration` | `/register` | Register organization (VAT, EORI, CIN, DID) |
| `CreateOrgCredential` | `/org-credentials/new` | Generate Gaia-X Legal Participant VC |
| `OrgCredentialsList` | `/org-credentials` | List all registered organizations |
| `OrgCredentialDetail` | `/org-credentials/:id` | View compliance results (notary + compliance) |
| `GaiaXHealth` | `/gaiax-health` | Test GXDCH endpoint health |
| `DataExchangeDashboard` | `/data-exchange` | EDC transaction monitor |

### Key Interactions

1. `CompanyRegistration` → `POST /api/companies` → company record created
2. `CreateOrgCredential` → `POST /api/org-credentials` → org credential created (pending)
3. `OrgCredentialDetail` "Verify" button → `POST /api/org-credentials/:id/verify` → triggers Gaia-X pipeline
4. `DataExchangeDashboard` polls `GET /api/edc/transactions`

---

## Portal: TATA Admin

**Port:** 3002 | **Role:** `admin`

Fleet management and Digital Product Passport editor for TATA Motors administrators.

### Pages

| Page | Route | Description |
|---|---|---|
| `CarList` | `/cars` | Vehicle inventory with status indicators |
| `CreateCar` | `/cars/new` | Add new vehicle (VIN, make, model, year) |
| `CarDPP` | `/cars/:vin/dpp` | Full DPP editor (10 sections) |
| `VehicleRegistry` | `/vehicle-registry` | Search vehicle registry |
| `CaddePage` | `/cadde` | CADDE cross-domain data exchange |

### DPP Editor

The `CarDPP` page is a multi-section form covering all 10 DPP sections:

1. **Identity** — VIN, manufacturer, model, year
2. **Powertrain** — Engine type, displacement, power output
3. **Emissions** — CO2, NOx, Euro standard
4. **Materials** — Recyclability, hazardous materials
5. **Damage History** — Accident records
6. **Service History** — Maintenance records
7. **Ownership** — Purchase chain
8. **End-of-Life** — Recycling instructions
9. **Digital Services** — Connected features
10. **Compliance** — Type approvals, certifications

Each section saves independently via `PUT /api/cars/:vin`.

---

## Portal: Public Showroom

**Port:** 3003 | **Role:** `customer` (browse unauthenticated, login to purchase)

Public-facing vehicle marketplace.

### Pages

| Page | Route | Description |
|---|---|---|
| `CarGrid` | `/` | Browse vehicles (search + filter) |
| `CarDetail` | `/cars/:vin` | Vehicle specs, DPP summary, pricing |
| `BuySuccess` | `/buy/success` | Purchase confirmation |

### Purchase Flow

```
1. User clicks "Buy Now" on CarDetail
2. POST /api/purchases   → creates Purchase record
3. Backend issues OwnershipVC via walt.id (OID4VCI)
4. Credential stored in buyer's wallet
5. BuySuccess page shows confirmation + wallet link
```

See [docs/flows/vehicle-purchase.md](flows/vehicle-purchase.md).

---

## Portal: Wallet

**Port:** 3004 | **Role:** `customer`

Digital credential wallet for vehicle owners.

### Pages

| Page | Route | Description |
|---|---|---|
| `WalletHome` | `/` | All held credentials (SelfVC, OwnershipVC, InsuranceVC) |
| `CredentialCard` | `/credentials/:id` | Individual credential detail view |
| `PresentationRequest` | `/present/:sessionId` | Respond to a VP request |
| `DPPViewer` | `/dpp/:vin` | View linked vehicle DPP |

### Key Features

**Credential display:** Credentials are grouped by type with visual badges. Each card shows issuer, issuance date, and subject claims.

**VP Response Flow:**
1. Insurance agent creates `PresentationRequest` (generates `sessionId`)
2. Owner receives notification (consent polling or deep-link)
3. Owner opens `PresentationRequest` page
4. Owner selects credentials to include
5. Frontend calls `POST /api/wallet-vp/generate-vp`
6. Signed VP is submitted to verifier endpoint
7. Session status updates in real-time

**Consent modal:** The wallet polls `GET /api/consent/pending/:userId` for incoming data-sharing requests. Pending consents appear as modal overlays.

---

## Portal: Insurance

**Port:** 3005 | **Role:** `insurance_agent`

Insurance underwriting via VP verification and DPP data.

### Pages

| Page | Route | Description |
|---|---|---|
| `VinLookup` | `/` | Enter vehicle VIN |
| `ConsentWait` | `/consent/:requestId` | Poll for owner consent approval |
| `VPInsuranceFlow` | `/verify/:sessionId` | OpenID4VP request (QR code / deep-link) |
| `QuotePage` | `/quote/:vin` | Premium calculator from DPP data |
| `PolicySuccess` | `/policy/:vin` | Policy issuance confirmation |

### Verification Pipeline

```
VinLookup
  └─ POST /api/consent/request        ← request owner consent
       └─ ConsentWait
            └─ polls GET /api/consent/check
                 └─ (owner approves in Wallet portal)
                      └─ POST /api/verifier   ← create VP request
                           └─ VPInsuranceFlow
                                └─ polls GET /api/verifier/:id/status
                                     └─ (owner submits VP in Wallet portal)
                                          └─ QuotePage ← receives DPP data
                                               └─ POST /api/insurance
                                                    └─ PolicySuccess
```

**Premium calculation** on `QuotePage` is transparent — the page shows exactly which DPP fields were used and what multipliers were applied (engine size, emission class, damage history, service records).

---

## Portal: Company Directory

**Port:** 3006 | **Role:** any (public read)

Browsable directory of organizations registered in the dataspace.

### Pages

| Page | Route | Description |
|---|---|---|
| `CompanyList` | `/` | All registered organizations |
| `CompanyDetail` | `/companies/:id` | Gaia-X compliance status + credentials |

---

## Authentication Integration

All portals use the same pattern:

```tsx
// main.tsx
<AuthProvider portalName="portal-wallet" requiredRole="customer">
  <App />
</AuthProvider>
```

```tsx
// Protected route
<ProtectedRoute role="customer">
  <WalletHome />
</ProtectedRoute>
```

```tsx
// API call with auth
const api = createAuthAxios()           // JWT injected automatically
const { data } = await api.get('/api/wallet/mario-sanchez')
```

**`useAuthUser()` return shape:**

```typescript
{
  userId: string           // Keycloak sub / mock user ID
  fullName: string
  email: string
  roles: string[]          // realm_access.roles
  accessToken: string      // Bearer token for manual use
  isAuthenticated: boolean
}
```

---

## Runtime Configuration

Portals don't bake environment-specific URLs at build time. Instead, nginx's `docker-entrypoint.sh` generates a `config.js` file on container start:

```bash
# apps/docker-entrypoint.sh
cat > /usr/share/nginx/html/config.js << EOF
window.__CONFIG__ = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL}",
  VITE_KEYCLOAK_URL: "${VITE_KEYCLOAK_URL}",
  VITE_KEYCLOAK_REALM: "${VITE_KEYCLOAK_REALM}",
  ...
};
EOF
```

The `index.html` loads this before the app bundle:
```html
<script src="/config.js"></script>
<script type="module" src="/assets/index.js"></script>
```

This means one Docker image can be promoted from dev → staging → production just by changing environment variables.

---

## Docker & nginx

All 6 portals share one `Dockerfile` in `apps/`:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
ARG APP_NAME
WORKDIR /app
COPY . .
RUN npm ci && npm run build --workspace=apps/${APP_NAME}

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/apps/${APP_NAME}/dist /usr/share/nginx/html
COPY apps/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/docker-entrypoint.sh /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
```

`APP_NAME` build arg selects which portal to build. nginx config handles SPA routing (all paths → `index.html`).

**Build all portals:**

```bash
./build-and-push.sh
# Builds linux/amd64 + linux/arm64 for each portal
# Pushes to public.ecr.aws/smartsensesolutions/eu-jap-hack/
```

---

## Development

### Run individual portal

```bash
npm run dev --workspace=apps/portal-wallet
# Portal available at http://localhost:3004
```

### Run all portals

```bash
docker compose up -d
# Or run each in a separate terminal:
npm run dev --workspace=apps/portal-dataspace
npm run dev --workspace=apps/portal-tata-admin
# ... etc
```

### Add a shared dependency

```bash
npm install some-package --workspace=apps/portal-wallet
```

### Add to a shared package

```bash
npm install some-package --workspace=packages/auth
# Then rebuild: npm run build --workspace=packages/auth
```

> **Tip:** If a portal isn't picking up changes from a shared package, run `npm run build --workspace=packages/auth` to recompile the package. Vite's dev server watches local workspace deps but may need a rebuild after TypeScript changes.
