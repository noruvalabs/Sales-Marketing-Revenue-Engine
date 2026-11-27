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

export type LeadProviderName = "WEB" | "PROSPEO" | "APOLLO" | "HUNTER";

export interface ProviderLead {
  companyName: string;
  domain: string;
  industry?: string;
  size?: string;
  country?: string;
  contactName: string;
  contactEmail: string;
  contactTitle: string;
  /** Phone/mobile when the source provides one (Prospeo mobile reveal,
   *  or a number the company published on its own website). */
  phone?: string;
  linkedinUrl?: string;
  source: LeadProviderName;
  sourceUrl?: string;
  verified?: boolean;
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
  /** Result page to fetch. Rotated by the hunter so repeated runs do not
   *  keep returning the same first page of people. */
  page?: number;
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
    const filters: any = {
      person_job_title: {
        include: query.titles && query.titles.length > 0
          ? query.titles
          : ["VP Sales", "Head of Sales", "Sales Director", "Founder", "CEO"],
      },
      company_industry: {
        include: ["Technology, Information and Internet", "Software Development"],
      },
    };
    if (query.domains && query.domains.length > 0) {
      delete filters.company_industry;
      filters.company_domain = { include: query.domains };
    }

    const res = await fetch("https://api.prospeo.io/search-person", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-KEY": apiKey },
      body: JSON.stringify({
        page: query.page && query.page > 0 ? query.page : 1,
        filters,
      }),
    });
    if (!res.ok) throw new Error(`Prospeo HTTP ${res.status}`);
    const data: any = await res.json();
    const rawPeople: any[] = data?.results || data?.people || [];
    const countTarget = query.count || 4;
    const leads: ProviderLead[] = [];

    for (const p of rawPeople) {
      if (leads.length >= countTarget) break;

      let email = p?.person?.email?.email || p?.email?.email || p?.email || p?.person?.email;
      let emailStatus = p?.person?.email?.status || p?.email?.status;
      let emailRevealed = p?.person?.email?.revealed ?? p?.email?.revealed;
      let name = p?.person?.full_name || p?.full_name || [p?.person?.first_name || p?.first_name, p?.person?.last_name || p?.last_name].filter(Boolean).join(" ");
      let domain = cleanDomain(p?.company?.domain || p?.domain || "");
      let jobTitle = p?.person?.current_job_title || p?.person?.job_title || p?.job_title || "Decision Maker";
      let companyName = p?.company?.name || domain;
      let linkedinUrl = p?.person?.linkedin_url || p?.linkedin_url;
      let industry = p?.company?.industry;
      let size = p?.company?.employee_count?.toString();
      let country = p?.person?.location?.country || p?.company?.location?.country;

      // Phone (develop2): take a mobile if the search result already
      // carries one. A separate paid reveal happens below, behind a flag.
      const phoneFromPerson = (src: any): string | undefined => {
        const m =
          src?.person?.mobile?.number || src?.person?.mobile_number || src?.person?.mobile ||
          src?.person?.phone_number || src?.person?.phone ||
          src?.mobile?.number || src?.mobile_number || src?.mobile || src?.phone_number || src?.phone;
        return typeof m === "string" && m.replace(/\D/g, "").length >= 7 ? m : undefined;
      };
      let phone = phoneFromPerson(p);

      // If email is masked (e.g. s********@...) or not revealed, call enrich-person to reveal real email
      const personId = p?.person?.person_id || p?.person_id;
      if (personId && (!email || String(email).includes("*") || !emailRevealed)) {
        try {
          const enrichRes = await fetch("https://api.prospeo.io/enrich-person", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-KEY": apiKey },
            body: JSON.stringify({
              only_verified_email: true,
              data: { person_id: personId },
            }),
          });
          if (enrichRes.ok) {
            const enrichData: any = await enrichRes.json();
            const revealedEmail = enrichData?.person?.email?.email;
            if (revealedEmail && !revealedEmail.includes("*")) {
              email = revealedEmail;
              emailStatus = enrichData?.person?.email?.status;
              name = enrichData?.person?.full_name || name;
              jobTitle = enrichData?.person?.current_job_title || jobTitle;
              companyName = enrichData?.company?.name || companyName;
              domain = cleanDomain(enrichData?.company?.domain || domain);
              linkedinUrl = enrichData?.person?.linkedin_url || linkedinUrl;
              phone = phoneFromPerson(enrichData) || phone;
            }
          }
        } catch (enrichErr) {
          console.warn("Prospeo enrich error for person:", personId, enrichErr);
        }
      }

      // Paid mobile reveal (develop2, Sazzad's direction 2026-11-27: the
      // lead finder should also bring phone numbers for the call agent).
      // A verified mobile costs 10 Prospeo credits (email is 1), so this
      // runs ONLY when PROSPEO_REVEAL_MOBILE=true in .env — with it off,
      // discovery costs exactly what it cost before.
      if (!phone && personId && process.env.PROSPEO_REVEAL_MOBILE === "true") {
        try {
          const mobRes = await fetch("https://api.prospeo.io/enrich-person", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-KEY": apiKey },
            body: JSON.stringify({ data: { person_id: personId } }),
          });
          if (mobRes.ok) {
            const mobData: any = await mobRes.json();
            phone = phoneFromPerson(mobData) || phone;
          }
        } catch (mobErr) {
          console.warn("Prospeo mobile reveal error for person:", personId, mobErr);
        }
      }

      if (!email || String(email).includes("*") || !name || !domain) continue;

      leads.push({
        companyName,
        domain,
        industry,
        size,
        country,
        contactName: name,
        contactEmail: String(email).toLowerCase(),
        contactTitle: jobTitle,
        phone,
        linkedinUrl,
        source: "PROSPEO" as const,
        sourceUrl: linkedinUrl,
        verified: emailStatus === "VERIFIED",
      });
    }
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
        page: query.page && query.page > 0 ? ((query.page - 1) % 10) + 1 : 1,
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
