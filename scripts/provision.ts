import { runProvisionWorkflow } from './lib/deploy-shared'

runProvisionWorkflow(process.argv.slice(2)).catch((error) => {
  console.error(`\nProvisioning failed: ${(error as Error).message}`)
  process.exitCode = 1
})
