import { ImageResponse } from '@vercel/og';
import type { VercelRequest } from '@vercel/node';
import { setCorsHeaders } from '../src/cors';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    }});
  }

  const apiKey = req.headers.get('x-api-key');
  if (apiKey !== process.env.PUBLISHER_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { svg, width = 680, height = 500 } = await req.json();

  if (!svg) return new Response(JSON.stringify({ error: 'svg obrigatorio' }), { status: 400 });

  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: 'white',
          padding: '0',
        },
        dangerouslySetInnerHTML: { __html: svg }
      }
    },
    { width, height }
  );
}