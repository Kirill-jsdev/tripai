# Telegram Channel Plan

Source of truth for scope: `CLAUDE.md` (see "Channel Architecture"),
`PLAN.md`, `02_AUTHENTICATION_PLAN.md`. This plan covers building the
actual Telegram integration — we provide the whole bot solution, not
just an API a third party integrates against, so the webhook receiver,
message translation, and reply delivery all live in this project.

Depends on `02_AUTHENTICATION_PLAN.md` being implemented first, since
this plan needs a real `travel_agents` table to link Telegram accounts
to.

## Background: Telegram Business Connections

Salespeople connect their own personal Telegram account (as a
"Business Account") to a bot we control. Once connected, Telegram:

- Sends us a `business_connection` update whenever a salesperson
  connects (or disconnects/updates) their account, containing a
  `business_connection_id` and info about the connecting Telegram user.
- Sends us `business_message` updates for every message the salesperson
  receives on that connected account, tagged with the same
  `business_connection_id`.
- Lets us send messages back *as* that salesperson's account, by
  passing the same `business_connection_id` to `sendMessage`.

This is the mechanism `ESCALATION.md` already assumes ("via a Telegram
Business account... the customer sees a single, continuous
conversation with no visible seam").

## Design

### 1. Account linking: admin-gated, not self-service

As discussed in `02_AUTHENTICATION_PLAN.md`, nobody gets to register
themselves — a `business_connection_id` arriving on the webhook proves
someone connected a Telegram account, not that they're an authorized,
paying travel agent. So:

- Add `telegram_business_connection_id TEXT UNIQUE` (nullable) directly
  onto `travel_agents` (migration). One column, not a separate table —
  MVP assumes one channel connection per travel agent; revisit as a
  proper join table only if an agent ever needs multiple connections on
  the same channel.
- When a `business_connection` update arrives for an id we don't
  recognize, log it (and/or store it in a small `pending, unlinked`
  state) but do **not** create or activate a `travel_agents` row from
  it automatically.
- Linking a connection to an agent is a manual admin action: once you've
  onboarded/verified a salesperson (same moment you'd run the
  `create-travel-agent` script from `02_AUTHENTICATION_PLAN.md`), you
  set their `telegram_business_connection_id` — either as a second step
  in that script or a small follow-up script/update.

### 2. Webhook receiver

- New route, e.g. `POST /webhooks/telegram`, added to the existing
  Express app (or mounted from `channels/telegram/webhook.ts`).
- Registered with Telegram once via the Bot API's `setWebhook`, passing
  a `secret_token`.
- Every incoming request must be checked for the
  `X-Telegram-Bot-Api-Secret-Token` header matching that configured
  secret before any processing — this authenticates "this request
  really came from Telegram," which is a different concern from the
  `travel_agents` API-key auth in `02_AUTHENTICATION_PLAN.md` (that one
  authenticates our own services to each other/to `/chat`; this one
  authenticates Telegram to us).
- Requests failing the secret check are rejected (401/403) without
  further processing.

### 3. Translating inbound messages

For a `business_message` update:

- Resolve `travelAgentId` by looking up `travel_agents` where
  `telegram_business_connection_id` matches the update's
  `business_connection_id`. No match → drop/log the message; there's no
  agent to attribute it to.
- Build the input for the core handler: `channel: 'telegram'`, the
  resolved `travelAgentId`, `customerId` = the customer's Telegram user
  id, `message` = the text content. Note this is **not** the
  `ChatRequest` type from `types/chat.ts` — per
  `02_AUTHENTICATION_PLAN.md`, that type is the external `/chat` HTTP
  body and has no `travelAgentId`. The extracted handler takes its own
  input type (e.g. `HandleChatInput` in `chat/handleChat.ts`) that
  *does* include `travelAgentId`, since in-process callers resolve it
  themselves instead of relying on the API-key middleware.
- Call the shared chat handler **directly, in-process** — not by making
  an HTTP call to `/chat`. This requires extracting the current inline
  logic in `index.ts`'s `POST /chat` handler into a plain function
  (e.g. `handleChat(input: HandleChatInput)` in `chat/handleChat.ts`)
  that both the `/chat` route and the Telegram adapter call. `/chat`
  stays as a thin HTTP wrapper around it — parses `ChatRequest`, adds
  the `travelAgentId` the auth middleware resolved, calls `handleChat`
  — still useful for `.http` testing and any future direct API
  consumer.

### 4. Sending replies

- After `handleChat` returns a reply, send it back via the Bot API's
  `sendMessage`, passing the same `business_connection_id` so it's
  delivered as that salesperson's account.
- Telegram expects a fast webhook response (a few seconds); if agent
  responses risk running long, acknowledge the webhook immediately
  (`200 OK`) and send the reply asynchronously via `sendMessage` rather
  than blocking the webhook response on the agent call. Needs
  verification against actual observed agent latency once this is
  built — not assumed up front.

### 5. Folder structure

```
channels/
  telegram/
    webhook.ts        # Express route handler, secret-token check
    translate.ts       # business_message -> internal chat request, and back
    telegramClient.ts   # thin wrapper over Bot API calls (sendMessage, setWebhook)
chat/
  handleChat.ts        # extracted core logic, called by both /chat and channel adapters
```

### 6. Config

New `.env` values:

- `TELEGRAM_BOT_TOKEN` — from BotFather.
- `TELEGRAM_WEBHOOK_SECRET` — the secret passed to `setWebhook` and
  checked on every inbound request.

### 7. Local development

Telegram requires a public HTTPS URL for webhooks — local dev needs a
tunnel (e.g. ngrok) pointed at the Express app, with `setWebhook` run
against that tunnel URL. Not needed until this plan is actually
implemented; noted here so it isn't a surprise blocker.

## Implementation order

1. Migration: add `telegram_business_connection_id` to `travel_agents`.
2. Extract `handleChat` out of `index.ts` into `chat/handleChat.ts`;
   update `/chat` to call it. No behavior change — pure refactor,
   verify existing `.http` tests still pass.
3. `channels/telegram/telegramClient.ts` — `sendMessage`, `setWebhook`
   wrappers.
4. `channels/telegram/webhook.ts` — route + secret-token verification +
   `business_connection` handling (log-only for unrecognized ids) +
   `business_message` handling (translate → `handleChat` → reply).
5. Wire the route into `index.ts`.
6. Manual end-to-end verification: connect a real Telegram Business
   account via a test bot, link its `business_connection_id` to a
   `travel_agents` row manually, send a message, confirm a reply comes
   back on the same account and history persists across messages.

## Open questions

- ~~Async reply delivery (webhook ack now, `sendMessage` later) vs.
  synchronous~~ — resolved during implementation: the webhook
  acknowledges immediately (`200 OK`) before calling `handleChat`, and
  `sendMessage` fires afterward, inside a `try/catch` so a failure
  (e.g. Telegram API error) is logged rather than crashing the process
  or affecting the already-sent ack.
- What happens to a `travel_agents` row's linkage if a salesperson
  disconnects the Business Connection in Telegram (Telegram sends a
  `business_connection` update with `is_enabled: false`)? Does the bot
  need to stop treating that connection as active? Not addressed yet —
  revisit once basic linking works.
- Multiple Telegram accounts per travel agent, or one travel agent
  wanting to run both Telegram and a future second channel — the
  single-column link on `travel_agents` doesn't support more than one
  connection per channel per agent. Deferred, same as the `companies`
  and multi-key deferrals in `02_AUTHENTICATION_PLAN.md`, until an
  actual case shows up.
