# DevOps

Covers local development setup, Docker configuration, Kubernetes deployment via Helm, and the build pipeline.

---

## Table of Contents

- [Local Development](#local-development)
- [Docker](#docker)
- [Build & Push](#build--push)
- [Helm & Kubernetes](#helm--kubernetes)
- [Production Environment](#production-environment)
- [TLS & Ingress](#tls--ingress)

---

## Local Development

All services run via Docker Compose. No need to install databases or external services locally.

### Start everything

```bash
docker compose up -d
```

This starts:

| Service | Port | Notes |
|---|---|---|
| `postgres` | 5432 | Database, auto-initialized |
| `keycloak` | 8080 | Realm `eu-jap-hack` auto-imported |
| `waltid-wallet-api` | 7001 | |
| `waltid-issuer-api` | 7002 | |
| `waltid-verifier-api` | 7003 | |
| `backend` | 8000 | Runs migrations + seed on start |
| `portal-dataspace` | 3001 | |
| `portal-tata-admin` | 3002 | |
| `portal-tata-public` | 3003 | |
| `portal-wallet` | 3004 | |
| `portal-insurance` | 3005 | |
| `portal-company` | 3006 | |

### Stop everything

```bash
docker compose down
# To also remove volumes (database data):
docker compose down -v
```

### View logs

```bash
docker compose logs -f backend
docker compose logs -f portal-insurance
```

### Run backend outside Docker (for faster iteration)

```bash
# Start only infrastructure services
docker compose up -d postgres keycloak waltid-wallet-api waltid-issuer-api waltid-verifier-api

# Run backend locally
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

---

## Docker

### Backend Dockerfile

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY packages/ ./packages/
RUN npm ci
COPY backend/ ./backend/
RUN npm run build --workspace=backend

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY backend/docker-entrypoint.sh ./
EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
```

`docker-entrypoint.sh`:
```bash
#!/bin/sh
npx prisma migrate deploy
npx prisma db seed
node dist/index.js
```

### Frontend Dockerfile (shared across all 6 portals)

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
ARG APP_NAME
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build --workspace=apps/${APP_NAME}

# Stage 2: Serve
FROM nginx:alpine
ARG APP_NAME
COPY --from=builder /app/apps/${APP_NAME}/dist /usr/share/nginx/html
COPY apps/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
```

The `APP_NAME` build arg selects which portal to build. One Dockerfile serves all 6 portals.

### nginx configuration

All portals use SPA routing — unknown paths fall back to `index.html`:

```nginx
location / {
    root   /usr/share/nginx/html;
    index  index.html;
    try_files $uri $uri/ /index.html;
}
```

### Runtime configuration injection

`docker-entrypoint.sh` generates `config.js` from environment variables before nginx starts:

```bash
cat > /usr/share/nginx/html/config.js << EOF
window.__CONFIG__ = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL:-http://localhost:8000/api}",
  VITE_KEYCLOAK_URL: "${VITE_KEYCLOAK_URL:-http://localhost:8080}",
  VITE_KEYCLOAK_REALM: "${VITE_KEYCLOAK_REALM:-eu-jap-hack}",
  VITE_PORTAL_WALLET_URL: "${VITE_PORTAL_WALLET_URL:-http://localhost:3004}",
  VITE_PORTAL_INSURANCE_URL: "${VITE_PORTAL_INSURANCE_URL:-http://localhost:3005}"
};
EOF
```

This allows the same image to be used across all environments by just changing env vars.

---

## Build & Push

`build-and-push.sh` builds multi-arch images and pushes to AWS ECR Public.

```bash
./build-and-push.sh
```

**What it does:**

1. For each portal (`portal-dataspace`, `portal-tata-admin`, etc.):
   ```bash
   docker buildx build \
     --platform linux/amd64,linux/arm64 \
     --build-arg APP_NAME=${APP_NAME} \
     -t public.ecr.aws/smartsensesolutions/eu-jap-hack/${APP_NAME}:${TAG} \
     -f apps/Dockerfile \
     --push .
   ```

2. Builds the backend image:
   ```bash
   docker buildx build \
     --platform linux/amd64,linux/arm64 \
     -t public.ecr.aws/smartsensesolutions/eu-jap-hack/backend:${TAG} \
     -f backend/Dockerfile \
     --push .
   ```

**Prerequisites:**
- Docker Buildx with multi-platform support enabled
- AWS credentials with push access to ECR Public
- `docker login public.ecr.aws`

**Current tag:** `1.0.7` (update `TAG` variable in the script to bump)

---

## Helm & Kubernetes

The Helm chart at `helm/eu-jap-hack/` deploys all services to Kubernetes.

### Chart structure

```
helm/eu-jap-hack/
├── Chart.yaml
├── values.yaml              Default values
├── values-custom.yaml       Production overrides
└── templates/
    ├── backend-deployment.yaml
    ├── backend-service.yaml
    ├── backend-ingress.yaml
    ├── backend-secret.yaml
    ├── portal-deployment.yaml
    ├── portal-service.yaml
    ├── portal-ingress.yaml
    ├── waltid-deployment.yaml
    ├── waltid-service.yaml
    ├── waltid-configmap.yaml
    └── _helpers.tpl
```

### Deploy

```bash
# Install
helm install eu-jap-hack ./helm/eu-jap-hack \
  -f helm/eu-jap-hack/values-custom.yaml \
  --namespace eu-jap-hack \
  --create-namespace

# Upgrade (bump image tags, change config)
helm upgrade eu-jap-hack ./helm/eu-jap-hack \
  -f helm/eu-jap-hack/values-custom.yaml \
  --namespace eu-jap-hack

# Uninstall
helm uninstall eu-jap-hack --namespace eu-jap-hack
```

### Key values (values-custom.yaml)

```yaml
backend:
  image: public.ecr.aws/smartsensesolutions/eu-jap-hack/backend:1.0.7
  replicas: 1
  env:
    DATABASE_URL: postgresql://user:pass@db:5432/eu_jap_hack
    AUTH_ENABLED: "false"
    ENABLE_EDC: "true"
    KEYCLOAK_URL: https://centralidp.tx.the-sense.io/auth
    EDC_BASE_URL: https://tata-motors-controlplane.tx.the-sense.io
    EDC_API_KEY: tata-motors
    CADDE_ASSET_ID: asset_7

portalDataspace:
  image: public.ecr.aws/smartsensesolutions/eu-jap-hack/portal-dataspace:1.0.7
  env:
    VITE_API_BASE_URL: https://jeh-api.tx.the-sense.io/api
    VITE_KEYCLOAK_URL: https://centralidp.tx.the-sense.io/auth
    VITE_KEYCLOAK_REALM: eu-jap-hack

# Similar blocks for portalTataAdmin, portalTataPublic,
# portalWallet, portalInsurance, portalCompany
```

### Secrets

Sensitive values (database passwords, API keys) are stored in Kubernetes Secrets via `backend-secret.yaml`. The template reads from `values.yaml` and creates a `Secret` resource.

```bash
# Verify secrets are set
kubectl get secret eu-jap-hack-backend -n eu-jap-hack -o jsonpath='{.data}' | base64 -d
```

### walt.id in Kubernetes

walt.id services use a ConfigMap for their configuration files:

```bash
# View current walt.id config
kubectl get configmap eu-jap-hack-waltid-config -n eu-jap-hack -o yaml
```

---

## Production Environment

Production domain: `*.tx.the-sense.io`

| Service | URL |
|---|---|
| Backend API | https://jeh-api.tx.the-sense.io |
| Dataspace Portal | https://jeh-dataspace.tx.the-sense.io |
| TATA Admin | https://jeh-admin.tx.the-sense.io |
| Public Showroom | https://jeh-public.tx.the-sense.io |
| Wallet | https://jeh-wallet.tx.the-sense.io |
| Insurance | https://jeh-insurance.tx.the-sense.io |
| Company Directory | https://jeh-company.tx.the-sense.io |
| Keycloak | https://centralidp.tx.the-sense.io/auth |
| EDC (TATA Provider) | https://tata-motors-controlplane.tx.the-sense.io |
| EDC (Consumer) | https://nissan-motors-controlplane.tx.the-sense.io |

**Key production differences from dev:**
- `AUTH_ENABLED=true` — Real Keycloak JWT validation
- `GAIAX_MOCK_MODE=false` — Real GXDCH endpoints
- TLS everywhere (cert-manager + Let's Encrypt)
- External Keycloak and PostgreSQL (not in-cluster)

---

## TLS & Ingress

TLS certificates are managed by cert-manager with Let's Encrypt.

**Ingress annotations (in templates):**

```yaml
annotations:
  kubernetes.io/ingress.class: nginx
  cert-manager.io/cluster-issuer: letsencrypt-prod
  nginx.ingress.kubernetes.io/ssl-redirect: "true"
```

**Certificate resources** are automatically created by cert-manager when the Ingress is applied. Certificates auto-renew before expiry.

```bash
# Check certificate status
kubectl get certificates -n eu-jap-hack
kubectl describe certificate jeh-api-tls -n eu-jap-hack
```

> **Note:** External Keycloak and the external PostgreSQL database are deployed and managed separately from this Helm chart. See project memory for deployment details.
