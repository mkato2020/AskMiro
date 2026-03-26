// ============================================================
// AskMiro — netlify/functions/get-file.js
// Serves uploaded client files from Netlify Blob storage.
// URL: /api/files/:key
// Files are stored by client-upload.js under the 'uploads' store.
// ============================================================

import { getStore } from '@netlify/blobs';

export default async (req) => {
  const url = new URL(req.url);
  // key is everything after /api/files/
  const key = decodeURIComponent(url.pathname.replace(/^\/api\/files\//, ''));

  if (!key) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const store = getStore('uploads');
    const { data, metadata } = await store.getWithMetadata(key, { type: 'arrayBuffer' });

    if (!data) return new Response('File not found', { status: 404 });

    const contentType = (metadata && metadata.mimeType) || 'application/octet-stream';
    const fileName    = (metadata && metadata.fileName) || key.split('/').pop();

    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type':        contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control':       'private, max-age=86400',
      },
    });
  } catch (e) {
    console.error('[get-file] error:', e.message);
    return new Response('File not found', { status: 404 });
  }
};

export const config = { path: '/api/files/:key' };
