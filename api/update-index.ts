import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@notionhq/client';
import { NotionError } from '../src/errors';
import { setCorsHeaders, handleOptions } from '../src/cors';

function validateApiKey(req: VercelRequest): boolean {
  return req.headers['x-api-key'] === process.env.PUBLISHER_API_KEY;
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

interface IndexEntry {
  titulo: string;
  materia: string;
  semestre: number;
  pageUrl: string;
  data: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(res);
  if (handleOptions(res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!validateApiKey(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { titulo, materia, semestre, pageUrl, data } = req.body;
  if (!titulo || !materia || !semestre || !pageUrl) {
    res.status(400).json({ error: 'campos obrigatorios faltando' }); return;
  }

  const rootPageId = process.env.NOTION_ROOT_PAGE_ID;
  if (!rootPageId) { res.status(500).json({ error: 'NOTION_ROOT_PAGE_ID nao configurado' }); return; }

  try {
    // 1. Lê TODOS os blocos da página raiz
    const allBlocks: any[] = [];
    let cursor: string | undefined;
    do {
      const page: any = await notion.blocks.children.list({
        block_id: rootPageId,
        start_cursor: cursor,
        page_size: 100,
      });
      allBlocks.push(...page.results);
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);

    // 2. Localiza o heading "✅ Temas Estudados"
    const temasIdx = allBlocks.findIndex(
      (b: any) => b.type === 'heading_2' &&
        b.heading_2?.rich_text?.[0]?.text?.content?.includes('Temas Estudados')
    );
    if (temasIdx === -1) throw new NotionError('Seção Temas Estudados não encontrada na página raiz');

    // 3. Deleta TODOS os callouts que existem após o heading até o próximo divider/heading
    const toDelete: string[] = [];
    for (let i = temasIdx + 1; i < allBlocks.length; i++) {
      const b = allBlocks[i];
      if (b.type === 'divider' || b.type === 'heading_1' || b.type === 'heading_2') break;
      if (b.type === 'callout') toDelete.push(b.id);
    }
    for (const id of toDelete) {
      await notion.blocks.delete({ block_id: id });
    }

    // 4. Adiciona o novo callout com link clicável
    await notion.blocks.children.append({
      block_id: rootPageId,
      after: allBlocks[temasIdx].id,
      children: [{
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [
            {
              type: 'text',
              text: { content: `📄 ${semestre}º Sem → ${materia} → ` },
              annotations: { bold: false, color: 'default' }
            },
            {
              type: 'text',
              text: { content: titulo, link: { url: pageUrl } },
              annotations: { bold: true, color: 'blue' }
            },
            {
              type: 'text',
              text: { content: ` • ${data || new Date().toLocaleDateString('pt-BR')}` },
              annotations: { color: 'gray' }
            },
          ],
          icon: { type: 'emoji', emoji: '✅' },
          color: 'green_background',
        },
      } as any],
    });

    res.status(200).json({ success: true, deleted: toDelete.length });
  } catch (err: any) {
    if (err instanceof NotionError) { res.status(502).json({ error: err.message }); return; }
    console.error('[update-index] erro:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}