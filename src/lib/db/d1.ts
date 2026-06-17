import type { AstroGlobal } from 'astro';
import { getCloudflareRuntime } from '../cloudflare/bindings';

export function getD1(Astro: AstroGlobal): D1Database | null {
  return getCloudflareRuntime(Astro)?.env.DB ?? null;
}
