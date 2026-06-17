/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { CloudflareRuntime } from './types/cloudflare';
import type { RequestContext } from './lib/context/request';

declare global {
  namespace App {
    interface Locals {
      requestId: string;
      runtime: CloudflareRuntime;
      user: RequestContext['user'];
      session: RequestContext['session'];
      organization: RequestContext['organization'];
      membership: RequestContext['membership'];
    }
  }
}

export {};
