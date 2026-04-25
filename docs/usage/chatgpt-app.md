# Running PSON5 as a ChatGPT App

This guide walks through deploying the PSON5 API as a ChatGPT App so that ChatGPT can read and write a per-user PSON profile across conversations.

The integration uses the **API Key** auth mode of OpenAI's Apps SDK, which is the lowest-friction path that works against the current `0.2.x` API. Full OAuth 2.1 + dynamic client registration is planned for `0.3` — see [Auth roadmap](#auth-roadmap) below.

## What you get

ChatGPT keeps no state between conversations. Wiring it to PSON5 gives every chat a hot context of:

- **Observed facts** the user has volunteered ("I'm a vegetarian", "I work in finance", "my partner's name is Mei")
- **Inferred traits and heuristics** the modeling layer has derived
- **State predictions** about what the user is likely doing or feeling right now

ChatGPT calls `pson_ensure_profile` once at the start of a conversation, then `pson_get_agent_context` to pull the relevant slice for the current task, and `pson_observe_fact` whenever the user states something worth remembering. Across threads the profile accumulates; across users the binding is enforced by signed token claims or ChatGPT's MCP subject metadata.

## Prerequisites

1. **A hosted PSON5 API on HTTPS.** The MCP transport spec requires TLS. For local testing you can use a tunnel like ngrok; for production deploy `apps/api` behind Cloudflare, Fly.io, Railway, or any node-friendly host.
2. **A JWT signing secret** (or RSA keypair). The API supports HS256 and RS256 — set `PSON_JWT_SECRET` for HS256, or `PSON_JWT_PUBLIC_KEY` for RS256 verification of tokens issued by an external IdP.
3. **The `apps/api` workspace built** (`npm run build --workspace @pson5/api`).

## Server-side setup

### 1. Configure auth

There are two practical patterns. Pick one based on how you want to identify each ChatGPT user:

#### Pattern A — shared API key + ChatGPT subject metadata (recommended)

ChatGPT passes an anonymized stable user identifier to MCP tool calls as `_meta["openai/subject"]`. With API-key auth, you ship **one** shared bearer token to ChatGPT (proves the request is from your app) and PSON5 derives the per-user PSON profile from that MCP metadata. Each ChatGPT user automatically lands on their own profile — no per-user token issuance.

```bash
export PSON_API_KEY="$(openssl rand -hex 32)"        # the shared bearer

export PSON_ENFORCE_SUBJECT_USER=true
```

Trust model: anyone with the bearer can call tools, but PSON5 binds ChatGPT MCP calls to the host-provided `_meta["openai/subject"]` when no signed per-user token is present. If you also accept traffic from anything that isn't ChatGPT, prefer Pattern B or put the MCP endpoint behind an origin/client allowlist.

#### Pattern B — per-user JWTs

You mint a fresh JWT for each user (typically when they sign up on your website) and they paste it into ChatGPT. Slower onboarding, but doesn't trust the proxy:

```bash
export PSON_JWT_SECRET="$(openssl rand -hex 32)"     # 256-bit random
export PSON_ENFORCE_SUBJECT_USER=true
export PSON_JWT_USER_ID_CLAIM=sub                    # claim that holds user_id
```

If you'd rather verify tokens from an existing IdP (Auth0, Clerk, your own auth service), set `PSON_JWT_PUBLIC_KEY` to the IdP's public key in PEM form, or `PSON_JWKS_PATH` / `PSON_JWKS_JSON` for JWKS.

### 2. Pick a storage backend

The chat-app-pro example uses Neon Postgres via `@pson5/postgres-store`; for development the default filesystem store is fine. Either way, set `PSON_PROFILE_STORE` to `filesystem` or `postgres` and the matching connection variables (see `docs/usage/api-quickstart.md`).

### 3. Deploy and verify

```bash
node apps/api/dist/apps/api/src/server.js
# In another shell:
curl https://your-api.example.com/v1/mcp \
  -X POST \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

You should see a response with `serverInfo.name === "@pson5/api"`, the current package version, and an `Mcp-Session-Id` response header.

## Issuing user tokens (Pattern B only — skip if you went with ChatGPT subject metadata)

Each ChatGPT user needs a JWT bound to their PSON `user_id`. The token's `user_id` claim is what the API uses to look up or create their profile.

```ts
import { createHmac } from "node:crypto";

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const head = enc(header);
  const body = enc({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 // 1 year
  });
  const sig = createHmac("sha256", secret)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
}

const token = signJwt({ sub: "user_alice_42", role: "editor" }, process.env.PSON_JWT_SECRET!);
```

In a real product you'd hand each user their token through your existing login flow. For early access you can mint tokens manually and email them.

## ChatGPT App configuration

In the ChatGPT Apps console:

1. **Server URL**: `https://your-api.example.com/v1/mcp`
2. **Authentication**: select **API Key**
3. **Header**: `Authorization`
4. **Format**: `Bearer {token}` — ChatGPT will prompt the end user to paste their token, then prefix it correctly.

That's the entire wiring. ChatGPT handles the rest: it calls `tools/list` to discover the tool surface, then routes user messages through whichever tools the model picks.

## How the conversation flows

A typical first message ("hey, suggest a recipe I'd like"):

1. ChatGPT calls `pson_ensure_profile`. For MCP calls, PSON5 derives `user_id` from `_meta["openai/subject"]` when the model omits it. First-time users get a profile created on the spot; returning users get their existing profile.
2. ChatGPT calls `pson_get_agent_context` with `{ profile_id, intent: "suggest a recipe the user would enjoy" }`. The API returns dietary preferences, cuisines they've mentioned, allergies, etc. — filtered to what's relevant.
3. ChatGPT generates the recipe response, personalized.
4. If the user volunteers something new ("oh, I just went vegetarian"), ChatGPT calls `pson_observe_fact` with `{ profile_id, domain: "core", key: "diet", value: "vegetarian", confidence: 1 }`.

Every step writes audit log entries under the API's audit directory. Profiles persist across conversations through whichever storage backend is configured.

## What works today vs. v0.3

| Capability | 0.2.x | 0.3 (planned) |
|---|---|---|
| ChatGPT App listing & MCP transport | ✅ | ✅ |
| Bearer-token auth | ✅ | ✅ |
| Profile auto-provision on first call | ✅ (`pson_ensure_profile`) | ✅ |
| Per-user profile binding via JWT | ✅ (`PSON_ENFORCE_SUBJECT_USER`) | ✅ |
| OAuth 2.1 + PKCE "Connect to ChatGPT" button | ❌ — users paste their token | ✅ |
| Dynamic client registration (RFC 7591) | ❌ | ✅ |
| Streamable HTTP SSE response framing | partial — JSON only | full |
| `_meta` UI hints on tools | ❌ | ✅ |

## Auth roadmap

The current 0.2.x API key flow requires each user to obtain and paste a token. v0.3 will add the OAuth 2.1 grant flow ChatGPT prefers — users click **Connect**, log in through your IdP, consent, and the token is provisioned automatically. The MCP tool surface and storage layer are unchanged; only the auth boundary is new.

Track the work under [Phase 3 of the ChatGPT App integration plan](https://github.com/fredabila/pson5/issues).
