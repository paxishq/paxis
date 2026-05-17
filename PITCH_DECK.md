# Paxis
### The EU Compliance OS for Enterprise Supply Chains

Gemini 3.1 · Vultr · EU AI Act · CSRD · Carbon Tracking · Extensible Compliance Modules

**AI Agent Olympics — Milan AI Week 2026**

---

## The Problem

**EU enterprises are legally required to report Scope 3 emissions — but they can't. Their suppliers don't have the data.**

CSRD mandates that large EU companies report their entire value chain carbon footprint. The problem isn't willingness — it's that the data lives inside thousands of small suppliers who have no tooling, no compliance staff, and no way to respond accurately or at scale.

| Regulation | Who It Hits | The Blocker |
|---|---|---|
| **CSRD / ESRS** | Large EU enterprises (1,000+ employees, €450M+ revenue) | Scope 3 requires primary data from suppliers — who have none |
| **EU AI Act** | Any company using or deploying AI systems | Every supplier in HR, CRM, or customer-facing workflows needs documented AI inventories |
| **GDPR (evolved)** | Any company handling customer data through AI tools | New AI-specific enforcement creates liability up and down the supply chain |
| **CSDDD** | Large EU enterprises from 2027 | Human rights and environmental due diligence across supply chains — same supplier network, new obligation |
| **CBAM** | Any company importing carbon-intensive goods | Emissions certificates required from non-EU suppliers — same carbon data, new reporting surface |

### The Scope 3 Data Gap

Large enterprises can model their own Scope 1 and 2 emissions. Scope 3 — indirect value chain emissions — is a different problem entirely. It requires primary data from hundreds or thousands of suppliers. The GHG Protocol's March 2026 update raised the bar further: spend-based proxies are out, supplier-specific primary data is in, with a 95% coverage floor coming into effect.

The standard industry approach — send a spreadsheet, wait 90 days, chase manually, aggregate inconsistent responses — is broken. Enterprises are filing incomplete reports or expensive consultants are papering over the gaps.

**The suppliers aren't the obstacle. The absence of tooling built for them is.**

### The AI Act Dimension

Beyond carbon, the EU AI Act creates a second mandatory data collection problem for enterprises. Any supplier using AI in HR screening, CRM, logistics, or customer-facing workflows needs to have classified and documented those systems. An enterprise with 600 suppliers has no visibility into which ones are compliant. That's a live audit risk sitting inside every supply chain.

**Paxis solves both today. And is architected to absorb every regulation that comes next.**

---

## The Insight

> Enterprises can't complete their mandatory CSRD reports because their suppliers have no compliance infrastructure. The bottleneck isn't the enterprise — it's the 800 suppliers who've never heard of ESRS.

Existing platforms (Workiva, Watershed, Persefoni) sell expensive software to enterprise sustainability teams. They don't solve the supplier data collection problem — they just give the enterprise a nicer place to track how many suppliers still haven't responded.

Persefoni got close: they launched a free supplier tier in 2024 and logged 6,000+ organic sign-ups — but only by running dedicated supplier acquisition campaigns. Persefoni is also US-built, US-regulatory-first, and doesn't touch EU AI Act. Their European customers are underserved on the exact regulations that matter most right now.

**Paxis is the EU-native version of that model — with one critical structural difference: enterprises onboard their own supplier networks onto Paxis at their own expense.**

Every enterprise deal is simultaneously a revenue event and a distribution event. Paxis' customer acquisition cost for the supplier network is zero — enterprises pay to seed the platform with their own suppliers as a byproduct of solving their own mandatory CSRD filing problem. Persefoni spent marketing budget to acquire 6,000 suppliers. Paxis gets them for free with every enterprise contract signed.

The enterprise pays. The supplier gets free tooling. The network compounds — without Paxis spending a dollar on supplier acquisition.

---

## The Solution

Paxis is a **two-sided compliance OS**. Enterprises use Paxis to dispatch questionnaires, track supplier response status, and aggregate audit-ready Scope 3 data. Suppliers use Paxis — free — to maintain their AI Act inventory, carbon ledger, and compliance documentation, so they're always ready to respond.

Six specialized AI agents run continuously in the background for every participant in the network, coordinated by a central planner. The agent pattern — intake, classify, measure, track, report, alert — is regulation-agnostic. New compliance modules drop in without re-onboarding suppliers or re-integrating enterprise systems.

```
                        🧠 Planner Agent
          ______________|_______________|______________
         |          |          |          |           |
     Intake      EU AI      Carbon    Supply      ESRS
      Agent      Act        Agent     Chain      Report
                Agent                 Agent      Agent
                         __________________________|
                        |
                   Risk & Deadline
                       Agent
                         |
              ___________↓___________
             |                       |
        [CSDDD Module]        [CBAM Module]
        Coming 2027            Coming 2027
```

---

## The Six Agents

**1. Intake Agent** — questionnaire router
On the enterprise side: dispatches CSRD supplier questionnaires to the supply chain network, tracks response rates, and surfaces gaps. On the supplier side: receives incoming questionnaires, maps each question to what the other agents already know, and identifies what still needs action. One agent, two perspectives — and the same router that handles CSRD questionnaires will handle CSDDD and CBAM requests as those modules go live.

**2. EU AI Act Agent** — AI inventory, both sides
For enterprises: monitors which suppliers have documented their AI systems and flags supply chain AI Act exposure. For suppliers: automatically discovers and inventories every AI tool in use — CRM, HR screening, chatbots, recommendation engines — classifies by risk tier, generates required technical documentation, and alerts on new tool introductions. No opt-out on either side.

**3. Carbon Agent** — Scope 1 and 2 emissions
For suppliers: ingests energy bills, fuel receipts, and utility invoices via document upload, calculates Scope 1 and Scope 2 emissions using Gemini multimodal document parsing, maintains a live emissions ledger. For enterprises: aggregates verified Scope 1/2 data from their supplier network into the Scope 3 Category 1 calculation. The same carbon ledger feeds CSRD today and CBAM certificates tomorrow.

**4. Supply Chain Agent** — Scope 3 orchestration
The core enterprise value agent. Tracks which suppliers have submitted primary emissions data, which are pending, and what estimated gap remains. Manages outbound supplier requests, chases non-responders, and aggregates inbound data into a consolidated Scope 3 figure with data quality tier labels per the updated GHG Protocol standard. Operates as a live supply chain compliance dashboard.

**5. Risk & Deadline Agent** — compliance calendar for both sides
For enterprises: monitors CSRD filing deadlines, flags when supplier response rates put the report at risk, and surfaces regulatory changes — including new regulations coming into force. For suppliers: tracks EU AI Act documentation deadlines, GDPR review cycles, and incoming enterprise questionnaire windows. Runs continuously — no human needs to track it.

**6. ESRS Report Agent** — audit-ready output
Assembles all agent outputs into CSRD-standard ESRS format. For enterprises: generates the consolidated Scope 3 section of their annual sustainability report with full data provenance. For suppliers: produces one-click questionnaire response packages. Designed to output any report format — ESRS today, CSDDD due diligence reports and CBAM certificates tomorrow.

---

## Architecture

| Layer | Stack |
|---|---|
| **Runtime** | Bun · single executable · `bun init paxis --react=shadcn` · npm scope `@paxishq` |
| **Frontend** | React + shadcn/ui · TypeScript · enterprise supply chain dashboard + supplier compliance portal |
| **Backend** | Bun fullstack server · `Bun.serve()` · HTML routes + API routes in one process |
| **Auth** | Better Auth · Bun-native · role-based access (enterprise admin vs supplier node) · session audit hooks |
| **Type Safety** | `@typescript/native-preview` (tsgo) · Zod schema validation |
| **Database** | Drizzle ORM · PostgreSQL 18 · on-instance, localhost-only · immutable compliance audit log |
| **Agent Orchestration** | Gemini 3.1 Pro · multi-step reasoning · async background workflows |
| **Document Intelligence** | Gemini 3.1 Flash · multimodal parsing of invoices, energy bills, questionnaires in IT/DE/FR/EN |
| **LLM Fallback** | Featherless.ai (OpenAI-compatible) · `mistralai/Mistral-Small-3.2-24B-Instruct-2506` · multimodal-capable fallback across all agents including document parsing |
| **Formatting / Lint** | Biome.js |
| **IaC** | OpenTofu · official Vultr provider · native state encryption via KMS · provisions VM + networking |
| **Infrastructure** | Vultr VX1 · Ubuntu 26.04 LTS · single Bun binary · Caddy TLS (DNS-01) · no Docker · getpaxis.com |

> **Resilience note:** All agent calls route through a provider abstraction layer (`LLM_PROVIDER=gemini|featherless`). If Gemini experiences latency during the live demo, a single env var switch routes all inference to Featherless with zero code changes. Document parsing falls back to pre-extracted text via `pdfjs`.

---

## Live Demo

**Scenario:** A listed Northern Italian food manufacturer needs to file its CSRD report. Scope 1 and 2 are covered. Scope 3 requires primary emissions data and AI Act documentation from 47 direct suppliers — ceramics, packaging, logistics, ingredients. Six weeks to filing.

**Enterprise user action:** Open Paxis' supply chain dashboard, trigger a Scope 3 collection run.

1. **Supply Chain Agent** — Identifies 47 direct suppliers · 12 already on Paxis with live data · 35 need onboarding · dispatches questionnaires with pre-filled templates · status: 🔄 collection in progress

2. **Intake Agent (supplier side)** — Each supplier receives a Paxis onboarding link · questionnaire pre-maps to their existing data where possible · flags only the genuine gaps requiring action

3. **EU AI Act Agent** — Across the 12 active suppliers: all 3 AI tools in one ceramics firm classified and documented · HR screening tool flagged limited-risk · documentation generated · status: ✅ covered for active suppliers

4. **Carbon Agent** — Active suppliers: 12-month energy invoice data already ingested · Scope 1 + 2 verified · new suppliers: invoice upload flow triggered on onboarding

5. **Risk & Deadline Agent** — 6-week window flagged · supplier response milestones set at week 2, 4, and 5 · non-responder escalation queue active · status: ✅ tracked

6. **ESRS Report Agent** — Assembles Scope 3 Category 1 section with verified primary data from 12 suppliers + estimated ranges for 35 pending · full data quality tier labelling per updated GHG Protocol · generates audit-ready draft with provenance trail

**Result:** What normally requires a sustainability consultant, a 90-day data chase, and a €40,000 invoice — compressed into a live dashboard with automated supplier onboarding, continuous data collection, and an audit-ready ESRS output that updates in real time as suppliers respond.

---

## Business Model

Paxis is a **two-sided network**. Enterprises are the paying customers. Suppliers are the network — free to join, valuable to retain.

| Tier | Who | Price | Value |
|---|---|---|---|
| **Supplier Free** | Suppliers onboarded by enterprise customers | €0 | AI Act inventory · carbon ledger · questionnaire response tools · always ready to respond |
| **Supplier Pro** | Suppliers who want proactive compliance beyond questionnaire response | €149/month | Full 6-agent suite · ESRS report generation · self-initiated supplier outreach · access to new compliance modules as they launch |
| **Enterprise** | Large EU companies filing CSRD with Scope 3 supply chain requirements | €800–2,000/month | Supply chain compliance dashboard · bulk questionnaire dispatch · Scope 3 aggregation · audit controls · data quality reporting · early access to CSDDD and CBAM modules |

**The zero-CAC flywheel:** Paxis has no supplier acquisition cost. Enterprises pay to onboard their own supply chains — every enterprise contract is a distribution event that seeds the network with 50–200 new supplier nodes at zero marginal cost to Paxis. Each supplier that joins becomes a node available to all future enterprise customers — supply chain overlap means the second enterprise gets significantly more pre-onboarded suppliers than the first. The network compounds with every deal closed.

**Unit economics:** At €1,200/month average enterprise ACV and 50 suppliers onboarded per customer, each enterprise deal seeds the network with 50 free nodes — of which 10–20% convert to Supplier Pro over 12 months. Enterprise revenue funds growth; supplier Pro revenue is pure upside. CAC for 2M potential supplier nodes: €0.

**The compliance module expansion:** Every new EU regulation that activates a new module is an upsell to existing enterprise customers — with no new supplier acquisition required. The network is already in place. CSDDD enforcement in 2027 is not a threat to Paxis; it's a revenue event.

---

## Compliance Module Roadmap

The six-agent pattern — intake, classify, measure, track, report, alert — is regulation-agnostic. New compliance requirements drop in as modules, activating against the existing supplier network and audit infrastructure without re-onboarding.

| Module | Regulation | Timeline | What It Adds |
|---|---|---|---|
| **CSRD / ESRS** | EU Corporate Sustainability Reporting Directive | ✅ Live | Scope 3 carbon data collection · ESRS report generation |
| **EU AI Act** | EU Artificial Intelligence Act | ✅ Live | AI system inventory · risk classification · technical documentation |
| **GDPR+** | GDPR AI-specific enforcement | ✅ Live | AI data processing audit trail · consent mapping |
| **CSDDD** | Corporate Sustainability Due Diligence Directive | 🔜 2027 | Human rights & environmental due diligence · supplier risk scoring |
| **CBAM** | Carbon Border Adjustment Mechanism | 🔜 2027 | Emissions certificates for imports · cross-border carbon reporting |
| **EUDR** | EU Deforestation Regulation | 🔜 2025 active | Supply chain traceability for deforestation-linked commodities |
| **PCF** | Product Carbon Footprint standards | 🔜 2028 | Product-level emissions labelling · lifecycle analysis |

Every enterprise customer already onboarded for CSRD activates new modules with a single switch — same supplier network, same audit log, new compliance surface covered. Each new regulation is an expansion revenue event, not a new sales motion.

---

## Market Opportunity

| Metric | Value |
|---|---|
| Large EU enterprises in CSRD scope | **~5,000** (post-Omnibus) |
| Average suppliers per enterprise | **200–2,000** |
| Suppliers needing onboarding into Scope 3 data programs | **~2M** (growing) |
| Current enterprise Scope 3 consultant spend | **€40,000–200,000/year** |
| New EU regulations requiring supply chain data by 2028 | **5+** |
| Purpose-built EU supply chain compliance networks | **Effectively zero** |

### Why Now

- **The GHG Protocol raised the bar in March 2026** — spend-based Scope 3 proxies are being phased out in favour of supplier-specific primary data with a 95% coverage floor. Enterprises that relied on estimates now need a real supplier data pipeline.
- **EU AI Act enforcement is live** — supply chain AI Act exposure is an emerging enterprise audit risk with no tooling addressing it at the supplier level.
- **The Omnibus concentrated demand** — by cutting CSRD scope from ~50,000 to ~5,000 companies, the Omnibus created a defined, high-compliance-budget enterprise market that needs supplier network solutions urgently.
- **The regulatory pipeline is full** — CSDDD, CBAM, EUDR, and PCF standards all land between 2025 and 2028. Each one requires supply chain data from the same supplier network Paxis is building today.
- **No EU-native network exists** — US platforms (Watershed, Persefoni) are priced for US regulations and don't cover EU AI Act. European alternatives (Greenly, Dcycle) cover carbon but have no supply chain network play, no AI Act layer, and no extensible module architecture.

---

## Competitive Landscape

| Platform | EU-Native | AI Act Coverage | Supply Chain Network | Extensible Modules | Supplier Free Tier |
|---|---|---|---|---|---|
| **Paxis** | ✅ ESRS, multilingual | ✅ Full | ✅ Two-sided | ✅ CSDDD, CBAM, EUDR roadmap | ✅ |
| Persefoni | ❌ US-first | ❌ | Partial | ❌ | ✅ (US-focused) |
| Watershed | ❌ US-first | ❌ | Limited | ❌ | ❌ |
| Greenly | ✅ | ❌ | ❌ | ❌ | ❌ |
| Dcycle | ✅ | ❌ | ❌ | ❌ | ❌ |
| Workiva | ❌ | ❌ | ❌ | Partial | ❌ |

**The one-line comp:** *"Persefoni proved the two-sided model but spent marketing budget acquiring suppliers. Paxis gets supplier acquisition for free — enterprises onboard their own networks as a byproduct of solving their own mandatory CSRD problem. EU-native, AI Act coverage, ESRS output, extensible compliance modules — for the market Persefoni can't serve."*

---

## Sponsor Alignment

**Google Gemini — target: $5,000 prize**

Gemini 3.1 Pro is the Paxis Planner Agent brain — coordinating six specialized agents, maintaining context across a full enterprise supply chain workflow, and reasoning across EU AI Act, CSRD, and GDPR simultaneously for hundreds of supplier nodes. Gemini 3.1 Flash handles the document intelligence layer — parsing energy bills, supplier questionnaires, and audit forms as raw PDFs and images in Italian, German, French, and English natively. At enterprise scale, this is thousands of documents per customer per year. Gemini's multimodal capability is what makes the unit economics work. This isn't a wrapper — Gemini is the engine.

**Vultr — target: $5,000 cash + $1,000 credits**

Vultr hosts the Paxis VM backend, runs the PostgreSQL audit log, serves the public demo URL, and provides the infrastructure for the document parsing pipeline. Every compliance classification, emissions calculation, and agent action is written to the Vultr audit log as an immutable record — making Vultr literally the Scope 3 system of record for enterprise CSRD filings. As new compliance modules activate, every new data point written to that same immutable log extends Vultr's role as the compliance system of record. For a product where auditability is the entire value proposition, Vultr isn't just infrastructure. It's what makes the data enterprise-grade across every regulation.

**Featherless AI — hackathon sponsor alignment**

Featherless is a named sponsor of this event — and Paxis uses it directly. All agent inference routes through a provider abstraction layer (`LLM_PROVIDER=gemini|featherless`). If Gemini experiences latency during the live demo, a single env var switch routes all inference to Featherless running `Mistral-Small-3.2-24B-Instruct-2506` — a 24B EU-origin model with multimodal vision support, meaning even the document parsing fallback works, not just orchestration. A hackathon sponsor running a EU-built model is Paxis' production fallback. That's not a contingency — that's an architecture decision.

---

## Judging Criteria Alignment

| Criteria | Paxis |
|---|---|
| **Application of Technology** | Gemini 3.1 Pro/Flash across six agents; Vultr as immutable audit log; genuine multi-agent coordination across a two-sided network; extensible module architecture; Featherless (event sponsor) running Mistral Small 3.2 as multimodal-capable live fallback |
| **Presentation** | Live demo shows an enterprise compressing a 6-week, €40K Scope 3 collection exercise into a real-time dashboard — judges from JP Morgan, Workday, PayPal, and Apple will feel this immediately |
| **Business Value** | Enterprise pays €800–2,000/month to solve a mandatory filing problem; supplier CAC is zero; network compounds with every deal; every new EU regulation is an expansion revenue event not a new sales motion |
| **Originality** | No product combines EU AI Act + CSRD Scope 3 + two-sided supplier network + extensible compliance module architecture in a single EU-native agent OS |

---

## Hackathon → Product Roadmap

| Phase | Milestone | Deliverables |
|---|---|---|
| **May 13–19** | Hackathon Build | All 6 agents working, enterprise dashboard + supplier portal, Gemini multimodal doc parsing, Vultr deployment, immutable audit log, live demo at Fiera Milano |
| **Month 1** | Closed Beta | 2 Northern Italian enterprise pilots, 20+ supplier nodes onboarded per enterprise, full document ingestion pipeline, ESRS Scope 3 section output |
| **Month 3** | Launch | 10 paying enterprise customers, 500+ supplier nodes, integrations with Italian accounting software (Fatture in Cloud, TeamSystem), €1,200/month Enterprise ACV |
| **Month 6** | Scale | 50 enterprise customers across IT/DE/FR, 5,000+ supplier nodes, CSDDD and CBAM modules in beta, network overlap compounding, Series A pipeline |
| **Month 12** | Compliance OS | CSDDD, CBAM, EUDR modules live · existing customers activate via single switch · 0 new supplier acquisition required per new regulation |

---

## Paxis

*The compliance OS your supply chain already needs — and every regulation that comes next.*

**getpaxis.com · github.com/paxishq**

**Built at AI Agent Olympics · Milan AI Week · May 13–20, 2026**
