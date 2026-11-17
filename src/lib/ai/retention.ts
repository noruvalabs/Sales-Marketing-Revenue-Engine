export interface CustomerHealthProfile {
  id: string;
  companyName: string;
  domain: string;
  mrr: number;
  healthScore: number; // 0 to 100
  status: "HEALTHY" | "AT_RISK" | "EXPANSION_OPPORTUNITY";
  callsAssistedThisMonth: number;
  lastActiveDaysAgo: number;
  recommendedAction: string;
}

export function evaluateCustomerHealth(): CustomerHealthProfile[] {
  return [
    {
      id: "cust-1",
      companyName: "CloudScale Systems",
      domain: "cloudscale.io",
      mrr: 600,
      healthScore: 94,
      status: "EXPANSION_OPPORTUNITY",
      callsAssistedThisMonth: 142,
      lastActiveDaysAgo: 1,
      recommendedAction: "Team license maxed out (4 SDR seats). Proactively offer Team Plan upgrade for 10 seats ($1,200/mo).",
    },
    {
      id: "cust-2",
      companyName: "TalentForge Global",
      domain: "talentforge.co",
      mrr: 450,
      healthScore: 68,
      status: "AT_RISK",
      callsAssistedThisMonth: 8,
      lastActiveDaysAgo: 8,
      recommendedAction: "No active interview assists in 8 days. Trigger automated check-in email with 'Interview Copilot Best Practices Guide'.",
    },
  ];
}

