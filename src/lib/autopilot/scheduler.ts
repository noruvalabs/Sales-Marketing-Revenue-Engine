import { runAutopilotCycle, getAutopilotState } from "./engine";

export interface SchedulerStatus {
  isRunning: boolean;
  activeHours: string; // "09:00 - 18:00"
  batchSize: number; // 5
  dailyTarget: number; // 50
  lastRunTimestamp: string | null;
  lastRunHour: number | null;
  nextScheduledRun: string | null;
  currentState: "SLEEPING_OVERNIGHT" | "ACTIVE_DISPATCHING" | "DAILY_GOAL_REACHED" | "PAUSED";
  batchesRunToday: number;
  leadsFoundToday: number;
}

let schedulerTimer: NodeJS.Timeout | null = null;
let lastRunDate: string = "";
let lastRunHour: number = -1;
let lastRunTimestamp: string | null = null;
let batchesRunToday: number = 0;
let leadsFoundToday: number = 0;

export function getSchedulerStatus(): SchedulerStatus {
  const now = new Date();
  const currentHour = now.getHours();
  const today = now.toDateString();

  if (today !== lastRunDate) {
    batchesRunToday = 0;
    leadsFoundToday = 0;
  }

  const { config } = getAutopilotState();
  let currentState: SchedulerStatus["currentState"] = "ACTIVE_DISPATCHING";

  if (!config.enabled) {
    currentState = "PAUSED";
  } else if (leadsFoundToday >= 50) {
    currentState = "DAILY_GOAL_REACHED";
  } else if (currentHour < 9 || currentHour >= 18) {
    currentState = "SLEEPING_OVERNIGHT";
  }

  // Calculate next scheduled run time
  const next = new Date(now);
  if (currentHour < 9) {
    next.setHours(9, 0, 0, 0);
  } else if (currentHour >= 18 || leadsFoundToday >= 50) {
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
  } else {
    next.setHours(currentHour + 1, 0, 0, 0);
  }

  return {
    isRunning: schedulerTimer !== null,
    activeHours: "09:00 - 18:00 (Local Business Hours)",
    batchSize: 5,
    dailyTarget: 50,
    lastRunTimestamp,
    lastRunHour: lastRunHour === -1 ? null : lastRunHour,
    nextScheduledRun: next.toISOString(),
    currentState,
    batchesRunToday,
    leadsFoundToday,
  };
}

export async function checkAndRunScheduledCycle(): Promise<{ ran: boolean; reason: string }> {
  const now = new Date();
  const currentHour = now.getHours();
  const today = now.toDateString();

  if (today !== lastRunDate) {
    lastRunDate = today;
    lastRunHour = -1;
    batchesRunToday = 0;
    leadsFoundToday = 0;
  }

  const { config } = getAutopilotState();
  if (!config.enabled) {
    return { ran: false, reason: "Autopilot is currently paused by admin switch." };
  }

  // Check window: 9:00 AM (hour 9) to 6:00 PM (hour 17 inclusive, hour 18 stops)
  if (currentHour < 9 || currentHour >= 18) {
    return {
      ran: false,
      reason: `Outside 9:00 AM - 6:00 PM window (current hour is ${currentHour}:00). Sleeping overnight to protect sender domain reputation.`,
    };
  }

  // Check if we already ran for this hour
  if (lastRunHour === currentHour) {
    return {
      ran: false,
      reason: `Already executed batch for hour ${currentHour}:00. Next hourly batch at ${currentHour + 1}:00.`,
    };
  }

  // Daily target = 50 REAL new leads found today. Batches alone do not
  // count: an empty batch (provider hiccup, all duplicates) used to mark
  // the goal "reached" with zero leads actually found.
  if (leadsFoundToday >= 50) {
    return {
      ran: false,
      reason: `Daily target reached (${leadsFoundToday} new leads found today). Resuming tomorrow at 09:00 AM.`,
    };
  }

  // Execute the hourly batch
  console.log(`[RevForge Scheduler] Executing autonomous cycle at ${now.toLocaleTimeString()} (Batch ${batchesRunToday + 1}/10, 5 leads)...`);
  try {
    const cycleResult = await runAutopilotCycle({ count: 5 });
    lastRunHour = currentHour;
    lastRunTimestamp = now.toISOString();
    batchesRunToday++;
    leadsFoundToday += cycleResult.discovered;

    console.log(`[RevForge Scheduler] Cycle complete: ${cycleResult.summary}`);
    return { ran: true, reason: cycleResult.summary };
  } catch (err: any) {
    console.error(`[RevForge Scheduler] Cycle error:`, err);
    return { ran: false, reason: err.message };
  }
}

export function startAutonomousScheduler() {
  if (schedulerTimer) return; // Already running singleton

  console.log("[RevForge Scheduler] Initialized autonomous 9 AM - 6 PM scheduler (Paced at 5 leads/hour, target 50/day).");

  // Check immediately on startup
  checkAndRunScheduledCycle().catch((e) => console.warn("[RevForge Scheduler] Initial check:", e.message));

  // Run check every 60 seconds
  schedulerTimer = setInterval(() => {
    checkAndRunScheduledCycle().catch((e) => console.warn("[RevForge Scheduler] Periodic check:", e.message));
  }, 60 * 1000);

  if (typeof schedulerTimer.unref === "function") {
    schedulerTimer.unref();
  }
}
