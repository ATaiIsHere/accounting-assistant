import { describe, expect, it } from 'vitest'
import { parseLocalEnv, stringifyLocalEnv } from '../scripts/lib/local-env'

describe('local env helpers', () => {
  it('parses quoted env vars and ignores blank lines', () => {
    const parsed = parseLocalEnv(`
TELEGRAM_BOT_TOKEN="tg-token"

LINE_CHANNEL_ACCESS_TOKEN="line-token"
# comment
LINE_CHANNEL_SECRET='line-secret'
`)

    expect(parsed).toEqual({
      TELEGRAM_BOT_TOKEN: 'tg-token',
      LINE_CHANNEL_ACCESS_TOKEN: 'line-token',
      LINE_CHANNEL_SECRET: 'line-secret'
    })
  })

  it('stringifies only defined values and escapes quotes', () => {
    const output = stringifyLocalEnv(
      {
        TELEGRAM_BOT_TOKEN: 'tg-token',
        GEMINI_API_KEY: '',
        LINE_CHANNEL_SECRET: 'line"secret'
      },
      ['TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY', 'LINE_CHANNEL_SECRET']
    )

    expect(output).toBe(
      'TELEGRAM_BOT_TOKEN="tg-token"\n' +
        'LINE_CHANNEL_SECRET="line\\"secret"\n'
    )
  })
})
