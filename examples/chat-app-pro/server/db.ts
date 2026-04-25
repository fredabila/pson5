// Use Neon's official driver instead of vanilla `pg`. It speaks the
// Postgres wire protocol over WebSockets (port 443) instead of native
// TCP/5432, which (a) bypasses any firewall blocking 5432, (b) avoids
// the SNI/TLS-handshake quirks the `pg` driver hits against Neon's
// proxy, and (c) is the right choice for serverless deployment to
// Vercel/Cloudflare/etc. The Pool API is drop-in compatible.
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { ProfileStoreAdapter, ProfileStoreOptions } from "@pson5/core-types";
import { createDocumentProfileStoreAdapter } from "@pson5/serialization-engine";
import {
  createPostgresProfileStoreArtifacts,
  createPostgresProfileStoreRepository,
  createPostgresQueryExecutor
} from "@pson5/postgres-store";

// In Node, the driver needs an explicit WebSocket constructor. In the
// browser / Vercel Edge / Cloudflare Workers, this is a no-op.
neonConfig.webSocketConstructor = ws;

let singletonPool: Pool | null = null;
let singletonAdapter: ProfileStoreAdapter | null = null;

/**
 * One pool per process. Re-export via getPool() so scripts and the server
 * share the same connection pool.
 */
export function getPool(): Pool {
  if (singletonPool) return singletonPool;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and paste your Neon connection string."
    );
  }
  singletonPool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 45_000
  });
  return singletonPool;
}

/**
 * Wrap the pool with the PSON5 document-store abstraction. Pass this
 * adapter in every ProfileStoreOptions call — it replaces the default
 * filesystem-backed store.
 */
export function getPostgresAdapter(): ProfileStoreAdapter {
  if (singletonAdapter) return singletonAdapter;
  const pool = getPool();
  const executor = createPostgresQueryExecutor(pool);
  const repository = createPostgresProfileStoreRepository(executor);
  singletonAdapter = createDocumentProfileStoreAdapter(repository);
  return singletonAdapter;
}

/**
 * Build the ProfileStoreOptions every SDK call needs. The `rootDir` is
 * still used for filesystem-scoped artifacts (learning sessions), so it
 * must be a writable path. Profile documents themselves live in Postgres
 * via the adapter.
 */
export function buildStoreOptions(): ProfileStoreOptions {
  return {
    adapter: getPostgresAdapter(),
    rootDir: process.env.PSON_SESSION_DIR?.trim() || "./data"
  };
}

/**
 * Apply the generated schema SQL. Idempotent — `create table if not exists`
 * for every DDL statement. Safe to run on every cold start, but we gate
 * it behind an explicit script so production deployments run it once.
 *
 * The Neon serverless driver does not support multi-statement queries
 * (unlike the native `pg` driver, which uses the simple query protocol).
 * We split the artifacts' schema SQL on top-level semicolons and execute
 * one statement at a time.
 */
export async function initSchema(): Promise<void> {
  const { schemaSql } = createPostgresProfileStoreArtifacts();
  const pool = getPool();
  const client = await pool.connect();
  const statements = splitSqlStatements(schemaSql);
  try {
    await client.query("begin");
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Split a SQL script into individual statements. The PSON5 schema script
 * doesn't contain string literals or dollar-quoted bodies — it's pure
 * DDL — so a top-level `;` split is sufficient. Trims whitespace and
 * drops empty fragments.
 */
function splitSqlStatements(script: string): string[] {
  return script
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export async function closePool(): Promise<void> {
  if (singletonPool) {
    await singletonPool.end();
    singletonPool = null;
    singletonAdapter = null;
  }
}
