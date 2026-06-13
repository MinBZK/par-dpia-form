export class TimeoutError extends Error {
  constructor() {
    super('Probe timed out')
    this.name = 'TimeoutError'
  }
}

export async function probe(url: string, timeoutMs = 5000): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), timeoutMs)
  })
  try {
    return await Promise.race([fetch(url), timeout])
  } finally {
    clearTimeout(timer)
  }
}
