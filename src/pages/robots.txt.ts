import type { APIRoute } from 'astro';

// Public marketing pages and the blog are crawlable; the app, API and auth flows are not.
const DISALLOWED = [
  '/api/',
  '/dashboard',
  '/challenge',
  '/history',
  '/leaderboard',
  '/insights',
  '/notifications',
  '/profile',
  '/billing',
  '/settings',
  '/platform',
  '/onboarding',
  '/verify-email',
  '/invite/',
];

export const GET: APIRoute = ({ url }) => {
  const body = [
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${url.origin}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
