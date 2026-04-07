# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is MVP/POC project for Eclipse Tractus-X dataspace operating company and dataspace participants.
We have below actors in this application:

1. **Dataspace Operating Company** - This will be admin of the platform, we can consider as platform operator.
2. **Dataspace Participant** - Companies who want to participate in the dataspace so they can share data between participants.
3. **People** - General public who can see the data which are available publicly.

---

## The Context of the MVP

### Step 1: Onboarding Participants

As an operating company, we will invite business partners to the dataspace. During onboarding we:

- Create **Gaia-X Verifiable Credentials** for them.
- Create **Eclipse Dataspace Connector (EDC)** infrastructure in a Kubernetes cluster so they can share data.

For our use case, we create two businesses:

1. **Car Maker** - Creates digital twins of the car models which they manufacture.
2. **Insurance Company** - An insurance company which gets car information when they issue insurance.

### Step 2: Car Purchase on Public Portal

We have a public portal where all car models are available to browse and buy.

1. User can login and browse available car models.
2. User selects a model and purchases it.
3. Upon buying the car, the car maker issues an **Ownership Verifiable Credential (VC)** to the user.
4. The ownership VC is stored in the user's **walt.id wallet**.

### Step 3: Insurance via EDC Data Exchange

Once the user has bought the car, they go to the insurance company portal. The flow works as follows:

1. User enters the **VIN number** of the car in the insurance company portal.
2. Insurance company requests **ownership proof** of the vehicle from the user.
3. User opens their **walt.id wallet** and shares a **Verifiable Presentation (VP)** of the ownership VC to the insurance company.
4. Insurance company **verifies** the Verifiable Presentation to confirm the user is the legitimate owner of the vehicle.
5. After successful verification, the insurance company fetches the car's **digital twin data** from the car maker using the **EDC (Eclipse Dataspace Connector)**.
6. Based on the car data, the insurance company calculates and provides the **insurance quote** to the user.

---

## Architecture Flow Summary

```
Operating Company
    ├── Onboards Car Maker
    │     ├── Issues Gaia-X VC
    │     └── Deploys EDC on K8s
    └── Onboards Insurance Company
          ├── Issues Gaia-X VC
          └── Deploys EDC on K8s

Public Portal
    └── User browses & buys car
          └── Car Maker issues Ownership VC → stored in walt.id wallet

Insurance Portal
    └── User enters VIN number
          └── Insurance Co. requests ownership proof
                └── User shares VP from walt.id wallet
                      └── Insurance Co. verifies VP
                            └── Fetches digital twin data via EDC
                                  └── Returns insurance quote to user
```


## Architecture

### Monorepo Structure (npm workspaces)

- **`backend/`** — Express + TypeScript API server (port 8000), Prisma ORM with PostgreSQL
- **`provisioning/`** — Microservice for per-tenant EDC provisioning (Postgres, Vault, Helm, Argo CD)
- **`apps/`** — 6 Vite + React portals (each a separate workspace):
  - `portal-dataspace` (3001) — Organization registration & Gaia-X onboarding
  - `portal-tata-admin` (3002) — Manufacturer fleet/vehicle management
  - `portal-tata-public` (3003) — Public vehicle marketplace/showroom
  - `portal-wallet` (3004) — Credential holder wallet (consent, VCs)
  - `portal-insurance` (3005) — Insurance underwriting portal
  - `portal-company` (3006) — Company directory & admin
- **`packages/`** — Shared libraries: `auth` (Keycloak OIDC), `shared-types`, `ui-tokens`
- **`edc/tx-edc-eleven/`** — Helm chart for Tractus-X EDC connector instances (per-tenant values files)
- **`gitops/`** — Argo CD GitOps manifests for EDC tenant deployments

### Backend Key Areas

- **Routes** (`backend/src/routes/`) — REST endpoints: companies, cars, consent, credentials, edc, cadde, insurance, underwriting, wallet, verifier, vehicle-registry
- **Services** (`backend/src/services/`) — Core business logic:
  - `gaiax/` — Gaia-X compliance (DID creation, VC signing, GXDCH integration)
  - `did-resolver.ts` — DID document builder/resolver
  - `edcService.ts` / `edcConsumerService.ts` — EDC provider/consumer integration
  - `underwriting/` — Risk scoring engine (9-factor, 100-point scale)
  - `waltid.ts` — walt.id wallet/issuer/verifier API integration
  - `vp-processor.ts` — Verifiable Presentation processing
  - `dataservice-discovery.ts` — Endpoint discovery via DID resolution
- **Database** — Prisma schema at `backend/prisma/schema.prisma`

### External Services (docker-compose)

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5433 | Main database |
| Keycloak | 8080 | Identity & access management |
| walt.id Wallet API | 7001 | VC wallet operations |
| walt.id Issuer API | 7002 | Credential issuance |
| walt.id Verifier API | 7003 | Credential verification |
| HashiCorp Vault | n/a | To store secrets |
| Managed Identity Wallets | n/a | To store VCs of the dataspace participants |


### Authentication
- All APIs will be secured by token authentication using OAuth flow leveraging Keycloak.
- We have integrated Keycloak SDK in the UI and OAuth based token verification in the backend services
- For inter-process communication (backend -> provisioning), we are using `client_credentials` flow
- Raise a flag if you find any security issues

### Deployment

- All applications are deployed in the Kubernetes cluster using Helm charts
- We are using ArgoCD 
- We are using two external (hosted) services: Managed Identity Wallets and HashiCorp Vault
- We are using GitOps and ArgoCD Application for dynamic provisioning of EDC for dataspace participants

### EDC Tenant Onboarding

New EDC tenants are onboarded by: creating a Helm values file in `edc/tx-edc-eleven/`, provisioning database + Vault secrets via the provisioning service, and deploying via Argo CD gitops. Tenant values files follow the pattern `values-{company-slug}.yaml`.

## Configuration

- Please check `backend/.env.example` file

## Non-functional requirements

- All services will be deployed on Kubernetes
- Make sure we are doing code changes as per best practice of NodeJs
- Consider to add comment and logs for critical flow and code
- Make sure we follow SOLID and DRY principles while doing code
- Do not push code by yourself, instead generate commit message if asked for
- Never read .env file
- If you are adding/removing any new envs, please do not forget to modify .env.example file and main README.md file, also check helm chart update values.yaml file as well


## Common Commands

### Development
```bash
npm install                    # Install all workspace dependencies
docker compose up -d           # Start infrastructure (Postgres, Keycloak, walt.id services)
npm run dev                    # Run all services concurrently (backend + all portals + provisioning)
npm run dev:backend            # Backend only (Express on port 8000)
npm run dev:dataspace          # Single portal (replace with dev:admin, dev:public, dev:wallet, dev:insurance, dev:company)
```

### Backend Database (Prisma)
```bash
cd backend
npx prisma migrate dev         # Create/apply dev migrations
npx prisma migrate deploy      # Apply pending migrations (production)
npx prisma generate            # Regenerate Prisma client after schema changes
npx prisma migrate reset --force  # Reset DB and re-seed
ts-node prisma/seed.ts         # Seed data
```

### Testing
```bash
npm test                       # Run all tests (Jest, from root)
npm test -- --testPathPattern=tests/gaiax  # Run only Gaia-X tests
npm run test:gaiax             # Shortcut for Gaia-X tests
```

### Build
```bash
npm run build                  # Build all workspaces
```

### Scripts
```bash
npx ts-node scripts/verify-gaiax.ts        # Verify Gaia-X compliance
npx ts-node scripts/seed-org-credential.ts  # Seed organization credentials
```

## Key Technologies

Eclipse Tractus-X - Dataspace framework
Eclipse Dataspace Connector (EDC) - Secure data exchange between participants
Gaia-X Verifiable Credentials - Trust and identity for dataspace participants
walt.id Wallet - User wallet for storing and sharing Verifiable Credentials
Verifiable Presentations (VP) - Proof of ownership shared by the user
Verifiable Credentials  (VC) - Proof of ownership stored in the user wallet
Digital Twins - Virtual representation of car models
Kubernetes - Infrastructure for deploying EDC connectors