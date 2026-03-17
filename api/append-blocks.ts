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
    const chunkSize = 40;
    let added = 0;
    for (let i = 0; i < blocks.length; i += chunkSize) {
      await notion.blocks.children.append({ block_id: page_id, children: blocks.slice(i, i + chunkSize) });
      added += Math.min(chunkSize, blocks.length - i);
    }
    res.status(200).json({ success: true, added });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}