/**
 * Real lead hunter — waterfall over licensed providers, verification-gated.
 *
 * Replaces the old hard-coded catalogs (see finder.ts / multiSourceHunter.ts,
 * now thin wrappers around this file). Pipeline per lead:
 *   Prospeo -> Apollo -> Hunter (stop expanding once we have enough)
 *   -> dedupe by email/domain -> verify email -> drop INVALID
 *   -> research company (evidence URL) -> Gemini qualify + 3-touch sequence
 *
 * With no provider key configured this returns `configured: false` and ZERO
 * leads, with a clear message. It never falls back to invented data.
 * Manual / CSV-imported leads remain a valid path — they go through the
 * same verification gate before anything can be sent.
 */

import { searchProspeo, searchApollo, searchHunter, configuredProviders, type ProviderLead, type LeadSearchQuery } from "@/lib/discovery/providers";
import { verifyEmail, type EmailVerificationStatus } from "@/lib/verification/emailVerifier";
import { researchCompany, type CompanyResearch } from "@/lib/research/companyResearch";
import { qualifyCompany, type QualificationResult } from "@/lib/ai/qualify";
import { buildSequence, type SequenceDraft } from "@/lib/ai/sequence";

export interface RealLead {
  name: string;
  domain: string;
  industry: string;
  size: string;
  country: string;
  hiringSignals: string;
  source: string;
  sourceUrl?: string;
  contactName: string;
  contactEmail: string;
  contactTitle: string;
  linkedinUrl?: string;
  emailVerification: EmailVerificationStatus;
  emailVerificationReason: string;
  research: CompanyResearch;
  qualification: QualificationResult;
  sequence: SequenceDraft[];
}

export interface RealHuntResult {
  configured: boolean;
  message: string;
  leads: RealLead[];
  droppedInvalid: number;
  providersUsed: string[];
}

const PILLAR_TITLES: Record<string, string[]> = {
  CLIENT_MEETINGS: ["VP Sales", "Head of Sales", "Sales Director", "Founder", "CEO"],
  INTERVIEW_COPILOT: ["Head of Talent", "VP People", "Head of Recruiting", "Engineering Manager", "Founder"],
  CUSTOMER_SUPPORT: ["VP Customer Support", "Head of Customer Success", "Support Director", "COO"],
  BILINGUAL_AI: ["Head of Operations", "VP Global Operations", "Founder", "CEO"],
};

export async function huntRealLeads(params: {
  personaKeyword?: string;
  pillar: "CLIENT_MEETINGS" | "INTERVIEW_COPILOT" | "CUSTOMER_SUPPORT" | "BILINGUAL_AI";
  domains?: string[];
  count?: number;
}): Promise<RealHuntResult> {
  const providers = configuredProviders();
  if (providers.length === 0) {
    return {
      configured: false,
      message:
        "No lead provider configured. Add PROSPEO_API_KEY (75 free verified emails/month), APOLLO_API_KEY, or HUNTER_API_KEY in .env — or import real leads by CSV / manual entry. Fake catalog discovery was removed in v1: this engine never invents companies or emails.",
      leads: [], droppedInvalid: 0, providersUsed: [],
    };
  }

  const count = Math.min(params.count || 5, 25);
  // Rotate the provider result page every hour. Without this, every cycle
  // fetched page 1 and re-found the SAME companies forever — the daily
  // "new leads" target could never be met after day 1.
  const rotatingPage = (Math.floor(Date.now() / 3600000) % 20) + 1;
  const query: LeadSearchQuery = {
    titles: PILLAR_TITLES[params.pillar] || PILLAR_TITLES.CLIENT_MEETINGS,
    keywords: params.personaKeyword || "",
    domains: params.domains,
    count,
    page: rotatingPage,
  };

  // Skip companies/contacts already stored, so each run hunts NEW leads.
  // If the DB is unreachable we continue with in-run dedupe only.
  const knownEmails = new Set<string>();
  const knownDomains = new Set<string>();
  try {
    const { prisma } = await import("@/lib/prisma");
    const existing = await prisma.contact.findMany({ select: { email: true, company: { select: { domain: true } } } });
    for (const c of existing) {
      if (c.email) knownEmails.add(c.email.toLowerCase());
      if (c.company?.domain) knownDomains.add(c.company.domain.toLowerCase());
    }
  } catch { /* DB offline — in-run dedupe still applies */ }

  // Waterfall: quality first (Prospeo), then breadth (Apollo), then Hunter
  // for known domains. Collect until we have ~2x the target (some will fail
  // verification and be dropped).
  const raw: ProviderLead[] = [];
  const providersUsed: string[] = [];
  const providerErrors: string[] = [];
  // Only report a provider as "used" when it actually answered. (Apollo's
  // free plan rejects search with HTTP 403 — listing it as used was a lie.)
  const collect = (r: { provider: string; leads: ProviderLead[]; error?: string }) => {
    if (r.error) { providerErrors.push(`${r.provider}: ${r.error}`); return; }
    providersUsed.push(r.provider);
    raw.push(...r.leads);
  };
  if (providers.includes("PROSPEO")) collect(await searchProspeo(query));
  if (raw.length < count * 2 && providers.includes("APOLLO")) collect(await searchApollo(query));
  if (raw.length < count * 2 && providers.includes("HUNTER") && (params.domains?.length || 0) > 0) collect(await searchHunter(query));
  if (providerErrors.length > 0) console.warn("[discovery] provider errors:", providerErrors.join(" | "));

  // Dedupe by email, then verify — INVALID leads are dropped, never sent.
  const seen = new Set<string>();
  const leads: RealLead[] = [];
  let droppedInvalid = 0;

  for (const p of raw) {
    const email = p.contactEmail.toLowerCase().trim();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (knownEmails.has(email) || knownDomains.has(p.domain.toLowerCase())) continue; // already in CRM

    const verification = p.verified
      ? await verifyEmail(email, "VALID")
      : await verifyEmail(email);
    if (verification.status === "INVALID") { droppedInvalid++; continue; }

    const research = await researchCompany(p.domain, p.companyName);
    const qualification = await qualifyCompany({
      name: p.companyName, domain: p.domain, industry: p.industry, size: p.size,
      hiringSignals: research.signals.join("; "), contactName: p.contactName, contactTitle: p.contactTitle,
    });
    const sequence = buildSequence({
      contactName: p.contactName, contactTitle: p.contactTitle, companyName: p.companyName,
      qualification, research, hiringSignals: research.signals.join("; "),
    });

    leads.push({
      name: p.companyName, domain: p.domain, industry: p.industry || "Technology",
      size: p.size || "Unknown", country: p.country || "Global",
      hiringSignals: research.signals.join("; ") || "Identified via " + p.source,
      source: p.source, sourceUrl: p.sourceUrl,
      contactName: p.contactName, contactEmail: email, contactTitle: p.contactTitle,
      linkedinUrl: p.linkedinUrl,
      emailVerification: verification.status, emailVerificationReason: verification.reason,
      research, qualification, sequence,
    });

    if (leads.length >= count) break;
  }

  return {
    configured: true,
    message: `Found ${leads.length} real leads via ${providersUsed.join(" + ") || "no working provider"} (${droppedInvalid} dropped as invalid emails). Only VALID emails can be auto-sent; RISKY/UNKNOWN wait in the approval queue.${providerErrors.length ? ` Provider problems: ${providerErrors.join("; ")}` : ""}`,
    leads, droppedInvalid, providersUsed,
  };
}
