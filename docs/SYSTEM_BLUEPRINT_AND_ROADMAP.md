# Noruva AI — Sales, Marketing & Revenue Engine
## System Blueprint, Architecture & Implementation Roadmap

**Branch:** `feature/architecture-and-roadmap`  
**Target:** 0 → 1 Production Customer Acquisition & Revenue Engine  
**Core Thesis:** *Business First. Automation Second. Revenue as the Outcome.*

---

## 1. Executive Vision & Goal

Build an enterprise-grade, autonomous (yet strictly human-supervised) sales, marketing, and revenue engine that:
1. **Solves Noruva Labs Customer Acquisition:** Predictably drives paying customers to Noruva's core products (Interview Copilot, Client Meeting Assistant, Support Agent, Bilingual AI).
2. **Productizes into a B2B SaaS:** Re-packages the engine into a multi-tenant platform sold to other B2B software companies as a recurring subscription.

```
       DISCOVER          QUALIFY            ENGAGE           CONVERT            RETAIN           OPTIMIZE
 ┌─────────────────┐ ┌─────────────┐ ┌────────────────┐ ┌──────────────┐ ┌─────────────────┐ ┌─────────────┐
 │ B2B Data APIs   │ │ 0-100 ICP   │ │ 1:1 Outreach   │ │ CRM Pipeline │ │ Onboarding &    │ │ MRR, ARR,   │
 │ Web Research    │ │ Scoring &   │ │ Human Review   │ │ Demo/Trial   │ │ Health Score    │ │ CAC, Cohort │
 │ Inbound Traffic │ │ Explanation │ │ Safe Sending   │ │ Stripe Sync  │ │ Churn Alerts    │ │ Attribution │
 └────────┬────────┘ └──────┬──────┘ └───────┬────────┘ └──────┬───────┘ └────────┬────────┘ └──────┬──────┘
          └─────────────────┼────────────────┼─────────────────┼──────────────────┼─────────────────┘
                            ▼                ▼                 ▼                  ▼
                    ┌──────────────────────────────────────────────────────────────────┐
                    │               PostgreSQL + Prisma Unified Data Core              │
                    └──────────────────────────────────────────────────────────────────┘
```

---

## 2. The 7 Autonomous Agents & Core Workflows

### A. Lead Discovery Agent
* **Role:** Continuous ingestion of high-fit prospective companies and verified decision-makers.
* **Channels:** Apollo / Prospeo / Crunchbase APIs, company websites, and inbound form submissions.
* **Key Tasks:**
  - Discover company domain, industry, size, geography, and technology stack.
  - Locate decision-makers (Founders, VP Sales, Heads of Talent, Customer Success Directors).
  - Strict deduplication (matching on normalized domain and business email).

### B. Lead Intelligence & Qualification Agent
* **Role:** Evaluate every prospect against Noruva's Ideal Customer Profile (ICP).
* **Intelligence Logic:**
  - AI analysis of public company footprint against Noruva value propositions.
  - Generates an explainable **0–100 score** with specific reasoning (e.g., *“Score 88: Tech consultancy with 40 remote engineers hiring active interviewers; strong pain point for Interview Copilot”*).
  - Automatically filters low-intent or unsuitable leads before any marketing effort is spent.

### C. Marketing & Outreach Agent
* **Role:** Hyper-personalized multi-touch sequence generation.
* **Safety Mandate:** **100% Human-in-the-Loop approval.**
  - Outbound drafts are placed in an Admin Review Cockpit.
  - Sales reps review, edit, or approve drafts with 1 click.
  - Dispatch engine respects daily inbox volume caps (30–40 emails/day), random delay jitter, and instant opt-out suppression.

### D. Sales Conversation Agent
* **Role:** Managing the communication lifecycle after emails are sent.
* **Capabilities:**
  - Inbound webhook/IMAP poller listening for prospective replies.
  - AI Intent Classification:
    - `INTERESTED` (requests pricing, demo, or info) $\rightarrow$ Instantly alerts rep via Slack and prepares booking link.
    - `OBJECTION` / `NOT_NOW` $\rightarrow$ Logs objection reason and pauses outreach for 60 days.
    - `UNSUBSCRIBE` $\rightarrow$ Instantly adds to global suppression list and halts all scheduled follow-ups.

### E. Deal & Conversion Agent
* **Role:** End-to-end CRM and pipeline tracking.
* **Pipeline Stages:**
  $$\text{Discovered} \rightarrow \text{Qualified} \rightarrow \text{Contacted} \rightarrow \text{Meeting Booked} \rightarrow \text{Demo Done} \rightarrow \text{Trial Active} \rightarrow \text{Won (Paid)}$$
* **Integration:** Direct sync with Google Calendar / Cal.com for meetings and Stripe webhooks for real payment verification.

### F. Customer Growth & Retention Agent
* **Role:** Protecting recurring revenue post-purchase.
* **Capabilities:**
  - Tracks product activation milestones during the first 14 days.
  - Flags dormant or at-risk accounts (no active sessions for > 7 days).
  - Surfaces expansion/upsell opportunities (team license upgrades).

### G. Revenue Intelligence Agent
* **Role:** Unified executive dashboard and economic truth.
* **Metrics Tracked:**
  - **MRR & ARR:** Directly sourced from Stripe invoice events.
  - **CAC (Customer Acquisition Cost):** Combining API credits, email domain costs, and infrastructure overhead.
  - **Funnel Velocity:** Time-to-convert from first outreach to paid subscription.
  - **AI Performance:** Conversion rate comparison across messaging angles and value propositions.

---

## 3. Recommended Minimal Technical Stack

| Tier | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend & UI** | Next.js 15 (App Router), Tailwind CSS, shadcn/ui, Lucide Icons | Admin Cockpit, Approval Queue, CRM Pipeline, Analytics |
| **Backend & API** | Next.js Route Handlers + TypeScript Workers | Core business logic, webhook processing, queue workers |
| **Database** | PostgreSQL + Prisma ORM | Relational data integrity for Companies, Contacts, Deals, Events |
| **AI Intelligence** | Claude 3.5 Sonnet & OpenAI embeddings | Nuanced reasoning, qualification scoring, semantic deduplication |
| **Email Delivery** | Resend API / Gmail OAuth | Outbound delivery with DKIM, SPF, DMARC, suppression controls |
| **Calendar Sync** | Google Calendar API / Cal.com Webhooks | Automated meeting scheduling and attendance tracking |
| **Payment Sync** | Stripe Webhook (`customer.subscription.*`, `invoice.*`) | Verified revenue attribution |
| **Notifications** | Slack Webhook Bot | High-intent prospect notifications in < 60 seconds |

---

## 4. Phase-by-Phase Execution Plan

### Sprint 1: Project Scaffolding & Core Intelligence (Foundation)
- [ ] Initialize Next.js 15 full-stack application within this repository.
- [ ] Set up Prisma ORM with PostgreSQL database schema (`Company`, `Contact`, `Activity`, `Deal`, `SuppressionList`).
- [ ] Build the **ICP Scoring Engine** using Claude 3.5 with structured output.
- [ ] Implement CSV and API Lead Ingestion with automatic domain deduplication.

### Sprint 2: Human-in-the-Loop Review Cockpit & Safe Outreach
- [ ] Build the Next.js **Review & Approval Queue** UI (Approve, Edit, Reject).
- [ ] Implement multi-touch personalized sequence generation prompt pipeline.
- [ ] Build safe email dispatcher with daily domain caps and global suppression checks.
- [ ] Create Emergency Kill-Switch controls.

### Sprint 3: Conversation Intelligence & CRM Pipeline
- [ ] Build inbound email webhook receiver.
- [ ] Implement AI sentiment/intent classifier (`INTERESTED`, `OBJECTION`, `UNSUBSCRIBE`).
- [ ] Build real-time Slack notification bot for high-intent replies.
- [ ] Build the Kanban CRM pipeline view (`Qualified` $\rightarrow$ `Paid`).
- [ ] Integrate Google Calendar / Cal.com meeting booking links.

### Sprint 4: Stripe Revenue Attribution & Analytics Dashboard
- [ ] Connect Stripe webhooks for verified recurring revenue tracking.
- [ ] Build the executive dashboard: MRR, ARR, CAC, conversion rates, and API costs.
- [ ] Implement automated follow-up cadences and customer onboarding health checks.

### Sprint 5: SaaS Multi-Tenancy & Productization
- [ ] Introduce Organization / Workspace isolation in Prisma schema.
- [ ] User role-based permissions (Admin, Sales Rep, Viewer).
- [ ] Self-service campaign creation and BYOK (Bring Your Own Keys).

---

## 5. Immediate Next Actions

To begin implementation right away on this feature branch:
1. **Initialize the Next.js 15 App Router codebase** with TypeScript and Tailwind CSS.
2. **Configure Prisma schema** modeling the core revenue engine entities.
3. **Build the ICP scoring agent prototype** with mock or real company inputs.
