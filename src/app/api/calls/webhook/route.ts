import { NextResponse } from "next/server";
import { callLogDb } from "@/lib/calling/db";

/**
 * Retell webhook — saves the result of a real call onto its CallLog row:
 * transcript, recording, duration, summary and outcome.
 *
 * Set this URL in the Retell dashboard:
 *   <your app URL>/api/calls/webhook
 *
 * Events used:
 *   call_ended    — duration, transcript, recording, disconnect reason
 *   call_analyzed — summary + custom outcome (if the agent is set to
 *                   extract one; otherwise outcome is derived from the
 *                   transcript keywords below — a rough label, and the
 *                   summary/transcript remain the real evidence)
 */

const NO_ANSWER_REASONS = ["no_answer", "busy", "machine_detected", "dial_no_answer", "dial_busy"];

function outcomeFromTranscript(transcript: string): string {
  const t = (transcript || "").toLowerCase();
  if (!t) return "OTHER";
  if (t.includes("book") && (t.includes("meeting") || t.includes("slot") || t.includes("link"))) return "MEETING_BOOKED";
  if (t.includes("not interested") || t.includes("don't call") || t.includes("do not call") || t.includes("stop calling")) return "NOT_INTERESTED";
  if (t.includes("call me back") || t.includes("call back") || t.includes("another time")) return "CALLBACK";
  if (t.includes("interested") || t.includes("sounds good") || t.includes("tell me more")) return "INTERESTED";
  return "OTHER";
}

export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => null);
    const event = body?.event;
    const call = body?.call || body?.data || {};
    const callId = call?.call_id;
    if (!callId) return NextResponse.json({ success: true, ignored: true });

    const log = await callLogDb.findFirst({ where: { retellCallId: String(callId) } });
    if (!log) return NextResponse.json({ success: true, ignored: true });

    if (event === "call_ended") {
      const reason = String(call?.disconnection_reason || "");
      const durationSec =
        typeof call?.duration_ms === "number"
          ? Math.round(call.duration_ms / 1000)
          : typeof call?.duration_seconds === "number"
            ? Math.round(call.duration_seconds)
            : null;
      await callLogDb.update({
        where: { id: log.id },
        data: {
          status: NO_ANSWER_REASONS.includes(reason) ? "NO_ANSWER" : "COMPLETED",
          durationSec,
          transcript: call?.transcript || null,
          recordingUrl: call?.recording_url || null,
          outcome: NO_ANSWER_REASONS.includes(reason) ? "NO_ANSWER" : outcomeFromTranscript(call?.transcript || ""),
          endedAt: new Date(),
        },
      });
    } else if (event === "call_analyzed") {
      const analysis = call?.call_analysis || {};
      const customOutcome = analysis?.custom_analysis_data?.outcome;
      await callLogDb.update({
        where: { id: log.id },
        data: {
          summary: analysis?.call_summary || log.summary,
          ...(customOutcome ? { outcome: String(customOutcome) } : {}),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Webhook failed" },
      { status: 500 }
    );
  }
}
