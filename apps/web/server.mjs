import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT ?? 4173);
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3000";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value, null, 2));
}

async function serveStatic(pathname, response) {
  const normalizedPath =
    pathname === "/"
      ? "/index.html"
      : pathname === "/console"
        ? "/console.html"
        : pathname === "/access"
          ? "/access.html"
          : pathname;
  const filePath = normalize(join(publicDir, normalizedPath));

  if (!filePath.startsWith(publicDir)) {
    sendJson(response, 403, { error: "forbidden" });
    return;
  }

  if (!existsSync(filePath)) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}

async function proxyApi(request, response, pathname) {
  const targetUrl = new URL(pathname.replace(/^\/api/u, ""), apiOrigin);
  targetUrl.search = new URL(request.url, "http://localhost").search;

  const bodyChunks = [];
  for await (const chunk of request) {
    bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const proxied = await fetch(targetUrl, {
    method: request.method,
    headers: {
      "content-type": request.headers["content-type"] ?? "application/json"
    },
    body: bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined
  });

  response.writeHead(proxied.status, {
    "content-type": proxied.headers.get("content-type") ?? "application/json; charset=utf-8"
  });
  response.end(Buffer.from(await proxied.arrayBuffer()));
}

const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendJson(response, 400, { error: "bad_request" });
      return;
    }

    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      await proxyApi(request, response, url.pathname);
      return;
    }

    if (url.pathname === "/config.json") {
      sendJson(response, 200, { apiOrigin });
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "internal_error"
    });
  }
});

server.listen(port, () => {
  console.log(`PSON5 web listening on http://localhost:${port} proxying ${apiOrigin}`);
});
