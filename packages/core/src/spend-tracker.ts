import Redis from "ioredis";
import { randomUUID } from "node:crypto";

export interface SpendingRecord {
  reservationId: string;
  sessionId: string;
  serviceAddress: string;
  amount: bigint;
  timestamp: number;
  status: "reserved" | "committed" | "refunded" | "expired";
}

export interface SpendTrackerInterface {
  reserve(sessionId: string, serviceAddress: string, amount: bigint): Promise<SpendingRecord>;
  commit(reservationId: string): Promise<void>;
  refund(reservationId: string): Promise<void>;
  getSessionUsage(sessionId: string): Promise<{ reserved: bigint; spent: bigint }>;
  close(): Promise<void>;
}

export class RedisSpendTracker implements SpendTrackerInterface {
  private redis: Redis;

  constructor(
    private redisUrl: string,
    private ttlMs: number = 300_000,
  ) {
    this.redis = new Redis(redisUrl);
  }

  async reserve(
    sessionId: string,
    serviceAddress: string,
    amount: bigint,
  ): Promise<SpendingRecord> {
    const reservationId = randomUUID();
    const record: SpendingRecord = {
      reservationId,
      sessionId,
      serviceAddress,
      amount,
      timestamp: Date.now(),
      status: "reserved",
    };

    const key = `kp:res:${reservationId}`;
    const sessKey = `kp:sess:${sessionId}`;

    await this.redis
      .multi()
      .set(
        key,
        JSON.stringify({ ...record, amount: amount.toString() }),
        "PX",
        this.ttlMs,
      )
      .hincrby(sessKey, "reserved", Number(amount))
      .exec();

    return record;
  }

  async commit(reservationId: string): Promise<void> {
    const key = `kp:res:${reservationId}`;
    const raw = await this.redis.get(key);
    if (!raw) return;

    const record = JSON.parse(raw);
    if (record.status !== "reserved") return;

    const sessKey = `kp:sess:${record.sessionId}`;
    await this.redis
      .multi()
      .set(
        key,
        JSON.stringify({ ...record, status: "committed" }),
        "PX",
        this.ttlMs,
      )
      .hincrby(sessKey, "reserved", -Number(record.amount))
      .hincrby(sessKey, "spent", Number(record.amount))
      .exec();
  }

  async refund(reservationId: string): Promise<void> {
    const key = `kp:res:${reservationId}`;
    const raw = await this.redis.get(key);
    if (!raw) return;

    const record = JSON.parse(raw);
    if (record.status !== "reserved") return;

    const sessKey = `kp:sess:${record.sessionId}`;
    await this.redis
      .multi()
      .set(
        key,
        JSON.stringify({ ...record, status: "refunded" }),
        "PX",
        this.ttlMs,
      )
      .hincrby(sessKey, "reserved", -Number(record.amount))
      .exec();
  }

  async getSessionUsage(
    sessionId: string,
  ): Promise<{ reserved: bigint; spent: bigint }> {
    const sessKey = `kp:sess:${sessionId}`;
    const data = await this.redis.hgetall(sessKey);
    return {
      reserved: BigInt(data.reserved ?? 0),
      spent: BigInt(data.spent ?? 0),
    };
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export class InMemorySpendTracker implements SpendTrackerInterface {
  private reservations = new Map<string, SpendingRecord>();
  private sessionUsage = new Map<string, { reserved: bigint; spent: bigint }>();

  async reserve(
    sessionId: string,
    serviceAddress: string,
    amount: bigint,
  ): Promise<SpendingRecord> {
    const record: SpendingRecord = {
      reservationId: `rsv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      serviceAddress,
      amount,
      timestamp: Date.now(),
      status: "reserved",
    };

    this.reservations.set(record.reservationId, record);

    const usage = this.sessionUsage.get(sessionId) ?? {
      reserved: BigInt(0),
      spent: BigInt(0),
    };
    usage.reserved += amount;
    this.sessionUsage.set(sessionId, usage);

    setTimeout(() => {
      const r = this.reservations.get(record.reservationId);
      if (r && r.status === "reserved") {
        r.status = "expired";
        const u = this.sessionUsage.get(sessionId);
        if (u) u.reserved -= amount;
      }
    }, 300_000);

    return record;
  }

  async commit(reservationId: string): Promise<void> {
    const record = this.reservations.get(reservationId);
    if (!record || record.status !== "reserved") return;

    record.status = "committed";
    const usage = this.sessionUsage.get(record.sessionId);
    if (usage) {
      usage.reserved -= record.amount;
      usage.spent += record.amount;
    }
  }

  async refund(reservationId: string): Promise<void> {
    const record = this.reservations.get(reservationId);
    if (!record || record.status !== "reserved") return;

    record.status = "refunded";
    const usage = this.sessionUsage.get(record.sessionId);
    if (usage) {
      usage.reserved -= record.amount;
    }
  }

  async getSessionUsage(
    sessionId: string,
  ): Promise<{ reserved: bigint; spent: bigint }> {
    return this.sessionUsage.get(sessionId) ?? { reserved: BigInt(0), spent: BigInt(0) };
  }

  async close(): Promise<void> {}
}
