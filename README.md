# NORUVA AI — Sales, Marketing & Revenue Engine

An autonomous, human-in-the-loop B2B customer acquisition and revenue platform for **Noruva AI**.

```
Discover → Research → Qualify → Engage → Convert → Retain → Optimize
```

---

## System Overview

The **Noruva Revenue Engine** is designed to generate profitable, predictable recurring SaaS revenue through:
1. **AI Lead Discovery:** Identifying high-fit B2B accounts and verified decision-makers.
2. **AI Intelligence & ICP Qualification:** 0–100 scoring based on technology stack, hiring signals, and pain points.
3. **Hyper-Personalized Outreach:** Generating multi-touch email sequences with mandatory human-in-the-loop review.
4. **Conversation & Reply Intelligence:** Classifying inbound replies and alerting reps to high-intent opportunities.
5. **Deal & Conversion Pipeline:** Full CRM tracking from `Lead` to `Meeting`, `Trial`, and `Won (Paid)`.
6. **Revenue & Lifecycle Intelligence:** Real-time MRR, ARR, CAC, and retention metrics tied directly to Stripe billing events.

---

## Technical Stack

- **Dashboard:** Next.js 15 (App Router, Tailwind CSS, shadcn/ui)
- **Database:** PostgreSQL + Prisma ORM
- **Intelligence:** Anthropic Claude 3.5 Sonnet / OpenAI GPT-4o
- **Email Delivery:** Resend API / Gmail OAuth with suppression and domain warmup rules
- **Billing & Revenue:** Stripe API & Webhooks
- **Notifications:** Slack Webhooks
- **Calendar:** Google Calendar / Cal.com

---

## Repository Structure

```
├── apps/
│   └── web/                   # Next.js 15 Admin & Cockpit Dashboard
├── packages/
│   ├── database/              # Prisma schema & database client
│   ├── ai-engine/             # Qualification, Scoring & Copywriting prompts
│   ├── integrations/          # Apollo, Stripe, Resend, Slack, Google Calendar
│   └── compliance/            # Suppression list & safety kill-switches
├── scripts/                   # Migration & seed utilities
└── docker-compose.yml         # Local PostgreSQL & Redis
```

---

## Safety & Compliance Guarantees

- **Mandatory Approval:** Zero automated cold emails are dispatched without explicit human sign-off in the approval queue.
- **Strict Suppression:** One-click opt-out and automatic cancellation of scheduled follow-ups upon unsubscribe or negative reply.
- **Volume Limits:** Capped at 30–40 emails/day per domain with randomized jitter delays to maintain pristine domain reputation.
- **Kill-Switch:** Instant emergency halt via dashboard toggle or `OUTREACH_KILL_SWITCH=true`.

---

## Git Workflow & Branching Guidelines

> [!IMPORTANT]
> **`develop` is our primary active development branch.**
> All team members must pull from `develop` before starting any new work, and merge/push finished feature branches into `develop`.

### Team Workflow Rules:

1. **Always pull the latest `develop` before starting work:**
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. **Create a dedicated feature or bugfix branch:**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```

3. **Commit your changes:**
   ```bash
   git add .
   git commit -m "feat: description of work done"
   ```

4. **Integrate with `develop` when finished:**
   ```bash
   # Update your local develop branch
   git checkout develop
   git pull origin develop

   # Merge your feature branch into develop
   git merge feature/your-feature-name

   # Push to remote develop
   git push origin develop
   ```
   *(Or push your feature branch and open a Pull Request targeting `develop`).*

