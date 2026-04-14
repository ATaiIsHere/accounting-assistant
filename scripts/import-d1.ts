import { pathToFileURL } from 'node:url'
import { runD1ImportWorkflow } from './lib/infra-import'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runD1ImportWorkflow(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`\nD1 import failed: ${message}`)
    process.exitCode = 1
  })
}
