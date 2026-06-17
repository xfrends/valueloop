import type { AstroGlobal } from 'astro';
import { getCloudflareRuntime } from './bindings';

export function getR2(Astro: AstroGlobal): R2Bucket | null {
  return getCloudflareRuntime(Astro)?.env.R2 ?? null;
}
