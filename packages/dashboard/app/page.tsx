import { getDashboardStatus } from "@/lib/status";

export default function HomePage() {
  const status = getDashboardStatus();

  return (
    <main className="grid">
      <section className="hero">
        <div className="eyebrow">Kite Agent Passport</div>
        <h1>KitePass Dashboard</h1>
        <p className="lead">
          Hosted monitoring surface for SDK usage, service integrations, webhook events, and
          spending policies. This deployment is live, but analytics remain disabled until real
          KitePass connector endpoints are configured.
        </p>
      </section>

      <section className="grid stats">
        <Stat label="Data status" value={status.data_status === "connected" ? "Live" : "Connectors required"} />
        <Stat label="Connected sources" value={`${status.connected_sources}/${status.total_sources}`} />
        <Stat label="SDK packages" value="6" note="Core, Express, Hono, Fastify, Next, MCP." />
        <Stat label="Missing envs" value={String(status.missing_integrations.length)} note={status.missing_integrations.join(", ")} />
      </section>

      <section className="card notice">
        <h2>Real usage backend required</h2>
        <p className="note">
          Fake charts and synthetic payment usage are disabled. Configure the KitePass dashboard
          source URLs before exposing analytics to users.
        </p>
      </section>

      <section className="grid stats">
        {status.sources.map((source) => (
          <div className="card" key={source.env}>
            <div className="card-label">{source.name}</div>
            <div className="metric">{source.connected ? "Connected" : "Needs API"}</div>
            <p className="note">{source.description}</p>
            <p className="note mono">{source.env}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="metric">{value}</div>
      {note && <p className="note">{note}</p>}
    </div>
  );
}
