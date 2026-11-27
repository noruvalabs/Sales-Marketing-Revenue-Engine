import { huntMultiSourceLeads, HunterLeadProfile, LeadSource } from "@/lib/discovery/multiSourceHunter";
import { connectLeadAutonomously, ConnectionChannel } from "@/lib/connectors/channelConnector";
import { prisma } from "@/lib/prisma";
import { getDailySendCap, setDailySendCap } from "@/lib/settings";

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

let dailyAutoDispatchedCount = 0;
let lastCycleDate = new Date().toDateString();

let autopilotConfig: AutopilotConfig = {
  enabled: true,
  minScoreToAutoDispatch: 80,
  maxDailyAutoSends: getDailySendCap(),
  targetPillars: ["CLIENT_MEETINGS", "INTERVIEW_COPILOT", "CUSTOMER_SUPPORT", "BILINGUAL_AI"],
  activeSources: ["WEB", "PROSPEO"],
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
  // Keep the shared settings store in sync so the email dispatcher
  // enforces the SAME cap the admin sees in the dashboard.
  if (updates.maxDailyAutoSends !== undefined) {
    updates = { ...updates, maxDailyAutoSends: setDailySendCap(updates.maxDailyAutoSends) };
  }
  autopilotConfig = { ...autopilotConfig, ...updates };
  return autopilotConfig;
}

/**
 * How many outreach emails were ACTUALLY sent today, counted from the DB.
 * The in-memory counter resets on every server restart, which used to let
 * the engine exceed the daily cap after a restart. The DB count survives.
 * Falls back to the in-memory counter when the DB is unreachable.
 */
async function getTodaySentCount(fallback: number): Promise<number> {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const dbCount = await prisma.outreachDraft.count({
      where: { status: "SENT", sentAt: { gte: start } },
    });
    return Math.max(dbCount, fallback);
  } catch {
    return fallback;
  }
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

  // 3. Autonomous Multi-Source Lead Hunting (Paced at 5 per batch for optimal inbox reputation)
  const discovered: HunterLeadProfile[] = await huntMultiSourceLeads({
    personaKeyword: "High-growth tech companies hiring remote sales reps, technical interviewers, and multilingual support",
    pillar: pillarToRun,
    sources: sourcesToHunt,
    count: customParams?.count || 5,
  });

  const processedLeads: any[] = [];
  const autoDispatchedCompanies: string[] = [];
  let autoDispatchedCount = 0;

  const today = new Date().toDateString();
  if (today !== lastCycleDate) {
    dailyAutoDispatchedCount = 0;
    lastCycleDate = today;
  }
  // Re-sync the daily counter from the DB so restarts cannot reset the cap.
  dailyAutoDispatchedCount = await getTodaySentCount(dailyAutoDispatchedCount);

  for (const item of discovered) {
    const score = item.qualification.score;
    // Candidate for auto-dispatch: score >= minScore, email verified VALID,
    // auto-send allowed, and under daily cap (50). CANDIDATE ONLY — the lead
    // is marked SENT further below, and only if the dispatcher confirms the
    // email really went out. (Bug fix: this used to mark SENT before/regardless
    // of the dispatch result, so failed or simulated sends looked successful.)
    const autoSendAllowed = process.env.AUTOPILOT_ALLOW_AUTO_SEND === "true";
    const underDailyCap = dailyAutoDispatchedCount < autopilotConfig.maxDailyAutoSends;
    const isCandidate =
      score >= autopilotConfig.minScoreToAutoDispatch &&
      item.emailVerification === "VALID" &&
      autoSendAllowed &&
      underDailyCap;

    // 4. Autonomous dispatch FIRST — record only what really happened.
    let actuallySent = false;
    let dispatchNote: string | undefined;
    if (isCandidate) {
      const result = await connectLeadAutonomously(item, autopilotConfig.connectionChannel);
      actuallySent = result.emailDispatched;
      dispatchNote = result.emailStatus;
      if (actuallySent) {
        autoDispatchedCount++;
        dailyAutoDispatchedCount++;
        autoDispatchedCompanies.push(`${item.name} (${item.source} - Score ${score})`);
      } else {
        console.warn(
          `[Autopilot] Dispatch to ${item.contactEmail} did NOT send: ${dispatchNote || "unknown reason"}. Lead stays in Approvals.`
        );
      }
    }

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
          // Phone for the AI Call Agent (develop2): brought by the hunter
          // (Prospeo mobile reveal or a number published on the company
          // website). Null when the hunter found none.
          phone: item.contactPhone || null,
          status: actuallySent ? "OUTREACH_ACTIVE" : "DRAFT_PENDING_APPROVAL",
        },
      ],
      draft: {
        id: `d-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        subject: item.qualification.emailDraft.subject,
        body: item.qualification.emailDraft.body,
        status: actuallySent ? "SENT" : "PENDING_APPROVAL",
        sentAt: actuallySent ? new Date().toISOString() : null,
      },
      deal: {
        stage: actuallySent ? "CONTACTED" : "QUALIFIED_LEAD",
        valueMrr: score * 6,
      },
    };

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
                phone: companyRecord.contacts[0].phone || null,
                phoneSource: companyRecord.contacts[0].phone ? companyRecord.source : null,
                source: companyRecord.source,
                // Never default a missing verdict to VALID — that would let
                // an unverified email look verified in the CRM.
                emailVerification: item.emailVerification || "UNKNOWN",
                status: actuallySent ? "OUTREACH_ACTIVE" : "DRAFT_PENDING_APPROVAL",
                outreachDrafts: {
                  create: [
                    {
                      subject: companyRecord.draft.subject,
                      body: companyRecord.draft.body,
                      evidenceUrl: item.researchEvidenceUrl,
                      status: actuallySent ? "SENT" : "PENDING_APPROVAL",
                      sentAt: actuallySent ? new Date() : null,
                    },
                  ],
                },
              },
            ],
          },
          deals: {
            create: [
              {
                stage: actuallySent ? "CONTACTED" : "QUALIFIED_LEAD",
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
            phone: companyRecord.contacts[0].phone || null,
            phoneSource: companyRecord.contacts[0].phone ? companyRecord.source : null,
            source: companyRecord.source,
            emailVerification: item.emailVerification || "UNKNOWN",
            status: actuallySent ? "OUTREACH_ACTIVE" : "DRAFT_PENDING_APPROVAL",
            outreachDrafts: {
              create: [
                {
                  subject: companyRecord.draft.subject,
                  body: companyRecord.draft.body,
                  evidenceUrl: item.researchEvidenceUrl,
                  status: actuallySent ? "SENT" : "PENDING_APPROVAL",
                  sentAt: actuallySent ? new Date() : null,
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
  const cycleSummary = `Autonomous Cycle Complete: Hunted ${discovered.length} accounts via [${sourcesList.join(", ")}]. ${autoDispatchedCount} scored ≥ ${autopilotConfig.minScoreToAutoDispatch}, passed verification and were really dispatched via ${autopilotConfig.connectionChannel}.`;

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
