// Offset pagination for list endpoints. Bounds the result set so a large history
// (versions/edits/comments) cannot be pulled in a single unbounded query.
//
// Query params follow the NL GOV API Design Rules: `page` (1-based) and
// `pageSize` (camelCase). Both are optional; callers that omit them get the first
// `defaultSize` rows. `pageSize` is clamped to `[1, maxSize]`, so an oversized or
// malformed value can never widen the query beyond the cap.

// `page` far beyond any real dataset would overflow the SQL OFFSET (bigint) and
// crash the query; clamp it so an oversized page just yields an empty result.
const MAX_PAGE = 1_000_000

export interface PageParams {
  limit: number
  offset: number
  page: number
  pageSize: number
}

export interface PageQuery {
  page?: string | number
  pageSize?: string | number
}

function toPositiveInt(value: string | number | undefined, fallback: number): number {
  const n = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function parsePagination(query: PageQuery, opts: { defaultSize: number; maxSize: number }): PageParams {
  const page = Math.min(toPositiveInt(query.page, 1), MAX_PAGE)
  const pageSize = Math.min(toPositiveInt(query.pageSize, opts.defaultSize), opts.maxSize)
  return { limit: pageSize, offset: (page - 1) * pageSize, page, pageSize }
}

// OpenAPI querystring schema for a paginated route; also validates input so an
// out-of-range value is rejected with 400 problem+json instead of reaching SQL.
export function pageQuerySchema(opts: { defaultSize: number; maxSize: number }) {
  return {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, maximum: MAX_PAGE, default: 1, description: 'Paginanummer (1-gebaseerd).' },
      pageSize: { type: 'integer', minimum: 1, maximum: opts.maxSize, default: opts.defaultSize, description: `Aantal rijen per pagina (max ${opts.maxSize}).` },
    },
  }
}
