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
  return rpcWithHeaders(port, method, params, id);
}

async function rpcWithHeaders(port, method, params = {}, id = 1, extraHeaders = {}, bodyExtra = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/mcp`, {
    method: "POST",
    headers: {
      "authorization": "Bearer smoke-secret",
      "content-type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
      ...bodyExtra
    })
  });

  assert.equal(response.status, 200);
  return response.json();
}

async function rpcWithoutAuth(port, method, params = {}, id = 1) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/mcp`, {
    method: "POST",
    headers: {
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

async function waitForUnauthedServer(port) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const init = await rpcWithoutAuth(port, "initialize", {}, 1);
      if (init.result?.protocolVersion) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError ?? new Error("Timed out waiting for unauthenticated MCP server.");
}

async function withApiServer(env, callback) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pson5-mcp-openai-subject-"));
  const port = await getFreePort();
  const child = spawn(process.execPath, [API_ENTRY], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      PSON_ENFORCE_SUBJECT_USER: "true",
      PSON_STORE_BACKEND: "file",
      PSON_STORE_DIR: tempRoot,
      PSON_ACCESS_AUDIT_ENABLED: "false",
      ...env
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
    await callback(port);
  } catch (error) {
    console.error({ stdout, stderr });
    throw error;
  } finally {
    child.kill();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  await withApiServer({ PSON_API_KEY: "smoke-secret" }, async (port) => {
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

    const nestedSubject = await rpc(
      port,
      "tools/call",
      {
        name: "pson_ensure_profile",
        arguments: {},
        _meta: {
          openai: {
            subject: "user_nested_openai_subject"
          }
        }
      },
      4
    );
    assert.equal(nestedSubject.error, undefined, JSON.stringify(nestedSubject.error));
    assert.equal(nestedSubject.result.structuredContent.user_id, "user_nested_openai_subject");

    const headerSubject = await rpcWithHeaders(
      port,
      "tools/call",
      {
        name: "pson_ensure_profile",
        arguments: {}
      },
      5,
      {
        "openai-user-id": "user_openai_header"
      }
    );
    assert.equal(headerSubject.error, undefined, JSON.stringify(headerSubject.error));
    assert.equal(headerSubject.result.structuredContent.user_id, "user_openai_header");

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
      6
    );
    assert.equal(denied.error?.code, -32001, "mismatched user_id remains denied");
    assert.match(denied.error?.message, /subject user/i);

    console.log("mcp http openai subject integration passed");
  });

  await withApiServer({}, async (port) => {
    await waitForUnauthedServer(port);
    const ensured = await rpcWithoutAuth(
      port,
      "tools/call",
      {
        name: "pson_ensure_profile",
        arguments: {},
        _meta: {
          "openai/subject": "user_subject_no_auth_role"
        }
      },
      10
    );
    assert.equal(ensured.error, undefined, JSON.stringify(ensured.error));
    assert.equal(ensured.result.structuredContent.user_id, "user_subject_no_auth_role");
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
