/**
 * The site's only counter: how many trade confirmations have been read, in total, by everyone, for the line on the
 * home page ("อ่านไปแล้ว ... ไฟล์"). The page sends just "+n PDF", "+n screenshots" or "+1 Gmail sync": no file,
 * no ticker, no amount, no email, no id of any kind. This Worker reads nothing else from the request and logs
 * nothing; the counts are three numbers in one Durable Object.
 */
import { DurableObject } from 'cloudflare:workers'

export const USAGE_KINDS = ['pdf', 'shot', 'gmail'] as const
export type UsageKind = (typeof USAGE_KINDS)[number]
export type UsageCounts = Record<UsageKind, number>

/** At most this many in one report, so one visit can't add more than a big upload would. */
const MAX_PER_REPORT = 50

export class UsageCounter extends DurableObject {
  async counts(): Promise<UsageCounts> {
    const stored = await this.ctx.storage.get<UsageCounts>('counts')
    return { pdf: 0, shot: 0, gmail: 0, ...stored }
  }

  async add(kind: UsageKind, n: number): Promise<void> {
    const counts = await this.counts()
    counts[kind] += n
    await this.ctx.storage.put('counts', counts)
  }
}

type Env = { USAGE: DurableObjectNamespace<UsageCounter> }

/** GET /api/usage: the totals. POST /api/usage {"kind":"pdf","n":3}: add to one. */
export async function handleUsage(request: Request, env: Env): Promise<Response> {
  const counter = env.USAGE.get(env.USAGE.idFromName('all'))
  if (request.method === 'GET') {
    return Response.json(await counter.counts(), { headers: { 'Cache-Control': 'public, max-age=300' } })
  }
  if (request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { kind?: unknown; n?: unknown } | null
    const kind = body?.kind
    const n = body?.n
    if (
      typeof kind !== 'string' ||
      !(USAGE_KINDS as readonly string[]).includes(kind) ||
      typeof n !== 'number' ||
      !Number.isInteger(n) ||
      n < 1 ||
      n > MAX_PER_REPORT
    )
      return new Response('Bad request', { status: 400 })
    await counter.add(kind as UsageKind, n)
    return new Response(null, { status: 204 })
  }
  return new Response('Not found', { status: 404 })
}
