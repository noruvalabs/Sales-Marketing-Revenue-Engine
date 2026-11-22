import { GoogleGenAI } from "@google/genai";

export interface CompanyData {
  name: string;
  domain: string;
  industry?: string;
  size?: string;
  hiringSignals?: string;
  techStack?: string[];
  contactName?: string;
  contactTitle?: string;
}

export interface QualificationResult {
  score: number; // 0 to 100
  recommendedPillar: "INTERVIEW_COPILOT" | "CLIENT_MEETINGS" | "CUSTOMER_SUPPORT" | "BILINGUAL_AI";
  reason: string;
  painPoints: string[];
  emailDraft: {
    subject: string;
    body: string;
  };
}

export async function qualifyCompany(company: CompanyData): Promise<QualificationResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey.trim() !== "") {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
You are the Chief Revenue Intelligence Agent for Noruva AI (ai.noruvalabs.com).
Noruva AI is a real-time AI Meeting Copilot that assists during live video calls across 4 pillars:
1. INTERVIEW_COPILOT: Stealth real-time technical hints & resume lookup during live job interviews. Target: Hiring companies, engineering teams, recruiters.
2. CLIENT_MEETINGS: Real-time objection handling hints & auto CRM sync. Target: B2B sales teams, companies hiring SDRs/AEs.
3. CUSTOMER_SUPPORT: Real-time sentiment tracking, knowledge base popups & ticket recaps. Target: Support teams.
4. BILINGUAL_AI: Real-time 30+ language translation & live dual-language transcripts. Target: Global remote teams.

Evaluate this prospective B2B company:
- Company Name: ${company.name}
- Domain: ${company.domain}
- Industry: ${company.industry || "Technology"}
- Size: ${company.size || "Unknown"}
- Hiring Signals: ${company.hiringSignals || "None listed"}
- Contact Person: ${company.contactName || "Decision Maker"} (${company.contactTitle || "Leader"})

Return a clean JSON object ONLY (no markdown formatting, no code block) with:
{
  "score": <number between 0 and 100>,
  "recommendedPillar": "<INTERVIEW_COPILOT | CLIENT_MEETINGS | CUSTOMER_SUPPORT | BILINGUAL_AI>",
  "reason": "<1-2 sentence explainable reason for score>",
  "painPoints": ["<pain point 1>", "<pain point 2>"],
  "emailDraft": {
    "subject": "<Compelling 4-7 word B2B subject line>",
    "body": "<Personalized, non-spammy 3-paragraph outreach mentioning their exact hiring/growth pain point and how Noruva AI solves it with a soft low-friction call to action>"
  }
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: prompt,
      });

      const text = response.text || "";
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      return {
        score: Math.min(100, Math.max(0, Number(parsed.score) || 75)),
        recommendedPillar: parsed.recommendedPillar || "CLIENT_MEETINGS",
        reason: parsed.reason || "Matched B2B software profile with active meeting demands.",
        painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints : ["Meeting objection handling", "Sales rep ramp time"],
        emailDraft: {
          subject: parsed.emailDraft?.subject || `Quick question regarding ${company.name}'s sales workflow`,
          body: parsed.emailDraft?.body || `Hi ${company.contactName || "there"},\n\nNoticed ${company.name}'s recent growth...`,
        },
      };
    } catch (err) {
      console.warn("Gemini API call failed, using deterministic qualification engine:", err);
    }
  }

  // Deterministic Rule-Based Intelligence Engine (Works 100% offline with $0 cost)
  return fallbackQualify(company);
}

function fallbackQualify(company: CompanyData): QualificationResult {
  const hiring = (company.hiringSignals || "").toLowerCase();
  const industry = (company.industry || "").toLowerCase();
  let score = 65;
  let pillar: "INTERVIEW_COPILOT" | "CLIENT_MEETINGS" | "CUSTOMER_SUPPORT" | "BILINGUAL_AI" = "CLIENT_MEETINGS";
  const painPoints: string[] = [];

  if (hiring.includes("sales") || hiring.includes("sdr") || hiring.includes("account executive")) {
    score += 25;
    pillar = "CLIENT_MEETINGS";
    painPoints.push("Ramping new sales reps", "Handling live objections on Zoom/Meet");
  } else if (hiring.includes("engineer") || hiring.includes("developer") || hiring.includes("recruiter")) {
    score += 20;
    pillar = "INTERVIEW_COPILOT";
    painPoints.push("Interview candidate screening overhead", "Technical question fatigue");
  } else if (hiring.includes("support") || hiring.includes("customer success")) {
    score += 18;
    pillar = "CUSTOMER_SUPPORT";
    painPoints.push("Call resolution time", "Real-time sentiment tracking");
  } else if (company.size && (company.size.includes("50") || company.size.includes("100"))) {
    score += 15;
  }

  score = Math.min(95, score);

  const contactFirstName = company.contactName ? company.contactName.split(" ")[0] : "there";

  return {
    score,
    recommendedPillar: pillar,
    reason: `Identified active buying signal: ${company.hiringSignals || "B2B growth phase"}. High alignment with Noruva ${pillar.replace("_", " ")}.`,
    painPoints,
    emailDraft: {
      subject: `Quick idea for ${company.name}'s client meetings`,
      body: `Hi ${contactFirstName},\n\nI noticed ${company.name} is actively scaling (${company.hiringSignals || "building your team"}). When expanding, ramping up team members to handle high-stakes live video calls and objections without freezing can take months.\n\nAt Noruva AI (ai.noruvalabs.com), we built an in-call assistant that provides real-time objection handling and context hints on screen during live Zoom and Google Meet calls—completely undetectable to clients.\n\nWould you be open to a 3-minute video showing how it works for growing teams like yours?\n\nBest,\nNoruva Labs Revenue Team`,
    },
  };
}

