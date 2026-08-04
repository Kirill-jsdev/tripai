export type Channel = 'telegram' | 'whatsapp' | 'facebook' | 'web';

export interface ChatRequest {
  channel: Channel;
  travelAgentId: string;
  customerId: string;
  message: string;
}


