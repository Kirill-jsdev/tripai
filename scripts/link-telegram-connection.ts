import 'dotenv/config';
import { supabase } from '../db/supabaseClient.js';

const [travelAgentId, businessConnectionId] = process.argv.slice(2);
if (!travelAgentId || !businessConnectionId) {
  console.error(
    'Usage: npx tsx scripts/link-telegram-connection.ts <travelAgentId> <businessConnectionId>'
  );
  process.exit(1);
}

const { data, error } = await supabase
  .from('travel_agents')
  .update({ telegram_business_connection_id: businessConnectionId })
  .eq('id', travelAgentId)
  .select('id, name')
  .single();

if (error) throw error;

console.log(`Linked travel_agents ${data.id} ("${data.name}") to Telegram business_connection_id ${businessConnectionId}.`);
