import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TELEGRAM_BOT_TOKEN: 'mock_tg_token',
          GEMINI_API_KEY: 'mock_gemini_key',
          ALLOWED_USER_ID: '123456789'
        }
      }
    })
  ]
});
