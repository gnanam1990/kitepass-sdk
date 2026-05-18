# KitePass SDK

> TypeScript SDK for adding Kite Agent Passport authentication and x402 payments to any web service.

## Packages

| Package | Description |
|---|---|
| `@kitepass/sdk-core` | Framework-agnostic core with session verification, spend tracking, rate limiting |
| `@kitepass/sdk-express` | Express middleware wrapping core |

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

## Core API

```typescript
import { KitePass } from "@kitepass/sdk-core";

const kp = new KitePass({
  serviceAddress: "0x...",
  pricePerCall: "0.001",
});

const session = await kp.verifySession(sessionId);
const reservation = await kp.reserveSpend(sessionId, "0.001");
// ... do work ...
await kp.commitSpend(reservation);
// or on error:
await kp.refundSpend(reservation);
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
