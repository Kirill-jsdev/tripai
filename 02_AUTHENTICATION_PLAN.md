# Authentication Plan

Source of truth for scope: `CLAUDE.md`, `PLAN.md`. This plan covers
authenticating the callers of `POST /chat` before the backend is
deployed anywhere reachable from outside localhost.

## Problem

`POST /chat` currently accepts `channel`, `travelAgentId`, `customerId`,
and `message` with no verification of who's calling. Anyone who can
reach the URL can:

- Claim any `travelAgentId`, reading/writing another agency's
  conversation history.
- Generate unlimited OpenAI-billed requests at our expense.

## Who is "the client" here

`/chat` is an HTTP entry point called by whatever isn't one of our own
in-process channel adapters — today that's manual/`.http` testing, and
in principle any future external caller. It is **not** how Telegram
traffic reaches the agent: per `03_TELEGRAM_CHANNEL_PLAN.md`, the
Telegram webhook runs in the same process and calls the core chat logic
directly (a function call, not an HTTP request), so it never goes
through `/chat` or this API key at all — it authenticates inbound
Telegram traffic via Telegram's own webhook secret token instead, and
resolves `travelAgentId` via the `business_connection_id` link rather
than an API key. `/chat` still needs its own auth regardless, since it
remains a real network-reachable HTTP endpoint once deployed.

There is no human-facing login/dashboard for travel agencies. That
rules out Supabase Auth (GoTrue): it's built for interactive end-user
sessions (email/password or OAuth, browser session, short-lived JWT +
refresh token) and its main other benefit — Postgres Row Level Security
— is moot here since `db/supabaseClient.ts` uses the `service_role`
key, which bypasses RLS entirely.

What fits instead: a single **long-lived API key per travel agent**,
sent as a bearer token on every direct `/chat` request. If a dashboard
for travel agencies gets built later, Supabase Auth can be introduced
then for *that* human login, separate from this key.

## Design

### 1. New table: `travel_agents`

This is the account entity that doesn't exist yet. `travelAgentId` today
is a free-text string with nothing backing it; this table makes it a
real, ownable identity.

```sql
CREATE TABLE travel_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    api_key_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- `api_key_hash`: SHA-256 hash of the API key, not the plaintext key
  itself — same principle as password storage, minus bcrypt's
  deliberate slowness, since these are high-entropy random tokens
  rather than human-chosen passwords guessable by brute force.
- Needs the same `GRANT ... TO service_role;` treatment other tables
  got in Step 1 of `PLAN.md` (tables created via CLI migration don't
  automatically get it).

### 2. `conversations.travel_agent_id` becomes a real foreign key

`PLAN.md`'s original decision explicitly left this column as `TEXT`
because "no `travel_agents` table exists in this system yet," flagging
it for revisit once one does. That table now exists, so:

```sql
ALTER TABLE conversations
    ALTER COLUMN travel_agent_id TYPE UUID USING travel_agent_id::uuid,
    ADD CONSTRAINT fk_conversations_travel_agent
        FOREIGN KEY (travel_agent_id) REFERENCES travel_agents(id);
```

Any existing conversation rows with non-UUID `travel_agent_id` values
(from ad hoc testing) will need to be cleared or backfilled before this
migration runs, since the `USING` cast will fail otherwise.

### 3. `travelAgentId` is removed from the request body

Since each agency has exactly one API key, the key *is* the identity —
the caller doesn't need to also assert a `travelAgentId` in the JSON
body. This closes the spoofing hole (today, any `travelAgentId` string
is accepted at face value) and simplifies the request shape:

```diff
 POST /chat
 {
-  "travelAgentId": "...",
   "channel": "telegram",
   "customerId": "...",
   "message": "..."
 }
```

`travelAgentId` is instead resolved server-side from the API key and
attached to the request by middleware.

### 4. Auth middleware

- Reads `Authorization: Bearer <api_key>` from the request headers.
- Hashes the presented key (SHA-256) and looks up `travel_agents` by
  `api_key_hash`.
- Missing/malformed header → `401 Unauthorized`.
- No matching row → `401 Unauthorized`.
- On success, attaches the resolved `travelAgentId` (the row's `id`) to
  the request (e.g. `req.travelAgentId`) for the route handler to use
  in place of the old `req.body.travelAgentId`.
- Applied **narrowly to `/chat`** — e.g.
  `app.post('/chat', authenticate, handler)` — not mounted globally
  with `app.use(authenticate)`. This matters once
  `03_TELEGRAM_CHANNEL_PLAN.md`'s webhook route exists: it uses a
  completely different auth mechanism (Telegram's own secret token, no
  bearer key), so it must not be caught by this middleware. Any other
  route added later that expects a `travel_agents` API key can opt in
  explicitly the same way `/chat` does — it's never the default.

### 5. Issuing keys: a one-off script, not an admin API

There's no dashboard to generate keys from yet, so key issuance is a
small script (similar in spirit to the throwaway verification scripts
used for Steps 1–2 in `PLAN.md`), not a built endpoint:

- Generates a random key (e.g. `crypto.randomBytes(32).toString('hex')`).
- Hashes it, inserts `{ name, api_key_hash }` into `travel_agents`.
- Prints the **plaintext** key once to the console — it is never stored
  or retrievable again, so whoever runs the script must hand it to the
  travel agency's bot integration immediately.

### 6. Test coverage

- Update `api-tests/post-chat.http` to send the `Authorization` header
  and drop `travelAgentId` from the body.
- Add cases for: missing header (401), invalid key (401), valid key
  (200, and confirms the resolved `travelAgentId` is used correctly for
  conversation lookup — i.e. two different agencies' API keys with the
  same `customerId`/`channel` must not collide on the same
  conversation).

## Implementation order

1. Migration: create `travel_agents` (+ grants).
2. Migration: convert `conversations.travel_agent_id` to `UUID` + FK
   (clear/backfill any incompatible test rows first).
3. `scripts/create-travel-agent.ts` — issue a key for local testing.
4. Auth middleware (e.g. `middleware/authenticate.ts`) + wire into
   `index.ts`.
5. Update `types/chat.ts` (`ChatRequest` drops `travelAgentId` — it's
   the shape of the HTTP request body only). Note for
   `03_TELEGRAM_CHANNEL_PLAN.md`: once `handleChat` is extracted from
   `index.ts`, its internal input type is *not* `ChatRequest` — it must
   still include `travelAgentId`, since in-process callers like the
   Telegram adapter resolve it themselves (via
   `business_connection_id`, not an API key) and pass it in directly.
   `index.ts`'s `/chat` handler becomes the one place that bridges the
   two: read `travelAgentId` off the authenticated request (not
   `req.body`) and pass it into `handleChat` alongside the rest of the
   body.
6. Update `.http` tests; verify end-to-end with a generated key.

## Open questions

- Key rotation/revocation: out of scope for v1 (single key per agency,
  no expiry). Revisit if an agency's key leaks — for now, revoking
  means deleting/regenerating the row manually via the script or
  Supabase dashboard (view-only per `PLAN.md`'s migration rule, but
  fine for an emergency manual `DELETE`/`UPDATE` until a proper flow
  exists).
- Rate limiting per travel agent: not covered here — relevant once cost
  control beyond "must have a valid key" matters.
- If a dashboard is built later for travel agencies to self-serve (view
  conversations, manage settings), that's a separate, human-facing auth
  concern and the natural point to introduce Supabase Auth — it would
  sit alongside this API-key scheme, not replace it, since the bot
  backend still needs a machine credential.
