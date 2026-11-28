import { NextResponse } from "next/server";
import { createWebCall } from "@/lib/calling/retell";

/**
 * Start a browser talk test with the agent (develop2).
 * No payment, no phone number: the browser SDK connects with the
 * access token returned here and Sazzad talks to the agent directly.
 * Minutes draw from Retell's $10 free credit.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await createWebCall({
      firstName: String(body?.firstName || "Sazzad"),
      companyName: String(body?.companyName || "Noruva Labs (browser test)"),
    });
    if (result.error || !result.accessToken) {
      return NextResponse.json({ success: false, error: result.error || "Could not start web call" }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      accessToken: result.accessToken,
      callId: result.callId,
      transport: result.transport,
      iceServers: result.iceServers,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to start web call" },
      { status: 500 }
    );
  }
}
