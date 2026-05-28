import { describe, it, expect } from "vitest";
import { KitePass } from "../src/index.js";
import { PolicyEngine } from "../src/policy.js";

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
