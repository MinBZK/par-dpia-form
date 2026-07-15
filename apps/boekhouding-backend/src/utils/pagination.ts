// Offset pagination for list endpoints. Bounds the result set so a large history
// (versions/edits/comments) cannot be pulled in a single unbounded query.
//
// Query params follow the NL GOV API Design Rules: `page` (1-based) and
// `pageSize` (camelCase). Both are optional; callers that omit them get the first
// `defaultSize` rows. `pageSize` is clamped to `[1, maxSize]`, so an oversized or
// malformed value can never widen the query beyond the cap.

export interface PageParams {
  limit: number
  offset: number
  page: number
  pageSize: number
}

export interface PageQuery {
  page?: string
  pageSize?: string
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function parsePagination(query: PageQuery, opts: { defaultSize: number; maxSize: number }): PageParams {
  const page = toPositiveInt(query.page, 1)
  const pageSize = Math.min(toPositiveInt(query.pageSize, opts.defaultSize), opts.maxSize)
  return { limit: pageSize, offset: (page - 1) * pageSize, page, pageSize }
}
