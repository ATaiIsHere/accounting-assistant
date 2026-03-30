import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

type AccessEnv = {
  CLOUDFLARE_ACCESS_AUD?: string
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string
}

type AccessContext = {
  request: Request
  env: AccessEnv
  data: {
    cloudflareAccess?: {
      email: string | null
      payload: JWTPayload
    }
  }
  next: () => Promise<Response>
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1'])
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function normalizeTeamDomain(domain?: string) {
  if (!domain) return null

  const trimmed = domain.trim().replace(/\/$/, '')
  return trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`
}

function getJwks(teamDomain: string) {
  const existing = jwksCache.get(teamDomain)
  if (existing) return existing

  const next = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`))
  jwksCache.set(teamDomain, next)
  return next
}

export const onRequest = async (context: AccessContext) => {
  const { hostname } = new URL(context.request.url)
  if (loopbackHosts.has(hostname)) {
    return context.next()
  }

  const teamDomain = normalizeTeamDomain(context.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN)
  const aud = context.env.CLOUDFLARE_ACCESS_AUD?.trim()

  if (!teamDomain || !aud) {
    return new Response('Cloudflare Access is not configured for this deployment.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const token = context.request.headers.get('Cf-Access-Jwt-Assertion')
  if (!token) {
    return new Response('Cloudflare Access login required.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      issuer: teamDomain,
      audience: aud,
    })

    context.data.cloudflareAccess = {
      email: typeof payload.email === 'string' ? payload.email : null,
      payload,
    }

    return context.next()
  } catch {
    return new Response('Cloudflare Access token validation failed.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}
