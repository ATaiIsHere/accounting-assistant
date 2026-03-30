export function parseLocalEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {}

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    value = value.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    result[key] = value
  }

  return result
}

export function stringifyLocalEnv(
  values: Record<string, string | undefined>,
  orderedKeys?: string[]
): string {
  const keys = orderedKeys || Object.keys(values)
  const lines: string[] = []

  for (const key of keys) {
    const value = values[key]
    if (value === undefined || value === '') {
      continue
    }

    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    lines.push(`${key}="${escaped}"`)
  }

  return lines.length > 0 ? `${lines.join('\n')}\n` : ''
}
