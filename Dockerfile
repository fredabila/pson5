# syntax=docker/dockerfile:1.7

# ── Builder ───────────────────────────────────────────────────────────
# Uses the full monorepo so npm workspaces can link @pson5/* packages
# against each other when tsc compiles apps/api. Producing the runtime
# image requires every package's dist/ directory; `npm run build` at
# the root walks every workspace.
FROM node:22-slim AS builder
WORKDIR /app

# Copy lockfile + every package manifest first so npm install layer
# caches independently of source changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api

# Workspaces auto-link via npm install. --include=dev because tsc and
# the workspace tsconfigs are devDependencies.
RUN npm install --include=dev --no-audit --no-fund

# Build every workspace. Cheaper than building only @pson5/api because
# api's tsc resolves @pson5/* via the workspace symlinks and needs each
# dependency's compiled .d.ts files.
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────
# Slim image, only what's needed to run the compiled api. We keep
# node_modules + packages because workspace resolution traverses
# symlinks back to packages/*/dist at runtime.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/apps/api /app/apps/api
COPY --from=builder /app/package.json /app/package.json

EXPOSE 8080

# Source maps make Fly logs traceable to TS line numbers without a
# meaningful runtime cost.
CMD ["node", "--enable-source-maps", "apps/api/dist/apps/api/src/server.js"]
