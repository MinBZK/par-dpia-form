// Warns when this process's projected DB connection footprint could exceed the
// shared per-user connection cap. The real budget is
// `pods × WEB_CONCURRENCY × DB_POOL_MAX ≤ cap`, but `pods` (replicas + rolling
// surge) is set in the deployment manifest outside this repo. So we guard the
// part this process can see — workers × pool size, multiplied by the pods that
// briefly overlap during a rolling deploy — and surface a risk loudly in the
// startup log instead of letting the pool silently exhaust the cap at runtime.
export function poolBudgetWarning(
  webConcurrency: number | null,
  poolMax: number,
  cap = 20,
  surgePods = 2,
): string | null {
  const workers = webConcurrency ?? 1
  const projected = surgePods * workers * poolMax
  if (projected <= cap) return null
  return `DB connection budget at risk: ${surgePods} pods × ${workers} worker(s) × pool ${poolMax} = ${projected} exceeds the per-user cap of ${cap}. Lower DB_POOL_MAX or WEB_CONCURRENCY, or put a connection pooler (PgBouncer) in front.`
}
