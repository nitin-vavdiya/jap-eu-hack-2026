# CI/CD

## 6. CI/CD Pipelines

Three workflows replace the single existing `docker-build-push.yml`:

### `ci.yml` — on PR + push to main
- Node 20 setup → `npm ci` → `npm test` (Jest unit tests only).
- No docker build, no ECR push.
- Fails if tests fail.

### `release-build.yml` — on tag `refs/tags/<app>-v*`
- Parse tag: `backend-v1.2.3` → `app=backend`, `version=1.2.3`.
- Lookup table: `app` → Dockerfile path + build context + build args.
  - `backend` → `backend/Dockerfile`
  - `portal-<name>` → `apps/Dockerfile` with `APP_NAME=portal-<name>`
  - `keycloak` → `keycloak/Dockerfile`
  - `provisioning` → `provisioning/Dockerfile`
- Configure AWS creds → ECR Public login → `docker buildx` multi-arch (amd64 + arm64) → push `public.ecr.aws/<ns>/<app>:<version>` and `:latest`.
- Authorization: same `ALLOWED_ACTORS` gate as current workflow (actor must be in allowlist).
- Post-push: open PR bumping `helm/app-chart/values-dev.yaml` at `<app>.image.tag = <version>` (redundant fallback/audit trail alongside Argo Image Updater).

### `promote.yml` — `workflow_dispatch`
Inputs: `env` (`qa|prod`), `app`, `version`.
- Validate: image tag exists in ECR.
- Open PR bumping `helm/app-chart/values-<env>.yaml`.
- PR title: `promote(<env>): <app> → <version>`.
- Merge → Argo syncs that env.

### Tag convention
`<app>-v<semver>`. Valid apps: `backend`, `portal-dataspace`, `portal-tata-admin`, `portal-tata-public`, `portal-wallet`, `portal-insurance`, `portal-company`, `keycloak`, `provisioning`.

### Secrets
**Retained:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ECR_REGISTRY`, `ECR_NAMESPACE`, `ALLOWED_ACTORS`.
**New:** `GH_PAT_VALUES_WRITE` — PAT with `contents:write` + `pull-requests:write` scope on this repo, used by bump-PR steps.

### Deprecation
Existing `docker-build-push.yml` kept for one release cycle (fallback), then deleted.

## Developer workflow

1. Cut feature branch, push, open PR to `main`.
2. CI runs unit tests + helm lint + actionlint.
3. Merge to main.
4. Tag a release: `git tag backend-v1.2.3 && git push origin backend-v1.2.3`.
5. GitHub Actions builds multi-arch image, pushes to ECR Public.
6. Workflow opens an auto-PR bumping `values-dev.yaml`.
7. Merge the bump PR → Argo CD syncs dev.
8. Verify at `https://api.dev.dataspace.smartsenselabs.com/api/health`.
9. Promote to qa:
   - In GitHub → Actions → "Promote to Env" → Run workflow.
   - env=`qa`, app=`backend`, version=`1.2.3`.
   - Review the opened PR, merge.
10. Same for prod, but **manually trigger sync in Argo UI** (prod has auto-sync off).
