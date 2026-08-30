import { defineMiddleware } from 'astro:middleware';
import { loadRequestContext } from './lib/context/request';
import { parseCookieHeader } from './lib/http/cookies';
import { getCloudflareRuntime } from './lib/cloudflare/bindings';
import { SESSION_COOKIE_NAME } from './lib/auth/constants';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.requestId = crypto.randomUUID();
  const cookies = parseCookieHeader(context.request.headers.get('cookie'));

  try {
    const runtime = getCloudflareRuntime(context);
    const db = runtime?.env?.DB;

    if (db) {
      const loaded = await loadRequestContext(db, cookies);
      context.locals.user = loaded.user;
      context.locals.session = loaded.session;
      context.locals.organization = loaded.organization;
      context.locals.membership = loaded.membership;
    } else {
      context.locals.user = null;
      context.locals.session = null;
      context.locals.organization = null;
      context.locals.membership = null;
    }
  } catch {
    context.locals.user = null;
    context.locals.session = null;
    context.locals.organization = null;
    context.locals.membership = null;
  }

  const pathname = new URL(context.request.url).pathname;
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/verify-email' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/panduan' ||
    pathname === '/studi-kasus' ||
    pathname === '/bantuan' ||
    pathname === '/fitur' ||
    pathname === '/preview' ||
    pathname.startsWith('/blog') ||
    pathname.startsWith('/invite/') ||
    pathname === '/api/health' ||
    pathname.startsWith('/_astro') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/assets');

  if (context.locals.user && (pathname === '/' || pathname === '/login' || pathname === '/signup')) {
    return context.redirect('/dashboard');
  }

  if (context.locals.user && context.locals.organization && pathname === '/onboarding') {
    return context.redirect('/dashboard');
  }

  if (!context.locals.user && !isPublicRoute && !pathname.startsWith('/api/')) {
    if (cookies.has(SESSION_COOKIE_NAME)) {
      return context.redirect('/login?alert=session&error=Sesi%20Anda%20sudah%20berakhir%20atau%20tidak%20valid.%20Silakan%20masuk%20kembali.');
    }
    return context.redirect('/login');
  }

  const isPlatformAdminRoute = pathname.startsWith('/platform') && context.locals.user?.platform_role === 'platform_admin';
  if (pathname.startsWith('/platform') && !isPlatformAdminRoute) {
    return context.redirect('/dashboard');
  }

  if (
    context.locals.user
    && !context.locals.organization
    && pathname !== '/dashboard'
    && pathname !== '/onboarding'
    && pathname !== '/logout'
    && !pathname.startsWith('/api/')
    && !pathname.startsWith('/_astro')
    && !pathname.startsWith('/favicon')
    && !pathname.startsWith('/assets')
  ) {
    return context.redirect('/dashboard');
  }

  return next();
});
