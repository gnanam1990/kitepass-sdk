import { KitePass, type KitePassConfig } from "@kitepass/sdk-core";
import { NextResponse, type NextRequest } from "next/server";

export interface KitePassNextOptions extends KitePassConfig {
  skipPaths?: string[];
}

export function createKitePassMiddleware(options: KitePassNextOptions) {
  const kp = new KitePass(options);
  const skipPaths = new Set(options.skipPaths ?? []);

  return async function kitepassMiddleware(request: NextRequest) {
    if (skipPaths.has(request.nextUrl.pathname)) {
      return NextResponse.next();
    }

    const sessionId = request.headers.get("x-kite-session");
    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing X-Kite-Session header" },
        { status: 401 }
      );
    }

    const verifyResult = await kp.verifySession(sessionId);
    if (!verifyResult.valid || !verifyResult.session) {
      return NextResponse.json(
        { error: "Invalid or expired session", details: verifyResult.error },
        { status: 402 }
      );
    }

    const session = verifyResult.session;
    const spendResult = await kp.reserveSpend(sessionId, options.pricePerCall);
    if (!spendResult.success) {
      return NextResponse.json(
        { error: "Payment failed", details: spendResult.error },
        { status: 402 }
      );
    }

    const response = NextResponse.next();
    response.headers.set("X-Kite-Tier", "paid");
    response.headers.set("X-Kite-Cost-Usd", options.pricePerCall);
    response.headers.set("X-Kite-Remaining-Usd", weiToUsdc(session.remainingTotal));
    response.headers.set("X-Kite-Service", options.serviceAddress);
    response.headers.set("X-Kite-Session", sessionId);
    response.headers.set("X-Kite-Reservation", spendResult.reservation.reservationId);

    return response;
  };
}

export async function withKitePass(
  request: NextRequest,
  options: KitePassNextOptions,
  handler: (kp: { sessionId: string; commit: () => Promise<void>; refund: () => Promise<void> }) => Promise<NextResponse>
): Promise<NextResponse> {
  const kp = new KitePass(options);
  const sessionId = request.headers.get("x-kite-session");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing X-Kite-Session header" }, { status: 401 });
  }

  const verifyResult = await kp.verifySession(sessionId);
  if (!verifyResult.valid || !verifyResult.session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 402 });
  }

  const spendResult = await kp.reserveSpend(sessionId, options.pricePerCall);
  if (!spendResult.success) {
    return NextResponse.json({ error: "Payment failed" }, { status: 402 });
  }

  try {
    const result = await handler({
      sessionId,
      commit: async () => { await kp.commitSpend(spendResult.reservation); },
      refund: async () => { if (options.refundOnError) await kp.refundSpend(spendResult.reservation); },
    });
    return result;
  } catch (err) {
    if (options.refundOnError) await kp.refundSpend(spendResult.reservation);
    throw err;
  }
}

function weiToUsdc(wei: string): string {
  const num = BigInt(wei);
  const whole = num / BigInt(1_000_000);
  const frac = num % BigInt(1_000_000);
  return `${whole}.${frac.toString().padStart(6, "0")}`;
}

export { KitePass } from "@kitepass/sdk-core";
