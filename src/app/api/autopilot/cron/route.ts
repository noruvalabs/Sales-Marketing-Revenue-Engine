import { NextResponse } from "next/server";
import { runAutopilotCycle, getAutopilotState } from "@/lib/autopilot/engine";

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}

async function handleCron(request: Request) {
  const url = new URL(request.url);
  const secret =
    request.headers.get("x-cron-secret") ||
    url.searchParams.get("secret") ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  const expectedSecret = process.env.CRON_SECRET;

  // In production, if CRON_SECRET is set, enforce validation
  if (expectedSecret && expectedSecret.trim() !== "" && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized cron execution" }, { status: 401 });
  }

  const { config } = getAutopilotState();
  if (!config.enabled) {
    return NextResponse.json({
      status: "SKIPPED",
      message: "Autopilot is currently paused by admin switch.",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const result = await runAutopilotCycle({ count: 5 });
    return NextResponse.json({
      status: result.success ? "SUCCESS" : "FAILED",
      summary: result.summary,
      discovered: result.discovered,
      autoDispatched: result.autoDispatched,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: "ERROR",
        error: err.message || "Failed to execute autonomous cron cycle",
      },
      { status: 500 }
    );
  }
}

