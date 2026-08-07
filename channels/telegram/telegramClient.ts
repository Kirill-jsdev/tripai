const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function apiUrl(method: string): string {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN must be set');
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
}

async function callTelegramApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API error on ${method}: ${data.description}`);
  }

  return data.result as T;
}

export function sendBusinessMessage(businessConnectionId: string, chatId: number, text: string): Promise<unknown> {
  return callTelegramApi('sendMessage', {
    business_connection_id: businessConnectionId,
    chat_id: chatId,
    text,
  });
}

export function setWebhook(url: string, secretToken: string): Promise<unknown> {
  return callTelegramApi('setWebhook', {
    url,
    secret_token: secretToken,
  });
}
