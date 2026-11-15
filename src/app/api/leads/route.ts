import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { qualifyCompany } from "@/lib/ai/qualify";

// In-memory fallback store if PostgreSQL is not running yet during first setup
let memoryCompanies: any[] = [
  {
    id: "lead-1",
    name: "CloudScale Systems",
    domain: "cloudscale.io",
    industry: "Cloud Infrastructure",
    size: "50-100",
    country: "United States",
    hiringSignals: "Hiring 4 Remote SDRs & Account Executives",
    icpScore: 92,
    icpScoreReason: "Actively hiring multiple remote SDRs who need live objection handling on Zoom calls.",
    recommendedPillar: "CLIENT_MEETINGS",
    status: "QUALIFIED",
    contacts: [
      {
        id: "c-1",
        firstName: "Marcus",
        lastName: "Vance",
        title: "VP of Sales",
        email: "marcus@cloudscale.io",
        status: "DRAFT_PENDING_APPROVAL",
      },
    ],
    draft: {
      id: "d-1",
      subject: "Quick question on CloudScale's SDR ramp time",
      body: "Hi Marcus,\n\nI noticed CloudScale is expanding its sales team with 4 new SDR roles. Ramping new reps to handle live pricing objections on Zoom without stumbling usually takes 3+ months.\n\nNoruva AI acts as a subtle real-time meeting copilot that provides instant objection hints and value proposition cues on screen during live customer calls.\n\nOpen to a 3-minute video breakdown of how it accelerates SDR productivity?\n\nBest,\nNoruva AI Team",
      status: "PENDING_APPROVAL",
    },
    deal: {
      stage: "QUALIFIED_LEAD",
      valueMrr: 600,
    },
  },
  {
    id: "lead-2",
    name: "TalentForge Global",
    domain: "talentforge.co",
    industry: "Technical Recruiting Agency",
    size: "20-50",
    country: "United Kingdom",
    hiringSignals: "Hiring 10 Technical Screeners & Recruiters",
    icpScore: 88,
    icpScoreReason: "Recruiting firm conducting hundreds of technical candidate screenings weekly.",
    recommendedPillar: "INTERVIEW_COPILOT",
    status: "QUALIFIED",
    contacts: [
      {
        id: "c-2",
        firstName: "Elena",
        lastName: "Rostova",
        title: "Head of Talent Acquisition",
        email: "elena@talentforge.co",
        status: "DRAFT_PENDING_APPROVAL",
      },
    ],
    draft: {
      id: "d-2",
      subject: "Streamlining technical candidate screenings for TalentForge",
      body: "Hi Elena,\n\nConducting dozens of technical screening interviews each week takes an immense toll on talent teams.\n\nNoruva AI operates as an in-call copilot that listens live, pulls relevant candidate resume points, and suggests technical evaluation questions in real-time.\n\nWould you be open to a quick peek at how recruiting teams use this?\n\nBest,\nNoruva AI Team",
      status: "PENDING_APPROVAL",
    },
    deal: {
      stage: "QUALIFIED_LEAD",
      valueMrr: 450,
    },
  },
];

export async function GET() {
  try {
    const dbCompanies = await prisma.company.findMany({
      include: {
        contacts: {
          include: {
            outreachDrafts: true,
          },
        },
        deals: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (dbCompanies.length > 0) {
      return NextResponse.json({ success: true, companies: dbCompanies, source: "database" });
    }
  } catch (err) {
    console.warn("Database not connected yet, serving in-memory leads:", err);
  }

  return NextResponse.json({ success: true, companies: memoryCompanies, source: "memory" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, domain, industry, size, hiringSignals, contactName, contactEmail, contactTitle } = body;

    if (!name || !domain) {
      return NextResponse.json({ error: "Company name and domain are required" }, { status: 400 });
    }

    // 1. Run AI Qualification Engine
    const qualification = await qualifyCompany({
      name,
      domain,
      industry,
      size,
      hiringSignals,
      contactName,
      contactTitle,
    });

    const newCompany = {
      id: `lead-${Date.now()}`,
      name,
      domain: domain.toLowerCase().trim(),
      industry: industry || "Technology",
      size: size || "10-50",
      hiringSignals: hiringSignals || "Active business signals",
      icpScore: qualification.score,
      icpScoreReason: qualification.reason,
      recommendedPillar: qualification.recommendedPillar,
      status: qualification.score >= 70 ? "QUALIFIED" : "DISQUALIFIED",
      contacts: [
        {
          id: `c-${Date.now()}`,
          firstName: contactName ? contactName.split(" ")[0] : "Team",
          lastName: contactName && contactName.split(" ").length > 1 ? contactName.split(" ").slice(1).join(" ") : "Lead",
          title: contactTitle || "Decision Maker",
          email: contactEmail || `contact@${domain}`,
          status: "DRAFT_PENDING_APPROVAL",
        },
      ],
      draft: {
        id: `d-${Date.now()}`,
        subject: qualification.emailDraft.subject,
        body: qualification.emailDraft.body,
        status: "PENDING_APPROVAL",
      },
      deal: {
        stage: "QUALIFIED_LEAD",
        valueMrr: qualification.score * 5,
      },
    };

    // Try saving to DB if available
    try {
      const created = await prisma.company.create({
        data: {
          name: newCompany.name,
          domain: newCompany.domain,
          industry: newCompany.industry,
          size: newCompany.size,
          hiringSignals: newCompany.hiringSignals,
          icpScore: newCompany.icpScore,
          icpScoreReason: newCompany.icpScoreReason,
          recommendedPillar: newCompany.recommendedPillar,
          status: newCompany.status as any,
          contacts: {
            create: [
              {
                firstName: newCompany.contacts[0].firstName,
                lastName: newCompany.contacts[0].lastName,
                title: newCompany.contacts[0].title,
                email: newCompany.contacts[0].email,
                outreachDrafts: {
                  create: [
                    {
                      subject: newCompany.draft.subject,
                      body: newCompany.draft.body,
                      status: "PENDING_APPROVAL",
                    },
                  ],
                },
              },
            ],
          },
          deals: {
            create: [
              {
                stage: "QUALIFIED_LEAD",
                valueMrr: newCompany.deal.valueMrr,
              },
            ],
          },
        },
      });

      return NextResponse.json({ success: true, company: created, qualification });
    } catch (err) {
      console.warn("Could not persist to Postgres, saving to memory:", err);
    }

    memoryCompanies.unshift(newCompany);
    return NextResponse.json({ success: true, company: newCompany, qualification });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to process lead" }, { status: 500 });
  }
}

