# KitePass SDK

> Drop-in TypeScript SDK for adding Kite Agent Passport authentication and x402-style metered payments to any HTTP service.

## Overview

KitePass SDK is a TypeScript monorepo that lets a service charge per request for agent traffic. The framework-agnostic core verifies agent sessions against a Kite Passport endpoint, reserves/commits/refunds spend, enforces per-session rate limits and spending policies, and signs outbound webhooks. Thin adapters wrap that core as middleware for the common Node.js web frameworks and as a payment gate for MCP tools. A separate Next.js dashboard provides a monitoring surface.

It is aimed at API and tool authors who want to gate paid endpoints behind an agent's signed session and track spend without building the metering plumbing themselves.

## Features

- **Session verification** — `KitePass.verifySession()` POSTs to the configured Passport endpoint, normalizes the session, and caches the result in memory (60s TTL).
- **Spend reserve / commit / refund** — Reserve against a session's remaining balance, commit on success, or refund on error. Reservations expire after 5 minutes if neither committed nor refunded.
- **Per-session rate limiting** — Token-bucket limiter configurable via `rateLimitPerSession: { max, window }` (default 100 per `1h`).
- **Spending policies** — `PolicyEngine` evaluates rules: `max_per_tx`, `max_per_window`, `category_whitelist`, and `time_window` (supports overnight windows).
- **Spend tracking backends** — `InMemorySpendTracker` and `RedisSpendTracker` (backed by `ioredis`) implement a shared `SpendTrackerInterface`.
- **Signed webhooks** — `WebhookDispatcher` dispatches HMAC-SHA256 signed events (`X-KitePass-Signature: sha256=...`) and exposes a timing-safe `verifySignature()` for receivers.
- **Cost headers** — Adapters set `X-Kite-*` response headers (tier, cost, remaining balance, service) on gated routes.
- **Framework adapters** — Express middleware, Hono middleware, Fastify plugin, Next.js middleware/helper, and an MCP payment gate.

## Tech stack

- TypeScript, built with [tsup](https://tsup.egoist.dev/)
- [Zod](https://zod.dev/) for schema validation, [ioredis](https://github.com/redis/ioredis) for the Redis backend
- [Vitest](https://vitest.dev/) for tests
- pnpm workspaces (monorepo)
- Framework peer deps: Express 4, Hono 3/4, Fastify 4/5, Next.js 14/15
- Dashboard: Next.js + React

## Architecture

Monorepo managed with pnpm workspaces (`packages/*`, `examples/*`). The published SDK packages are versioned `0.1.0-alpha.1`.

| Package | Name | Description |
|---|---|---|
| `packages/core` | `@kitepass/sdk-core` | Framework-agnostic core: `KitePass`, `PolicyEngine`, spend trackers, `WebhookDispatcher`, shared types |
| `packages/express` | `@kitepass/sdk-express` | Express middleware (`kitepass`) |
| `packages/hono` | `@kitepass/sdk-hono` | Hono middleware (`kitepassMiddleware`) |
| `packages/fastify` | `@kitepass/sdk-fastify` | Fastify plugin (`kitepassFastify`) |
| `packages/next` | `@kitepass/sdk-next` | Next.js middleware (`createKitePassMiddleware`) and route helper (`withKitePass`) |
| `packages/mcp` | `@kitepass/sdk-mcp` | MCP payment gate (`createPaymentGate`) |
| `packages/dashboard` | `@kitepass/dashboard` | Next.js monitoring dashboard (private, not published) |

Each adapter depends on `@kitepass/sdk-core` via `workspace:*` and re-exports `KitePass`. Adapters share the same request flow: read the `X-Kite-Session` header → `verifySession` → `reserveSpend` → expose `commit()`/`refund()` to the handler.

## Getting started

### Prerequisites

- Node.js >= 18
- pnpm (the repo uses pnpm workspaces and a `pnpm-lock.yaml`)
- Redis only if you use `RedisSpendTracker`

### Installation

Install from the workspace root to build all packages:

```bash
pnpm install
pnpm run build
```

Once published, an individual adapter would be installed on its own, e.g.:

```bash
npm install @kitepass/sdk-express
```

### Configuration

The SDK itself takes its configuration in code via `KitePassConfig` rather than environment variables:

| Option | Required | Default | Purpose |
|---|---|---|---|
| `serviceAddress` | yes | — | Service identifier sent during session verification |
| `pricePerCall` | yes | — | Price charged per gated request (USDC, 6-decimal string, e.g. `"0.001"`) |
| `refundOnError` | no | `true` | Whether `refund()` actually refunds |
| `rateLimitPerSession` | no | `{ max: 100, window: "1h" }` | Token-bucket limit per session |
| `kitePassUrl` | no | `https://passport.prod.gokite.ai` | Passport verification base URL |

Adapters additionally accept `skipPaths: string[]` to bypass gating for specific paths.

The example server reads `SERVICE_ADDRESS` and `PORT`. The dashboard reads the following connector URLs; until all four are set, analytics stay disabled:

| Variable | Purpose |
|---|---|
| `KITEPASS_SERVICES_URL` | Registered SDK integrations and service metadata |
| `KITEPASS_USAGE_URL` | Reserved, committed, and refunded payment usage |
| `KITEPASS_EVENTS_URL` | Webhook delivery and session/payment event stream |
| `KITEPASS_POLICY_URL` | Policy violation and spending-rule analytics |

### Running

Workspace-wide scripts (run from the root):

```bash
pnpm run build   # build every package (tsup)
pnpm run dev     # watch-build packages that define a dev script
pnpm run test    # run tests across the workspace
pnpm run lint    # run lint across the workspace
```

Run the Express example:

```bash
cd examples/express-basic
SERVICE_ADDRESS=0x... node server.js
# GET /health, GET /free are free; GET /paid, POST /paid/data require an X-Kite-Session header
```

Run the dashboard locally:

```bash
cd packages/dashboard
pnpm dev
```

## Usage

### Express middleware

```typescript
import express from "express";
import { kitepass } from "@kitepass/sdk-express";

const app = express();

app.use(
  kitepass({
    serviceAddress: "0x...",
    pricePerCall: "0.001", // USDC, 6-decimal string
    skipPaths: ["/health"],
  })
);

app.get("/api/data", async (req, res) => {
  try {
    res.json({ data: "paid content" });
    await req.kitepass?.commit();
  } catch (err) {
    await req.kitepass?.refund();
    res.status(500).json({ error: "Internal error" });
  }
});
```

Callers must send the session in the `X-Kite-Session` header. A missing header returns `401`; an invalid session or failed reservation returns `402`.

### MCP payment gate

```typescript
import { createPaymentGate } from "@kitepass/sdk-mcp";

const gate = createPaymentGate({
  serviceAddress: "0x...",
  pricePerCall: "0.001",
  toolName: "premium-search",
});

const result = await gate.verify(sessionId);
if (!result.allowed) {
  throw new Error(result.error);
}
// ... run the tool ...
await result.commit(); // or result.refund() on failure
```

### Spending policies

```typescript
import { PolicyEngine } from "@kitepass/sdk-core";

const engine = new PolicyEngine({
  rules: [
    { type: "max_per_tx", max: "0.01" },
    { type: "max_per_window", window: "1h", max: "1.00" },
    { type: "category_whitelist", categories: ["ai", "data"] },
  ],
  on_violation: "block",
});

// amount and the running totals are bigints in base units (USDC has 6 decimals)
const result = engine.check(BigInt(5_000), {
  category: "ai",
  sessionSpent: BigInt(0),
  sessionReserved: BigInt(0),
});

if (!result.allowed) {
  // result.reason explains which rule blocked the request
}
```

### Webhook verification

```typescript
import { WebhookDispatcher } from "@kitepass/sdk-core";

const isValid = WebhookDispatcher.verifySignature(
  rawRequestBody,
  request.headers["x-kitepass-signature"], // e.g. "sha256=..."
  webhookSecret
);
```

`verifySignature` recomputes the HMAC-SHA256 and compares with a timing-safe equality check, returning `false` for non-string or length-mismatched signatures rather than throwing.

## Testing

```bash
pnpm run test
```

Tests live in `packages/core` (Vitest) and cover `KitePass` construction/verification, `PolicyEngine` rules (including overnight time windows), and `WebhookDispatcher.verifySignature` (valid, tampered, wrong-secret, length-mismatch, and non-string cases). The other packages do not currently define test scripts.

## Project structure

```
.
├── packages/
│   ├── core/        # @kitepass/sdk-core (KitePass, PolicyEngine, spend trackers, webhooks)
│   ├── express/     # @kitepass/sdk-express
│   ├── hono/        # @kitepass/sdk-hono
│   ├── fastify/     # @kitepass/sdk-fastify
│   ├── next/        # @kitepass/sdk-next
│   ├── mcp/         # @kitepass/sdk-mcp
│   └── dashboard/   # @kitepass/dashboard (Next.js, private)
├── examples/
│   └── express-basic/
├── package.json     # workspace root
└── pnpm-workspace.yaml
```

## Status

Early alpha. SDK packages are at `0.1.0-alpha.1` and are not yet published to npm — install/build from the workspace.

What is real and implemented:

- Session verification, spend reserve/commit/refund, rate limiting, policies, and webhook signing/verification in `@kitepass/sdk-core`.
- Express, Hono, Fastify, Next.js, and MCP adapters.
- In-memory and Redis spend trackers.

Caveats:

- The `KitePass` class stores session cache, reservations, and rate-limiter state in memory; it is not shared across processes. For durable, multi-process spend tracking use `RedisSpendTracker`.
- Session verification depends on a reachable Kite Passport endpoint (`kitePassUrl`).
- The dashboard renders no synthetic data: analytics stay disabled until `KITEPASS_SERVICES_URL`, `KITEPASS_USAGE_URL`, `KITEPASS_EVENTS_URL`, and `KITEPASS_POLICY_URL` are configured.
- Automated tests currently cover the core package only.

## License

MIT (declared in `package.json`). No separate `LICENSE` file is present in the repository.
