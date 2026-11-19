# Real Engine v1 — What Changed, Why, and How to Run It Live

**Branch:** `feat/real-lead-engine-v1` · **Date:** 2026-11-19
**Goal:** an AI marketing agent that finds real companies and decision-makers who can buy Noruva AI, emails them safely, and books meetings — with no fake data anywhere in the pipeline.

---

## 1. The honest review of the old code

### What was already good (kept)
- Prisma data model: Company, Contact, OutreachDraft, Deal, SuppressionList, AuditLog.
- Gemini ICP qualification (0–100 score + reason + draft) with a deterministic offline fallback.
- Reply classifier (INTERESTED / OBJECTION / NOT_NOW / UNSUBSCRIBE / OUT_OF_OFFICE) with rule-based fallback.
- Dispatcher safety basics: kill switch, daily cap, suppression check, unsubscribe link, List-Unsubscribe header.
- CSV import and manual lead entry — still the fastest way to start with a hand-built list.

### What was fake or dangerous (fixed in v1)
| Problem | Where | Risk |
|---|---|---|
| Lead "discovery" returned a hard-coded catalog (Ramp, Gorgias, Vanta, ClickUp, BairesDev…) labelled as Apollo/Google/LinkedIn/Facebook results | `discovery/finder.ts`, `discovery/multiSourceHunter.ts` | The whole pipeline was demo data pretending to be real |
| Contact emails were pattern guesses (`colin@ramp.com`, `zeb@clickup.com`) | same catalogs | Bounces, wrong people, catch-all traps, domain blacklisting, spam complaints |
| Autopilot auto-sent to those leads at score ≥ 85 | `autopilot/engine.ts` | One cron run could burn the sending domain |
| LinkedIn step set `linkedinConnected = true` without doing anything | `connectors/channelConnector.ts` | False reporting; LinkedIn automation also violates LinkedIn ToS |
| No email verification anywhere | — | Unverified lists bounce 15–30%; >3% bounce gets you flagged |
| Only a single email, no follow-up sequence | drafts | Most replies come from touches 2–3 |
| Resend offered as a cold-email channel | `email/dispatcher.ts`, `.env.example` | Resend's policy **prohibits** cold outreach — account-loss risk |
| No physical address in the email footer | dispatcher | CAN-SPAM requires one, even for B2B (no B2B exception; fines up to ~$53k/email) |
| Autopilot config + revenue ledger in memory | engine, stripe.ts | Lost on every restart (still true — see Roadmap) |

---

## 2. The v1 pipeline (how every working AI SDR is built)

```
ICP (pillar + titles)
  → DISCOVER   Prospeo → Apollo → Hunter waterfall (real APIs, licensed data)
  → VERIFY     MillionVerifier gate: VALID / RISKY / INVALID / UNKNOWN
               INVALID dropped · only VALID can ever be auto-sent
  → RESEARCH   Tavily, or the company's own website — with evidence URL stored
  → QUALIFY    Gemini 0–100 score + reason + pain points
  → SEQUENCE   3 touches (day 0 / +3 / +7), personalisation ONLY from stored evidence
  → APPROVE    Human approval queue (default for everything)
  → SEND       Dispatcher: kill switch → verification gate → daily cap (30)
               → suppression check → unsubscribe + physical address footer
  → REPLY      Classifier → INTERESTED gets the Cal.com booking link + Slack alert
               → UNSUBSCRIBE / bounce suppresses and stops the sequence
  → DEAL       Pipeline stage moves; Stripe webhook marks WON_PAID
```

### New / changed files
- `src/lib/discovery/providers.ts` — real Apollo / Prospeo / Hunter API clients. No key → `configured: false`, zero leads, never invented data.
- `src/lib/discovery/realHunter.ts` — waterfall + dedupe + verification + research + qualify + sequence.
- `src/lib/discovery/finder.ts`, `multiSourceHunter.ts` — catalogs deleted; thin wrappers over the real hunter (old imports keep working).
- `src/lib/verification/emailVerifier.ts` — syntax/disposable/role checks + MillionVerifier; `canSendOutreach()` is the hard gate.
- `src/lib/research/companyResearch.ts` — Tavily or website fetch, always returns an evidence URL or `source: "none"`.
- `src/lib/ai/sequence.ts` — 3-touch sequence builder; booking link from `MEETING_BOOKING_URL`.
- `src/lib/email/dispatcher.ts` — verification gate + physical-address footer + Resend cold-outreach warning.
- `src/lib/connectors/channelConnector.ts` — passes verification into the gate; LinkedIn is now an honest **manual task**, never a fake auto-connect.
- `src/lib/autopilot/engine.ts` — auto-send now requires score ≥ threshold **AND** verified VALID **AND** `AUTOPILOT_ALLOW_AUTO_SEND=true`.
- `src/app/api/discovery/search/route.ts` — returns a clear "no provider configured" response instead of fake leads; stores source + verification on the contact.
- `src/app/api/leads/verify/route.ts` — **new:** verify one email / contact and store the verdict.
- `src/app/api/research/route.ts` — **new:** research one company with evidence.
- `src/app/api/outreach/send/route.ts` — loads the contact's verification verdict and enforces the gate (RISKY only via explicit human `manualOverride`).
- `prisma/schema.prisma` — `Company.source / researchSummary / researchEvidenceUrl`, `Contact.source / emailVerification / emailVerifiedAt`, `OutreachDraft.sendAfterDays / evidenceUrl`. Run `pnpm prisma:push` after pulling.
- `.env.example` — provider keys, verifier, booking URL, physical address, autopilot opt-in.

---

## 3. Go-live checklist (in order — do not skip)

**Phase 0 — $0, today**
1. Get free keys: Prospeo (75/mo), Hunter (50/mo), MillionVerifier (100 credits), Tavily (1,000/mo), Gemini (existing). Apollo free as a second source.
2. Create a free Cal.com account, make a "15-min discovery" event, set `MEETING_BOOKING_URL` to your real link.
3. Set `COMPANY_PHYSICAL_ADDRESS` to Noruva's real postal address.
4. Run a discovery hunt, check the approval queue: are these real people, with VALID emails and evidence you can click?

**Phase 1 — first real campaign (~$50–60 first month)**
5. Buy 2–3 **separate** outreach domains (e.g. `getnoruva…`, `noruva…hq`) — **never** send cold mail from `noruvalabs.com` or your personal Gmail. Set SPF + DKIM (2048-bit) + DMARC (`p=none` → quarantine).
6. Create 2–3 inboxes per domain on their own Workspace/M365 tenant.
7. Warm every inbox 2–4 weeks (Instantly $47/mo or Smartlead $39/mo do warmup + rotation + unified inbox). Cap **30 emails/day/inbox**, follow-ups included.
8. First campaign: 200–500 verified leads, human approval ON, autopilot OFF. Watch bounce (<2% target, stop at 3%) and spam complaints (<0.1%; Google hard line 0.3%) in Google Postmaster Tools.
9. Only after a campaign with good numbers: consider `AUTOPILOT_ALLOW_AUTO_SEND=true` for that one proven segment.

**Never do**
- Send to guessed, scraped-from-LinkedIn, or unverified emails.
- Automate LinkedIn connections/messages (ToS + account bans).
- Cold-email individual Torii visa applicants — Torii outreach targets **partners** (agencies, consultancies, universities), applicants come through opt-in channels.
- Use Resend/SendGrid for cold sequences.

---

## 4. Costs (checked Nov 2026 — re-check before paying)

| Item | Free | Paid entry |
|---|---|---|
| Prospeo | 75 verified emails/mo | ~$39/mo |
| Apollo | free plan credits | $49/user/mo |
| Hunter | 50 credits/mo | $34/mo |
| MillionVerifier | 100 credits | ~$4.90 / 1,000 |
| Tavily | 1,000 credits/mo | $0.008/credit PAYG |
| Cal.com | free (1 user) | Teams $12/user/mo |
| Smartlead / Instantly | trial | $39 / $47 per mo |
| Outreach domains | — | ~$10–15/yr each |

Compare: AiSDR $250/mo for 200 contacts · Reply.io Jason from $500/mo · 11x from $3,750/mo billed annually. This engine does the same core job for the price of the sending tool.

---

## 5. Roadmap (next, in order)
1. Persist autopilot config + revenue ledger in the DB (today they reset on restart).
2. Sequence scheduler: a cron that sends step 2/3 only if no reply, not suppressed, still VALID — and stops on any reply.
3. Smartlead/Instantly send adapter (replace Gmail SMTP for real campaigns) + bounce/reply webhooks feeding the classifier automatically.
4. Auth on all API routes (today they are open — do not deploy publicly without it).
5. ~~Split the 2,090-line `page.tsx` dashboard into components.~~ UI cleanup done 2026-11-19 (commit `3c0b105`): page.tsx cut to ~1,680 lines, 8 tabs → 7 with short names, all simulate/fake features removed (Simulate Paid, Simulate Reply, fake kill-switch button, fake $600 MRR defaults, Retention/Health section, Revenue tab, decorative flowchart). Splitting the remaining file into components is still open.
6. Reply inbox polling (Gmail/IMAP or Smartlead Unibox webhook) so replies are classified without manual paste.
7. Torii partner campaign pack: same engine, ICP = visa/education agencies and consultancies, different pillars/copy.

---

## 6. What v1 does NOT claim
- No live send has been made with this code yet. The pipeline is verified in dry-run / simulated mode and by type-check + build.
- Provider response shapes follow each vendor's documented API; the first run with real keys may need small field-mapping tweaks — the clients fail safe (drop the lead) rather than inventing data.
- This is engineering guidance, not legal advice. CAN-SPAM / GDPR / CASL summary is in the research notes; get counsel before large EU/CA campaigns (v1: exclude Canada — CASL needs prior consent).
