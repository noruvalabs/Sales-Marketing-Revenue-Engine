import { NextResponse } from "next/server";
import { callLogDb } from "@/lib/calling/db";
import { assertCallable } from "@/lib/calling/guard";
import { startCall } from "@/lib/calling/retell";

/**
 * Start ONE queued call. The guard runs again at call time (same rule
 * as the email send gate: check at the moment of sending, not only
 * when the item was queued).
 *
 * If Retell is not configured or CALL_AGENT_ENABLED is not "true",
 * NO call is placed. The row is closed as a clearly-marked SIMULATED
 * test record — never shown as a real call.
 */
export async function POST(req: Request) {
  try {
    const { callLogId } = await req.json();
    if (!callLogId) {
      return NextResponse.json({ success: false, error: "callLogId is required" }, { status: 400 });
    }

    const log = await callLogDb.findUnique({ where: { id: callLogId } });
    if (!log) return NextResponse.json({ success: false, error: "Call not found" }, { status: 404 });
    if (log.status !== "QUEUED") {
      return NextResponse.json({ success: false, error: `Call is ${log.status}, not QUEUED` }, { status: 400 });
    }

    const check = await assertCallable(log.contactId);
    if (!check.ok) {
      await callLogDb.update({
        where: { id: callLogId },
        data: { status: "SKIPPED", errorMessage: check.reason },
      });
      return NextResponse.json({ success: false, error: check.reason }, { status: 400 });
    }

    const result = await startCall({
      toNumber: check.contact.phone,
      firstName: check.contact.firstName || "",
      companyName: check.contact.company?.name || "",
      contactId: log.contactId,
    });

    if (result.simulated) {
      await callLogDb.update({
        where: { id: callLogId },
        data: {
          status: "SKIPPED",
          simulated: true,
          errorMessage:
            "Simulated test record only — no real call was made (Retell is not configured, or CALL_AGENT_ENABLED is not true).",
          endedAt: new Date(),
        },
      });
      return NextResponse.json({
        success: true,
        simulated: true,
        message: "Simulated only — no real call was made. Add the Retell keys and set CALL_AGENT_ENABLED=true to place a real test call.",
      });
    }

    if (result.error || !result.callId) {
      await callLogDb.update({
        where: { id: callLogId },
        data: { status: "FAILED", errorMessage: result.error || "Unknown Retell error", endedAt: new Date() },
      });
      return NextResponse.json({ success: false, error: result.error || "Retell call failed" }, { status: 502 });
    }

    await callLogDb.update({
      where: { id: callLogId },
      data: { status: "CALLING", retellCallId: result.callId, startedAt: new Date() },
    });
    return NextResponse.json({ success: true, simulated: false, callId: result.callId });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to start call" },
      { status: 500 }
    );
  }
}
