/**
 * Company research with evidence.
 *
 * Personalisation rule (from competitor research): every specific claim in
 * an outreach email must come from a stored source. "Saw your amazing post
 * about scaling…" when no post exists is instantly detectable and kills
 * trust. So research returns an `evidenceUrl`, and the sequence builder is
 * only allowed to reference facts found here. No evidence = a relevant but
 * generic opener, or drop the lead.
 *
 * Sources: Tavily when TAVILY_API_KEY is set (1,000 free credits/month,
 * built for agents), otherwise a direct fetch of the company's own website
 * — real, free, and cited to their homepage.
 */

export interface CompanyResearch {
  domain: string;
  summary: string;
  signals: string[];
  evidenceUrl: string;
  source: "tavily" | "website" | "none";
}

export async function researchCompany(domain: string, companyName: string): Promise<CompanyResearch> {
  const clean = (domain || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const evidenceUrl = `https://${clean}`;

  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tavilyKey },
        body: JSON.stringify({
          query: `${companyName} ${clean} hiring team growth`,
          search_depth: "basic", max_results: 3, include_answer: true,
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        const results: any[] = data?.results || [];
        const signals = results.map((r: any) => String(r.title || "").trim()).filter(Boolean).slice(0, 3);
        const summary = String(data?.answer || results[0]?.content || "").slice(0, 600).trim();
        if (summary) {
          return {
            domain: clean, summary, signals,
            evidenceUrl: results[0]?.url || evidenceUrl, source: "tavily",
          };
        }
      }
    } catch (err) {
      console.warn("Tavily research failed, falling back to website fetch:", err);
    }
  }

  // Free fallback: read the company's own homepage (title + meta + text).
  try {
    const res = await fetch(evidenceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NoruvaResearch/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
      const meta = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || "").trim();
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
      const summary = [title, meta || text].filter(Boolean).join(" — ");
      if (summary) {
        const signals: string[] = [];
        const lower = html.toLowerCase();
        if (lower.includes("/careers") || lower.includes("we're hiring") || lower.includes("we are hiring")) signals.push("Careers / hiring page linked from homepage");
        if (lower.includes("remote")) signals.push("Mentions remote work on homepage");
        return { domain: clean, summary, signals, evidenceUrl, source: "website" };
      }
    }
  } catch {
    // Site unreachable — return "none" rather than inventing anything.
  }

  return { domain: clean, summary: "", signals: [], evidenceUrl, source: "none" };
}
