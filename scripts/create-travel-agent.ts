import 'dotenv/config';
import { supabase } from '../db/supabaseClient.js';
import { generateApiKey, hashApiKey } from '../auth/apiKey.js';

const name = process.argv[2];
if (!name) {
  console.error('Usage: npx tsx scripts/create-travel-agent.ts "<name>"');
  process.exit(1);
}

const apiKey = generateApiKey();

const { data, error } = await supabase
  .from('travel_agents')
  .insert({ name, api_key_hash: hashApiKey(apiKey) })
  .select('id')
  .single();

if (error) throw error;

console.log(`Created travel_agents row ${data.id} for "${name}".`);
console.log('API key (shown once, store it now):');
console.log(apiKey);
