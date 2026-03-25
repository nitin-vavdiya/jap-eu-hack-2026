#!/usr/bin/env bash
set -euo pipefail

REGISTRY="public.ecr.aws/smartsensesolutions"
REPO="eu-jap-hack"
VERSION="${VERSION:-1.0.22}"

echo "==> Logging in to ECR Public..."
aws ecr-public get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin "${REGISTRY}"

PORTAL_APPS=(
  portal-dataspace
  portal-tata-admin
  portal-tata-public
  portal-wallet
  portal-insurance
  portal-company
)

echo "==> Building portal images (version: ${VERSION})..."
for APP_NAME in "${PORTAL_APPS[@]}"; do
  echo "--> Building ${APP_NAME}..."
  docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --build-arg APP_NAME="${APP_NAME}" \
    -t "${REGISTRY}/${REPO}/${APP_NAME}:${VERSION}" \
    -f apps/Dockerfile \
    --push \
    .
done

echo "==> Building backend image (version: ${VERSION})..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "${REGISTRY}/${REPO}/backend:${VERSION}" \
  -f backend/Dockerfile \
  --push \
  .

echo "==> Building keycloak image (version: ${VERSION})..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "${REGISTRY}/${REPO}/keycloak:${VERSION}" \
  -f keycloak/Dockerfile \
  --push \
  keycloak/

echo "==> Building provisioning image (version: ${VERSION})..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "${REGISTRY}/${REPO}/provisioning:${VERSION}" \
  -f provisioning/Dockerfile \
  --push \
  provisioning/

echo "==> All images pushed successfully."
