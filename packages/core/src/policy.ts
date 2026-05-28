export type PolicyRule =
  | { type: "max_per_window"; window: string; max: string }
  | { type: "max_per_tx"; max: string }
  | { type: "category_whitelist"; categories: string[] }
  | { type: "time_window"; start: string; end: string };

export interface SpendingPolicy {
  rules: PolicyRule[];
  on_violation: "block" | "warn" | "throttle";
}

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  rule?: PolicyRule;
}

export class PolicyEngine {
  constructor(private policy: SpendingPolicy) {}

  check(
    amount: bigint,
    context: {
      category?: string;
      timestamp?: number;
      sessionReserved?: bigint;
      sessionSpent?: bigint;
    },
  ): PolicyCheckResult {
    for (const rule of this.policy.rules) {
      const result = this.checkRule(rule, amount, context);
      if (!result.allowed) return result;
    }
    return { allowed: true };
  }

  private checkRule(
    rule: PolicyRule,
    amount: bigint,
    context: {
      category?: string;
      timestamp?: number;
      sessionReserved?: bigint;
      sessionSpent?: bigint;
    },
  ): PolicyCheckResult {
    switch (rule.type) {
      case "max_per_tx": {
        const max = this.parseAmount(rule.max);
        if (amount > max) {
          return {
            allowed: false,
            reason: `Amount ${amount} exceeds max per tx ${rule.max}`,
            rule,
          };
        }
        return { allowed: true };
      }

      case "max_per_window": {
        const max = this.parseAmount(rule.max);
        const totalUsed = (context.sessionSpent ?? BigInt(0)) + (context.sessionReserved ?? BigInt(0));
        if (totalUsed + amount > max) {
          return {
            allowed: false,
            reason: `Window limit exceeded: ${totalUsed} + ${amount} > ${rule.max}`,
            rule,
          };
        }
        return { allowed: true };
      }

      case "category_whitelist": {
        if (context.category && !rule.categories.includes(context.category)) {
          return {
            allowed: false,
            reason: `Category "${context.category}" not in whitelist`,
            rule,
          };
        }
        return { allowed: true };
      }

      case "time_window": {
        const now = context.timestamp ?? Date.now();
        const date = new Date(now);
        const currentMinute = (date.getHours() * 60) + date.getMinutes();
        const startMinute = this.parseTimeOfDay(rule.start);
        const endMinute = this.parseTimeOfDay(rule.end);
        const inWindow = startMinute <= endMinute
          ? currentMinute >= startMinute && currentMinute <= endMinute
          : currentMinute >= startMinute || currentMinute <= endMinute;

        if (!inWindow) {
          return {
            allowed: false,
            reason: `Outside allowed time window (${rule.start}-${rule.end})`,
            rule,
          };
        }
        return { allowed: true };
      }

      default:
        return { allowed: true };
    }
  }

  private parseAmount(amount: string): bigint {
    const [whole, frac = ""] = amount.split(".");
    const padded = (whole ?? "0") + frac.padEnd(6, "0").slice(0, 6);
    return BigInt(padded);
  }

  private parseTimeOfDay(value: string): number {
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) {
      throw new Error(`Invalid time_window value "${value}". Expected HH:mm.`);
    }
    return (Number(match[1]) * 60) + Number(match[2]);
  }
}
