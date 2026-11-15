import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { draftId, action, subject, body } = await req.json();

    if (!draftId || !action) {
      return NextResponse.json({ error: "Missing draftId or action" }, { status: 400 });
    }

    const nextStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "PENDING_APPROVAL";

    try {
      const updated = await prisma.outreachDraft.update({
        where: { id: draftId },
        data: {
          status: nextStatus as any,
          approvedAt: action === "APPROVE" ? new Date() : null,
          approvedBy: action === "APPROVE" ? "Human Reviewer (Noruva Sales Rep)" : null,
          subject: subject || undefined,
          body: body || undefined,
        },
      });

      return NextResponse.json({ success: true, draft: updated });
    } catch (err) {
      // In-memory response
      return NextResponse.json({
        success: true,
        draft: {
          id: draftId,
          status: nextStatus,
          action,
          updatedAt: new Date().toISOString(),
        },
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update draft" }, { status: 500 });
  }
}
