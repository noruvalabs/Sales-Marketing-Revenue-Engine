# AI Call Agent — TEST build (branch: develop2)

An AI caller for **Noruva AI leads**. The same lead finder that finds
emails now also brings phone numbers, and the call agent calls those
leads to introduce the project, answer questions from one fixed script
+ FAQ, and book the 15-minute meeting. Every call's transcript, summary
and outcome are saved in the dashboard **Calls** tab.

> This lives ONLY on `develop2`, for testing. `develop` does not have it
> and stays clean for deployment. Nothing here calls anyone until the
> Retell keys are added AND `CALL_AGENT_ENABLED=true` is set.

## Free testing — hear the agent talk, $0 (do this first)

You do NOT need leads, phone numbers or keys to judge the agent's voice:

1. Create a **free Retell account** at retellai.com — new accounts get
   **$10 credit, no card required**.
2. Create an agent and paste the prompt from
   `src/lib/calling/script.ts` (see Setup step 3 below).
3. Click **Test** in the Retell dashboard → **web call** → allow the
   microphone and **talk to the agent in your browser**. This is free
   and unlimited on a draft agent — ask it the price question, try to
   confuse it, say "stop calling me", and see how it behaves.
4. Happy with how it talks? Then do the full Setup below (number + keys)
   and use the **"Call my number"** box in the Calls tab for a real
   phone test — the minutes come out of the same $10 free credit
   (~100 minutes of talk).

Checked against the alternatives (Nov 2026): Vapi gives only $5 credit
and its free number is **inbound-only** (it cannot call your phone
without a paid carrier number), so Retell is the better free test.
There is no permanently-free platform for real outbound phone calls —
free always means trial credit; the browser web-call is the one truly
$0, no-card test.

### Talk inside your own app — also free, no payment

The Calls tab has a **"Talk to the agent here — free"** panel: the same
agent, talking to you in the browser, inside your own app. It needs
only the **2 free keys** in `.env` (no number, no card):

```
RETELL_API_KEY=<Retell dashboard -> Settings -> API Keys>
RETELL_AGENT_ID=<your agent's page in Retell>
```

Restart the app, open the Calls tab, click **Start talking**, allow
the microphone, and judge the conversation — a live transcript appears
under the button. Minutes draw from the same $10 free credit.
`RETELL_FROM_NUMBER` and `CALL_AGENT_ENABLED` are needed ONLY for real
phone calls later.

## How phone numbers arrive (no extra system)

- **Web Hunter (free):** when it crawls a company's own website, it now
  also saves a phone number the company **published itself** (a `tel:`
  link or a visible international-format number) — same honesty rule as
  emails, never guessed.
- **Prospeo (paid, off by default):** set `PROSPEO_REVEAL_MOBILE=true`
  in `.env` and discovery also reveals each lead's verified mobile.
  **Cost warning:** a mobile reveal is **10 credits** (an email is 1),
  so a lead with a phone costs ~11 credits. The free plan's ~80 credits
  buy only ~7 such leads; Starter's 2,000 credits buy ~180.
- **By hand:** warm leads who replied but have no number show in the
  Calls tab with a one-click "Reveal phone" button (10 credits each).

## Safety rules built into the code

- **Who can be called:** any saved lead with a phone number (Sazzad's
  direction, 2026-11-27 — the first build was warm-only). Two hard
  blocks always apply: **opted-out contacts are never called**, and
  anyone on the **Suppression List** (email or company domain) is
  refused — checked when a lead is queued AND again at the moment the
  call starts.
- **Known legal risk, stated plainly:** US law treats an AI-voice sales
  call to a **mobile phone** as a robocall and may require prior
  consent; business/landline numbers are lower risk. The script always
  discloses it is an AI, honours "stop / don't call" instantly, and
  every call is started by a human click — there is no bulk dialler.
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

1. **Talk to it free in the browser first** (see "Free testing" above).
   Then **your own phone**: Calls tab → "Test on your own phone" →
   enter your number → "Call my number". Listen: does it introduce
   itself as an AI? Does it answer the price question correctly
   ($39/$78/$117)? Does it offer the booking link?
2. **Fix the script** if it says anything wrong — edit
   `src/lib/calling/script.ts` and paste the new prompt into Retell.
3. **Then 10 real leads.** Run a hunt (with `PROSPEO_REVEAL_MOBILE=true`
   if you want Prospeo mobiles, or let the Web Hunter bring published
   numbers free). In the Calls tab: Add to call queue → Call now. Call
   only in the lead's local business hours (9 AM–5 PM their time).
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
