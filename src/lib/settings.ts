/**
 * Shared runtime settings — ONE source of truth for the daily send cap.
 *
 * Before this module there were TWO different caps that could disagree:
 * the autopilot config (maxDailyAutoSends, shown in the dashboard) and a
 * separate number the email dispatcher read from .env. An admin changing
 * one would silently not change the other.
 *
 * Now: the admin edits the number in the dashboard (Autopilot tab), it is
 * stored here, and BOTH the autopilot engine and the email dispatcher
 * enforce this same value — for auto-sends and manual sends alike.
 *
 * Persistence note (honest): like the rest of the autopilot config, this
 * lives in server memory. The starting value on every server start comes
 * from MAX_DAILY_SENDS_PER_INBOX in .env (default 50), so set that line
 * to make a value permanent across restarts.
 */

const MIN_CAP = 1;
const MAX_CAP = 500;

function initialCap(): number {
  const v = Number(process.env.MAX_DAILY_SENDS_PER_INBOX);
  if (Number.isFinite(v) && v >= MIN_CAP) return Math.min(MAX_CAP, Math.floor(v));
  return 50;
}

let dailySendCap = initialCap();

export function getDailySendCap(): number {
  return dailySendCap;
}

export function setDailySendCap(n: number): number {
  if (Number.isFinite(n)) {
    dailySendCap = Math.min(MAX_CAP, Math.max(MIN_CAP, Math.floor(n)));
  }
  return dailySendCap;
}
