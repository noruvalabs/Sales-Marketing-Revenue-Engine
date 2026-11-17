import { NextResponse } from "next/server";
import { getAutopilotState, updateAutopilotConfig, runAutopilotCycle } from "@/lib/autopilot/engine";

export async function GET() {
  const state = getAutopilotState();
  return NextResponse.json({ success: true, ...state });
}

export async function POST(req: Request) {
  try {
    const { action, enabled, minScoreToAutoDispatch } = await req.json();

    if (action === "TOGGLE") {
      const updated = updateAutopilotConfig({ enabled: Boolean(enabled) });
      return NextResponse.json({ success: true, config: updated });
    }

    if (action === "UPDATE_SETTINGS") {
      const updated = updateAutopilotConfig({
        minScoreToAutoDispatch: Number(minScoreToAutoDispatch) || 85,
      });
      return NextResponse.json({ success: true, config: updated });
    }

    if (action === "TRIGGER_CYCLE") {
      const cycleResult = await runAutopilotCycle();
      const state = getAutopilotState();
      return NextResponse.json({
        success: true,
        cycleResult,
        state,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Autopilot operation failed" }, { status: 500 });
  }
}
