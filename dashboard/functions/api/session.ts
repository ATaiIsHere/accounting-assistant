export const onRequest = async (context: {
  request: Request
  data?: {
    cloudflareAccess?: {
      email: string | null
    }
  }
}) => {
  const email =
    context.data?.cloudflareAccess?.email ??
    context.request.headers.get('CF-Access-Authenticated-User-Email')
  const jwt = context.request.headers.get('Cf-Access-Jwt-Assertion')

  return Response.json({
    email,
    accessProtected: Boolean(email || jwt),
  })
}
