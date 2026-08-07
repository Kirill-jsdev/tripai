import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../db/supabaseClient.js';
import { hashApiKey } from '../auth/apiKey.js';

declare global {
  namespace Express {
    interface Request {
      travelAgentId?: string;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const apiKey = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const { data, error } = await supabase
    .from('travel_agents')
    .select('id')
    .eq('api_key_hash', hashApiKey(apiKey))
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  req.travelAgentId = data.id;
  next();
}
