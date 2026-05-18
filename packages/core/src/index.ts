export interface KitePassConfig {
  serviceAddress: string;
  pricePerCall: string;
  refundOnError?: boolean;
  rateLimitPerSession?: { max: number; window: string };
  kitePassUrl?: string;
}

export interface SessionState {
  sessionId: string;
  agentId: string;
  status: "active" | "expired" | "revoked";
  maxAmountPerTx: string;
  maxTotalAmount: string;
  spentTotal: string;
  remainingTotal: string;
  expiresAt: string;
}

export interface SpendReservation {
  reservationId: string;
  sessionId: string;
  amount: string;
  timestamp: number;
  status: "reserved" | "committed" | "refunded" | "expired";
}

export interface VerifyResult {
  valid: boolean;
  session: SessionState | null;
  error?: string;
}

export interface SpendResult {
  success: boolean;
  reservation: SpendReservation;
  remainingBalance: string;
  error?: string;
}

export class KitePass {
  private config: Required<KitePassConfig>;
  private sessionCache = new Map<string, { session: SessionState; cachedAt: number }>();
  private reservations = new Map<string, SpendReservation>();
  private rateLimiters = new Map<string, { tokens: number; lastRefill: number }>();
  private readonly CACHE_TTL_MS = 60_000;
  private readonly RESERVATION_TTL_MS = 300_000;

  constructor(config: KitePassConfig) {
    this.config = {
      serviceAddress: config.serviceAddress,
      pricePerCall: config.pricePerCall,
      refundOnError: config.refundOnError ?? true,
      rateLimitPerSession: config.rateLimitPerSession ?? { max: 100, window: "1h" },
      kitePassUrl: config.kitePassUrl ?? "https://passport.prod.gokite.ai",
    };
  }

  async verifySession(sessionId: string): Promise<VerifyResult> {
    const cached = this.sessionCache.get(sessionId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return { valid: cached.session.status === "active", session: cached.session };
    }

    try {
      const url = `${this.config.kitePassUrl}/v1/sessions/${sessionId}/verify`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_address: this.config.serviceAddress }),
      });

      if (!res.ok) {
        return { valid: false, session: null, error: `HTTP ${res.status}` };
      }

      const data = await res.json() as Record<string, unknown>;
      const session: SessionState = {
        sessionId: String(data.session_id ?? sessionId),
        agentId: String(data.agent_id ?? ""),
        status: (data.status as SessionState["status"]) ?? "expired",
        maxAmountPerTx: String(data.max_amount_per_tx ?? "0"),
        maxTotalAmount: String(data.max_total_amount ?? "0"),
        spentTotal: String(data.spent_total ?? "0"),
        remainingTotal: String(data.remaining_total ?? "0"),
        expiresAt: String(data.expires_at ?? ""),
      };

      this.sessionCache.set(sessionId, { session, cachedAt: Date.now() });
      return { valid: session.status === "active", session };
    } catch (err) {
      return { valid: false, session: null, error: String(err) };
    }
  }

  async reserveSpend(sessionId: string, amount: string): Promise<SpendResult> {
    const verifyResult = await this.verifySession(sessionId);
    if (!verifyResult.valid || !verifyResult.session) {
      return {
        success: false,
        reservation: this.createReservation(sessionId, amount, "expired"),
        remainingBalance: "0",
        error: verifyResult.error ?? "Session not active",
      };
    }

    const session = verifyResult.session;
    const amountWei = this.usdcToWei(amount);
    const remaining = BigInt(session.remainingTotal);

    if (amountWei > remaining) {
      return {
        success: false,
        reservation: this.createReservation(sessionId, amount, "expired"),
        remainingBalance: session.remainingTotal,
        error: "Insufficient balance",
      };
    }

    if (!this.checkRateLimit(sessionId)) {
      return {
        success: false,
        reservation: this.createReservation(sessionId, amount, "expired"),
        remainingBalance: session.remainingTotal,
        error: "Rate limit exceeded",
      };
    }

    const reservation = this.createReservation(sessionId, amount, "reserved");
    this.reservations.set(reservation.reservationId, reservation);

    setTimeout(() => {
      const r = this.reservations.get(reservation.reservationId);
      if (r && r.status === "reserved") {
        r.status = "expired";
      }
    }, this.RESERVATION_TTL_MS);

    return {
      success: true,
      reservation,
      remainingBalance: (remaining - amountWei).toString(),
    };
  }

  async commitSpend(reservation: SpendReservation): Promise<SpendResult> {
    const r = this.reservations.get(reservation.reservationId);
    if (!r || r.status !== "reserved") {
      return {
        success: false,
        reservation: r ?? reservation,
        remainingBalance: "0",
        error: "Reservation not found or not in reserved state",
      };
    }

    r.status = "committed";
    return { success: true, reservation: r, remainingBalance: "0" };
  }

  async refundSpend(reservation: SpendReservation): Promise<SpendResult> {
    const r = this.reservations.get(reservation.reservationId);
    if (!r || r.status !== "reserved") {
      return {
        success: false,
        reservation: r ?? reservation,
        remainingBalance: "0",
        error: "Reservation not found or not in reserved state",
      };
    }

    r.status = "refunded";
    return { success: true, reservation: r, remainingBalance: "0" };
  }

  getSessionCache(): Map<string, { session: SessionState; cachedAt: number }> {
    return this.sessionCache;
  }

  getReservations(): Map<string, SpendReservation> {
    return this.reservations;
  }

  private createReservation(
    sessionId: string,
    amount: string,
    status: SpendReservation["status"],
  ): SpendReservation {
    return {
      reservationId: `rsv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      amount,
      timestamp: Date.now(),
      status,
    };
  }

  private usdcToWei(amount: string): bigint {
    const [whole, frac = ""] = amount.split(".");
    const padded = (whole ?? "0") + frac.padEnd(6, "0").slice(0, 6);
    return BigInt(padded);
  }

  private checkRateLimit(sessionId: string): boolean {
    const { max, window } = this.config.rateLimitPerSession;
    const windowMs = this.parseWindow(window);
    const refillRate = max / windowMs;

    let limiter = this.rateLimiters.get(sessionId);
    if (!limiter) {
      limiter = { tokens: max, lastRefill: Date.now() };
      this.rateLimiters.set(sessionId, limiter);
    }

    const now = Date.now();
    const elapsed = now - limiter.lastRefill;
    limiter.tokens = Math.min(max, limiter.tokens + elapsed * refillRate);
    limiter.lastRefill = now;

    if (limiter.tokens >= 1) {
      limiter.tokens -= 1;
      return true;
    }
    return false;
  }

  private parseWindow(window: string): number {
    const match = window.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 3600_000;
    const value = parseInt(match[1]);
    switch (match[2]) {
      case "s": return value * 1000;
      case "m": return value * 60_000;
      case "h": return value * 3600_000;
      case "d": return value * 86400_000;
      default: return 3600_000;
    }
  }
}

export { RedisSpendTracker, InMemorySpendTracker } from "./spend-tracker.js";
export type { SpendingRecord, SpendTrackerInterface } from "./spend-tracker.js";
export { WebhookDispatcher, WEBHOOK_EVENTS } from "./webhooks.js";
export type { WebhookConfig, WebhookPayload } from "./webhooks.js";
export { PolicyEngine } from "./policy.js";
export type { PolicyRule, SpendingPolicy, PolicyCheckResult } from "./policy.js";

