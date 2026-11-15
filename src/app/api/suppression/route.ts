import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Fallback in-memory suppression list if Postgres is not connected
let memorySuppressionList: any[] = [
  { id: "sup-1", email: "competitor@zoominfo.com", domain: null, reason: "Competitor domain", createdAt: new Date() },
  { id: "sup-2", email: null, domain: "spamfilter.org", reason: "Spam trap test domain", createdAt: new Date() },
];

export async function GET() {
  try {
    const list = await prisma.suppressionList.findMany({
      orderBy: { createdAt: "desc" },
    });
    if (list.length > 0) {
      return NextResponse.json({ success: true, list });
    }
  } catch (err) {
    console.warn("Could not query DB for suppression list, using memory:", err);
  }

  return NextResponse.json({ success: true, list: memorySuppressionList });
}

export async function POST(req: Request) {
  try {
    const { email, domain, reason } = await req.json();

    if (!email && !domain) {
      return NextResponse.json({ error: "Must specify an email or a domain to suppress." }, { status: 400 });
    }

    const entry = {
      id: `sup-${Date.now()}`,
      email: email ? email.toLowerCase().trim() : null,
      domain: domain ? domain.toLowerCase().trim() : null,
      reason: reason || "Manual administrator suppression",
      createdAt: new Date(),
    };

    try {
      const created = await prisma.suppressionList.create({
        data: {
          email: entry.email,
          domain: entry.domain,
          reason: entry.reason,
        },
      });
      return NextResponse.json({ success: true, entry: created });
    } catch (err) {
      console.warn("DB insert failed, storing in memory:", err);
    }

    memorySuppressionList.unshift(entry);
    return NextResponse.json({ success: true, entry });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to add to suppression list" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing suppression ID" }, { status: 400 });
    }

    try {
      await prisma.suppressionList.delete({
        where: { id },
      });
    } catch (err) {
      memorySuppressionList = memorySuppressionList.filter((item) => item.id !== id);
    }

    return NextResponse.json({ success: true, removedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to remove suppression" }, { status: 500 });
  }
}

