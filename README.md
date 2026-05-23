# KitePass SDK

> Drop-in TypeScript SDK for adding Kite Agent Passport auth and x402 payments to any service.

## Packages

| Package | Description |
|---|---|
| `@kitepass/sdk-core` | Framework-agnostic core with session verification, spend tracking, rate limiting, webhooks, policies |
| `@kitepass/sdk-express` | Express middleware |
| `@kitepass/sdk-hono` | Hono middleware |
| `@kitepass/sdk-fastify` | Fastify plugin |
| `@kitepass/sdk-next` | Next.js middleware + helpers |
| `@kitepass/sdk-mcp` | MCP server payment gate |

## Quick start

```bash
npm install @kitepass/sdk-express
```

```typescript
import express from "express";
import { kitepass } from "@kitepass/sdk-express";

const app = express();

app.use(kitepass({
  serviceAddress: "0x...",
  pricePerCall: "0.001",  // USDC.e
}));

app.get("/api/data", async (req, res) => {
  res.json({ data: "paid content" });
  await req.kitepass?.commit();
});
```

## Features

- **Session verification** — Verify agent sessions via Kite Passport
- **Spend tracking** — Reserve, commit, refund payments with in-memory or Redis backend
- **Rate limiting** — Token bucket rate limiting per session
- **Spending policies** — JSON-based rules for max per tx, per window, category whitelist, time windows
- **Webhooks** — HMAC-signed webhook events for payment and session events
- **Cost headers** — Automatic X-Kite-* headers on responses

## Deployment

- **Dashboard:** https://kitepass-sdk.vercel.app
- **Host:** Vercel project `kitepass-sdk`
- **Status:** dashboard and `/api/status` verified on 2026-05-23.
- **Data:** analytics are disabled until `KITEPASS_SERVICES_URL`, `KITEPASS_USAGE_URL`, `KITEPASS_EVENTS_URL`, and `KITEPASS_POLICY_URL` are configured.

## Spending Policy DSL

```typescript
import { PolicyEngine } from "@kitepass/sdk-core";

const policy = new PolicyEngine({
  rules: [
    { type: "max_per_tx", max: "0.01" },
    { type: "max_per_window", window: "1h", max: "1.00" },
    { type: "category_whitelist", categories: ["ai", "data"] },
  ],
  on_violation: "block",
});

const result = policy.check(amount, { category: "ai", sessionSpent, sessionReserved });
if (!result.allowed) {
  // Block the request
}
```

## Webhook Verification

```typescript
import { WebhookDispatcher } from "@kitepass/sdk-core";

// Verify incoming webhook signature
const isValid = WebhookDispatcher.verifySignature(
  requestBody,
  request.headers["x-kitepass-signature"],
  webhookSecret,
);
```

## Development

```bash
git clone https://github.com/gnanam1990/kitepass-sdk
cd kitepass-sdk
pnpm install
pnpm run build
pnpm run test
```

## License

MIT
