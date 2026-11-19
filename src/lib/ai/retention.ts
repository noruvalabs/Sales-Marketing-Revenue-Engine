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
  // Returns real active customer health profiles (empty initially until customers convert)
  return [];
}

