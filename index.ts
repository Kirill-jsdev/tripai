import 'dotenv/config';
import express from 'express';
import { run } from '@openai/agents';
import { tripAgent } from './ai/agent.js';
import { toAgentInput } from './ai/history.js';
import { getOrCreateConversation, appendMessages } from './db/conversations.js';
import type { ChatRequest } from './types/chat.js';

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const { channel, travelAgentId, customerId, message } = req.body as ChatRequest;

  if (!channel || !travelAgentId || !customerId || !message) {
    return res.status(400).json({ error: 'channel, travelAgentId, customerId and message are required' });
  }

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

  res.json({ reply });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
