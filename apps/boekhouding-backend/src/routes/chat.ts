import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config.js'
import { requireAuth } from '../middleware/auth.js'
import { dutchSchemaErrorFormatter } from '../utils/routeSchemas.js'

/**
 * Chat against VLAM — the experiment surface for adding AI help to the AIIA.
 *
 * The VLAM key comes from the deployment (config.chat.vlam.apiKey) and never
 * leaves the server. The client picks the model per request (or leaves it to
 * VLAM_MODEL_ID) and can ask which models there are. Who may spend the key is
 * decided in front of the app, by the ZAD SSO gate, and by the login every
 * other route requires as well.
 *
 * Two things this route deliberately does not do:
 *  - It never logs the key, nor echoes it in an error.
 *  - It stores nothing. A conversation lives in the client; this is a proxy,
 *    not a transcript.
 */

// A conversation the client replays on every turn, bounded so one request
// cannot turn into an unbounded bill. The body limit (64 kB, see app.ts) is the
// outer bound; these keep the shape sensible well below it.
const MAX_MESSAGES = 50
const MAX_CONTENT = 8000

// A model id travels into the upstream request body, so it is held to the
// characters model names actually use.
const MODEL_PATTERN = '^[A-Za-z0-9._:/-]{1,128}$'

interface ChatBody {
  model?: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
}

function problem(reply: FastifyReply, request: FastifyRequest, status: number, title: string, detail: string) {
  return reply.status(status).type('application/problem+json').send({
    type: `https://httpproblems.com/http-status/${status}`,
    title,
    status,
    detail,
    instance: request.url,
  })
}

export async function chatRoutes(app: FastifyInstance) {
  app.setSchemaErrorFormatter(dutchSchemaErrorFormatter)

  // Chat spends the environment's VLAM budget and reaches an external service,
  // so it is never anonymous.
  app.addHook('preHandler', requireAuth)

  /**
   * Call VLAM and return its JSON, or send the problem response and return
   * null. Shared by the chat and the model list so both fail the same way.
   */
  async function callVlam(
    request: FastifyRequest,
    reply: FastifyReply,
    path: string,
    init: { method: 'GET' } | { method: 'POST'; body: unknown },
  ): Promise<unknown | null> {
    const { baseUrl, apiKey, timeout } = config.chat.vlam
    if (!baseUrl || !apiKey) {
      problem(
        reply,
        request,
        503,
        'Chat niet geconfigureerd',
        'Deze omgeving mist een VLAM-adres (de dienst VLAM-API of VLAM_BASE_URL) of VLAM_API_KEY.',
      )
      return null
    }

    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          ...(init.method === 'POST' && { 'content-type': 'application/json' }),
          authorization: `Bearer ${apiKey}`,
        },
        ...(init.method === 'POST' && { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(timeout * 1000),
      })
    } catch (error) {
      // A timeout is the caller's problem to retry; anything else means VLAM was
      // not reachable at all. Neither is logged with the request body, which
      // carries the conversation.
      const timedOut = (error as Error).name === 'TimeoutError'
      app.log.warn({ err: (error as Error).name }, 'VLAM request failed')
      if (timedOut) {
        problem(reply, request, 504, 'VLAM antwoordde niet op tijd', `VLAM gaf binnen ${timeout} seconden geen antwoord.`)
      } else {
        problem(reply, request, 502, 'VLAM niet bereikbaar', 'Er kon geen verbinding met VLAM worden gemaakt.')
      }
      return null
    }

    if (!response.ok) {
      // Upstream bodies can carry the prompt back, so only the status travels on.
      app.log.warn({ status: response.status }, 'VLAM returned an error status')
      problem(reply, request, 502, 'VLAM gaf een fout', `VLAM antwoordde met status ${response.status}.`)
      return null
    }

    return response.json()
  }

  app.get('/models', {
    schema: {
      tags: ['chat'],
      description: 'De modellen die VLAM met de sleutel van deze omgeving aanbiedt.',
      response: {
        200: {
          type: 'object',
          properties: {
            models: { type: 'array', items: { type: 'string' } },
            defaultModel: { type: ['string', 'null'] },
          },
          required: ['models', 'defaultModel'],
        },
      },
    },
  }, async (request, reply) => {
    const payload = (await callVlam(request, reply, '/models', { method: 'GET' })) as
      | { data?: { id?: unknown }[] }
      | null
    if (payload === null) return reply
    const models = (payload.data ?? [])
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === 'string')
    return { models, defaultModel: config.chat.vlam.modelId || null }
  })

  app.post<{ Body: ChatBody }>('/', {
    schema: {
      tags: ['chat'],
      description:
        'Stuurt een gesprek door naar VLAM en geeft het antwoord terug. Zonder model geldt VLAM_MODEL_ID. De server bewaart geen gesprek.',
      body: {
        type: 'object',
        required: ['messages'],
        additionalProperties: false,
        properties: {
          model: { type: 'string', pattern: MODEL_PATTERN },
          messages: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_MESSAGES,
            items: {
              type: 'object',
              required: ['role', 'content'],
              additionalProperties: false,
              properties: {
                role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                content: { type: 'string', minLength: 1, maxLength: MAX_CONTENT },
              },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
            model: { type: 'string' },
          },
          required: ['reply', 'model'],
        },
      },
    },
  }, async (request, reply) => {
    const model = request.body.model ?? config.chat.vlam.modelId
    if (!model) {
      return problem(
        reply,
        request,
        400,
        'Geen model gekozen',
        'Geef een model mee, of stel VLAM_MODEL_ID in als standaard voor deze omgeving.',
      )
    }

    const payload = (await callVlam(request, reply, '/chat/completions', {
      method: 'POST',
      body: { model, messages: request.body.messages },
    })) as { model?: string; choices?: { message?: { content?: string } }[] } | null
    if (payload === null) return reply

    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return problem(reply, request, 502, 'Onverwacht antwoord van VLAM', 'Het antwoord van VLAM bevatte geen bericht.')
    }

    return { reply: content, model: payload.model ?? model }
  })
}
