/**
 * BACKWARD-COMPATIBLE WRAPPER — v1 (real engine).
 * The hard-coded discovery catalog that used to live here was removed for
 * the same reason as in multiSourceHunter.ts: it invented companies and
 * guessed emails. Use `huntRealLeads` in realHunter.ts for new code.
 */

import { huntRealLeads } from "@/lib/discovery/realHunter";
import type { QualificationResult } from "@/lib/ai/qualify";

export interface DiscoveredLeadProfile {
  name: string;
  domain: string;
  industry: string;
  size: string;
  country: string;
  hiringSignals: string;
  contactName: string;
  contactEmail: string;
  contactTitle: string;
  qualification: QualificationResult;
}

export interface DiscoverySearchParams {
  personaKeyword: string;
  pillar: "CLIENT_MEETINGS" | "INTERVIEW_COPILOT" | "CUSTOMER_SUPPORT" | "BILINGUAL_AI";
  industry?: string;
  count?: number;
}

export async function discoverLeadsAutomatically(
  params: DiscoverySearchParams
): Promise<DiscoveredLeadProfile[]> {
  const result = await huntRealLeads({
    personaKeyword: params.personaKeyword,
    pillar: params.pillar,
    count: params.count,
  });
  if (!result.configured) {
    console.warn("[discovery] " + result.message);
    return [];
  }
  return result.leads.map((l) => ({
    name: l.name, domain: l.domain, industry: l.industry, size: l.size,
    country: l.country, hiringSignals: l.hiringSignals,
    contactName: l.contactName, contactEmail: l.contactEmail,
    contactTitle: l.contactTitle, qualification: l.qualification,
  }));
}
