/**
 * Real lead-data providers — Apollo, Prospeo, Hunter.
 *
 * v1 fix: the old code claimed to search Apollo / Google / LinkedIn /
 * Facebook but returned a hard-coded catalog with guessed CEO emails.
 * These clients call the real APIs. With no API key a provider reports
 * `configured: false` and returns nothing — it never invents a lead.
 *
 * Free tiers (checked Nov 2026, re-check before paying):
 * - Prospeo: 75 verified emails/month free, no card. ~$0.01/email paid.
 * - Apollo:  free plan with credits; data is stale-prone, always verify.
 * - Hunter:  50 credits/month free (finder + verifier).
 * Every email returned here still goes through emailVerifier before use.
 */

export type LeadProviderName = "PROSPEO" | "APOLLO" | "HUNTER";

export interface ProviderLead {
  companyName: string;
  domain: string;
  industry?: string;
  size?: string;
  country?: string;
  contactName: string;
  contactEmail: string;
  contactTitle: string;
  linkedinUrl?: string;
  source: LeadProviderName;
  sourceUrl?: string;
}

export interface ProviderResult {
  provider: LeadProviderName;
  configured: boolean;
  leads: ProviderLead[];
  error?: string;
}

export interface LeadSearchQuery {
  /** Job titles to target, e.g. ["VP Sales", "Head of Talent"] */
  titles?: string[];
  /** Free-text keywords, e.g. "B2B SaaS remote sales" */
  keywords?: string;
  /** Company domains to find people at (Hunter finder path) */
  domains?: string[];
  count?: number;
}

function cleanDomain(raw: string): string {
  return (raw || "").toLowerCase().trim()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

/* ---------------------------------- Prospeo ---------------------------------- */

export async function searchProspeo(query: LeadSearchQuery): Promise<ProviderResult> {
  const apiKey = process.env.PROSPEO_API_KEY;
  if (!apiKey) return { provider: "PROSPEO", configured: false, leads: [] };
  try {
    const res = await fetch("https://api.prospeo.io/search-person", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-KEY": apiKey },
      body: JSON.stringify({
        page: 1,
        filters: {
          person_job_title: { include: query.titles || [] },
          ...(query.keywords ? { person_location_search: query.keywords } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`Prospeo HTTP ${res.status}`);
    const data: any = await res.json();
    const people: any[] = data?.results || data?.people || [];
    const leads: ProviderLead[] = people.slice(0, query.count || 10).flatMap((p: any) => {
      const email = p?.email?.email || p?.email || p?.person?.email;
      const domain = cleanDomain(p?.company?.domain || p?.domain || (email ? email.split("@")[1] : ""));
      const name = p?.person?.full_name || p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ");
      if (!email || !name || !domain) return [];
      return [{
        companyName: p?.company?.name || domain, domain,
        industry: p?.company?.industry, size: p?.company?.employee_count?.toString(),
        country: p?.person?.location || p?.company?.location,
        contactName: name, contactEmail: String(email).toLowerCase(),
        contactTitle: p?.person?.job_title || p?.job_title || "Decision Maker",
        linkedinUrl: p?.person?.linkedin_url || p?.linkedin_url,
        source: "PROSPEO" as const, sourceUrl: p?.person?.linkedin_url,
      }];
    });
    return { provider: "PROSPEO", configured: true, leads };
  } catch (err: any) {
    return { provider: "PROSPEO", configured: true, leads: [], error: err.message };
  }
}

/* ---------------------------------- Apollo ----------------------------------- */

export async function searchApollo(query: LeadSearchQuery): Promise<ProviderResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return { provider: "APOLLO", configured: false, leads: [] };
  try {
    const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey, "Cache-Control": "no-cache" },
      body: JSON.stringify({
        person_titles: query.titles || [],
        q_keywords: query.keywords || "",
        per_page: Math.min(query.count || 10, 25),
        page: 1,
      }),
    });
    if (!res.ok) throw new Error(`Apollo HTTP ${res.status}`);
    const data: any = await res.json();
    const people: any[] = data?.people || [];
    const leads: ProviderLead[] = people.flatMap((p: any) => {
      // Apollo search often hides the email until an enrich call. A lead
      // without a real email is dropped here — never pattern-guessed.
      const email = p?.email;
      const domain = cleanDomain(p?.organization?.primary_domain || p?.organization?.website_url || "");
      const name = p?.name || [p?.first_name, p?.last_name].filter(Boolean).join(" ");
      if (!email || !name || !domain) return [];
      return [{
        companyName: p?.organization?.name || domain, domain,
        industry: p?.organization?.industry,
        size: p?.organization?.estimated_num_employees?.toString(),
        country: p?.country,
        contactName: name, contactEmail: String(email).toLowerCase(),
        contactTitle: p?.title || "Decision Maker",
        linkedinUrl: p?.linkedin_url,
        source: "APOLLO" as const, sourceUrl: p?.linkedin_url,
      }];
    });
    return { provider: "APOLLO", configured: true, leads };
  } catch (err: any) {
    return { provider: "APOLLO", configured: true, leads: [], error: err.message };
  }
}

/* ---------------------------------- Hunter ----------------------------------- */

export async function searchHunter(query: LeadSearchQuery): Promise<ProviderResult> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return { provider: "HUNTER", configured: false, leads: [] };
  const leads: ProviderLead[] = [];
  try {
    // Hunter path: for each target domain, list real people at that company.
    for (const rawDomain of (query.domains || []).slice(0, 5)) {
      const domain = cleanDomain(rawDomain);
      if (!domain) continue;
      const res = await fetch(
        `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(apiKey)}&limit=${query.count || 10}`
      );
      if (!res.ok) throw new Error(`Hunter HTTP ${res.status}`);
      const data: any = await res.json();
      for (const e of data?.data?.emails || []) {
        if (!e?.value) continue;
        const name = [e.first_name, e.last_name].filter(Boolean).join(" ") || "Decision Maker";
        leads.push({
          companyName: data?.data?.organization || domain, domain,
          industry: data?.data?.industry, country: data?.data?.country,
          contactName: name, contactEmail: String(e.value).toLowerCase(),
          contactTitle: e.position || "Decision Maker",
          linkedinUrl: e.linkedin, source: "HUNTER", sourceUrl: e.sources?.[0]?.uri,
        });
      }
    }
    return { provider: "HUNTER", configured: true, leads };
  } catch (err: any) {
    return { provider: "HUNTER", configured: true, leads, error: err.message };
  }
}

export function configuredProviders(): LeadProviderName[] {
  const out: LeadProviderName[] = [];
  if (process.env.PROSPEO_API_KEY) out.push("PROSPEO");
  if (process.env.APOLLO_API_KEY) out.push("APOLLO");
  if (process.env.HUNTER_API_KEY) out.push("HUNTER");
  return out;
}
