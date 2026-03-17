import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url param required' }); return;
  }

  // Só permite Wikimedia
  if (!url.startsWith('https://upload.wikimedia.org/')) {
    res.status(403).json({ error: 'only wikimedia urls allowed' }); return;
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NotionBot/1.0)',
        'Referer': 'https://en.wikipedia.org/',
      }
    });

    if (!upstream.ok) {
      res.status(upstream.status).end(); return;
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstream.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(Buffer.from(buffer));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}