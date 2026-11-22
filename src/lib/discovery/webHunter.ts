/**
 * Web Hunter — OUR OWN lead provider (no third-party lead database).
 *
 * Mission (set by Sazzad, 2026-11-22): this becomes the MAIN provider.
 * Prospeo / Apollo / Hunter stay as secondary top-up only.
 *
 * How it works:
 *   1. SEARCH  — find companies on the open web matching the pillar's
 *      buyer profile (Tavily search API when TAVILY_API_KEY is set;
 *      seed domains can also be passed directly).
 *   2. CRAWL   — visit each company's own website (home, contact, about,
 *      team, careers pages) with a polite user-agent and small delays.
 *   3. EXTRACT — pull only emails the company PUBLISHED itself (mailto
 *      links and visible text). Nothing is pattern-guessed, ever.
 *   4. SIGNALS — hiring/careers text becomes the qualification signal.
 *
 * Honest limits, by design:
 *   - Most web-published emails are team inboxes (hello@, contact@) or a
 *     founder's public email — decision-maker emails are rarely public.
 *     These leads are therefore NEVER pre-verified: they go through the
 *     normal verification gate (MillionVerifier) and, until verified,
 *     wait in Approvals instead of auto-sending.
 *   - Facebook / LinkedIn are NOT scraped: automated scraping violates
 *     their terms and gets accounts banned. Facebook leads enter this
 *     system only through official paths (your own Page's Lead Ads or
 *     manual entry) — see docs/REAL_V1.md.
 *   - With no search key and no seed domains this returns
 *     `configured: false` and zero leads — it never invents data.
 */

export interface WebLead {
  companyName: string;
  domain: string;
  industry: string;
  size: string;
  country: string;
  contactName: string;
  contactEmail: string;
  contactTitle: string;
  source: "WEB";
  sourceUrl?: string;
  hiringSignals: string;
  /** True when the address is a generic team inbox (hello@, info@…). */
  isRoleEmail: boolean;
}

export interface WebHuntResult {
  configured: boolean;
  message: string;
  leads: WebLead[];
  companiesChecked: number;
  companiesWithEmail: number;
}

const ROLE_PREFIXES = new Set([
  "info", "hello", "contact", "support", "sales", "team", "hi",
  "enquiries", "inquiries", "office", "admin", "help", "general",
]);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Addresses that appear in page code but are not real inboxes.
const JUNK_PATTERNS = [
  /@sentry\./i, /@wixpress\.com$/i, /@example\./i, /@domain\.com$/i,
  /@email\.com$/i, /@yourdomain/i, /\.png$/i, /\.jpe?g$/i, /\.svg$/i,
  /@2x/i, /godaddy/i, /@squarespace/i,
  // Placeholder addresses and site-builder/hosting domains are not inboxes.
  /@company\.com$/i, /@company\.co$/i, /cloudwaysapps\.com$/i,
  /wixsite\.com$/i, /godaddysites\.com$/i, /@yourcompany/i,
];

const PILLAR_QUERIES: Record<string, string[]> = {
  CLIENT_MEETINGS: [
    'B2B SaaS company "sales team" "contact us" about',
    'software company "account executives" team about us',
    'marketing agency "client success" team contact',
  ],
  INTERVIEW_COPILOT: [
    'staffing agency "our recruiters" team contact',
    'tech startup "talent acquisition" team about',
    'recruitment agency services team contact us',
  ],
  CUSTOMER_SUPPORT: [
    'SaaS company "customer success team" about contact',
    'ecommerce company "customer support" team about us',
  ],
  BILINGUAL_AI: [
    'global company "multilingual" services team contact',
    'international outsourcing company bilingual support about',
  ],
};

function cleanDomain(raw: string): string {
  return (raw || "").toLowerCase().trim()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0];
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchPage(url: string, timeoutMs = 9000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NoruvaLeadResearch/1.0; +https://ai.noruvalabs.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("text")) return null;
    return (await res.text()).slice(0, 400_000);
  } catch {
    return null;
  }
}

/** Extract emails a page publishes itself. Exported for tests. */
export function extractEmails(html: string, domain: string): string[] {
  const found = new Set<string>();
  const mailtos = html.match(/mailto:([^"'?>\s]+)/gi) || [];
  for (const m of mailtos) {
    const e = decodeURIComponent(m.replace(/^mailto:/i, "")).toLowerCase().trim();
    if (e) found.add(e);
  }
  const textHits = html.match(EMAIL_RE) || [];
  for (const e of textHits) found.add(e.toLowerCase().trim());

  const d = cleanDomain(domain);
  const valid = [...found].filter((e) => {
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return false;
    if (JUNK_PATTERNS.some((re) => re.test(e))) return false;
    return true;
  });
  // Prefer emails on the company's own domain, then others (agencies etc.)
  return valid.sort((a, b) => {
    const aOwn = a.endsWith("@" + d) ? 0 : 1;
    const bOwn = b.endsWith("@" + d) ? 0 : 1;
    return aOwn - bOwn;
  });
}

function pickBestEmail(emails: string[]): { email: string; isRole: boolean } | null {
  if (emails.length === 0) return null;
  // Prefer a named-person address over a team inbox when both are published.
  const personal = emails.find((e) => !ROLE_PREFIXES.has(e.split("@")[0]));
  if (personal) return { email: personal, isRole: false };
  return { email: emails[0], isRole: true };
}

function companyNameFromHtml(html: string, domain: string): string {
  const og = html.match(/property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1];
  if (og) return og.trim();
  const title = html.match(/<title[^>]*>([^<|–—-]+)/i)?.[1];
  if (title && title.trim().length > 1) return title.trim();
  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function hiringSignalsFromHtml(html: string): string {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const hits: string[] = [];
  const patterns = [
    /we'?re hiring[^.]{0,80}/i, /join our team[^.]{0,60}/i,
    /hiring (?:a|an|our)? ?[a-z ]{0,40}(?:sales|engineer|support|recruiter|account executive|sdr)[a-z ]{0,30}/i,
    /open positions?[^.]{0,60}/i, /careers[^.]{0,40}/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) hits.push(m[0].trim());
    if (hits.length >= 2) break;
  }
  return hits.join("; ");
}

async function crawlCompany(domain: string): Promise<WebLead | null> {
  const d = cleanDomain(domain);
  if (!d || !d.includes(".")) return null;
  const paths = ["", "/contact", "/contact-us", "/about", "/about-us", "/team", "/careers"];
  let allEmails: string[] = [];
  let companyName = "";
  let signals = "";
  let firstHtml: string | null = null;

  for (const path of paths) {
    const html = await fetchPage(`https://${d}${path}`);
    if (!html) continue;
    if (!firstHtml) firstHtml = html;
    allEmails = [...new Set([...allEmails, ...extractEmails(html, d)])];
    if (!signals) signals = hiringSignalsFromHtml(html);
    if (allEmails.length > 0 && path !== "" && path !== "/contact") break;
    await sleep(300);
  }
  if (!firstHtml) return null;
  companyName = companyNameFromHtml(firstHtml, d);
  const best = pickBestEmail(allEmails);
  if (!best) return null;

  return {
    companyName,
    domain: d,
    industry: "Technology",
    size: "Unknown",
    country: "Global",
    contactName: best.isRole ? `${companyName} Team` : "Decision Maker",
    contactEmail: best.email,
    contactTitle: best.isRole ? "Team Inbox (published on website)" : "Published contact",
    source: "WEB",
    sourceUrl: `https://${d}`,
    hiringSignals: signals || "Found via web search; public contact email published on company website",
    isRoleEmail: best.isRole,
  };
}

/** Find candidate company domains via Tavily web search. */
let lastSearchError = "";
async function searchCompanyDomains(pillar: string, limit: number): Promise<string[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  const queries = PILLAR_QUERIES[pillar] || PILLAR_QUERIES.CLIENT_MEETINGS;
  const domains: string[] = [];
  const skipHosts = [
    "linkedin.com", "facebook.com", "indeed.com", "glassdoor.com",
    "google.com", "youtube.com", "twitter.com", "x.com", "instagram.com",
    "wikipedia.org", "crunchbase.com", "g2.com", "capterra.com",
    // Job boards, aggregators and ATS platforms are not buyer companies.
    "ziprecruiter.com", "bebee.com", "jobleads.com", "wellfound.com",
    "builtin.com", "remoteok.com", "weworkremotely.com", "lever.co",
    "greenhouse.io", "ashbyhq.com", "workable.com", "smartrecruiters.com",
    "jobvite.com", "simplyhired.com", "dice.com", "monster.com",
    "careerbuilder.com", "reed.co.uk", "totaljobs.com", "seek.com.au",
    "adzuna.com", "jooble.org", "talent.com", "snagajob.com",
    "flexjobs.com", "remotive.com", "himalayas.app", "arc.dev",
    "toptal.com", "upwork.com", "fiverr.com", "freelancer.com",
    "producthunt.com", "clutch.co", "goodfirms.co", "trustpilot.com",
  ];
  for (const q of queries) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query: q, max_results: 10, search_depth: "basic" }),
      });
      if (!res.ok) {
        const body: any = await res.json().catch(() => ({}));
        lastSearchError = `Tavily HTTP ${res.status}: ${body?.detail?.error || "search failed"}`;
        continue;
      }
      const data: any = await res.json();
      for (const r of data?.results || []) {
        const host = cleanDomain(r?.url || "");
        if (!host || skipHosts.some((s) => host.endsWith(s))) continue;
        if (!domains.includes(host)) domains.push(host);
        if (domains.length >= limit) return domains;
      }
    } catch { /* try next query */ }
  }
  // Second search door: Serper (Google results). Used when Tavily is not
  // configured, errors (e.g. monthly credits finished), or returns too few.
  if (domains.length < limit && process.env.SERPER_API_KEY) {
    for (const q of queries) {
      try {
        const res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": process.env.SERPER_API_KEY },
          body: JSON.stringify({ q, num: 10 }),
        });
        if (!res.ok) {
          lastSearchError = `Serper HTTP ${res.status}`;
          continue;
        }
        const data: any = await res.json();
        for (const r of data?.organic || []) {
          const host = cleanDomain(r?.link || "");
          if (!host || skipHosts.some((sk) => host.endsWith(sk))) continue;
          if (!domains.includes(host)) domains.push(host);
          if (domains.length >= limit) return domains;
        }
      } catch { /* try next query */ }
    }
  }
  return domains;
}

export async function huntWebLeads(params: {
  pillar: "CLIENT_MEETINGS" | "INTERVIEW_COPILOT" | "CUSTOMER_SUPPORT" | "BILINGUAL_AI";
  count?: number;
  domains?: string[];
}): Promise<WebHuntResult> {
  const count = Math.min(params.count || 5, 25);
  let domains = (params.domains || []).map(cleanDomain).filter(Boolean);

  if (domains.length === 0) {
    if (!process.env.TAVILY_API_KEY && !process.env.SERPER_API_KEY) {
      return {
        configured: false,
        message:
          "Web Hunter needs a search source: add TAVILY_API_KEY or SERPER_API_KEY (both have free tiers, no card) or pass seed domains. It never invents companies.",
        leads: [], companiesChecked: 0, companiesWithEmail: 0,
      };
    }
    domains = await searchCompanyDomains(params.pillar, count * 4);
  }

  const leads: WebLead[] = [];
  let checked = 0;
  for (const d of domains) {
    if (leads.length >= count) break;
    checked++;
    const lead = await crawlCompany(d).catch(() => null);
    if (lead) leads.push(lead);
    await sleep(300);
  }

  return {
    configured: true,
    message: checked === 0 && lastSearchError
      ? `Web Hunter could not search the web: ${lastSearchError}`
      : `Web Hunter checked ${checked} company websites and found ${leads.length} with a published contact email. Web emails are unverified until MillionVerifier checks them — they wait in Approvals, they are not auto-sent.`,
    leads,
    companiesChecked: checked,
    companiesWithEmail: leads.length,
  };
}
