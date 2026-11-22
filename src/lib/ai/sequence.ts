/**
 * 3-touch outreach sequence builder.
 *
 * Benchmarks (Nov 2026 research): 3–5 touches over 10–21 days beats a single
 * email; each message < ~120 words, plain text, at most 1 link; personalisation
 * must be ONE specific, verifiable observation — with its source stored.
 * The meeting link is NOT in touch 1 by default pattern here: touch 1 asks a
 * low-friction question / offers a short video; the booking link goes in the
 * reply to an interested prospect (classifier already does this) and in the
 * breakup touch. Set SEQUENCE_INCLUDE_BOOKING_IN_TOUCH1=true to change.
 *
 * Steps: 1 = day 0, 2 = day +3 (bump), 3 = day +7 (breakup).
 * Any reply stops the sequence — enforced by the reply classifier +
 * suppression flow, and senders must check contact status before each step.
 */

import type { QualificationResult } from "@/lib/ai/qualify";
import type { CompanyResearch } from "@/lib/research/companyResearch";

export interface SequenceDraft {
  stepNumber: number;
  sendAfterDays: number;
  subject: string;
  body: string;
  evidenceUrl?: string;
}

export function bookingUrl(): string {
  // No fallback guess: a hard-coded Cal.com URL here was never verified to
  // exist. If MEETING_BOOKING_URL is not set, emails simply omit the link
  // instead of sending prospects to an invented page.
  return process.env.MEETING_BOOKING_URL || "";
}

export function buildSequence(params: {
  contactName: string;
  contactTitle: string;
  companyName: string;
  qualification: QualificationResult;
  research?: CompanyResearch;
  hiringSignals?: string;
}): SequenceDraft[] {
  const firstName = params.contactName?.split(" ")[0] || "there";
  const pillarLabel = params.qualification.recommendedPillar.replace(/_/g, " ").toLowerCase();
  const pain = params.qualification.painPoints[0] || "handling high-stakes live calls";

  // The ONLY specific observation we may claim: a real hiring signal supplied
  // by a provider, or a signal found in stored research. Nothing invented.
  const observation =
    (params.hiringSignals && params.hiringSignals.trim()) ||
    params.research?.signals?.[0] ||
    "";
  const evidenceUrl = params.research?.evidenceUrl;

  const opener = observation
    ? `I noticed ${params.companyName} has this going on: ${observation}.`
    : `I work with teams like ${params.companyName} on ${pillarLabel} workflows.`;

  const step1: SequenceDraft = {
    stepNumber: 1, sendAfterDays: 0,
    subject: params.qualification.emailDraft.subject,
    body:
`Hi ${firstName},

${opener} Teams in that spot usually tell us the hardest part is ${pain.toLowerCase()} — people freeze or miss things in the moment, and coaching only happens after the call is over.

Noruva AI sits inside live Zoom / Meet calls and gives real-time hints on screen during the call itself (10 free sessions, no card, at ai.noruvalabs.com).

Worth a 3-minute video showing how it works for a team like yours?

Best,
Noruva Labs Revenue Team`,
    evidenceUrl,
  };

  const step2: SequenceDraft = {
    stepNumber: 2, sendAfterDays: 3,
    subject: `Re: ${params.qualification.emailDraft.subject}`,
    body:
`Hi ${firstName},

Floating this back up — the short version: Noruva helps your team during the live call, not after it. Most teams try it on one real call and know in 10 minutes if it fits.

Want me to send the 3-minute video?

Best,
Noruva Labs Revenue Team`,
    evidenceUrl,
  };

  const step3: SequenceDraft = {
    stepNumber: 3, sendAfterDays: 7,
    subject: `Closing the loop — ${params.companyName}`,
    body:
`Hi ${firstName},

I'll close the loop here. If live-call support ever becomes a priority, happy to show you how it works.${bookingUrl() ? ` You can grab 15 minutes whenever suits you: ${bookingUrl()}` : ""}

And the free sessions are there if you'd rather just try it: ai.noruvalabs.com

All the best,
Noruva Labs Revenue Team`,
    evidenceUrl,
  };

  return [step1, step2, step3];
}
