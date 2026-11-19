import { NextResponse } from "next/server";
import { verifyEmail } from "@/lib/verification/emailVerifier";
import { prisma } from "@/lib/prisma";

/**
 * POST { email } or { contactId }
 * Verifies one email and, when it belongs to a contact, stores the verdict
 * on the contact so the send gate can enforce it. Without
 * MILLIONVERIFIER_API_KEY the verdict is UNKNOWN (syntax only) — the gate
 * blocks UNKNOWN, by design.
 */
export async function POST(req: Request) {
  try {
    const { email, contactId } = await req.json();
    let targetEmail = email as string | undefined;

    if (contactId && !targetEmail) {
      const contact = await prisma.contact.findUnique({ where: { id: contactId } });
      if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      targetEmail = contact.email;
    }
    if (!targetEmail) {
      return NextResponse.json({ error: "Provide email or contactId" }, { status: 400 });
    }

    const result = await verifyEmail(targetEmail);

    if (contactId) {
      try {
        await prisma.contact.update({
          where: { id: contactId },
          data: { emailVerification: result.status, emailVerifiedAt: new Date() },
        });
      } catch (err) {
        console.warn("Could not persist verification verdict:", err);
      }
    }

    return NextResponse.json({ success: true, verification: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Verification failed" }, { status: 500 });
  }
}
