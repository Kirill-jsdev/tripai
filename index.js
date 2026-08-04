import 'dotenv/config';
import express from 'express';
import { run } from '@openai/agents';
import { tripAgent } from './ai/agent.js';

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const result = await run(tripAgent, message);
  res.json({ reply: result.finalOutput });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
