import { pathToFileURL } from 'node:url'
import { runInfraTeardownWorkflow } from './lib/infra-import'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runInfraTeardownWorkflow(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`\nInfrastructure teardown failed: ${message}`)
    process.exitCode = 1
  })
}
