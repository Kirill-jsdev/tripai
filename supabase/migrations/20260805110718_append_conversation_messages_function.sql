CREATE FUNCTION append_conversation_messages(
    conversation_id UUID,
    new_messages JSONB
)
RETURNS conversations
LANGUAGE sql
AS $$
    UPDATE conversations
    SET chat = chat || new_messages,
        updated_at = NOW()
    WHERE id = conversation_id
    RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION append_conversation_messages(UUID, JSONB) TO service_role;
