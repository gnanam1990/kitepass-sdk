import { KitePass, type KitePassConfig } from "@kitepass/sdk-core";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export interface KitePassFastifyOptions extends KitePassConfig {
  skipPaths?: string[];
}

export interface KitePassFastifyContext {
  sessionId: string;
  reservation: Awaited<ReturnType<KitePass["reserveSpend"]>>["reservation"];
  commit: () => Promise<void>;
  refund: () => Promise<void>;
}

declare module "fastify" {
  interface FastifyRequest {
    kitepass?: KitePassFastifyContext;
  }
}

export async function kitepassFastify(fastify: FastifyInstance, options: KitePassFastifyOptions) {
  const kp = new KitePass(options);
  const skipPaths = new Set(options.skipPaths ?? []);

  fastify.decorateRequest("kitepass", undefined);

  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (skipPaths.has(request.url)) return;

    const sessionId = request.headers["x-kite-session"] as string | undefined;
    if (!sessionId) {
      reply.code(401).send({ error: "Missing X-Kite-Session header" });
      return;
    }

    const verifyResult = await kp.verifySession(sessionId);
    if (!verifyResult.valid || !verifyResult.session) {
      reply.code(402).send({ error: "Invalid or expired session", details: verifyResult.error });
      return;
    }

    const session = verifyResult.session;
    reply.header("X-Kite-Tier", "paid");
    reply.header("X-Kite-Cost-Usd", options.pricePerCall);
    reply.header("X-Kite-Remaining-Usd", weiToUsdc(session.remainingTotal));
    reply.header("X-Kite-Service", options.serviceAddress);

    const spendResult = await kp.reserveSpend(sessionId, options.pricePerCall);
    if (!spendResult.success) {
      reply.code(402).send({ error: "Payment failed", details: spendResult.error });
      return;
    }

    request.kitepass = {
      sessionId,
      reservation: spendResult.reservation,
      commit: async () => { await kp.commitSpend(spendResult.reservation); },
      refund: async () => { if (options.refundOnError) await kp.refundSpend(spendResult.reservation); },
    };
  });
}

function weiToUsdc(wei: string): string {
  const num = BigInt(wei);
  const whole = num / BigInt(1_000_000);
  const frac = num % BigInt(1_000_000);
  return `${whole}.${frac.toString().padStart(6, "0")}`;
}

export { KitePass } from "@kitepass/sdk-core";
