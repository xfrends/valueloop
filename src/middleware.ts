import { defineMiddleware } from 'astro:middleware';
import { loadRequestContext } from './lib/context/request';
import { parseCookieHeader } from './lib/http/cookies';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.requestId = crypto.randomUUID();
  const cookies = parseCookieHeader(context.request.headers.get('cookie'));

  try {
    const runtime = context.locals.runtime;
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
    pathname.startsWith('/blog') ||
    pathname.startsWith('/invite/') ||
    pathname === '/api/health' ||
    pathname.startsWith('/_astro') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/assets');

  if (context.locals.user && (pathname === '/' || pathname === '/login' || pathname === '/signup')) {
    const target = context.locals.organization ? '/dashboard' : '/onboarding';
    return context.redirect(target);
  }

  if (!context.locals.user && !isPublicRoute && !pathname.startsWith('/api/')) {
    return context.redirect('/login');
  }

  if (context.locals.user && !context.locals.organization && !['/onboarding', '/logout'].includes(pathname) && !pathname.startsWith('/api/')) {
    return context.redirect('/onboarding');
  }

  return next();
});
