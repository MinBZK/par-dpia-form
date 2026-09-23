import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config.js'
import { requireAuth } from '../middleware/auth.js'
import { dutchSchemaErrorFormatter } from '../utils/routeSchemas.js'
import { API_KEY_REJECTION_DETAIL, validateApiKey } from '../utils/apiKey.js'

/**
 * Chat against VLAM — the experiment surface for adding AI help to the AIIA.
 *
 * Registered only when config.chat.enabled is on, so an environment that was
 * never set up for an LLM has no such endpoint at all rather than one that
 * fails at call time.
 *
 * Three things this route deliberately does not do:
 *  - It keeps no key. The caller's key is read from the request, used for that
 *    one outbound call and then goes out of scope; nothing is cached on the app
 *    instance, where a second concurrent request could pick it up.
 *  - It never logs the key, nor echoes it in an error. Every failure names the
 *    header and the reason, never the value.
 *  - It stores nothing. A conversation lives in the client; this is a proxy,
 *    not a transcript.
 */

const KEY_HEADER = 'x-vlam-api-key'

// A conversation the client replays on every turn, bounded so one request
// cannot turn into an unbounded bill. The body limit (64 kB, see app.ts) is the
// outer bound; these keep the shape sensible well below it.
const MAX_MESSAGES = 50
const MAX_CONTENT = 8000

interface ChatBody {
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

  // Chat costs the caller money and reaches an external service, so it is not
  // anonymous even though the key is the caller's own.
  app.addHook('preHandler', requireAuth)

  app.post<{ Body: ChatBody }>('/', {
    schema: {
      tags: ['chat'],
      description:
        'Stuurt een gesprek door naar VLAM en geeft het antwoord terug. De sleutel komt per verzoek mee in de header x-vlam-api-key; de server bewaart geen sleutel en geen gesprek.',
      body: {
        type: 'object',
        required: ['messages'],
        additionalProperties: false,
        properties: {
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
    const rejection = validateApiKey(request.headers[KEY_HEADER] as string | undefined)
    if (rejection) {
      return problem(reply, request, 400, 'Sleutel ontbreekt of is ongeldig', API_KEY_REJECTION_DETAIL[rejection])
    }

    const { baseUrl, modelId, timeout } = config.chat.vlam
    if (!baseUrl || !modelId) {
      return problem(
        reply,
        request,
        503,
        'Chat niet geconfigureerd',
        'VLAM_BASE_URL en VLAM_MODEL_ID staan niet ingesteld op deze omgeving.',
      )
    }

    let response: Response
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${request.headers[KEY_HEADER] as string}`,
        },
        body: JSON.stringify({ model: modelId, messages: request.body.messages }),
        signal: AbortSignal.timeout(timeout * 1000),
      })
    } catch (error) {
      // A timeout is the caller's problem to retry; anything else means VLAM was
      // not reachable at all. Neither is logged with the request body, which
      // carries the conversation.
      const timedOut = (error as Error).name === 'TimeoutError'
      app.log.warn({ err: (error as Error).name }, 'VLAM request failed')
      return timedOut
        ? problem(reply, request, 504, 'VLAM antwoordde niet op tijd', `VLAM gaf binnen ${timeout} seconden geen antwoord.`)
        : problem(reply, request, 502, 'VLAM niet bereikbaar', 'Er kon geen verbinding met VLAM worden gemaakt.')
    }

    if (!response.ok) {
      // Upstream bodies can carry the prompt back, so only the status travels on.
      app.log.warn({ status: response.status }, 'VLAM returned an error status')
      return problem(reply, request, 502, 'VLAM gaf een fout', `VLAM antwoordde met status ${response.status}.`)
    }

    const payload = (await response.json()) as {
      model?: string
      choices?: { message?: { content?: string } }[]
    }
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return problem(reply, request, 502, 'Onverwacht antwoord van VLAM', 'Het antwoord van VLAM bevatte geen bericht.')
    }

    return { reply: content, model: payload.model ?? modelId }
  })
}
