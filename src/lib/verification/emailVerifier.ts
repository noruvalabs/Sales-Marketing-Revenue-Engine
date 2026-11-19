/**
 * Email verification — the hard gate between "found a lead" and "may send".
 *
 * Why this exists (v1 fix): the old discovery code invented emails like
 * `first@company.com` from a hard-coded catalog. Guessed emails bounce,
 * hit catch-all servers that silently discard mail, and get a sending
 * domain flagged as a directory-harvest spammer. Research summary:
 * - Unverified lists are typically 15–30% invalid; data decays ~22%/year.
 * - Bounce rate must stay < 2% (hard stop at 3%). Google's spam-complaint
 *   hard line is 0.3%.
 * - ~26–32% of domains are catch-all: the server accepts everything, so
 *   "accepted" proves nothing. Those are RISKY, never VALID.
 *
 * Rule enforced here and in the dispatcher:
 *   VALID   -> may send
 *   RISKY   -> human may override for a single manual send, never autopilot
 *   INVALID -> never send
 *   UNKNOWN -> never send (no verifier configured / no result yet)
 *
 * No API key = UNKNOWN, not "probably fine". We never guess.
 */

export type EmailVerificationStatus = "VALID" | "RISKY" | "INVALID" | "UNKNOWN";

export interface EmailVerificationResult {
  email: string;
  status: EmailVerificationStatus;
  /** Where the verdict came from: "millionverifier" | "syntax-only" | "none" */
  source: string;
  reason: string;
  isRoleAccount: boolean;
  isDisposable: boolean;
  isCatchAll: boolean;
  checkedAt: string;
}

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "throwawaymail.com", "yopmail.com", "trashmail.com", "fakeinbox.com",
  "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc",
]);

const ROLE_PREFIXES = new Set([
  "info", "admin", "support", "sales", "hello", "contact", "office",
  "team", "help", "billing", "hr", "jobs", "careers", "press", "ceo",
  "founder", "marketing", "enquiries", "inquiries", "noreply", "no-reply",
]);

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Offline checks only. These can prove INVALID, never VALID. */
export function checkEmailSyntax(email: string): {
  ok: boolean;
  reason: string;
  isRoleAccount: boolean;
  isDisposable: boolean;
} {
  const e = (email || "").trim().toLowerCase();
  if (!e || !EMAIL_RE.test(e)) {
    return { ok: false, reason: "Malformed email address", isRoleAccount: false, isDisposable: false };
  }
  const [local, domain] = e.split("@");
  if (!local || !domain || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return { ok: false, reason: "Malformed local part", isRoleAccount: false, isDisposable: false };
  }
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);
  if (isDisposable) {
    return { ok: false, reason: "Disposable email domain", isRoleAccount: false, isDisposable: true };
  }
  return {
    ok: true,
    reason: "Syntax OK (deliverability not yet proven)",
    isRoleAccount: ROLE_PREFIXES.has(local),
    isDisposable: false,
  };
}

/**
 * Verify one email. Uses MillionVerifier when MILLIONVERIFIER_API_KEY is set
 * (cheapest credible verifier, ~$1.99–$4.90 / 1k, 100 free credits).
 * Without a key the result is UNKNOWN — the send gate will block it.
 */
export async function verifyEmail(email: string, preVerified?: EmailVerificationStatus): Promise<EmailVerificationResult> {
  const e = (email || "").trim().toLowerCase();
  const now = new Date().toISOString();
  const syntax = checkEmailSyntax(e);

  if (!syntax.ok) {
    return {
      email: e, status: "INVALID", source: "syntax-only", reason: syntax.reason,
      isRoleAccount: syntax.isRoleAccount, isDisposable: syntax.isDisposable,
      isCatchAll: false, checkedAt: now,
    };
  }

  if (preVerified === "VALID") {
    return {
      email: e,
      status: "VALID",
      source: "prospeo-smtp-verified",
      reason: "SMTP deliverability verified by lead provider",
      isRoleAccount: syntax.isRoleAccount,
      isDisposable: syntax.isDisposable,
      isCatchAll: false,
      checkedAt: now,
    };
  }

  const apiKey = process.env.MILLIONVERIFIER_API_KEY;
  if (apiKey && apiKey.trim() !== "") {
    try {
      const url = `https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(e)}&timeout=20`;
      const res = await fetch(url);
      if (res.ok) {
        const data: any = await res.json();
        // MillionVerifier: result = ok | catch_all | unknown | disposable | invalid
        const raw = String(data.result || "").toLowerCase();
        const isCatchAll = raw === "catch_all" || data.catch_all === true;
        let status: EmailVerificationStatus = "UNKNOWN";
        if (raw === "ok") status = "VALID";
        else if (raw === "invalid" || raw === "disposable") status = "INVALID";
        else if (isCatchAll || raw === "unknown") status = "RISKY";
        return {
          email: e, status, source: "millionverifier",
          reason: `MillionVerifier: ${raw || "no result"}${data.subresult ? ` (${data.subresult})` : ""}`,
          isRoleAccount: syntax.isRoleAccount, isDisposable: syntax.isDisposable,
          isCatchAll, checkedAt: now,
        };
      }
    } catch (err) {
      console.warn("MillionVerifier call failed, treating as UNKNOWN:", err);
    }
    return {
      email: e, status: "UNKNOWN", source: "millionverifier",
      reason: "Verifier did not return a result — do not send until re-checked",
      isRoleAccount: syntax.isRoleAccount, isDisposable: false, isCatchAll: false, checkedAt: now,
    };
  }

  return {
    email: e, status: "UNKNOWN", source: "none",
    reason: "No verifier configured (set MILLIONVERIFIER_API_KEY). Syntax is OK but deliverability is unproven — send gate blocks UNKNOWN.",
    isRoleAccount: syntax.isRoleAccount, isDisposable: false, isCatchAll: false, checkedAt: now,
  };
}

/**
 * The send gate. Every dispatch path must call this (the dispatcher does).
 * `manualOverride` is for a human sending ONE risky email deliberately —
 * it never applies to autopilot / bulk.
 */
export function canSendOutreach(params: {
  verificationStatus: EmailVerificationStatus;
  suppressed?: boolean;
  manualOverride?: boolean;
}): { allowed: boolean; reason: string } {
  if (params.suppressed) {
    return { allowed: false, reason: "Recipient or domain is on the suppression list" };
  }
  switch (params.verificationStatus) {
    case "VALID":
      return { allowed: true, reason: "Email verified VALID" };
    case "RISKY":
      return params.manualOverride
        ? { allowed: true, reason: "RISKY (catch-all/unknown) — human manual override for a single send" }
        : { allowed: false, reason: "Email is RISKY (catch-all or uncertain). A human must override for a single manual send; autopilot never sends to RISKY." };
    case "INVALID":
      return { allowed: false, reason: "Email verified INVALID — never send" };
    default:
      return { allowed: false, reason: "Email not verified yet (UNKNOWN). Run verification first — guessed or unchecked emails are never sent." };
  }
}

/** True when an address looks invented by pattern (first@, ceo@, etc.). */
export function looksGuessed(email: string, firstName?: string): boolean {
  const e = (email || "").trim().toLowerCase();
  const local = e.split("@")[0] || "";
  if (ROLE_PREFIXES.has(local)) return true;
  if (firstName && local === firstName.toLowerCase()) return true;
  return false;
}
