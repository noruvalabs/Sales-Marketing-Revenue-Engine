import { NextResponse } from "next/server";
import { revealMobileForContact } from "@/lib/calling/phones";

/**
 * Reveal ONE contact's mobile via Prospeo. Costs 10 Prospeo credits —
 * that is why this is one click, one contact, never automatic.
 */
export async function POST(req: Request) {
  try {
    const { contactId } = await req.json();
    if (!contactId) {
      return NextResponse.json({ success: false, error: "contactId is required" }, { status: 400 });
    }
    const result = await revealMobileForContact(contactId);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, phone: result.phone });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to reveal phone" },
      { status: 500 }
    );
  }
}
