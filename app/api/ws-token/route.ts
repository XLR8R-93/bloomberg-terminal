// Returns the Finnhub key for client-side WebSocket use.
// Safe for a local personal terminal — not for public deployment.
export async function GET() {
  const token = process.env.FINNHUB_API_KEY
  if (!token) return Response.json({ error: 'FINNHUB_API_KEY not set' }, { status: 503 })
  return Response.json({ token })
}
