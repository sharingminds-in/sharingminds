# AI Chat Deflection — Technical Reference

## Overview

The AI chat (Aria) has two independent deflection mechanisms that redirect users toward mentor and content recommendations:

1. **Soft deflection** — LLM-level, topic enforcement via system prompt
2. **Hard deflection** — Server-level, session message limit via subscription policy

Both ultimately render the same deflection response on the client: a warm hand-off message plus forced `find_mentors` and `suggest_content` tool calls.

---

## Mechanism 1: Soft Deflection (LLM / System Prompt)

**Where:** `app/api/chat/route.ts` — `SYSTEM_PROMPT`

When a user sends an off-topic message (e.g. "What's the weather?"), the LLM itself handles the redirect. The system prompt explicitly instructs Aria:

> "Your domain is strictly mentorship, career guidance, professional growth, and study abroad. If a user asks an unrelated question, politely redirect them: 'That's a bit outside of what I can help with. My focus is on helping you with your career or educational goals. Shall we get back to that?'"

This is pure prompt engineering — no code logic involved. The LLM decides whether the message is off-topic and produces a redirect response in its natural reply. No tool calls are forced; the conversation continues.

---

## Mechanism 2: Hard Deflection (Session Message Limit)

**Where:** `app/api/chat/route.ts` → `lib/subscriptions/policy-runtime.ts`

When the user has sent at least N messages in the current chat session (where N is configured per subscription plan), the server skips the LLM entirely, returns a hard-coded deflection response, and forces mentor + content discovery.

### Flow

```
POST /api/chat
  │
  ├─ 1. Auth check (401 if not logged in)
  │
  ├─ 2. enforceFeature('ai.chat.access')
  │       Checks boolean plan feature AI_HELPER_CHAT_ACCESS
  │       → 403 if chat is not in the user's plan
  │
  ├─ 3. getFeaturePlanLimit('ai.chat.max_user_messages')
  │       Reads limit_count from subscriptionPlanFeatures for this user's plan
  │       Compares against history.filter(m => m.type === 'user').length
  │       → If session count >= plan limit: return deflection JSON (skip LLM)
  │
  └─ 4. Call LLM (Gemini 2.5 Flash via streamObject)
          Return streaming response
```

### Why `getFeaturePlanLimit` and not `enforceFeature`

`enforceFeature` tracks and compares **global usage** across all sessions in a billing period (via `subscriptionUsageTracking` in the DB). That caused deflection to persist across new chat sessions — once the limit was hit in one session, every new session was blocked too.

`getFeaturePlanLimit` reads only the **plan's configured `limit_count`** from `subscriptionPlanFeatures` without touching usage tracking. The count is then compared against the **session-local** `history` array sent by the client on every request. Since `history` is reset to `[]` when the user starts a new chat, the limit is inherently per-session.

### Deflection Response Shape

When the session limit is hit, the route returns `application/json` (not a stream):

```json
{
  "text": "<one of three randomised warm hand-off messages>",
  "tool_call": {
    "name": "find_mentors",
    "arguments": { "query": "<user's last message>" }
  },
  "content_tool_call": {
    "name": "suggest_content",
    "arguments": { "query": "<user's last message>" }
  }
}
```

The client detects this via the `Content-Type: application/json` header (vs `text/plain` for a normal stream) and triggers the mentor card and course suggestion UI.

---

## Mechanism 3: Subscription-Level Per-Message Quota (tRPC path)

**Where:** `lib/chatbot/server/message-service.ts` → `saveChatbotMessage`

This is a separate, independent limit that fires when **saving a user message to the DB** (before the AI is even called). It uses the `ai.chat.message` action which maps to the `AI_HELPER_MESSAGES_LIMIT` feature key — a different, globally-tracked quota intended for billing/plan enforcement across sessions.

When this limit is hit, `saveChatbotMessage` throws `AppHttpError(403, ...)`. The client's `handleSubmit` function catches this 403 and shows:

> "You've reached your chat limit! Let me find the best mentor matches for you instead. 🚀"

Then fetches mentors and content, and locks the chat input.

**This is distinct from the session-scoped limit above.** `ai.chat.message` and `ai.chat.max_user_messages` serve different purposes:

| Feature key | Action | Scope | Purpose |
|---|---|---|---|
| `ai_helper_messages_limit` | `ai.chat.message` | Global / billing period | Per-plan billing quota, tracks total messages across all sessions |
| `ai_chat_max_user_messages` | `ai.chat.max_user_messages` | Per chat session | UX cap, deflects user to mentors after N messages in one session |

---

## Subscription Policy Framework Integration

### Feature Keys

Defined in `lib/subscriptions/feature-keys.ts`:

```ts
AI_HELPER_CHAT_ACCESS: 'ai_helper_chat_access'       // Boolean — can user access chat at all?
AI_HELPER_MESSAGES_LIMIT: 'ai_helper_messages_limit' // Count — global per-period quota
AI_CHAT_MAX_USER_MESSAGES: 'ai_chat_max_user_messages' // Count — per-session UX cap
```

### Policy Actions

Defined in `lib/subscriptions/policies.ts`:

```ts
'ai.chat.access'           → AI_HELPER_CHAT_ACCESS,       metered: false
'ai.chat.message'          → AI_HELPER_MESSAGES_LIMIT,     metered: true, count
'ai.chat.max_user_messages'→ AI_CHAT_MAX_USER_MESSAGES,    metered: true, count
```

### Configuring the Session Limit

The session message cap is stored in the `subscriptionPlanFeatures` DB table under the `ai_chat_max_user_messages` feature key (`limit_count` column). Set it per plan — no code change required to adjust the threshold.

Example: set `limit_count = 10` on the free plan → users on free plans can send 10 messages per chat session before being deflected to mentor recommendations.

### `getFeaturePlanLimit` helper

Added to `lib/subscriptions/policy-runtime.ts`. Reads `limit_count` from the plan's feature set without performing any usage check or write:

```ts
export async function getFeaturePlanLimit(input: {
  action: SubscriptionPolicyAction;
  userId: string;
  context?: Partial<SubscriptionContext>;
}): Promise<number | null>
```

Returns `null` if the feature is not configured in the plan (in which case no session limit is applied).

---

## Client-Side Handling

**Where:** `components/landing/hero-section.tsx` — `simulateAiResponse`

The client distinguishes a deflection response from a normal streaming response by checking the `Content-Type` header:

- `text/plain` (or `text/event-stream`) → normal AI stream, parse incrementally
- `application/json` → deflection response, parse as JSON immediately

On detecting a deflection:
1. `isChatLimitReached` state is set to `true`
2. The textarea is disabled; placeholder changes to "Connect with a mentor to continue your journey"
3. The Send button is replaced with a "New Chat" button
4. `fetchMentorsFromApi` and `fetchContentFromApi` are called with the user's last message as the query
5. Mentor cards and course suggestions are rendered below the chat

A "New Chat" resets all state including `history`, so the next session starts fresh with a zero message count.

---

## File Reference

| File | Role |
|---|---|
| `app/api/chat/route.ts` | Route handler — auth, session limit check, LLM call |
| `lib/subscriptions/feature-keys.ts` | Feature key constants |
| `lib/subscriptions/policies.ts` | Action → feature key mapping and policy definitions |
| `lib/subscriptions/policy-runtime.ts` | `enforceFeature`, `getFeaturePlanLimit`, `consumeFeature` |
| `lib/subscriptions/enforcement.ts` | Core: `checkFeatureAccess`, `getPlanFeatures`, `trackFeatureUsage` |
| `lib/chatbot/server/message-service.ts` | tRPC DB save path — enforces `ai.chat.message` global quota |
| `lib/trpc/routers/chatbot.ts` | tRPC router for `chatbot.saveMessage` |
| `components/landing/hero-section.tsx` | Chat UI — deflection detection, mentor/content rendering |
