import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendOutreachEmail } from "@/lib/email/dispatcher";

export async function POST(req: Request) {
  try {
    const { draftId, toEmail, toName, companyName, subject, body, manualOverride } = await req.json();

    if (!toEmail || !subject || !body) {
      return NextResponse.json({ error: "Missing required email dispatch fields." }, { status: 400 });
    }

    // v1 verification gate: if this draft belongs to a known contact, the
    // dispatcher receives that contact's verification verdict and blocks
    // anything that is not VALID (RISKY only with an explicit human
    // single-send override from the approval UI).
    let emailVerificationStatus: any = undefined;
    if (draftId) {
      try {
        const draft = await prisma.outreachDraft.findUnique({
          where: { id: draftId }, include: { contact: true },
        });
        if (draft?.contact) emailVerificationStatus = draft.contact.emailVerification || "UNKNOWN";
      } catch { /* DB unreachable — gate stays unset, simulated mode still safe */ }
    }

    // 1. Dispatch Email through the Safe Dispatcher
    const dispatchResult = await sendOutreachEmail({
      toEmail,
      toName: toName || "Decision Maker",
      companyName: companyName || "Prospective Partner",
      subject,
      body,
      draftId,
      emailVerificationStatus,
      manualOverride: manualOverride === true,
    });

    if (!dispatchResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: dispatchResult.error,
          suppressed: dispatchResult.suppressed || false,
        },
        { status: 400 }
      );
    }

    // 2. Update Database Records if draftId exists
    if (draftId) {
      try {
        await prisma.outreachDraft.update({
          where: { id: draftId },
          data: {
            status: "SENT",
            sentAt: new Date(),
          },
        });

        // Also update contact status to OUTREACH_ACTIVE
        const draft = await prisma.outreachDraft.findUnique({
          where: { id: draftId },
          include: { contact: true },
        });

        if (draft && draft.contact) {
          await prisma.contact.update({
            where: { id: draft.contact.id },
            data: { status: "OUTREACH_ACTIVE" },
          });

          // Progress deal stage to CONTACTED
          await prisma.deal.updateMany({
            where: { companyId: draft.contact.companyId },
            data: { stage: "CONTACTED" },
          });
        }
      } catch (err) {
        console.warn("Could not update database record for sent draft:", err);
      }
    }

    return NextResponse.json({
      success: true,
      messageId: dispatchResult.messageId,
      simulated: dispatchResult.simulated || false,
      dispatchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to dispatch email" }, { status: 500 });
  }
}

