import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  return Response.json({
    ok: true,
    app: 'valueloop',
    runtime: 'cloudflare-workers'
  });
};
