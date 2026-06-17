/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { CloudflareRuntime } from './types/cloudflare';

declare global {
  namespace App {
    interface Locals {
      requestId: string;
      runtime: CloudflareRuntime;
    }
  }
}

export {};
