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

  const { page_id, blocks } = req.body;
  if (!page_id || !blocks?.length) { res.status(400).json({ error: 'page_id e blocks sao obrigatorios' }); return; }

  try {
    // Loop de limpeza — deleta até não sobrar nada
    let hasMore = true;
    while (hasMore) {
      const existing = await notion.blocks.children.list({ block_id: page_id, page_size: 100 });
      if (!existing.results.length) { hasMore = false; break; }
      for (const b of existing.results) {
        try { await notion.blocks.delete({ block_id: b.id }); } catch {}
      }
      hasMore = existing.has_more;
    }

    // Insere novos blocos em chunks de 40
    const chunkSize = 40;
    for (let i = 0; i < blocks.length; i += chunkSize) {
      await notion.blocks.children.append({ block_id: page_id, children: blocks.slice(i, i + chunkSize) });
    }

    res.status(200).json({ success: true, added: blocks.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}