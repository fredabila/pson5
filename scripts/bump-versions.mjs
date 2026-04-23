#!/usr/bin/env node
/**
 * Bump every `@pson5/*` package in the monorepo from one version to
 * another, updating cross-dependencies in lockstep. Run once per release.
 *
 * Usage:  node scripts/bump-versions.mjs 0.1.0 0.2.0
 *
 * Dry-run default: pass --apply to actually write changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const [, , fromArg, toArg, ...flags] = process.argv;
if (!fromArg || !toArg) {
  console.error("usage: bump-versions.mjs <from> <to> [--apply]");
  process.exit(1);
}
const apply = flags.includes("--apply");

const targets = [
  ...globSync("packages/*/package.json", { cwd: repoRoot }).map((p) => resolve(repoRoot, p)),
  resolve(repoRoot, "apps/cli/package.json"),
  resolve(repoRoot, "apps/api/package.json"),
  resolve(repoRoot, "apps/web/package.json"),
  resolve(repoRoot, "apps/docs-site/package.json"),
  resolve(repoRoot, "package.json")
].filter(Boolean);

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies"
];

let mutations = 0;

for (const path of targets) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  const json = JSON.parse(raw);
  let changed = false;

  // Bump the package's own version if it matches the from.
  if (
    typeof json.name === "string" &&
    (json.name === "pson5" || json.name.startsWith("@pson5/")) &&
    json.version === fromArg
  ) {
    json.version = toArg;
    changed = true;
    console.log(`  ${json.name.padEnd(38)} ${fromArg} → ${toArg}`);
  }

  // Update any `@pson5/*` dependency that was pinned at `fromArg`.
  for (const field of DEP_FIELDS) {
    const deps = json[field];
    if (!deps) continue;
    for (const [name, version] of Object.entries(deps)) {
      if (name.startsWith("@pson5/") && version === fromArg) {
        deps[name] = toArg;
        changed = true;
        console.log(
          `    ${json.name ?? path}   dep ${name} ${fromArg} → ${toArg}`
        );
      }
    }
  }

  if (changed && apply) {
    // Preserve trailing newline if it existed
    const trailing = raw.endsWith("\n") ? "\n" : "";
    writeFileSync(path, JSON.stringify(json, null, 2) + trailing);
    mutations++;
  } else if (changed) {
    mutations++;
  }
}

console.log(
  `\n${mutations} package.json file${mutations === 1 ? "" : "s"} ${
    apply ? "updated" : "would be updated (dry run — pass --apply)"
  }`
);
