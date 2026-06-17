import type { AstroGlobal } from 'astro';
import { getCloudflareRuntime } from './bindings';

export function getR2(Astro: AstroGlobal): R2Bucket {
  return getCloudflareRuntime(Astro).env.R2;
}
