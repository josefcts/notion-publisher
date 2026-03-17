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

  const { page_id } = req.body;
  if (!page_id) { res.status(400).json({ error: 'page_id obrigatorio' }); return; }

  try {
    let deleted = 0;
    let hasMore = true;
    while (hasMore) {
      const existing = await notion.blocks.children.list({ block_id: page_id, page_size: 100 });
      if (!existing.results.length) break;
      for (const b of existing.results as any[]) {
        if (b.archived || b.in_trash) continue;
        try { await notion.blocks.delete({ block_id: b.id }); deleted++; } catch {}
      }
      hasMore = existing.has_more;
    }
    res.status(200).json({ success: true, deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}