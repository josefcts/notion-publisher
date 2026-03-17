import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@notionhq/client';
import { setCorsHeaders, handleOptions } from '../src/cors';

function validateApiKey(req: VercelRequest): boolean {
  return req.headers['x-api-key'] === process.env.PUBLISHER_API_KEY;
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(res);
  if (handleOptions(res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!validateApiKey(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }

  // Recebe array de { id, emoji }
  const { pages } = req.body;
  if (!pages?.length) { res.status(400).json({ error: 'pages array obrigatorio' }); return; }

  const results = [];
  for (const p of pages) {
    try {
      await notion.pages.update({
        page_id: p.id,
        icon: { type: 'emoji', emoji: p.emoji },
      });
      results.push({ id: p.id, ok: true });
    } catch (err: any) {
      results.push({ id: p.id, ok: false, error: err.message });
    }
  }

  res.status(200).json({ success: true, results });
}