import { NextResponse } from "next/server";
import { processStripeSubscriptionEvent } from "@/lib/revenue/stripe";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    let event;

    try {
      event = JSON.parse(rawBody);
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const result = await processStripeSubscriptionEvent(event);
    return NextResponse.json({ received: true, result });
  } catch (err: any) {
    console.error("Stripe webhook processing error:", err);
    return NextResponse.json({ error: err.message || "Webhook handling failed" }, { status: 500 });
  }
}

