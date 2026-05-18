import { KitePass, type KitePassConfig, type SpendReservation } from "@kitepass/sdk-core";
import type { Request, Response, NextFunction } from "express";

export interface KitePassMiddlewareOptions extends KitePassConfig {
  skipPaths?: string[];
}

declare global {
  namespace Express {
    interface Request {
      kitepass?: {
        sessionId: string;
        reservation: SpendReservation;
        commit: () => Promise<void>;
        refund: () => Promise<void>;
      };
    }
  }
}

export function kitepass(options: KitePassMiddlewareOptions) {
  const kp = new KitePass(options);
  const skipPaths = new Set(options.skipPaths ?? []);

  return async (req: Request, res: Response, next: NextFunction) => {
    if (skipPaths.has(req.path)) {
      return next();
    }

    const sessionId = req.headers["x-kite-session"] as string | undefined;
    if (!sessionId) {
      res.status(401).json({ error: "Missing X-Kite-Session header" });
      return;
    }

    const verifyResult = await kp.verifySession(sessionId);
    if (!verifyResult.valid || !verifyResult.session) {
      res.status(402).json({
        error: "Invalid or expired session",
        details: verifyResult.error,
      });
      return;
    }

    const session = verifyResult.session;
    res.setHeader("X-Kite-Tier", "paid");
    res.setHeader("X-Kite-Cost-Usd", options.pricePerCall);
    res.setHeader("X-Kite-Remaining-Usd", weiToUsdc(session.remainingTotal));
    res.setHeader("X-Kite-Service", options.serviceAddress);

    const spendResult = await kp.reserveSpend(sessionId, options.pricePerCall);
    if (!spendResult.success) {
      res.status(402).json({
        error: "Payment failed",
        details: spendResult.error,
      });
      return;
    }

    req.kitepass = {
      sessionId,
      reservation: spendResult.reservation,
      commit: async () => {
        await kp.commitSpend(spendResult.reservation);
      },
      refund: async () => {
        if (options.refundOnError) {
          await kp.refundSpend(spendResult.reservation);
        }
      },
    };

    next();
  };
}

function weiToUsdc(wei: string): string {
  const num = BigInt(wei);
  const whole = num / BigInt(1_000_000);
  const frac = num % BigInt(1_000_000);
  return `${whole}.${frac.toString().padStart(6, "0")}`;
}

export { KitePass } from "@kitepass/sdk-core";
export type { KitePassConfig, SessionState, SpendReservation } from "@kitepass/sdk-core";
