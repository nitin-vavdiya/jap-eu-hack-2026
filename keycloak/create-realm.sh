#!/bin/bash
# Fallback script to create the Keycloak realm via Admin REST API
# Usage: ./create-realm.sh

KEYCLOAK_URL="http://localhost:8080"
ADMIN_USER="admin"
ADMIN_PASSWORD="admin"
REALM="eu-jap-hack"

echo "Getting admin token..."
TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASSWORD}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

if [ -z "$TOKEN" ]; then
  echo "Failed to get admin token. Is Keycloak running?"
  exit 1
fi

echo "Creating realm ${REALM}..."
curl -s -X POST "${KEYCLOAK_URL}/admin/realms" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d @keycloak/realm-export.json

echo ""
echo "Realm ${REALM} created successfully!"
echo ""
echo "Test users:"
echo "  tata-admin / tata-admin (role: admin)"
echo "  mario-sanchez / mario (role: customer)"
echo "  digit-agent / digit (role: insurance_agent)"
echo "  company-admin / company (role: company_admin)"
