import Fastify, { type FastifyInstance } from 'fastify'
import compress from '@fastify/compress'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { config } from './config.js'
import { verifyBearer } from './middleware/auth.js'
import { projectRoutes } from './routes/projects.js'
import { memberRoutes } from './routes/members.js'
import { assessmentRoutes } from './routes/assessments.js'
import { commentRoutes } from './routes/comments.js'
import { syncRoutes } from './routes/sync.js'
import { securityTxt } from './utils/securityTxt.js'

export const API_VERSION = '1.0.0'

declare module 'fastify' {
  interface FastifyInstance {
    /** Flip the readiness probe to 503 ahead of a graceful shutdown. */
    beginShutdown: () => void
  }
}

export interface BuildAppOptions {
  logger?: boolean
  /** Expose Swagger UI + /api/openapi.json. Defaults to config.exposeApiDocs. */
  exposeApiDocs?: boolean
  /** Fastify trustProxy value (proxy CIDR / hop count). Defaults to config.trustProxy. */
  trustProxy?: string | boolean | number
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const exposeApiDocs = options.exposeApiDocs ?? config.exposeApiDocs
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 25 * 1024 * 1024, // 25 MB — assessments with embedded images can be large
    // Trust the proxy hop so req.ip is the real client (rate limiting); see config.ts.
    trustProxy: options.trustProxy ?? config.trustProxy,
  })

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })

  await app.register(cors, config.cors)
  // Responses only. The plugin's request-decompression hook is on by default and
  // would let a few kB of gzip inflate to the full 25 MB bodyLimit, turning the
  // expensive save/export routes into a cheap amplification target.
  await app.register(compress, { global: true, globalDecompression: false })
  // The key decides the bucket and the budget: a request whose token verifies gets
  // its own per-user bucket, anything else shares a per-IP one. Verifying here (on
  // onRequest, before requireAuth exists) is what makes that safe: the payload is
  // memoised, so requireAuth does not verify a second time.
  await app.register(rateLimit, {
    timeWindow: '1 minute',
    keyGenerator: async (request) => {
      const verified = await verifyBearer(request)
      return verified.ok ? `user:${verified.payload.sub}` : `ip:${request.ip}`
    },
    max: (_request, key) => (key.startsWith('user:') ? config.rateLimit.userMax : config.rateLimit.max),
  })

  if (exposeApiDocs) await app.register(swagger, {
    openapi: {
      info: {
        title: 'Invulhulpen API',
        description: 'REST API voor het beheren van assessments en projecten waarin assessments gegroepeerd kunnen worden.',
        version: API_VERSION,
        contact: {
          name: 'Invulhulpen — MinBZK',
          url: config.publicUrl,
          email: 'RIG@rijksoverheid.nl',
        },
      },
      servers: [{ url: '/' }],
      tags: [
        { name: 'assessments', description: 'Assessments beheren' },
        { name: 'projects', description: 'Projecten en leden beheren' },
        { name: 'sync', description: 'Collaboration sync signals voor polling clients' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        responses: {
          TooManyRequests: {
            description: 'Rate limit overschreden. Geauthenticeerde verzoeken tellen per ingelogde gebruiker, overige per IP-adres.',
            content: {
              'application/problem+json': {
                schema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', example: 'https://httpproblems.com/http-status/429' },
                    title: { type: 'string', example: 'Te veel verzoeken' },
                    status: { type: 'integer', example: 429 },
                    detail: {
                      type: 'string',
                      example: 'Maximaal aantal verzoeken overschreden. Probeer het later opnieuw.',
                    },
                    instance: { type: 'string', example: '/api/v1/projects' },
                  },
                },
              },
            },
            headers: {
              'Retry-After': {
                description: 'Seconden tot de rate limit reset',
                schema: { type: 'integer' },
              },
              'X-RateLimit-Limit': {
                description: 'Maximum aantal requests per tijdvenster',
                schema: { type: 'integer', example: 1000 },
              },
              'X-RateLimit-Remaining': {
                description: 'Resterend aantal requests in huidig tijdvenster',
                schema: { type: 'integer' },
              },
            },
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  })

  if (exposeApiDocs) await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    logo: { content: Buffer.from(''), type: 'image/svg+xml' },
    theme: {
      title: 'Invulhulpen API',
      css: [
        {
          filename: 'custom.css',
          content: '.topbar, .servers-title, .servers { display: none !important; }',
        },
      ],
    },
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
      persistAuthorization: true,
      tryItOutEnabled: true,
      syntaxHighlight: { theme: 'monokai' },
    },
  })

  app.addHook('onSend', async (_request, reply) => {
    reply.header('API-Version', API_VERSION)
    reply.header('Cache-Control', 'no-store')
  })

  app.setErrorHandler(async (error: { statusCode?: number; message?: string }, request, reply) => {
    const status = error.statusCode ?? 500

    if (status === 429) {
      return reply.status(429).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/429',
        title: 'Te veel verzoeken',
        status: 429,
        detail: 'Maximaal aantal verzoeken overschreden. Probeer het later opnieuw.',
        instance: request.url,
      })
    }

    app.log.error(error)
    return reply.status(status).type('application/problem+json').send({
      type: `https://httpproblems.com/http-status/${status}`,
      title: status >= 500 ? 'Interne serverfout' : 'Verzoek mislukt',
      status,
      detail: status >= 500 ? 'Er is een onverwachte fout opgetreden.' : (error.message || 'Onbekende fout'),
      instance: request.url,
    })
  })

  await app.register(projectRoutes, { prefix: '/api/v1/projects' })
  await app.register(memberRoutes, { prefix: '/api/v1/projects' })
  await app.register(assessmentRoutes, { prefix: '/api/v1/assessments' })
  await app.register(commentRoutes, { prefix: '/api/v1/assessments' })
  await app.register(syncRoutes, { prefix: '/api/v1/assessments' })

  // Readiness: reports 503 once beginShutdown() has been called, so Kubernetes
  // stops routing new traffic here before the server actually closes.
  let shuttingDown = false
  app.decorate('beginShutdown', () => {
    shuttingDown = true
  })

  app.get('/api/health', { schema: { hide: true } }, async (_request, reply) => {
    if (shuttingDown) reply.status(503)
    return {
      status: shuttingDown ? 'shutting_down' : 'ok',
      apiVersion: API_VERSION,
      version: process.env.APP_VERSION || 'dev',
      commit: (process.env.APP_COMMIT || 'dev').slice(0, 7),
    }
  })

  // Rendered once at import time from the shared template (see securityTxt.ts).
  app.get('/.well-known/security.txt', { schema: { hide: true } }, async (_request, reply) => {
    return reply.type('text/plain; charset=utf-8').send(securityTxt)
  })

  if (exposeApiDocs) {
    app.get('/api/openapi.json', { schema: { hide: true } }, async (_request, reply) => {
      return reply.send(app.swagger())
    })
  }

  return app
}
