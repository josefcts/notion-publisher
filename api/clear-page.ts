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
    // Lê todos de uma vez
    const all: any[] = [];
    let cursor: string | undefined;
    do {
      const page: any = await notion.blocks.children.list({ block_id: page_id, page_size: 100, start_cursor: cursor });
      all.push(...page.results);
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);

    // Deleta em paralelo — muito mais rápido que serial
    const toDelete = all.filter((b: any) => b.type !== 'child_page' && !b.archived && !b.in_trash);
    await Promise.all(toDelete.map((b: any) =>
      notion.blocks.delete({ block_id: b.id }).catch(() => {})
    ));
    deleted = toDelete.length;

    res.status(200).json({ success: true, deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}