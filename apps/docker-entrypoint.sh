#!/bin/sh
set -e

# Generate runtime config from environment variables
cat > /usr/share/nginx/html/config.js <<EOF
window.__CONFIG__ = {
  KEYCLOAK_URL: "${VITE_KEYCLOAK_URL:-http://localhost:8080}",
  KEYCLOAK_REALM: "${VITE_KEYCLOAK_REALM:-eu-jap-hack}",
  API_BASE_URL: "${VITE_API_BASE_URL:-http://localhost:8000/api}",
  PORTAL_DATASPACE_URL: "${VITE_PORTAL_DATASPACE_URL:-http://localhost:3001}",
  PORTAL_WALLET_URL: "${VITE_PORTAL_WALLET_URL:-http://localhost:3004}",
  PORTAL_COMPANY_URL: "${VITE_PORTAL_COMPANY_URL:-http://localhost:3006}"
};
EOF

exec nginx -g "daemon off;"
