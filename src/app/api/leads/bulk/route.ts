import { NextResponse } from "next/server";
import { parseCSVLeads } from "@/lib/discovery/csvParser";
import { qualifyCompany } from "@/lib/ai/qualify";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { csvText } = await req.json();

    if (!csvText || csvText.trim().length === 0) {
      return NextResponse.json({ error: "Missing CSV text payload" }, { status: 400 });
    }

    const { leads, errors } = parseCSVLeads(csvText);

    if (errors.length > 0 && leads.length === 0) {
      return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
    }

    const processedLeads = [];
    let qualifiedCount = 0;
    let disqualifiedCount = 0;

    for (const item of leads) {
      const qualification = await qualifyCompany({
        name: item.name,
        domain: item.domain,
        industry: item.industry,
        size: item.size,
        hiringSignals: item.hiringSignals,
        contactName: item.contactName,
        contactTitle: item.contactTitle,
      });

      if (qualification.score >= 70) {
        qualifiedCount++;
      } else {
        disqualifiedCount++;
      }

      const companyRecord = {
        id: `csv-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: item.name,
        domain: item.domain.toLowerCase().trim(),
        industry: item.industry || "Technology",
        size: item.size || "20-100",
        hiringSignals: item.hiringSignals || "B2B growth signals",
        icpScore: qualification.score,
        icpScoreReason: qualification.reason,
        recommendedPillar: qualification.recommendedPillar,
        status: qualification.score >= 70 ? "QUALIFIED" : "DISQUALIFIED",
        contacts: [
          {
            id: `c-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            firstName: item.contactName ? item.contactName.split(" ")[0] : "Decision",
            lastName: item.contactName && item.contactName.split(" ").length > 1 ? item.contactName.split(" ").slice(1).join(" ") : "Maker",
            title: item.contactTitle || "Leader",
            email: item.contactEmail || `contact@${item.domain}`,
            status: "DRAFT_PENDING_APPROVAL",
          },
        ],
        draft: {
          id: `d-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          subject: qualification.emailDraft.subject,
          body: qualification.emailDraft.body,
          status: "PENDING_APPROVAL",
        },
        deal: {
          stage: "QUALIFIED_LEAD",
          valueMrr: qualification.score * 5,
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

      processedLeads.push(companyRecord);
    }

    return NextResponse.json({
      success: true,
      totalParsed: leads.length,
      qualifiedCount,
      disqualifiedCount,
      leads: processedLeads,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to process bulk CSV" }, { status: 500 });
  }
}

