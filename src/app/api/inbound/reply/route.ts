import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyInboundReply } from "@/lib/ai/classifier";
import { sendSlackHighIntentAlert } from "@/lib/notifications/slack";

// Fallback in-memory conversations list for UI reactivity
let memoryConversations: any[] = [
  {
    id: "conv-1",
    prospectName: "Marcus Vance",
    companyName: "CloudScale Systems",
    email: "marcus@cloudscale.io",
    messageText: "Hi! This timing is uncanny—we just hired 4 SDRs and ramping them is brutal. Can we do a 15-minute call Thursday morning?",
    intent: "INTERESTED",
    confidence: 96,
    summary: "High buying intent: Prospect requested a 15-minute call for Thursday.",
    recommendedAction: "Send calendar booking link and prepare Interview/Client Meeting demo.",
    suggestedReply: "Hi Marcus,\n\nThursday morning works great! You can grab any slot that suits you here: https://cal.com/noruva-team/15min\n\nLooking forward to speaking!\n\nBest,\nNoruva Team",
    slackAlerted: true,
    createdAt: new Date().toISOString(),
  },
];

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

    if (list.length > 0) {
      return NextResponse.json({ success: true, conversations: list, source: "database" });
    }
  } catch (err) {
    console.warn("Could not query DB for conversations, using memory:", err);
  }

  return NextResponse.json({ success: true, conversations: memoryConversations, source: "memory" });
}

export async function POST(req: Request) {
  try {
    const { email, prospectName, companyName, messageText } = await req.json();

    if (!email || !messageText) {
      return NextResponse.json({ error: "Email and messageText are required" }, { status: 400 });
    }

    const resolvedProspectName = prospectName || "Valued Lead";
    const resolvedCompanyName = companyName || email.split("@")[1] || "Company";

    // 1. Run AI Intent Classifier
    const classification = await classifyInboundReply({
      prospectName: resolvedProspectName,
      companyName: resolvedCompanyName,
      messageText,
    });

    let slackResult = { success: false, simulated: true };

    // 2. High-Intent Actions
    if (classification.intent === "INTERESTED") {
      // Trigger Slack Alert
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

    // 4. Save Conversation Entry
    const record = {
      id: `conv-${Date.now()}`,
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

    memoryConversations.unshift(record);

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

