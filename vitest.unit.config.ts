import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/accounting.test.ts', 'tests/telegram-adapter.test.ts'],
    environment: 'node'
  }
})
