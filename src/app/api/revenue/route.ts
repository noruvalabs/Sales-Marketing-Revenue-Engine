import { NextResponse } from "next/server";
import { getRevenueMetrics, simulateCustomerPayment } from "@/lib/revenue/stripe";
import { evaluateCustomerHealth } from "@/lib/ai/retention";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const metrics = getRevenueMetrics(0); // $0 operating cost on Free tier
  const healthProfiles = evaluateCustomerHealth();

  return NextResponse.json({
    success: true,
    metrics,
    healthProfiles,
  });
}

export async function POST(req: Request) {
  try {
    const { companyId, companyName, domain, amountMrr, pillar } = await req.json();

    const mrr = Number(amountMrr) || 500;
    const name = companyName || "New Customer";
    const dom = domain || "company.com";

    // 1. Simulate verified Stripe payment in ledger
    const event = simulateCustomerPayment({
      companyName: name,
      domain: dom,
      amountMrr: mrr,
      pillar: pillar || "CLIENT_MEETINGS",
    });

    // 2. Update Deal stage in DB if companyId exists
    if (companyId) {
      try {
        await prisma.deal.updateMany({
          where: { companyId },
          data: {
            stage: "WON_PAID",
            valueMrr: mrr,
          },
        });
      } catch (err) {
        console.warn("Could not update deal to WON_PAID in DB:", err);
      }
    }

    const updatedMetrics = getRevenueMetrics(0);

    return NextResponse.json({
      success: true,
      event,
      metrics: updatedMetrics,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to simulate revenue" }, { status: 500 });
  }
}
