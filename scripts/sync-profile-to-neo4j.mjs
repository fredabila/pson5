#!/usr/bin/env node
/**
 * PSON5 · sync a .pson profile into Neo4j.
 *
 * Usage:
 *   node scripts/sync-profile-to-neo4j.mjs <path-to-profile.json> [--store <dir>]
 *
 * Reads credentials from env first, then from <store>/config/neo4j.json
 * (which the neo4j-up scripts populate automatically):
 *
 *   PSON_NEO4J_URI        bolt://… or neo4j+s://…
 *   PSON_NEO4J_USERNAME
 *   PSON_NEO4J_PASSWORD
 *   PSON_NEO4J_DATABASE   (optional — defaults to the server default)
 *
 * The sync is idempotent: previous profile-scoped nodes are detached and
 * rewritten with the current graph in a single transaction.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  getStoredNeo4jConfig,
  getNeo4jStatus,
  syncKnowledgeGraphToNeo4j
} from "../packages/neo4j-store/dist/neo4j-store/src/index.js";

function parseArgs(argv) {
  const args = argv.slice(2);
  let profilePath = null;
  let storeDir = path.resolve(".pson5-store");
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--store") {
      storeDir = path.resolve(args[i + 1] ?? storeDir);
      i += 1;
    } else if (!profilePath) {
      profilePath = arg;
    }
  }
  if (!profilePath) {
    console.error("Usage: node scripts/sync-profile-to-neo4j.mjs <path-to-profile.json> [--store <dir>]");
    process.exit(1);
  }
  return { profilePath: path.resolve(profilePath), storeDir };
}

function readProfile(profilePath) {
  if (!existsSync(profilePath)) {
    throw new Error(`profile file not found: ${profilePath}`);
  }
  const raw = readFileSync(profilePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`profile at ${profilePath} is not valid JSON: ${error.message}`);
  }
}

async function main() {
  const { profilePath, storeDir } = parseArgs(process.argv);
  const storeOptions = { rootDir: storeDir };

  console.log(`▶ profile:     ${profilePath}`);
  console.log(`▶ store dir:   ${storeDir}`);

  const profile = readProfile(profilePath);
  if (!profile.profile_id || !profile.knowledge_graph) {
    throw new Error("profile is missing profile_id or knowledge_graph — is this really a .pson export?");
  }
  const nodeCount = profile.knowledge_graph.nodes?.length ?? 0;
  const edgeCount = profile.knowledge_graph.edges?.length ?? 0;
  console.log(`▶ profile_id:  ${profile.profile_id}`);
  console.log(`▶ graph:       ${nodeCount} nodes · ${edgeCount} edges`);

  const stored = getStoredNeo4jConfig(storeOptions);
  console.log(`▶ config path: ${stored.path}`);
  console.log(`▶ source:      ${stored.source}`);

  console.log("▶ checking connectivity");
  const status = await getNeo4jStatus(storeOptions);
  if (!status.configured) {
    throw new Error(
      `Neo4j is not configured. Either set PSON_NEO4J_URI / _USERNAME / _PASSWORD env vars, or run scripts/neo4j-up.sh first. Reason: ${status.reason ?? "unknown"}`
    );
  }
  if (!status.connected) {
    throw new Error(`Neo4j is unreachable: ${status.reason ?? "no detail"}`);
  }
  console.log(`▶ connected:   ${status.uri}${status.database ? ` · ${status.database}` : ""}`);

  console.log("▶ syncing");
  const result = await syncKnowledgeGraphToNeo4j(profile, storeOptions);
  console.log("");
  console.log(`✓ synced       ${result.node_count} nodes · ${result.edge_count} edges`);
  console.log(`  synced_at    ${result.synced_at}`);
  console.log("");
  console.log("▶ inspect in Neo4j Browser (http://localhost:7474 for local):");
  console.log(`  MATCH (p:PsonProfile { profile_id: "${profile.profile_id}" })-[:HAS_NODE]->(n:PsonNode)`);
  console.log("  OPTIONAL MATCH (n)-[r:PSON_EDGE]->(m:PsonNode)");
  console.log("  RETURN p, n, r, m;");
}

main().catch((error) => {
  console.error(`\n✖ sync failed: ${error.message}`);
  process.exitCode = 1;
});
