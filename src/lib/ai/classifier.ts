import { GoogleGenAI } from "@google/genai";

export type ReplyIntent = "INTERESTED" | "OBJECTION" | "NOT_NOW" | "UNSUBSCRIBE" | "OUT_OF_OFFICE" | "NEUTRAL";

export interface ClassificationResult {
  intent: ReplyIntent;
  confidence: number; // 0 to 100
  summary: string;
  recommendedAction: string;
  suggestedReply: string;
}

export async function classifyInboundReply(params: {
  prospectName: string;
  companyName: string;
  messageText: string;
}): Promise<ClassificationResult> {
  const { prospectName, companyName, messageText } = params;
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey.trim() !== "") {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
You are the Sales Conversation Intelligence Agent for Noruva AI (ai.noruvalabs.com).
Noruva AI is a real-time AI Meeting Copilot that assists during live video calls (Interview Copilot, Client Meeting objection hints, Customer Support, and Bilingual AI).

Analyze this incoming reply from a prospective B2B client:
- Prospect: ${prospectName} (${companyName})
- Inbound Message:
"${messageText}"

Classify the intent into EXACTLY one of:
- INTERESTED (Wants demo, pricing, trial, call, or more details)
- OBJECTION (Brings up competitors, price concerns, or specific skepticism)
- NOT_NOW (Busy, check back next quarter/month)
- UNSUBSCRIBE (Asks to be removed, unsubscribe, stop emailing)
- OUT_OF_OFFICE (Automated away message)
- NEUTRAL (General question or acknowledgement)

Return a clean JSON object ONLY (no markdown formatting, no code block) with:
{
  "intent": "<INTERESTED | OBJECTION | NOT_NOW | UNSUBSCRIBE | OUT_OF_OFFICE | NEUTRAL>",
  "confidence": <number between 0 and 100>,
  "summary": "<1-sentence summary of what the prospect said>",
  "recommendedAction": "<e.g. 'Send Cal.com booking link' or 'Provide competitor comparison table'>",
  "suggestedReply": "<Personalized, professional response tailored to their message>"
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
      });

      const text = response.text || "";
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      return {
        intent: parsed.intent || "NEUTRAL",
        confidence: Number(parsed.confidence) || 85,
        summary: parsed.summary || "Prospect responded to outreach email.",
        recommendedAction: parsed.recommendedAction || "Review response",
        suggestedReply: parsed.suggestedReply || `Hi ${prospectName.split(" ")[0]},\n\nThanks for getting back to me...`,
      };
    } catch (err) {
      console.warn("Gemini reply classifier fallback triggered:", err);
    }
  }

  // Deterministic rule-based classifier (Free & Offline)
  return fallbackClassifier(prospectName, messageText);
}

function fallbackClassifier(prospectName: string, text: string): ClassificationResult {
  const lower = text.toLowerCase();
  const firstName = prospectName ? prospectName.split(" ")[0] : "there";

  if (lower.includes("unsubscribe") || lower.includes("remove") || lower.includes("stop emailing") || lower.includes("opt out")) {
    return {
      intent: "UNSUBSCRIBE",
      confidence: 99,
      summary: "Prospect requested to opt out of future communications.",
      recommendedAction: "Auto-suppress email and halt all scheduled follow-ups.",
      suggestedReply: `Hi ${firstName}, you have been removed from our list. We won't reach out again. Best regards.`,
    };
  }

  if (
    lower.includes("interested") ||
    lower.includes("demo") ||
    lower.includes("call") ||
    lower.includes("pricing") ||
    lower.includes("send info") ||
    lower.includes("tell me more") ||
    lower.includes("tuesday") ||
    lower.includes("thursday") ||
    lower.includes("calendar") ||
    lower.includes("sounds great")
  ) {
    return {
      intent: "INTERESTED",
      confidence: 95,
      summary: "High buying intent: Prospect expressed interest or requested a meeting/pricing.",
      recommendedAction: "High-Priority Alert: Send calendar link or book 15-min discovery demo.",
      suggestedReply: `Hi ${firstName},\n\nGlad to hear from you! Would you have 15 minutes this week for a brief walkthrough?\n\nYou can pick any slot that fits your schedule here: ${process.env.MEETING_BOOKING_URL || "https://cal.com/noruva-team/15min"}\n\nLooking forward to speaking,\nNoruva Team`,
    };
  }

  if (lower.includes("competitor") || lower.includes("already use") || lower.includes("too expensive") || lower.includes("budget") || lower.includes("gong") || lower.includes("otter")) {
    return {
      intent: "OBJECTION",
      confidence: 90,
      summary: "Prospect raised an objection regarding competitors, budget, or current stack.",
      recommendedAction: "Share objection-handling points & Noruva's real-time stealth differentiator.",
      suggestedReply: `Hi ${firstName},\n\nCompletely understand! Many teams we work with also use post-call recording tools like Gong or Otter.\n\nThe key difference is Noruva AI works *during* the live call in real time, whispering objection responses on screen so your reps win the deal before the call ends, rather than analyzing mistakes after the deal is lost.\n\nOpen to seeing a 2-minute side-by-side clip?\n\nBest,\nNoruva Team`,
    };
  }

  if (lower.includes("next quarter") || lower.includes("not right now") || lower.includes("check back") || lower.includes("busy")) {
    return {
      intent: "NOT_NOW",
      confidence: 88,
      summary: "Prospect is interested in timing delay (bad timing or busy quarter).",
      recommendedAction: "Schedule automated reminder for next quarter.",
      suggestedReply: `Hi ${firstName},\n\nUnderstood, timing is everything. I will note to check back in a couple of months when things quiet down.\n\nWishing you a productive quarter ahead!\n\nBest,\nNoruva Team`,
    };
  }

  if (lower.includes("out of office") || lower.includes("away from my desk") || lower.includes("autoreply") || lower.includes("auto-reply")) {
    return {
      intent: "OUT_OF_OFFICE",
      confidence: 98,
      summary: "Automated out-of-office message received.",
      recommendedAction: "Pause cadence until return date.",
      suggestedReply: "",
    };
  }

  return {
    intent: "NEUTRAL",
    confidence: 70,
    summary: "General inquiry or ambiguous response.",
    recommendedAction: "Sales rep manual review recommended.",
    suggestedReply: `Hi ${firstName},\n\nThanks for your note! Could you share a bit more about what you have in mind?\n\nBest,\nNoruva Team`,
  };
}

