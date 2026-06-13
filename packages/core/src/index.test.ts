import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { KitePass } from "../src/index.js";
import { PolicyEngine } from "../src/policy.js";
import { WebhookDispatcher } from "../src/webhooks.js";

describe("KitePass", () => {
  it("creates instance with config", () => {
    const kp = new KitePass({
      serviceAddress: "0x1234567890abcdef1234567890abcdef12345678",
      pricePerCall: "0.001",
    });
    expect(kp).toBeDefined();
  });

  it("returns invalid for unknown session", async () => {
    const kp = new KitePass({
      serviceAddress: "0x1234567890abcdef1234567890abcdef12345678",
      pricePerCall: "0.001",
      kitePassUrl: "https://passport.prod.gokite.ai",
    });
    const result = await kp.verifySession("invalid_session_id");
    expect(result.valid).toBe(false);
  });

  it("creates reservation object", () => {
    const kp = new KitePass({
      serviceAddress: "0x1234567890abcdef1234567890abcdef12345678",
      pricePerCall: "0.001",
    });
    const reservations = kp.getReservations();
    expect(reservations.size).toBe(0);
  });
});

describe("PolicyEngine", () => {
  const localTime = (hour: number, minute: number) => new Date(2026, 0, 1, hour, minute).getTime();

  it("allows same-day time windows", () => {
    const engine = new PolicyEngine({
      rules: [{ type: "time_window", start: "09:00", end: "17:00" }],
      on_violation: "block",
    });

    expect(engine.check(BigInt(1), { timestamp: localTime(12, 0) }).allowed).toBe(true);
  });

  it("allows overnight time windows after midnight", () => {
    const engine = new PolicyEngine({
      rules: [{ type: "time_window", start: "22:00", end: "02:00" }],
      on_violation: "block",
    });

    expect(engine.check(BigInt(1), { timestamp: localTime(1, 30) }).allowed).toBe(true);
  });

  it("blocks outside overnight time windows", () => {
    const engine = new PolicyEngine({
      rules: [{ type: "time_window", start: "22:00", end: "02:00" }],
      on_violation: "block",
    });

    expect(engine.check(BigInt(1), { timestamp: localTime(12, 0) }).allowed).toBe(false);
  });
});

describe("WebhookDispatcher.verifySignature", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ event: "kitepass.payment.committed", payload: {}, timestamp: 1 });
  const validSignature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

  it("accepts a correct signature", () => {
    expect(WebhookDispatcher.verifySignature(payload, validSignature, secret)).toBe(true);
  });

  it("rejects a tampered signature of the same length", () => {
    const tampered = validSignature.slice(0, -1) + (validSignature.endsWith("0") ? "1" : "0");
    expect(WebhookDispatcher.verifySignature(payload, tampered, secret)).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    expect(WebhookDispatcher.verifySignature(payload, validSignature, "wrong_secret")).toBe(false);
  });

  it("rejects signatures of differing length without throwing", () => {
    expect(WebhookDispatcher.verifySignature(payload, "sha256=deadbeef", secret)).toBe(false);
    expect(WebhookDispatcher.verifySignature(payload, "", secret)).toBe(false);
  });

  it("rejects a non-string signature", () => {
    expect(WebhookDispatcher.verifySignature(payload, undefined as unknown as string, secret)).toBe(false);
  });
});
