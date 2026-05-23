export const REQUIRED_ENVS = [
  "KITEPASS_SERVICES_URL",
  "KITEPASS_USAGE_URL",
  "KITEPASS_EVENTS_URL",
  "KITEPASS_POLICY_URL",
] as const;

export function getDashboardStatus() {
  const missing = REQUIRED_ENVS.filter((name) => !process.env[name]);

  return {
    data_status: missing.length === 0 ? "connected" : "connectors_required",
    connected_sources: REQUIRED_ENVS.length - missing.length,
    total_sources: REQUIRED_ENVS.length,
    missing_integrations: missing,
    sources: [
      {
        name: "Services",
        env: "KITEPASS_SERVICES_URL",
        description: "Registered SDK integrations and service metadata",
      },
      {
        name: "Usage",
        env: "KITEPASS_USAGE_URL",
        description: "Reserved, committed, and refunded payment usage",
      },
      {
        name: "Events",
        env: "KITEPASS_EVENTS_URL",
        description: "Webhook delivery and session/payment event stream",
      },
      {
        name: "Policies",
        env: "KITEPASS_POLICY_URL",
        description: "Policy violation and spending rule analytics",
      },
    ].map((source) => ({
      ...source,
      connected: Boolean(process.env[source.env]),
    })),
  };
}
