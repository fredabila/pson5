import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const API_ENTRY = path.resolve("apps/api/dist/apps/api/src/server.js");

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address !== null) {
          resolve(address.port);
          return;
        }
        reject(new Error("Could not allocate a free port."));
      });
    });
  });
}

async function rpc(port, method, params = {}, id = 1) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/mcp`, {
    method: "POST",
    headers: {
      "authorization": "Bearer smoke-secret",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    })
  });

  assert.equal(response.status, 200);
  return response.json();
}

async function waitForServer(port) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const init = await rpc(port, "initialize", {}, 1);
      if (init.result?.protocolVersion) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError ?? new Error("Timed out waiting for MCP server.");
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pson5-mcp-openai-subject-"));
  const port = await getFreePort();
  const child = spawn(process.execPath, [API_ENTRY], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      PSON_API_KEY: "smoke-secret",
      PSON_ENFORCE_SUBJECT_USER: "true",
      PSON_STORE_BACKEND: "file",
      PSON_STORE_DIR: tempRoot,
      PSON_ACCESS_AUDIT_ENABLED: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(port);

    const tools = await rpc(port, "tools/list", {}, 2);
    assert.ok(Array.isArray(tools.result?.tools), "tools/list returns tools");
    const ensureTool = tools.result.tools.find((tool) => tool.name === "pson_ensure_profile");
    assert.ok(ensureTool, "pson_ensure_profile is advertised");
    assert.ok(
      !ensureTool.inputSchema.required?.includes("user_id"),
      "MCP schema must not force ChatGPT to invent user_id"
    );

    const ensured = await rpc(
      port,
      "tools/call",
      {
        name: "pson_ensure_profile",
        arguments: {},
        _meta: {
          "openai/subject": "user_openai_subject"
        }
      },
      3
    );
    assert.equal(ensured.error, undefined, JSON.stringify(ensured.error));
    assert.equal(ensured.result.structuredContent.user_id, "user_openai_subject");

    const denied = await rpc(
      port,
      "tools/call",
      {
        name: "pson_ensure_profile",
        arguments: {
          user_id: "different_user"
        },
        _meta: {
          "openai/subject": "user_openai_subject"
        }
      },
      4
    );
    assert.equal(denied.error?.code, -32001, "mismatched user_id remains denied");

    console.log("mcp http openai subject integration passed");
  } catch (error) {
    console.error({ stdout, stderr });
    throw error;
  } finally {
    child.kill();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
