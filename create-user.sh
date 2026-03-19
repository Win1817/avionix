#!/usr/bin/env bash
# AVIONIX — Create Keycloak user and assign role
# Usage: ./create-user.sh <username> <role> [password]
# Roles: SUPER_ADMIN ATC_SUPERVISOR ATC_CONTROLLER ATC_TRAINEE PILOT OPERATIONS_MANAGER SAFETY_OFFICER DATA_ANALYST SYSTEM_MONITOR

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'

USERNAME=${1:-}
ROLE=${2:-ATC_CONTROLLER}
PASSWORD=${3:-}

VALID_ROLES="SUPER_ADMIN ATC_SUPERVISOR ATC_CONTROLLER ATC_TRAINEE PILOT OPERATIONS_MANAGER SAFETY_OFFICER DATA_ANALYST SYSTEM_MONITOR"

[ -z "$USERNAME" ] && { echo -e "${RED}Usage: ./create-user.sh <username> <role> [password]${NC}"; echo "Roles: $VALID_ROLES"; exit 1; }
echo "$VALID_ROLES" | grep -q "$ROLE" || { echo -e "${RED}Invalid role: $ROLE${NC}\nValid roles: $VALID_ROLES"; exit 1; }

# Load admin password from .env
source .env 2>/dev/null || true
KC_ADMIN_PASS=${KEYCLOAK_ADMIN_PASSWORD:-admin}
KC_URL=http://localhost:8080

# Generate password if not provided
if [ -z "$PASSWORD" ]; then
  PASSWORD=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 12)
  SHOW_PASS=true
fi

echo -e "${CYAN}Creating user: ${USERNAME} with role: ${ROLE}${NC}"

# Get admin token
TOKEN=$(curl -sf -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli&grant_type=password&username=admin&password=${KC_ADMIN_PASS}" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

[ -z "$TOKEN" ] && { echo -e "${RED}✗ Failed to get admin token. Is Keycloak running? (http://localhost:8080)${NC}"; exit 1; }

# Create user
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${KC_URL}/admin/realms/avionix/users" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"${USERNAME}\",
    \"email\": \"${USERNAME}@avionix.local\",
    \"enabled\": true,
    \"emailVerified\": true,
    \"credentials\": [{\"type\": \"password\", \"value\": \"${PASSWORD}\", \"temporary\": false}]
  }")

[ "$HTTP_CODE" != "201" ] && [ "$HTTP_CODE" != "200" ] && {
  echo -e "${RED}✗ Failed to create user (HTTP $HTTP_CODE). User may already exist.${NC}"; exit 1;
}

# Get user ID
USER_ID=$(curl -sf "${KC_URL}/admin/realms/avionix/users?username=${USERNAME}" \
  -H "Authorization: Bearer ${TOKEN}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# Get role ID
ROLE_DATA=$(curl -sf "${KC_URL}/admin/realms/avionix/roles/${ROLE}" \
  -H "Authorization: Bearer ${TOKEN}")
ROLE_ID=$(echo "$ROLE_DATA" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# Assign role
curl -sf -X POST "${KC_URL}/admin/realms/avionix/users/${USER_ID}/role-mappings/realm" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "[{\"id\":\"${ROLE_ID}\",\"name\":\"${ROLE}\"}]" > /dev/null

echo -e "${GREEN}✓ User created and role assigned${NC}"
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Username:  ${USERNAME}${NC}"
echo -e "${GREEN}║  Role:      ${ROLE}${NC}"
[ "${SHOW_PASS:-false}" = true ] && \
echo -e "${GREEN}║  Password:  ${PASSWORD}${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "Login at: ${CYAN}http://localhost:5173${NC}"
