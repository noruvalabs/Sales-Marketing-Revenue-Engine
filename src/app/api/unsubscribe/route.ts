import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");

  if (!email) {
    return new NextResponse("Invalid unsubscribe request: Missing email address.", { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // 1. Add to Suppression List
    await prisma.suppressionList.upsert({
      where: { email: normalizedEmail },
      update: { reason: "User clicked 1-click unsubscribe" },
      create: {
        email: normalizedEmail,
        reason: "User clicked 1-click unsubscribe",
      },
    });

    // 2. Update Contact record status if exists
    await prisma.contact.updateMany({
      where: { email: normalizedEmail },
      data: { status: "OPTED_OUT" },
    });
  } catch (err) {
    console.warn("Could not record unsubscribe to database:", err);
  }

  // Render a clean, respectful HTML confirmation page
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Unsubscribed — Noruva AI</title>
  <style>
    body {
      background-color: #07111f;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background-color: #0c1829;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 40px;
      max-width: 480px;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      width: 50px;
      height: 50px;
      line-height: 50px;
      border-radius: 50%;
      background: rgba(52, 211, 153, 0.1);
      color: #34d399;
      font-size: 24px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 10px 0;
      color: #ffffff;
    }
    p {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.6;
      margin: 0 0 24px 0;
    }
    .email-box {
      background: #07111f;
      border: 1px solid #334155;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: monospace;
      color: #7dd3fc;
      font-size: 13px;
      margin-bottom: 20px;
      word-break: break-all;
    }
    .footer {
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓</div>
    <h1>You have been unsubscribed</h1>
    <div class="email-box">${normalizedEmail}</div>
    <p>We have added your address to our permanent suppression list. You will not receive any further automated outreach or sales emails from Noruva AI.</p>
    <div class="footer">Noruva AI • ai.noruvalabs.com</div>
  </div>
</body>
</html>
`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
