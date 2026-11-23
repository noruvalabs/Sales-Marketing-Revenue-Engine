import { prisma } from "@/lib/prisma";
import { canSendOutreach, type EmailVerificationStatus } from "@/lib/verification/emailVerifier";
import { getDailySendCap } from "@/lib/settings";

export interface SendEmailParams {
  toEmail: string;
  toName: string;
  companyName: string;
  subject: string;
  body: string;
  draftId?: string;
  /**
   * Verification verdict for toEmail. When provided, the hard gate in
   * emailVerifier applies: only VALID sends (RISKY only with a human's
   * single-send override). Callers that know the contact should always
   * pass this — guessed/unverified emails were the old engine's #1 risk.
   */
  emailVerificationStatus?: EmailVerificationStatus;
  /** Human deliberately sending ONE risky email. Never set by autopilot. */
  manualOverride?: boolean;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  suppressed?: boolean;
  simulated?: boolean;
}

// In-memory daily counter and suppression fallback if DB is not connected
let dailySendCount = 0;
let lastResetDate = new Date().toDateString();

export async function sendOutreachEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { toEmail, toName, companyName, subject, body } = params;

  // 1. Check Global Emergency Kill Switch
  const killSwitch = process.env.OUTREACH_KILL_SWITCH === "true";
  if (killSwitch) {
    return {
      success: false,
      error: "Emergency Kill Switch is active. All outbound dispatch is currently suspended.",
    };
  }

  // 1b. Verification gate — runs before limits/suppression so a blocked
  // address never consumes send quota. Enforced only when the caller
  // supplied a verdict; routes that load the contact from DB do.
  if (params.emailVerificationStatus !== undefined) {
    const gate = canSendOutreach({
      verificationStatus: params.emailVerificationStatus,
      manualOverride: params.manualOverride,
    });
    if (!gate.allowed) {
      return { success: false, error: `Verification gate: ${gate.reason}` };
    }
  }

  // 2. Check Daily Send Limits (Anti-Spam & Domain Warmup Protection)
  // One shared cap (src/lib/settings.ts): the number the admin sets in
  // the dashboard. Applies to manual sends too, not just autopilot.
  const maxDaily = getDailySendCap();
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailySendCount = 0;
    lastResetDate = today;
  }

  if (dailySendCount >= maxDaily) {
    return {
      success: false,
      error: `Daily volume limit of ${maxDaily} emails reached. Dispatches paused until tomorrow to preserve domain reputation.`,
    };
  }

  // 3. Check Global Suppression List (CAN-SPAM / GDPR Compliance)
  const emailDomain = toEmail.split("@")[1]?.toLowerCase();
  try {
    const isSuppressed = await prisma.suppressionList.findFirst({
      where: {
        OR: [{ email: toEmail.toLowerCase() }, { domain: emailDomain }],
      },
    });

    if (isSuppressed) {
      return {
        success: false,
        suppressed: true,
        error: `Recipient ${toEmail} or domain @${emailDomain} is on the global suppression list (${isSuppressed.reason}).`,
      };
    }
  } catch (err) {
    console.warn("Could not query suppression table from DB:", err);
  }

  // 4. Construct Compliant Email with 1-Click Unsubscribe
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const unsubscribeUrl = `${appUrl}/api/unsubscribe?email=${encodeURIComponent(toEmail)}`;

  // CAN-SPAM has NO B2B exception: a real physical postal address is legally
  // required in every commercial email. Set COMPANY_PHYSICAL_ADDRESS before
  // any live send — do not fake one.
  const physicalAddress = process.env.COMPANY_PHYSICAL_ADDRESS || "";
  const compliantBodyText = `${body}

---
Noruva AI (ai.noruvalabs.com) | Real-time AI Meeting & Sales Copilot${physicalAddress ? `\n${physicalAddress}` : ""}
You received this personalized message based on Noruva's B2B research for ${companyName}.
Opt out anytime: ${unsubscribeUrl}`;

  const fromEmail = process.env.OUTREACH_FROM_EMAIL || process.env.SMTP_USER || "sales@noruvalabs.com";

  // 5. Send via Direct SMTP (Gmail) if configured - ZERO DNS Required!
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpUser && smtpPass && smtpUser.trim() !== "" && smtpPass.trim() !== "") {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: smtpUser,
          pass: smtpPass.replace(/\s+/g, ""), // clean spaces in app password
        },
      });

      const info = await transporter.sendMail({
        from: `Noruva AI <${fromEmail}>`,
        to: toEmail,
        subject,
        text: compliantBodyText,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
        },
      });

      dailySendCount++;
      return {
        success: true,
        messageId: info.messageId,
        simulated: false,
      };
    } catch (smtpErr: any) {
      console.error("Gmail SMTP dispatch failed:", smtpErr);
      return {
        success: false,
        error: smtpErr.message || "Failed to send email via SMTP",
      };
    }
  }

  // 6. Send via Resend API if API Key is configured
  // WARNING (v1): Resend's Acceptable Use Policy prohibits unsolicited cold
  // outreach / purchased or scraped lists — account-loss risk. Use Resend
  // only for opted-in / transactional mail. For cold sequences use a
  // dedicated outreach domain on Instantly or Smartlead (see docs/REAL_V1.md).
  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey && resendApiKey.trim() !== "") {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          subject,
          text: compliantBodyText,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to dispatch via Resend");
      }

      dailySendCount++;
      return {
        success: true,
        messageId: data.id,
        simulated: false,
      };
    } catch (apiErr: any) {
      console.error("Resend API failed:", apiErr);
      return {
        success: false,
        error: apiErr.message || "Failed to send email via API",
      };
    }
  }

  // 6. Safe Sandbox / Simulation Mode (Works 100% Free with $0 Cost)
  dailySendCount++;
  console.log(`[SIMULATED DISPATCH] Sent to ${toEmail} (${toName}) - Subject: "${subject}"`);
  return {
    success: true,
    messageId: `sim-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    simulated: true,
  };
}

