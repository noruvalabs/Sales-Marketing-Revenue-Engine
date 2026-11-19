import { NextResponse } from "next/server";
import { researchCompany } from "@/lib/research/companyResearch";

/**
 * GET /api/research?domain=example.com&name=Example
 * Real company research with an evidence URL (Tavily if configured,
 * otherwise the company's own website). Returns source: "none" with an
 * empty summary when nothing real could be read — never invented facts.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain") || "";
  const name = url.searchParams.get("name") || domain;
  if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });
  const research = await researchCompany(domain, name);
  return NextResponse.json({ success: true, research });
}
