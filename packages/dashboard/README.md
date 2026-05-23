# KitePass Dashboard

Hosted dashboard for monitoring KitePass SDK usage.

## Features

- Service management
- Transaction monitoring
- Usage analytics with charts
- Policy violation tracking

## Deployment

- **Production:** https://kitepass-sdk.vercel.app
- **Host:** Vercel project `kitepass-sdk`
- **Status:** dashboard and `/api/status` verified on 2026-05-23.
- **Data:** fake charts and synthetic payment usage are disabled. Configure `KITEPASS_SERVICES_URL`, `KITEPASS_USAGE_URL`, `KITEPASS_EVENTS_URL`, and `KITEPASS_POLICY_URL`.

## Development

```bash
pnpm install
pnpm dev
```
