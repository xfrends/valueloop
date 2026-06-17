// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',

  adapter: cloudflare({
    imageService: 'compile',
    sessionKVBindingName: 'KV',
    configPath: 'wrangler.jsonc',
    persistState: {
      path: './.wrangler/state',
    },
  }),

  vite: {
    plugins: [tailwindcss()]
  }
});
