import { KitePass, type KitePassConfig } from "@kitepass/sdk-core";
import type { Context, Next } from "hono";

export interface KitePassHonoOptions extends KitePassConfig {
  skipPaths?: string[];
}

export function kitepassMiddleware(options: KitePassHonoOptions) {
  const kp = new KitePass(options);
  const skipPaths = new Set(options.skipPaths ?? []);

  return async (c: Context, next: Next) => {
    if (skipPaths.has(c.req.path)) {
      return next();
    }

    const sessionId = c.req.header("x-kite-session");
    if (!sessionId) {
      return c.json({ error: "Missing X-Kite-Session header" }, 401);
    }

    const verifyResult = await kp.verifySession(sessionId);
    if (!verifyResult.valid || !verifyResult.session) {
      return c.json({ error: "Invalid or expired session", details: verifyResult.error }, 402);
    }

    const session = verifyResult.session;
    c.header("X-Kite-Tier", "paid");
    c.header("X-Kite-Cost-Usd", options.pricePerCall);
    c.header("X-Kite-Remaining-Usd", weiToUsdc(session.remainingTotal));
    c.header("X-Kite-Service", options.serviceAddress);

    const spendResult = await kp.reserveSpend(sessionId, options.pricePerCall);
    if (!spendResult.success) {
      return c.json({ error: "Payment failed", details: spendResult.error }, 402);
    }

    c.set("kitepass", {
      sessionId,
      reservation: spendResult.reservation,
      commit: async () => { await kp.commitSpend(spendResult.reservation); },
      refund: async () => { if (options.refundOnError) await kp.refundSpend(spendResult.reservation); },
    });

    await next();
  };
}

function weiToUsdc(wei: string): string {
  const num = BigInt(wei);
  const whole = num / BigInt(1_000_000);
  const frac = num % BigInt(1_000_000);
  return `${whole}.${frac.toString().padStart(6, "0")}`;
}

export { KitePass } from "@kitepass/sdk-core";
