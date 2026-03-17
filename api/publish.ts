import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PublishPayloadSchema } from '../src/validators/payload';
import { publishToNotion } from '../src/notion/client';
import { NotionError } from '../src/errors';

function validateApiKey(req: VercelRequest): boolean {
  return req.headers['x-api-key'] === process.env.PUBLISHER_API_KEY;
}

async function triggerIndexUpdate(titulo: string, materia: string, semestre: number, pageUrl: string): Promise<void> {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://notion-publisher-plum.vercel.app';
  try {
    await fetch(`${baseUrl}/api/update-index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.PUBLISHER_API_KEY || '' },
      body: JSON.stringify({ titulo, materia, semestre, pageUrl, data: new Date().toLocaleDateString('pt-BR') }),
    });
  } catch (err) {
    console.error('[publish] falha ao atualizar indice:', err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!validateApiKey(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const payload = PublishPayloadSchema.parse(req.body);
    const pageUrl = await publishToNotion(payload);
    triggerIndexUpdate(payload.titulo, payload.materia, payload.semestre, pageUrl);
    res.status(200).json({ success: true, url: pageUrl });
  } catch (err: any) {
    if (err?.name === 'ZodError') { res.status(400).json({ error: 'Payload invalido', details: err.errors }); return; }
    if (err instanceof NotionError) { res.status(502).json({ error: err.message }); return; }
    console.error('[publish] erro:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}