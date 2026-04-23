#!/usr/bin/env bash
# PSON5 · one-command Neo4j launcher
#
# Starts a local Neo4j 5 container, waits for it to become healthy, wires
# up the PSON5 CLI to point at it, and opens Neo4j Browser.
#
# Requires: Docker Desktop (or an equivalent docker daemon) on PATH.
#
# After it finishes, run:
#   node scripts/sync-profile-to-neo4j.mjs <path-to-profile.json>
# to push a .pson profile into the instance.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "${SCRIPT_DIR}/.." && pwd )"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.neo4j.yml"

NEO4J_URI="${PSON_NEO4J_URI:-bolt://localhost:7687}"
NEO4J_USER="${PSON_NEO4J_USERNAME:-neo4j}"
NEO4J_PASS="${PSON_NEO4J_PASSWORD:-pson5-local-dev}"
STORE_DIR="${PSON_STORE_DIR:-${REPO_ROOT}/.pson5-store}"

echo "▶ checking prerequisites"
if ! command -v docker >/dev/null 2>&1; then
  cat <<'EOF' >&2

Docker was not found on PATH.
  - Install Docker Desktop: https://www.docker.com/products/docker-desktop
  - Or use Neo4j Aura's free cloud tier: https://neo4j.com/cloud/aura-free/
  - Or skip Neo4j entirely and open examples/claude-driven-persona/output/graph.html
    in any browser — same graph, zero setup.

EOF
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "✖ docker is installed but the daemon is not reachable. Start Docker Desktop and retry." >&2
  exit 1
fi

echo "▶ launching Neo4j (this pulls ~700MB the first time)"
docker compose -f "${COMPOSE_FILE}" up -d

echo "▶ waiting for Neo4j to become ready"
READY=0
for i in $(seq 1 60); do
  if docker compose -f "${COMPOSE_FILE}" ps --format json 2>/dev/null | grep -q '"Health":"healthy"' \
     || curl -sf http://localhost:7474 >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done

if [ "${READY}" -ne 1 ]; then
  echo "✖ Neo4j did not become healthy within 120s. Check: docker compose -f ${COMPOSE_FILE} logs" >&2
  exit 1
fi

echo "▶ wiring PSON5 to the new instance"
mkdir -p "${STORE_DIR}"
CONFIG_DIR="${STORE_DIR}/config"
mkdir -p "${CONFIG_DIR}"
cat > "${CONFIG_DIR}/neo4j.json" <<EOF
{
  "uri": "${NEO4J_URI}",
  "username": "${NEO4J_USER}",
  "password": "${NEO4J_PASS}",
  "database": null,
  "enabled": true
}
EOF

echo ""
echo "  Neo4j Browser    http://localhost:7474"
echo "  Credentials      ${NEO4J_USER} / ${NEO4J_PASS}"
echo "  Bolt URI         ${NEO4J_URI}"
echo "  Store dir        ${STORE_DIR}"
echo ""
echo "▶ next step — sync a profile:"
echo "  node scripts/sync-profile-to-neo4j.mjs examples/claude-driven-persona/output/profile.json"
echo ""
echo "▶ or stop and remove:"
echo "  docker compose -f scripts/docker-compose.neo4j.yml down"
