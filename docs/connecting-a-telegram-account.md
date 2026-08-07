# Connecting a Telegram Account to the Bot

How a travel agent's (salesperson's) Telegram account gets connected to
our bot, and what we have to do on our end before the bot will actually
respond to them. This assumes the bot itself already exists and is
running with a registered webhook — see `03_TELEGRAM_CHANNEL_PLAN.md`
for that one-time setup.

Two things are true throughout this process:

- **Connecting is not the same as being enabled.** Anyone who knows the
  bot's username can connect it to their own Telegram account. That
  alone gets them nothing — the bot stays completely silent for them
  until we explicitly link their connection (step 4 below).
- **Every step that grants access is manual**, done by an admin running
  a script. There is no self-service signup and no dashboard yet.

## Prerequisite (the connecting person)

They need **Telegram Premium** (or another Telegram plan that includes
Business features) — the "Telegram Business" settings section this
whole flow depends on isn't available on a plain free account.

## Step 1 — They connect the bot on their end

In Telegram:

1. **Settings → Telegram Business → Chatbots.**
2. Select our bot by its username.
3. Grant permissions. We need at minimum:
   - `can_read_messages`
   - `can_reply`

   No other permission (e.g. `can_delete_outgoing`, `can_view_gifts`,
   `can_transfer_stars`) is needed for anything the bot does.
4. Confirm the connection.

## Step 2 — What Telegram sends us

The moment they confirm, Telegram sends our webhook
(`/webhooks/telegram`) a `business_connection` update containing:

- `id` — the **`business_connection_id`**, a value unique to this one
  connection.
- `user` — the connecting person's Telegram info (numeric id,
  `first_name`, `username` if they have one).
- `is_enabled` — whether the connection is currently active.

## Step 3 — What we do with that (automatically)

Our webhook handler (`channels/telegram/webhook.ts`) logs this event —
that's it. No database row is created, nothing is activated. This is
deliberate: a `business_connection_id` proves someone connected a
Telegram account, not that they're an authorized, paying travel agent.

At this point, if they had someone message their connected account,
the bot would stay silent — the incoming `business_message` would fail
to match any `travel_agents` row and get dropped.

## Step 4 — What we do manually to enable them

This is the actual "onboarding" step, done from a terminal:

1. **If they don't already have a `travel_agents` row**, create one:

   ```
   npx tsx scripts/create-travel-agent.ts "<Their Name>"
   ```

   This prints an API key. For an agent who will only ever use
   Telegram, that key is effectively unused (it exists because the
   table requires one) — see `02_AUTHENTICATION_PLAN.md` for what it's
   actually for.

2. **Link their Telegram connection to that row**, using the
   `business_connection_id` from step 2 (currently found by reading the
   server logs — there's no admin UI for this yet) and the `id` printed
   in step 1:

   ```
   npx tsx scripts/link-telegram-connection.ts <travelAgentId> <businessConnectionId>
   ```

Only after this second script runs does the bot start responding to
messages sent to their connected account.

## Verifying it worked

Have someone message the connected account. The bot should reply, in
character, as that person's account. To double check what actually
happened (e.g. if a reply seems missing), the conversation is stored in
Supabase's `conversations` table, keyed by
`(channel: 'telegram', travel_agent_id, customer_id)` — `customer_id`
is the Telegram user id of whoever sent the message.

## Known gaps (not yet handled)

- **Reconnecting after disconnecting**: if someone disables and later
  re-enables the Business Connection, it's not confirmed whether
  Telegram reuses the same `business_connection_id` or issues a new
  one. If it's new, they'd need to be linked again via Step 4.
- **No success-path logging**: the webhook currently only logs
  `business_connection` events and *dropped* (unlinked) messages —
  not successfully processed ones. Confirming a real message went
  through currently means checking the `conversations` table directly.
