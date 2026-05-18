import { createHmac } from "node:crypto";
import { EventEmitter } from "node:events";

export interface WebhookConfig {
  url: string;
  secret: string;
  events?: string[];
}

export interface WebhookPayload {
  event: string;
  payload: unknown;
  timestamp: number;
}

export class WebhookDispatcher extends EventEmitter {
  constructor(private config: WebhookConfig) {
    super();
  }

  async dispatch(event: string, payload: unknown): Promise<void> {
    if (this.config.events && !this.config.events.includes(event)) return;

    const body = JSON.stringify({
      event,
      payload,
      timestamp: Date.now(),
    } satisfies WebhookPayload);

    const signature = createHmac("sha256", this.config.secret)
      .update(body)
      .digest("hex");

    try {
      const response = await fetch(this.config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KitePass-Signature": `sha256=${signature}`,
          "X-KitePass-Event": event,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this.emit("error", new Error(`Webhook returned ${response.status}`));
      }
    } catch (err) {
      this.emit("error", err);
    }
  }

  static verifySignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    return signature === `sha256=${expected}`;
  }
}

export const WEBHOOK_EVENTS = {
  PAYMENT_COMMITTED: "kitepass.payment.committed",
  PAYMENT_REFUNDED: "kitepass.payment.refunded",
  SESSION_EXHAUSTED: "kitepass.session.exhausted",
  RATE_LIMIT_TRIGGERED: "kitepass.rate_limit.triggered",
} as const;
