import 'dotenv/config';
import express from 'express';
import { Agent, run } from '@openai/agents';

const app = express();
app.use(express.json());

const agent = new Agent({
  name: 'TripAI Assistant',
  instructions: 'You are a helpful travel assistant. Help users plan trips, find destinations, and answer travel-related questions.',
});

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const result = await run(agent, message);
  res.json({ reply: result.finalOutput });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
