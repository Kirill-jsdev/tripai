-- Pre-launch test data only (no travel_agents rows exist yet, so nothing
-- production-relevant is lost): clear conversations whose travel_agent_id
-- is a placeholder string like "agent-001" rather than a real UUID, so the
-- type change below can proceed.
DELETE FROM conversations;

ALTER TABLE conversations
    ALTER COLUMN travel_agent_id TYPE UUID USING travel_agent_id::uuid,
    ADD CONSTRAINT fk_conversations_travel_agent
        FOREIGN KEY (travel_agent_id) REFERENCES travel_agents(id);
