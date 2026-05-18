import { describe, it, expect } from "vitest";
import { KitePass } from "../src/index.js";

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
