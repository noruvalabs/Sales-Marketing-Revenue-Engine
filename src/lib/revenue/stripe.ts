import { prisma } from "@/lib/prisma";

export interface RevenueEvent {
  id: string;
  companyName: string;
  domain: string;
  amountMrr: number;
  type: "NEW_SUBSCRIPTION" | "RENEWAL" | "UPGRADE" | "CHURN";
  pillar: string;
  stripeInvoiceId?: string;
  timestamp: string;
}

// In-memory ledger for rapid local evaluation & simulation
let memoryRevenueLedger: RevenueEvent[] = [
  {
    id: "rev-1",
    companyName: "CloudScale Systems",
    domain: "cloudscale.io",
    amountMrr: 600,
    type: "NEW_SUBSCRIPTION",
    pillar: "CLIENT_MEETINGS",
    stripeInvoiceId: "in_1NoruvaMockPaid001",
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

export async function processStripeSubscriptionEvent(event: {
  type: string;
  data: {
    object: any;
  };
}) {
  const obj = event.data.object;
  const customerEmail = obj.customer_email || obj.billing_details?.email;
  const amountPaid = (obj.amount_paid || obj.plan?.amount || 50000) / 100; // in dollars

  console.log(`[STRIPE WEBHOOK] Received event: ${event.type} for ${customerEmail} ($${amountPaid})`);

  if (event.type === "customer.subscription.created" || event.type === "invoice.payment_succeeded") {
    // Record revenue event
    const revEvent: RevenueEvent = {
      id: `rev-${Date.now()}`,
      companyName: obj.customer_name || customerEmail?.split("@")[1] || "Subscribed Customer",
      domain: customerEmail ? customerEmail.split("@")[1] : "unknown.com",
      amountMrr: amountPaid,
      type: "NEW_SUBSCRIPTION",
      pillar: "CLIENT_MEETINGS",
      stripeInvoiceId: obj.id,
      timestamp: new Date().toISOString(),
    };

    memoryRevenueLedger.unshift(revEvent);

    // Update DB deal if customer matches
    if (customerEmail) {
      try {
        const contact = await prisma.contact.findUnique({
          where: { email: customerEmail.toLowerCase().trim() },
        });

        if (contact) {
          await prisma.deal.updateMany({
            where: { companyId: contact.companyId },
            data: {
              stage: "WON_PAID",
              valueMrr: amountPaid,
              stripeCustomerId: obj.customer || obj.id,
            },
          });
        }
      } catch (err) {
        console.warn("Could not update DB for Stripe event:", err);
      }
    }

    return { success: true, event: revEvent };
  }

  return { success: true, ignored: true };
}

export function getRevenueMetrics(totalOperatingCost: number = 0) {
  const activeSubscriptions = memoryRevenueLedger.filter((e) => e.type !== "CHURN");
  const totalMrr = activeSubscriptions.reduce((acc, item) => acc + item.amountMrr, 0);
  const totalArr = totalMrr * 12;
  const paidCustomersCount = activeSubscriptions.length;

  // Real Blended CAC
  const cac = paidCustomersCount > 0 ? (totalOperatingCost / paidCustomersCount).toFixed(2) : "0.00";

  // Estimated LTV (based on typical 14-month SaaS retention)
  const ltv = paidCustomersCount > 0 ? Math.round((totalMrr / paidCustomersCount) * 14) : 0;

  return {
    mrr: totalMrr,
    arr: totalArr,
    paidCustomersCount,
    cac,
    ltv,
    ledger: memoryRevenueLedger,
  };
}

export function simulateCustomerPayment(params: {
  companyName: string;
  domain: string;
  amountMrr: number;
  pillar: string;
}) {
  const revEvent: RevenueEvent = {
    id: `rev-${Date.now()}`,
    companyName: params.companyName,
    domain: params.domain,
    amountMrr: params.amountMrr,
    type: "NEW_SUBSCRIPTION",
    pillar: params.pillar || "CLIENT_MEETINGS",
    stripeInvoiceId: `sim_in_${Date.now()}`,
    timestamp: new Date().toISOString(),
  };

  memoryRevenueLedger.unshift(revEvent);
  return revEvent;
}
