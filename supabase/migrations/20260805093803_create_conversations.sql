CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel TEXT NOT NULL,
    travel_agent_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    chat JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_conversation UNIQUE (channel, travel_agent_id, customer_id)
);
