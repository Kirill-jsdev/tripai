import type { AgentInputItem } from '@openai/agents';
import type { ChatMessage } from '../types/chat.js';

export function toAgentInput(messages: ChatMessage[]): AgentInputItem[] {
  return messages.map((message) =>
    message.role === 'user'
      ? { role: 'user', content: message.content }
      : {
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: message.content }],
        }
  );
}
