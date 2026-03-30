type ApiContext = {
  request: Request
  params: {
    path?: string | string[]
  }
  env: {
    API_BASE_URL?: string
    DASHBOARD_PROXY_SECRET?: string
  }
}

export const onRequest = async (context: ApiContext) => {
  if (!context.env.API_BASE_URL) {
    return Response.json(
      { error: 'Missing API_BASE_URL binding for Pages Functions proxy.' },
      { status: 500 },
    )
  }

  if (!context.env.DASHBOARD_PROXY_SECRET) {
    return Response.json(
      { error: 'Missing DASHBOARD_PROXY_SECRET binding for Pages Functions proxy.' },
      { status: 500 },
    )
  }

  const pathSegments = Array.isArray(context.params.path)
    ? context.params.path
    : context.params.path
      ? [context.params.path]
      : []

  const incomingUrl = new URL(context.request.url)
  const upstreamUrl = new URL(`/api/${pathSegments.join('/')}`, context.env.API_BASE_URL)
  upstreamUrl.search = incomingUrl.search

  const headers = new Headers()
  const contentType = context.request.headers.get('Content-Type')

  if (contentType) {
    headers.set('Content-Type', contentType)
  }

  headers.set('X-Dashboard-Proxy-Secret', context.env.DASHBOARD_PROXY_SECRET)

  const upstreamResponse = await fetch(upstreamUrl, {
    method: context.request.method,
    headers,
    body:
      context.request.method === 'GET' || context.request.method === 'HEAD'
        ? undefined
        : context.request.body,
  })

  const response = new Response(upstreamResponse.body, upstreamResponse)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
