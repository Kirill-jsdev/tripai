export type Channel = 'telegram' | 'whatsapp' | 'facebook' | 'web';

export interface ChatRequest {
  channel: Channel;
  customerId: string;
  message: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}


