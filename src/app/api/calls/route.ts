import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callLogDb } from "@/lib/calling/db";
import { getCallAgentConfig } from "@/lib/calling/retell";

/**
 * AI Call Agent (develop2, TEST ONLY) — the Calls tab data:
 *   config:    is Retell connected? is calling switched on?
 *   callable:  saved leads WITH a phone number (brought by the hunter —
 *              Prospeo reveal or published on the company website),
 *              excluding opted-out contacts
 *   needPhone: warm leads (replied to our emails) with no number yet —
 *              one click reveals the mobile via Prospeo (10 credits)
 *   queue:     calls waiting to be started
 *   history:   calls started/finished, newest first (simulated rows are
 *              clearly marked and are NOT real calls)
 */
export async function GET() {
  try {
    // If the Prisma client was generated before develop2, it has no
    // CallLog model — say exactly how to fix it instead of crashing
    // with a confusing undefined error.
    if (!callLogDb) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Database not updated for the call agent yet. Stop the app, run: npx prisma db push — then restart the app.",
        },
        { status: 500 }
      );
    }
    const config = getCallAgentConfig();

    const callableContacts = await prisma.contact.findMany({
      where: { phone: { not: null }, status: { not: "OPTED_OUT" } },
      include: { company: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const warmNoPhone = await prisma.contact.findMany({
      where: {
        phone: null,
        status: { in: ["REPLIED_INTERESTED", "REPLIED_OBJECTION"] },
      },
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
      callable: callableContacts.map(shapeContact),
      needPhone: warmNoPhone.map(shapeContact),
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
