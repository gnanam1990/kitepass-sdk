import { KitePass, type KitePassConfig } from "@kitepass/sdk-core";

export interface MCPPaymentGateOptions extends KitePassConfig {
  toolName: string;
  description?: string;
}

export function createPaymentGate(options: MCPPaymentGateOptions) {
  const kp = new KitePass(options);

  return {
    name: options.toolName,
    description: options.description ?? `Paid tool (requires X-Kite-Session header)`,
    async verify(sessionId: string | undefined): Promise<{
      allowed: boolean;
      commit: () => Promise<void>;
      refund: () => Promise<void>;
      error?: string;
    }> {
      if (!sessionId) {
        return {
          allowed: false,
          commit: async () => {},
          refund: async () => {},
          error: "Missing session ID",
        };
      }

      const verifyResult = await kp.verifySession(sessionId);
      if (!verifyResult.valid || !verifyResult.session) {
        return {
          allowed: false,
          commit: async () => {},
          refund: async () => {},
          error: verifyResult.error ?? "Invalid session",
        };
      }

      const spendResult = await kp.reserveSpend(sessionId, options.pricePerCall);
      if (!spendResult.success) {
        return {
          allowed: false,
          commit: async () => {},
          refund: async () => {},
          error: spendResult.error ?? "Payment failed",
        };
      }

      return {
        allowed: true,
        commit: async () => { await kp.commitSpend(spendResult.reservation); },
        refund: async () => { if (options.refundOnError) await kp.refundSpend(spendResult.reservation); },
      };
    },
  };
}

export { KitePass } from "@kitepass/sdk-core";
