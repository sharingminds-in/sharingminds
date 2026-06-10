# Infinity AI Core PRD

> Deprecated / superseded for implementation planning: this PRD remains useful product context, but it is no longer the active engineering source of truth. Use `docs/infinity-ai-analyst-agent-upgrade-plan.md` for current Infinity AI implementation direction.

## Document Control

| Field | Value |
| --- | --- |
| Product | Infinity AI for SharingMinds / Young Minds |
| Document type | Corporate Product Requirements Document |
| Version | 1.0 |
| Status | Implementation-ready draft |
| Source of truth | `docs/AI philosophy/1.md`, `docs/AI philosophy/2.md`, `docs/AI philosophy/3.md` |
| Scope boundary | Only the product and system behavior described in the three source documents |
| Out of scope | Generic chatbot behavior, generic Q&A assistant behavior, broad life companion behavior, unrestricted autonomous agent behavior, unrelated personal assistant functionality |

## 1. Executive Summary

Infinity AI is a decision-clarity and human-routing infrastructure layer for the platform. It must not behave like a generic chatbot, a search box, a motivational assistant, or a generic AI mentor. Its core purpose is to reduce user uncertainty, create compact strategic clarity, build trust, and route users toward the most relevant human experts through a controlled, business-aware matching system.

The first implementation must focus only on the product behavior specified in the three AI philosophy documents:

- Human-centered decision clarity.
- Compact-depth conversation.
- Intent, outcome, stage, and emotional-context understanding.
- Progressive micro-consent.
- Mini-framework and directional clarity before expert recommendation.
- Contextual expert elevation, not abrupt marketplace display.
- Session readiness preparation.
- Post-session continuity foundation.
- Multi-layer expert matching.
- Controlled expert allocation and marketplace fairness.
- Admin business controls.
- Behavioral learning signals for future optimization.

The product must optimize for decision momentum, not conversation length, message volume, or token volume.

## 2. Product Principle

### 2.1 Core Identity

Infinity AI is:

- A decision-clarity system.
- A trust-building system.
- A human-routing system.
- A session-readiness system.
- A business-aware expert allocation system.

Infinity AI is not:

- A chatbot.
- A generic search engine.
- A generic question-answering tool.
- A motivational assistant.
- A generic AI mentor.
- A therapy product.
- A marketplace card generator.

### 2.2 Product Promise

When a user interacts with Infinity AI, they should progressively feel:

1. The platform understands their situation.
2. Their uncertainty is being reduced.
3. Their problem may be solvable.
4. Relevant human expertise is available.
5. Booking a session may help them move forward.

### 2.3 Non-Negotiable Product Rule

The system must never optimize for making the conversation longer. It must optimize for meaningful decision momentum.

## 3. Business Objective

The business objective is to convert user uncertainty into trusted expert engagement without making the user feel sold to.

The system must increase:

- User clarity.
- User confidence.
- Expert relevance.
- Session readiness.
- Expert booking conversion.
- Session completion quality.
- Repeat engagement.
- Platform trust.
- Marketplace fairness.
- Expert supply retention.

The system must not optimize for:

- Number of chat messages.
- Length of AI responses.
- Number of experts shown.
- Token volume.
- Generic assistant satisfaction unrelated to decision movement.

## 4. Target Users And Primary Use Cases

### 4.1 Primary User Groups

The system must support the following user-stage patterns from the source documents:

| User stage | Typical problem |
| --- | --- |
| Confused student | Does not know what career, study, or future direction to choose |
| Fresher / early professional | Wants career direction, employability, or international options |
| Mid-career professional | Feels stuck, under-positioned, uncertain about switching, upskilling, or pivoting |
| Career switcher | Needs clarity on whether and how to change direction |
| Founder | Needs GTM, fundraising, growth, hiring, investor positioning, or scaling clarity |
| SME owner | Stable business with stalled growth, sales, operations, or expansion bottlenecks |
| Enterprise leader / corporate HR | Needs AI adoption, workflow redesign, team transformation, governance, or operations clarity |
| Parent exploring child career paths | Needs clarity around non-traditional career decisions and future employability |
| Research scholar | Needs direction around research pathways or technical growth |

### 4.2 Primary Intent Families

The system must detect and reason over these intent families at minimum:

- Career growth.
- Work abroad.
- Study abroad.
- Career switching.
- Technical growth.
- Research pathways.
- Startup scaling.
- Funding.
- Hiring.
- Team building.
- Branding.
- GTM.
- Business operations.
- Leadership.
- AI adoption.
- Compliance.
- Manufacturing.
- Burnout.

### 4.3 Desired Outcome Families

The system must detect the user's desired outcome separately from the surface topic. Required outcome families include:

- Clarity.
- Promotion.
- Investors.
- Better team.
- Business growth.
- Career switch.
- Global opportunities.
- Direction.
- Confidence.
- Strategic sequencing.
- Session readiness.

Outcome detection is more important than keyword detection.

## 5. Core User Experience

### 5.1 Required Conversation Arc

The required conversation arc is:

1. Intent Discovery.
2. Emotional Context Detection.
3. Reflection and Mini-Clarity.
4. Micro-Consent Progression.
5. Mini Framework / Direction.
6. Expert Elevation.
7. Session Readiness.
8. Post-Session Continuity.

The system must not jump directly from the first user message to expert cards unless the user has already supplied enough intent, outcome, stage, emotional context, and practical constraints to make expert elevation feel earned and relevant.

### 5.2 Required Psychological Progression

The conversation must create the following progression:

| Stage | User should feel |
| --- | --- |
| 1 | I feel understood |
| 2 | This platform understands my situation |
| 3 | This problem may actually be solvable |
| 4 | This expert seems genuinely relevant |
| 5 | Taking this session may help me move forward |

### 5.3 Compact Depth

The system must produce compact depth:

- Short emotional insight.
- Small psychological unlock.
- Controlled interaction.
- Progressive involvement.
- Expert elevation only after context and value.

The system must not produce:

- Long essays.
- Therapy-style analysis.
- Advice dumps.
- Over-explained frameworks.
- Generic motivational content.
- Robotic flow text.
- Fake empathy.
- Scripted persuasion.

### 5.4 Response Length Targets

The system must support three response-depth modes.

| Mode | Target output | Use case |
| --- | --- | --- |
| Light Mode | 80-180 tokens | Homepage visitors, casual users, low-intent discovery |
| Standard Mode | 250-550 total conversation tokens over relevant exchange window | Most active clarity conversations |
| Deep Clarity Mode | 700-1200 total conversation tokens over relevant exchange window | High engagement, high emotional seriousness, high conversion probability, repeated interaction |

The system must use high-signal, low-token design. The objective is maximum trust per token, not minimum token usage.

### 5.5 Conversation Length

The ideal path to expert recommendation is 7-9 meaningful exchanges.

The system must avoid:

- Endless counseling.
- 25-message decision loops.
- Repeated clarifying questions with no progress.
- Premature expert recommendations.
- Recommending large expert lists.

## 6. Response Composition Requirements

### 6.1 Allowed Response Layers

Every decision-clarity response must be composed from only these layers:

| Layer | Purpose |
| --- | --- |
| Reflection | Shows the user is understood |
| Clarification | Sharpens intent or missing context |
| Insight | Creates mini value |
| Direction | Creates movement |
| Transition | Moves naturally toward expert alignment |

A response does not need to contain all layers. It must contain only the layers that are justified by the current user state.

### 6.2 Forbidden Response Behavior

The system must not:

- Abruptly say the equivalent of showing experts without context.
- Use generic chatbot replies as the main experience.
- Pretend to understand more than the user has shared.
- Generate emotionally manipulative text.
- Use artificial positivity.
- Use scripted empathy.
- Over-explain.
- Philosophize excessively.
- Generate large frameworks without consent.
- Present experts as a sales push.
- Present 10+ options or marketplace-style browsing as an AI recommendation.

### 6.3 Micro-Consent

Before presenting a mini-framework or deeper guidance, the system should often request micro-consent.

Micro-consent exists to create:

- User involvement.
- Emotional safety.
- Self-progression.
- Higher conversion readiness.

The system must treat micro-consent as a conversational design principle, not as one hardcoded phrase. The assistant may ask whether the user wants to structure the decision, walk through a framework, compare paths, or clarify options. The exact wording must be dynamically generated from context.

### 6.4 Pacing And Progressive Reveal

The UI and backend must support progressive reveal where appropriate:

- Short reflection first.
- Pause or thinking state where the user needs cognitive breathing space.
- Mini-framework after consent.
- Expert elevation after the framework or directional clarity.
- Session readiness guidance after expert introduction.

The implementation must not rely on fixed artificial delays as business logic. Delays or thinking states are UI pacing tools and must be controlled by product rules.

## 7. Modular AI Architecture Requirements

The implementation must use a layered AI architecture. It must not use one giant prompt as the entire intelligence layer.

### 7.1 Required Modules

| Module | Purpose | Output |
| --- | --- | --- |
| Intent Detection | Identify domain and topic family | Intent labels, confidence, evidence |
| Outcome Detection | Identify what the user wants to achieve | Outcome labels, confidence, evidence |
| User Stage Detection | Identify persona/stage | Stage label, confidence, evidence |
| Emotional Analysis | Detect emotional state and seriousness | Emotional state, urgency, tone guidance |
| Micro-Counselling Engine | Produce compact strategic mini-clarity | Insight candidates, tone constraints |
| Roadmap Engine | Create direction and sequencing before expert routing | Mini direction, pathway, next-step framing |
| Content Injection Engine | Provide small frameworks, checklists, maps, playbooks, or insights when useful | Content block candidates |
| Expert Matching Engine | Recommend 2-3 experts only when earned | Ranked experts and explanation |
| Session Readiness Engine | Prepare user for expert session | Goals, confusion points, priorities, discussion areas |
| Continuity Engine | Preserve and reuse user context across future interactions | Memory summary, goals, progress, next steps |

### 7.2 Module Independence

Each module must have:

- A clear input contract.
- A clear output contract.
- Confidence scoring where applicable.
- Evidence references to user messages or platform data where applicable.
- Failure behavior.
- Observability trace output.

No module may silently invent user facts.

### 7.3 LLM And Deterministic Responsibility Split

The LLM may be used for:

- Understanding user language.
- Extracting nuanced intent, outcome, stage, emotional state.
- Generating compact reflection and insight.
- Creating context-specific mini-frameworks.
- Generating contextual expert-introduction text.
- Summarizing continuity memory.

The deterministic backend must own:

- Expert eligibility.
- Booking availability.
- Subscription and membership rules.
- Admin boost rules.
- Controlled allocation rules.
- Score calculation.
- Exposure balancing.
- Impression and click accounting.
- Event logging.
- Policy enforcement.
- Safety and compliance gates.

The LLM must not be the source of truth for business rules.

## 8. Conversation State Requirements

### 8.1 Required User Signal Model

The system must maintain structured user signals for each meaningful conversation:

| Signal | Description |
| --- | --- |
| Intent | What domain/problem the user is discussing |
| Desired outcome | What result the user wants |
| User stage | Student, founder, mid-career professional, etc. |
| Emotional state | Confused, overwhelmed, ambitious, urgent, stuck, exploring, burned out, etc. |
| Urgency | How time-sensitive the decision appears |
| Geography | Relevant country, city, relocation target, market context |
| Industry | Relevant professional or business domain |
| Experience stage | Years, seniority, business stage, academic stage |
| Practical constraints | Budget, time, location, eligibility, family, skills, market barriers |
| Conversation signals | Clarifications, consent, repeated concern, engagement depth |
| Behavioral engagement | Clicks, bookings, returns, completions, reviews, repeat sessions |

### 8.2 Memory And Continuity

The system must preserve continuity so the user does not need to restart their story.

At minimum, it must maintain:

- Current goal or decision area.
- Current uncertainty.
- Important constraints.
- Prior mini-framework or advice given.
- Experts shown.
- Expert clicked/booked.
- Session readiness notes.
- Post-session action points.
- User progress and revised priorities.

Memory must distinguish between:

- User-stated facts.
- AI-inferred signals.
- Behavioral events.
- Session-derived outcomes.
- Admin/system metadata.

The implementation must preserve provenance for every important memory item.

### 8.3 Conversation Completion States

The system must represent these major conversation states:

| State | Meaning |
| --- | --- |
| Discovery | User intent and context are still being understood |
| Clarifying | One or two key missing signals are being requested |
| Mini-Clarity | AI is providing compact strategic insight |
| Micro-Consent | AI is asking permission to structure the decision further |
| Framework | AI is providing a concise decision framework |
| Expert Elevation | AI is introducing why experts may help |
| Expert Recommendation | 2-3 experts are shown with contextual rationale |
| Session Readiness | AI helps organize the upcoming session |
| Continuity | AI helps after the session or on return |

State names may vary in code, but the implementation must support the above conceptual states.

## 9. Expert Matching Product Requirements

### 9.1 Matching Objective

The expert matching engine must find the most relevant expert while intelligently distributing opportunity within controlled business rules.

It is not pure semantic search.

It must simultaneously operate as:

- Relevance engine.
- Allocation engine.
- Monetization engine.
- Trust engine.
- Supply retention engine.

### 9.2 Recommendation Quantity

The system must recommend 2-3 experts maximum in a normal recommendation response.

The system must not show:

- 10+ options.
- Endless scrolling lists as an AI recommendation.
- Generic marketplace browse results as the primary AI answer.

### 9.3 User-Side Matching Inputs

The matching engine must use:

- Intent.
- Desired outcome.
- Emotional state.
- Urgency.
- Goals.
- Geography.
- Experience stage.
- Industry.
- Conversation signals.
- Behavioral engagement.

### 9.4 Expert-Side Matching Inputs

Every expert profile must support public, AI intelligence, business, and allocation data.

#### Public Expert Data

Required fields:

- Name.
- Bio.
- Industry.
- Expertise.
- Keywords.
- Years of experience.
- Languages.
- Location.
- Call pricing.
- Availability.

#### AI Intelligence Metadata

Required fields:

- Intent tags.
- Outcome tags.
- Industry tags.
- Persona fit.
- Conversion rate.
- User satisfaction score.
- Engagement score.
- Response time.
- Video call completion rate.
- Repeat bookings.
- Content authority score.
- AI confidence score.

#### Business Layer Metadata

Required fields:

- Membership tier: Free, Premium, Featured, Sponsored, Enterprise Partner, Launch Booster, Seasonal Promotion, or equivalent platform-specific categories.
- Active promotion state.
- Promotion category targeting.
- Promotion start and expiry.
- Admin reason and audit metadata.

#### Allocation Variables

Required fields:

- Impression count.
- Click count.
- Calls booked.
- Completed calls.
- Revenue generated.
- Last shown timestamp.
- Frequency score.
- Exposure balance score.

### 9.5 Required Scoring Formula

The final score must combine these layers:

| Layer | Required weight |
| --- | --- |
| Intent Match | 30% |
| Outcome Match | 20% |
| Persona Match | 10% |
| Expertise Relevance | 15% |
| Conversion Probability | 10% |
| Admin Priority | 10% |
| Exposure Balancing | 5% |

The implementation may internally normalize sub-scores, but the externally documented score breakdown must preserve these seven top-level weighted layers.

### 9.6 Scoring Layer Definitions

#### Intent Match: 30%

Measures how closely the expert's validated expertise aligns with the user's detected intent.

Inputs may include:

- Expert intent tags.
- Expertise text.
- Content authority.
- Historical booking outcomes for similar intent.
- Semantic similarity between user problem and expert specialization.

#### Outcome Match: 20%

Measures whether the expert is likely to help produce the user's desired outcome.

Inputs may include:

- Expert outcome tags.
- Verified outcomes.
- Session completion feedback.
- Repeat bookings tied to outcome type.
- Review sentiment around outcomes.

#### Persona Match: 10%

Measures fit between expert and user stage/persona.

Inputs may include:

- Student vs founder vs corporate leader fit.
- Geography/language compatibility.
- Stage-specific experience.
- Communication style match when available.

#### Expertise Relevance: 15%

Measures technical or domain relevance beyond broad intent.

Inputs may include:

- Expertise depth.
- Years of experience.
- Specialization granularity.
- Keyword trust score.
- Anti-gaming normalization.

#### Conversion Probability: 10%

Measures likelihood that this expert recommendation will create a useful user action.

Inputs may include:

- Click-through rate.
- Booking conversion rate.
- Completion rate.
- Response time.
- Satisfaction score.
- Repeat session probability.

#### Admin Priority: 10%

Applies controlled business priority without blindly forcing promoted experts.

Inputs may include:

- Featured status.
- Membership priority.
- Sponsored campaign targeting.
- Launch booster status.
- Seasonal promotion.
- Admin category priority.

#### Exposure Balancing: 5%

Prevents the same experts from monopolizing traffic.

Inputs may include:

- Recent impressions.
- Frequency score.
- Exposure fatigue decay.
- Category supply health.
- Emerging expert discovery rules.

### 9.7 Recommendation Slot Strategy

A normal three-slot recommendation must follow this structure:

| Slot | Purpose |
| --- | --- |
| Slot 1 | Best Match: highest relevance to user situation |
| Slot 2 | High Conversion / High Trust: strong performer likely to help |
| Slot 3 | Discovery / Fairness / Featured: emerging, fairly rotated, or controlled promotion candidate |

The implementation must avoid simply sorting by final score and taking the top three if doing so harms marketplace fairness or controlled distribution.

### 9.8 Controlled Promotion

Promoted experts must not be blindly forced into every relevant result.

Required rules:

- Promotion must be category-relevant.
- Promotion must have an expiry or campaign boundary.
- Promotion must have admin audit metadata.
- Promotion must have a frequency cap.
- Promotion must not override hard eligibility failures.
- Promotion must not make irrelevant experts appear relevant.
- Promotion must be constrained enough that users do not detect manipulation.

The source documents give a reference example of guaranteed inclusion in 18% of relevant searches rather than 100%. The implementation does not have to hardcode 18%, but it must support percentage-based controlled inclusion.

### 9.9 Quality Decay

The system must reduce visibility for experts who show poor or declining performance.

Required penalties:

- Inactivity penalty.
- Cancellation penalty.
- Response delay penalty.
- Weak call feedback penalty.
- Poor completion penalty.
- Low satisfaction penalty.

### 9.10 Anti-Gaming

The system must defend against expert keyword manipulation.

Required controls:

- Admin keyword approval or moderation path.
- Keyword normalization.
- Spam keyword detection.
- Weighted keyword trust scoring.
- Lower trust for unverified keyword stuffing.
- Stronger weight for outcomes, reviews, sessions, content authority, and verified evidence than raw self-declared keywords.

## 10. Expert Elevation UX Requirements

### 10.1 Expert Introduction

The AI must introduce experts contextually and naturally.

The assistant must explain why expert guidance may help based on the user's shared situation before showing expert cards.

The implementation must avoid abrupt marketplace language.

### 10.2 Expert Cards

Each expert card must include:

- Expert name.
- Relevant specialization.
- Contextual reason this expert is recommended.
- Fit dimensions tied to user intent/outcome/stage.
- Trust indicators where available.
- Availability or booking path when available.
- Pricing if platform policy exposes it.

Each expert card must avoid:

- Generic profile summaries unrelated to user context.
- Unexplained ranking.
- Overstated claims.
- Unsupported outcome promises.

### 10.3 Recommendation Explanation

The system must provide a short contextual recommendation rationale.

The rationale should communicate:

- What the AI understood.
- Why human perspective may now be useful.
- Which decision area the experts can help clarify.

The rationale must not imply guaranteed outcomes.

## 11. Content Injection Requirements

Before expert recommendation, the AI may provide compact content that increases trust and clarity.

Allowed content types:

- Mini frameworks.
- Checklists.
- Career maps.
- Founder playbooks.
- Strategic insights.
- Directional whitepapers.
- Decision comparison structures.

Content injection must be:

- Short.
- Contextual.
- Relevant to the user's decision.
- Presented after appropriate discovery or micro-consent.
- Used to build authority before conversion.

Content injection must not become a full course, long report, or generic advice dump in the initial conversation path.

## 12. Session Readiness Requirements

Before booking or after showing experts, Infinity AI must help the user organize session readiness.

Required readiness fields:

- User goals.
- Confusion points.
- Expectations.
- Priorities.
- Discussion areas.
- Relevant background context.
- Questions to ask the expert.

The purpose is to increase:

- Session quality.
- Expert effectiveness.
- User satisfaction.
- Repeat engagement.

The system must support passing a structured readiness summary to the booking/session layer when platform policy allows.

## 13. Post-Session Continuity Requirements

After a session, Infinity AI must help the user continue without restarting their story.

Required post-session capabilities:

- Organize action points.
- Refine priorities.
- Track progress.
- Revisit goals.
- Identify next steps.
- Decide whether additional guidance may be useful.

The first implementation must establish the data and memory foundation for this, even if full post-session workflows are implemented later.

## 14. Learning And Optimization Requirements

### 14.1 Behavioral Signals To Track

The system must track:

| Signal | Meaning |
| --- | --- |
| Expert profile click | Curiosity |
| Session booking | Trust |
| Session completion | Commitment |
| Repeat booking | Satisfaction |
| Long call duration | Engagement |
| Positive feedback | Relevance |
| User return rate | Emotional success |
| Review sentiment | Quality and outcome evidence |
| Industry success pattern | Expert-category performance |

### 14.2 Optimization Direction

Over time, the system should optimize toward:

- High-outcome expert matching.
- User confidence increase.
- Session completion quality.
- Repeat engagement.
- Marketplace fairness.
- Expert quality.

The system must not optimize only for click-through rate if it harms user outcomes or marketplace trust.

## 15. Metrics Requirements

### 15.1 North Star Metrics

Required metrics:

- Time to clarity.
- Expert conversion rate.
- Session completion rate.
- Repeat sessions.
- User satisfaction.
- Emotional confidence shift.
- Session outcome quality.
- User retention.
- Expert performance quality.

### 15.2 Metrics To Avoid As Success Measures

The following must not be treated as primary success metrics:

- Total messages.
- Longest conversation.
- Token volume.
- Number of experts shown.
- Number of generic answers produced.

## 16. Admin Control Requirements

The system must support controlled expert distribution.

### 16.1 Required Admin Controls

Admins must be able to configure:

- Featured experts.
- Membership priority.
- Boosted visibility.
- Controlled recommendation frequency.
- Campaign-driven recommendations.
- Category-level prioritization.
- Session quota balancing.
- Promotion expiry.
- Promotion scope.
- Promotion reason.
- Audit history.

### 16.2 Admin Control Guardrails

Admin controls must not:

- Override expert eligibility.
- Force irrelevant experts into recommendations.
- Create permanent monopoly for promoted experts.
- Hide recommendation rationale from internal observability.
- Make the product feel manipulated to users.

## 17. Data Requirements

### 17.1 User Data

The system must store and update:

- User intent signals.
- User outcome signals.
- User stage.
- Emotional state.
- Urgency.
- Goals.
- Geography.
- Industry.
- Constraints.
- Conversation summaries.
- Consent state.
- Mini-frameworks shown.
- Experts recommended.
- Experts clicked/booked.
- Session readiness notes.
- Post-session continuity notes.

### 17.2 Expert Data

The system must store and update:

- Public expert profile data.
- AI intelligence metadata.
- Business layer metadata.
- Allocation variables.
- Behavioral performance metrics.
- Quality decay indicators.
- Anti-gaming keyword trust indicators.

### 17.3 Event Data

The system must store:

- Recommendation run.
- Expert candidates considered.
- Score breakdown per candidate.
- Experts shown.
- Impressions.
- Clicks.
- Bookings.
- Completions.
- Repeat bookings.
- Reviews and feedback.
- Admin boost application.
- Exposure balancing state.

### 17.4 Provenance

Every important system conclusion must preserve provenance:

- User message evidence.
- Expert profile evidence.
- Behavioral signal evidence.
- Admin rule evidence.
- Session outcome evidence.
- LLM inference metadata where applicable.

## 18. System Architecture Requirements

### 18.1 Recommended System Components

The system should use these conceptual components:

| Component | Responsibility |
| --- | --- |
| Conversation Orchestrator | Controls decision-clarity flow state |
| Signal Intelligence Layer | Extracts intent, outcome, stage, emotion, urgency, constraints |
| Response Strategy Layer | Chooses compact-depth response strategy |
| Content Injection Layer | Retrieves or generates mini-frameworks/checklists/maps/playbooks |
| Expert Candidate Retrieval | Retrieves eligible candidates from platform data/search/vector index |
| Expert Ranking Engine | Applies weighted business-aware scoring |
| Allocation Engine | Applies exposure balancing, fatigue decay, and promotion constraints |
| Session Readiness Layer | Produces structured preparation notes |
| Continuity Memory Layer | Stores and retrieves user journey context |
| Analytics/Event Layer | Tracks behavior and outcomes |
| Admin Control Layer | Applies controlled business rules |
| Observability Layer | Traces prompts, model calls, scoring, decisions, and events |

### 18.2 Technology Direction

The source documents recommend:

- Vector search layer such as Pinecone, Weaviate, or Qdrant.
- Embeddings such as OpenAI embeddings, Voyage AI, or Cohere.
- Custom backend ranking engine.
- Postgres for relational business control.
- Analytics through Mixpanel, PostHog, or equivalent.

The implementation must respect the principle:

- LLM = understanding.
- Backend = ranking.
- Postgres = business control and relational truth.
- Vector search = candidate retrieval, not final decision-making.

## 19. Policy And Safety Requirements

### 19.1 Platform Policy Ownership

The platform must own:

- Authentication.
- User identity.
- Expert eligibility.
- Booking rights.
- Subscription rights.
- Payment rules.
- Admin permissions.
- Session creation.
- Event accounting.

The AI service may request policy context, but it must not infer platform rights from user text.

### 19.2 Safety Boundaries

The assistant must avoid:

- Therapy claims.
- Guaranteed career, funding, immigration, business, or educational outcomes.
- Manipulative persuasion.
- Fake urgency.
- Exploitative emotional pressure.
- Unsupported claims about experts.
- Hidden promotion that violates internal controls.

### 19.3 Unsupported Requests

If a user request is outside the decision-clarity and expert-routing product scope, the assistant should briefly respond and guide the user back toward supported decision, resource, or expert-routing use cases. This must be dynamic and context-aware, not hardcoded phrase matching.

## 20. User-Facing Scenarios Required By Source Documents

The system must support the following scenario families with the same product logic shown in the source documents.

### 20.1 Stuck Mid-Career Professional

Required behavior:

- Detect career stagnation and uncertainty.
- Distinguish skill problem vs strategic clarity problem.
- Use compact insight around growth, positioning, company fit, or pivot decision.
- Ask a relevant clarification.
- Offer a mini-framework through micro-consent.
- Elevate experts around career acceleration, leadership positioning, strategic transition, or international growth when appropriate.
- Prepare session context around unclear decisions and priority areas.

### 20.2 Work Abroad Aspiration

Required behavior:

- Detect work-abroad intent.
- Identify field, market alignment, positioning gaps, and country alignment.
- Provide compact insight that international opportunity is not only about applying harder.
- Offer a framework around direct hiring, internal transfer, or strategic repositioning.
- Elevate experts around international positioning, relocation pathways, global hiring readiness, or profile optimization.

### 20.3 Student Career Confusion

Required behavior:

- Detect student uncertainty.
- Identify interests, strengths, future opportunity, and work fit.
- Avoid overwhelming the student with many career paths.
- Offer a framework around strength alignment, market direction, and lifestyle fit.
- Elevate experts around career clarity, communication/creative pathways, or future planning when appropriate.

### 20.4 Founder Seeking Funding

Required behavior:

- Detect fundraising and startup scaling context.
- Identify stage and traction maturity.
- Provide compact insight around problem clarity, market timing, traction consistency, founder conviction, and growth repeatability.
- Offer a framework around market validation, growth efficiency, and founder clarity.
- Elevate experts around fundraising strategy, GTM clarity, investor positioning, and scaling direction.

### 20.5 SME Owner Struggling To Scale

Required behavior:

- Detect slowed growth and business-scaling bottleneck.
- Identify sales, expansion, positioning, operations, and founder dependency issues.
- Offer a framework around founder-led growth, structured growth, and scalable growth.
- Elevate experts around sales growth, GTM systems, operational scaling, or business expansion.

### 20.6 Parent Exploring Alternative Careers For Child

Required behavior:

- Detect parent-child career decision context.
- Avoid forcing traditional paths.
- Identify student strengths, employability, interest sustainability, and opportunity realism.
- Offer a framework around interest, capability, and opportunity.
- Elevate experts around creative career pathways, media/digital careers, student strengths, and long-term planning.

### 20.7 Student Study Abroad Pathway

Required behavior:

- Detect study-abroad decision uncertainty.
- Identify country selection, affordability, career direction, and decision validity.
- Provide compact insight around education value, market demand, university quality, skill positioning, and long-term fit.
- Offer a framework around education value, career opportunity, and long-term fit.
- Elevate experts around study-abroad planning, university selection, global employability, and long-term career outcomes.

### 20.8 Corporate AI Adoption

Required behavior:

- Detect AI adoption and organizational transformation context.
- Identify priority areas such as HR, operations, governance, workforce adaptation, or workflow redesign.
- Provide compact insight that AI adoption is business transformation, not just software implementation.
- Offer a framework around experimentation, integration, and transformation.
- Elevate experts around enterprise AI adoption, workflow redesign, governance, and organizational transformation.

## 21. Output Contracts

### 21.1 Conversation Response Contract

Each assistant response must expose structured metadata internally:

- Conversation state.
- Detected intent.
- Desired outcome.
- User stage.
- Emotional state.
- Urgency.
- Response depth mode.
- Response layers used.
- Whether micro-consent was requested.
- Whether a framework was provided.
- Whether expert elevation was attempted.
- Whether experts were shown.
- Session readiness fields if available.
- Memory updates.
- Evidence references.

The user-facing response may be natural language and UI blocks, but internal structure must remain available for tracing and learning.

### 21.2 Expert Recommendation Contract

Each recommendation run must expose:

- Recommendation run ID.
- User signal snapshot.
- Candidate pool.
- Eligibility filter results.
- Score breakdown for each candidate.
- Allocation adjustments.
- Admin priority adjustments.
- Quality decay adjustments.
- Final selected slots.
- User-facing explanation.
- Event tracking IDs.

## 22. Observability Requirements

The system must make the following observable for every meaningful AI turn:

- Input message.
- Conversation state before and after.
- User signals extracted.
- Model calls and prompt versions.
- Token usage.
- Latency.
- Retrieval queries.
- Candidates retrieved.
- Candidate score breakdown.
- Admin rules applied.
- Experts shown.
- Events emitted.
- Memory updates.
- Failure reason if any.

The system must support diagnosing why a user saw a specific expert.

## 23. Acceptance Criteria

### 23.1 Product Acceptance

The implementation is acceptable only if:

- It behaves as decision-clarity infrastructure, not a generic chatbot.
- It follows the arc: insight, reflection, micro-consent, mini-framework, emotional relief, expert elevation.
- It gives compact, useful clarity before recommending experts.
- It avoids abrupt expert card display.
- It recommends no more than 2-3 experts in normal recommendation mode.
- It tracks and uses intent, outcome, stage, emotional state, urgency, and constraints.
- It uses backend scoring for expert ranking, not pure LLM selection.
- It applies the seven-layer scoring model with the required weights.
- It supports controlled expert distribution and admin rules.
- It supports exposure balancing and quality decay.
- It supports anti-gaming controls for expert keywords.
- It supports session readiness preparation.
- It supports continuity memory foundation.
- It records behavioral signals for learning.

### 23.2 UX Acceptance

The implementation is acceptable only if users progressively feel:

- Understood.
- Safer in the decision.
- Clearer than before.
- Not sold to.
- Guided toward relevant human help.

The implementation is unacceptable if users feel:

- They are talking to a generic chatbot.
- They are being pushed into booking.
- The AI is using fake empathy.
- Expert recommendations are random or sales-driven.
- The response is long, robotic, or generic.

### 23.3 Expert Matching Acceptance

The expert matching implementation is acceptable only if:

- Every selected expert has a reason tied to user signals.
- Every score has a visible breakdown.
- Promotion is controlled and capped.
- Exposure fatigue affects ranking.
- Poor-quality experts lose visibility.
- Keyword-stuffed profiles do not dominate.
- The final selection balances relevance, trust, conversion, fairness, and business rules.

## 24. Explicit Non-Goals For This Version

This PRD does not authorize implementation of:

- A broad personal life companion.
- Generic free-form chatbot entertainment.
- Fully autonomous external research agent behavior.
- Acting on behalf of the user outside platform workflows.
- Replacing mentors or experts with AI consulting.
- Therapy, medical, legal, financial, or immigration advice as a substitute for professionals.
- Unlimited conversation memory without provenance or controls.
- A generic marketplace search wrapper.
- Pure semantic search ranking.
- Expert recommendations without business-aware allocation.

## 25. Implementation Guidance

### 25.1 Required Engineering Principles

The implementation must be:

- Modular.
- Observable.
- Policy-aware.
- Business-rule controlled.
- LLM-assisted, not LLM-controlled.
- Structured-output driven where AI decisions are needed.
- Deterministic where platform policy or ranking rules are needed.
- Extensible for future post-session and outcome-learning layers.

### 25.2 Required Implementation Order

Recommended implementation order:

1. Data model for user signals, expert metadata, behavioral events, admin controls, allocation metrics, and recommendation runs.
2. Conversation orchestrator with decision-clarity state model.
3. Signal intelligence modules for intent, outcome, stage, emotion, urgency, and constraints.
4. Compact-depth response strategy and micro-consent handling.
5. Mini-framework/content injection layer.
6. Expert candidate retrieval.
7. Expert scoring engine with required weighted layers.
8. Allocation engine with exposure balancing and admin controls.
9. Expert elevation UI contract.
10. Session readiness summary generation.
11. Continuity memory foundation.
12. Observability and analytics.

### 25.3 Implementation Must Not

The implementation must not:

- Hardcode specific user utterance handling as the primary intelligence system.
- Use a single giant prompt as the architecture.
- Let the LLM decide subscriptions, booking rights, or final business ranking.
- Use raw semantic similarity as final matching.
- Introduce expert cards before trust-building context.
- Add unrelated agent features not present in the three source documents.

## 26. Open Decisions Before Build

The following must be decided before implementation starts:

| Decision | Required owner | Notes |
| --- | --- | --- |
| Vector store choice | Engineering/Product | Source docs allow Pinecone, Weaviate, Qdrant; existing platform constraints should decide |
| Embedding provider | Engineering/Product | Source docs allow OpenAI, Voyage, Cohere |
| Analytics tool | Engineering/Product | Source docs suggest Mixpanel or PostHog |
| Admin boost policy caps | Product/Admin | Must support percentage-based controlled promotion |
| Expert metadata completion process | Product/Ops | Expert AI metadata cannot be empty if ranking must work |
| Review/outcome capture process | Product/Ops | Needed for quality decay and outcome tracking |
| Session readiness handoff UX | Product/Design | Must define how readiness notes appear before booking/session |

## 27. Final Product Standard

The system succeeds only if it feels like trusted intelligent human-routing infrastructure.

It fails if it feels like:

- ChatGPT plus search.
- A scripted chatbot.
- A sales funnel pretending to be emotional intelligence.
- A generic expert marketplace.
- A recommendation list without earned context.

The moat is not conversation. The moat is trusted intent-to-human routing, controlled marketplace allocation, business-aware ranking, ecosystem balancing, and outcome optimization.

## 28. Requirement Language

This PRD uses the following requirement language:

| Term | Meaning |
| --- | --- |
| Must | Required for acceptance; implementation is incomplete without it |
| Must not | Prohibited; implementation fails acceptance if present |
| Should | Strongly expected unless a documented product/engineering reason exists |
| May | Optional implementation detail that must not violate required behavior |

## 29. Functional Requirement Matrix

### 29.1 Product Identity Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| PI-001 | The system must position itself internally as decision-clarity and human-routing infrastructure | System architecture, prompts, UI copy, and telemetry use decision-clarity concepts rather than generic chatbot concepts |
| PI-002 | The system must not optimize for generic conversation length | Product metrics and orchestration prioritize clarity progression and expert readiness, not message count |
| PI-003 | The system must not behave as a generic search interface | Recommendations are preceded by context understanding, mini-clarity, and rationale |
| PI-004 | The system must not behave as a generic AI mentor replacing experts | The AI creates clarity and routes to humans; it does not present itself as the final expert authority |

### 29.2 Conversation Intelligence Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| CI-001 | The system must extract user intent | Each meaningful conversation has intent label, confidence, and evidence |
| CI-002 | The system must extract desired outcome separately from intent | Outcome can differ from topic and is visible in internal state |
| CI-003 | The system must detect user stage | Stage is captured or intentionally marked unknown with evidence |
| CI-004 | The system must detect emotional state | Emotional state influences tone, pacing, depth, and expert selection |
| CI-005 | The system must detect urgency | Urgency influences depth and recommendation timing |
| CI-006 | The system must detect practical constraints | Geography, budget, timing, role, industry, stage, and other constraints are structured when present |
| CI-007 | The system must preserve evidence for extracted signals | Signals reference user statements or platform events |
| CI-008 | The system must not invent missing user facts | Unknown fields remain unknown until inferred with low confidence or directly provided |

### 29.3 Response Strategy Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| RS-001 | The system must use compact-depth responses | Responses are concise, strategic, and contextual |
| RS-002 | The system must use only allowed response layers for decision-clarity turns | Internal response metadata lists reflection, clarification, insight, direction, and/or transition |
| RS-003 | The system must avoid advice dumps | Long generic frameworks are not emitted before consent or sufficient context |
| RS-004 | The system must request micro-consent before deeper frameworks when appropriate | User is invited into the next step instead of being pushed |
| RS-005 | The system must generate micro-consent dynamically | Wording is context-specific, not phrase-matched or fixed |
| RS-006 | The system must support progressive reveal | UI/backend can separate reflection, framework, expert elevation, and readiness |
| RS-007 | The system must not use fake empathy | Responses stay grounded in user-provided context |
| RS-008 | The system must not sound salesy | Expert routing is framed around decision usefulness, not booking pressure |

### 29.4 Mini-Framework Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| MF-001 | The system must provide small strategic frameworks when useful | Frameworks are short and tied to user intent/outcome |
| MF-002 | Frameworks must reduce uncertainty | Framework output helps the user compare paths, sequence decisions, or identify next steps |
| MF-003 | Frameworks must not become full consulting reports | Initial framework remains compact |
| MF-004 | Frameworks must prepare expert elevation | Framework naturally explains why human expertise may help next |

### 29.5 Expert Elevation Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| EE-001 | The system must not abruptly show expert cards | Expert cards appear after contextual explanation unless user context is already sufficient |
| EE-002 | The system must explain why expert help is relevant | Expert elevation text is tied to user signals |
| EE-003 | The system must recommend 2-3 experts maximum in normal mode | Normal recommendation response never shows more than three experts |
| EE-004 | The system must not present recommendations as generic marketplace browsing | Cards are contextual and ranked by system logic |
| EE-005 | The system must prepare the user for the session | Readiness notes or discussion areas are generated after expert elevation |

### 29.6 Matching Engine Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| ME-001 | Matching must use multi-layer scoring | Score breakdown includes all required layers |
| ME-002 | Intent Match must contribute 30% | Score formula preserves required top-level weight |
| ME-003 | Outcome Match must contribute 20% | Score formula preserves required top-level weight |
| ME-004 | Persona Match must contribute 10% | Score formula preserves required top-level weight |
| ME-005 | Expertise Relevance must contribute 15% | Score formula preserves required top-level weight |
| ME-006 | Conversion Probability must contribute 10% | Score formula preserves required top-level weight |
| ME-007 | Admin Priority must contribute 10% | Score formula preserves required top-level weight |
| ME-008 | Exposure Balancing must contribute 5% | Score formula preserves required top-level weight |
| ME-009 | Matching must not rely purely on LLM judgment | Backend ranking produces final ranking |
| ME-010 | Matching must not rely purely on semantic similarity | Semantic search is candidate retrieval only |
| ME-011 | Matching must use recommendation slots | Slot 1 best match, slot 2 high trust/conversion, slot 3 discovery/fairness/featured |

### 29.7 Allocation And Marketplace Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| AM-001 | The system must prevent the same experts from monopolizing traffic | Exposure fatigue and frequency controls affect ranking |
| AM-002 | The system must support controlled promotions | Admin boosts are scoped, capped, auditable, and expiring |
| AM-003 | The system must not blindly force promoted experts | Promoted experts must still be relevant and eligible |
| AM-004 | The system must support membership priority | Membership tier can influence admin priority within guardrails |
| AM-005 | The system must support campaign-driven recommendations | Campaigns can target categories and time windows |
| AM-006 | The system must support session quota balancing | Allocation can account for expert/session capacity |
| AM-007 | The system must support emerging expert discovery | Discovery slot can include qualified underexposed experts |

### 29.8 Quality And Anti-Gaming Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| QA-001 | Expert quality must affect visibility | Poor response, cancellations, inactivity, or weak feedback lower ranking |
| QA-002 | Expert keyword stuffing must be penalized | Keyword trust score limits raw self-declared keyword influence |
| QA-003 | Expert keywords must be normalized | Equivalent terms are mapped consistently |
| QA-004 | Expert claims must be evidence-weighted | Verified outcomes and behavioral quality outrank raw profile claims |
| QA-005 | Inactive experts must decay | Inactivity penalty is visible in score breakdown |

### 29.9 Session Readiness Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| SR-001 | The system must create readiness notes before or around booking | Goals, confusion points, priorities, and discussion areas are structured |
| SR-002 | Readiness notes must be contextual | Notes reflect conversation signals, not generic templates |
| SR-003 | Readiness notes must be reusable | Platform can pass them into session or booking context |

### 29.10 Continuity Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| CT-001 | The system must maintain user journey context | Returning users do not need to restart their story |
| CT-002 | The system must distinguish fact types | User facts, AI inferences, platform events, and session outcomes are separate |
| CT-003 | Memory must preserve provenance | Important memory has source and timestamp |
| CT-004 | Post-session state must support action tracking | Action points, priorities, progress, and next steps can be stored |

### 29.11 Observability Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| OB-001 | Every meaningful turn must be traceable | Operators can inspect state, signals, model calls, and decisions |
| OB-002 | Every recommendation must be explainable internally | Candidate pool, score breakdown, admin rules, and selected slots are visible |
| OB-003 | Token usage and latency must be tracked | Cost and performance are observable per model call or module |
| OB-004 | Behavioral events must be tied to recommendation runs | Impressions, clicks, bookings, and completions can be attributed |

## 30. Minimum Viable Implementation Boundary

The minimum acceptable implementation must include:

- Conversation state model for the required decision-clarity arc.
- Structured extraction for intent, outcome, stage, emotional state, urgency, geography, industry, and constraints.
- Compact-depth response generation with micro-consent and mini-framework support.
- Candidate retrieval for experts using existing platform expert data plus search/vector retrieval.
- Multi-layer expert scoring with the required seven weighted layers.
- Recommendation slot selection for 2-3 experts.
- Admin priority and exposure balancing hooks.
- Event tracking for impressions, clicks, bookings, completions, reviews, and repeat bookings where platform data exists.
- Session readiness summary generation.
- Continuity memory foundation.
- Observability for all major decisions.

The minimum acceptable implementation may defer advanced optimization loops if the data does not yet exist, but it must design the data structures and interfaces so those loops can be activated without rewriting the architecture.

## 31. Data Availability And Degraded Operation

The system must handle incomplete platform data honestly.

If expert quality data is missing:

- The system must mark quality confidence as low.
- The system must not pretend quality is known.
- The system may use neutral priors until behavioral data exists.

If allocation data is missing:

- The system must initialize exposure metrics.
- The system must not ignore exposure balancing permanently.

If user context is sparse:

- The system must ask high-signal clarification questions.
- The system must not fabricate a precise recommendation rationale.

If no relevant expert is available:

- The system must not show weak or irrelevant experts.
- The system should provide compact clarity and explain that a stronger match is not currently available.
- The system may offer related content or a next-step structure if available and relevant.

## 32. Implementation Review Checklist

Before any implementation is accepted, reviewers must verify:

- The implementation does not recreate a generic chatbot.
- The implementation does not use hardcoded phrase matching as the primary intelligence layer.
- The implementation does not use a single giant prompt.
- The implementation does not let LLM output directly override business rules.
- The implementation has a structured signal model.
- The implementation has score breakdowns matching the required formula.
- The implementation has promotion and allocation guardrails.
- The implementation has expert quality decay hooks.
- The implementation has anti-gaming controls.
- The implementation has session readiness support.
- The implementation has continuity memory with provenance.
- The implementation has observability for model calls, scoring, and recommendations.
- The implementation stays within the three source documents.
