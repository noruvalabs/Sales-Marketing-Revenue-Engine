import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Outbox — the two lists Sazzad asked for (2026-11-22):
 *   queue: emails NOT sent yet (waiting approval, approved and waiting
 *          for their sequence day, or failed and needing attention)
 *   sent:  emails already sent, newest first
 * Rejected drafts are intentionally in neither list — they are dead.
 */
export async function GET() {
  try {
    const drafts = await prisma.outreachDraft.findMany({
      include: { contact: { include: { company: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const shape = (d: any) => ({
      id: d.id,
      subject: d.subject,
      status: d.status,
      stepNumber: d.stepNumber,
      sendAfterDays: d.sendAfterDays,
      createdAt: d.createdAt,
      approvedAt: d.approvedAt,
      sentAt: d.sentAt,
      errorMessage: d.errorMessage,
      contactName: `${d.contact?.firstName || ""} ${d.contact?.lastName || ""}`.trim(),
      contactEmail: d.contact?.email || "",
      contactTitle: d.contact?.title || "",
      companyName: d.contact?.company?.name || "",
      companyDomain: d.contact?.company?.domain || "",
    });

    const queue = drafts
      .filter((d: any) => d.status === "PENDING_APPROVAL" || d.status === "APPROVED" || d.status === "FAILED")
      .map(shape);

    const sent = drafts
      .filter((d: any) => d.status === "SENT")
      .map(shape)
      .sort((a: any, b: any) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime());

    return NextResponse.json({
      success: true,
      queue,
      sent,
      counts: { queue: queue.length, sent: sent.length },
    });
  } catch (err: any) {
    console.error("Database query failed in /api/outbox:", err);
    return NextResponse.json(
      { success: false, queue: [], sent: [], counts: { queue: 0, sent: 0 }, error: err.message },
      { status: 500 }
    );
  }
}
