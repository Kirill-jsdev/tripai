import 'dotenv/config';
import express from 'express';
import { handleChat } from './chat/handleChat.js';
import { authenticate } from './middleware/authenticate.js';
import { telegramWebhook } from './channels/telegram/webhook.js';
import type { ChatRequest } from './types/chat.js';

const app = express();
app.use(express.json());

app.post('/chat', authenticate, async (req, res) => {
  const { channel, customerId, message } = req.body as ChatRequest;
  const travelAgentId = req.travelAgentId!;

  if (!channel || !customerId || !message) {
    return res.status(400).json({ error: 'channel, customerId and message are required' });
  }

  const reply = await handleChat({ channel, travelAgentId, customerId, message });

  res.json({ reply });
});

app.post('/webhooks/telegram', telegramWebhook);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
