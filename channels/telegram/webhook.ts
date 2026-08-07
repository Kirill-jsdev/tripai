import type { Request, Response } from 'express';
import { supabase } from '../../db/supabaseClient.js';
import { handleChat } from '../../chat/handleChat.js';
import { sendBusinessMessage } from './telegramClient.js';
import { businessMessageToHandleChatInput } from './translate.js';
import type { TelegramBusinessMessage, TelegramUpdate } from './translate.js';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

export async function telegramWebhook(req: Request, res: Response) {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    res.sendStatus(401);
    return;
  }

  // Acknowledge immediately: Telegram expects a fast webhook response, but
  // agent replies can take longer than that. The actual reply is delivered
  // asynchronously via sendMessage once handleChat resolves.
  res.sendStatus(200);

  const update = req.body as TelegramUpdate;

  try {
    if (update.business_connection) {
      console.log('Received business_connection update:', JSON.stringify(update.business_connection));
      return;
    }

    if (update.business_message) {
      await processBusinessMessage(update.business_message);
    }
  } catch (error) {
    console.error('Failed to process Telegram update', error);
  }
}

async function processBusinessMessage(message: TelegramBusinessMessage) {
  if (!message.text) return;

  const { data: agent, error } = await supabase
    .from('travel_agents')
    .select('id')
    .eq('telegram_business_connection_id', message.business_connection_id)
    .maybeSingle();

  if (error) throw error;

  if (!agent) {
    console.log(
      `No travel_agents row linked to business_connection_id ${message.business_connection_id} - dropping message`
    );
    return;
  }

  const input = businessMessageToHandleChatInput(message, agent.id);
  const reply = await handleChat(input);
  await sendBusinessMessage(message.business_connection_id, message.chat.id, reply);
}
