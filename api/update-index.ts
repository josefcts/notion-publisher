import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@notionhq/client';
import { NotionError } from '../src/errors';
import { setCorsHeaders, handleOptions } from '../src/cors';

function validateApiKey(req: VercelRequest): boolean {
  return req.headers['x-api-key'] === process.env.PUBLISHER_API_KEY;
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

interface IndexEntry { titulo: string; materia: string; semestre: number; pageUrl: string; data: string; }

async function updateIndex(entry: IndexEntry): Promise<void> {
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID;
  if (!rootPageId) throw new NotionError('NOTION_ROOT_PAGE_ID nao configurado');

  const children = await notion.blocks.children.list({ block_id: rootPageId });
  let temasHeadingFound = false;
  let placeholderBlockId: string | null = null;

  for (const block of children.results as any[]) {
    if (block.type === 'heading_2' && block.heading_2?.rich_text?.[0]?.text?.content?.includes('Temas Estudados')) {
      temasHeadingFound = true;
    }
    if (temasHeadingFound && block.type === 'callout' && block.callout?.icon?.emoji === '📭') {
      placeholderBlockId = block.id;
    }
  }

  if (placeholderBlockId) {
    await notion.blocks.delete({ block_id: placeholderBlockId });
  }

  await notion.blocks.children.append({
    block_id: rootPageId,
    children: [{
      object: 'block', type: 'callout',
      callout: {
        rich_text: [
          { type: 'text', text: { content: `📄 ${entry.semestre}º Sem → ${entry.materia} → ` }, annotations: { bold: false, color: 'default' } },
          { type: 'text', text: { content: entry.titulo, link: { url: entry.pageUrl } }, annotations: { bold: true, color: 'blue' } },
          { type: 'text', text: { content: ` • ${entry.data}` }, annotations: { color: 'gray' } },
        ],
        icon: { type: 'emoji', emoji: '✅' },
        color: 'green_background',
      },
    } as any],
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(res);
  if (handleOptions(res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!validateApiKey(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { titulo, materia, semestre, pageUrl, data } = req.body;
  if (!titulo || !materia || !semestre || !pageUrl) { res.status(400).json({ error: 'campos obrigatorios faltando' }); return; }
  try {
    await updateIndex({ titulo, materia, semestre, pageUrl, data: data || new Date().toLocaleDateString('pt-BR') });
    res.status(200).json({ success: true });
  } catch (err: any) {
    if (err instanceof NotionError) { res.status(502).json({ error: err.message }); return; }
    console.error('[update-index] erro:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}