import { Agent } from '@openai/agents';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const instructions = readFileSync(path.join(__dirname, 'agent-instructions.md'), 'utf-8');

export const tripAgent = new Agent({
  name: 'TripAI Assistant',
  instructions,
});
