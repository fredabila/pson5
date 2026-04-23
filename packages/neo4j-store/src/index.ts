import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { auth, driver as createDriver, type Driver } from "neo4j-driver";
import type {
  Neo4jConfig,
  Neo4jStatus,
  Neo4jStoredConfigStatus,
  Neo4jSyncResult,
  ProfileStoreOptions,
  PsonProfile
} from "@pson5/core-types";
import { loadProfile, resolveStoreRoot } from "@pson5/serialization-engine";

const CONFIG_DIR = "config";
const CONFIG_FILENAME = "neo4j.json";

function getConfigPath(options?: ProfileStoreOptions): string {
  return path.join(resolveStoreRoot(options), CONFIG_DIR, CONFIG_FILENAME);
}

function ensureConfigDir(options?: ProfileStoreOptions): void {
  mkdirSync(path.dirname(getConfigPath(options)), { recursive: true });
}

function parseEnabled(raw: string | undefined): boolean | undefined {
  if (!raw) {
    return undefined;
  }

  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") {
    return true;
  }

  if (value === "false" || value === "0" || value === "no") {
    return false;
  }

  return undefined;
}

function readStoredConfig(options?: ProfileStoreOptions): Neo4jConfig | null {
  const filePath = getConfigPath(options);
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<Neo4jConfig>;
    return {
      uri: typeof parsed.uri === "string" ? parsed.uri : null,
      username: typeof parsed.username === "string" ? parsed.username : null,
      password: typeof parsed.password === "string" ? parsed.password : undefined,
      database: typeof parsed.database === "string" ? parsed.database : null,
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true
    };
  } catch {
    return null;
  }
}

function readEnvConfig(): Neo4jConfig | null {
  const uri = process.env.PSON_NEO4J_URI ?? null;
  const username = process.env.PSON_NEO4J_USERNAME ?? null;
  const password = process.env.PSON_NEO4J_PASSWORD;
  const database = process.env.PSON_NEO4J_DATABASE ?? null;
  const enabled = parseEnabled(process.env.PSON_NEO4J_ENABLED) ?? true;

  if (!uri || !username || !password) {
    return null;
  }

  return {
    uri,
    username,
    password,
    database,
    enabled
  };
}

function resolveConfig(options?: ProfileStoreOptions): { config: Neo4jConfig; source: "env" | "file" } | null {
  const envConfig = readEnvConfig();
  if (envConfig) {
    return { config: envConfig, source: "env" };
  }

  const fileConfig = readStoredConfig(options);
  if (fileConfig?.uri && fileConfig.username && fileConfig.password) {
    return { config: fileConfig, source: "file" };
  }

  return null;
}

async function withDriver<T>(
  config: Neo4jConfig,
  run: (driver: Driver) => Promise<T>
): Promise<T> {
  const driver = createDriver(config.uri!, auth.basic(config.username!, config.password ?? ""));
  try {
    return await run(driver);
  } finally {
    await driver.close();
  }
}

function serializeNodeData(data: Record<string, unknown> | undefined): string | null {
  return data ? JSON.stringify(data) : null;
}

export function getStoredNeo4jConfig(options?: ProfileStoreOptions): Neo4jStoredConfigStatus {
  const resolved = resolveConfig(options);
  const filePath = getConfigPath(options);

  if (!resolved) {
    return {
      path: filePath,
      configured: false,
      enabled: false,
      uri: null,
      username: null,
      database: null,
      has_password: false,
      source: "none"
    };
  }

  return {
    path: filePath,
    configured: true,
    enabled: resolved.config.enabled,
    uri: resolved.config.uri,
    username: resolved.config.username,
    database: resolved.config.database ?? null,
    has_password: Boolean(resolved.config.password),
    source: resolved.source
  };
}

export function saveNeo4jConfig(input: Neo4jConfig, options?: ProfileStoreOptions): Neo4jStoredConfigStatus {
  ensureConfigDir(options);
  const filePath = getConfigPath(options);
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        uri: input.uri,
        username: input.username,
        password: input.password,
        database: input.database ?? null,
        enabled: input.enabled
      },
      null,
      2
    ),
    { encoding: "utf8", mode: 0o600 }
  );

  // Belt-and-braces: the `mode` flag in writeFileSync is honoured only
  // when the file is first created. If it already existed we still want
  // 0600 — chmod explicitly. Silent on Windows, where POSIX perms don't
  // apply, but harmless.
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Windows / non-POSIX filesystems — rely on platform ACLs.
  }

  return getStoredNeo4jConfig(options);
}

export function clearStoredNeo4jConfig(options?: ProfileStoreOptions): { path: string; cleared: boolean } {
  const filePath = getConfigPath(options);
  rmSync(filePath, { force: true });
  return { path: filePath, cleared: true };
}

export async function getNeo4jStatus(options?: ProfileStoreOptions): Promise<Neo4jStatus> {
  const resolved = resolveConfig(options);
  if (!resolved) {
    return {
      configured: false,
      enabled: false,
      connected: false,
      uri: null,
      database: null,
      username: null,
      source: "none",
      reason: "No Neo4j environment variables or stored config are configured."
    };
  }

  if (!resolved.config.enabled) {
    return {
      configured: true,
      enabled: false,
      connected: false,
      uri: resolved.config.uri,
      database: resolved.config.database ?? null,
      username: resolved.config.username,
      source: resolved.source,
      reason: "Neo4j integration is configured but disabled."
    };
  }

  try {
    return await withDriver(resolved.config, async (driver) => {
      const serverInfo = await driver.getServerInfo({
        database: resolved.config.database ?? undefined
      });

      return {
        configured: true,
        enabled: true,
        connected: true,
        uri: resolved.config.uri,
        database: resolved.config.database ?? null,
        username: resolved.config.username,
        source: resolved.source,
        server_agent: serverInfo.agent,
        server_protocol_version: serverInfo.protocolVersion?.toString()
      };
    });
  } catch (error: unknown) {
    return {
      configured: true,
      enabled: true,
      connected: false,
      uri: resolved.config.uri,
      database: resolved.config.database ?? null,
      username: resolved.config.username,
      source: resolved.source,
      reason: error instanceof Error ? error.message : "Failed to connect to Neo4j."
    };
  }
}

export async function syncKnowledgeGraphToNeo4j(
  profile: PsonProfile,
  options?: ProfileStoreOptions
): Promise<Neo4jSyncResult> {
  const resolved = resolveConfig(options);
  if (!resolved) {
    throw new Error("Neo4j is not configured.");
  }

  if (!resolved.config.enabled) {
    throw new Error("Neo4j integration is disabled.");
  }

  const nodes = profile.knowledge_graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    label: node.label,
    data_json: serializeNodeData(node.data)
  }));
  const edges = profile.knowledge_graph.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type: edge.type,
    data_json: serializeNodeData(edge.data)
  }));

  await withDriver(resolved.config, async (driver) => {
    const session = driver.session({
      database: resolved.config.database ?? undefined
    });

    try {
      await session.executeWrite(async (tx) => {
        await tx.run(
          `
            MERGE (profile:PsonProfile {profile_id: $profile_id})
            SET profile.user_id = $user_id,
                profile.pson_version = $pson_version,
                profile.revision = $revision,
                profile.updated_at = $updated_at
          `,
          {
            profile_id: profile.profile_id,
            user_id: profile.user_id,
            pson_version: profile.pson_version,
            revision: profile.metadata.revision,
            updated_at: profile.metadata.updated_at
          }
        );

        await tx.run(
          `
            MERGE (user:PsonUser {user_id: $user_id})
            MERGE (user)-[:OWNS_PROFILE]->(profile:PsonProfile {profile_id: $profile_id})
          `,
          {
            user_id: profile.user_id,
            profile_id: profile.profile_id
          }
        );

        await tx.run(
          `
            MATCH (profile:PsonProfile {profile_id: $profile_id})-[:HAS_NODE]->(node:PsonNode {profile_id: $profile_id})
            DETACH DELETE node
          `,
          { profile_id: profile.profile_id }
        );

        await tx.run(
          `
            UNWIND $nodes AS node
            MERGE (graphNode:PsonNode {profile_id: $profile_id, node_id: node.id})
            SET graphNode.type = node.type,
                graphNode.label = node.label,
                graphNode.data_json = node.data_json
            WITH graphNode
            MATCH (profile:PsonProfile {profile_id: $profile_id})
            MERGE (profile)-[:HAS_NODE]->(graphNode)
          `,
          {
            profile_id: profile.profile_id,
            nodes
          }
        );

        await tx.run(
          `
            UNWIND $edges AS edge
            MATCH (fromNode:PsonNode {profile_id: $profile_id, node_id: edge.from})
            MATCH (toNode:PsonNode {profile_id: $profile_id, node_id: edge.to})
            MERGE (fromNode)-[rel:PSON_EDGE {profile_id: $profile_id, edge_id: edge.id}]->(toNode)
            SET rel.edge_type = edge.type,
                rel.data_json = edge.data_json
          `,
          {
            profile_id: profile.profile_id,
            edges
          }
        );
      });
    } finally {
      await session.close();
    }
  });

  return {
    profile_id: profile.profile_id,
    user_id: profile.user_id,
    node_count: nodes.length,
    edge_count: edges.length,
    uri: resolved.config.uri,
    database: resolved.config.database ?? null,
    synced_at: new Date().toISOString()
  };
}

export async function syncStoredProfileKnowledgeGraph(
  profileId: string,
  options?: ProfileStoreOptions
): Promise<Neo4jSyncResult> {
  const profile = await loadProfile(profileId, options);
  return syncKnowledgeGraphToNeo4j(profile, options);
}
