import { expect, test } from 'vitest'
import { buildResourcePlan, inferWorkerApiBaseUrl, renderAdoptGuidance } from '../scripts/lib/deploy-logic'

test('buildResourcePlan returns full provisioning for all target', () => {
  expect(buildResourcePlan('all')).toEqual({
    manageD1: true,
    managePagesProject: true,
    manageAccess: true,
  })
})

test('buildResourcePlan narrows resources for worker target', () => {
  expect(buildResourcePlan('worker')).toEqual({
    manageD1: true,
    managePagesProject: true,
    manageAccess: true,
  })
})

test('inferWorkerApiBaseUrl falls back to workers.dev URL', () => {
  expect(inferWorkerApiBaseUrl('accounting-assistant')).toBe('https://accounting-assistant.workers.dev')
  expect(inferWorkerApiBaseUrl('accounting-assistant', 'https://custom.example.com')).toBe(
    'https://custom.example.com',
  )
})

test('renderAdoptGuidance includes the resource identifiers', () => {
  const guidance = renderAdoptGuidance([
    {
      resource: 'D1 database',
      identifier: 'accounting-db',
      terraformAddress: 'cloudflare_d1_database.primary[0]',
      cloudflareId: 'd1-id',
      terraformImportId: 'account-id/d1-id',
    },
  ], 'infra/terraform/README.md')

  expect(guidance).toContain('accounting-db')
  expect(guidance).toContain('cloudflare_d1_database.primary[0]')
  expect(guidance).toContain('d1-id')
  expect(guidance).toContain('account-id/d1-id')
})
