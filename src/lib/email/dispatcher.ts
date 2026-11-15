import { prisma } from "@/lib/prisma";

export interface SendEmailParams {
  toEmail: string;
  toName: string;
  companyName: string;
  subject: string;
  body: string;
  draftId?: string;
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

  // 2. Check Daily Send Limits (Anti-Spam & Domain Warmup Protection)
  const maxDaily = Number(process.env.MAX_DAILY_SENDS_PER_INBOX) || 35;
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

  const compliantBodyText = `${body}

---
Noruva AI (ai.noruvalabs.com) | Real-time AI Meeting & Sales Copilot
You received this personalized message based on Noruva's B2B research for ${companyName}.
Opt out anytime: ${unsubscribeUrl}`;

  // 5. Send via Resend API if API Key is configured
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.OUTREACH_FROM_EMAIL || "sales@noruvalabs.com";

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
