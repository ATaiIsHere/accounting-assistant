import { runDeployWorkflow } from './lib/deploy-shared'

runDeployWorkflow(process.argv.slice(2)).catch((error) => {
  console.error(`\nDeployment failed: ${(error as Error).message}`)
  process.exitCode = 1
})
