import { GoogleGenAI } from "@google/genai";
import { qualifyCompany, QualificationResult } from "@/lib/ai/qualify";

export interface DiscoveredLeadProfile {
  name: string;
  domain: string;
  industry: string;
  size: string;
  country: string;
  hiringSignals: string;
  contactName: string;
  contactEmail: string;
  contactTitle: string;
  qualification: QualificationResult;
}

export interface DiscoverySearchParams {
  personaKeyword: string;
  pillar: "CLIENT_MEETINGS" | "INTERVIEW_COPILOT" | "CUSTOMER_SUPPORT" | "BILINGUAL_AI";
  industry?: string;
  count?: number;
}

const CURATED_DISCOVERY_CATALOG: Record<string, any[]> = {
  CLIENT_MEETINGS: [
    {
      name: "Ramp Financial",
      domain: "ramp.com",
      industry: "Fintech & Corporate Cards",
      size: "200-500",
      country: "United States",
      hiringSignals: "Hiring 12 Enterprise Account Executives and SDRs for outbound sales team expansion",
      contactName: "Colin Kennedy",
      contactEmail: "colin@ramp.com",
      contactTitle: "Chief Business Officer",
    },
    {
      name: "Gorgias",
      domain: "gorgias.com",
      industry: "E-Commerce Customer Experience",
      size: "100-250",
      country: "United States",
      hiringSignals: "Actively ramping 8 Remote SDRs to conduct live Zoom product pitches",
      contactName: "Romain Lapeyre",
      contactEmail: "romain@gorgias.com",
      contactTitle: "CEO & Co-founder",
    },
    {
      name: "Vanta Security",
      domain: "vanta.com",
      industry: "Automated Security & Compliance",
      size: "250-500",
      country: "United States",
      hiringSignals: "Hiring 10 Mid-Market Account Executives, focus on handling security objection calls",
      contactName: "Christina Cacioppo",
      contactEmail: "christina@vanta.com",
      contactTitle: "Chief Executive Officer",
    },
  ],
  INTERVIEW_COPILOT: [
    {
      name: "BairesDev",
      domain: "bairesdev.com",
      industry: "Nearshore Software Staffing",
      size: "1000+",
      country: "Global Remote",
      hiringSignals: "Conducting over 1,500 live technical engineering interviews monthly, hiring tech recruiters",
      contactName: "Nacho De Marco",
      contactEmail: "nacho@bairesdev.com",
      contactTitle: "CEO",
    },
    {
      name: "Turing Enterprises",
      domain: "turing.com",
      industry: "AI-Vetted Remote Engineering",
      size: "500-1000",
      country: "United States",
      hiringSignals: "Hiring 15 Technical Screening Interviewers and Developer Vetting Specialists",
      contactName: "Jonathan Siddharth",
      contactEmail: "jonathan@turing.com",
      contactTitle: "CEO & Founder",
    },
    {
      name: "Andela",
      domain: "andela.com",
      industry: "Global Tech Talent Network",
      size: "500-1000",
      country: "United States / Global",
      hiringSignals: "Screening thousands of international developers; high technical interviewer fatigue",
      contactName: "Jeremy Johnson",
      contactEmail: "jeremy@andela.com",
      contactTitle: "Chief Executive Officer",
    },
  ],
  CUSTOMER_SUPPORT: [
    {
      name: "Front App",
      domain: "front.com",
      industry: "Customer Communication Platform",
      size: "200-500",
      country: "United States",
      hiringSignals: "Hiring 6 Customer Support Leads & Escalation Managers",
      contactName: "Mathilde Collin",
      contactEmail: "mathilde@front.com",
      contactTitle: "CEO & Co-founder",
    },
    {
      name: "Intercom Solutions",
      domain: "intercom.com",
      industry: "Customer Service AI",
      size: "500-1000",
      country: "United States / Ireland",
      hiringSignals: "Hiring 8 Customer Success Managers for high-touch enterprise accounts",
      contactName: "Eoghan McCabe",
      contactEmail: "eoghan@intercom.com",
      contactTitle: "CEO",
    },
  ],
  BILINGUAL_AI: [
    {
      name: "Deel Global",
      domain: "deel.com",
      industry: "Global Payroll & Compliance",
      size: "1000+",
      country: "Global (100+ Countries)",
      hiringSignals: "Multilingual client meetings across Latin America, EMEA, and APAC daily",
      contactName: "Alex Bouaziz",
      contactEmail: "alex@deel.com",
      contactTitle: "CEO & Co-Founder",
    },
    {
      name: "Remote Technology",
      domain: "remote.com",
      industry: "Global HR & Employment",
      size: "500-1000",
      country: "Global Remote",
      hiringSignals: "Operating in 35+ languages across European and Asian client video calls",
      contactName: "Job van der Voort",
      contactEmail: "job@remote.com",
      contactTitle: "CEO & Founder",
    },
  ],
};

export async function discoverLeadsAutomatically(
  params: DiscoverySearchParams
): Promise<DiscoveredLeadProfile[]> {
  const { personaKeyword, pillar, count = 3 } = params;
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey.trim() !== "") {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
You are the Lead Discovery Agent for Noruva AI (ai.noruvalabs.com).
Noruva AI provides real-time in-call AI meeting assistance across 4 pillars:
- CLIENT_MEETINGS: In-call objection handling hints for B2B sales teams.
- INTERVIEW_COPILOT: Technical question hints & resume lookup during live job interviews.
- CUSTOMER_SUPPORT: Real-time sentiment & knowledge-base lookup on support calls.
- BILINGUAL_AI: Real-time 30+ language translation on video meetings.

Target Persona: "${personaKeyword}"
Target Product Pillar: "${pillar}"

Generate a list of ${count} realistic, high-fit prospective B2B companies that currently have strong hiring or operational signals fitting this profile.
Return a clean JSON array ONLY (no markdown formatting, no code block) matching this schema:
[
  {
    "name": "<Company Name>",
    "domain": "<clean domain, e.g. company.com>",
    "industry": "<Industry>",
    "size": "<e.g. 50-200>",
    "country": "<Country>",
    "hiringSignals": "<Specific active hiring signal, e.g. Hiring 4 Remote SDRs for Q4 growth>",
    "contactName": "<Executive Full Name>",
    "contactEmail": "<email address>",
    "contactTitle": "<Job Title, e.g. VP of Sales or CEO>"
  }
]
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
      });

      const text = response.text || "";
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsedArray = JSON.parse(cleaned);

      if (Array.isArray(parsedArray) && parsedArray.length > 0) {
        const enriched: DiscoveredLeadProfile[] = [];
        for (const item of parsedArray) {
          const qual = await qualifyCompany({
            name: item.name,
            domain: item.domain,
            industry: item.industry,
            size: item.size,
            hiringSignals: item.hiringSignals,
            contactName: item.contactName,
            contactTitle: item.contactTitle,
          });

          enriched.push({
            name: item.name,
            domain: item.domain,
            industry: item.industry || "Technology",
            size: item.size || "50-200",
            country: item.country || "United States",
            hiringSignals: item.hiringSignals || "Active hiring signals",
            contactName: item.contactName || "Decision Maker",
            contactEmail: item.contactEmail || `contact@${item.domain}`,
            contactTitle: item.contactTitle || "Leader",
            qualification: qual,
          });
        }
        return enriched;
      }
    } catch (err) {
      console.warn("Gemini automated discovery fallback triggered:", err);
    }
  }

  // Fallback: return empty array if no leads discovered
  return [];
}

