export interface SlackNotificationPayload {
  prospectName: string;
  companyName: string;
  email: string;
  intent: string;
  confidence: number;
  messageSnippet: string;
  recommendedAction: string;
  suggestedReply: string;
}

export async function sendSlackHighIntentAlert(payload: SlackNotificationPayload): Promise<{ success: boolean; simulated: boolean; error?: string }> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🔥 High-Intent Lead Reply Detected!",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Company:*\n${payload.companyName}`,
        },
        {
          type: "mrkdwn",
          text: `*Contact:*\n${payload.prospectName} (<mailto:${payload.email}|${payload.email}>)`,
        },
        {
          type: "mrkdwn",
          text: `*Intent:*\n*${payload.intent}* (${payload.confidence}% confidence)`,
        },
        {
          type: "mrkdwn",
          text: `*Recommended Action:*\n${payload.recommendedAction}`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Incoming Reply:*\n> _"${payload.messageSnippet}"_`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*AI Suggested Response:*\n\`\`\`${payload.suggestedReply}\`\`\``,
      },
    },
  ];

  if (webhookUrl && webhookUrl.trim() !== "") {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });

      if (!res.ok) {
        throw new Error(`Slack webhook returned status ${res.status}`);
      }

      return { success: true, simulated: false };
    } catch (err: any) {
      console.error("Slack alert failed:", err);
      return { success: false, simulated: false, error: err.message };
    }
  }

  // Simulation mode (logs to console and UI without requiring a live Slack webhook)
  console.log(`[SLACK ALERT SIMULATED] Hot lead: ${payload.prospectName} (${payload.companyName}) replied!`);
  return { success: true, simulated: true };
}
