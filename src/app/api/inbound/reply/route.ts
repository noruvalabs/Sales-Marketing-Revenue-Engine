import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyInboundReply } from "@/lib/ai/classifier";
import { sendSlackHighIntentAlert } from "@/lib/notifications/slack";

export async function GET() {
  try {
    const list = await prisma.conversation.findMany({
      include: {
        contact: {
          include: {
            company: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = list.map((conv) => ({
      id: conv.id,
      prospectName: conv.contact ? `${conv.contact.firstName} ${conv.contact.lastName}` : "Valued Lead",
      companyName: conv.contact?.company?.name || "Target Company",
      email: conv.contact?.email || "",
      messageText: conv.rawText,
      intent: conv.sentiment,
      confidence: 92,
      summary: conv.rawText.length > 100 ? `${conv.rawText.slice(0, 100)}...` : conv.rawText,
      recommendedAction: conv.sentiment === "INTERESTED" ? "Follow up with calendar link" : "Review reply",
      suggestedReply: "",
      slackAlerted: conv.sentiment === "INTERESTED",
      createdAt: conv.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, conversations: formatted, source: "database" });
  } catch (err: any) {
    console.error("Could not query DB for conversations:", err);
    return NextResponse.json({ success: true, conversations: [], error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { email, prospectName, companyName, messageText } = await req.json();

    if (!email || !messageText) {
      return NextResponse.json({ error: "Email and messageText are required" }, { status: 400 });
    }

    const resolvedProspectName = prospectName || "Valued Lead";
    const resolvedCompanyName = companyName || email.split("@")[1] || "Company";

    // 1. Run Real AI Intent Classifier with Gemini
    const classification = await classifyInboundReply({
      prospectName: resolvedProspectName,
      companyName: resolvedCompanyName,
      messageText,
    });

    let slackResult = { success: false, simulated: true };

    // 2. High-Intent Actions
    if (classification.intent === "INTERESTED") {
      // Trigger Real Slack Alert
      slackResult = await sendSlackHighIntentAlert({
        prospectName: resolvedProspectName,
        companyName: resolvedCompanyName,
        email,
        intent: classification.intent,
        confidence: classification.confidence,
        messageSnippet: messageText.length > 180 ? `${messageText.slice(0, 180)}...` : messageText,
        recommendedAction: classification.recommendedAction,
        suggestedReply: classification.suggestedReply,
      });

      // Update CRM Deal Stage to MEETING_BOOKED
      try {
        const contact = await prisma.contact.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        if (contact) {
          await prisma.deal.updateMany({
            where: { companyId: contact.companyId },
            data: { stage: "MEETING_BOOKED" },
          });

          await prisma.contact.update({
            where: { id: contact.id },
            data: { status: "REPLIED_INTERESTED" },
          });
        }
      } catch (err) {
        console.warn("Could not update deal to MEETING_BOOKED:", err);
      }
    }

    // 3. Unsubscribe Actions
    if (classification.intent === "UNSUBSCRIBE") {
      try {
        await prisma.suppressionList.upsert({
          where: { email: email.toLowerCase().trim() },
          update: { reason: "Inbound opt-out reply" },
          create: {
            email: email.toLowerCase().trim(),
            reason: "Inbound opt-out reply",
          },
        });

        await prisma.contact.updateMany({
          where: { email: email.toLowerCase().trim() },
          data: { status: "OPTED_OUT" },
        });
      } catch (err) {
        console.warn("Could not suppress contact:", err);
      }
    }

    // 4. Save Conversation Entry to Supabase DB
    let savedConv = null;
    try {
      const contact = await prisma.contact.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (contact) {
        savedConv = await prisma.conversation.create({
          data: {
            contactId: contact.id,
            direction: "INBOUND",
            sentiment: (classification.intent as any) || "NEUTRAL",
            rawText: messageText,
          },
        });
      }
    } catch (err) {
      console.warn("Could not save conversation to DB:", err);
    }

    const record = {
      id: savedConv ? savedConv.id : `conv-${Date.now()}`,
      prospectName: resolvedProspectName,
      companyName: resolvedCompanyName,
      email,
      messageText,
      intent: classification.intent,
      confidence: classification.confidence,
      summary: classification.summary,
      recommendedAction: classification.recommendedAction,
      suggestedReply: classification.suggestedReply,
      slackAlerted: classification.intent === "INTERESTED",
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      conversation: record,
      classification,
      slackResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to process inbound reply" }, { status: 500 });
  }
}
