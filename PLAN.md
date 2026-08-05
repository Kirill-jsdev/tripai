# TripAI Backend — Implementation Plan

Source of truth for scope: `CLAUDE.md`. This plan breaks the project into
incremental, shippable steps. Each step should leave the app in a working
state and be testable via a `.http` file in `/api-tests`.

## Current state (as of this plan)

- Express + TypeScript app (`index.ts`) with a single `POST /chat` route.
- Request validated against `types/chat.ts` (`channel`, `travelAgentId`,
  `customerId`, `message`).
- `ai/agent.ts` defines one OpenAI Agents SDK `Agent` (`tripAgent`) with a
  personality prompt, no tools.
- Every request calls `run(tripAgent, message)` with **no conversation
  history** — each message is treated as brand new, and the response isn't
  persisted anywhere.
- No Supabase / database integration yet.
- No MCP servers or external APIs (flights, hotels) wired into the agent.
- No escalation-to-human logic.

## Step 1 — Supabase project & schema

- Create/confirm the Supabase project and add its URL + service key to
  `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- Design the schema:
  - `conversations` — id, `channel`, `travel_agent_id`, `customer_id`,
    unique on `(channel, travel_agent_id, customer_id)`, timestamps.
  - `messages` — id, `conversation_id` (FK), `role` (`user`/`assistant`),
    `content`, `created_at`.
- Write the SQL migration (Supabase SQL editor or a `supabase/` migrations
  folder — decide which once Supabase CLI usage is confirmed).
- Add `@supabase/supabase-js` dependency and a small `db/supabaseClient.ts`.

## Step 2 — Conversation storage layer

- Add `db/conversations.ts` with functions to:
  - `getOrCreateConversation(channel, travelAgentId, customerId)`.
  - `getMessages(conversationId)` — ordered history for agent context.
  - `appendMessage(conversationId, role, content)`.
- No HTTP-layer changes yet — this is a pure data-access module, unit
  testable independent of Express/agent wiring.

## Step 3 — Wire history into `/chat`

- Update `POST /chat` in `index.ts` to:
  1. Resolve the conversation via `(channel, travelAgentId, customerId)`.
  2. Load prior messages and persist the incoming user message.
  3. Pass full history into `run(tripAgent, ...)` (Agents SDK supports an
     input array of role/content items instead of a single string).
  4. Persist the assistant's reply and return it.
- Add/update `.http` test cases in `api-tests/` that send two sequential
  messages for the same `customerId` and confirm the second reply shows
  contextual awareness of the first.

## Step 4 — Agent tools: flights & hotels

- Decide per-tool whether it's an MCP server or a direct API integration
  (depends on which provider(s) you pick — e.g. a flights API, a hotels
  API).
- Add tool definitions under `ai/tools/` (e.g. `searchFlights.ts`,
  `searchHotels.ts`) using the Agents SDK tool interface.
- Register tools on `tripAgent` in `ai/agent.ts`.
- Extend the agent instructions to describe when/how to use each tool.
- Add `.http` tests exercising a message that should trigger each tool.

## Step 5 — Escalation to a human agent

- Define what "escalation" means concretely: e.g. a tool the agent calls
  (`escalateToHuman`) that flags the conversation row
  (`conversations.escalated_at` / `status`) and returns a message telling
  the customer a human will follow up.
- Decide (with user input) whether this needs to notify anyone (e.g. a
  webhook, email, Telegram message to the travel agent) — out of scope
  until Step 5 unless clarified earlier.

## Step 6 — Channel-agnostic hardening

- Verify no Telegram-specific assumptions leaked into core logic (there
  shouldn't be any yet, since inbound channel adaptation isn't built —
  confirm whether a Telegram webhook receiver is in scope for v1 or if
  `/chat` is called by an external Telegram integration already).
- Add input validation/normalization for `channel` against the `Channel`
  union type (currently only checked for truthiness, not for valid enum
  value).

## Step 7 — Baseline error handling & polish

- Handle Supabase errors, Agents SDK failures, and malformed input with
  proper status codes (currently only one 400 check exists; no try/catch
  around `run()` or DB calls).
- Confirm `.env` has all required vars documented (e.g. a `.env.example`).

---

## Open questions before starting

1. Which flights/hotels providers should the tools call (specific APIs or
   MCP servers)?
2. Is a Telegram webhook receiver part of this v1, or does something
   external already call `/chat`?
3. What should "escalation" notify — just a DB flag, or an outbound
   notification (email/Slack/Telegram) to the travel agent?

Suggested order to start coding: **Step 1 → Step 2 → Step 3**, since
conversation history is the most load-bearing missing piece and doesn't
depend on answers to the open questions above.
