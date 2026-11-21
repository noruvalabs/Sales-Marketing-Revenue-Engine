import { NextResponse } from "next/server";
import { getAutopilotState, updateAutopilotConfig, runAutopilotCycle } from "@/lib/autopilot/engine";
import { startAutonomousScheduler, getSchedulerStatus } from "@/lib/autopilot/scheduler";

// Ensure scheduler is active whenever server is initialized
startAutonomousScheduler();

export async function GET() {
  const state = getAutopilotState();
  const scheduler = getSchedulerStatus();
  return NextResponse.json({ success: true, ...state, scheduler });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, enabled, minScoreToAutoDispatch, maxDailyAutoSends, activeSources, connectionChannel, targetPillars } = body;

    if (action === "TOGGLE") {
      const updated = updateAutopilotConfig({ enabled: Boolean(enabled) });
      return NextResponse.json({ success: true, config: updated });
    }

    if (action === "UPDATE_SETTINGS") {
      const updates: any = {};
      if (minScoreToAutoDispatch !== undefined) updates.minScoreToAutoDispatch = Number(minScoreToAutoDispatch);
      if (maxDailyAutoSends !== undefined) updates.maxDailyAutoSends = Number(maxDailyAutoSends);
      if (activeSources !== undefined) updates.activeSources = activeSources;
      if (connectionChannel !== undefined) updates.connectionChannel = connectionChannel;
      if (targetPillars !== undefined) updates.targetPillars = targetPillars;

      const updated = updateAutopilotConfig(updates);
      return NextResponse.json({ success: true, config: updated });
    }

    if (action === "TRIGGER_CYCLE") {
      const cycleResult = await runAutopilotCycle({
        pillar: body.pillar,
        sources: body.sources,
        count: body.count,
      });
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
