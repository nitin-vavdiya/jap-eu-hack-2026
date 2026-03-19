# EU-Japan Dataspace Hackathon 2026

A full-stack dataspace application demonstrating cross-border vehicle data exchange between EU and Japan, built on Gaia-X trust framework, Eclipse Dataspace Connector (EDC), and Verifiable Credentials (W3C).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend Portals                            │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┤
│Dataspace │  TATA    │  TATA    │  Wallet  │Insurance │  Company     │
│ Registry │  Admin   │  Public  │          │          │  Registry    │
│  :3001   │  :3002   │  :3003   │  :3004   │  :3005   │   :3006      │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┴──────┬───────┘
     │          │          │          │          │            │
     └──────────┴──────────┴────┬─────┴──────────┴────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    Backend API :8000   │
                    │   (Express + Prisma)   │
                    └──┬────────┬────────┬──┘
                       │        │        │
              ┌────────▼──┐ ┌──▼─────┐ ┌▼──────────┐
              │ PostgreSQL │ │Keycloak│ │  Walt.id   │
              │   :5432    │ │ :8080  │ │ SSI Stack  │
              └────────────┘ └────────┘ └────────────┘
                                         ┌──────────┐
                                         │   EDC    │
                                         │Connector │
                                         └──────────┘
```

## Applications

| Application | Port | Description |
|---|---|---|
| **Backend API** | 8000 | Express.js API with Prisma ORM, Gaia-X compliance, EDC integration |
| **Portal Dataspace** | 3001 | Organization registry, Gaia-X credential management |
| **Portal TATA Admin** | 3002 | Fleet management, vehicle DPP creation, inventory |
| **Portal TATA Public** | 3003 | Digital showroom, car marketplace for buyers |
| **Portal Wallet** | 3004 | Digital identity wallet, credential storage, DPP viewer |
| **Portal Insurance** | 3005 | Smart vehicle coverage, consent-based data access |
| **Portal Company** | 3006 | Company directory, organization credential viewer |
| **Keycloak** | 8080 | OAuth2/OIDC identity provider |
| **Walt.id Wallet API** | 7001 | SSI wallet for Verifiable Credentials |
| **Walt.id Issuer API** | 7002 | OID4VCI credential issuance |
| **Walt.id Verifier API** | 7003 | OID4VP credential verification |

## Tech Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **Backend:** Express.js + TypeScript + Prisma ORM
- **Database:** PostgreSQL 16
- **Auth:** Keycloak 26 (OAuth2/OIDC)
- **SSI:** Walt.id (OID4VCI/OID4VP), W3C Verifiable Credentials
- **Trust Framework:** Gaia-X Loire (compliance, notary, registry)
- **Dataspace:** Eclipse Dataspace Connector (EDC) — Tractus-X
- **Infra:** Docker, Helm, HAProxy Ingress, cert-manager (Let's Encrypt)

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)

### 1. Start infrastructure

```bash
docker compose up keycloak waltid-wallet-api waltid-issuer-api waltid-verifier-api postgres -d
```

### 2. Install dependencies

```bash
npm install
```

### 3. Setup database

```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

### 4. Start all services

```bash
npm run dev
```

This starts the backend and all 6 portals concurrently.

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET/POST /api/cars` | Vehicle inventory (CRUD) |
| `GET/POST /api/companies` | Organization management |
| `GET/POST /api/credentials` | Credential issuance & resolution |
| `GET/POST /api/consent` | Data access consent workflow |
| `GET/POST /api/insurance` | Insurance policy issuance |
| `GET/POST /api/wallet/:userId` | User wallet & credentials |
| `GET/POST /api/purchases` | Vehicle purchase transactions |
| `POST /api/vc/issue` | Issue VC via Walt.id |
| `POST /api/vc/verify` | Verify VP via Walt.id |
| `GET/POST /api/org-credentials` | Gaia-X Legal Participant credentials |
| `POST /api/edc/negotiate` | EDC contract negotiation & data fetch |
| `GET /vc/:id` | Public VC resolution (Legal Participant) |
| `GET /.well-known/did.json` | DID document for did:web resolution |

## Keycloak Roles

| Role | Portal | Description |
|---|---|---|
| `admin` | TATA Admin | Fleet management, vehicle creation |
| `customer` | Public / Wallet | Car purchases, wallet access |
| `insurance_agent` | Insurance | Policy issuance, consent requests |
| `company_admin` | Dataspace / Company | Organization registration, Gaia-X verification |

## Database

PostgreSQL with Prisma ORM. Schema includes:

- **companies** — Registered organizations
- **credentials** — Verifiable Credentials (OrgVC, OwnershipVC, InsuranceVC, SelfVC)
- **cars** — Vehicle inventory with Digital Product Passport (DPP)
- **wallets / wallet_credentials** — Per-user credential storage
- **consents** — Data access consent workflow
- **purchases** — Vehicle purchase records
- **insurance_policies** — Insurance policy records
- **org_credentials** — Gaia-X Legal Participant credentials & compliance

### Migrations & Seeding

```bash
cd backend
npx prisma migrate dev        # Create/apply migrations (dev)
npx prisma migrate deploy     # Apply migrations (production)
npx prisma db seed             # Seed demo data
```

## Docker

### Build all images

```bash
./scripts/build-and-push.sh
```

### Build a single image

```bash
./scripts/build-and-push.sh backend
./scripts/build-and-push.sh portal-wallet
```

### Custom tag

```bash
IMAGE_TAG=2.0.0 ./scripts/build-and-push.sh
```

### ECR Repositories

| Repository |
|---|
| `public.ecr.aws/smartsensesolutions/eu-jap-hack/backend` |
| `public.ecr.aws/smartsensesolutions/eu-jap-hack/portal-dataspace` |
| `public.ecr.aws/smartsensesolutions/eu-jap-hack/portal-tata-admin` |
| `public.ecr.aws/smartsensesolutions/eu-jap-hack/portal-tata-public` |
| `public.ecr.aws/smartsensesolutions/eu-jap-hack/portal-wallet` |
| `public.ecr.aws/smartsensesolutions/eu-jap-hack/portal-insurance` |
| `public.ecr.aws/smartsensesolutions/eu-jap-hack/portal-company` |

## Kubernetes Deployment

Helm chart located at `helm/eu-jap-hack/`.

### Install

```bash
helm install eu-jap-hack ./helm/eu-jap-hack -f your-values.yaml
```

### Example values

```yaml
global:
  imageRegistry: "public.ecr.aws/smartsensesolutions"

tls:
  enabled: true
  clusterIssuer: letsencrypt-prod

ingressClassName: haproxy

backend:
  ingress:
    host: api.yourdomain.com
  env:
    DATABASE_URL: "postgresql://user:pass@db-host:5432/eu_jap_hack"

portalDataspace:
  ingress:
    host: dataspace.yourdomain.com

portalTataAdmin:
  ingress:
    host: admin.yourdomain.com

portalTataPublic:
  ingress:
    host: public.yourdomain.com

portalWallet:
  ingress:
    host: wallet.yourdomain.com

portalInsurance:
  ingress:
    host: insurance.yourdomain.com

portalCompany:
  ingress:
    host: company.yourdomain.com

keycloak:
  ingress:
    host: auth.yourdomain.com
```

### Features

- HAProxy Ingress with TLS (cert-manager / Let's Encrypt)
- Per-service ingress with individual TLS certificates
- ConfigMap-based Walt.id configuration
- Keycloak realm auto-import
- Backend secrets for DATABASE_URL
- No database dependency in chart (external PostgreSQL)

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `AUTH_ENABLED` | Enable Keycloak auth | `false` |
| `ENABLE_EDC` | Enable EDC integration | `true` |
| `GAIAX_DID_DOMAIN` | Domain for did:web DID | — |
| `GAIAX_DID_PATH` | Path segment for did:web | — |
| `EDC_BASE_URL` | EDC control plane URL | — |
| `EDC_API_KEY` | EDC API key | — |
| `APP_BASE_URL` | Public backend URL (for VC resolution) | — |
| `EDC_CONSUMER_MANAGEMENT_URL` | Consumer EDC management endpoint | — |
| `EDC_CONSUMER_API_KEY` | Consumer EDC API key | — |
| `EDC_PARTNER_BPN` | Partner Business Partner Number | — |
| `EDC_PARTNER_DSP_URL` | Partner DSP protocol endpoint | — |

## Project Structure

```
├── apps/
│   ├── portal-dataspace/       # Dataspace registry portal
│   ├── portal-tata-admin/      # TATA Motors admin portal
│   ├── portal-tata-public/     # TATA Motors public showroom
│   ├── portal-wallet/          # SmartSense wallet portal
│   ├── portal-insurance/       # Digit Insurance portal
│   ├── portal-company/         # Company registry portal
│   └── Dockerfile              # Shared frontend Dockerfile (ARG APP_NAME)
├── backend/
│   ├── src/                    # Express API source
│   ├── prisma/                 # Schema, migrations, seed
│   ├── Dockerfile
│   └── docker-entrypoint.sh    # Migrate + seed + start
├── packages/
│   ├── auth/                   # Shared auth (OIDC, roles, AuthProvider)
│   ├── shared-types/           # Shared TypeScript types
│   └── ui-tokens/              # Shared UI design tokens
├── helm/
│   └── eu-jap-hack/            # Helm chart (11 services, HAProxy ingress, TLS)
├── keycloak/                   # Realm export & themes
├── waltid/                     # Walt.id service configs
├── scripts/
│   └── build-and-push.sh       # Docker build & ECR push script
├── docker-compose.yml
└── package.json                # Root workspace config
```
