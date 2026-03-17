import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client, isFullPage } from '@notionhq/client';
import { NotionError } from '../src/errors';

function validateApiKey(req: VercelRequest): boolean {
  return req.headers['x-api-key'] === process.env.PUBLISHER_API_KEY;
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

interface SearchResult {
  id: string;
  titulo: string;
  url: string;
  semestre: string;
  materia: string;
  criadoEm: string;
}

async function searchPages(query: string): Promise<SearchResult[]> {
  const response = await notion.search({
    query,
    filter: { property: 'object', value: 'page' },
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
    page_size: 20,
  });

  const results: SearchResult[] = [];

  for (const result of response.results) {
    if (!isFullPage(result)) continue;
    const titleProp = result.properties?.title;
    let titulo = 'Sem titulo';
    if (titleProp?.type === 'title' && titleProp.title.length > 0) {
      titulo = titleProp.title.map((t: any) => t.plain_text).join('');
    }

    let semestre = '';
    let materia = '';

    if (result.parent.type === 'page_id') {
      try {
        const parent = await notion.pages.retrieve({ page_id: result.parent.page_id });
        if (isFullPage(parent)) {
          materia = (parent.properties?.title as any)?.title?.map((t: any) => t.plain_text).join('') || '';
          if (parent.parent.type === 'page_id') {
            const gp = await notion.pages.retrieve({ page_id: parent.parent.page_id });
            if (isFullPage(gp)) {
              semestre = (gp.properties?.title as any)?.title?.map((t: any) => t.plain_text).join('') || '';
            }
          }
        }
      } catch { }
    }

    results.push({ id: result.id, titulo, url: result.url, semestre, materia, criadoEm: new Date(result.created_time).toLocaleDateString('pt-BR') });
  }

  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!validateApiKey(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const query = req.query.q as string;
  if (!query || query.trim().length < 2) { res.status(400).json({ error: 'Parametro q obrigatorio (minimo 2 caracteres)' }); return; }
  try {
    const results = await searchPages(query.trim());
    res.status(200).json({ results, total: results.length });
  } catch (err: any) {
    if (err instanceof NotionError) { res.status(502).json({ error: err.message }); return; }
    console.error('[search] erro:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}