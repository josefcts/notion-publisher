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

  const rootPageId = process.env.NOTION_ROOT_PAGE_ID;
  if (!rootPageId) { res.status(500).json({ error: 'NOTION_ROOT_PAGE_ID nao configurado' }); return; }

  // Aceita um único tema { titulo, materia, semestre, pageUrl, data }
  // ou array de temas { temas: [...] }
  const { titulo, materia, semestre, pageUrl, data, temas } = req.body;

  // Monta a lista final de entradas
  const entries: IndexEntry[] = temas?.length
    ? temas
    : [{ titulo, materia, semestre, pageUrl, data: data || new Date().toLocaleDateString('pt-BR') }];

  if (!entries.length || !entries[0].titulo) {
    res.status(400).json({ error: 'Informe titulo/materia/semestre/pageUrl ou array temas' }); return;
  }

  try {
    // 1. Lê todos os blocos da página raiz
    const allBlocks: any[] = [];
    let cursor: string | undefined;
    do {
      const page: any = await notion.blocks.children.list({ block_id: rootPageId, start_cursor: cursor, page_size: 100 });
      allBlocks.push(...page.results);
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);

    // 2. Localiza o heading Temas Estudados
    const temasIdx = allBlocks.findIndex(
      (b: any) => b.type === 'heading_2' && b.heading_2?.rich_text?.[0]?.text?.content?.includes('Temas Estudados')
    );
    if (temasIdx === -1) throw new NotionError('Seção Temas Estudados não encontrada');

    // 3. Deleta TODOS os callouts existentes nessa seção
    const toDelete: string[] = [];
    for (let i = temasIdx + 1; i < allBlocks.length; i++) {
      const b = allBlocks[i];
      if (b.type === 'divider' || b.type === 'heading_1' || b.type === 'heading_2') break;
      if (b.type === 'callout') toDelete.push(b.id);
    }
    for (const id of toDelete) {
      await notion.blocks.delete({ block_id: id });
    }

    // 4. Insere todos os temas de uma vez após o heading
    const children = entries.map((e) => ({
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [
          { type: 'text', text: { content: `📄 ${e.semestre}º Sem → ${e.materia} → ` }, annotations: { bold: false, color: 'default' } },
          { type: 'text', text: { content: e.titulo, link: { url: e.pageUrl } }, annotations: { bold: true, color: 'blue' } },
          { type: 'text', text: { content: ` • ${e.data || new Date().toLocaleDateString('pt-BR')}` }, annotations: { color: 'gray' } },
        ],
        icon: { type: 'emoji', emoji: '✅' },
        color: 'green_background',
      },
    }));

    await notion.blocks.children.append({
      block_id: rootPageId,
      after: allBlocks[temasIdx].id,
      children: children as any[],
    });

    res.status(200).json({ success: true, deleted: toDelete.length, added: entries.length });
  } catch (err: any) {
    if (err instanceof NotionError) { res.status(502).json({ error: err.message }); return; }
    console.error('[update-index] erro:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}