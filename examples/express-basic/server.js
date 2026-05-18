import express from "express";
import { kitepass } from "@kitepass/sdk-express";

const app = express();
app.use(express.json());

const SERVICE_ADDRESS = process.env.SERVICE_ADDRESS || "0x1234567890abcdef1234567890abcdef12345678";

app.use(
  kitepass({
    serviceAddress: SERVICE_ADDRESS,
    pricePerCall: "0.001",
    refundOnError: true,
    rateLimitPerSession: { max: 100, window: "1h" },
    skipPaths: ["/health", "/free"],
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/free", (_req, res) => {
  res.json({ message: "This endpoint is free!" });
});

app.get("/paid", async (req, res) => {
  try {
    res.json({
      message: "This is a paid endpoint!",
      sessionId: req.kitepass?.sessionId,
      timestamp: new Date().toISOString(),
    });
    await req.kitepass?.commit();
  } catch (err) {
    await req.kitepass?.refund();
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/paid/data", async (req, res) => {
  try {
    res.json({
      message: "Data processed",
      input: req.body,
      sessionId: req.kitepass?.sessionId,
    });
    await req.kitepass?.commit();
  } catch (err) {
    await req.kitepass?.refund();
    res.status(500).json({ error: "Internal error" });
  }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Express example running on http://localhost:${PORT}`);
  console.log("Endpoints:");
  console.log("  GET /health - free");
  console.log("  GET /free   - free");
  console.log("  GET /paid   - requires X-Kite-Session header");
  console.log("  POST /paid/data - requires X-Kite-Session header");
});
