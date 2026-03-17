import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const url = req.query.url as string;
  if (!url) { res.status(400).send('url param required'); return; }

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NotionImageProxy/1.0)',
        'Referer': 'https://notion.so',
      }
    });
    
    if (!r.ok) { res.status(r.status).send('upstream error'); return; }
    
    const contentType = r.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await r.arrayBuffer());
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(buffer);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
}