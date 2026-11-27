/**
 * AI Call Agent — Retell client (develop2, TEST ONLY).
 *
 * Honesty rules, same as the email dispatcher:
 * - If Retell is not configured (no API key / agent id / from number),
 *   startCall returns { simulated: true } and the caller records a
 *   SIMULATED test row. A simulated row is NEVER a real call.
 * - Real calls additionally require CALL_AGENT_ENABLED=true in .env,
 *   so adding keys alone can never start dialling by accident.
 */

export interface CallAgentConfig {
  enabled: boolean;
  configured: boolean;
  missing: string[];
}

export function getCallAgentConfig(): CallAgentConfig {
  const missing: string[] = [];
  if (!process.env.RETELL_API_KEY) missing.push("RETELL_API_KEY");
  if (!process.env.RETELL_AGENT_ID) missing.push("RETELL_AGENT_ID");
  if (!process.env.RETELL_FROM_NUMBER) missing.push("RETELL_FROM_NUMBER");
  return {
    enabled: process.env.CALL_AGENT_ENABLED === "true",
    configured: missing.length === 0,
    missing,
  };
}

export interface StartCallResult {
  simulated: boolean;
  callId?: string;
  error?: string;
}

/**
 * Place one outbound call through Retell.
 * Returns simulated=true (no network call at all) when Retell is not
 * configured or the agent is not enabled.
 */
export async function startCall(input: {
  toNumber: string;
  firstName: string;
  companyName: string;
  contactId: string;
}): Promise<StartCallResult> {
  const cfg = getCallAgentConfig();
  if (!cfg.configured || !cfg.enabled) {
    return { simulated: true };
  }

  try {
    const res = await fetch("https://api.retellai.com/v2/create-phone-call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
      },
      body: JSON.stringify({
        from_number: process.env.RETELL_FROM_NUMBER,
        to_number: input.toNumber,
        agent_id: process.env.RETELL_AGENT_ID,
        retell_llm_dynamic_variables: {
          first_name: input.firstName || "there",
          company_name: input.companyName || "",
        },
        metadata: { contactId: input.contactId, source: "sales-engine-develop2" },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { simulated: false, error: `Retell HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const data: any = await res.json();
    if (!data?.call_id) {
      return { simulated: false, error: "Retell replied without a call_id" };
    }
    return { simulated: false, callId: String(data.call_id) };
  } catch (err: any) {
    return { simulated: false, error: `Retell request failed: ${err?.message || String(err)}` };
  }
}
