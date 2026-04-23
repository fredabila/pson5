#!/usr/bin/env node
/**
 * Publish every `@pson5/*` package to the public npm registry in the
 * correct dependency order (foundation → engines → integration → surfaces).
 *
 * Requires:
 *   • `npm login` (or NPM_TOKEN in environment) with publish access to @pson5
 *   • `npm run build --workspaces --if-present` run beforehand
 *
 * Usage:
 *   node scripts/publish-all.mjs            # dry run (default)
 *   node scripts/publish-all.mjs --apply    # actually publish
 *   node scripts/publish-all.mjs --apply --only=@pson5/sdk    # just one
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const apply = process.argv.includes("--apply");
const onlyFlag = process.argv.find((arg) => arg.startsWith("--only="));
const only = onlyFlag ? onlyFlag.split("=")[1] : null;

// Publish order: foundation → storage → engines → integration → surface.
// Within a tier, alphabetical. Each package must be fully available on
// the registry before a package depending on it goes out.
const TIERS = [
  { label: "Foundation", packages: ["core-types", "schemas", "privacy"] },
  { label: "Engines", packages: [
    "state-engine",
    "graph-engine",
    "modeling-engine",
    "provider-engine",
    "serialization-engine",
    "simulation-engine"
  ] },
  { label: "Storage adapters", packages: ["postgres-store", "neo4j-store"] },
  { label: "Integration", packages: ["agent-context", "acquisition-engine"] },
  { label: "Surface", packages: ["sdk"] }
];

// CLI is an app, not a workspace under packages/, but it is a public
// @pson5 npm package.
const APPS = ["cli"];

function resolvePackagePath(name) {
  if (APPS.includes(name)) return resolve(repoRoot, "apps", name);
  return resolve(repoRoot, "packages", name);
}

function readManifest(dir) {
  return JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
}

function fullName(shortName) {
  return APPS.includes(shortName)
    ? `@pson5/${shortName}`
    : `@pson5/${shortName}`;
}

function publishedVersion(pkg) {
  try {
    return execSync(`npm view ${pkg} version --json`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
      .trim()
      .replace(/^"|"$/g, "");
  } catch {
    return null; // never published
  }
}

const timeline = [];

for (const tier of TIERS) {
  for (const name of tier.packages) {
    timeline.push({ tier: tier.label, short: name });
  }
}
for (const name of APPS) {
  timeline.push({ tier: "Apps", short: name });
}

console.log(
  `Planning ${apply ? "PUBLISH" : "DRY RUN"} of ${timeline.length} packages.\n`
);

const plan = [];
for (const entry of timeline) {
  const pkgName = fullName(entry.short);
  if (only && pkgName !== only) continue;

  const dir = resolvePackagePath(entry.short);
  const manifest = readManifest(dir);
  const local = manifest.version;
  const registered = publishedVersion(pkgName);

  const status =
    registered === local
      ? "skip (already published)"
      : registered === null
        ? "NEW → publish"
        : `bump ${registered} → ${local}`;

  plan.push({
    pkgName,
    dir,
    local,
    registered,
    status,
    tier: entry.tier,
    skip: registered === local
  });

  console.log(`  ${entry.tier.padEnd(18)} ${pkgName.padEnd(32)} ${status}`);
}

if (!apply) {
  console.log("\nDry run complete. Pass --apply to actually publish.");
  process.exit(0);
}

console.log("\n--- publishing ---\n");

let published = 0;
let skipped = 0;
for (const item of plan) {
  if (item.skip) {
    console.log(`• skip  ${item.pkgName}`);
    skipped++;
    continue;
  }
  console.log(`• ship  ${item.pkgName} → ${item.local}`);
  try {
    execSync("npm publish --access=public", {
      cwd: item.dir,
      stdio: "inherit"
    });
    published++;
  } catch (err) {
    console.error(`\n✗ publish failed for ${item.pkgName}`);
    console.error(err.message ?? err);
    process.exit(1);
  }
}

console.log(`\nDone. Published ${published}, skipped ${skipped}.`);
