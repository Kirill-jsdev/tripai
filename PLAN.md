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
- Supabase project created; `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
  are in `.env`; `db/supabaseClient.ts` exports a configured client.
- Step 1 done: `supabase/` initialized and linked to the project via the
  CLI, `conversations` table created and granted to `service_role` via
  migrations, verified reachable from the app's client.
- Step 2 done: `db/conversations.ts` implements `getOrCreateConversation`
  (idempotent, race-safe on the unique constraint) and `appendMessages`
  (atomic via a Postgres RPC function, `append_conversation_messages`,
  added in its own migration). Both verified end-to-end against the
  remote database with a throwaway script (deleted after use).
- No MCP servers or external APIs (flights, hotels) wired into the agent.
- No escalation-to-human logic.

## Decisions (resolved 2026-08-05)

These were open forks between the original plan and ideas pulled from
`SUPABASE_PLAN.md`. Resolved so Step 1 can proceed unambiguously:

- **Schema shape: single `conversations` table with a `chat JSONB` column**
  (not a separate `messages` table). Simpler to read the whole history in
  one row. Requirement: appends must be atomic and safe under concurrent
  requests to the same conversation — the specific mechanism (a single
  `UPDATE` using jsonb `||` concat, an RPC function, a transaction,
  optimistic locking, etc.) is an implementation decision, not a planning
  one, and should be made when `db/conversations.ts` is actually written.
  Trade-off accepted: per-message querying/indexing (e.g. searching inside
  history, per-message metadata) is harder later if ever needed.
- **Migrations: Supabase CLI**, not the dashboard SQL editor. Schema lives
  as SQL files under `supabase/migrations/`, committed to git, applied via
  `npx supabase db push`. Requires Docker Desktop installed and running
  for local dev (`npx supabase start`); pushing migrations to the linked
  remote project doesn't require a locally running database once the
  project is linked with `npx supabase link`.
  - Rule (from `SUPABASE_PLAN.md`): the Supabase Dashboard is only for
    viewing data/logs/debugging — never used to hand-edit schema. Every
    schema change is a new migration file, committed to git.
  - Team workflow: after pulling latest changes, run `npx supabase db
    push` before continuing development, so everyone's schema stays in
    sync automatically.
  - Gotcha (found while running Step 1): tables created via CLI
    migrations don't automatically get Supabase's usual `service_role`
    grants. Each new table needs an explicit
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE <name> TO service_role;`
    in its own migration, or the app's `supabase-js` client gets
    `permission denied` even though the table exists.
- **Folder structure: stays flat**, matching what's already built
  (`index.ts`, `ai/`, `db/`, `types/`) and `CLAUDE.md`'s "keep v1 simple"
  guidance. The `src/controllers/services/repositories/infrastructure`
  layering from `SUPABASE_PLAN.md` is not adopted now — `db/` plays the
  role of the repository layer.
- **Naming: `travel_agent_id`**, not `ai_agent_id` — `travelAgentId`
  identifies the human travel agency/consultant per `CLAUDE.md`, distinct
  from the AI agent itself. Column names must match `types/chat.ts` field
  names (snake_case equivalents).
- **`travel_agent_id` type: `TEXT`, not `UUID`** — no `travel_agents`
  table exists in this system yet, and the ID may originate from an
  external CRM/admin tool. Revisit as `UUID` + FK if/when travel agents
  become rows this system owns and generates IDs for.

## Step 1 — Supabase schema via CLI migration

- `npm install -D supabase`, then `npx supabase init` (creates
  `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`).
  Commit the whole `supabase/` folder to git.
- `npx supabase link` to connect the CLI to the Supabase project created
  earlier (needs the project ref from the dashboard URL; may prompt for
  the DB password — this is the one place it's actually needed, separate
  from the app's runtime credentials).
- `npx supabase migration new create_conversations` and write:
  ```sql
  CREATE TABLE conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel TEXT NOT NULL,
      travel_agent_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      chat JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT uq_conversation UNIQUE (channel, travel_agent_id, customer_id)
  );
  ```
- `npx supabase db push` to apply it to the linked project.
- Schema is intentionally minimal. Additional columns (`status`,
  `summary`, `metadata`, etc.) can be introduced through future
  migrations without changing the core conversation storage model.

## Step 2 — Conversation storage layer

- Add `db/conversations.ts` with functions to:
  - `getOrCreateConversation(channel, travelAgentId, customerId)` — select
    by the unique key, insert with `chat: []` if not found.
  - `appendMessages(conversationId, newMessages)` — must be atomic and
    safe under concurrent requests to the same conversation; concrete
    mechanism decided at implementation time (see Decisions above).
- No HTTP-layer changes yet — this is a pure data-access module, unit
  testable independent of Express/agent wiring.

## Step 3 — Wire history into `/chat`

- Update `POST /chat` in `index.ts` to:
  1. Resolve the conversation via `(channel, travelAgentId, customerId)`.
  2. Read the existing `chat` array as history context.
  3. Pass the conversation history to the agent in whatever format the
     OpenAI Agents SDK expects at implementation time — the stored `chat`
     format shouldn't be coupled to one SDK call shape in this plan.
  4. Append both the user message and the assistant's reply to `chat` in
     one `appendMessages` call, then return the reply.
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
- Deployment flow: `Git → CI/CD → run supabase migrations → deploy
  Express`. CI/CD should run `npx supabase db push` against the linked
  project before (or as part of) deploying the app, so the schema is
  never out of sync with what the deployed code expects.

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
