import { sendOutreachEmail } from "@/lib/email/dispatcher";
import { prisma } from "@/lib/prisma";
import { HunterLeadProfile } from "@/lib/discovery/multiSourceHunter";

export type ConnectionChannel = "EMAIL" | "LINKEDIN" | "OMNICHANNEL";

export interface ConnectResult {
  leadName: string;
  domain: string;
  channel: ConnectionChannel;
  emailDispatched: boolean;
  emailStatus?: string;
  linkedinConnected: boolean;
  socialNoteSent?: string;
  auditMessage: string;
}

/**
 * Connects to a qualified lead autonomously across selected channels
 */
export async function connectLeadAutonomously(
  lead: HunterLeadProfile,
  preferredChannel: ConnectionChannel = "OMNICHANNEL"
): Promise<ConnectResult> {
  const result: ConnectResult = {
    leadName: lead.name,
    domain: lead.domain,
    channel: preferredChannel,
    emailDispatched: false,
    linkedinConnected: false,
    auditMessage: "",
  };

  const shouldSendEmail = preferredChannel === "EMAIL" || preferredChannel === "OMNICHANNEL";
  const shouldSendLinkedIn = preferredChannel === "LINKEDIN" || preferredChannel === "OMNICHANNEL";

  // 1. Autonomous Email Dispatch
  if (shouldSendEmail && lead.contactEmail) {
    try {
      const emailRes = await sendOutreachEmail({
        toEmail: lead.contactEmail,
        toName: lead.contactName,
        companyName: lead.name,
        subject: lead.qualification.emailDraft.subject,
        body: lead.qualification.emailDraft.body,
        draftId: `auto-outreach-${Date.now()}`,
        // Autopilot path: hard verification gate, no manual override, ever.
        emailVerificationStatus: lead.emailVerification || "UNKNOWN",
      });

      result.emailDispatched = emailRes.success;
      result.emailStatus = emailRes.success
        ? `Sent (ID: ${emailRes.messageId || "simulated"})`
        : `Failed: ${emailRes.error || "Unknown error"}`;
    } catch (err: any) {
      result.emailStatus = `Email dispatch failed: ${err.message}`;
    }
  }

  // 2. LinkedIn / Social Touchpoint — MANUAL ONLY (v1 honesty fix).
  // The old code set linkedinConnected = true without doing anything.
  // LinkedIn automation and scraping violate LinkedIn's ToS and get
  // accounts restricted (public cases in 2025). So we create a manual
  // task with a drafted note for a human to send — and report it as a
  // task, not as a connection.
  if (shouldSendLinkedIn && (lead.linkedinUrl || lead.source === "LINKEDIN")) {
    result.linkedinConnected = false;
    result.socialNoteSent = lead.socialConnectNote;

    try {
      await prisma.auditLog.create({
        data: {
          action: "LINKEDIN_MANUAL_TASK_CREATED",
          entityType: "Contact",
          entityId: lead.domain,
          details: {
            performedBy: "Autonomous Growth Agent (Autopilot)",
            contactName: lead.contactName,
            contactTitle: lead.contactTitle,
            companyName: lead.name,
            channel: "LINKEDIN",
            note: "Manual task for a human — LinkedIn is never automated by this engine.",
            socialConnectNote: lead.socialConnectNote,
          },
        },
      });
    } catch (err) {
      // Memory fallback
    }
  }

  result.auditMessage = `Connected to ${lead.contactName} (${lead.name}) via ${preferredChannel}. Email: ${
    result.emailDispatched ? "SENT" : "SKIPPED/SIMULATED"
  }, LinkedIn: ${result.socialNoteSent ? "MANUAL TASK CREATED (not auto-sent)" : "N/A"}`;

  return result;
}
