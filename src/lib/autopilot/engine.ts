import { huntMultiSourceLeads, HunterLeadProfile, LeadSource } from "@/lib/discovery/multiSourceHunter";
import { connectLeadAutonomously, ConnectionChannel } from "@/lib/connectors/channelConnector";
import { prisma } from "@/lib/prisma";

export interface AutopilotLogEntry {
  id: string;
  timestamp: string;
  summary: string;
  discoveredCount: number;
  autoDispatchedCount: number;
  sourcesUsed: string[];
  companies: string[];
}

export interface AutopilotConfig {
  enabled: boolean;
  minScoreToAutoDispatch: number; // default 85
  maxDailyAutoSends: number; // default 30
  targetPillars: Array<"CLIENT_MEETINGS" | "INTERVIEW_COPILOT" | "CUSTOMER_SUPPORT" | "BILINGUAL_AI">;
  activeSources: LeadSource[];
  connectionChannel: ConnectionChannel;
  lastRunAt: string | null;
  nextRunScheduledAt: string | null;
}

let autopilotConfig: AutopilotConfig = {
  enabled: false,
  minScoreToAutoDispatch: 85,
  maxDailyAutoSends: 30,
  targetPillars: ["CLIENT_MEETINGS", "INTERVIEW_COPILOT", "CUSTOMER_SUPPORT", "BILINGUAL_AI"],
  activeSources: ["PROSPEO", "APOLLO"],
  connectionChannel: "OMNICHANNEL",
  lastRunAt: null,
  nextRunScheduledAt: null,
};

let autopilotLogs: AutopilotLogEntry[] = [];

export function getAutopilotState() {
  return {
    config: autopilotConfig,
    logs: autopilotLogs,
  };
}

export function updateAutopilotConfig(updates: Partial<AutopilotConfig>) {
  autopilotConfig = { ...autopilotConfig, ...updates };
  return autopilotConfig;
}

export async function runAutopilotCycle(customParams?: {
  pillar?: "CLIENT_MEETINGS" | "INTERVIEW_COPILOT" | "CUSTOMER_SUPPORT" | "BILINGUAL_AI";
  sources?: LeadSource[];
  count?: number;
}): Promise<{
  success: boolean;
  summary: string;
  discovered: number;
  autoDispatched: number;
  leads: any[];
  error?: string;
}> {
  // 1. Check Kill Switch
  const killSwitch = process.env.OUTREACH_KILL_SWITCH === "true";
  if (killSwitch) {
    return {
      success: false,
      summary: "Autopilot cycle aborted: Emergency Kill Switch is ACTIVE.",
      discovered: 0,
      autoDispatched: 0,
      leads: [],
      error: "Kill switch active",
    };
  }

  // 2. Select target pillar & sources for this autonomous cycle
  const pillarToRun =
    customParams?.pillar ||
    autopilotConfig.targetPillars[Math.floor(Math.random() * autopilotConfig.targetPillars.length)] ||
    "CLIENT_MEETINGS";

  const sourcesToHunt = customParams?.sources || autopilotConfig.activeSources;

  // 3. Autonomous Multi-Source Lead Hunting (Google, Apollo, LinkedIn, Facebook)
  const discovered: HunterLeadProfile[] = await huntMultiSourceLeads({
    personaKeyword: "High-growth tech companies hiring remote sales reps, technical interviewers, and multilingual support",
    pillar: pillarToRun,
    sources: sourcesToHunt,
    count: customParams?.count || 4,
  });

  const processedLeads: any[] = [];
  const autoDispatchedCompanies: string[] = [];
  let autoDispatchedCount = 0;

  for (const item of discovered) {
    const score = item.qualification.score;
    // v1 safety fix: a high score alone NEVER auto-sends. Auto-dispatch
    // requires ALL of: score >= threshold, email verified VALID, and the
    // explicit env opt-in AUTOPILOT_ALLOW_AUTO_SEND=true (earn autopilot
    // per campaign after a human-approved track record — Artisan/Jason
    // "autonomy dial" pattern). Everything else waits in the approval queue.
    const autoSendAllowed = process.env.AUTOPILOT_ALLOW_AUTO_SEND === "true";
    const isUltraHighFit =
      score >= autopilotConfig.minScoreToAutoDispatch &&
      item.emailVerification === "VALID" &&
      autoSendAllowed;

    const companyRecord: any = {
      id: `auto-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: item.name,
      domain: item.domain.toLowerCase().trim(),
      industry: item.industry,
      size: item.size,
      country: item.country,
      hiringSignals: item.hiringSignals,
      source: item.source,
      sourceUrl: item.sourceUrl,
      linkedinUrl: item.linkedinUrl,
      facebookUrl: item.facebookUrl,
      twitterUrl: item.twitterUrl,
      icpScore: score,
      icpScoreReason: item.qualification.reason,
      recommendedPillar: item.qualification.recommendedPillar,
      status: score >= 70 ? "QUALIFIED" : "DISQUALIFIED",
      socialConnectNote: item.socialConnectNote,
      contacts: [
        {
          id: `c-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          firstName: item.contactName.split(" ")[0],
          lastName: item.contactName.split(" ").slice(1).join(" ") || "Lead",
          title: item.contactTitle,
          email: item.contactEmail,
          status: isUltraHighFit ? "OUTREACH_ACTIVE" : "DRAFT_PENDING_APPROVAL",
        },
      ],
      draft: {
        id: `d-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        subject: item.qualification.emailDraft.subject,
        body: item.qualification.emailDraft.body,
        status: isUltraHighFit ? "SENT" : "PENDING_APPROVAL",
        sentAt: isUltraHighFit ? new Date().toISOString() : null,
      },
      deal: {
        stage: isUltraHighFit ? "CONTACTED" : "QUALIFIED_LEAD",
        valueMrr: score * 6,
      },
    };

    // 4. Autonomous Omni-Channel Connection (Zero Human Command Required)
    if (isUltraHighFit) {
      await connectLeadAutonomously(item, autopilotConfig.connectionChannel);

      autoDispatchedCount++;
      autoDispatchedCompanies.push(`${item.name} (${item.source} - Score ${score})`);
    }

    // Persist to DB if available
    try {
      const savedCompany = await prisma.company.upsert({
        where: { domain: companyRecord.domain },
        update: {
          icpScore: companyRecord.icpScore,
          icpScoreReason: companyRecord.icpScoreReason,
          status: companyRecord.status as any,
          source: companyRecord.source,
          researchEvidenceUrl: item.researchEvidenceUrl,
        },
        create: {
          name: companyRecord.name,
          domain: companyRecord.domain,
          industry: companyRecord.industry,
          size: companyRecord.size,
          country: companyRecord.country,
          hiringSignals: companyRecord.hiringSignals,
          source: companyRecord.source,
          researchEvidenceUrl: item.researchEvidenceUrl,
          icpScore: companyRecord.icpScore,
          icpScoreReason: companyRecord.icpScoreReason,
          recommendedPillar: companyRecord.recommendedPillar as any,
          status: companyRecord.status as any,
          contacts: {
            create: [
              {
                firstName: companyRecord.contacts[0].firstName,
                lastName: companyRecord.contacts[0].lastName,
                title: companyRecord.contacts[0].title,
                email: companyRecord.contacts[0].email,
                source: companyRecord.source,
                emailVerification: item.emailVerification || "VALID",
                status: isUltraHighFit ? "OUTREACH_ACTIVE" : "DRAFT_PENDING_APPROVAL",
                outreachDrafts: {
                  create: [
                    {
                      subject: companyRecord.draft.subject,
                      body: companyRecord.draft.body,
                      evidenceUrl: item.researchEvidenceUrl,
                      status: isUltraHighFit ? "SENT" : "PENDING_APPROVAL",
                      sentAt: isUltraHighFit ? new Date() : null,
                    },
                  ],
                },
              },
            ],
          },
          deals: {
            create: [
              {
                stage: isUltraHighFit ? "CONTACTED" : "QUALIFIED_LEAD",
                valueMrr: companyRecord.deal.valueMrr,
              },
            ],
          },
        },
        include: {
          contacts: {
            include: {
              outreachDrafts: true,
            },
          },
          deals: true,
        },
      });

      if (savedCompany.contacts.length === 0) {
        await prisma.contact.create({
          data: {
            companyId: savedCompany.id,
            firstName: companyRecord.contacts[0].firstName,
            lastName: companyRecord.contacts[0].lastName,
            title: companyRecord.contacts[0].title,
            email: companyRecord.contacts[0].email,
            source: companyRecord.source,
            emailVerification: item.emailVerification || "VALID",
            status: isUltraHighFit ? "OUTREACH_ACTIVE" : "DRAFT_PENDING_APPROVAL",
            outreachDrafts: {
              create: [
                {
                  subject: companyRecord.draft.subject,
                  body: companyRecord.draft.body,
                  evidenceUrl: item.researchEvidenceUrl,
                  status: isUltraHighFit ? "SENT" : "PENDING_APPROVAL",
                  sentAt: isUltraHighFit ? new Date() : null,
                },
              ],
            },
          },
        });
      }
    } catch (err) {
      console.warn("Could not persist autopilot lead to DB:", err);
    }

    processedLeads.push(companyRecord);
  }

  // 5. Update Autopilot State & History
  const now = new Date();
  autopilotConfig.lastRunAt = now.toISOString();
  autopilotConfig.nextRunScheduledAt = new Date(now.getTime() + 3600000 * 6).toISOString();

  const sourcesList = Array.from(new Set(discovered.map((d) => d.source)));
  const cycleSummary = `Autonomous Cycle Complete: Hunted ${discovered.length} accounts via [${sourcesList.join(", ")}]. ${autoDispatchedCount} scored ≥ ${autopilotConfig.minScoreToAutoDispatch} and were auto-connected via ${autopilotConfig.connectionChannel}.`;

  const newLog: AutopilotLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: now.toISOString(),
    summary: cycleSummary,
    discoveredCount: discovered.length,
    autoDispatchedCount,
    sourcesUsed: sourcesList,
    companies: autoDispatchedCompanies,
  };

  autopilotLogs.unshift(newLog);

  return {
    success: true,
    summary: cycleSummary,
    discovered: discovered.length,
    autoDispatched: autoDispatchedCount,
    leads: processedLeads,
  };
}
