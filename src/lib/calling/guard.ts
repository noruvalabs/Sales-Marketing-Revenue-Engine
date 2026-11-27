import { prisma } from "@/lib/prisma";

/**
 * AI Call Agent — who may be called (develop2, TEST ONLY).
 *
 * Warm leads ONLY: the person must have REPLIED to one of our emails
 * (status REPLIED_INTERESTED or REPLIED_OBJECTION). A cold contact can
 * never be queued, even by hand — US law treats an AI sales voice call
 * to a mobile phone as a robocall, which needs prior consent.
 *
 * Also blocked: anyone on the Suppression List (by email or company
 * domain) and anyone who opted out.
 */

const WARM_STATUSES = ["REPLIED_INTERESTED", "REPLIED_OBJECTION"];

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
  if (!WARM_STATUSES.includes(contact.status)) {
    return {
      ok: false,
      reason: `Not a warm lead (status ${contact.status}). Only people who replied to our emails can be called.`,
    };
  }
  if (!contact.phone) {
    return { ok: false, reason: "No phone number yet — reveal the mobile first (Prospeo, 10 credits)" };
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
