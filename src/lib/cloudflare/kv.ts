import type { AstroGlobal } from 'astro';
import { getCloudflareRuntime } from './bindings';

export function getKV(Astro: AstroGlobal): KVNamespace {
  return getCloudflareRuntime(Astro).env.KV;
}
