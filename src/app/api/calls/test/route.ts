import { NextResponse } from "next/server";
import { startCall, getCallAgentConfig } from "@/lib/calling/retell";

/**
 * Week-1 test step: call YOUR OWN number to hear the agent before any
 * lead is ever called. This is the only route that dials a number that
 * is not a warm lead — because the number is yours and you typed it.
 * Requires Retell configured + CALL_AGENT_ENABLED=true; otherwise it
 * honestly reports that no call was made.
 */
export async function POST(req: Request) {
  try {
    const { phone } = await req.json();
    const to = String(phone || "").trim();
    if (!to || to.replace(/\D/g, "").length < 7) {
      return NextResponse.json({ success: false, error: "Enter a valid phone number (with country code)" }, { status: 400 });
    }

    const cfg = getCallAgentConfig();
    if (!cfg.configured) {
      return NextResponse.json({
        success: false,
        error: `Retell is not configured yet — missing in .env: ${cfg.missing.join(", ")}. See docs/CALL_AGENT.md.`,
      }, { status: 400 });
    }
    if (!cfg.enabled) {
      return NextResponse.json({
        success: false,
        error: "CALL_AGENT_ENABLED is not true in .env — real calls are switched off.",
      }, { status: 400 });
    }

    const result = await startCall({
      toNumber: to,
      firstName: "Sazzad",
      companyName: "Noruva Labs (test call)",
      contactId: "self-test",
    });
    if (result.error || !result.callId) {
      return NextResponse.json({ success: false, error: result.error || "Retell call failed" }, { status: 502 });
    }
    return NextResponse.json({ success: true, callId: result.callId, message: "Calling your number now — pick up and test the agent." });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to place test call" },
      { status: 500 }
    );
  }
}
