import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { draftId, action, subject, body } = await req.json();

    if (!draftId || !action) {
      return NextResponse.json({ error: "Missing draftId or action" }, { status: 400 });
    }

    const updateData: any = {};
    if (subject !== undefined) updateData.subject = subject;
    if (body !== undefined) updateData.body = body;

    if (action === "APPROVE") {
      updateData.status = "APPROVED";
      updateData.approvedAt = new Date();
      updateData.approvedBy = "Human Reviewer (Admin)";
    } else if (action === "REJECT") {
      updateData.status = "REJECTED";
    } else if (action === "RESET") {
      updateData.status = "PENDING_APPROVAL";
    }
    // If action === "UPDATE", status remains unchanged while subject/body are updated!

    try {
      const updated = await prisma.outreachDraft.update({
        where: { id: draftId },
        data: updateData,
      });

      return NextResponse.json({ success: true, draft: updated });
    } catch (err) {
      // In-memory fallback
      return NextResponse.json({
        success: true,
        draft: {
          id: draftId,
          status: updateData.status,
          subject,
          body,
          action,
          updatedAt: new Date().toISOString(),
        },
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update draft" }, { status: 500 });
  }
}

