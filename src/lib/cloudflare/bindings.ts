import type { AstroGlobal } from 'astro';
import { env } from 'cloudflare:workers';
import type { CloudflareRuntime } from '../../types/cloudflare';

type CloudflareSource = {
  locals?: {
    runtime?: unknown;
  };
  runtime?: unknown;
};

export function getCloudflareRuntime(source: AstroGlobal | CloudflareSource | null | undefined): CloudflareRuntime | null {
  try {
    const runtime = (source as CloudflareSource | null | undefined)?.locals?.runtime as CloudflareRuntime | undefined
      ?? (source as CloudflareSource | null | undefined)?.runtime as CloudflareRuntime | undefined;
    try {
      if (runtime?.env) {
        return runtime;
      }
    } catch {
      // Astro v6 keeps a deprecated locals.runtime getter that throws on env access.
    }

    if (env && Object.keys(env).length > 0) {
      return {
        env: env as CloudflareRuntime['env'],
        cf: {},
        ctx: {
          waitUntil() {},
          passThroughOnException() {},
          props: {},
        } as unknown as ExecutionContext,
      };
    }

    return null;
  } catch {
    return null;
  }
}
