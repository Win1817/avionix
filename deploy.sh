#!/usr/bin/env bash
# AVIONIX — Deploy script
# Usage: ./deploy.sh [--with-simulator] [--build-only] [--down]

set -e

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'

WITH_SIM=false
BUILD_ONLY=false
BRING_DOWN=false

for arg in "$@"; do
  case $arg in
    --with-simulator) WITH_SIM=true ;;
    --build-only)     BUILD_ONLY=true ;;
    --down)           BRING_DOWN=true ;;
  esac
done

print_header() {
  echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"
}

if [ "$BRING_DOWN" = true ]; then
  print_header "Stopping AVIONIX stack"
  docker compose --profile simulator down -v
  echo -e "${GREEN}✓ Stack stopped and volumes removed${NC}"
  exit 0
fi

# Prereq check
[ -f .env ] || { echo -e "${RED}✗ .env not found. Run ./setup.sh first${NC}"; exit 1; }

print_header "Building AVIONIX images"
COMPOSE_CMD="docker compose"
[ "$WITH_SIM" = true ] && COMPOSE_CMD="docker compose --profile simulator"

$COMPOSE_CMD build --parallel
echo -e "${GREEN}✓ All images built${NC}"

[ "$BUILD_ONLY" = true ] && { echo -e "${GREEN}Build-only mode — done.${NC}"; exit 0; }

print_header "Starting infrastructure (Postgres, Redis, Kafka, Keycloak)"
$COMPOSE_CMD up -d postgres postgres-keycloak redis zookeeper kafka

echo -n "  Waiting for PostgreSQL..."
until docker compose exec -T postgres pg_isready -U avionix -q 2>/dev/null; do
  echo -n "."; sleep 3
done
echo -e " ${GREEN}✓${NC}"

echo -n "  Waiting for Kafka..."
until docker compose exec -T kafka kafka-topics --bootstrap-server localhost:9092 --list > /dev/null 2>&1; do
  echo -n "."; sleep 5
done
echo -e " ${GREEN}✓${NC}"

echo -n "  Starting Keycloak (may take ~90s)..."
$COMPOSE_CMD up -d keycloak
until curl -sf http://localhost:8080/health/ready > /dev/null 2>&1; do
  echo -n "."; sleep 5
done
echo -e " ${GREEN}✓${NC}"

print_header "Starting AVIONIX services"
$COMPOSE_CMD up -d \
  api-gateway data-ingest-service \
  fdps-service snet-service surveillance-service \
  coordination-service weather-service analytics-service ml-service

echo -n "  Waiting for API Gateway..."
until curl -sf http://localhost:4000/health > /dev/null 2>&1; do
  echo -n "."; sleep 3
done
echo -e " ${GREEN}✓${NC}"

print_header "Starting frontend & monitoring"
$COMPOSE_CMD up -d frontend kafka-ui prometheus grafana

if [ "$WITH_SIM" = true ]; then
  echo -e "\n${CYAN}Starting simulator...${NC}"
  $COMPOSE_CMD up -d simulator-service
  echo -e "${GREEN}✓ Simulator running${NC}"
fi

# Print status
print_header "AVIONIX Stack Status"
$COMPOSE_CMD ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           AVIONIX is ready!                          ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  ATC Dashboard   →  http://localhost:5173            ║${NC}"
echo -e "${GREEN}║  API Gateway     →  http://localhost:4000/health     ║${NC}"
echo -e "${GREEN}║  Keycloak Admin  →  http://localhost:8080/admin      ║${NC}"
echo -e "${GREEN}║  Kafka UI        →  http://localhost:8090            ║${NC}"
echo -e "${GREEN}║  Grafana         →  http://localhost:3000            ║${NC}"
[ "$WITH_SIM" = true ] && \
echo -e "${GREEN}║  Simulator       →  http://localhost:3009/health     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Next step — create your first controller:${NC}"
echo -e "  ${CYAN}./create-user.sh controller1 ATC_CONTROLLER${NC}"
echo ""
