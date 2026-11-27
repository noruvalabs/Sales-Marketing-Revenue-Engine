/**
 * BACKWARD-COMPATIBLE WRAPPER — v1 (real engine).
 *
 * This file used to contain a hard-coded catalog of famous companies
 * (Ramp, Gorgias, Vanta, ClickUp…) with guessed CEO emails, labelled as if
 * they had been found via Apollo / Google / LinkedIn / Facebook. That was
 * fake data and dangerous to send to. It has been removed.
 *
 * Discovery now delegates to `realHunter.ts`: licensed providers
 * (Prospeo / Apollo / Hunter) -> email verification gate -> company
 * research with evidence -> Gemini qualification -> 3-touch sequence.
 * With no provider key configured, this returns an empty list — never
 * invented leads. See docs/REAL_V1.md.
 */

import { huntRealLeads } from "@/lib/discovery/realHunter";
import type { QualificationResult } from "@/lib/ai/qualify";
import type { EmailVerificationStatus } from "@/lib/verification/emailVerifier";

export type LeadSource = "WEB" | "APOLLO" | "PROSPEO" | "HUNTER" | "GOOGLE_SEARCH" | "LINKEDIN" | "FACEBOOK" | "WEBSITE_SCRAPER" | "MANUAL" | "CSV";

export interface HunterLeadProfile {
  name: string;
  domain: string;
  industry: string;
  size: string;
  country: string;
  hiringSignals: string;
  source: LeadSource;
  sourceUrl?: string;
  contactName: string;
  contactEmail: string;
  contactTitle: string;
  contactPhone?: string;
  linkedinUrl?: string;
  facebookUrl?: string;
  twitterUrl?: string;
  qualification: QualificationResult;
  socialConnectNote: string;
  emailVerification?: EmailVerificationStatus;
  researchEvidenceUrl?: string;
}

export interface MultiSourceHuntParams {
  personaKeyword?: string;
  pillar: "CLIENT_MEETINGS" | "INTERVIEW_COPILOT" | "CUSTOMER_SUPPORT" | "BILINGUAL_AI";
  sources?: LeadSource[];
  count?: number;
  domains?: string[];
}

export async function huntMultiSourceLeads(params: MultiSourceHuntParams): Promise<HunterLeadProfile[]> {
  const result = await huntRealLeads({
    personaKeyword: params.personaKeyword,
    pillar: params.pillar,
    domains: params.domains,
    count: params.count,
  });

  if (!result.configured) {
    console.warn("[discovery] " + result.message);
    return [];
  }

  return result.leads.map((l) => ({
    name: l.name,
    domain: l.domain,
    industry: l.industry,
    size: l.size,
    country: l.country,
    hiringSignals: l.hiringSignals,
    source: l.source as LeadSource,
    sourceUrl: l.sourceUrl,
    contactName: l.contactName,
    contactEmail: l.contactEmail,
    contactTitle: l.contactTitle,
    contactPhone: l.contactPhone,
    linkedinUrl: l.linkedinUrl,
    qualification: l.qualification,
    // A draft note for a HUMAN to send manually on LinkedIn. LinkedIn
    // automation/scraping violates LinkedIn ToS and gets accounts banned —
    // this engine never auto-connects there.
    socialConnectNote: `Manual LinkedIn task (do not automate): connect with ${l.contactName} (${l.contactTitle}, ${l.name}) and reference: ${l.hiringSignals || l.qualification.reason}`,
    emailVerification: l.emailVerification,
    researchEvidenceUrl: l.research.evidenceUrl,
  }));
}
