import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callLogDb } from "@/lib/calling/db";
import { getCallAgentConfig } from "@/lib/calling/retell";

/**
 * AI Call Agent (develop2, TEST ONLY) — the Calls tab data:
 *   config:   is Retell connected? is calling switched on?
 *   eligible: warm leads (replied to our emails) — with/without a phone
 *   queue:    calls waiting to be started
 *   history:  calls started/finished, newest first (simulated rows are
 *             clearly marked and are NOT real calls)
 */
export async function GET() {
  try {
    const config = getCallAgentConfig();

    const warmContacts = await prisma.contact.findMany({
      where: { status: { in: ["REPLIED_INTERESTED", "REPLIED_OBJECTION"] } },
      include: { company: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const logs = await callLogDb.findMany({
      include: { contact: { include: { company: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const queuedContactIds = new Set(
      logs.filter((l: any) => l.status === "QUEUED").map((l: any) => l.contactId)
    );

    const shapeContact = (c: any) => ({
      id: c.id,
      name: `${c.firstName || ""} ${c.lastName || ""}`.trim(),
      email: c.email,
      title: c.title,
      status: c.status,
      phone: c.phone || null,
      phoneSource: c.phoneSource || null,
      companyName: c.company?.name || "",
      companyDomain: c.company?.domain || "",
    });

    const shapeLog = (l: any) => ({
      id: l.id,
      contactId: l.contactId,
      contactName: `${l.contact?.firstName || ""} ${l.contact?.lastName || ""}`.trim(),
      contactEmail: l.contact?.email || "",
      companyName: l.contact?.company?.name || "",
      phone: l.phone,
      status: l.status,
      simulated: l.simulated,
      durationSec: l.durationSec,
      outcome: l.outcome,
      summary: l.summary,
      transcript: l.transcript,
      recordingUrl: l.recordingUrl,
      errorMessage: l.errorMessage,
      startedAt: l.startedAt,
      endedAt: l.endedAt,
      createdAt: l.createdAt,
    });

    return NextResponse.json({
      success: true,
      config,
      eligible: warmContacts.map(shapeContact),
      queue: logs.filter((l: any) => l.status === "QUEUED" || l.status === "CALLING").map(shapeLog),
      history: logs.filter((l: any) => l.status !== "QUEUED" && l.status !== "CALLING").map(shapeLog),
      queuedContactIds: Array.from(queuedContactIds),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load calls" },
      { status: 500 }
    );
  }
}
