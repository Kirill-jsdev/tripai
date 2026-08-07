import type { HandleChatInput } from '../../chat/handleChat.js';

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
}

export interface TelegramBusinessMessage {
  message_id: number;
  business_connection_id: string;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
}

export interface TelegramBusinessConnection {
  id: string;
  user: TelegramUser;
  user_chat_id: number;
  is_enabled: boolean;
}

export interface TelegramUpdate {
  update_id: number;
  business_connection?: TelegramBusinessConnection;
  business_message?: TelegramBusinessMessage;
}

export function businessMessageToHandleChatInput(
  message: TelegramBusinessMessage,
  travelAgentId: string
): HandleChatInput {
  return {
    channel: 'telegram',
    travelAgentId,
    customerId: String(message.from?.id ?? message.chat.id),
    message: message.text ?? '',
  };
}
