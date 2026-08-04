import { Agent } from '@openai/agents';

export const tripAgent = new Agent({
  name: 'TripAI Assistant',
  instructions: 'You are a helpful travel assistant. Help users plan trips, find destinations, and answer travel-related questions.',
});
