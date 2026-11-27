import { prisma } from "@/lib/prisma";

/**
 * AI Call Agent — who may be called (develop2, TEST ONLY).
 *
 * Rule history: the first build allowed WARM leads only (people who
 * replied to our emails). On 2026-11-27 Sazzad directed that the lead
 * finder should also bring phone numbers for discovered leads and that
 * the call agent should call them to introduce the project. The guard
 * now follows that direction: any saved lead WITH a phone number may
 * be queued.
 *
 * Hard blocks that still always apply:
 * - OPTED_OUT contacts — never called, no exceptions.
 * - Anyone on the Suppression List (by email or company domain).
 * - A contact with no phone number cannot be queued.
 *
 * Known risk, stated plainly (also in docs/CALL_AGENT.md): US law
 * treats an AI-voice sales call to a mobile phone as a robocall and
 * may require prior consent; business/landline numbers are lower risk.
 * The script always discloses it is an AI, and every call is started
 * by a human click — there is no bulk auto-dialler.
 */

export interface CallableCheck {
  ok: boolean;
  reason?: string;
  contact?: any;
}

export async function assertCallable(contactId: string): Promise<CallableCheck> {
  const contact: any = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { company: true },
  });
  if (!contact) return { ok: false, reason: "Contact not found" };

  if (contact.status === "OPTED_OUT") {
    return { ok: false, reason: "Contact opted out — never call" };
  }
  if (!contact.phone) {
    return {
      ok: false,
      reason: "No phone number yet — the hunter brings numbers for new leads, or reveal this one (Prospeo, 10 credits)",
    };
  }

  const domain = contact.company?.domain || "";
  const suppression = await prisma.suppressionList.findFirst({
    where: {
      OR: [
        { email: contact.email },
        ...(domain ? [{ domain }] : []),
      ],
    },
  });
  if (suppression) {
    return { ok: false, reason: `On the Suppression List (${suppression.reason})` };
  }

  return { ok: true, contact };
}
