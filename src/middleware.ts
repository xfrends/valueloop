import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.requestId = crypto.randomUUID();
  return next();
});
