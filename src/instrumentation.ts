export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutonomousScheduler } = await import("@/lib/autopilot/scheduler");
    startAutonomousScheduler();
  }
}
