import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { qualifyCompany } from "@/lib/ai/qualify";

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

    const formatted = dbCompanies.map((c) => ({
      ...c,
      draft: c.contacts?.[0]?.outreachDrafts?.[0] || null,
      deal: c.deals?.[0] || null,
    }));

    return NextResponse.json({ success: true, companies: formatted, source: "database" });
  } catch (err: any) {
    console.error("Database query failed in /api/leads:", err);
    return NextResponse.json({ success: false, companies: [], error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, domain, industry, size, hiringSignals, contactName, contactEmail, contactTitle } = body;

    if (!name || !domain) {
      return NextResponse.json({ error: "Company name and domain are required" }, { status: 400 });
    }

    // 1. Run Real AI Qualification Engine via Gemini
    const qualification = await qualifyCompany({
      name,
      domain,
      industry,
      size,
      hiringSignals,
      contactName,
      contactTitle,
    });

    const normalizedDomain = domain.toLowerCase().trim();
    const firstName = contactName ? contactName.split(" ")[0] : "Team";
    const lastName = contactName && contactName.split(" ").length > 1 ? contactName.split(" ").slice(1).join(" ") : "Lead";
    const email = contactEmail ? contactEmail.toLowerCase().trim() : `contact@${normalizedDomain}`;
    const valueMrr = qualification.score * 5;

    // 2. Persist to Supabase Database
    const created = await prisma.company.create({
      data: {
        name,
        domain: normalizedDomain,
        industry: industry || "Technology",
        size: size || "10-50",
        hiringSignals: hiringSignals || "Active business signals",
        icpScore: qualification.score,
        icpScoreReason: qualification.reason,
        recommendedPillar: qualification.recommendedPillar,
        status: qualification.score >= 70 ? "QUALIFIED" : "DISQUALIFIED",
        contacts: {
          create: [
            {
              firstName,
              lastName,
              title: contactTitle || "Decision Maker",
              email,
              outreachDrafts: {
                create: [
                  {
                    subject: qualification.emailDraft.subject,
                    body: qualification.emailDraft.body,
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
              valueMrr,
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

    const formatted = {
      ...created,
      draft: created.contacts?.[0]?.outreachDrafts?.[0] || null,
      deal: created.deals?.[0] || null,
    };

    return NextResponse.json({ success: true, company: formatted, qualification });
  } catch (error: any) {
    console.error("Error creating lead in /api/leads:", error);
    return NextResponse.json({ error: error.message || "Failed to process lead" }, { status: 500 });
  }
}
