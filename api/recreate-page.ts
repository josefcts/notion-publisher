import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client, isFullPage } from '@notionhq/client';
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

  const { page_id, titulo, blocks } = req.body;
  if (!page_id || !titulo || !blocks?.length) {
    res.status(400).json({ error: 'page_id, titulo e blocks sao obrigatorios' }); return;
  }

  try {
    // 1. Busca o parent da página atual
    const existing = await notion.pages.retrieve({ page_id }) as any;
    const parentId = existing.parent?.page_id;
    if (!parentId) throw new Error('Nao foi possivel encontrar o parent da pagina');

    // 2. Arquiva a página velha
    await notion.pages.update({ page_id, archived: true });

    // 3. Cria nova página no mesmo parent com primeiro chunk de blocos
    const chunkSize = 40;
    const firstChunk = blocks.slice(0, chunkSize);
    const newPage = await notion.pages.create({
      parent: { page_id: parentId },
      properties: { title: { title: [{ text: { content: titulo } }] } },
      icon: { type: 'emoji', emoji: '📄' },
      children: firstChunk,
    }) as any;

    // 4. Appenda chunks restantes
    for (let i = chunkSize; i < blocks.length; i += chunkSize) {
      await notion.blocks.children.append({
        block_id: newPage.id,
        children: blocks.slice(i, i + chunkSize),
      });
    }

    res.status(200).json({ success: true, url: newPage.url, new_id: newPage.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}