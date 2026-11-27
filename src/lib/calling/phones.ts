import { prisma } from "@/lib/prisma";

/**
 * AI Call Agent — get a lead's mobile number (develop2, TEST ONLY).
 *
 * Uses Prospeo enrich-person, the same door the email reveal uses.
 * Cost is real: a verified MOBILE reveal is 10 Prospeo credits
 * (an email reveal is 1). That is why this runs ONE contact at a time,
 * only when a human clicks "Reveal phone" — never in bulk, never
 * automatically.
 *
 * The response field names are parsed defensively (several candidate
 * paths), like the existing email reveal in discovery/providers.ts.
 * If Prospeo returns no mobile, nothing is saved and the reason is
 * reported honestly.
 */

export interface RevealResult {
  ok: boolean;
  phone?: string;
  reason?: string;
}

export async function revealMobileForContact(contactId: string): Promise<RevealResult> {
  const apiKey = process.env.PROSPEO_API_KEY;
  if (!apiKey) return { ok: false, reason: "PROSPEO_API_KEY is not set in .env" };

  const contact: any = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { company: true },
  });
  if (!contact) return { ok: false, reason: "Contact not found" };
  if (contact.phone) return { ok: true, phone: contact.phone };

  // Identify the person for Prospeo: LinkedIn URL is the strongest key,
  // then work email, then name + company domain.
  const data: Record<string, string> = {};
  if (contact.linkedinUrl) data.linkedin_url = contact.linkedinUrl;
  else if (contact.email) data.email = contact.email;
  else {
    data.first_name = contact.firstName || "";
    data.last_name = contact.lastName || "";
    if (contact.company?.domain) data.company_domain = contact.company.domain;
  }

  try {
    const res = await fetch("https://api.prospeo.io/enrich-person", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-KEY": apiKey },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      return { ok: false, reason: `Prospeo HTTP ${res.status} — reveal may have failed; check credit balance` };
    }
    const json: any = await res.json();
    const person = json?.person || json || {};
    const mobile =
      person?.mobile?.number ||
      person?.mobile_number ||
      person?.mobile ||
      person?.phone_number ||
      person?.phone ||
      null;

    if (!mobile || typeof mobile !== "string" || mobile.replace(/\D/g, "").length < 7) {
      return { ok: false, reason: "Prospeo returned no mobile number for this person" };
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: { phone: mobile, phoneSource: "PROSPEO" },
    });
    return { ok: true, phone: mobile };
  } catch (err: any) {
    return { ok: false, reason: `Prospeo request failed: ${err?.message || String(err)}` };
  }
}
