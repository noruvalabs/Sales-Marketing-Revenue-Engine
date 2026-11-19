import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const list = await prisma.suppressionList.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, list });
  } catch (err: any) {
    console.error("Could not query DB for suppression list:", err);
    return NextResponse.json({ success: true, list: [] });
  }
}

export async function POST(req: Request) {
  try {
    const { email, domain, reason } = await req.json();

    if (!email && !domain) {
      return NextResponse.json({ error: "Must specify an email or a domain to suppress." }, { status: 400 });
    }

    const created = await prisma.suppressionList.create({
      data: {
        email: email ? email.toLowerCase().trim() : null,
        domain: domain ? domain.toLowerCase().trim() : null,
        reason: reason || "Manual administrator suppression",
      },
    });

    return NextResponse.json({ success: true, entry: created });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to add to suppression list" }, { status: 500 });
  }
}
