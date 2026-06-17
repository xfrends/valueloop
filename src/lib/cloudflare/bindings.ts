import type { AstroGlobal } from 'astro';
import type { CloudflareRuntime } from '../../types/cloudflare';

export function getCloudflareRuntime(Astro: AstroGlobal): CloudflareRuntime {
  const runtime = Astro.locals.runtime as CloudflareRuntime | undefined;

  if (!runtime?.env) {
    throw new Error('Cloudflare runtime bindings are unavailable.');
  }

  return runtime;
}
