import { NextResponse } from "next/server";
import { callLogDb } from "@/lib/calling/db";
import { assertCallable } from "@/lib/calling/guard";

/**
 * Add one warm lead to the call queue. The guard is the law here:
 * warm replies only, never suppressed, never opted out, must have a
 * phone number. Queueing never dials — starting a call is separate.
 */
export async function POST(req: Request) {
  try {
    const { contactId } = await req.json();
    if (!contactId) {
      return NextResponse.json({ success: false, error: "contactId is required" }, { status: 400 });
    }

    const check = await assertCallable(contactId);
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.reason }, { status: 400 });
    }

    const existing = await callLogDb.findFirst({
      where: { contactId, status: { in: ["QUEUED", "CALLING"] } },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "This contact is already in the call queue" }, { status: 400 });
    }

    const log = await callLogDb.create({
      data: { contactId, phone: check.contact.phone, status: "QUEUED" },
    });
    return NextResponse.json({ success: true, log });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to queue call" },
      { status: 500 }
    );
  }
}
