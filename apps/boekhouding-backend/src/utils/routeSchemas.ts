import type { FastifySchemaValidationError } from 'fastify/types/schema.js'

// Shared JSON Schema fragments for path parameters and common querystrings.
// Without them a non-UUID id reaches Postgres, where it surfaces as a driver
// error (22P02) and therefore a 500, instead of a 400 before any query runs.

const uuid = { type: 'string', format: 'uuid' } as const

export const projectParams = {
  type: 'object',
  required: ['projectId'],
  properties: { projectId: uuid },
  additionalProperties: false,
} as const

export const memberParams = {
  type: 'object',
  required: ['projectId', 'userId'],
  properties: { projectId: uuid, userId: uuid },
  additionalProperties: false,
} as const

export const assessmentParams = {
  type: 'object',
  required: ['assessmentId'],
  properties: { assessmentId: uuid },
  additionalProperties: false,
} as const

export const assessmentVersionParams = {
  type: 'object',
  required: ['assessmentId', 'version'],
  properties: { assessmentId: uuid, version: { type: 'integer', minimum: 1 } },
  additionalProperties: false,
} as const

export const commentParams = {
  type: 'object',
  required: ['assessmentId', 'commentId'],
  properties: { assessmentId: uuid, commentId: uuid },
  additionalProperties: false,
} as const

// `since` feeds a Date that is compared in SQL; an unparseable value would throw
// on .toISOString() further down. Left open for other query params, mirroring
// pageQuerySchema.
export const sinceQuerySchema = {
  type: 'object',
  properties: {
    since: { type: 'string', format: 'date-time', description: 'Alleen commentaren die na dit tijdstip zijn gewijzigd.' },
  },
} as const

const SCOPE_LABELS: Record<string, string> = {
  body: 'verzoekgegevens',
  params: 'padparameters',
  querystring: 'queryparameters',
  headers: 'headers',
}

// Fastify's default formatter produces an English ajv message, which ends up as
// the `detail` of the problem+json response. Route plugins install this instead
// so a rejected request explains itself in Dutch.
export function dutchSchemaErrorFormatter(errors: FastifySchemaValidationError[], dataVar: string): Error {
  const label = SCOPE_LABELS[dataVar] ?? dataVar
  const field = errors[0].instancePath.replace(/^\//, '')
  return new Error(field
    ? `Ongeldige ${label}: veld '${field}' is ongeldig`
    : `Ongeldige ${label}`)
}

// Only the two routes that carry a full assessment state need room for embedded
// images. Every other route accepts a few fields capped at 2000 characters, so
// the server default stays small and these opt in explicitly.
//
// The image group is repeatable, so the number of images is unbounded and no
// limit can be the right one. This is headroom, not a guarantee: hitting it is
// answered with an error that says which knob the user has.
export const STATE_BODY_LIMIT = 50 * 1024 * 1024
