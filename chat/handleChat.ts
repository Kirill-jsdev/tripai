import { run } from '@openai/agents';
import { tripAgent } from '../ai/agent.js';
import { toAgentInput } from '../ai/history.js';
import { getOrCreateConversation, appendMessages } from '../db/conversations.js';
import type { Channel } from '../types/chat.js';

export interface HandleChatInput {
  channel: Channel;
  travelAgentId: string;
  customerId: string;
  message: string;
}

export async function handleChat({ channel, travelAgentId, customerId, message }: HandleChatInput): Promise<string> {
  const conversation = await getOrCreateConversation(channel, travelAgentId, customerId);

  const input = [...toAgentInput(conversation.chat), { role: 'user' as const, content: message }];
  const result = await run(tripAgent, input);

  const reply = result.finalOutput;
  if (!reply) {
    throw new Error('Agent did not produce a final output');
  }

  await appendMessages(conversation.id, [
    { role: 'user', content: message, createdAt: new Date().toISOString() },
    { role: 'assistant', content: reply, createdAt: new Date().toISOString() },
  ]);

  return reply;
}
