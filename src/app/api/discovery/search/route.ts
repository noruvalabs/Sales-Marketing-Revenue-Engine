import { NextResponse } from "next/server";
import { discoverLeadsAutomatically } from "@/lib/discovery/finder";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { personaKeyword, pillar, count = 3 } = await req.json();

    const discovered = await discoverLeadsAutomatically({
      personaKeyword: personaKeyword || "B2B SaaS companies hiring remote SDRs and sales reps",
      pillar: pillar || "CLIENT_MEETINGS",
      count: Number(count) || 3,
    });

    const insertedLeads = [];

    for (const lead of discovered) {
      const companyRecord = {
        id: `disc-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: lead.name,
        domain: lead.domain.toLowerCase().trim(),
        industry: lead.industry,
        size: lead.size,
        country: lead.country,
        hiringSignals: lead.hiringSignals,
        icpScore: lead.qualification.score,
        icpScoreReason: lead.qualification.reason,
        recommendedPillar: lead.qualification.recommendedPillar,
        status: lead.qualification.score >= 70 ? "QUALIFIED" : "DISQUALIFIED",
        contacts: [
          {
            id: `c-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            firstName: lead.contactName.split(" ")[0],
            lastName: lead.contactName.split(" ").slice(1).join(" ") || "Lead",
            title: lead.contactTitle,
            email: lead.contactEmail,
            status: "DRAFT_PENDING_APPROVAL",
          },
        ],
        draft: {
          id: `d-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          subject: lead.qualification.emailDraft.subject,
          body: lead.qualification.emailDraft.body,
          status: "PENDING_APPROVAL",
        },
        deal: {
          stage: "QUALIFIED_LEAD",
          valueMrr: lead.qualification.score * 6,
        },
      };

      try {
        await prisma.company.upsert({
          where: { domain: companyRecord.domain },
          update: {
            icpScore: companyRecord.icpScore,
            icpScoreReason: companyRecord.icpScoreReason,
            hiringSignals: companyRecord.hiringSignals,
          },
          create: {
            name: companyRecord.name,
            domain: companyRecord.domain,
            industry: companyRecord.industry,
            size: companyRecord.size,
            country: companyRecord.country,
            hiringSignals: companyRecord.hiringSignals,
            icpScore: companyRecord.icpScore,
            icpScoreReason: companyRecord.icpScoreReason,
            recommendedPillar: companyRecord.recommendedPillar as any,
            status: companyRecord.status as any,
          },
        });
      } catch (err) {
        // Fallback to memory
      }

      insertedLeads.push(companyRecord);
    }

    return NextResponse.json({
      success: true,
      count: insertedLeads.length,
      leads: insertedLeads,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Discovery search failed" }, { status: 500 });
  }
}

