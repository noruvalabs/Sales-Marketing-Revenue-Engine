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
  /** Browser talk test: needs only the 2 free keys — NO phone number,
   *  NO payment method. Minutes draw from Retell's $10 free credit. */
  webReady: boolean;
  webMissing: string[];
}

export function getCallAgentConfig(): CallAgentConfig {
  const missing: string[] = [];
  if (!process.env.RETELL_API_KEY) missing.push("RETELL_API_KEY");
  if (!process.env.RETELL_AGENT_ID) missing.push("RETELL_AGENT_ID");
  if (!process.env.RETELL_FROM_NUMBER) missing.push("RETELL_FROM_NUMBER");
  const webMissing: string[] = [];
  if (!process.env.RETELL_API_KEY) webMissing.push("RETELL_API_KEY");
  if (!process.env.RETELL_AGENT_ID) webMissing.push("RETELL_AGENT_ID");
  return {
    enabled: process.env.CALL_AGENT_ENABLED === "true",
    configured: missing.length === 0,
    missing,
    webReady: webMissing.length === 0,
    webMissing,
  };
}

export interface WebCallResult {
  accessToken?: string;
  callId?: string;
  /** v3 web calls return connection details the browser SDK needs. */
  transport?: string;
  iceServers?: unknown;
  error?: string;
}

/**
 * Create a Retell WEB call — the agent talks to you in the browser.
 * This is the no-payment test path: no phone number is bought, no card
 * is needed; it needs only the free account's API key + agent id, and
 * the minutes come out of the $10 free credit.
 */
export async function createWebCall(input: {
  firstName: string;
  companyName: string;
}): Promise<WebCallResult> {
  const apiKey = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_AGENT_ID;
  if (!apiKey || !agentId) {
    return { error: "Add RETELL_API_KEY and RETELL_AGENT_ID to .env first (both free — see docs/CALL_AGENT.md)" };
  }
  try {
    // v3 endpoint: Retell retired /v2/create-web-call on 2026-10-18
    // (HTTP 400 "Deprecated API usage"). Same JSON body; the reply now
    // carries connection details (transport, ice_servers) that the
    // browser SDK 3.x needs in startCall().
    const res = await fetch("https://api.retellai.com/v3/create-web-call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        agent_id: agentId,
        retell_llm_dynamic_variables: {
          first_name: input.firstName || "there",
          company_name: input.companyName || "",
        },
        metadata: { source: "sales-engine-develop2-webtest" },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { error: `Retell HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const data: any = await res.json();
    if (!data?.access_token) return { error: "Retell replied without an access_token" };
    return {
      accessToken: String(data.access_token),
      callId: data.call_id ? String(data.call_id) : undefined,
      transport: data.transport ? String(data.transport) : undefined,
      iceServers: data.ice_servers,
    };
  } catch (err: any) {
    return { error: `Retell request failed: ${err?.message || String(err)}` };
  }
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
