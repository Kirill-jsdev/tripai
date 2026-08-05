import { supabase } from './supabaseClient.js';
import type { Channel, ChatMessage } from '../types/chat.js';

export interface ConversationRow {
  id: string;
  channel: Channel;
  travel_agent_id: string;
  customer_id: string;
  chat: ChatMessage[];
  updated_at: string;
}

export async function getOrCreateConversation(
  channel: Channel,
  travelAgentId: string,
  customerId: string
): Promise<ConversationRow> {
  const { data: existing, error: selectError } = await supabase
    .from('conversations')
    .select('*')
    .eq('channel', channel)
    .eq('travel_agent_id', travelAgentId)
    .eq('customer_id', customerId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('conversations')
    .insert({ channel, travel_agent_id: travelAgentId, customer_id: customerId })
    .select('*')
    .single();

  if (!insertError) return created;

  // Unique violation: another request created the same conversation first.
  if (insertError.code === '23505') {
    const { data: raceWinner, error: reselectError } = await supabase
      .from('conversations')
      .select('*')
      .eq('channel', channel)
      .eq('travel_agent_id', travelAgentId)
      .eq('customer_id', customerId)
      .single();

    if (reselectError) throw reselectError;
    return raceWinner;
  }

  throw insertError;
}

export async function appendMessages(conversationId: string, newMessages: ChatMessage[]): Promise<void> {
  const { error } = await supabase.rpc('append_conversation_messages', {
    conversation_id: conversationId,
    new_messages: newMessages,
  });

  if (error) throw error;
}
