# AI Call Agent — TEST build (branch: develop2)

An AI caller for **warm Noruva AI leads only** — people who replied to our
emails or signed up for the free sessions. It introduces itself as an AI,
answers questions from one fixed script + FAQ, and tries to book the
15-minute meeting. Every call's transcript, summary and outcome are saved
in the dashboard **Calls** tab.

> This lives ONLY on `develop2`, for testing. `develop` does not have it
> and stays clean for deployment. Nothing here calls anyone until the
> Retell keys are added AND `CALL_AGENT_ENABLED=true` is set.

## Safety rules built into the code

- **Warm leads only.** The queue accepts only contacts whose status is
  `REPLIED_INTERESTED` or `REPLIED_OBJECTION`. Cold contacts are refused
  by the server, not just hidden in the UI. (US law treats an AI sales
  call to a mobile phone as a robocall — it needs prior consent.)
- **Suppression is checked twice** — when a lead is queued and again at
  the moment the call starts. Opted-out contacts can never be called.
- **Honest simulation.** Without Retell keys (or with calling switched
  off), "Call now" writes a clearly-marked *Simulated — no real call*
  record. It never pretends a call happened.
- **Fixed script.** The agent may only use the facts in
  `src/lib/calling/script.ts` (10 free sessions, Basic $39 / Plus $78 /
  Pro $117, the 4 pillars, the Cal.com booking link). For anything else
  it must say a person will follow up by email.
- **Phone numbers cost money.** Revealing one mobile via Prospeo costs
  **10 credits**, so it happens one contact at a time, only when you
  click "Reveal phone". Never in bulk.

## Setup (one time, ~20 minutes)

1. **Update the database** (adds the `phone` fields and the `CallLog`
   table — nothing else changes):
   ```
   npx prisma db push
   ```

2. **Create a free Retell account** at retellai.com ($10 free credit).

3. **Create the agent** in the Retell dashboard:
   - New agent → choose a voice and a budget LLM (e.g. a Haiku-class
     model) to keep the per-minute price near $0.10.
   - Paste the agent prompt from `src/lib/calling/script.ts`
     (`buildAgentPrompt()` — the text between the backticks), keeping the
     `{{first_name}}` and `{{company_name}}` placeholders.
   - Copy the **Agent ID**.

4. **Get a phone number** (your caller ID — one fixed number is best):
   - Cheapest: buy a US number on Telnyx (~$1/month) and connect it to
     Retell by SIP trunk (Retell then charges $0 for telephony; Telnyx
     outgoing is ~$0.007/min).
   - Or simply buy the number inside Retell (~$2/month, ~$0.015/min).
   - Copy the number in `+1...` format.

5. **Set the webhook** in Retell so results come back:
   `<your app URL>/api/calls/webhook`
   (For local testing the app URL is your tunnel/local address; the
   webhook only matters once real calls end — queueing and starting
   calls work without it, results just won't auto-fill.)

6. **Add to `.env`** (never paste these in chat):
   ```
   RETELL_API_KEY=<from Retell dashboard>
   RETELL_AGENT_ID=<from step 3>
   RETELL_FROM_NUMBER=<+1... from step 4>
   CALL_AGENT_ENABLED=true
   ```
   Restart the server after editing `.env`.

## Test plan

1. **Your own phone first.** Calls tab → "Test on your own phone" →
   enter your number → "Call my number". Listen: does it introduce
   itself as an AI? Does it answer the price question correctly
   ($39/$78/$117)? Does it offer the booking link?
2. **Fix the script** if it says anything wrong — edit
   `src/lib/calling/script.ts` and paste the new prompt into Retell.
3. **Then 10 warm leads.** In the Calls tab: Reveal phone → Add to call
   queue → Call now. Call only in the lead's local business hours
   (9 AM–5 PM their time).
4. **Review** every recording/transcript in "Call results" before
   deciding whether this is worth scaling.

## Cost reminder (checked 2026-11-24)

- Retell with your own Telnyx line: **~$0.10/min** of real talk.
- Pilot month: **~$20–50** (test calls fit in Retell's $10 free credit).
- At 50 calls/day: **~$100–150/month** + Prospeo Starter ($49/mo) if you
  need many mobile numbers (10 credits each; the free plan's ~80 credits
  buy only ~8 numbers).

## What is NOT built (on purpose)

- No automatic/bulk calling. Every call is started by a human click.
- No cold calling, no number rotation, no Torii calling (partners would
  be a separate, later decision).
- No call recording storage of our own — recordings stay in Retell and
  are linked from the Calls tab.
