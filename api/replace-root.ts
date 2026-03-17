import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@notionhq/client';
import { NotionError } from '../src/errors';
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

  const rootPageId = process.env.NOTION_ROOT_PAGE_ID;
  if (!rootPageId) { res.status(500).json({ error: 'NOTION_ROOT_PAGE_ID nao configurado' }); return; }

  const { blocks } = req.body;
  if (!blocks?.length) { res.status(400).json({ error: 'blocks array obrigatorio' }); return; }

  try {
    // 1. Lê todos os blocos existentes
    const allBlocks: any[] = [];
    let cursor: string | undefined;
    do {
      const page: any = await notion.blocks.children.list({ block_id: rootPageId, start_cursor: cursor, page_size: 100 });
      allBlocks.push(...page.results);
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);

    // 2. Deleta tudo exceto child_page — ignora arquivados e erros
    let deleted = 0;
    for (const b of allBlocks) {
      if (b.type === 'child_page') continue;
      if (b.archived === true || b.in_trash === true) continue;
      try {
        await notion.blocks.delete({ block_id: b.id });
        deleted++;
      } catch (e: any) {
        if (e.message?.includes('archived') || e.message?.includes('trash')) continue;
        throw e;
      }
    }

    // 3. Insere novos blocos em chunks de 50
    const chunkSize = 50;
    for (let i = 0; i < blocks.length; i += chunkSize) {
      await notion.blocks.children.append({ block_id: rootPageId, children: blocks.slice(i, i + chunkSize) });
    }

    res.status(200).json({ success: true, deleted, added: blocks.length });
  } catch (err: any) {
    if (err instanceof NotionError) { res.status(502).json({ error: err.message }); return; }
    console.error('[replace-root] erro:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}