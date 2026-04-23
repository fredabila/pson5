import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI_ENTRY = path.resolve("apps/cli/dist/apps/cli/src/index.js");

function runCli(args, { expectNonZero = false } = {}) {
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    }
  });

  if (!expectNonZero) {
    assert.equal(result.status, 0, `cli exited non-zero: stderr=${result.stderr}`);
  } else {
    assert.notEqual(result.status, 0, "cli was expected to exit non-zero");
  }

  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function parseSingleJsonLine(stdout) {
  const lines = stdout.trim().split("\n").filter((line) => line.trim().length > 0);
  assert.equal(lines.length, 1, "expected exactly one line of JSON output");
  return JSON.parse(lines[0]);
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pson5-cli-json-"));
  try {
    // init with --json wraps output as { success, data }
    const init = runCli(["init", "json_user", "--store", tempRoot, "--json"]);
    const initPayload = parseSingleJsonLine(init.stdout);
    assert.equal(initPayload.success, true);
    assert.ok(initPayload.data.profile_id.startsWith("pson_"));
    assert.equal(initPayload.data.revision, 1);
    assert.equal(initPayload.data.store_root, tempRoot);

    // inspect with --json returns the full profile inside data
    const inspect = runCli(["inspect", initPayload.data.profile_id, "--store", tempRoot, "--json"]);
    const inspectPayload = parseSingleJsonLine(inspect.stdout);
    assert.equal(inspectPayload.success, true);
    assert.equal(inspectPayload.data.profile_id, initPayload.data.profile_id);
    assert.equal(inspectPayload.data.user_id, "json_user");

    // state with --json
    const state = runCli(["state", initPayload.data.profile_id, "--store", tempRoot, "--json"]);
    const statePayload = parseSingleJsonLine(state.stdout);
    assert.equal(statePayload.success, true);
    assert.equal(statePayload.data.profile_id, initPayload.data.profile_id);
    assert.ok(Array.isArray(statePayload.data.active_states));

    // Errors with --json produce { success: false, error: { code, message } } on stdout
    const errorRun = runCli(["init", "--json"], { expectNonZero: true });
    const errorPayload = parseSingleJsonLine(errorRun.stdout);
    assert.equal(errorPayload.success, false);
    assert.ok(typeof errorPayload.error.code === "string");
    assert.match(errorPayload.error.message, /user id/);

    // Default (no --json) mode still prints pretty JSON multiline
    const pretty = runCli(["inspect", initPayload.data.profile_id, "--store", tempRoot]);
    assert.ok(pretty.stdout.includes("\n"));
    assert.ok(pretty.stdout.includes("  \"profile_id\""));
    // Must be parseable as a whole JSON document
    const prettyPayload = JSON.parse(pretty.stdout);
    assert.equal(prettyPayload.profile_id, initPayload.data.profile_id);

    // Default mode errors land on stderr, not stdout
    const legacyError = runCli(["init"], { expectNonZero: true });
    assert.equal(legacyError.stdout.trim(), "");
    assert.match(legacyError.stderr, /user id/);

    console.log("cli json output passed");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
