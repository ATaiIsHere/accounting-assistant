import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'tests/accounting.test.ts',
      'tests/telegram-adapter.test.ts',
      'tests/line-adapter.test.ts',
      'tests/multi-service-isolation.test.ts',
      'tests/local-env.test.ts'
    ],
    environment: 'node'
  }
})
