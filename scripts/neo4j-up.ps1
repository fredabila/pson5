# PSON5 · one-command Neo4j launcher (Windows PowerShell)
#
# Starts a local Neo4j 5 container, waits for it to become healthy, wires
# up the PSON5 CLI to point at it.
#
# Requires: Docker Desktop on PATH.
#
# After it finishes, run:
#   node scripts\sync-profile-to-neo4j.mjs <path-to-profile.json>

param(
  [string]$Uri = $env:PSON_NEO4J_URI,
  [string]$User = $env:PSON_NEO4J_USERNAME,
  [string]$Password = $env:PSON_NEO4J_PASSWORD,
  [string]$StoreDir = $env:PSON_STORE_DIR
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Split-Path -Parent $scriptDir
$composeFile = Join-Path $scriptDir "docker-compose.neo4j.yml"

if (-not $Uri) { $Uri = "bolt://localhost:7687" }
if (-not $User) { $User = "neo4j" }
if (-not $Password) { $Password = "pson5-local-dev" }
if (-not $StoreDir) { $StoreDir = Join-Path $repoRoot ".pson5-store" }

Write-Host "▶ checking prerequisites"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "Docker was not found on PATH." -ForegroundColor Red
  Write-Host "  - Install Docker Desktop: https://www.docker.com/products/docker-desktop"
  Write-Host "  - Or use Neo4j Aura's free cloud tier: https://neo4j.com/cloud/aura-free/"
  Write-Host "  - Or skip Neo4j entirely and open examples\claude-driven-persona\output\graph.html"
  Write-Host "    in any browser — same graph, zero setup."
  Write-Host ""
  exit 1
}

try { docker info *> $null } catch {
  Write-Host "✖ docker is installed but the daemon is not reachable. Start Docker Desktop and retry." -ForegroundColor Red
  exit 1
}

Write-Host "▶ launching Neo4j (this pulls ~700MB the first time)"
docker compose -f $composeFile up -d

Write-Host "▶ waiting for Neo4j to become ready"
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:7474" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}

if (-not $ready) {
  Write-Host "✖ Neo4j did not become healthy within 120s. Check: docker compose -f $composeFile logs" -ForegroundColor Red
  exit 1
}

Write-Host "▶ wiring PSON5 to the new instance"
$configDir = Join-Path $StoreDir "config"
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
@{
  uri = $Uri
  username = $User
  password = $Password
  database = $null
  enabled = $true
} | ConvertTo-Json | Set-Content (Join-Path $configDir "neo4j.json")

Write-Host ""
Write-Host "  Neo4j Browser    http://localhost:7474"
Write-Host "  Credentials      $User / $Password"
Write-Host "  Bolt URI         $Uri"
Write-Host "  Store dir        $StoreDir"
Write-Host ""
Write-Host "▶ next step — sync a profile:"
Write-Host "  node scripts\sync-profile-to-neo4j.mjs examples\claude-driven-persona\output\profile.json"
Write-Host ""
Write-Host "▶ or stop and remove:"
Write-Host "  docker compose -f scripts\docker-compose.neo4j.yml down"
